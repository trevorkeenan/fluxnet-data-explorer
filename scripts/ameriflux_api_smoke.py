#!/usr/bin/env python3
"""Dev smoke checks for AmeriFlux FLUXNET availability + download endpoints."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Tuple

AVAILABILITY_URL = "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/FLUXNET/CCBY4.0"
DOWNLOAD_URL = "https://amfcdn.lbl.gov/api/v1/data_download"
DEFAULT_USER_ID = "YOUR_AMERIFLUX_USERNAME"
DEFAULT_USER_EMAIL = "YOUR_EMAIL"


def fetch_json(
    url: str,
    *,
    method: str = "GET",
    payload: Dict[str, Any] | None = None,
    timeout: int = 30,
    retries: int = 3,
) -> Dict[str, Any]:
    body_bytes = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body_bytes = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    last_error: Exception | None = None
    for attempt in range(retries + 1):
        request = urllib.request.Request(url=url, data=body_bytes, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
                parsed = json.loads(raw)
                if not isinstance(parsed, dict):
                    raise RuntimeError(f"Expected object JSON from {url}, got {type(parsed).__name__}.")
                return parsed
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            message = f"HTTP {exc.code} for {url}: {body[:400]}"
            if 400 <= exc.code < 500:
                raise RuntimeError(message) from exc
            last_error = RuntimeError(message)
        except Exception as exc:  # noqa: BLE001
            last_error = exc

        if attempt < retries:
            sleep_for = (2**attempt) + (attempt * 0.15)
            time.sleep(sleep_for)

    assert last_error is not None
    raise RuntimeError(f"Request failed after retries for {url}: {last_error}") from last_error


def parse_publish_years(values: Any) -> List[int]:
    if not isinstance(values, list):
        return []
    years: List[int] = []
    seen = set()
    for value in values:
        try:
            year = int(str(value).strip())
        except Exception:  # noqa: BLE001
            continue
        if year not in seen:
            seen.add(year)
            years.append(year)
    years.sort()
    return years


def summarize_availability(payload: Dict[str, Any]) -> Tuple[int, int, List[str]]:
    values = payload.get("values")
    if not isinstance(values, list):
        raise RuntimeError("AmeriFlux availability payload missing list field: values")

    total_sites = len(values)
    valid_site_ids: List[str] = []
    for row in values:
        if not isinstance(row, dict):
            continue
        site_id = str(row.get("site_id", "")).strip()
        if not site_id:
            continue
        years = parse_publish_years(row.get("publish_years"))
        if years:
            valid_site_ids.append(site_id)

    return total_sites, len(valid_site_ids), valid_site_ids


def build_download_payload(site_id: str, user_id: str, user_email: str) -> Dict[str, Any]:
    return {
        "user_id": user_id,
        "user_email": user_email,
        "data_product": "FLUXNET",
        "data_variant": "FULLSET",
        "data_policy": "CCBY4.0",
        "site_ids": [site_id],
        "intended_use": "research",
        "description": f"Download FLUXNET for {site_id}",
        "agree_policy": True,
        "is_test": False,
    }


def has_configured_identity(user_id: str, user_email: str) -> bool:
    uid = str(user_id or "").strip()
    email = str(user_email or "").strip()
    if not uid or not email:
        return False
    if uid == DEFAULT_USER_ID or email == DEFAULT_USER_EMAIL:
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-id", default="AR-Bal", help="Site ID used for download smoke test (default: AR-Bal).")
    parser.add_argument("--user-id", default=os.getenv("AMERIFLUX_USER_ID", DEFAULT_USER_ID))
    parser.add_argument("--user-email", default=os.getenv("AMERIFLUX_USER_EMAIL", DEFAULT_USER_EMAIL))
    args = parser.parse_args()

    availability = fetch_json(AVAILABILITY_URL, method="GET")
    total_sites, sites_with_years, valid_site_ids = summarize_availability(availability)

    print(f"total_sites = {total_sites}")
    print(f"sites_with_years = {sites_with_years}")
    print(f"contains_{args.site_id} = {args.site_id in set(valid_site_ids)}")

    if not has_configured_identity(args.user_id, args.user_email):
        print("download_smoke_skipped = True")
        print("download_smoke_reason = Set AMERIFLUX_USER_ID and AMERIFLUX_USER_EMAIL (or --user-id/--user-email).")
        return 0

    payload = build_download_payload(args.site_id, args.user_id, args.user_email)
    download_response = fetch_json(DOWNLOAD_URL, method="POST", payload=payload)

    manifest = download_response.get("manifest") if isinstance(download_response.get("manifest"), dict) else {}
    data_urls = download_response.get("data_urls") if isinstance(download_response.get("data_urls"), list) else []

    print(f"manifest.number_of_sites_downloaded = {manifest.get('number_of_sites_downloaded')}")
    print(f"data_urls_count = {len(data_urls)}")

    if not data_urls:
        raise RuntimeError(f"No data_urls returned for {args.site_id}")

    first = data_urls[0] if isinstance(data_urls[0], dict) else {}
    first_url = str(first.get("url", "")).strip()
    if not first_url:
        raise RuntimeError("First data_urls entry missing url field")

    clean_first_url = first_url.split("?", 1)[0]
    print(f"first_data_url = {first_url}")
    print(f"first_data_url_clean = {clean_first_url}")
    print(f"first_data_url_is_zip = {clean_first_url.lower().endswith('.zip')}")

    if not clean_first_url.lower().endswith(".zip"):
        raise RuntimeError("First data URL path does not end with .zip")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
