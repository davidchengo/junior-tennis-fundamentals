from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "tennis-sackmann-archive" / "atp"
OUTPUT_FILE = ROOT / "data" / "generated" / "player_matches.csv"

YEARS = [2024, 2025, 2026]


def load_matches():
    frames = []

    for year in YEARS:
        path = RAW_DIR / f"atp_matches_{year}.csv"
        df = pd.read_csv(path)
        df["season"] = year
        frames.append(df)

    return pd.concat(frames, ignore_index=True)


def normalize_side(match, won):
    prefix = "w_" if won else "l_"
    opp_prefix = "l_" if won else "w_"

    player = (
        match["winner_name"]
        if won
        else match["loser_name"]
    )

    opponent = (
        match["loser_name"]
        if won
        else match["winner_name"]
    )

    return {
        "player": player,
        "opponent": opponent,
        "result": "W" if won else "L",

        "season": match["season"],
        "tourney_date": match["tourney_date"],
        "tourney_name": match["tourney_name"],
        "tourney_level": match["tourney_level"],
        "surface": match["surface"],
        "round": match["round"],
        "score": match["score"],

        "rank": (
            match["winner_rank"]
            if won
            else match["loser_rank"]
        ),

        "opponent_rank": (
            match["loser_rank"]
            if won
            else match["winner_rank"]
        ),

        "ace": match[f"{prefix}ace"],
        "df": match[f"{prefix}df"],
        "svpt": match[f"{prefix}svpt"],
        "first_in": match[f"{prefix}1stIn"],
        "first_won": match[f"{prefix}1stWon"],
        "second_won": match[f"{prefix}2ndWon"],
        "service_games": match[f"{prefix}SvGms"],
        "bp_saved": match[f"{prefix}bpSaved"],
        "bp_faced": match[f"{prefix}bpFaced"],

        "opp_ace": match[f"{opp_prefix}ace"],
        "opp_df": match[f"{opp_prefix}df"],
        "opp_svpt": match[f"{opp_prefix}svpt"],
        "opp_first_in": match[f"{opp_prefix}1stIn"],
        "opp_first_won": match[f"{opp_prefix}1stWon"],
        "opp_second_won": match[f"{opp_prefix}2ndWon"],
        "opp_bp_saved": match[f"{opp_prefix}bpSaved"],
        "opp_bp_faced": match[f"{opp_prefix}bpFaced"],
    }


def normalize_all_matches(matches):
    rows = []

    for _, match in matches.iterrows():
        rows.append(normalize_side(match, True))
        rows.append(normalize_side(match, False))

    return pd.DataFrame(rows)


if __name__ == "__main__":
    matches = load_matches()

    normalized = normalize_all_matches(matches)

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    normalized.to_csv(
        OUTPUT_FILE,
        index=False
    )

    print("ATP source matches:", len(matches))
    print("Normalized player-match rows:", len(normalized))
    print(
        "Unique players:",
        normalized["player"].nunique()
    )
    print(
        "Date range:",
        normalized["season"].min(),
        "-",
        normalized["season"].max()
    )

    print(f"\nSaved to {OUTPUT_FILE}")
