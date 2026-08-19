from pathlib import Path
import html
import json
import re
import time
import urllib.parse
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[2]
PLAYERS_DIR = ROOT / "data" / "players"

USER_AGENT = "RallySchool/1.0 (https://rallyschoolonline.com)"

APPROVED = {
    "luciano-darderi": "Darderi WMQ23 (53062101185).jpg",
    "learner-tien": "Learner Tien (2024 US Open) 01.jpg",
    "rafael-jodar": "Rafa Jódar Espinar 2025.jpg",
    "joao-fonseca": "João Fonseca (2024 Cary) 01.jpg",
    "matteo-arnaldi": "Arnaldi WMQ23 (53061134932).jpg",
    "mariano-navone": "Mariano Navone - Roland-Garros - 28.05.2024.jpg",
    "raphael-collignon": "Collignon WMQ23 (53061896279).jpg",
    "terence-atmane": "Térence Atmane (2023 US Open) 01.jpg",
    "gabriel-diallo": "Diallo BMW Open 2026.jpg",
    "fabian-marozsan": "Fábián Marozsán (2024 US Open) 01.jpg",
    "holger-rune": "Holger Rune practicing 2019 (cropped).png",
    "ethan-quinn": "Ethan Quinn (2023 Cary) 01.jpg",
    "mattia-bellucci": "Bellucci WMQ23 (53061135007).jpg",
    "francisco-comesana": "Francisco Comesaña (2023 US Open) 01.jpg",
    "adam-walton": "Adam Walton at 2025 Miami Open 01.jpg",
    "alexander-shevchenko": "Alexander Shevchenko (2023 DC Open) 01 (cropped).jpg",
}


def fetch_json(url, max_retries=5):
    delay = 5

    for attempt in range(max_retries):
        request = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT}
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)

        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise

            retry_after = exc.headers.get("Retry-After")

            try:
                wait = int(retry_after) if retry_after else delay
            except ValueError:
                wait = delay

            print(
                f"  Rate limited. Waiting {wait}s "
                f"before retry {attempt + 1}/{max_retries}..."
            )

            time.sleep(wait)
            delay = min(delay * 2, 120)

    raise RuntimeError("Rate limit persisted after retries.")


def clean_html(value):
    if not value:
        return None

    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()

    return value or None


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
    infos = page.get("imageinfo", [])

    if not infos:
        return None

    info = infos[0]
    meta = info.get("extmetadata", {})

    def get_meta(name):
        item = meta.get(name)
        return item.get("value") if item else None

    return {
        "file": filename,
        "thumbnailUrl": info.get("thumburl"),
        "originalUrl": info.get("url"),
        "license": clean_html(get_meta("LicenseShortName")),
        "licenseUrl": get_meta("LicenseUrl"),
        "artist": clean_html(get_meta("Artist")),
        "credit": clean_html(get_meta("Credit")),
        "attribution": clean_html(get_meta("Attribution")),
        "attributionRequired": get_meta("AttributionRequired"),
        "source": "Wikimedia Commons",
    }


updated = 0
failed = 0

for index, (slug, filename) in enumerate(APPROVED.items(), start=1):

    profile_path = PLAYERS_DIR / f"{slug}.json"

    if not profile_path.exists():
        print(f"[{index}/16] Missing profile: {slug}")
        failed += 1
        continue

    with profile_path.open() as f:
        profile = json.load(f)

    try:
        image = get_commons_image(filename)

        if not image or not image.get("thumbnailUrl"):
            print(f"[{index}/16] No Commons image data: {slug}")
            failed += 1
            continue

        profile["image"] = image

        profile_path.write_text(
            json.dumps(
                profile,
                indent=2,
                ensure_ascii=False
            )
        )

        updated += 1

        print(
            f"[{index}/16] OK "
            f"{profile.get('name', slug)}"
        )

    except Exception as exc:
        failed += 1
        print(f"[{index}/16] ERROR {slug}: {exc}")

    time.sleep(1.0)


print("\nUpdated:", updated)
print("Failed:", failed)
