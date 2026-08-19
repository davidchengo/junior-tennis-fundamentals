from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA_FILE = ROOT / "data" / "generated" / "player_matches.csv"

PLAYERS = ["Jannik Sinner", "Carlos Alcaraz"]


def safe_pct(numerator, denominator):
    if denominator == 0 or pd.isna(denominator):
        return None
    return round(numerator / denominator * 100, 1)


def metrics(df):
    # Only rows with the required serve statistics
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
    wins = (df["result"] == "W").sum()

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
        "wins": int(wins),
        "losses": int(matches - wins),
        "win_rate": safe_pct(wins, matches),
        "first_serve_pct": safe_pct(
            serve["first_in"].sum(),
            serve["svpt"].sum()
        ),
        "first_serve_won_pct": safe_pct(
            serve["first_won"].sum(),
            serve["first_in"].sum()
        ),
        "second_serve_won_pct": safe_pct(
            serve["second_won"].sum(),
            second_attempts
        ),
        "break_point_conversion_pct": safe_pct(
            bp_converted,
            bp_opportunities
        ),
    }


df = pd.read_csv(DATA_FILE)

print("\n==============================")
print("SINNER vs ALCARAZ — BATTLE LAB")
print("==============================")

# --------------------------------------------------
# Overall comparison
# --------------------------------------------------

print("\n=== OVERALL ===")

for player in PLAYERS:
    player_df = df[df["player"] == player]
    m = metrics(player_df)

    print(f"\n{player}")
    for key, value in m.items():
        print(f"{key}: {value}")


# --------------------------------------------------
# Surface comparison
# --------------------------------------------------

print("\n=== BY SURFACE ===")

for surface in ["Hard", "Clay", "Grass"]:

    print(f"\n--- {surface} ---")

    for player in PLAYERS:

        subset = df[
            (df["player"] == player)
            & (df["surface"] == surface)
        ]

        m = metrics(subset)

        print(
            f"{player}: "
            f"Win {m['win_rate']}% | "
            f"1st Won {m['first_serve_won_pct']}% | "
            f"2nd Won {m['second_serve_won_pct']}% | "
            f"BP Conv {m['break_point_conversion_pct']}%"
        )


# --------------------------------------------------
# Performance vs stronger opponents
# --------------------------------------------------

print("\n=== OPPONENT STRENGTH ===")

ranking_groups = [
    ("Top 5", 1, 5),
    ("Top 10", 1, 10),
    ("Top 20", 1, 20),
    ("21-50", 21, 50),
    ("51+", 51, 9999),
]

for player in PLAYERS:

    print(f"\n{player}")

    player_df = df[df["player"] == player]

    for label, low, high in ranking_groups:

        subset = player_df[
            player_df["opponent_rank"].between(
                low, high, inclusive="both"
            )
        ]

        if len(subset) == 0:
            continue

        wins = (subset["result"] == "W").sum()

        print(
            f"{label}: "
            f"{wins}-{len(subset) - wins} "
            f"({safe_pct(wins, len(subset))}%)"
        )


# --------------------------------------------------
# Direct head-to-head
# --------------------------------------------------

print("\n=== HEAD TO HEAD ===")

h2h = df[
    (
        (df["player"] == "Jannik Sinner")
        & (df["opponent"] == "Carlos Alcaraz")
    )
]

print(f"\nMeetings: {len(h2h)}")

sinner_wins = (h2h["result"] == "W").sum()
alcaraz_wins = len(h2h) - sinner_wins

print(f"Jannik Sinner wins: {sinner_wins}")
print(f"Carlos Alcaraz wins: {alcaraz_wins}")

print("\nBy surface:")

for surface in ["Hard", "Clay", "Grass"]:

    subset = h2h[h2h["surface"] == surface]

    if len(subset) == 0:
        continue

    sw = (subset["result"] == "W").sum()

    print(
        f"{surface}: "
        f"Sinner {sw} - "
        f"Alcaraz {len(subset) - sw}"
    )


# --------------------------------------------------
# Head-to-head serve comparison
# --------------------------------------------------

print("\n=== PERFORMANCE WHEN FACING EACH OTHER ===")

for player, opponent in [
    ("Jannik Sinner", "Carlos Alcaraz"),
    ("Carlos Alcaraz", "Jannik Sinner"),
]:

    subset = df[
        (df["player"] == player)
        & (df["opponent"] == opponent)
    ]

    m = metrics(subset)

    print(f"\n{player}")

    print("Matches:", m["matches"])
    print("Win rate:", m["win_rate"])
    print("1st serve %:", m["first_serve_pct"])
    print("1st serve won %:", m["first_serve_won_pct"])
    print("2nd serve won %:", m["second_serve_won_pct"])
    print(
        "Break point conversion %:",
        m["break_point_conversion_pct"]
    )


# --------------------------------------------------
# Save comparison data
# --------------------------------------------------

rows = []

for player in PLAYERS:

    player_df = df[df["player"] == player]

    overall = metrics(player_df)

    rows.append({
        "player": player,
        "scope": "Overall",
        **overall
    })

    for surface in ["Hard", "Clay", "Grass"]:

        subset = player_df[
            player_df["surface"] == surface
        ]

        rows.append({
            "player": player,
            "scope": surface,
            **metrics(subset)
        })

comparison = pd.DataFrame(rows)

output = (
    ROOT
    / "data"
    / "generated"
    / "player_comparison.csv"
)

comparison.to_csv(output, index=False)

print(f"\nSaved comparison data to {output}")
