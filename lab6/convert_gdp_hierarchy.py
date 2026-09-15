"""Convert the provided Lab 6 GDP table into hierarchical JSON."""

from pathlib import Path
import json

import pandas as pd


HERE = Path(__file__).resolve().parent
INPUT_PATH = HERE.parent / "data" / "lab6_assignment_gdp.csv"
OUTPUT_PATH = HERE.parent / "data" / "lab6_assignment_gdp.json"
LEVELS = ["continent", "area", "country"]
VALUE_COLUMN = "gdp_billion_usd"
STATUS_COLUMN = "gdp_status"
VALID_STATUSES = {"Increase", "Unchanged", "Decrease"}


def validate_data(frame: pd.DataFrame) -> pd.DataFrame:
    """Validate and normalize the provided flat table before conversion."""
    required = LEVELS + [VALUE_COLUMN, STATUS_COLUMN]
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    cleaned = frame[required].copy()
    for column in LEVELS + [STATUS_COLUMN]:
        cleaned[column] = cleaned[column].astype("string").str.strip()

    cleaned[VALUE_COLUMN] = pd.to_numeric(cleaned[VALUE_COLUMN], errors="raise")
    if cleaned[required].isna().any().any():
        raise ValueError("The assignment dataset contains missing required values.")
    if cleaned["country"].duplicated().any():
        raise ValueError("Country names must be unique in the assignment dataset.")
    if (cleaned[VALUE_COLUMN] <= 0).any():
        raise ValueError("GDP values must be positive numbers.")

    unexpected = set(cleaned[STATUS_COLUMN]) - VALID_STATUSES
    if unexpected:
        raise ValueError(f"Unexpected GDP status values: {sorted(unexpected)}")
    return cleaned


def build_children(frame: pd.DataFrame, levels: list[str]) -> list[dict]:
    """Recursively convert grouped rows into nested hierarchy nodes."""
    current_level = levels[0]
    children = []
    for name, group in frame.groupby(current_level, sort=False):
        if len(levels) == 1:
            row = group.iloc[0]
            children.append(
                {
                    "name": str(name),
                    "gdp": float(row[VALUE_COLUMN]),
                    "status": str(row[STATUS_COLUMN]),
                }
            )
        else:
            children.append(
                {
                    "name": str(name),
                    "children": build_children(group, levels[1:]),
                }
            )
    return children


def main() -> None:
    frame = validate_data(pd.read_csv(INPUT_PATH))
    hierarchy = {"name": "World", "children": build_children(frame, LEVELS)}
    OUTPUT_PATH.write_text(
        json.dumps(hierarchy, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(frame)} countries to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
