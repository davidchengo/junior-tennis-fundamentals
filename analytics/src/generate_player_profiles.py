from pathlib import Path
import json
import re
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA_FILE = ROOT / "data" / "generated" / "player_matches.csv"
OUTPUT_DIR = ROOT / "data" / "players"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def safe_pct(numerator, denominator):
    if denominator == 0 or pd.isna(denominator):
        return None
    return round(numerator / denominator * 100, 1)


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def calculate_metrics(df):
    serve = df.dropna(
        subset=[
            "svpt",
            "first_in",
            "first_won",
            "second_won",
            "opp_bp_faced",
            "opp_bp_saved",
        ]
    )

    matches = len(df)
    wins = int((df["result"] == "W").sum())

    second_attempts = (
        serve["svpt"].sum()
        - serve["first_in"].sum()
    )

    bp_opportunities = serve["opp_bp_faced"].sum()

    bp_converted = (
        serve["opp_bp_faced"].sum()
        - serve["opp_bp_saved"].sum()
    )

    return {
        "matches": matches,
        "wins": wins,
        "losses": matches - wins,
        "winRate": safe_pct(wins, matches),
        "firstServePct": safe_pct(
            serve["first_in"].sum(),
            serve["svpt"].sum()
        ),
        "firstServeWonPct": safe_pct(
            serve["first_won"].sum(),
            serve["first_in"].sum()
        ),
        "secondServeWonPct": safe_pct(
            serve["second_won"].sum(),
            second_attempts
        ),
        "breakPointConversionPct": safe_pct(
            bp_converted,
            bp_opportunities
        ),
    }


df = pd.read_csv(DATA_FILE)

players = sorted(df["player"].dropna().unique())

index = []

for player in players:
    player_df = df[df["player"] == player]

    profile = {
        "name": player,
        "slug": slugify(player),
        "tour": "ATP",
        "period": "2024-2026",
        "overall": calculate_metrics(player_df),
        "surfaces": {},
        "opponentStrength": {},
    }

    for surface in ["Hard", "Clay", "Grass"]:
        subset = player_df[player_df["surface"] == surface]

        if len(subset):
            profile["surfaces"][surface] = calculate_metrics(subset)

    ranking_groups = {
        "top5": (1, 5),
        "top10": (1, 10),
        "top20": (1, 20),
        "rank21to50": (21, 50),
        "rank51plus": (51, 9999),
    }

    for label, (low, high) in ranking_groups.items():
        subset = player_df[
            player_df["opponent_rank"].between(
                low, high, inclusive="both"
            )
        ]

        if len(subset):
            wins = int((subset["result"] == "W").sum())

            profile["opponentStrength"][label] = {
                "matches": len(subset),
                "wins": wins,
                "losses": len(subset) - wins,
                "winRate": safe_pct(wins, len(subset)),
            }

    output_file = OUTPUT_DIR / f"{slugify(player)}.json"

    output_file.write_text(
        json.dumps(profile, indent=2, ensure_ascii=False)
    )

    index.append({
        "name": player,
        "slug": slugify(player),
        "tour": "ATP",
        "profile": f"data/players/{slugify(player)}.json"
    })

index_file = OUTPUT_DIR / "index.json"

index_file.write_text(
    json.dumps(index, indent=2, ensure_ascii=False)
)

print(f"Generated {len(index)} player profiles.")
print(f"Index: {index_file}")
