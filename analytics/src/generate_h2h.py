from pathlib import Path
import json
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]

MATCHES_FILE = ROOT / "data" / "generated" / "player_matches.csv"
TOP100_FILE = ROOT / "data" / "players" / "top100-atp.json"
OUTPUT_FILE = ROOT / "data" / "battles" / "h2h-atp.json"

OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)


def safe_pct(numerator, denominator):
    if denominator == 0 or pd.isna(denominator):
        return None
    return round(numerator / denominator * 100, 1)


def calculate_metrics(df):
    matches = len(df)
    wins = int((df["result"] == "W").sum())

    serve = df.dropna(
        subset=["svpt", "first_in", "first_won", "second_won"]
    )

    bp = df.dropna(
        subset=["opp_bp_faced", "opp_bp_saved"]
    )

    second_attempts = (
        serve["svpt"].sum() - serve["first_in"].sum()
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


with TOP100_FILE.open() as f:
    top100 = json.load(f)

top100_names = {p["name"] for p in top100}

df = pd.read_csv(MATCHES_FILE)

# Keep only matches where both players are currently Top 100.
df = df[
    df["player"].isin(top100_names)
    & df["opponent"].isin(top100_names)
].copy()

battles = {}

names = sorted(top100_names)

for i, player1 in enumerate(names):
    for player2 in names[i + 1:]:

        p1 = df[
            (df["player"] == player1)
            & (df["opponent"] == player2)
        ]

        if p1.empty:
            continue

        p2 = df[
            (df["player"] == player2)
            & (df["opponent"] == player1)
        ]

        key = "|||".join(sorted([player1, player2]))

        surfaces = {}

        for surface in ["Hard", "Clay", "Grass"]:
            s1 = p1[p1["surface"] == surface]
            s2 = p2[p2["surface"] == surface]

            if len(s1):
                surfaces[surface] = {
                    player1: int((s1["result"] == "W").sum()),
                    player2: int((s2["result"] == "W").sum()),
                    "meetings": len(s1),
                }

        battles[key] = {
            "players": [player1, player2],
            "meetings": len(p1),
            "wins": {
                player1: int((p1["result"] == "W").sum()),
                player2: int((p2["result"] == "W").sum()),
            },
            "surfaces": surfaces,
            "matchupMetrics": {
                player1: calculate_metrics(p1),
                player2: calculate_metrics(p2),
            },
        }

output = {
    "tour": "ATP",
    "period": "2024-2026",
    "rankingDate": top100[0]["rankingDate"],
    "matchups": battles,
}

OUTPUT_FILE.write_text(
    json.dumps(output, indent=2, ensure_ascii=False)
)

print("Top 100 players:", len(top100))
print("H2H matchups found:", len(battles))
print("Output:", OUTPUT_FILE)
