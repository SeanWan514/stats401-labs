"""Clean 1,500 tweets and calculate RoBERTa sentiment for Lab 4."""

from __future__ import annotations

import argparse
import html
from pathlib import Path
import re

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

SOURCE_URL = "https://raw.githubusercontent.com/t-davidson/hate-speech-and-offensive-language/master/data/labeled_data.csv"
MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
SAMPLE_SIZE = 1500
RANDOM_STATE = 401
ROOT = Path(__file__).resolve().parents[1]
RAW_PATH = ROOT / "data" / "lab4_raw_tweets.csv"
CLEAN_PATH = ROOT / "data" / "lab4_clean_tweets.csv"
SUMMARY_PATH = ROOT / "data" / "lab4_sentiment_by_category.csv"
TERMS_PATH = ROOT / "data" / "lab4_top_terms.csv"
CATEGORY_MAP = {0: "Hate speech", 1: "Offensive language", 2: "Neither"}


def acquire_raw_data() -> pd.DataFrame:
    """Download and deterministically sample the MIT-licensed source dataset."""
    source = pd.read_csv(SOURCE_URL)
    required = {"Unnamed: 0", "count", "hate_speech", "offensive_language", "neither", "class", "tweet"}
    if not required.issubset(source.columns) or len(source) < SAMPLE_SIZE:
        raise ValueError("The source dataset is incomplete.")
    sample_sizes = {0: 100, 1: 1100, 2: 300}
    sampled = pd.concat([
        source[source["class"] == category].sample(n=size, random_state=RANDOM_STATE)
        for category, size in sample_sizes.items()
    ]).sort_values("Unnamed: 0").reset_index(drop=True)
    sampled = sampled.rename(columns={"Unnamed: 0": "source_row", "tweet": "tweet_text"})
    sampled.insert(0, "tweet_id", [f"T{number:04d}" for number in range(1, len(sampled) + 1)])
    sampled.to_csv(RAW_PATH, index=False)
    return sampled


def normalize_tweet(text: str) -> str:
    """Create an aggressively normalized text version for TF-IDF."""
    text = html.unescape(str(text)).lower()
    text = re.sub(r"https?://\S+|www\.\S+", " URL ", text)
    text = re.sub(r"@\w+", " USER ", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\b", " NUMBER ", text)
    text = re.sub(r"[^a-z\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def prepare_for_roberta(text: str) -> str:
    """Lightly normalize handles and URLs while preserving tweet context."""
    text = html.unescape(str(text))
    text = re.sub(r"@\w+", "@user", text)
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return re.sub(r"\s+", " ", text).strip()


def inspect_and_clean(raw: pd.DataFrame) -> pd.DataFrame:
    """Inspect relevant quality issues and return tidy structured records."""
    print("Raw shape:", raw.shape)
    print("Missing values:\n", raw.isna().sum())
    print("Exact duplicates:", raw.duplicated().sum())
    print("Duplicate tweet IDs:", raw["tweet_id"].duplicated().sum())
    data = raw.copy()
    numeric = ["source_row", "count", "hate_speech", "offensive_language", "neither", "class"]
    for column in numeric:
        data[column] = pd.to_numeric(data[column], errors="coerce")
    data["tweet_text"] = data["tweet_text"].astype("string").str.replace(r"\s+", " ", regex=True).str.strip()
    data = data.dropna(subset=["tweet_id", "tweet_text", "class"])
    data = data[data["tweet_text"].str.len() > 0].drop_duplicates(subset=["tweet_id"], keep="first")
    data = data[data["class"].isin(CATEGORY_MAP)]
    vote_columns = ["count", "hate_speech", "offensive_language", "neither"]
    data = data[(data[vote_columns] >= 0).all(axis=1)]
    data = data[data["count"] == data[["hate_speech", "offensive_language", "neither"]].sum(axis=1)]
    data["annotation_category"] = data["class"].astype(int).map(CATEGORY_MAP)
    data["tweet_text_raw"] = data["tweet_text"].map(html.unescape)
    data["text_clean"] = data["tweet_text_raw"].map(normalize_tweet)
    data["sentiment_text"] = data["tweet_text_raw"].map(prepare_for_roberta)
    data["word_count"] = data["text_clean"].str.split().str.len()
    if len(data) < 1000 or data["tweet_id"].duplicated().any():
        raise ValueError("Cleaning must retain at least 1,000 unique tweets.")
    return data.reset_index(drop=True)


def calculate_tfidf(data: pd.DataFrame) -> None:
    """Create a pruned TF-IDF matrix and save important corpus terms."""
    vectorizer = TfidfVectorizer(min_df=5, max_df=0.90, stop_words="english")
    matrix = vectorizer.fit_transform(data["text_clean"])
    means = np.asarray(matrix.mean(axis=0)).ravel()
    top = means.argsort()[::-1][:25]
    pd.DataFrame({"term": vectorizer.get_feature_names_out()[top], "mean_tfidf": means[top]}).to_csv(TERMS_PATH, index=False)
    print("TF-IDF matrix shape:", matrix.shape)


def calculate_sentiment(data: pd.DataFrame, batch_size: int = 32) -> pd.DataFrame:
    """Estimate sentiment for every tweet with the required CardiffNLP model."""
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
    model.eval()
    labels = [model.config.id2label[index].lower() for index in range(3)]
    probabilities = []
    for start in range(0, len(data), batch_size):
        batch = data["sentiment_text"].iloc[start:start + batch_size].tolist()
        encoded = tokenizer(batch, padding=True, truncation=True, max_length=512, return_tensors="pt")
        with torch.no_grad():
            logits = model(**encoded).logits
        probabilities.extend(torch.softmax(logits, dim=1).cpu().numpy())
        print(f"Sentiment: {min(start + batch_size, len(data)):,}/{len(data):,}")
    scores = pd.DataFrame(probabilities, columns=labels)
    for label in ["negative", "neutral", "positive"]:
        data[f"sentiment_{label}"] = scores[label].to_numpy()
    data["sentiment"] = scores[["negative", "neutral", "positive"]].idxmax(axis=1).str.capitalize()
    data["sentiment_score"] = data["sentiment_positive"] - data["sentiment_negative"]
    return data


def validate_and_export(data: pd.DataFrame) -> None:
    """Validate and export tidy tweet-level and aggregate CSV files."""
    columns = ["tweet_id", "source_row", "annotation_category", "tweet_text_raw", "text_clean", "word_count", "count", "hate_speech", "offensive_language", "neither", "sentiment_negative", "sentiment_neutral", "sentiment_positive", "sentiment_score", "sentiment"]
    final = data[columns].copy()
    probabilities = final[["sentiment_negative", "sentiment_neutral", "sentiment_positive"]]
    if len(final) < 1000 or final["tweet_id"].duplicated().any() or final.isna().any().any():
        raise ValueError("The final dataset must contain at least 1,000 complete, unique tweets.")
    if not np.allclose(probabilities.sum(axis=1), 1, atol=1e-5) or not final["sentiment_score"].between(-1, 1).all():
        raise ValueError("Sentiment probabilities or scores are invalid.")
    final.to_csv(CLEAN_PATH, index=False)
    summary = final.groupby(["annotation_category", "sentiment"]).agg(count=("tweet_id", "size"), average_score=("sentiment_score", "mean")).reset_index()
    summary["proportion"] = summary["count"] / summary.groupby("annotation_category")["count"].transform("sum")
    summary.to_csv(SUMMARY_PATH, index=False)
    print("Final shape:", final.shape)
    print("Sentiment counts:\n", final["sentiment"].value_counts())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    raw = acquire_raw_data() if not RAW_PATH.exists() else pd.read_csv(RAW_PATH)
    cleaned = inspect_and_clean(raw)
    calculate_tfidf(cleaned)
    if args.prepare_only:
        print(f"Prepared {len(cleaned):,} cleaned records without sentiment inference.")
        return
    validate_and_export(calculate_sentiment(cleaned))


if __name__ == "__main__":
    main()
