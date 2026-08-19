from pathlib import Path
import html
import json
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PLAYERS_DIR = ROOT / "data" / "players"
TOP100_FILE = PLAYERS_DIR / "top100-atp.json"

USER_AGENT = "RallySchool/1.0 (rallyschoolonline.com)"


def fetch_json(url, max_retries=6):
    import urllib.error

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

    raise RuntimeError(
        "Wikimedia rate limit persisted after retries."
    )


def clean_html(value):
    if not value:
        return None

    text = re.sub(r"<[^>]+>", " ", value)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()

    return text or None


def get_wikidata_image(wikidata_id):
    url = (
        "https://www.wikidata.org/wiki/"
        f"Special:EntityData/{wikidata_id}.json"
    )

    data = fetch_json(url)

    entity = data["entities"].get(wikidata_id, {})
    images = entity.get("claims", {}).get("P18", [])

    if not images:
        return None

    try:
        return images[0]["mainsnak"]["datavalue"]["value"]
    except (KeyError, IndexError, TypeError):
        return None


def get_commons_image(filename):
    params = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "titles": f"File:{filename}",
        "iiprop": "url|extmetadata",
        "iiurlwidth": 500,
        "iiextmetadatafilter":
            "Artist|Credit|Attribution|"
            "LicenseShortName|LicenseUrl|AttributionRequired",
    })

    url = (
        "https://commons.wikimedia.org/w/api.php?"
        + params
    )

    data = fetch_json(url)

    pages = data.get("query", {}).get("pages", {})

    if not pages:
        return None

    page = next(iter(pages.values()))
    image_info = page.get("imageinfo", [])

    if not image_info:
        return None

    info = image_info[0]
    metadata = info.get("extmetadata", {})

    def meta(name):
        item = metadata.get(name)
        return item.get("value") if item else None

    return {
        "file": filename,
        "thumbnailUrl": info.get("thumburl"),
        "originalUrl": info.get("url"),
        "license": clean_html(meta("LicenseShortName")),
        "licenseUrl": meta("LicenseUrl"),
        "artist": clean_html(meta("Artist")),
        "credit": clean_html(meta("Credit")),
        "attribution": clean_html(meta("Attribution")),
        "attributionRequired": meta("AttributionRequired"),
        "source": "Wikimedia Commons",
    }


with TOP100_FILE.open() as f:
    players = json.load(f)

found = 0
missing = 0
failed = 0

print(f"Enriching {len(players)} ATP player profiles...\n")

for index, player in enumerate(players, start=1):
    name = player["name"]
    slug = player["slug"]

    profile_path = PLAYERS_DIR / f"{slug}.json"

    if not profile_path.exists():
        print(f"{index:>3}/100  MISSING PROFILE  {name}")
        missing += 1
        continue

    with profile_path.open() as f:
        profile = json.load(f)

    # Resume safely: skip profiles already enriched successfully.
    existing_image = profile.get("image")

    if (
        existing_image
        and existing_image.get("thumbnailUrl")
    ):
        print(
            f"{index:>3}/100  SKIP EXISTING   {name}"
        )
        found += 1
        continue

    wikidata_id = (
        profile.get("identity", {}).get("wikidataId")
    )

    if not wikidata_id:
        profile["image"] = None
        missing += 1
    else:
        try:
            filename = get_wikidata_image(wikidata_id)

            if filename:
                image = get_commons_image(filename)
                profile["image"] = image

                if image and image.get("thumbnailUrl"):
                    found += 1
                    print(f"{index:>3}/100  OK  {name}")
                else:
                    missing += 1
            else:
                profile["image"] = None
                missing += 1

        except Exception as exc:
            failed += 1
            print(f"{index:>3}/100  ERROR {name}: {exc}")

    profile_path.write_text(
        json.dumps(profile, indent=2, ensure_ascii=False)
    )

    time.sleep(1.0)

print("\nImages found:", found)
print("No image:", missing)
print("Errors:", failed)
