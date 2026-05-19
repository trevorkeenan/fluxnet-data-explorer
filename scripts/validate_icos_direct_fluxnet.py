#!/usr/bin/env python3
"""Validate that expected ICOS/Shuttle sites survive into the explorer input data."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Dict, Sequence

from refresh_icos_direct_fluxnet import EXPECTED_REGRESSION_SITE_IDS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shuttle-csv", required=True, help="Path to the Shuttle snapshot CSV.")
    parser.add_argument("--icos-csv", required=True, help="Path to the ICOS-direct snapshot CSV.")
    return parser.parse_args()


def load_rows(path: str) -> list[dict[str, str]]:
    csv_path = Path(path)
    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def main() -> None:
    args = parse_args()
    shuttle_rows = load_rows(args.shuttle_csv)
    icos_rows = load_rows(args.icos_csv)

    shuttle_by_site: Dict[str, dict[str, str]] = {}
    for row in shuttle_rows:
        site_id = str(row.get("site_id") or "").strip()
        if site_id and site_id not in shuttle_by_site:
            shuttle_by_site[site_id] = row

    icos_by_site: Dict[str, dict[str, str]] = {}
    for row in icos_rows:
        site_id = str(row.get("site_id") or "").strip()
        if site_id and site_id not in icos_by_site:
            icos_by_site[site_id] = row

    missing: list[str] = []
    print("Expected explorer-site coverage:", flush=True)
    for site_id in EXPECTED_REGRESSION_SITE_IDS:
        if site_id in shuttle_by_site:
            print(f"  {site_id}: Shuttle", flush=True)
            continue
        icos_row = icos_by_site.get(site_id)
        if icos_row:
            file_name = str(icos_row.get("file_name") or "").strip()
            object_id = str(icos_row.get("object_id") or "").strip()
            print(f"  {site_id}: ICOS-direct ({file_name}, {object_id})", flush=True)
            continue
        missing.append(site_id)
        print(f"  {site_id}: MISSING", flush=True)

    if missing:
        raise SystemExit("Missing expected sites from final Shuttle/ICOS explorer inputs: " + ", ".join(missing))

    print(f"Validated {len(EXPECTED_REGRESSION_SITE_IDS)} expected sites in final Shuttle/ICOS explorer inputs.", flush=True)


if __name__ == "__main__":
    main()
