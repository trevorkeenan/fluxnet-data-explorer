#!/usr/bin/env python3
"""Build a curated static EFD site inventory for known data records."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

SITES_LIST_URL = "https://www.europe-fluxdata.eu/home/sites-list"
REQUEST_PAGE_URL = "https://www.europe-fluxdata.eu/home/data/request-data"
DATA_POLICY_URL = "https://www.europe-fluxdata.eu/home/data/data-policy"
GUIDELINES_URL = "https://www.europe-fluxdata.eu/home/guidelines/obtaining-data/general-information"
PUBLIC_SITE_JSON_URL = "https://www.europe-fluxdata.eu/GService.asmx/getSites"
PUBLIC_SITE_CSV_URL = "https://gaia.agraria.unitus.it/homeData/SitesList.csv"
SITE_DETAILS_URL_TEMPLATE = "https://www.europe-fluxdata.eu/home/site-details?id={site_id}"
USER_AGENT = "trevorkeenan.github.io/fluxnet-explorer-efd-curation"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_RETRIES = 5
DEFAULT_RETRY_DELAY_SECONDS = 2.0
DEFAULT_WORKERS = 4

EFD_SOURCE = "EFD"
EFD_SOURCE_ORIGIN = "efd"
EFD_SOURCE_PRIORITY = 50
REQUEST_PAGE_DOWNLOAD_MODE = "request_page"
EFD_SOURCE_REASON = (
    "Known EFD data record based on the public EFD site details and data-policy pages. "
    "Access remains request-based via EFD; some data may require PI approval or PI contact, "
    "and current direct download is not implied."
)

OUTPUT_COLUMNS: Sequence[str] = (
    "site_id",
    "site_name",
    "country",
    "data_hub",
    "network",
    "source_network",
    "processing_lineage",
    "vegetation_type",
    "first_year",
    "last_year",
    "latitude",
    "longitude",
    "download_link",
    "download_mode",
    "source",
    "source_label",
    "source_reason",
    "source_priority",
    "source_origin",
    "flux_list",
    "access_label",
    "data_use_label",
    "request_page_url",
    "site_page_url",
    "sites_list_url",
    "guidelines_url",
    "data_policy_url",
    "known_data_record",
    "efd_access_summary",
    "efd_policy_year_count",
    "efd_policy_years",
    "efd_policy_first_year",
    "efd_policy_last_year",
    "efd_provenance",
    "last_updated",
)

DETAIL_LABEL_RE = re.compile(r"<b>\s*([^<:]+?)\s*:\s*</b>\s*(.*?)<br\s*/?>", re.IGNORECASE | re.DOTALL)
TABLE_RE = re.compile(r"<table[^>]*class=(?:\"|')tabInfo(?:\"|')[^>]*>.*?</table>", re.IGNORECASE | re.DOTALL)
ROW_RE = re.compile(r"<tr[^>]*class=(?:\"|')innerTr(?:\"|')[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.IGNORECASE | re.DOTALL)
POLICY_HEADER_RE = re.compile(r"\bYEAR\b.*\bDATA ACCESS\b.*\bDATA USE\b", re.IGNORECASE | re.DOTALL)
COORDINATE_RE = re.compile(r"([-+]?\d+(?:\.\d+)?)\s*\(lat\)\s*/\s*([-+]?\d+(?:\.\d+)?)\s*\((?:long|lon)\)", re.IGNORECASE)
YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
POLICY_EMPTY_VALUES = {"", "-", "--", "n/a", "na", "none", "null", "not available", "unknown"}
RESTRICTED_ACCESS_TERMS = ("private", "restricted", "approval", "contact", "closed", "pi")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-csv", required=True, help="Destination CSV path.")
    parser.add_argument("--output-json", required=True, help="Destination JSON path.")
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
        default=DEFAULT_WORKERS,
        help=f"Concurrent EFD detail-page workers (default: {DEFAULT_WORKERS}).",
    )
    parser.add_argument(
        "--snapshot-updated-at",
        default="",
        help="Snapshot refresh timestamp in ISO-8601 form.",
    )
    parser.add_argument(
        "--snapshot-updated-date",
        default="",
        help="Snapshot refresh date in YYYY-MM-DD form.",
    )
    return parser.parse_args()


def clean_string(value: Any) -> str:
    raw = unescape(str(value if value is not None else "")).replace("\xa0", " ")
    raw = re.sub(r"\s+", " ", raw).strip()
    if not raw or raw.upper() == "NULL":
        return ""
    return raw


def clean_html_fragment(value: Any) -> str:
    raw = unescape(str(value if value is not None else "")).replace("\xa0", " ")
    raw = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = re.sub(r"[ \t\r\f\v]+", " ", raw)
    raw = re.sub(r"\n+", "\n", raw)
    return clean_string(raw.replace("\n", " "))


def normalize_policy_value(value: Any) -> str:
    raw = clean_html_fragment(value).strip()
    if raw.casefold() in POLICY_EMPTY_VALUES:
        return ""
    return raw


def derive_country(site_id: str) -> str:
    raw = clean_string(site_id)
    if not raw:
        return ""
    if "-" in raw:
        return raw.split("-", 1)[0].upper()
    if "_" in raw:
        return raw.split("_", 1)[0].upper()
    return raw[:2].upper()


def maybe_float(value: Any) -> str:
    raw = clean_string(value)
    if not raw:
        return ""
    try:
        number = float(raw)
    except ValueError:
        return ""
    return str(number)


def split_html_tokens(value: Any) -> List[str]:
    raw = unescape(str(value if value is not None else "")).replace("\xa0", " ")
    if not raw:
        return []
    normalized = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    normalized = normalized.replace("|", "\n")
    normalized = normalized.replace("\r", "\n")
    normalized = re.sub(r"<[^>]+>", " ", normalized)
    normalized = re.sub(r"\n+", "\n", normalized)
    tokens: List[str] = []
    seen = set()
    for piece in normalized.split("\n"):
        token = clean_string(piece).strip(" \"'")
        if not token:
            continue
        key = token.casefold()
        if key in seen:
            continue
        seen.add(key)
        tokens.append(token)
    return tokens


def join_tokens(tokens: Iterable[str]) -> str:
    cleaned: List[str] = []
    seen = set()
    for token in tokens:
        value = clean_string(token).strip(" \"'")
        if not value:
            continue
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(value)
    return "; ".join(cleaned)


def extract_entry_names(entries: Any) -> List[str]:
    names: List[str] = []
    if not isinstance(entries, list):
        return names
    for entry in entries:
        if isinstance(entry, dict):
            name = clean_string(entry.get("Name"))
            if name:
                names.append(name)
    return names


def normalize_multivalue(value: Any, fallback_entries: Any = None) -> str:
    tokens = split_html_tokens(value)
    if not tokens:
        tokens = extract_entry_names(fallback_entries)
    return join_tokens(tokens)


def normalize_flux_list(raw_value: Any, fallback_entries: Any = None) -> str:
    tokens = split_html_tokens(raw_value)
    if not tokens:
        tokens = extract_entry_names(fallback_entries)
    return join_tokens(tokens)


def normalize_site_id(value: Any) -> str:
    return clean_string(value)


def site_detail_url(site_id: str) -> str:
    return SITE_DETAILS_URL_TEMPLATE.format(site_id=quote(clean_string(site_id), safe=""))


def score_row(row: Dict[str, Any]) -> Tuple[int, int]:
    populated = 0
    for key in (
        "site_name",
        "network",
        "vegetation_type",
        "flux_list",
        "access_label",
        "data_use_label",
        "latitude",
        "longitude",
        "known_data_record",
        "efd_policy_year_count",
        "efd_policy_years",
        "site_page_url",
    ):
        if clean_string(row.get(key)):
            populated += 1
    return populated, len(clean_string(row.get("flux_list")))


def build_site_row(raw: Dict[str, Any], last_updated: str) -> Optional[Dict[str, Any]]:
    site_id = normalize_site_id(raw.get("Code") or raw.get("site_id"))
    if not site_id:
        return None

    network = normalize_multivalue(raw.get("Networks"), raw.get("lNet"))
    row: Dict[str, Any] = {
        "site_id": site_id,
        "site_name": clean_string(raw.get("Name") or raw.get("site_name")),
        "country": clean_string(raw.get("Country")) or derive_country(site_id),
        "data_hub": EFD_SOURCE,
        "network": network,
        "source_network": network,
        "processing_lineage": "",
        "vegetation_type": clean_string(raw.get("Igbp") or raw.get("vegetation_type")),
        "first_year": "",
        "last_year": "",
        "latitude": maybe_float(raw.get("Latitude") or raw.get("latitude")),
        "longitude": maybe_float(raw.get("Longitude") or raw.get("longitude")),
        "download_link": REQUEST_PAGE_URL,
        "download_mode": REQUEST_PAGE_DOWNLOAD_MODE,
        "source": EFD_SOURCE,
        "source_label": EFD_SOURCE,
        "source_reason": EFD_SOURCE_REASON,
        "source_priority": str(EFD_SOURCE_PRIORITY),
        "source_origin": EFD_SOURCE_ORIGIN,
        "flux_list": normalize_flux_list(raw.get("FluxList") or raw.get("flux_list"), raw.get("mFlux")),
        "access_label": normalize_multivalue(raw.get("Access")),
        "data_use_label": normalize_multivalue(raw.get("DataUse")),
        "request_page_url": REQUEST_PAGE_URL,
        "site_page_url": site_detail_url(site_id),
        "sites_list_url": SITES_LIST_URL,
        "guidelines_url": GUIDELINES_URL,
        "data_policy_url": DATA_POLICY_URL,
        "known_data_record": "",
        "efd_access_summary": "",
        "efd_policy_year_count": "",
        "efd_policy_years": "",
        "efd_policy_first_year": "",
        "efd_policy_last_year": "",
        "efd_provenance": "",
        "last_updated": last_updated,
    }
    return row


def build_site_row_from_csv(raw: Dict[str, Any], last_updated: str) -> Optional[Dict[str, Any]]:
    site_id = normalize_site_id(raw.get("Site Code") or raw.get("site_id"))
    if not site_id:
        return None
    mapped = {
        "Code": site_id,
        "Name": clean_string(raw.get("Site Name")),
        "Country": clean_string(raw.get("Country")),
        "Igbp": clean_string(raw.get("IGBP Code")),
        "Latitude": clean_string(raw.get("Site Latitude")),
        "Longitude": clean_string(raw.get("Site Longitude")),
        "FluxList": clean_string(raw.get("Fluxes")),
    }
    return build_site_row(mapped, last_updated)


def dedupe_site_rows(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    chosen: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        site_id = normalize_site_id(row.get("site_id"))
        if not site_id:
            continue
        existing = chosen.get(site_id)
        if existing is None or score_row(row) > score_row(existing):
            chosen[site_id] = dict(row, site_id=site_id)
    return [chosen[site_id] for site_id in sorted(chosen)]


def load_existing_meta(output_path: Path) -> Dict[str, Any]:
    if not output_path.exists():
        return {}
    try:
        payload = json.loads(output_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    meta = payload.get("meta")
    return meta if isinstance(meta, dict) else {}


def normalize_snapshot_updated_at(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_snapshot_updated_date(value: str, fallback_at: str = "") -> str:
    raw = (value or "").strip()
    if raw and re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return raw
    fallback = normalize_snapshot_updated_at(fallback_at)
    if fallback:
        return fallback.split("T", 1)[0]
    return ""


def choose_snapshot_updated_fields(
    existing_meta: Dict[str, Any],
    version_value: str,
    requested_updated_at: str,
    requested_updated_date: str,
) -> Tuple[str, str]:
    existing_version = clean_string(existing_meta.get("version"))
    existing_updated_at = normalize_snapshot_updated_at(clean_string(existing_meta.get("snapshot_updated_at")))
    existing_updated_date = normalize_snapshot_updated_date(
        clean_string(existing_meta.get("snapshot_updated_date")),
        existing_updated_at,
    )
    if existing_version == version_value and existing_updated_at and existing_updated_date:
        return existing_updated_at, existing_updated_date

    updated_at = normalize_snapshot_updated_at(requested_updated_at)
    if not updated_at:
        updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    updated_date = normalize_snapshot_updated_date(requested_updated_date, updated_at)
    return updated_at, updated_date


def fetch_json_with_retry(
    url: str,
    payload: Dict[str, Any],
    timeout: int,
    retries: int,
    retry_delay: float,
) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
    }
    errors: List[str] = []
    for attempt in range(1, max(1, retries) + 1):
        try:
            request = Request(url, data=body, headers=headers, method="POST")
            with urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except (HTTPError, URLError, json.JSONDecodeError) as exc:
            errors.append(f"attempt {attempt}: {exc}")
            if attempt >= max(1, retries):
                break
            time.sleep(retry_delay * attempt)
    raise RuntimeError(f"Failed to fetch EFD public site JSON from {url}: {'; '.join(errors)}")


def fetch_text_with_retry(
    url: str,
    timeout: int,
    retries: int,
    retry_delay: float,
    accept: str = "text/csv,text/plain,*/*",
) -> str:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": accept,
    }
    errors: List[str] = []
    for attempt in range(1, max(1, retries) + 1):
        try:
            request = Request(url, headers=headers, method="GET")
            with urlopen(request, timeout=timeout) as response:
                return response.read().decode("utf-8-sig", errors="replace")
        except (HTTPError, URLError, UnicodeDecodeError) as exc:
            errors.append(f"attempt {attempt}: {exc}")
            if attempt >= max(1, retries):
                break
            time.sleep(retry_delay * attempt)
    raise RuntimeError(f"Failed to fetch text from {url}: {'; '.join(errors)}")


def fetch_site_detail_html_with_retry(
    site_id: str,
    timeout: int,
    retries: int,
    retry_delay: float,
) -> str:
    return fetch_text_with_retry(
        site_detail_url(site_id),
        timeout,
        retries,
        retry_delay,
        accept="text/html,application/xhtml+xml,*/*;q=0.8",
    )


def parse_public_site_json(payload: Dict[str, Any], last_updated: str) -> List[Dict[str, Any]]:
    rows = payload.get("d")
    if not isinstance(rows, list):
        raise RuntimeError("Unexpected EFD site JSON payload shape: missing list at key 'd'.")
    parsed = [build_site_row(row, last_updated) for row in rows if isinstance(row, dict)]
    return dedupe_site_rows([row for row in parsed if row])


def parse_public_site_csv(text: str, last_updated: str) -> List[Dict[str, Any]]:
    reader = csv.DictReader(text.splitlines())
    parsed = [build_site_row_from_csv(row, last_updated) for row in reader]
    return dedupe_site_rows([row for row in parsed if row])


def load_public_site_rows(
    last_updated: str,
    timeout: int,
    retries: int,
    retry_delay: float,
) -> Tuple[List[Dict[str, Any]], str]:
    try:
        payload = fetch_json_with_retry(
            PUBLIC_SITE_JSON_URL,
            {"st": {"RefProj": 0}},
            timeout,
            retries,
            retry_delay,
        )
        return parse_public_site_json(payload, last_updated), ""
    except Exception as primary_error:
        csv_text = fetch_text_with_retry(PUBLIC_SITE_CSV_URL, timeout, retries, retry_delay)
        rows = parse_public_site_csv(csv_text, last_updated)
        warning = (
            "Used the public EFD CSV export fallback because the public JSON endpoint "
            f"was unavailable: {primary_error}"
        )
        return rows, warning


def extract_detail_labels(html: str) -> Dict[str, str]:
    labels: Dict[str, str] = {}
    for label_html, value_html in DETAIL_LABEL_RE.findall(html or ""):
        label = clean_string(label_html).casefold()
        value = clean_html_fragment(value_html)
        if label and value and label not in labels:
            labels[label] = value
    return labels


def extract_policy_rows(html: str) -> List[Dict[str, str]]:
    for table_html in TABLE_RE.findall(html or ""):
        header_match = re.search(r"<tr[^>]*class=(?:\"|')flTit(?:\"|')[^>]*>(.*?)</tr>", table_html, re.IGNORECASE | re.DOTALL)
        header_text = clean_html_fragment(header_match.group(1)) if header_match else ""
        if not POLICY_HEADER_RE.search(header_text):
            continue
        parsed_rows: List[Dict[str, str]] = []
        for row_html in ROW_RE.findall(table_html):
            cells = CELL_RE.findall(row_html)
            if len(cells) < 3:
                continue
            parsed_rows.append(
                {
                    "year": normalize_policy_year(cells[0]),
                    "access": normalize_policy_value(cells[1]),
                    "data_use": normalize_policy_value(cells[2]),
                }
            )
        return parsed_rows
    return []


def normalize_policy_year(value: Any) -> str:
    match = YEAR_RE.search(clean_html_fragment(value))
    return match.group(0) if match else ""


def parse_detail_coordinates(value: Any) -> Tuple[str, str]:
    match = COORDINATE_RE.search(clean_html_fragment(value))
    if not match:
        return "", ""
    return maybe_float(match.group(1)), maybe_float(match.group(2))


def policy_row_has_evidence(row: Dict[str, str]) -> bool:
    year = clean_string(row.get("year"))
    access = normalize_policy_value(row.get("access"))
    data_use = normalize_policy_value(row.get("data_use"))
    return bool(year and (access or data_use))


def classify_access_value(value: str) -> str:
    normalized = clean_string(value).casefold()
    if not normalized:
        return ""
    has_public = "public" in normalized
    has_restricted = any(term in normalized for term in RESTRICTED_ACCESS_TERMS)
    if has_public and not has_restricted:
        return "public"
    if has_restricted and not has_public:
        return "restricted"
    if has_public and has_restricted:
        return "unknown"
    return "unknown"


def summarize_access_rows(rows: Sequence[Dict[str, str]]) -> str:
    categories = {classify_access_value(row.get("access", "")) for row in rows}
    categories.discard("")
    if not categories or categories == {"unknown"}:
        return "unknown"
    if categories == {"public"}:
        return "public"
    if categories == {"restricted"}:
        return "restricted"
    if "public" in categories and "restricted" in categories:
        return "mixed"
    return "unknown"


def build_provenance_text(snapshot_updated_at: str) -> str:
    snapshot_date = normalize_snapshot_updated_date("", snapshot_updated_at) or "unknown date"
    return f"Derived from the public EFD site-details pages and year-by-year data-policy tables on {snapshot_date}."


def build_curated_site_row(base_row: Dict[str, Any], detail_html: str, last_updated: str) -> Optional[Dict[str, Any]]:
    if not base_row:
        return None
    policy_rows = extract_policy_rows(detail_html)
    evidence_rows = [row for row in policy_rows if policy_row_has_evidence(row)]
    if not evidence_rows:
        return None

    labels = extract_detail_labels(detail_html)
    years = sorted({int(row["year"]) for row in evidence_rows if row.get("year")})
    access_values = join_tokens(row.get("access", "") for row in evidence_rows)
    data_use_values = join_tokens(row.get("data_use", "") for row in evidence_rows)
    row = dict(base_row)

    if labels.get("site name"):
        row["site_name"] = labels["site name"]
    if labels.get("igbp"):
        row["vegetation_type"] = labels["igbp"]
    if (not row.get("latitude") or not row.get("longitude")) and labels.get("site coordinates"):
        latitude, longitude = parse_detail_coordinates(labels["site coordinates"])
        if latitude and not row.get("latitude"):
            row["latitude"] = latitude
        if longitude and not row.get("longitude"):
            row["longitude"] = longitude

    row["access_label"] = access_values
    row["data_use_label"] = data_use_values
    row["source_reason"] = EFD_SOURCE_REASON
    row["site_page_url"] = site_detail_url(row.get("site_id", ""))
    row["known_data_record"] = "true"
    row["first_year"] = str(years[0]) if years else ""
    row["last_year"] = str(years[-1]) if years else ""
    row["efd_access_summary"] = summarize_access_rows(evidence_rows)
    row["efd_policy_year_count"] = str(len(years))
    row["efd_policy_years"] = "; ".join(str(year) for year in years)
    row["efd_policy_first_year"] = str(min(years)) if years else ""
    row["efd_policy_last_year"] = str(max(years)) if years else ""
    row["efd_provenance"] = build_provenance_text(last_updated)
    row["last_updated"] = last_updated
    return row


def curate_public_site_rows(
    rows: Sequence[Dict[str, Any]],
    last_updated: str,
    timeout: int,
    retries: int,
    retry_delay: float,
    workers: int,
) -> List[Dict[str, Any]]:
    curated: List[Dict[str, Any]] = []
    failures: List[str] = []
    max_workers = max(1, int(workers or 1))
    base_rows = [dict(row) for row in (rows or [])]

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(
                fetch_site_detail_html_with_retry,
                clean_string(row.get("site_id")),
                timeout,
                retries,
                retry_delay,
            ): row
            for row in base_rows
            if clean_string(row.get("site_id"))
        }
        for future in as_completed(future_map):
            row = future_map[future]
            site_id = clean_string(row.get("site_id"))
            try:
                detail_html = future.result()
            except Exception as exc:
                failures.append(f"{site_id}: {exc}")
                continue
            curated_row = build_curated_site_row(row, detail_html, last_updated)
            if curated_row:
                curated.append(curated_row)

    if failures:
        sample = "; ".join(failures[:10])
        if len(failures) > 10:
            sample += f"; ... ({len(failures) - 10} more)"
        raise RuntimeError(f"Failed to fetch one or more EFD site-detail pages: {sample}")

    return dedupe_site_rows(curated)


def build_version_payload(records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    version_columns = [column for column in OUTPUT_COLUMNS if column != "last_updated"]
    return {
        "columns": version_columns,
        "rows": [[record.get(column, "") for column in version_columns] for record in records],
    }


def write_csv(path: Path, records: Sequence[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(OUTPUT_COLUMNS))
        writer.writeheader()
        writer.writerows(records)


def write_json(
    path: Path,
    records: Sequence[Dict[str, Any]],
    snapshot_updated_at: str,
    snapshot_updated_date: str,
    snapshot_refreshed_at: str,
    snapshot_refreshed_date: str,
    version_value: str,
) -> None:
    columns = list(OUTPUT_COLUMNS)
    payload = {
        "meta": {
            "schema_version": 1,
            "version": version_value,
            "snapshot_refreshed_at": snapshot_refreshed_at,
            "snapshot_refreshed_date": snapshot_refreshed_date,
            "snapshot_updated_at": snapshot_updated_at,
            "snapshot_updated_date": snapshot_updated_date,
        },
        "columns": columns,
        "rows": [[record.get(column, "") for column in columns] for record in records],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    args = parse_args()
    output_csv = Path(args.output_csv)
    output_json = Path(args.output_json)

    provisional_updated_at = normalize_snapshot_updated_at(args.snapshot_updated_at)
    if not provisional_updated_at:
        provisional_updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    public_rows, warning = load_public_site_rows(
        provisional_updated_at,
        args.timeout,
        args.retries,
        args.retry_delay,
    )
    if not public_rows:
        raise RuntimeError("Refusing to curate an empty EFD site inventory.")

    curated_rows = curate_public_site_rows(
        public_rows,
        provisional_updated_at,
        args.timeout,
        args.retries,
        args.retry_delay,
        args.workers,
    )
    if not curated_rows:
        raise RuntimeError("Refusing to write empty curated EFD snapshot.")

    version_payload = build_version_payload(curated_rows)
    canonical_data = json.dumps(version_payload, ensure_ascii=True, separators=(",", ":"))
    version_hash = hashlib.sha256(canonical_data.encode("utf-8")).hexdigest()
    version_value = f"sha256:{version_hash}"

    existing_meta = load_existing_meta(output_json)
    snapshot_updated_at, snapshot_updated_date = choose_snapshot_updated_fields(
        existing_meta,
        version_value,
        args.snapshot_updated_at,
        args.snapshot_updated_date,
    )

    finalized_records = [dict(record, last_updated=snapshot_updated_at) for record in curated_rows]
    write_csv(output_csv, finalized_records)
    snapshot_refreshed_at = normalize_snapshot_updated_at(args.snapshot_updated_at) or snapshot_updated_at
    snapshot_refreshed_date = normalize_snapshot_updated_date(args.snapshot_updated_date, args.snapshot_updated_at) or snapshot_updated_date
    write_json(
        output_json,
        finalized_records,
        snapshot_updated_at,
        snapshot_updated_date,
        snapshot_refreshed_at,
        snapshot_refreshed_date,
        version_value,
    )

    print(f"Loaded {len(public_rows)} public EFD catalog rows")
    print(f"Wrote {len(finalized_records)} curated EFD rows with known data records")
    print(f"CSV: {output_csv}")
    print(f"JSON: {output_json}")
    print(f"Version: {version_value}")
    if warning:
        print(f"Warning: {warning}")


if __name__ == "__main__":
    main()
