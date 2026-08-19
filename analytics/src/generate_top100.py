from pathlib import Path
import json
import re
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


rankings = pd.read_csv(RANKINGS_FILE)

# wikidata_id has mixed types and is not used here.
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
    players[["player_id", "name"]],
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

    if profile_path.exists():
        with profile_path.open() as f:
            profile = json.load(f)

        matches = profile["overall"]["matches"]

    records.append({
        "rank": int(row["rank"]),
        "playerId": int(row["player"]),
        "name": name,
        "slug": slug,
        "tour": "ATP",
        "points": int(row["points"]) if pd.notna(row["points"]) else None,
        "rankingDate": latest_date,
        "matches": matches,
        "coverage": coverage_label(matches),
        "profile": f"data/players/{slug}.json"
    })

OUTPUT_FILE.write_text(
    json.dumps(records, indent=2, ensure_ascii=False)
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
    print(
        f'{player["rank"]:>3}  '
        f'{player["name"]:<28} '
        f'{player["matches"]:>3} matches  '
        f'{player["coverage"]}'
    )
