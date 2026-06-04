#!/usr/bin/env python3
"""Refresh AmeriFlux site metadata used by the FLUXNET explorer."""

from __future__ import annotations

import argparse
import codecs
import csv
import json
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
AMERIFLUX_SITE_SEARCH_URL = "https://ameriflux.lbl.gov/sites/site-search/"
AMERIFLUX_AVAILABILITY_URLS = (
    "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/FLUXNET/CCBY4.0",
    "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/BASE-BADM/CCBY4.0",
    "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/BASE-BADM/LEGACY",
)
DEFAULT_OUTPUT_PATH = REPO_ROOT / "assets" / "ameriflux_site_info.csv"
USER_AGENT = "Mozilla/5.0 (compatible; Codex FLUXNET Data Explorer)"
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_RETRIES = 4
DEFAULT_RETRY_DELAY_SECONDS = 2.0
EMBEDDED_JSON_STRING_RE = re.compile(r"const\s+jsonSites\s*=\s*'((?:\\.|[^'])*)';", re.S)
OUTPUT_COLUMNS = ("SITE_ID", "SITE_NAME", "COUNTRY", "LOCATION_LAT", "LOCATION_LONG")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-csv",
        default=str(DEFAULT_OUTPUT_PATH),
        help="CSV path to write. Defaults to assets/ameriflux_site_info.csv.",
    )
    parser.add_argument(
        "--skip-availability-validation",
        action="store_true",
        help="Do not validate that AmeriFlux availability sites are present in site-search metadata.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"Per-request timeout in seconds (default: {DEFAULT_TIMEOUT_SECONDS}).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=DEFAULT_RETRIES,
        help=f"Maximum retries per request (default: {DEFAULT_RETRIES}).",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=DEFAULT_RETRY_DELAY_SECONDS,
        help=f"Base retry delay in seconds (default: {DEFAULT_RETRY_DELAY_SECONDS}).",
    )
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
        log(f"AmeriFlux retry {attempt}/{retries} ({label}) after {delay:.1f}s: {compact_error(last_error)}")
        time.sleep(delay)
    raise RuntimeError(f"AmeriFlux request failed after {retries} attempt(s) ({label}): {compact_error(last_error)}")


def fetch_json(url: str, timeout: int, retries: int, retry_delay: float, label: str) -> Any:
    text = fetch_text(url, timeout, retries, retry_delay, label)
    try:
        return json.loads(text)
    except json.JSONDecodeError as err:
        raise RuntimeError(
            f"Invalid JSON from AmeriFlux {label}; bytes={len(text.encode('utf-8'))}; "
            f"preview={compact_text(text, 300)}; parse_error={err}"
        ) from err


def clean_string(value: object) -> str:
    return str(value or "").strip()


def normalize_site_id(value: object) -> str:
    return clean_string(value).upper()


def parse_ameriflux_site_search(page_html: str) -> list[dict[str, Any]]:
    match = EMBEDDED_JSON_STRING_RE.search(page_html)
    if not match:
        raise RuntimeError("Could not find embedded jsonSites payload in AmeriFlux site-search page.")
    payload = codecs.decode(match.group(1), "unicode_escape")
    sites = json.loads(payload)
    if not isinstance(sites, list):
        raise RuntimeError(f"Unexpected AmeriFlux site-search payload type: {type(sites).__name__}")
    return [site for site in sites if isinstance(site, dict)]


def site_info_row(site: dict[str, Any]) -> dict[str, str]:
    site_id = normalize_site_id(site.get("site_id"))
    return {
        "SITE_ID": site_id,
        "SITE_NAME": clean_string(site.get("site_name")),
        "COUNTRY": clean_string(site.get("country")),
        "LOCATION_LAT": clean_string(site.get("latitude")),
        "LOCATION_LONG": clean_string(site.get("longitude")),
    }


def build_site_info_rows(sites: list[dict[str, Any]]) -> list[dict[str, str]]:
    rows_by_site_id: dict[str, dict[str, str]] = {}
    for site in sites:
        row = site_info_row(site)
        site_id = row["SITE_ID"]
        if not site_id:
            continue
        rows_by_site_id[site_id] = row
    return [rows_by_site_id[site_id] for site_id in sorted(rows_by_site_id)]


def normalize_publish_years(values: object) -> list[int]:
    if not isinstance(values, list):
        return []
    years: list[int] = []
    for value in values:
        try:
            year = int(value)
        except (TypeError, ValueError):
            continue
        if year not in years:
            years.append(year)
    return sorted(years)


def load_available_site_ids(timeout: int, retries: int, retry_delay: float) -> set[str]:
    site_ids: set[str] = set()
    for url in AMERIFLUX_AVAILABILITY_URLS:
        label = "availability " + "/".join(url.rsplit("/", 3)[-3:])
        payload = fetch_json(url, timeout, retries, retry_delay, label)
        values = payload.get("values", []) if isinstance(payload, dict) else []
        log(f"AmeriFlux availability rows from {url}: {len(values) if isinstance(values, list) else 0}")
        for entry in values:
            if not isinstance(entry, dict):
                continue
            site_id = normalize_site_id(entry.get("site_id") or entry.get("SITE_ID"))
            if site_id and normalize_publish_years(entry.get("publish_years")):
                site_ids.add(site_id)
    return site_ids


def validate_available_sites_are_present(rows: list[dict[str, str]], timeout: int, retries: int, retry_delay: float) -> None:
    metadata_site_ids = {row["SITE_ID"] for row in rows if row.get("SITE_ID")}
    available_site_ids = load_available_site_ids(timeout, retries, retry_delay)
    log(f"AmeriFlux availability unique site IDs: {len(available_site_ids)}")
    missing = sorted(available_site_ids - metadata_site_ids)
    if missing:
        sample = ", ".join(missing[:20])
        suffix = "" if len(missing) <= 20 else f", ... ({len(missing)} total)"
        raise RuntimeError(
            "AmeriFlux site metadata is missing available-data site(s): "
            f"{sample}{suffix}"
        )


def write_rows(path: pathlib.Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    output_path = pathlib.Path(args.output_csv).resolve()
    timeout = max(1, args.timeout)
    retries = max(1, args.retries)
    retry_delay = max(0.1, args.retry_delay)
    with phase("fetch AmeriFlux site-search metadata"):
        site_search_html = fetch_text(AMERIFLUX_SITE_SEARCH_URL, timeout, retries, retry_delay, "site search")
        rows = build_site_info_rows(parse_ameriflux_site_search(site_search_html))
        log(f"AmeriFlux site-search metadata rows: {len(rows)}")
    if not rows:
        raise RuntimeError("AmeriFlux site-search returned no usable site metadata rows.")
    if not args.skip_availability_validation:
        with phase("validate AmeriFlux availability coverage"):
            validate_available_sites_are_present(rows, timeout, retries, retry_delay)
    with phase("write AmeriFlux site metadata"):
        write_rows(output_path, rows)
    log(f"Wrote {len(rows)} AmeriFlux site metadata rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
