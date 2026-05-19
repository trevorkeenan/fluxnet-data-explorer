#!/usr/bin/env python3
"""Refresh authoritative vegetation metadata used by the FLUXNET explorer."""

from __future__ import annotations

import codecs
import concurrent.futures
import csv
import json
import pathlib
import re
import sys
import urllib.request


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
AMERIFLUX_SITE_SEARCH_URL = "https://ameriflux.lbl.gov/sites/site-search/"
FLUXNET_SITEINFO_URL_TEMPLATE = "https://fluxnet.org/sites/siteinfo/{site_id}"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "assets" / "site_vegetation_metadata.csv"
FLUXNET2015_SITE_INFO_PATH = REPO_ROOT / "assets" / "siteinfo_fluxnet2015.csv"
USER_AGENT = "Mozilla/5.0 (compatible; Codex FLUXNET Data Explorer)"
MAX_WORKERS = 12

EMBEDDED_JSON_STRING_RE = re.compile(r"const\s+jsonSites\s*=\s*'((?:\\.|[^'])*)';", re.S)
VEGETATION_CODE_RE = re.compile(r"<td>\s*Vegetation IGBP:\s*</td>\s*<td>\s*([A-Z]{2,3})\b", re.I | re.S)


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


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


def build_combined_lookup() -> dict[str, tuple[str, str]]:
    combined = parse_ameriflux_site_search_vegetation(fetch_text(AMERIFLUX_SITE_SEARCH_URL))
    missing_fluxnet2015 = [site_id for site_id in read_fluxnet2015_site_ids(FLUXNET2015_SITE_INFO_PATH) if site_id not in combined]

    def fetch_fluxnet_entry(site_id: str) -> tuple[str, tuple[str, str]]:
        vegetation_type = parse_fluxnet_siteinfo_vegetation(
            fetch_text(FLUXNET_SITEINFO_URL_TEMPLATE.format(site_id=site_id)),
            site_id
        )
        return site_id, (vegetation_type, "fluxnet_siteinfo")

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for site_id, payload in executor.map(fetch_fluxnet_entry, missing_fluxnet2015):
            combined[site_id] = payload

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
    output_path = pathlib.Path(argv[1]).resolve() if len(argv) > 1 else DEFAULT_OUTPUT_PATH
    lookup = build_combined_lookup()
    write_lookup_csv(output_path, lookup)

    counts: dict[str, int] = {}
    for _, metadata_source in lookup.values():
        counts[metadata_source] = counts.get(metadata_source, 0) + 1

    print(f"Wrote {len(lookup)} vegetation metadata rows to {output_path}")
    for metadata_source in sorted(counts):
        print(f"  {metadata_source}: {counts[metadata_source]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
