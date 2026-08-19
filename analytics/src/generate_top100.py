from pathlib import Path
import json
import re
from datetime import datetime
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]

RANKINGS_FILE = (
    ROOT
    / "data"
    / "tennis-sackmann-archive"
    / "atp"
    / "atp_rankings_current.csv"
)

PLAYERS_FILE = (
    ROOT
    / "data"
    / "tennis-sackmann-archive"
    / "atp"
    / "atp_players.csv"
)

PROFILES_DIR = ROOT / "data" / "players"
OUTPUT_FILE = PROFILES_DIR / "top100-atp.json"


# IOC codes used in tennis do not always equal ISO country codes.
# This mapping lets the UI display a proper country name and flag.
IOC_COUNTRIES = {
    "ARG": ("Argentina", "🇦🇷"),
    "AUS": ("Australia", "🇦🇺"),
    "AUT": ("Austria", "🇦🇹"),
    "BEL": ("Belgium", "🇧🇪"),
    "BIH": ("Bosnia and Herzegovina", "🇧🇦"),
    "BOL": ("Bolivia", "🇧🇴"),
    "BRA": ("Brazil", "🇧🇷"),
    "BUL": ("Bulgaria", "🇧🇬"),
    "CAN": ("Canada", "🇨🇦"),
    "CHI": ("Chile", "🇨🇱"),
    "CHN": ("China", "🇨🇳"),
    "COL": ("Colombia", "🇨🇴"),
    "CRO": ("Croatia", "🇭🇷"),
    "CZE": ("Czech Republic", "🇨🇿"),
    "DEN": ("Denmark", "🇩🇰"),
    "ECU": ("Ecuador", "🇪🇨"),
    "ESP": ("Spain", "🇪🇸"),
    "EST": ("Estonia", "🇪🇪"),
    "FIN": ("Finland", "🇫🇮"),
    "FRA": ("France", "🇫🇷"),
    "GBR": ("Great Britain", "🇬🇧"),
    "GEO": ("Georgia", "🇬🇪"),
    "GER": ("Germany", "🇩🇪"),
    "GRE": ("Greece", "🇬🇷"),
    "HUN": ("Hungary", "🇭🇺"),
    "IND": ("India", "🇮🇳"),
    "IRL": ("Ireland", "🇮🇪"),
    "ISR": ("Israel", "🇮🇱"),
    "ITA": ("Italy", "🇮🇹"),
    "JPN": ("Japan", "🇯🇵"),
    "KAZ": ("Kazakhstan", "🇰🇿"),
    "KOR": ("South Korea", "🇰🇷"),
    "LTU": ("Lithuania", "🇱🇹"),
    "LUX": ("Luxembourg", "🇱🇺"),
    "MDA": ("Moldova", "🇲🇩"),
    "MEX": ("Mexico", "🇲🇽"),
    "MON": ("Monaco", "🇲🇨"),
    "NED": ("Netherlands", "🇳🇱"),
    "NOR": ("Norway", "🇳🇴"),
    "NZL": ("New Zealand", "🇳🇿"),
    "PAR": ("Paraguay", "🇵🇾"),
    "PER": ("Peru", "🇵🇪"),
    "POL": ("Poland", "🇵🇱"),
    "POR": ("Portugal", "🇵🇹"),
    "ROU": ("Romania", "🇷🇴"),
    "RSA": ("South Africa", "🇿🇦"),
    "SRB": ("Serbia", "🇷🇸"),
    "SUI": ("Switzerland", "🇨🇭"),
    "SVK": ("Slovakia", "🇸🇰"),
    "SLO": ("Slovenia", "🇸🇮"),
    "SWE": ("Sweden", "🇸🇪"),
    "TPE": ("Chinese Taipei", "🇹🇼"),
    "TUN": ("Tunisia", "🇹🇳"),
    "TUR": ("Türkiye", "🇹🇷"),
    "UKR": ("Ukraine", "🇺🇦"),
    "URU": ("Uruguay", "🇺🇾"),
    "USA": ("United States", "🇺🇸"),
}


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def coverage_label(matches):
    if matches >= 30:
        return "Strong"
    if matches >= 15:
        return "Moderate"
    if matches >= 5:
        return "Limited"
    return "Very limited"


def normalize_birth_date(value):
    if pd.isna(value):
        return None

    try:
        text = str(int(float(value)))
    except (ValueError, TypeError):
        return None

    if len(text) != 8:
        return None

    try:
        return datetime.strptime(
            text,
            "%Y%m%d"
        ).strftime("%Y-%m-%d")
    except ValueError:
        return None


def hand_label(hand):
    if hand == "R":
        return "Right-handed"
    if hand == "L":
        return "Left-handed"
    return "Unknown"


rankings = pd.read_csv(RANKINGS_FILE)

players = pd.read_csv(
    PLAYERS_FILE,
    dtype={"wikidata_id": "string"},
    low_memory=False
)

latest_date = int(rankings["ranking_date"].max())

snapshot = rankings[
    rankings["ranking_date"] == latest_date
].copy()

snapshot = snapshot[
    snapshot["rank"].between(1, 100, inclusive="both")
].copy()

players["name"] = (
    players["name_first"].fillna("").str.strip()
    + " "
    + players["name_last"].fillna("").str.strip()
).str.strip()

top100 = snapshot.merge(
    players[
        [
            "player_id",
            "name",
            "hand",
            "dob",
            "ioc",
            "height",
            "wikidata_id",
        ]
    ],
    left_on="player",
    right_on="player_id",
    how="left"
).sort_values("rank")

records = []

for _, row in top100.iterrows():

    name = row["name"]
    slug = slugify(name)

    profile_path = PROFILES_DIR / f"{slug}.json"

    matches = 0
    profile = {}

    if profile_path.exists():
        with profile_path.open() as f:
            profile = json.load(f)

        matches = profile.get("overall", {}).get("matches", 0)

    ioc = (
        str(row["ioc"]).strip()
        if pd.notna(row["ioc"])
        else None
    )

    country_name = None
    flag = "🌐"

    if ioc in IOC_COUNTRIES:
        country_name, flag = IOC_COUNTRIES[ioc]

    height_cm = (
        int(round(float(row["height"])))
        if pd.notna(row["height"])
        else None
    )

    identity = {
        "countryCode": ioc,
        "countryName": country_name or ioc,
        "flag": flag,
        "birthDate": normalize_birth_date(row["dob"]),
        "heightCm": height_cm,
        "hand": (
            str(row["hand"])
            if pd.notna(row["hand"])
            else None
        ),
        "handLabel": hand_label(
            str(row["hand"])
            if pd.notna(row["hand"])
            else None
        ),
        "wikidataId": (
            str(row["wikidata_id"])
            if pd.notna(row["wikidata_id"])
            else None
        ),
    }

    ranking = {
        "rank": int(row["rank"]),
        "points": (
            int(row["points"])
            if pd.notna(row["points"])
            else None
        ),
        "rankingDate": latest_date,
    }

    # Enrich the individual player profile.
    profile["identity"] = identity
    profile["ranking"] = ranking

    profile_path.write_text(
        json.dumps(
            profile,
            indent=2,
            ensure_ascii=False
        )
    )

    # Keep enough identity data in the Top 100 index
    # for selectors and lightweight UI.
    records.append({
        "rank": ranking["rank"],
        "playerId": int(row["player"]),
        "name": name,
        "slug": slug,
        "tour": "ATP",
        "points": ranking["points"],
        "rankingDate": latest_date,
        "matches": matches,
        "coverage": coverage_label(matches),
        "identity": identity,
        "profile": f"data/players/{slug}.json",
    })

OUTPUT_FILE.write_text(
    json.dumps(
        records,
        indent=2,
        ensure_ascii=False
    )
)

print("Ranking date:", latest_date)
print("ATP Top 100 profiles:", len(records))

summary = {}

for player in records:
    level = player["coverage"]
    summary[level] = summary.get(level, 0) + 1

print("\nCoverage:")

for level, count in summary.items():
    print(f"{level}: {count}")

print("\nTop 20:")

for player in records[:20]:
    identity = player["identity"]

    print(
        f'{player["rank"]:>3}  '
        f'{identity["flag"]} '
        f'{player["name"]:<27} '
        f'{identity["countryCode"] or "---"}  '
        f'{identity["heightCm"] or "---"} cm'
    )
