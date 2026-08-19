from pathlib import Path
import json
import re
import sys
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA_FILE = ROOT / "data" / "generated" / "player_matches.csv"
OUTPUT_DIR = ROOT / "data" / "battles"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def safe_pct(numerator, denominator):
    if denominator == 0 or pd.isna(denominator):
        return None
    return round(numerator / denominator * 100, 1)


def calculate_metrics(df):
    matches = len(df)
    wins = int((df["result"] == "W").sum())

    serve = df.dropna(
        subset=[
            "svpt",
            "first_in",
            "first_won",
            "second_won",
        ]
    )

    bp = df.dropna(
        subset=[
            "opp_bp_faced",
            "opp_bp_saved",
        ]
    )

    second_attempts = (
        serve["svpt"].sum()
        - serve["first_in"].sum()
    )

    bp_opportunities = bp["opp_bp_faced"].sum()

    bp_converted = (
        bp["opp_bp_faced"].sum()
        - bp["opp_bp_saved"].sum()
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


def metric_delta(matchup, overall):
    result = {}

    for key in [
        "winRate",
        "firstServePct",
        "firstServeWonPct",
        "secondServeWonPct",
        "breakPointConversionPct",
    ]:
        if matchup.get(key) is None or overall.get(key) is None:
            result[key] = None
        else:
            result[key] = round(
                matchup[key] - overall[key],
                1
            )

    return result


if len(sys.argv) != 3:
    print(
        'Usage: python generate_battle.py '
        '"Player One" "Player Two"'
    )
    sys.exit(1)

player1 = sys.argv[1]
player2 = sys.argv[2]

if player1 == player2:
    raise SystemExit("Choose two different players.")

df = pd.read_csv(DATA_FILE)

available = set(df["player"].dropna().unique())

missing = [
    player
    for player in [player1, player2]
    if player not in available
]

if missing:
    print("Player not found:")
    for player in missing:
        print(f"  - {player}")
    sys.exit(1)

p1 = df[df["player"] == player1]
p2 = df[df["player"] == player2]

p1_h2h = p1[p1["opponent"] == player2]
p2_h2h = p2[p2["opponent"] == player1]

p1_overall = calculate_metrics(p1)
p2_overall = calculate_metrics(p2)

p1_matchup = calculate_metrics(p1_h2h)
p2_matchup = calculate_metrics(p2_h2h)

surface_h2h = {}

for surface in ["Hard", "Clay", "Grass"]:
    subset1 = p1_h2h[p1_h2h["surface"] == surface]
    subset2 = p2_h2h[p2_h2h["surface"] == surface]

    meetings = len(subset1)

    if meetings == 0:
        continue

    surface_h2h[surface] = {
        "meetings": meetings,
        "player1Wins": int(
            (subset1["result"] == "W").sum()
        ),
        "player2Wins": int(
            (subset2["result"] == "W").sum()
        ),
    }


def surface_profiles(player_df):
    result = {}

    for surface in ["Hard", "Clay", "Grass"]:
        subset = player_df[
            player_df["surface"] == surface
        ]

        if len(subset):
            result[surface] = calculate_metrics(subset)

    return result


def opponent_strength(player_df):
    groups = {
        "top5": (1, 5),
        "top10": (1, 10),
        "top20": (1, 20),
        "rank21to50": (21, 50),
        "rank51plus": (51, 9999),
    }

    output = {}

    for label, (low, high) in groups.items():
        subset = player_df[
            player_df["opponent_rank"].between(
                low,
                high,
                inclusive="both"
            )
        ]

        if len(subset):
            wins = int(
                (subset["result"] == "W").sum()
            )

            output[label] = {
                "matches": len(subset),
                "wins": wins,
                "losses": len(subset) - wins,
                "winRate": safe_pct(
                    wins,
                    len(subset)
                ),
            }

    return output


battle = {
    "player1": {
        "name": player1,
        "slug": slugify(player1),
        "overall": p1_overall,
        "surfaces": surface_profiles(p1),
        "opponentStrength": opponent_strength(p1),
    },

    "player2": {
        "name": player2,
        "slug": slugify(player2),
        "overall": p2_overall,
        "surfaces": surface_profiles(p2),
        "opponentStrength": opponent_strength(p2),
    },

    "headToHead": {
        "meetings": len(p1_h2h),
        "player1Wins": int(
            (p1_h2h["result"] == "W").sum()
        ),
        "player2Wins": int(
            (p2_h2h["result"] == "W").sum()
        ),
        "surfaces": surface_h2h,
    },

    "matchupMetrics": {
        player1: p1_matchup,
        player2: p2_matchup,
    },

    "baselineDeltas": {
        player1: metric_delta(
            p1_matchup,
            p1_overall
        ),
        player2: metric_delta(
            p2_matchup,
            p2_overall
        ),
    },

    "metadata": {
        "tour": "ATP",
        "period": "2024-2026",
        "mode": "data-battle",
        "methodology": (
            "Descriptive comparison using ATP match-level "
            "data. Matchup metrics are calculated only from "
            "matches in which the selected players faced "
            "each other."
        ),
    },
}

filename = (
    f"{slugify(player1)}-vs-{slugify(player2)}.json"
)

output_file = OUTPUT_DIR / filename

output_file.write_text(
    json.dumps(
        battle,
        indent=2,
        ensure_ascii=False
    )
)

print(f"Battle generated: {player1} vs {player2}")
print(
    "Head-to-head:",
    battle["headToHead"]["player1Wins"],
    "-",
    battle["headToHead"]["player2Wins"],
)

print(f"Saved to {output_file}")
