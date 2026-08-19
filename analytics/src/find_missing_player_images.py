from pathlib import Path
import json
import time
import urllib.parse
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[2]
PLAYERS_DIR = ROOT / "data" / "players"
TOP100_FILE = PLAYERS_DIR / "top100-atp.json"

USER_AGENT = "RallySchool/1.0 (https://rallyschoolonline.com)"


def fetch_json(url, max_retries=5):
    delay = 5

    for attempt in range(max_retries):
        request = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT}
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=30
            ) as response:
                return json.load(response)

        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise

            retry_after = exc.headers.get("Retry-After")

            if retry_after:
                try:
                    wait = int(retry_after)
                except ValueError:
                    wait = delay
            else:
                wait = delay

            print(
                f"  Rate limited. Waiting {wait}s "
                f"before retry {attempt + 1}/{max_retries}..."
            )

            time.sleep(wait)
            delay = min(delay * 2, 120)

    raise RuntimeError("Rate limit persisted after retries.")


def commons_search(query, limit=5):
    params = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": 6,
        "gsrlimit": limit,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": 400,
    })

    url = (
        "https://commons.wikimedia.org/w/api.php?"
        + params
    )

    data = fetch_json(url)

    pages = data.get("query", {}).get("pages", {})

    results = []

    for page in pages.values():
        image_info = page.get("imageinfo", [])

        if not image_info:
            continue

        info = image_info[0]

        results.append({
            "title": page.get("title"),
            "thumbnailUrl": info.get("thumburl"),
            "originalUrl": info.get("url"),
        })

    return results


with TOP100_FILE.open() as f:
    players = json.load(f)

missing = []

for player in players:
    profile_path = PLAYERS_DIR / f'{player["slug"]}.json'

    with profile_path.open() as f:
        profile = json.load(f)

    image = profile.get("image")

    if not image or not image.get("thumbnailUrl"):
        missing.append(player)


print(f"Missing players: {len(missing)}\n")

report = []

for index, player in enumerate(missing, start=1):

    name = player["name"]
    query = f'"{name}" tennis'

    print(
        f"[{index}/{len(missing)}] "
        f"Searching: {name}"
    )

    try:
        results = commons_search(query, limit=5)

        report.append({
            "rank": player["rank"],
            "name": name,
            "query": query,
            "candidates": results,
        })

        if not results:
            print("  No candidates found.")
        else:
            for i, item in enumerate(results, start=1):
                print(f"  {i}. {item['title']}")

    except Exception as exc:
        print(f"  ERROR: {exc}")

        report.append({
            "rank": player["rank"],
            "name": name,
            "query": query,
            "error": str(exc),
            "candidates": [],
        })

    time.sleep(1.0)


output = (
    ROOT
    / "data"
    / "generated"
    / "missing-player-image-candidates.json"
)

output.parent.mkdir(
    parents=True,
    exist_ok=True
)

output.write_text(
    json.dumps(
        report,
        indent=2,
        ensure_ascii=False
    )
)

print("\nSaved candidate report to:")
print(output)
