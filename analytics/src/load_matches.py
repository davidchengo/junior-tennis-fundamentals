from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "tennis-sackmann-archive" / "atp"

YEARS = [2024, 2025, 2026]

frames = []

for year in YEARS:
    path = RAW_DIR / f"atp_matches_{year}.csv"
    df = pd.read_csv(path)
    df["season"] = year
    frames.append(df)

matches = pd.concat(frames, ignore_index=True)

players = ["Jannik Sinner", "Carlos Alcaraz"]

mask = (
    matches["winner_name"].isin(players)
    | matches["loser_name"].isin(players)
)

selected = matches.loc[mask].copy()

print("Total ATP matches loaded:", len(matches))
print("Sinner/Alcaraz matches:", len(selected))

print("\nMatches by player:")
for player in players:
    count = (
        (selected["winner_name"] == player)
        | (selected["loser_name"] == player)
    ).sum()
    print(f"{player}: {count}")

print("\nColumns available:")
print(selected.columns.tolist())

print("\nSample:")
print(
    selected[
        [
            "tourney_date",
            "tourney_name",
            "surface",
            "winner_name",
            "loser_name",
            "score",
        ]
    ].tail(10).to_string(index=False)
)
