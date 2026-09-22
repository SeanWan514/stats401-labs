#!/usr/bin/env python3
"""Build the Lab 8 bulletin corpus, semantic map, neighbors, and matrix.

The script uses only Python's standard library plus two macOS frameworks invoked
through the included Swift helpers: PDFKit for page-aware extraction and
NaturalLanguage for semantic sentence embeddings.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import re
import subprocess
import tempfile
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


SOURCE_URL = "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf"
TITLE = "Bulletin of Duke Kunshan University Undergraduate Instruction"
VERSION = "2021–2022"
ACCESS_DATE = "September 22, 2026"
CLUSTER_COUNT = 9
CLUSTER_NAMES = {
    0: "Course Requirements and Subject Codes",
    1: "Academic Rules, Credits, and Enrollment",
    2: "China, Globalization, and Economics",
    3: "Data, Computation, and Materials",
    4: "Language, Learning, and Communication",
    5: "Health, Research, and Academic Programs",
    6: "Culture, Media, and Humanities",
    7: "Big Questions and Civic Inquiry",
    8: "Society, Behavior, and Environment",
}

STOPWORDS = {
    "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "been",
    "before", "being", "between", "both", "but", "by", "can", "course", "courses", "do", "during",
    "each", "for", "from", "has", "have", "having", "if", "in", "into", "is", "it", "its", "may",
    "more", "must", "no", "not", "of", "on", "one", "or", "other", "our", "program", "students",
    "student", "such", "than", "that", "the", "their", "there", "these", "they", "this", "through",
    "to", "under", "university", "upon", "use", "will", "with", "within", "would", "duke", "kunshan",
}


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def normalize_space(text: str) -> str:
    text = text.replace("\u00ad", "").replace("\uf0b7", "•")
    text = re.sub(r"(?<=\w)-\s+(?=[a-z])", "", text)
    return re.sub(r"\s+", " ", text).strip()


def heading_candidate(line: str) -> bool:
    words = line.split()
    if not 1 <= len(words) <= 14 or len(line) > 110:
        return False
    if line.startswith(("(", "•", "/")) or re.search(r"\s\d+$", line):
        return False
    if line.isupper() and len(words) == 1:
        return False
    if re.match(r"^(Anti-requisite|Co-requisite|Prerequisite|May \d)", line, re.I):
        return False
    if line.endswith("The detailed"):
        return False
    if line.endswith((".", ",", ";", ":", "?", "!")):
        return False
    if re.match(r"^(Part \d+|Appendix\b)", line, re.I):
        return True
    if re.match(r"^[A-Z]{2,12}\s+\d{2,4}", line):
        return True
    alpha = [word for word in words if re.search(r"[A-Za-z]", word)]
    if not alpha:
        return False
    titled = sum(word[0].isupper() or word.isupper() for word in alpha)
    return titled / len(alpha) >= 0.72


def split_sentences(text: str) -> list[str]:
    return [normalize_space(part) for part in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9“\"])", text) if normalize_space(part)]


def chunk_sentences(sentences: list[str], minimum: int = 45, maximum: int = 165) -> list[str]:
    chunks, current, count = [], [], 0
    for sentence in sentences:
        words = sentence.split()
        if current and count + len(words) > maximum:
            chunks.append(" ".join(current))
            current, count = [], 0
        current.append(sentence)
        count += len(words)
        if count >= minimum and sentence.endswith((".", "?", "!")):
            chunks.append(" ".join(current))
            current, count = [], 0
    if current:
        if chunks and count < 25:
            chunks[-1] += " " + " ".join(current)
        else:
            chunks.append(" ".join(current))
    return chunks


def extract_passages(pages: list[dict]) -> list[dict]:
    chapter = "General Information"
    section = "Introduction"
    subsection = "Overview"
    raw = []
    for page in pages:
        page_number = page["page"]
        if page_number < 10:
            continue
        lines = [normalize_space(line) for line in page["text"].splitlines()]
        lines = [line for line in lines if line and not re.fullmatch(r"\d+", line)]
        body = []
        page_section_found = False

        def flush_body() -> None:
            nonlocal body
            if not body:
                return
            text = normalize_space(" ".join(body))
            for chunk in chunk_sentences(split_sentences(text)):
                word_count = len(chunk.split())
                if 25 <= word_count <= 230 and sum(character.isalpha() for character in chunk) >= 80:
                    raw.append({
                        "chapter": chapter,
                        "section": section,
                        "subsection": subsection,
                        "page": page_number,
                        "text": chunk,
                    })
            body = []

        for line in lines:
            if re.fullmatch(r"Bulletin of Duke Kunshan University.*", line, re.I):
                continue
            if heading_candidate(line):
                flush_body()
                if re.match(r"^Part \d+", line, re.I):
                    chapter = line
                    section = line.split(":", 1)[-1].strip() if ":" in line else line
                    subsection = "Overview"
                    page_section_found = True
                elif re.match(r"^Courses with Course Subject:", line, re.I):
                    section = line
                    subsection = "Overview"
                    page_section_found = True
                elif re.match(r"^[A-Z]{2,12}\s+\d{2,4}", line):
                    subsection = line
                elif re.match(r"^(pre|co-requisite|prerequisite|continuation of)\b", line, re.I):
                    continue
                elif line.lower() in {
                    "credit", "course code course name course", "course code", "course name", "electives",
                    "disciplinary courses", "interdisciplinary courses", "divisional foundation courses",
                    "major requirements", "required courses", "recommended electives",
                }:
                    subsection = line
                elif not page_section_found:
                    section = line
                    subsection = "Overview"
                    page_section_found = True
                else:
                    subsection = line
            else:
                body.append(line)
        flush_body()
    return raw


def clean_passages(raw: list[dict]) -> list[dict]:
    cleaned, seen = [], set()
    for item in raw:
        text = normalize_space(item["text"])
        key = re.sub(r"\W+", " ", text.lower()).strip()
        if key in seen or len(text.split()) < 25:
            continue
        seen.add(key)
        cleaned.append({**item, "text_clean": text, "word_count": len(text.split())})
    for index, item in enumerate(cleaned, 1):
        item["passage_id"] = f"p{index:04d}"
    return cleaned


def normalize_vector(vector: list[float]) -> list[float]:
    length = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / length for value in vector]


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def pca_two_dimensions(vectors: list[list[float]], seed: int = 401) -> list[tuple[float, float]]:
    dimensions = len(vectors[0])
    means = [sum(row[column] for row in vectors) / len(vectors) for column in range(dimensions)]
    centered = [[value - means[column] for column, value in enumerate(row)] for row in vectors]
    rng = random.Random(seed)
    components = []
    for _ in range(2):
        component = normalize_vector([rng.uniform(-1, 1) for _ in range(dimensions)])
        for _iteration in range(45):
            scores = [dot(row, component) for row in centered]
            updated = [sum(score * row[column] for score, row in zip(scores, centered)) for column in range(dimensions)]
            for previous in components:
                projection = dot(updated, previous)
                updated = [value - projection * axis for value, axis in zip(updated, previous)]
            component = normalize_vector(updated)
        components.append(component)
    return [(dot(row, components[0]), dot(row, components[1])) for row in centered]


def kmeans(vectors: list[list[float]], k: int, seed: int = 401) -> list[int]:
    rng = random.Random(seed)
    centroids = [vectors[index][:] for index in rng.sample(range(len(vectors)), k)]
    assignments = [-1] * len(vectors)
    for _iteration in range(80):
        updated_assignments = [max(range(k), key=lambda c: dot(vector, centroids[c])) for vector in vectors]
        if updated_assignments == assignments:
            break
        assignments = updated_assignments
        for cluster in range(k):
            members = [vector for vector, assignment in zip(vectors, assignments) if assignment == cluster]
            if members:
                centroids[cluster] = normalize_vector([sum(row[column] for row in members) / len(members) for column in range(len(vectors[0]))])
    return assignments


def tokenize(text: str) -> list[str]:
    return [word for word in re.findall(r"[a-z][a-z'-]{2,}", text.lower()) if word not in STOPWORDS]


def cluster_terms(passages: list[dict], assignments: list[int]) -> dict[int, list[str]]:
    document_tokens = [Counter(tokenize(item["text_clean"])) for item in passages]
    document_frequency = Counter()
    for counts in document_tokens:
        document_frequency.update(counts.keys())
    result = {}
    for cluster in range(CLUSTER_COUNT):
        scores = Counter()
        for counts, assignment in zip(document_tokens, assignments):
            if assignment != cluster:
                continue
            for term, frequency in counts.items():
                scores[term] += frequency * math.log((1 + len(passages)) / (1 + document_frequency[term]))
        result[cluster] = [term for term, _score in scores.most_common(8)]
    return result


def nearest_neighbors(vectors: list[list[float]], count: int = 5) -> list[list[tuple[int, float]]]:
    result = []
    for index, vector in enumerate(vectors):
        scored = [(other, dot(vector, candidate)) for other, candidate in enumerate(vectors) if other != index]
        result.append(sorted(scored, key=lambda item: item[1], reverse=True)[:count])
    return result


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows({field: row.get(field, "") for field in fields} for row in rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, default=Path(tempfile.gettempdir()) / "V2021-22_DKU_UG_Bulletin.pdf")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    args.output.mkdir(parents=True, exist_ok=True)
    if not args.pdf.exists():
        print(f"Downloading official bulletin to {args.pdf}")
        urllib.request.urlretrieve(SOURCE_URL, args.pdf)

    with tempfile.TemporaryDirectory(prefix="lab8-build-") as temporary:
        temporary = Path(temporary)
        pages_path = temporary / "pages.json"
        passages_path = temporary / "passages.json"
        embeddings_path = temporary / "embeddings.json"
        run(["swift", str(root / "extract_bulletin.swift"), str(args.pdf), str(pages_path)])
        pages = json.loads(pages_path.read_text(encoding="utf-8"))["pages"]
        raw = extract_passages(pages)
        passages = clean_passages(raw)
        passages_path.write_text(json.dumps(passages, ensure_ascii=False), encoding="utf-8")
        run(["swift", str(root / "embed_passages.swift"), str(passages_path), str(embeddings_path)])
        embedded = json.loads(embeddings_path.read_text(encoding="utf-8"))

    vectors_by_id = {item["passage_id"]: normalize_vector(item["embedding"]) for item in embedded if item["embedding"]}
    passages = [item for item in passages if item["passage_id"] in vectors_by_id]
    vectors = [vectors_by_id[item["passage_id"]] for item in passages]
    coordinates = pca_two_dimensions(vectors)
    assignments = kmeans(vectors, CLUSTER_COUNT)
    terms = cluster_terms(passages, assignments)
    neighbors = nearest_neighbors(vectors)

    map_rows = []
    neighbor_rows = []
    for index, (passage, coordinate, assignment) in enumerate(zip(passages, coordinates, assignments)):
        topic = CLUSTER_NAMES[assignment]
        map_rows.append({
            **passage,
            "cluster": assignment,
            "cluster_name": topic,
            "x": f"{coordinate[0]:.7f}",
            "y": f"{coordinate[1]:.7f}",
        })
        for rank, (neighbor_index, similarity) in enumerate(neighbors[index], 1):
            neighbor_rows.append({
                "passage_id": passage["passage_id"],
                "neighbor_id": passages[neighbor_index]["passage_id"],
                "rank": rank,
                "similarity": f"{similarity:.6f}",
            })

    matrix_counter = Counter((row["section"], row["cluster_name"]) for row in map_rows)
    matrix_rows = [
        {"section": section, "cluster_name": topic, "count": count}
        for (section, topic), count in sorted(matrix_counter.items())
    ]
    section_groups = defaultdict(list)
    for row in map_rows:
        section_groups[row["section"]].append(row)
    section_rows = [
        {
            "section": section,
            "passage_count": len(rows),
            "average_word_count": f"{sum(row['word_count'] for row in rows) / len(rows):.1f}",
            "topic_count": len({row["cluster_name"] for row in rows}),
        }
        for section, rows in sorted(section_groups.items(), key=lambda item: (-len(item[1]), item[0]))
    ]
    topic_rows = [
        {
            "cluster": cluster,
            "cluster_name": CLUSTER_NAMES[cluster],
            "passage_count": assignments.count(cluster),
            "top_terms": "; ".join(terms[cluster]),
        }
        for cluster in range(CLUSTER_COUNT)
    ]
    stats = {
        "title": TITLE,
        "version": VERSION,
        "source_url": SOURCE_URL,
        "access_date": ACCESS_DATE,
        "pdf_pages": 400,
        "raw_passages": len(raw),
        "clean_passages": len(map_rows),
        "average_words": round(sum(row["word_count"] for row in map_rows) / len(map_rows), 1),
        "formal_sections": len(section_groups),
        "chapters": len({row["chapter"] for row in map_rows}),
        "semantic_topics": CLUSTER_COUNT,
        "embedding_model": "Apple NaturalLanguage English sentence embedding",
        "embedding_dimensions": len(vectors[0]),
        "projection": "Two-component principal component analysis (PCA) of normalized semantic embeddings",
        "clustering": f"Cosine K-means, k={CLUSTER_COUNT}, random seed 401",
    }

    write_csv(args.output / "lab8_embedding_map.csv", map_rows, [
        "passage_id", "chapter", "section", "subsection", "page", "text", "text_clean",
        "word_count", "cluster", "cluster_name", "x", "y",
    ])
    write_csv(args.output / "lab8_semantic_neighbors.csv", neighbor_rows, ["passage_id", "neighbor_id", "rank", "similarity"])
    write_csv(args.output / "lab8_topic_section_matrix.csv", matrix_rows, ["section", "cluster_name", "count"])
    write_csv(args.output / "lab8_section_summary.csv", section_rows, ["section", "passage_count", "average_word_count", "topic_count"])
    write_csv(args.output / "lab8_topic_summary.csv", topic_rows, ["cluster", "cluster_name", "passage_count", "top_terms"])
    (args.output / "lab8_corpus_stats.json").write_text(json.dumps(stats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(stats, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
