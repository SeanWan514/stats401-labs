"""Acquire 1,200 public-domain ebook records from the Gutendex API."""

import csv
from pathlib import Path
import time

import requests


API_URL = "https://gutendex.com/books"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "lab3_data.csv"
TARGET_RECORDS = 1200
REQUEST_DELAY_SECONDS = 1
MAX_RETRIES = 3
HEADERS = {"User-Agent": "STATS401-Lab3-Educational-Project/1.0"}
FIELDNAMES = [
    "record_id",
    "gutenberg_id",
    "title",
    "author",
    "language",
    "download_count",
    "popularity_stars",
    "book_url",
]


def request_page(session: requests.Session, url: str, params: dict | None) -> dict:
    """Request one API page with bounded retries and clear failure reporting."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(url, params=params, timeout=20)
            response.raise_for_status()
            payload = response.json()

            if not isinstance(payload.get("results"), list):
                raise ValueError("API response does not contain a results list.")

            return payload
        except (requests.RequestException, ValueError) as error:
            if attempt == MAX_RETRIES:
                raise RuntimeError(
                    f"Failed to acquire {url} after {MAX_RETRIES} attempts: {error}"
                ) from error

            retry_delay = attempt * 2
            print(
                f"Request attempt {attempt} failed: {error}. "
                f"Retrying in {retry_delay} seconds."
            )
            time.sleep(retry_delay)

    raise RuntimeError("The request retry loop ended unexpectedly.")


def normalize_book(book: dict) -> dict:
    """Select useful fields from one Gutendex book object."""
    gutenberg_id = int(book["id"])
    authors = "; ".join(
        author.get("name", "").strip()
        for author in book.get("authors", [])
        if author.get("name", "").strip()
    )
    languages = ", ".join(
        language.upper() for language in book.get("languages", [])
    )

    return {
        "gutenberg_id": gutenberg_id,
        "title": str(book["title"]).strip(),
        "author": authors or "Unknown",
        "language": languages or "Unknown",
        "download_count": int(book["download_count"]),
        "book_url": f"https://www.gutenberg.org/ebooks/{gutenberg_id}",
    }


def acquire_books() -> list[dict]:
    """Follow API pagination until 1,200 unique book records are collected."""
    records = []
    seen_gutenberg_ids = set()
    next_url = API_URL
    params = {"sort": "popular"}
    request_count = 0

    with requests.Session() as session:
        session.headers.update(HEADERS)

        while next_url and len(records) < TARGET_RECORDS:
            payload = request_page(session, next_url, params)
            request_count += 1
            params = None

            for book in payload["results"]:
                normalized = normalize_book(book)
                if normalized["gutenberg_id"] in seen_gutenberg_ids:
                    continue

                seen_gutenberg_ids.add(normalized["gutenberg_id"])
                records.append(normalized)

                if len(records) == TARGET_RECORDS:
                    break

            print(
                f"Downloaded API page {request_count:02d}: "
                f"{len(records):,}/{TARGET_RECORDS:,} unique records collected"
            )
            next_url = payload.get("next")

            if next_url and len(records) < TARGET_RECORDS:
                time.sleep(REQUEST_DELAY_SECONDS)

    if len(records) < TARGET_RECORDS:
        raise ValueError(
            f"The API ended after {len(records):,} unique records; "
            f"{TARGET_RECORDS:,} are required."
        )

    return records


def add_course_ids_and_popularity(records: list[dict]) -> list[dict]:
    """Add stable display IDs and download-based popularity quintiles."""
    ranked_records = sorted(
        records,
        key=lambda record: (-record["download_count"], record["gutenberg_id"]),
    )

    for index, record in enumerate(ranked_records):
        record["record_id"] = f"{index + 1:04d}"
        record["popularity_stars"] = 5 - min(
            4,
            (index * 5) // TARGET_RECORDS,
        )

    return ranked_records


def validate_and_save(records: list[dict]) -> None:
    """Validate all assignment invariants before writing the CSV."""
    if len(records) != TARGET_RECORDS:
        raise ValueError(f"Expected {TARGET_RECORDS} records, found {len(records)}.")
    if len({record["gutenberg_id"] for record in records}) != TARGET_RECORDS:
        raise ValueError("Gutenberg identifiers must be unique.")
    if [record["record_id"] for record in records] != [
        f"{number:04d}" for number in range(1, TARGET_RECORDS + 1)
    ]:
        raise ValueError("Display identifiers must run consecutively from 0001 to 1200.")
    if any(not all(str(record[field]).strip() for field in FIELDNAMES) for record in records):
        raise ValueError("The acquired dataset contains a missing required value.")
    if any(record["download_count"] < 0 for record in records):
        raise ValueError("Download counts cannot be negative.")
    if any(record["popularity_stars"] not in range(1, 6) for record in records):
        raise ValueError("Popularity tiers must range from one to five stars.")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(records)

    print(f"Saved {len(records):,} validated records to {OUTPUT_PATH}")


if __name__ == "__main__":
    validate_and_save(add_course_ids_and_popularity(acquire_books()))
