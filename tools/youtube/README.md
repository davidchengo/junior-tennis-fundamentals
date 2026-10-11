# YouTube research and transcript workflow

This local tool helps Rally School find coaching videos and prepare captions for lesson research. The YouTube Data API is used for public channel/video metadata and caption-availability flags. `yt-dlp` is used separately to save captions that a video makes available. The tool never downloads video or audio.

## Important API limit

The YouTube Data API does **not** provide transcript text for arbitrary public videos. Its `captions.list` method requires OAuth and only lists tracks; downloading a track also requires OAuth. A Google API key alone is not enough to retrieve another creator's captions. For Rally School's selected public videos, this workflow checks the metadata with the official API, then asks `yt-dlp` for available captions. If captions aren't available, it reports that and stops rather than trying to bypass access restrictions.

## One-time setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable **YouTube Data API v3**.
2. Create an API key. Restrict it to **YouTube Data API v3**. This key is for local research only; do not put it in HTML, JavaScript, Git, or a public deployment.
3. In the project root, copy `.env.youtube.example` to `.env.youtube` and add the key after `YT_BROWSE_API_KEY=` or `YOUTUBE_API_KEY=`. `.env.youtube` is ignored by Git. The script accepts either environment variable name.
4. `yt-dlp` is already installed in the current environment. On another machine, install it with `python3 -m pip install yt-dlp`.

For this Rally School workspace, the existing local `YOUTUBE_API_KEY` has already been placed in the ignored `.env.youtube` file with owner-only file permissions. A read-only metadata request confirmed that YouTube accepts it here.

## Commands

Search a trusted channel and see the API's caption flag:

```bash
python3 tools/youtube/lesson_sources.py search "forehand power" --channel @GrantVanderHayden --limit 10
```

Search all public videos:

```bash
python3 tools/youtube/lesson_sources.py search "junior tennis forehand power" --limit 10 --order relevance
```

Inspect one video's public metadata:

```bash
python3 tools/youtube/lesson_sources.py info "https://www.youtube.com/watch?v=VIDEO_ID"
```

Save public English captions as timestamped SRT and TXT files:

```bash
python3 tools/youtube/lesson_sources.py transcript "https://www.youtube.com/watch?v=VIDEO_ID"
```

Transcript files are saved under `.local/youtube/transcripts/`, which is ignored by Git. They are working materials for analysis; publish original, attributed learning summaries with timestamps and links rather than raw transcript text.

## Limits and handling

- Search results and `videos.list` metadata do not guarantee transcript text; the `caption` field is only a yes/no availability signal.
- The API key supports public metadata requests. Caption retrieval through the official API requires OAuth for a video the authenticated user is authorized to manage.
- `yt-dlp` may fail when a video has no captions, restricts access, or changes its delivery. The tool does not fetch browser cookies or attempt to circumvent restrictions.
- If YouTube returns HTTP 429 for captions, it is rate-limiting the request. Stop and retry later rather than repeatedly requesting captions or trying to bypass the limit. The first caption-only request in this workspace received HTTP 429; transcript retrieval is not yet confirmed here.
- Search calls consume YouTube Data API quota. Prefer channel-scoped searches and small result limits; cache useful video IDs in lesson notes instead of repeatedly searching.
- Respect YouTube's API policies and each creator's rights. Keep raw transcript files local, quote sparingly, attribute the coach, and link learners to the source video.
