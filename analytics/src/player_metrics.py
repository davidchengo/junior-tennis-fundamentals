from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA_FILE = ROOT / "data" / "generated" / "player_matches.csv"

PLAYERS = ["Jannik Sinner", "Carlos Alcaraz"]


def safe_pct(numerator, denominator):
    if denominator == 0 or pd.isna(denominator):
        return None
    return round(numerator / denominator * 100, 1)


def calculate_metrics(df):
    matches = len(df)
    wins = (df["result"] == "W").sum()

    # Aggregate point totals before calculating percentages.
    # This weights the metric by actual opportunities rather than
    # giving every match equal weight.

    first_serve_pct = safe_pct(
        df["first_in"].sum(),
        df["svpt"].sum()
    )

    first_serve_won_pct = safe_pct(
        df["first_won"].sum(),
        df["first_in"].sum()
    )

    second_serve_attempts = (
        df["svpt"].sum()
        - df["first_in"].sum()
    )

    second_serve_won_pct = safe_pct(
        df["second_won"].sum(),
        second_serve_attempts
    )

    # Opponent BP saved = break points the player failed to convert.
    # Therefore:
    # break points converted = opponent BP faced - opponent BP saved

    bp_opportunities = df["opp_bp_faced"].sum()

    bp_converted = (
        df["opp_bp_faced"].sum()
        - df["opp_bp_saved"].sum()
    )

    return {
        "matches": matches,
        "wins": int(wins),
        "losses": int(matches - wins),
        "win_rate": safe_pct(wins, matches),
        "first_serve_pct": first_serve_pct,
        "first_serve_won_pct": first_serve_won_pct,
        "second_serve_won_pct": second_serve_won_pct,
        "break_point_conversion_pct": safe_pct(
            bp_converted,
            bp_opportunities
        ),
    }


df = pd.read_csv(DATA_FILE)

for player in PLAYERS:

    player_df = df[df["player"] == player]

    metrics = calculate_metrics(player_df)

    print(f"\n=== {player} ===")

    for name, value in metrics.items():
        print(f"{name}: {value}")

    print("\nBy surface:")

    for surface in ["Hard", "Clay", "Grass"]:

        surface_df = player_df[
            player_df["surface"] == surface
        ]

        if len(surface_df) == 0:
            continue

        surface_metrics = calculate_metrics(surface_df)

        print(
            surface,
            "| Win:",
            surface_metrics["win_rate"],
            "| 1st won:",
            surface_metrics["first_serve_won_pct"],
            "| 2nd won:",
            surface_metrics["second_serve_won_pct"],
            "| BP converted:",
            surface_metrics["break_point_conversion_pct"]
        )
