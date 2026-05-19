#!/usr/bin/env python3
"""Refresh a cached ICOS-direct archive snapshot for the FLUXNET Data Explorer."""

from __future__ import annotations

import argparse
import csv
import functools
import hashlib
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

SPARQL_ENDPOINT = "https://meta.icos-cp.eu/sparql"
OBJECT_METADATA_BASE_URL = "https://meta.icos-cp.eu/objects/"
PROJECT_FLUXNET = "http://meta.icos-cp.eu/resources/projects/FLUXNET"
PROJECT_ICOS = "http://meta.icos-cp.eu/resources/projects/icos"
ARCHIVE_SPEC_URI = "http://meta.icos-cp.eu/resources/cpmeta/miscFluxnetArchiveProduct"
PRODUCT_SPEC_URI = "http://meta.icos-cp.eu/resources/cpmeta/miscFluxnetProduct"
ETC_ARCHIVE_SPEC_URI = "http://meta.icos-cp.eu/resources/cpmeta/etcArchiveProduct"
ICOS_SOURCE = "ICOS"
ICOS_SOURCE_ORIGIN = "icos_direct"
ICOS_SOURCE_PRIORITY = 300
PROCESSING_LINEAGE_ONEFLUX = "oneflux"
PROCESSING_LINEAGE_OTHER = "other_processed"
PRODUCT_FAMILY_CLASSIC = "classic_fluxnet_archive"
PRODUCT_FAMILY_ETC = "etc_l2_archive"
PRODUCT_FAMILY_OTHER = "other"
ICOS_DIRECT_SOURCE_REASON = (
    "Discovered directly from ICOS Carbon Portal archive metadata. "
    "Rows are selected per site before object metadata hydration."
)
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_RETRIES = 5
DEFAULT_RETRY_DELAY_SECONDS = 2.0

# Regression list from the missing-site report. This is validation-only, not discovery input.
EXPECTED_REGRESSION_SITE_IDS: Sequence[str] = (
    "AT-Neu",
    "IT-Lav",
    "IE-CaN",
    "IE-CaC",
    "CH-Oe2",
    "IT-BCi",
    "ES-LJu",
    "CH-Cha",
    "FR-Aur",
    "DE-Hte",
    "DE-SfS",
    "SE-St1",
    "DE-SfN",
    "CH-Frk",
    "SE-Ros",
    "IT-MtM",
    "IT-MtP",
    "SE-Lnn",
    "ES-Pdu",
    "DE-Dgw",
    "JP-Ozm",
    "ES-Abr",
    "IE-Gwr",
    "RU-Fy3",
    "DE-Hdn",
    "IE-Cra",
    "IT-Bsn",
    "EE-Pts",
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
    "object_id",
    "file_name",
    "direct_download_url",
    "metadata_url",
    "latest_version_url",
    "access_url",
    "object_spec",
    "project",
    "coverage_start",
    "coverage_end",
    "production_end",
    "citation",
)

YEAR_RANGE_RE = re.compile(r"_(\d{4})-(\d{4})(?:[_\.]|$)")
CURRENT_VERSION_RE = re.compile(r"_v(\d+(?:\.\d+)*)_r(\d+)", re.IGNORECASE)
BETA_VERSION_RE = re.compile(r"_beta[-_]?(\d+)", re.IGNORECASE)
RELEASE_VERSION_RE = re.compile(r"_(\d{4})_(\d+)-(\d+)(?:\.|_|$)", re.IGNORECASE)
RESOLUTION_PRODUCT_RE = re.compile(r"_(HH|HR|DD|WW|MM|YY|NRT)_", re.IGNORECASE)

# Query ICOS directly rather than a DOI proxy. DataCite only covers a DOI-backed subset and misses
# valid ICOS FLUXNET2015 rows such as AT-Neu, so discovery must start from the ICOS metadata source.
SPARQL_PREFIXES = """
prefix cpmeta: <http://meta.icos-cp.eu/ontologies/cpmeta/>
prefix prov: <http://www.w3.org/ns/prov#>
prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""

SPARQL_CLASSIC_DISCOVERY_QUERY = f"""
{SPARQL_PREFIXES}
select ?obj ?name ?spec ?project ?stationId
where {{
  ?obj cpmeta:hasObjectSpec ?spec ;
       cpmeta:hasName ?name ;
       cpmeta:wasAcquiredBy ?acq .
  ?spec cpmeta:hasAssociatedProject ?project .
  ?acq prov:wasAssociatedWith ?station .
  ?station cpmeta:hasStationId ?stationId .

  FILTER(?project = <{PROJECT_FLUXNET}>)
  FILTER(?spec IN (<{ARCHIVE_SPEC_URI}>, <{PRODUCT_SPEC_URI}>))
  FILTER(
    STRSTARTS(STR(?name), "FLX_")
    || CONTAINS(UCASE(STR(?name)), "FLUXNET2015_FULLSET")
    || CONTAINS(UCASE(STR(?name)), "_FLUXNET_")
  )
  FILTER(STRENDS(LCASE(STR(?name)), ".zip"))
}}
order by ?stationId ?name ?obj
"""

SPARQL_ETC_DISCOVERY_QUERY = f"""
{SPARQL_PREFIXES}
select ?obj ?name ?spec ?project ?stationId
where {{
  ?obj cpmeta:hasObjectSpec ?spec ;
       cpmeta:hasName ?name ;
       cpmeta:wasAcquiredBy ?acq .
  OPTIONAL {{ ?spec cpmeta:hasAssociatedProject ?project . }}
  ?acq prov:wasAssociatedWith ?station .
  ?station cpmeta:hasStationId ?stationId .

  FILTER(?spec = <{ETC_ARCHIVE_SPEC_URI}>)
  FILTER(STRENDS(LCASE(STR(?name)), ".zip"))
}}
order by ?stationId ?name ?obj
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-csv", required=True, help="Destination CSV path.")
    parser.add_argument("--output-json", required=True, help="Destination JSON path.")
    parser.add_argument(
        "--shuttle-csv",
        default="",
        help="Optional FLUXNET Shuttle CSV used for overlap/suppression diagnostics.",
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
        help=f"Maximum SPARQL retries per request (default: {DEFAULT_RETRIES}).",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=DEFAULT_RETRY_DELAY_SECONDS,
        help=f"Base retry delay in seconds (default: {DEFAULT_RETRY_DELAY_SECONDS}).",
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


def first_present(mapping: Dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def binding_value(binding: Dict[str, Any], key: str) -> str:
    value = binding.get(key)
    if not isinstance(value, dict):
        return ""
    raw = value.get("value")
    return str(raw).strip() if raw not in (None, "") else ""


def maybe_float(value: Any) -> Optional[float]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        number = float(raw)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def maybe_iso_to_year(value: str) -> Optional[int]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).year
    except ValueError:
        return None


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


def load_existing_meta(output_path: Path) -> Dict[str, Any]:
    if not output_path.exists():
        return {}
    try:
        payload = json.loads(output_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    meta = payload.get("meta")
    return meta if isinstance(meta, dict) else {}


def choose_snapshot_updated_fields(
    existing_meta: Dict[str, Any],
    version_value: str,
    requested_updated_at: str,
    requested_updated_date: str,
) -> Tuple[str, str]:
    existing_version = str(existing_meta.get("version") or "").strip()
    existing_updated_at = normalize_snapshot_updated_at(str(existing_meta.get("snapshot_updated_at") or ""))
    existing_updated_date = normalize_snapshot_updated_date(
        str(existing_meta.get("snapshot_updated_date") or ""),
        existing_updated_at,
    )
    if existing_version == version_value and existing_updated_at and existing_updated_date:
        return existing_updated_at, existing_updated_date

    updated_at = normalize_snapshot_updated_at(requested_updated_at)
    if not updated_at:
        updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    updated_date = normalize_snapshot_updated_date(requested_updated_date, updated_at)
    return updated_at, updated_date


def parse_year_range(file_name: str, start_iso: str, end_iso: str) -> Tuple[Optional[int], Optional[int]]:
    match = YEAR_RANGE_RE.search(file_name or "")
    if match:
        return int(match.group(1)), int(match.group(2))
    return maybe_iso_to_year(start_iso), maybe_iso_to_year(end_iso)


def parse_network_prefix(file_name: str, site_id: str) -> str:
    file_name = (file_name or "").strip()
    site_id = (site_id or "").strip()
    if not file_name:
        return ""
    if site_id and f"_{site_id}_" in file_name:
        return file_name.split(f"_{site_id}_", 1)[0].strip("_")
    return file_name.split("_", 1)[0]


def build_direct_download_url(object_id: str, file_name: str) -> str:
    encoded_ids = quote(json.dumps([object_id], ensure_ascii=True, separators=(",", ":")), safe="")
    encoded_file_name = quote(file_name, safe="")
    return f"https://data.icos-cp.eu/licence_accept?ids={encoded_ids}&fileName={encoded_file_name}"


def extract_object_id(metadata_url: str) -> str:
    raw = (metadata_url or "").strip().rstrip("/")
    if not raw:
        return ""
    return raw.rsplit("/", 1)[-1]


def is_resolution_product(file_name: str) -> bool:
    upper = (file_name or "").upper()
    return upper.endswith(".CSV.ZIP") or bool(RESOLUTION_PRODUCT_RE.search(upper))


def upper_text(value: Any) -> str:
    return str(value or "").strip().upper()


def normalize_url_reference(value: Any) -> str:
    return str(value or "").strip().rstrip("/")


def parse_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if raw in {"1", "true", "yes"}:
        return True
    if raw in {"0", "false", "no"}:
        return False
    return None


def classify_product_family(candidate: Dict[str, Any]) -> str:
    file_name_upper = upper_text(candidate.get("file_name"))
    title_upper = upper_text(candidate.get("title"))
    spec_label_upper = upper_text(candidate.get("object_spec_label"))
    spec_uri = str(candidate.get("object_spec") or "").strip()
    project_uri = str(candidate.get("project") or "").strip()

    if (
        spec_uri == ETC_ARCHIVE_SPEC_URI
        or "ETC L2 ARCHIVE" in spec_label_upper
        or "ETC L2 ARCHIVE" in title_upper
        or file_name_upper.startswith("ICOSETC_")
        or "ARCHIVE_L2" in file_name_upper
    ):
        return PRODUCT_FAMILY_ETC

    if (
        project_uri == PROJECT_FLUXNET
        or spec_uri in {ARCHIVE_SPEC_URI, PRODUCT_SPEC_URI}
        or file_name_upper.startswith("FLX_")
        or "FLUXNET2015_FULLSET" in file_name_upper
        or "_FLUXNET_" in file_name_upper
        or "FLUXNET" in title_upper
    ):
        return PRODUCT_FAMILY_CLASSIC

    return PRODUCT_FAMILY_OTHER


def processing_lineage_for_candidate(candidate: Dict[str, Any]) -> str:
    return PROCESSING_LINEAGE_OTHER if classify_product_family(candidate) == PRODUCT_FAMILY_ETC else PROCESSING_LINEAGE_ONEFLUX


def network_for_candidate(candidate: Dict[str, Any], site_id: str, file_name: str) -> str:
    if classify_product_family(candidate) == PRODUCT_FAMILY_ETC:
        return ICOS_SOURCE
    return parse_network_prefix(file_name, site_id)


def is_preferred_archive_candidate(candidate: Dict[str, Any]) -> bool:
    if classify_product_family(candidate) != PRODUCT_FAMILY_CLASSIC:
        return False
    file_name = str(candidate.get("file_name") or "")
    upper = file_name.upper()
    if candidate.get("object_spec") == ARCHIVE_SPEC_URI:
        return True
    if is_resolution_product(file_name):
        return False
    if "FULLSET" in upper:
        return True
    return "_FLUXNET_" in upper


def parse_version_rank(file_name: str) -> Tuple[int, Tuple[int, ...], int]:
    release = RELEASE_VERSION_RE.search(file_name or "")
    if release:
        return (
            3,
            (int(release.group(1)), int(release.group(2)), int(release.group(3))),
            0,
        )
    current = CURRENT_VERSION_RE.search(file_name or "")
    if current:
        return (
            2,
            tuple(int(part) for part in current.group(1).split(".")),
            int(current.group(2)),
        )
    beta = BETA_VERSION_RE.search(file_name or "")
    if beta:
        return (1, (int(beta.group(1)),), 0)
    return (0, tuple(), 0)


def coverage_rank(candidate: Dict[str, Any]) -> Tuple[int, int, int]:
    first_year = candidate.get("first_year")
    last_year = candidate.get("last_year")
    first_year = int(first_year) if isinstance(first_year, int) else 0
    last_year = int(last_year) if isinstance(last_year, int) else 0
    length = max(0, (last_year - first_year) + 1) if first_year and last_year and last_year >= first_year else 0
    earlier_start_bonus = (9999 - first_year) if first_year else 0
    return last_year, length, earlier_start_bonus


def canonical_name_bonus(candidate: Dict[str, Any]) -> Tuple[int, int]:
    upper = str(candidate.get("file_name") or "").upper()
    family = classify_product_family(candidate)
    if family == PRODUCT_FAMILY_ETC:
        return (
            1 if upper.startswith("ICOSETC_") else 0,
            1 if "ARCHIVE_L2" in upper else 0,
        )
    return (
        1 if upper.startswith("FLX_") else 0,
        1 if "FULLSET" in upper else 0,
    )


def family_rank(candidate: Dict[str, Any]) -> int:
    family = classify_product_family(candidate)
    if family == PRODUCT_FAMILY_CLASSIC:
        return 2
    if family == PRODUCT_FAMILY_ETC:
        return 1
    return 0


def metadata_version_rank(candidate: Dict[str, Any]) -> Tuple[int, int]:
    metadata_url = normalize_url_reference(candidate.get("metadata_url"))
    latest_version_url = normalize_url_reference(candidate.get("latest_version_url"))
    deprecated_flag = parse_bool(candidate.get("deprecated"))
    is_latest = bool(metadata_url and latest_version_url and metadata_url == latest_version_url)
    not_deprecated = deprecated_flag is False
    return (1 if is_latest else 0, 1 if not_deprecated else 0)


def compare_candidates(left: Dict[str, Any], right: Dict[str, Any]) -> int:
    ranked_pairs = (
        (family_rank(left), family_rank(right)),
        (1 if is_preferred_archive_candidate(left) else 0, 1 if is_preferred_archive_candidate(right) else 0),
        (metadata_version_rank(left), metadata_version_rank(right)),
        (parse_version_rank(str(left.get("file_name") or "")), parse_version_rank(str(right.get("file_name") or ""))),
        (coverage_rank(left), coverage_rank(right)),
        (canonical_name_bonus(left), canonical_name_bonus(right)),
        (str(left.get("production_end") or ""), str(right.get("production_end") or "")),
        (str(left.get("coverage_end") or ""), str(right.get("coverage_end") or "")),
    )
    for left_value, right_value in ranked_pairs:
        if left_value == right_value:
            continue
        return -1 if left_value > right_value else 1

    left_tail = (str(left.get("file_name") or ""), str(left.get("object_id") or ""))
    right_tail = (str(right.get("file_name") or ""), str(right.get("object_id") or ""))
    if left_tail < right_tail:
        return -1
    if left_tail > right_tail:
        return 1
    return 0


def choose_best_candidate(candidates: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not candidates:
        return None
    ordered = sorted(candidates, key=functools.cmp_to_key(compare_candidates))
    return ordered[0]


def load_shuttle_site_ids(path: str) -> set[str]:
    shuttle_path = Path(path)
    if not path or not shuttle_path.exists():
        return set()
    with shuttle_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        return {
            str(row.get("site_id") or "").strip()
            for row in reader
            if str(row.get("site_id") or "").strip()
        }


def dedupe_candidates(candidates: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for candidate in candidates:
        site_id = str(candidate.get("site_id") or "").strip()
        if not site_id:
            continue
        grouped.setdefault(site_id, []).append(candidate)

    chosen: List[Dict[str, Any]] = []
    for site_id in sorted(grouped):
        best = choose_best_candidate(grouped[site_id])
        if best is not None:
            chosen.append(best)
    return chosen


def shortlist_candidates_for_hydration(candidates: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for candidate in candidates:
        site_id = str(candidate.get("site_id") or "").strip()
        if not site_id:
            continue
        grouped.setdefault(site_id, []).append(candidate)

    shortlisted: List[Dict[str, Any]] = []
    for site_id in sorted(grouped):
        site_candidates = grouped[site_id]
        classic_candidates = [candidate for candidate in site_candidates if classify_product_family(candidate) == PRODUCT_FAMILY_CLASSIC]
        if classic_candidates:
            preferred_archives = [candidate for candidate in classic_candidates if is_preferred_archive_candidate(candidate)]
            shortlisted.extend(preferred_archives or classic_candidates)
            continue
        etc_candidates = [candidate for candidate in site_candidates if classify_product_family(candidate) == PRODUCT_FAMILY_ETC]
        shortlisted.extend(etc_candidates or site_candidates)
    return shortlisted


def normalize_csv_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.6f}".rstrip("0").rstrip(".")
    return str(value)


def write_csv(path: Path, rows: Sequence[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(OUTPUT_COLUMNS))
        writer.writeheader()
        for row in rows:
            writer.writerow({column: normalize_csv_value(row.get(column)) for column in OUTPUT_COLUMNS})


def write_json(
    path: Path,
    rows: Sequence[Dict[str, Any]],
    meta_extra: Dict[str, Any],
    snapshot_updated_at: str,
    snapshot_updated_date: str,
) -> str:
    payload_rows = [[row.get(column) for column in OUTPUT_COLUMNS] for row in rows]
    data_payload = {"columns": list(OUTPUT_COLUMNS), "rows": payload_rows}
    canonical_data_json = json.dumps(data_payload, ensure_ascii=True, separators=(",", ":"))
    version_hash = hashlib.sha256(canonical_data_json.encode("utf-8")).hexdigest()
    version_value = f"sha256:{version_hash}"
    existing_meta = load_existing_meta(path)
    updated_at, updated_date = choose_snapshot_updated_fields(
        existing_meta,
        version_value,
        snapshot_updated_at,
        snapshot_updated_date,
    )
    payload = {
        "meta": {
            "schema_version": 1,
            "version": version_value,
            "snapshot_refreshed_at": normalize_snapshot_updated_at(snapshot_updated_at) or updated_at,
            "snapshot_refreshed_date": normalize_snapshot_updated_date(snapshot_updated_date, snapshot_updated_at) or updated_date,
            "snapshot_updated_at": updated_at,
            "snapshot_updated_date": updated_date,
            **meta_extra,
        },
        "columns": list(OUTPUT_COLUMNS),
        "rows": payload_rows,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
    return version_hash


def sparql_post(query: str, timeout: int, retries: int, retry_delay: float, label: str = "") -> Dict[str, Any]:
    body = query.encode("utf-8")
    last_error: Optional[Exception] = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            request = Request(
                SPARQL_ENDPOINT,
                data=body,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "text/plain",
                    "User-Agent": "trevorkeenan.github.io/fluxnet-explorer-icos-refresh",
                },
                method="POST",
            )
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as err:
            detail = err.read().decode("utf-8", "replace")
            last_error = RuntimeError(f"HTTP {err.code}: {detail}")
            if attempt >= retries:
                break
            delay = min(30.0, retry_delay * (2 ** (attempt - 1)))
            if "per-minute query quota" in detail.lower():
                delay = max(65.0, delay)
            time.sleep(delay)
        except (URLError, TimeoutError, json.JSONDecodeError) as err:
            last_error = err
            if attempt >= retries:
                break
            time.sleep(min(30.0, retry_delay * (2 ** (attempt - 1))))
    detail = f" ({label})" if label else ""
    raise RuntimeError(f"ICOS SPARQL request failed after {retries} attempt(s){detail}: {last_error}")


def build_candidate(binding: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    metadata_url = binding_value(binding, "obj")
    object_id = extract_object_id(metadata_url)
    file_name = binding_value(binding, "name")
    site_id = binding_value(binding, "stationId")
    if not metadata_url or not object_id or not file_name or not site_id:
        return None

    first_year, last_year = parse_year_range(file_name, "", "")
    direct_download_url = build_direct_download_url(object_id, file_name)

    candidate = {
        "site_id": site_id,
        "site_name": site_id,
        "country": "",
        "data_hub": ICOS_SOURCE,
        "network": "",
        "source_network": "",
        "processing_lineage": PROCESSING_LINEAGE_ONEFLUX,
        "vegetation_type": "",
        "first_year": first_year,
        "last_year": last_year,
        "latitude": None,
        "longitude": None,
        "download_link": direct_download_url,
        "download_mode": "direct",
        "source": ICOS_SOURCE,
        "source_label": ICOS_SOURCE,
        "source_reason": ICOS_DIRECT_SOURCE_REASON,
        "source_priority": ICOS_SOURCE_PRIORITY,
        "source_origin": ICOS_SOURCE_ORIGIN,
        "object_id": object_id,
        "file_name": file_name,
        "direct_download_url": direct_download_url,
        "metadata_url": metadata_url,
        "access_url": f"https://data.icos-cp.eu/objects/{object_id}",
        "object_spec": binding_value(binding, "spec"),
        "project": binding_value(binding, "project"),
        "coverage_start": "",
        "coverage_end": "",
        "production_end": "",
        "citation": "",
        "title": "",
        "object_spec_label": "",
        "latest_version_url": "",
        "previous_version_url": "",
        "next_version_url": "",
        "deprecated": None,
    }
    network = network_for_candidate(candidate, site_id, file_name)
    candidate["network"] = network
    candidate["source_network"] = network
    candidate["processing_lineage"] = processing_lineage_for_candidate(candidate)
    return candidate


def first_present_nested(mapping: Any, *path: str) -> str:
    current = mapping
    for key in path:
        if not isinstance(current, dict):
            return ""
        current = current.get(key)
    if current in (None, ""):
        return ""
    return str(current).strip()


def load_object_metadata(object_id: str, timeout: int, retries: int, retry_delay: float) -> Dict[str, Any]:
    url = f"{OBJECT_METADATA_BASE_URL}{object_id}"
    last_error: Optional[Exception] = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            request = Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "trevorkeenan.github.io/fluxnet-explorer-icos-refresh",
                },
                method="GET",
            )
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as err:
            detail = err.read().decode("utf-8", "replace")
            last_error = RuntimeError(f"HTTP {err.code}: {detail}")
            if attempt >= retries:
                break
            time.sleep(min(30.0, retry_delay * (2 ** (attempt - 1))))
        except (URLError, TimeoutError, json.JSONDecodeError) as err:
            last_error = err
            if attempt >= retries:
                break
            time.sleep(min(30.0, retry_delay * (2 ** (attempt - 1))))
    raise RuntimeError(f"ICOS object metadata request failed after {retries} attempt(s) ({object_id}): {last_error}")


def hydrate_candidate_from_metadata(
    candidate: Dict[str, Any],
    timeout: int,
    retries: int,
    retry_delay: float,
) -> Dict[str, Any]:
    object_id = str(candidate.get("object_id") or "").strip()
    metadata = load_object_metadata(object_id, timeout, retries, retry_delay)
    acquisition = metadata.get("specificInfo", {}).get("acquisition", {})
    station = acquisition.get("station", {})
    station_location = station.get("location", {})
    station_org = station.get("org", {})
    station_specific = station.get("specificInfo", {})
    ecosystem = station_specific.get("ecosystemType", {})
    interval = acquisition.get("interval", {})
    references = metadata.get("references", {})
    submission = metadata.get("submission", {})
    specification = metadata.get("specification", {})

    file_name = first_present(metadata, "fileName") or str(candidate.get("file_name") or "")
    site_id = first_present(station, "id") or str(candidate.get("site_id") or "")
    coverage_start = first_present(interval, "start")
    coverage_end = first_present(interval, "stop")
    first_year, last_year = parse_year_range(file_name, coverage_start, coverage_end)
    direct_download_url = build_direct_download_url(object_id, file_name)
    metadata_url = first_present(candidate, "metadata_url") or f"{OBJECT_METADATA_BASE_URL}{object_id}"
    spec_uri = first_present_nested(specification, "self", "uri") or str(candidate.get("object_spec") or "")
    project_uri = first_present_nested(specification, "project", "self", "uri") or str(candidate.get("project") or "")
    references_title = first_present(references, "title") or str(candidate.get("title") or "")

    row = dict(candidate)
    row.update(
        {
            "file_name": file_name,
            "metadata_url": metadata_url,
            "object_spec": spec_uri,
            "project": project_uri,
            "title": references_title,
            "object_spec_label": first_present_nested(specification, "self", "label")
            or str(candidate.get("object_spec_label") or ""),
            "latest_version_url": first_present(metadata, "latestVersion")
            or str(candidate.get("latest_version_url") or ""),
            "previous_version_url": first_present(metadata, "previousVersion")
            or str(candidate.get("previous_version_url") or ""),
            "next_version_url": first_present(metadata, "nextVersion")
            or str(candidate.get("next_version_url") or ""),
            "deprecated": metadata.get("deprecated", candidate.get("deprecated")),
        }
    )
    network = network_for_candidate(row, site_id, file_name)
    row.update(
        {
            "site_id": site_id,
            "site_name": first_present(station_org, "name")
            or first_present(station_location, "label")
            or str(candidate.get("site_name") or "")
            or site_id,
            "country": first_present(station, "countryCode") or str(candidate.get("country") or ""),
            "network": network or str(candidate.get("network") or ""),
            "source_network": network or str(candidate.get("source_network") or ""),
            "processing_lineage": processing_lineage_for_candidate(row),
            "vegetation_type": first_present(ecosystem, "label") or str(candidate.get("vegetation_type") or ""),
            "first_year": first_year,
            "last_year": last_year,
            "latitude": maybe_float(first_present(station_location, "lat")),
            "longitude": maybe_float(first_present(station_location, "lon")),
            "download_link": direct_download_url,
            "object_id": object_id,
            "file_name": file_name,
            "direct_download_url": direct_download_url,
            "metadata_url": metadata_url,
            "access_url": first_present(metadata, "accessUrl") or str(candidate.get("access_url") or ""),
            "object_spec": spec_uri,
            "project": project_uri,
            "coverage_start": coverage_start,
            "coverage_end": coverage_end,
            "production_end": first_present(submission, "stop"),
            "citation": first_present(references, "citationString") or str(candidate.get("citation") or ""),
        }
    )
    return row


def hydrate_candidates(
    candidates: Sequence[Dict[str, Any]],
    timeout: int,
    retries: int,
    retry_delay: float,
) -> List[Dict[str, Any]]:
    hydrated: List[Dict[str, Any]] = []
    total = len(candidates)
    for index, candidate in enumerate(candidates, start=1):
        hydrated.append(hydrate_candidate_from_metadata(candidate, timeout, retries, retry_delay))
        if index == total or index % 25 == 0:
            print(f"ICOS object metadata hydrated: {index}/{total}", flush=True)
        time.sleep(0.05)
    return hydrated


def fetch_candidates(timeout: int, retries: int, retry_delay: float) -> Tuple[List[Dict[str, Any]], int]:
    # Root cause: a DOI/DataCite-based discovery path only covered a subset of ICOS FLUXNET files,
    # which dropped valid sites like AT-Neu before normalization or deduplication. Discovery now
    # starts from the complete ICOS metadata graph, then chosen rows are hydrated via object JSON.
    discovery_queries = (
        ("classic_fluxnet", SPARQL_CLASSIC_DISCOVERY_QUERY),
        ("etc_l2_archive", SPARQL_ETC_DISCOVERY_QUERY),
    )

    candidates: List[Dict[str, Any]] = []
    total_bindings = 0
    seen_object_ids: set[str] = set()
    for label, query in discovery_queries:
        payload = sparql_post(query, timeout, retries, retry_delay, label=label)
        bindings = payload.get("results", {}).get("bindings", [])
        total_bindings += len(bindings)
        print(f"ICOS discovery query rows ({label}): {len(bindings)}", flush=True)
        for binding in bindings:
            candidate = build_candidate(binding)
            if candidate is None:
                continue
            object_id = str(candidate.get("object_id") or "")
            if object_id in seen_object_ids:
                continue
            seen_object_ids.add(object_id)
            candidates.append(candidate)
    return candidates, total_bindings


def print_expected_site_stage(stage_label: str, site_ids: Iterable[str]) -> List[str]:
    normalized = {str(site_id).strip() for site_id in site_ids if str(site_id).strip()}
    present = [site_id for site_id in EXPECTED_REGRESSION_SITE_IDS if site_id in normalized]
    missing = [site_id for site_id in EXPECTED_REGRESSION_SITE_IDS if site_id not in normalized]
    print(f"{stage_label}: expected sites present {len(present)}/{len(EXPECTED_REGRESSION_SITE_IDS)}", flush=True)
    print(f"{stage_label} present: {', '.join(present) if present else '(none)'}", flush=True)
    print(f"{stage_label} missing: {', '.join(missing) if missing else '(none)'}", flush=True)
    return missing


def build_final_explorer_sources(
    shuttle_site_ids: set[str],
    icos_rows: Sequence[Dict[str, Any]],
) -> Dict[str, str]:
    sources: Dict[str, str] = {site_id: "Shuttle" for site_id in shuttle_site_ids}
    for row in icos_rows:
        site_id = str(row.get("site_id") or "").strip()
        if not site_id or site_id in sources:
            continue
        sources[site_id] = "ICOS-direct"
    return sources


def main() -> None:
    args = parse_args()
    output_csv = Path(args.output_csv)
    output_json = Path(args.output_json)
    shuttle_site_ids = load_shuttle_site_ids(args.shuttle_csv)

    raw_candidates, fetched_binding_count = fetch_candidates(
        timeout=max(1, args.timeout),
        retries=max(1, args.retries),
        retry_delay=max(0.1, args.retry_delay),
    )
    normalized_candidates = sorted(
        raw_candidates,
        key=lambda row: (str(row.get("site_id") or ""), str(row.get("file_name") or ""), str(row.get("object_id") or "")),
    )
    shortlisted_candidates = shortlist_candidates_for_hydration(normalized_candidates)
    hydrated_candidates = hydrate_candidates(
        shortlisted_candidates,
        timeout=max(1, args.timeout),
        retries=max(1, args.retries),
        retry_delay=max(0.1, args.retry_delay),
    )
    deduped_rows = dedupe_candidates(hydrated_candidates)
    deduped_rows = sorted(deduped_rows, key=lambda row: (str(row.get("site_id") or ""), str(row.get("file_name") or "")))
    final_icos_rows = [row for row in deduped_rows if str(row.get("site_id") or "") not in shuttle_site_ids]
    final_explorer_sources = build_final_explorer_sources(shuttle_site_ids, deduped_rows)

    fetched_site_ids = {str(row.get("site_id") or "") for row in raw_candidates}
    normalized_site_ids = {str(row.get("site_id") or "") for row in normalized_candidates}
    shortlisted_site_ids = {str(row.get("site_id") or "") for row in shortlisted_candidates}
    hydrated_site_ids = {str(row.get("site_id") or "") for row in hydrated_candidates}
    deduped_site_ids = {str(row.get("site_id") or "") for row in deduped_rows}
    final_icos_site_ids = {str(row.get("site_id") or "") for row in final_icos_rows}

    print(f"ICOS FLUXNET rows fetched: {fetched_binding_count}", flush=True)
    print(f"ICOS unique site IDs after fetch: {len(fetched_site_ids)}", flush=True)
    print_expected_site_stage("After fetch", fetched_site_ids)
    print(f"ICOS rows after normalization: {len(normalized_candidates)}", flush=True)
    print(f"ICOS unique site IDs after normalization: {len(normalized_site_ids)}", flush=True)
    print_expected_site_stage("After normalization", normalized_site_ids)
    print(f"ICOS rows shortlisted for metadata hydration: {len(shortlisted_candidates)}", flush=True)
    print_expected_site_stage("After hydration shortlist", shortlisted_site_ids)
    print(f"ICOS rows after metadata hydration: {len(hydrated_candidates)}", flush=True)
    print_expected_site_stage("After metadata hydration", hydrated_site_ids)
    print(f"ICOS rows after per-site deduplication: {len(deduped_rows)}", flush=True)
    print_expected_site_stage("After deduplication", deduped_site_ids)
    print(f"ICOS rows after Shuttle precedence suppression: {len(final_icos_rows)}", flush=True)
    print_expected_site_stage("After ICOS manifest emission", final_icos_site_ids)

    final_missing = [site_id for site_id in EXPECTED_REGRESSION_SITE_IDS if site_id not in final_explorer_sources]
    print(f"Final explorer site count (Shuttle + ICOS-direct before AmeriFlux fallbacks): {len(final_explorer_sources)}", flush=True)
    print(
        "Final explorer sources for expected sites: "
        + ", ".join(f"{site_id}={final_explorer_sources.get(site_id, 'MISSING')}" for site_id in EXPECTED_REGRESSION_SITE_IDS),
        flush=True,
    )
    if final_missing:
        raise RuntimeError(
            "Expected ICOS/Shuttle sites missing from final explorer data: " + ", ".join(final_missing)
        )

    write_csv(output_csv, deduped_rows)
    suppressed_by_shuttle = len(deduped_rows) - len(final_icos_rows)
    version_hash = write_json(
        output_json,
        deduped_rows,
        meta_extra={
            "discovery_method": "ICOS SPARQL metadata query",
            "sparql_endpoint": SPARQL_ENDPOINT,
            "fetched_binding_rows": fetched_binding_count,
            "fetched_unique_site_ids": len(fetched_site_ids),
            "normalized_rows": len(normalized_candidates),
            "normalized_unique_site_ids": len(normalized_site_ids),
            "retained_rows_after_dedup": len(deduped_rows),
            "suppressed_by_shuttle": suppressed_by_shuttle,
            "final_rows_after_precedence": len(final_icos_rows),
            "projects": [PROJECT_FLUXNET, PROJECT_ICOS],
            "product_families": [PRODUCT_FAMILY_CLASSIC, PRODUCT_FAMILY_ETC],
        },
        snapshot_updated_at=args.snapshot_updated_at,
        snapshot_updated_date=args.snapshot_updated_date,
    )

    print(f"Wrote ICOS-direct CSV: {output_csv}")
    print(f"Wrote ICOS-direct JSON: {output_json}")
    print(f"Version: sha256:{version_hash}")


if __name__ == "__main__":
    main()
