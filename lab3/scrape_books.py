"""Acquire all 1,000 public book records from Books to Scrape."""

from pathlib import Path
import time
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup


BASE_URL = "https://books.toscrape.com/"
PAGE_URL = urljoin(BASE_URL, "catalogue/page-{page}.html")
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "lab3_data.csv"
HEADERS = {"User-Agent": "STATS401-Class-Exercise/1.0 (educational project)"}
RATING_VALUES = {"One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5}
TOTAL_PAGES = 50
REQUEST_DELAY_SECONDS = 1


def parse_page(html: str, page_number: int) -> list[dict]:
    """Convert one catalogue page into structured book records."""
    soup = BeautifulSoup(html, "html.parser")
    books = soup.select("article.product_pod")

    if len(books) != 20:
        raise ValueError(
            f"Expected 20 books on page {page_number}, but found {len(books)}."
        )

    records = []
    for book in books:
        title_link = book.select_one("h3 a")
        price_text = book.select_one(".price_color").get_text(strip=True)
        availability = book.select_one(".availability").get_text(" ", strip=True)
        rating_classes = book.select_one("p.star-rating").get("class", [])
        rating_word = next(
            (name for name in rating_classes if name in RATING_VALUES),
            None,
        )

        if title_link is None or rating_word is None:
            raise ValueError(f"A required field is missing on page {page_number}.")

        records.append(
            {
                "record_id": f"{len(records) + 1:04d}",
                "title": title_link["title"],
                "price_gbp": float(price_text.replace("£", "")),
                "rating": RATING_VALUES[rating_word],
                "availability": availability,
                "page": page_number,
                "book_url": urljoin(PAGE_URL.format(page=page_number), title_link["href"]),
            }
        )

    return records


def acquire_books() -> list[dict]:
    """Download all catalogue pages with error handling and rate limiting."""
    records = []

    with requests.Session() as session:
        # Use a direct connection so machine-specific proxy settings do not
        # change this reproducible course acquisition workflow.
        session.trust_env = False
        session.headers.update(HEADERS)

        for page_number in range(1, TOTAL_PAGES + 1):
            url = PAGE_URL.format(page=page_number)

            try:
                response = session.get(url, timeout=15)
                response.raise_for_status()
                response.encoding = "utf-8"
                page_records = parse_page(response.text, page_number)
            except (requests.RequestException, ValueError) as error:
                print(f"Failed to acquire page {page_number}: {error}")
            else:
                records.extend(page_records)
                print(
                    f"Downloaded page {page_number:02d}/{TOTAL_PAGES}: "
                    f"{len(records)} records collected"
                )

            if page_number < TOTAL_PAGES:
                time.sleep(REQUEST_DELAY_SECONDS)

    return records


def validate_and_save(records: list[dict]) -> None:
    """Validate the assignment requirements and save a reproducible CSV."""
    dataframe = pd.DataFrame(records)
    expected_columns = [
        "record_id",
        "title",
        "price_gbp",
        "rating",
        "availability",
        "page",
        "book_url",
    ]

    if list(dataframe.columns) != expected_columns:
        raise ValueError("The acquired dataset does not have the expected columns.")
    if len(dataframe) < 1000:
        raise ValueError(f"Expected at least 1,000 records, but collected {len(dataframe)}.")
    if dataframe[expected_columns].isna().any().any():
        raise ValueError("The acquired dataset contains missing required values.")
    if not dataframe["record_id"].is_unique:
        raise ValueError("The acquired dataset contains duplicate course IDs.")
    if not dataframe["book_url"].is_unique:
        raise ValueError("The acquired dataset contains duplicate book URLs.")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    dataframe.to_csv(OUTPUT_PATH, index=False)
    print(f"Saved {len(dataframe):,} validated records to {OUTPUT_PATH}")


if __name__ == "__main__":
    validate_and_save(acquire_books())
