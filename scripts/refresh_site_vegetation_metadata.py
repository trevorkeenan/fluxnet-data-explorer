#!/usr/bin/env python3
"""Refresh authoritative vegetation metadata used by the FLUXNET explorer."""

from __future__ import annotations

import argparse
import codecs
import concurrent.futures
import csv
import json
import pathlib
import re
import sys
import time
from urllib.error import HTTPError, URLError
import urllib.request

try:
    from .refresh_logging import compact_error, compact_text, log, phase
except ImportError:  # pragma: no cover - supports direct script execution
    from refresh_logging import compact_error, compact_text, log, phase


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
AMERIFLUX_SITE_SEARCH_URL = "https://ameriflux.lbl.gov/sites/site-search/"
FLUXNET_SITEINFO_URL_TEMPLATE = "https://fluxnet.org/sites/siteinfo/{site_id}"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "assets" / "site_vegetation_metadata.csv"
FLUXNET2015_SITE_INFO_PATH = REPO_ROOT / "assets" / "siteinfo_fluxnet2015.csv"
USER_AGENT = "Mozilla/5.0 (compatible; Codex FLUXNET Data Explorer)"
MAX_WORKERS = 12
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_RETRIES = 4
DEFAULT_RETRY_DELAY_SECONDS = 2.0

EMBEDDED_JSON_STRING_RE = re.compile(r"const\s+jsonSites\s*=\s*'((?:\\.|[^'])*)';", re.S)
VEGETATION_CODE_RE = re.compile(r"<td>\s*Vegetation IGBP:\s*</td>\s*<td>\s*([A-Z]{2,3})\b", re.I | re.S)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "output_csv",
        nargs="?",
        default=str(DEFAULT_OUTPUT_PATH),
        help="CSV path to write. Defaults to assets/site_vegetation_metadata.csv.",
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
    parser.add_argument(
        "--workers",
        type=int,
        default=MAX_WORKERS,
        help=f"Concurrent FLUXNET siteinfo workers (default: {MAX_WORKERS}).",
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
        log(f"Vegetation metadata retry {attempt}/{retries} ({label}) after {delay:.1f}s: {compact_error(last_error)}")
        time.sleep(delay)
    raise RuntimeError(f"Vegetation metadata request failed after {retries} attempt(s) ({label}): {compact_error(last_error)}")


def normalize_site_id(value: object) -> str:
    return str(value or "").strip().upper()


def parse_ameriflux_site_search_vegetation(page_html: str) -> dict[str, tuple[str, str]]:
    match = EMBEDDED_JSON_STRING_RE.search(page_html)
    if not match:
        raise RuntimeError("Could not find embedded jsonSites payload in AmeriFlux site-search page.")

    sites = json.loads(codecs.decode(match.group(1), "unicode_escape"))
    lookup: dict[str, tuple[str, str]] = {}

    for site in sites:
        site_id = normalize_site_id(site.get("site_id"))
        vegetation_type = str(site.get("igbp") or "").strip()
        if not site_id or not vegetation_type:
            continue
        lookup[site_id] = (vegetation_type, "ameriflux_site_search")

    return lookup


def read_fluxnet2015_site_ids(csv_path: pathlib.Path) -> list[str]:
    site_ids: list[str] = []
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            site_id = normalize_site_id(row.get("mysitename"))
            if site_id:
                site_ids.append(site_id)
    return sorted(set(site_ids))


def parse_fluxnet_siteinfo_vegetation(page_html: str, site_id: str) -> str:
    match = VEGETATION_CODE_RE.search(page_html)
    if not match:
        raise RuntimeError(f"Could not parse Vegetation IGBP for {site_id}.")
    return str(match.group(1)).strip().upper()


def build_combined_lookup(timeout: int, retries: int, retry_delay: float, workers: int) -> dict[str, tuple[str, str]]:
    with phase("fetch AmeriFlux vegetation metadata"):
        site_search_html = fetch_text(AMERIFLUX_SITE_SEARCH_URL, timeout, retries, retry_delay, "AmeriFlux site search")
        combined = parse_ameriflux_site_search_vegetation(site_search_html)
        log(f"AmeriFlux vegetation rows: {len(combined)}")
    missing_fluxnet2015 = [site_id for site_id in read_fluxnet2015_site_ids(FLUXNET2015_SITE_INFO_PATH) if site_id not in combined]
    log(f"FLUXNET2015 siteinfo pages needed: {len(missing_fluxnet2015)}")

    def fetch_fluxnet_entry(site_id: str) -> tuple[str, tuple[str, str]]:
        vegetation_type = parse_fluxnet_siteinfo_vegetation(
            fetch_text(
                FLUXNET_SITEINFO_URL_TEMPLATE.format(site_id=site_id),
                timeout,
                retries,
                retry_delay,
                f"FLUXNET siteinfo {site_id}",
            ),
            site_id
        )
        return site_id, (vegetation_type, "fluxnet_siteinfo")

    with phase(f"fetch FLUXNET2015 vegetation pages ({len(missing_fluxnet2015)} pages, workers={workers})"):
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            for index, (site_id, payload) in enumerate(executor.map(fetch_fluxnet_entry, missing_fluxnet2015), start=1):
                combined[site_id] = payload
                if index == len(missing_fluxnet2015) or index % 25 == 0:
                    log(f"FLUXNET2015 vegetation pages fetched: {index}/{len(missing_fluxnet2015)}")

    return combined


def write_lookup_csv(output_path: pathlib.Path, lookup: dict[str, tuple[str, str]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["site_id", "vegetation_type", "metadata_source"])
        for site_id in sorted(lookup):
            vegetation_type, metadata_source = lookup[site_id]
            writer.writerow([site_id, vegetation_type, metadata_source])


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    output_path = pathlib.Path(args.output_csv).resolve()
    lookup = build_combined_lookup(
        timeout=max(1, args.timeout),
        retries=max(1, args.retries),
        retry_delay=max(0.1, args.retry_delay),
        workers=max(1, args.workers),
    )
    with phase("write vegetation metadata"):
        write_lookup_csv(output_path, lookup)

    counts: dict[str, int] = {}
    for _, metadata_source in lookup.values():
        counts[metadata_source] = counts.get(metadata_source, 0) + 1

    log(f"Wrote {len(lookup)} vegetation metadata rows to {output_path}")
    for metadata_source in sorted(counts):
        log(f"  {metadata_source}: {counts[metadata_source]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
