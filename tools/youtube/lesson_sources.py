#!/usr/bin/env python3
"""Find public YouTube lesson videos and prepare available captions locally."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = ROOT / ".env.youtube"
DEFAULT_TRANSCRIPT_DIR = ROOT / ".local" / "youtube" / "transcripts"
API_ROOT = "https://www.googleapis.com/youtube/v3"


def load_local_config() -> None:
    """Load simple KEY=value entries without overriding the shell environment."""
    if not CONFIG_FILE.exists():
        return
    for line in CONFIG_FILE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip("\"'"))


def api_key() -> str:
    load_local_config()
    key = (os.environ.get("YT_BROWSE_API_KEY") or os.environ.get("YOUTUBE_API_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "YT_BROWSE_API_KEY or YOUTUBE_API_KEY is not set. Add it to the ignored .env.youtube file; "
            "see tools/youtube/README.md."
        )
    return key


def api_get(resource: str, params: dict[str, str]) -> dict:
    query = urlencode({**params, "key": api_key()})
    request = Request(
        f"{API_ROOT}/{resource}?{query}",
        headers={"Accept": "application/json", "User-Agent": "RallySchoolLessonResearch/1.0"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(details)["error"]["message"]
        except (ValueError, KeyError, TypeError):
            message = details[:500]
        raise RuntimeError(f"YouTube API returned HTTP {error.code}: {message}") from error
    except URLError as error:
        raise RuntimeError(f"Could not reach the YouTube API: {error.reason}") from error


def video_id_from_url(value: str) -> str:
    parsed = urlparse(value)
    host = parsed.netloc.lower().removeprefix("www.")
    if host == "youtu.be":
        candidate = parsed.path.strip("/").split("/")[0]
    elif host in {"youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"}:
        if parsed.path == "/watch":
            candidate = parse_qs(parsed.query).get("v", [""])[0]
        else:
            parts = [part for part in parsed.path.split("/") if part]
            candidate = parts[1] if len(parts) > 1 and parts[0] in {"embed", "shorts", "live"} else ""
    else:
        candidate = value if re.fullmatch(r"[\w-]{11}", value) else ""
    if not re.fullmatch(r"[\w-]{11}", candidate):
        raise ValueError("Pass a valid YouTube video URL or 11-character video ID.")
    return candidate


def resolve_channel(handle: str) -> tuple[str, str]:
    handle = handle.strip()
    handle = handle.removeprefix("https://www.youtube.com/").removeprefix("https://youtube.com/")
    handle = handle.removeprefix("@").strip("/")
    data = api_get(
        "channels",
        {"part": "id,snippet", "forHandle": handle, "fields": "items(id,snippet(title,customUrl))"},
    )
    items = data.get("items", [])
    if not items:
        raise RuntimeError(f"No public YouTube channel found for @{handle}.")
    item = items[0]
    return item["id"], item["snippet"]["title"]


def command_search(args: argparse.Namespace) -> None:
    params = {
        "part": "snippet",
        "type": "video",
        "q": args.query,
        "maxResults": str(args.limit),
        "order": args.order,
        "fields": "items(id(videoId),snippet(title,channelTitle,channelId,publishedAt,description))",
    }
    if args.channel:
        channel_id, channel_title = resolve_channel(args.channel)
        params["channelId"] = channel_id
        print(f"Channel: {channel_title} (@{args.channel.lstrip('@')})")
    result = api_get("search", params)
    items = result.get("items", [])
    if not items:
        print("No matching public videos found.")
        return
    details = api_get(
        "videos",
        {
            "part": "contentDetails,status",
            "id": ",".join(item["id"]["videoId"] for item in items),
            "fields": "items(id,status(privacyStatus),contentDetails(caption,duration))",
        },
    )
    by_id = {item["id"]: item for item in details.get("items", [])}
    for index, item in enumerate(items, start=1):
        video_id = item["id"]["videoId"]
        snippet = item["snippet"]
        video = by_id.get(video_id, {})
        captions = video.get("contentDetails", {}).get("caption", "unknown")
        duration = video.get("contentDetails", {}).get("duration", "unknown")
        print(f"\n{index}. {snippet['title']}")
        print(f"   Channel: {snippet['channelTitle']} | Published: {snippet['publishedAt'][:10]}")
        print(f"   Video: https://www.youtube.com/watch?v={video_id}")
        print(f"   Duration: {duration} | YouTube reports captions: {captions}")
        if args.description:
            print(f"   Description: {snippet.get('description', '').replace(chr(10), ' ')[:500]}")


def command_info(args: argparse.Namespace) -> None:
    video_id = video_id_from_url(args.video)
    result = api_get(
        "videos",
        {
            "part": "snippet,contentDetails,status",
            "id": video_id,
            "fields": "items(id,snippet(title,channelTitle,channelId,publishedAt,description,tags),contentDetails(duration,caption),status(privacyStatus))",
        },
    )
    items = result.get("items", [])
    if not items:
        raise RuntimeError("YouTube did not return a public video for that ID.")
    item = items[0]
    print(json.dumps(item, indent=2, ensure_ascii=False))
    print("\nNote: the caption flag reports whether captions exist; it does not return transcript text.")


def command_transcript(args: argparse.Namespace) -> None:
    video_id = video_id_from_url(args.video)
    binary = shutil.which("yt-dlp")
    if not binary:
        raise RuntimeError("yt-dlp is not installed. Install it with: python3 -m pip install yt-dlp")
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    template = str(output_dir / "%(id)s.%(ext)s")
    command = [
        binary,
        "--no-warnings",
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        args.language,
        "--sub-format",
        "srt/vtt/best",
        "--convert-subs",
        "srt",
        "--output",
        template,
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    print("Requesting captions only; no video or audio will be downloaded.", flush=True)
    completed = subprocess.run(command, text=True, capture_output=True, check=False)
    if completed.returncode:
        message = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"yt-dlp could not retrieve captions: {message}")
    caption_files = sorted(output_dir.glob(f"{video_id}.*.srt"))
    if not caption_files:
        raise RuntimeError(
            "No SRT captions were saved. The video may not expose captions in the requested "
            "language, or access may be restricted. No video or audio was downloaded."
        )
    for srt_path in caption_files:
        txt_path = srt_path.with_suffix(".txt")
        text = srt_path.read_text(encoding="utf-8-sig", errors="replace")
        text = re.sub(r"^\s*\d+\s*$", "", text, flags=re.MULTILINE)
        text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
        txt_path.write_text(text, encoding="utf-8")
        print(f"Saved transcript with timestamps: {srt_path}")
        print(f"Saved analysis text:            {txt_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    search = commands.add_parser("search", help="Search public videos and check caption availability")
    search.add_argument("query", help="Search terms, e.g. 'forehand power'")
    search.add_argument("--channel", help="Limit search to a channel handle, e.g. @GrantVanderHayden")
    search.add_argument("--limit", type=int, default=10, choices=range(1, 51), metavar="1-50")
    search.add_argument("--order", choices=("relevance", "date", "viewCount"), default="relevance")
    search.add_argument("--description", action="store_true", help="Include a shortened description")
    search.set_defaults(func=command_search)

    info = commands.add_parser("info", help="Fetch public metadata for one video")
    info.add_argument("video", help="YouTube URL or 11-character video ID")
    info.set_defaults(func=command_info)

    transcript = commands.add_parser("transcript", help="Save available captions locally as SRT and TXT")
    transcript.add_argument("video", help="YouTube URL or 11-character video ID")
    transcript.add_argument("--language", default="en,en.*", help="yt-dlp language selector (default: en,en.*)")
    transcript.add_argument("--output-dir", default=str(DEFAULT_TRANSCRIPT_DIR))
    transcript.set_defaults(func=command_transcript)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except (RuntimeError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
