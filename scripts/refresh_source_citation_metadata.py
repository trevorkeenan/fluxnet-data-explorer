#!/usr/bin/env python3
"""Refresh product-level citation metadata from authoritative source site pages."""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import html
import pathlib
import re
import sys
import time
from urllib.error import HTTPError, URLError
import urllib.request
from typing import Any

try:
    from .refresh_logging import compact_error, compact_text, log, phase
except ImportError:  # pragma: no cover - supports direct script execution
    from refresh_logging import compact_error, compact_text, log, phase


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_PATH = REPO_ROOT / "assets" / "source_citation_metadata.csv"
USER_AGENT = "Mozilla/5.0 (compatible; Codex FLUXNET Data Explorer)"
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_RETRIES = 4
DEFAULT_RETRY_DELAY_SECONDS = 2.0
MAX_WORKERS = 12

AVAILABILITY_SOURCES = (
    (
        "AmeriFlux FLUXNET",
        "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/FLUXNET/CCBY4.0",
        "FLUXNET",
        "CCBY4.0",
    ),
    (
        "AmeriFlux BASE CC-BY-4.0",
        "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/BASE-BADM/CCBY4.0",
        "BASE-BADM",
        "CCBY4.0",
    ),
    (
        "AmeriFlux BASE Legacy",
        "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/BASE-BADM/LEGACY",
        "BASE-BADM",
        "LEGACY",
    ),
    (
        "FLUXNET2015",
        "https://amfcdn.lbl.gov/api/v2/data_availability/FLUXNET/FLUXNET2015/CCBY4.0",
        "FLUXNET2015",
        "CCBY4.0",
    ),
)

OUTPUT_COLUMNS = (
    "site_id",
    "data_product",
    "data_policy",
    "citation_doi",
    "citation_url",
    "citation_text",
    "citation_source",
    "citation_source_url",
)

DOILIST_RE = re.compile(r'<div\s+id=["\']doilist["\'][^>]*>(.*?)</div>', re.I | re.S)
MAJOR_ITEM_RE = re.compile(r'<li[^>]*class=["\'][^"\']*\bmajor\b[^"\']*["\'][^>]*>(.*?)</li>', re.I | re.S)
LABEL_RE = re.compile(r"<strong>\s*([^<]+?)\s*:\s*</strong>", re.I | re.S)
DOI_URL_RE = re.compile(r'https?://doi\.org/(10\.\d{4,9}/[^"\'<>\s]+)', re.I)
CITATION_RE = re.compile(r"<br\s*/?>\s*<strong>\s*Citation\s*:\s*</strong>\s*(.*)", re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-csv",
        default=str(DEFAULT_OUTPUT_PATH),
        help="CSV path to write. Defaults to assets/source_citation_metadata.csv.",
    )
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    parser.add_argument("--retry-delay", type=float, default=DEFAULT_RETRY_DELAY_SECONDS)
    parser.add_argument("--workers", type=int, default=MAX_WORKERS)
    return parser.parse_args(argv)


def should_retry_http_status(status_code: int) -> bool:
    return status_code >= 500 or status_code in (408, 409, 425, 429)


def fetch_text(url: str, timeout: int, retries: int, retry_delay: float, label: str) -> str:
    last_error: Exception | None = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read().decode("utf-8", errors="replace")
        except HTTPError as err:
            detail = compact_text(err.read().decode("utf-8", "replace"))
            last_error = RuntimeError(f"HTTP {err.code}: {detail}")
            if attempt >= max(1, retries) or not should_retry_http_status(err.code):
                break
        except (URLError, TimeoutError, OSError) as err:
            last_error = err
            if attempt >= max(1, retries):
                break
        delay = min(30.0, retry_delay * (2 ** (attempt - 1)))
        log(f"Citation metadata retry {attempt}/{retries} ({label}) after {delay:.1f}s: {compact_error(last_error)}")
        time.sleep(delay)
    raise RuntimeError(f"Citation metadata request failed after {retries} attempt(s) ({label}): {compact_error(last_error)}")


def fetch_json(url: str, timeout: int, retries: int, retry_delay: float, label: str) -> dict[str, Any]:
    import json

    payload = json.loads(fetch_text(url, timeout, retries, retry_delay, label))
    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected object JSON from {label}.")
    return payload


def normalize_site_id(value: object) -> str:
    return str(value or "").strip()


def normalize_product_label(label: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]+", "", str(label or "").upper())
    if normalized == "AMERIFLUXBASE":
        return "BASE-BADM"
    if normalized == "AMERIFLUXFLUXNET":
        return "FLUXNET"
    if normalized == "FLUXNET2015":
        return "FLUXNET2015"
    return ""


def clean_html_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub(" ", value or ""))).strip()


def parse_source_citations(page_html: str) -> dict[str, dict[str, str]]:
    doilist = DOILIST_RE.search(page_html or "")
    if not doilist:
        return {}

    records: dict[str, dict[str, str]] = {}
    for item_match in MAJOR_ITEM_RE.finditer(doilist.group(1)):
        item_html = item_match.group(1)
        label_match = LABEL_RE.search(item_html)
        doi_match = DOI_URL_RE.search(item_html)
        product = normalize_product_label(label_match.group(1) if label_match else "")
        if not product or not doi_match:
            continue
        doi = doi_match.group(1).rstrip(".,;:)")
        citation_match = CITATION_RE.search(item_html)
        records[product] = {
            "citation_doi": doi,
            "citation_url": f"https://doi.org/{doi}",
            "citation_text": clean_html_text(citation_match.group(1)) if citation_match else "",
        }
    return records


def load_availability_records(timeout: int, retries: int, retry_delay: float) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for label, url, product, policy in AVAILABILITY_SOURCES:
        payload = fetch_json(url, timeout, retries, retry_delay, label)
        values = payload.get("values", [])
        if not isinstance(values, list):
            raise RuntimeError(f"{label} availability payload is missing values[].")
        for entry in values:
            if not isinstance(entry, dict):
                continue
            site_id = normalize_site_id(entry.get("site_id") or entry.get("SITE_ID"))
            source_url = str(entry.get("url") or "").strip()
            if not site_id or not source_url:
                continue
            records.append(
                {
                    "site_id": site_id,
                    "data_product": product,
                    "data_policy": policy,
                    "citation_source": label + " data-citation page",
                    "citation_source_url": source_url,
                }
            )
    return records


def build_citation_rows(
    availability_records: list[dict[str, str]],
    timeout: int,
    retries: int,
    retry_delay: float,
    workers: int,
) -> list[dict[str, str]]:
    page_urls = sorted({row["citation_source_url"] for row in availability_records})
    pages: dict[str, dict[str, dict[str, str]]] = {}

    def fetch_page(url: str) -> tuple[str, dict[str, dict[str, str]]]:
        return url, parse_source_citations(fetch_text(url, timeout, retries, retry_delay, url))

    with phase(f"fetch source citation pages ({len(page_urls)} pages, workers={workers})"):
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            for index, (url, parsed) in enumerate(executor.map(fetch_page, page_urls), start=1):
                pages[url] = parsed
                if index == len(page_urls) or index % 100 == 0:
                    log(f"Source citation pages fetched: {index}/{len(page_urls)}")

    rows: list[dict[str, str]] = []
    for record in availability_records:
        citation = pages.get(record["citation_source_url"], {}).get(record["data_product"], {})
        rows.append(
            {
                **record,
                "citation_doi": citation.get("citation_doi", ""),
                "citation_url": citation.get("citation_url", ""),
                "citation_text": citation.get("citation_text", ""),
            }
        )
    return sorted(rows, key=lambda row: (row["site_id"].lower(), row["data_product"], row["data_policy"]))


def write_rows(output_path: pathlib.Path, rows: list[dict[str, str]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    timeout = max(1, args.timeout)
    retries = max(1, args.retries)
    retry_delay = max(0.1, args.retry_delay)
    with phase("load source availability records"):
        availability_records = load_availability_records(timeout, retries, retry_delay)
        log(f"Source citation availability records: {len(availability_records)}")
    rows = build_citation_rows(
        availability_records,
        timeout,
        retries,
        retry_delay,
        max(1, args.workers),
    )
    with phase("write source citation metadata"):
        write_rows(pathlib.Path(args.output_csv).resolve(), rows)
    log(f"Wrote {len(rows)} source citation metadata rows to {args.output_csv}")
    log(f"Rows with DOI: {sum(bool(row['citation_doi']) for row in rows)}")
    log(f"Rows with full citation: {sum(bool(row['citation_text']) for row in rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
