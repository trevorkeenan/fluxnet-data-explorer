#!/usr/bin/env python3
"""Build lightweight FLUXNET Shuttle preview artifacts from Shuttle products.

The Explorer frontend reads static preview artifacts shaped like:

  fluxnet-preview/v1/
    manifest.json
    sites/SITE_ID/manifest.json
    sites/SITE_ID/monthly.json
    sites/SITE_ID/weekly.json
    sites/SITE_ID/daily.json
    sites/SITE_ID/annual.json

This builder reads the committed Shuttle snapshot/catalog, downloads only the
selected products that need rebuilding, and extracts preview records directly
from the requested FLUXMET resolution files inside each Shuttle zip. It never
derives one resolution from another and ignores ERA5 and BIF data files.
"""

from __future__ import annotations

import argparse
import calendar
import csv
import hashlib
import http.cookiejar
import io
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple


SCHEMA_VERSION = 1
SOURCE_LABEL = "FLUXNET Shuttle"
MONTHLY_RESOLUTION = "monthly"
WEEKLY_RESOLUTION = "weekly"
DAILY_RESOLUTION = "daily"
ANNUAL_RESOLUTION = "annual"
RESOLUTION_CONFIG: Dict[str, Dict[str, str]] = {
    MONTHLY_RESOLUTION: {"code": "MM", "output": "monthly.json", "dateFormat": "YYYY-MM"},
    WEEKLY_RESOLUTION: {"code": "WW", "output": "weekly.json", "dateFormat": "YYYY-MM-DD"},
    DAILY_RESOLUTION: {"code": "DD", "output": "daily.json", "dateFormat": "YYYY-MM-DD"},
    ANNUAL_RESOLUTION: {"code": "YY", "output": "annual.json", "dateFormat": "YYYY-01-01"},
}
GLOBAL_MANIFEST_FILENAME = "manifest.json"
SITE_MANIFEST_FILENAME = "manifest.json"
DOWNLOAD_TIMEOUT_SECONDS = 60
DOWNLOAD_RETRIES = 2
RETRY_DELAY_SECONDS = 2.0
USER_AGENT = "FLUXNET-Data-Explorer-preview-builder/1.0"
ICOS_HOST = "data.icos-cp.eu"
ICOS_CPAUTH_TOKEN_ENV = "ICOS_CPAUTH_TOKEN"
ICOS_OBJECT_URL_PREFIX = "https://data.icos-cp.eu/objects/"
REQUIRES_ICOS_LICENSE_REASON = "requires_icos_license_acceptance_or_auth"
ICOS_UNAUTHENTICATED_SUCCESS_REASON = "unauthenticated ICOS licence_accept download succeeded"
FILL_VALUES = {"", "NA", "NAN", "NULL", "NONE", "-9999", "-9999.0", "-9999.00", "-6999", "-6999.0"}
NOTICE_TEXT = (
    "This is a lightweight visualization preview of a subset of the data available. "
    "For analysis, download the full official data product."
)

STANDARD_TARGET_VARIABLES = [
    "GPP_NT_VUT_REF",
    "GPP_NT_CUT_REF",
    "GPP_DT_VUT_REF",
    "GPP_DT_CUT_REF",
    "NEE_VUT_REF",
    "NEE_CUT_REF",
    "RECO_NT_VUT_REF",
    "RECO_NT_CUT_REF",
    "RECO_DT_VUT_REF",
    "RECO_DT_CUT_REF",
    "LE",
    "H",
    "TA",
    "VPD",
    "SW_IN",
    "P",
]
TARGET_VARIABLES = STANDARD_TARGET_VARIABLES

VARIABLE_METADATA: Dict[str, Dict[str, str]] = {
    "GPP_NT_VUT_REF": {"label": "GPP_NT_VUT_REF", "description": "Gross primary productivity, nighttime partitioning, variable ustar threshold reference", "unit": "g C m-2 d-1"},
    "GPP_NT_CUT_REF": {"label": "GPP_NT_CUT_REF", "description": "Gross primary productivity, nighttime partitioning, constant ustar threshold reference", "unit": "g C m-2 d-1"},
    "GPP_DT_VUT_REF": {"label": "GPP_DT_VUT_REF", "description": "Gross primary productivity, daytime partitioning, variable ustar threshold reference", "unit": "g C m-2 d-1"},
    "GPP_DT_CUT_REF": {"label": "GPP_DT_CUT_REF", "description": "Gross primary productivity, daytime partitioning, constant ustar threshold reference", "unit": "g C m-2 d-1"},
    "NEE_VUT_REF": {"label": "NEE_VUT_REF", "description": "Net ecosystem exchange, variable ustar threshold reference", "unit": "g C m-2 d-1"},
    "NEE_CUT_REF": {"label": "NEE_CUT_REF", "description": "Net ecosystem exchange, constant ustar threshold reference", "unit": "g C m-2 d-1"},
    "RECO_NT_VUT_REF": {"label": "RECO_NT_VUT_REF", "description": "Ecosystem respiration, nighttime partitioning, variable ustar threshold reference", "unit": "g C m-2 d-1"},
    "RECO_NT_CUT_REF": {"label": "RECO_NT_CUT_REF", "description": "Ecosystem respiration, nighttime partitioning, constant ustar threshold reference", "unit": "g C m-2 d-1"},
    "RECO_DT_VUT_REF": {"label": "RECO_DT_VUT_REF", "description": "Ecosystem respiration, daytime partitioning, variable ustar threshold reference", "unit": "g C m-2 d-1"},
    "RECO_DT_CUT_REF": {"label": "RECO_DT_CUT_REF", "description": "Ecosystem respiration, daytime partitioning, constant ustar threshold reference", "unit": "g C m-2 d-1"},
    "LE": {"label": "Latent heat flux", "description": "Latent heat exchange between land surface and atmosphere.", "unit": "W m-2"},
    "H": {"label": "Sensible heat flux", "description": "Sensible heat exchange between land surface and atmosphere.", "unit": "W m-2"},
    "TA": {"label": "Air temperature", "description": "Near-surface air temperature.", "unit": "deg C"},
    "VPD": {"label": "Vapor pressure deficit", "description": "Atmospheric evaporative demand expressed as vapor pressure deficit.", "unit": "kPa"},
    "SW_IN": {"label": "Incoming shortwave radiation", "description": "Incoming shortwave radiation at the site.", "unit": "W m-2"},
    "P": {"label": "Precipitation", "description": "Precipitation aggregated to the preview resolution.", "unit": "mm d-1"},
}

# Priority order for mapping canonical preview variables to FLUXMET columns.
# Generic GPP/RECO are considered separately and only when neither explicit
# partitioning product is present.
VARIABLE_ALIASES: Dict[str, List[str]] = {
    "GPP_NT_VUT_REF": ["GPP_NT_VUT_REF"],
    "GPP_NT_CUT_REF": ["GPP_NT_CUT_REF"],
    "GPP_DT_VUT_REF": ["GPP_DT_VUT_REF"],
    "GPP_DT_CUT_REF": ["GPP_DT_CUT_REF"],
    "NEE_VUT_REF": ["NEE_VUT_REF"],
    "NEE_CUT_REF": ["NEE_CUT_REF"],
    "RECO_NT_VUT_REF": ["RECO_NT_VUT_REF"],
    "RECO_NT_CUT_REF": ["RECO_NT_CUT_REF"],
    "RECO_DT_VUT_REF": ["RECO_DT_VUT_REF"],
    "RECO_DT_CUT_REF": ["RECO_DT_CUT_REF"],
    "LE": ["LE_F_MDS", "LE"],
    "H": ["H_F_MDS", "H"],
    "TA": ["TA_F", "TA"],
    "VPD": ["VPD_F", "VPD"],
    "SW_IN": ["SW_IN_F", "SW_IN"],
    "P": ["P_F", "P", "P_ERA"],
}

FINGERPRINT_FIELDS = [
    "site_id",
    "download_link",
    "fluxnet_product_name",
    "product_id",
    "oneflux_code_version",
    "product_source_network",
    "source_network",
    "network",
    "data_hub",
    "first_year",
    "last_year",
]


class PreviewBuildError(RuntimeError):
    """Site-scoped build failure that should not abort the whole run."""

    category = "failed"

    def __init__(self, message: str, category: Optional[str] = None) -> None:
        super().__init__(message)
        self.category = category or self.category


class IcosLicenseRequired(PreviewBuildError):
    category = "requires_icos_license_auth"

    def __init__(self, message: str = REQUIRES_ICOS_LICENSE_REASON) -> None:
        super().__init__(message, self.category)


class DownloadFailedError(PreviewBuildError):
    category = "download_failed"

    def __init__(self, message: str) -> None:
        super().__init__(message, self.category)


class NonZipResponseError(PreviewBuildError):
    category = "non_zip_response"

    def __init__(self, message: str) -> None:
        super().__init__(message, self.category)


class MalformedZipError(PreviewBuildError):
    category = "malformed_zip"

    def __init__(self, message: str) -> None:
        super().__init__(message, self.category)


class MissingLocalArchiveError(PreviewBuildError):
    category = "missing_local_archive"

    def __init__(self, message: str = "missing local archive") -> None:
        super().__init__(message, self.category)


@dataclass
class ProductRow:
    site_id: str
    download_url: str
    fields: Dict[str, str]

    @property
    def site_name(self) -> str:
        return self.fields.get("site_name", "")

    @property
    def product_name(self) -> str:
        return self.fields.get("fluxnet_product_name", "")

    @property
    def product_id(self) -> str:
        return self.fields.get("product_id", "")

    @property
    def first_year(self) -> str:
        return self.fields.get("first_year", "")

    @property
    def last_year(self) -> str:
        return self.fields.get("last_year", "")


@dataclass
class ProductFingerprint:
    value: str
    fields: Dict[str, str]
    warning: str = ""

    def to_manifest(self) -> Dict[str, Any]:
        return {
            "algorithm": "sha256",
            "value": self.value,
            "fields": self.fields,
            "warning": self.warning,
        }


@dataclass
class ResolutionPreview:
    resolution: str
    records: List[Dict[str, Any]]
    variables: List[str]
    source_columns: Dict[str, str]
    source_file: str
    variable_metadata: Dict[str, Dict[str, str]]
    skipped_malformed_dates: int = 0
    selection_warnings: List[str] = field(default_factory=list)


@dataclass
class SiteResult:
    site_id: str
    status: str
    reason: str = ""
    global_entry: Optional[Dict[str, Any]] = None
    previews: Dict[str, ResolutionPreview] = field(default_factory=dict)
    missing_resolutions: Dict[str, str] = field(default_factory=dict)
    fingerprint: Optional[ProductFingerprint] = None
    cache_path: Optional[Path] = None

    @property
    def monthly(self) -> Optional[ResolutionPreview]:
        """Compatibility accessor for callers written for the monthly-only builder."""
        return self.previews.get(MONTHLY_RESOLUTION)

    @property
    def weekly(self) -> Optional[ResolutionPreview]:
        return self.previews.get(WEEKLY_RESOLUTION)


@dataclass
class BuildSummary:
    built: List[SiteResult] = field(default_factory=list)
    skipped: List[SiteResult] = field(default_factory=list)
    failed: List[SiteResult] = field(default_factory=list)
    unavailable: List[SiteResult] = field(default_factory=list)
    requires_icos_license_auth: List[SiteResult] = field(default_factory=list)
    download_failed: List[SiteResult] = field(default_factory=list)
    non_zip_response: List[SiteResult] = field(default_factory=list)
    malformed_zip: List[SiteResult] = field(default_factory=list)
    missing_local_archive: List[SiteResult] = field(default_factory=list)
    no_fluxmet_mm: List[SiteResult] = field(default_factory=list)
    no_fluxmet_weekly: List[SiteResult] = field(default_factory=list)
    no_fluxmet_daily: List[SiteResult] = field(default_factory=list)
    no_fluxmet_annual: List[SiteResult] = field(default_factory=list)
    no_target_variables: List[SiteResult] = field(default_factory=list)
    parse_date_failure: List[SiteResult] = field(default_factory=list)
    dry_run_build: List[SiteResult] = field(default_factory=list)
    dry_run_skip: List[SiteResult] = field(default_factory=list)

    def add(self, result: SiteResult) -> None:
        if result.status == "built":
            self.built.append(result)
        elif result.status == "skipped":
            self.skipped.append(result)
        elif result.status == "failed":
            self.failed.append(result)
        elif result.status == "unavailable":
            self.unavailable.append(result)
        elif result.status == "requires_icos_license_auth":
            self.requires_icos_license_auth.append(result)
        elif result.status == "download_failed":
            self.download_failed.append(result)
        elif result.status == "non_zip_response":
            self.non_zip_response.append(result)
        elif result.status == "malformed_zip":
            self.malformed_zip.append(result)
        elif result.status == "missing_local_archive":
            self.missing_local_archive.append(result)
        elif result.status == "no_fluxmet_mm":
            self.no_fluxmet_mm.append(result)
        elif result.status == "no_fluxmet_weekly":
            self.no_fluxmet_weekly.append(result)
        elif result.status == "no_fluxmet_daily":
            self.no_fluxmet_daily.append(result)
        elif result.status == "no_fluxmet_annual":
            self.no_fluxmet_annual.append(result)
        elif result.status == "no_target_variables":
            self.no_target_variables.append(result)
        elif result.status == "parse_date_failure":
            self.parse_date_failure.append(result)
        elif result.status == "dry-run-build":
            self.dry_run_build.append(result)
        elif result.status == "dry-run-skip":
            self.dry_run_skip.append(result)
        else:
            self.failed.append(SiteResult(result.site_id, "failed", result.reason or f"Unknown status {result.status!r}"))
        if result.status == "built":
            for resolution, reason in result.missing_resolutions.items():
                missing = SiteResult(result.site_id, f"no_fluxmet_{resolution}", reason)
                if resolution == WEEKLY_RESOLUTION:
                    self.no_fluxmet_weekly.append(missing)
                elif resolution == MONTHLY_RESOLUTION:
                    self.no_fluxmet_mm.append(missing)
                elif resolution == DAILY_RESOLUTION:
                    self.no_fluxmet_daily.append(missing)
                elif resolution == ANNUAL_RESOLUTION:
                    self.no_fluxmet_annual.append(missing)

    def counts(self) -> Dict[str, int]:
        return {
            "built": len(self.built),
            "skipped": len(self.skipped),
            "failed": len(self.failed),
            "unavailable": len(self.unavailable),
            "requires_icos_license_auth": len(self.requires_icos_license_auth),
            "download_failed": len(self.download_failed),
            "non_zip_response": len(self.non_zip_response),
            "malformed_zip": len(self.malformed_zip),
            "missing_local_archive": len(self.missing_local_archive),
            "no_fluxmet_mm": len(self.no_fluxmet_mm),
            "no_fluxmet_weekly": len(self.no_fluxmet_weekly),
            "no_fluxmet_daily": len(self.no_fluxmet_daily),
            "no_fluxmet_annual": len(self.no_fluxmet_annual),
            "no_target_variables": len(self.no_target_variables),
            "parse_date_failure": len(self.parse_date_failure),
            "dry_run_build": len(self.dry_run_build),
            "dry_run_skip": len(self.dry_run_skip),
        }

    def has_errors(self) -> bool:
        built_site_ids = {result.site_id for result in self.built}
        unbuilt_resolution_failures = any(
            result.site_id not in built_site_ids
            for result in self.no_fluxmet_mm + self.no_fluxmet_weekly + self.no_fluxmet_daily + self.no_fluxmet_annual
        )
        return bool(
            self.failed
            or self.download_failed
            or self.non_zip_response
            or self.malformed_zip
            or unbuilt_resolution_failures
            or self.no_target_variables
            or self.parse_date_failure
        )


DownloadFunc = Callable[[ProductRow, Path], Optional[str]]
LogFunc = Callable[[str], None]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def log_stdout(message: str) -> None:
    print(message, flush=True)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path, help="Path to the current Shuttle snapshot/catalog JSON or CSV.")
    parser.add_argument("--output-dir", required=True, type=Path, help="Output artifact root, for example fluxnet-preview/v1.")
    parser.add_argument("--cache-dir", required=True, type=Path, help="Local cache directory for downloaded Shuttle product archives.")
    parser.add_argument("--archive-dir", type=Path, help="Directory of already downloaded Shuttle zip archives to use before network downloads.")
    parser.add_argument("--offline", action="store_true", help="Only use local archives/cache; do not attempt network downloads.")
    parser.add_argument("--site", action="append", default=[], help="Optional site ID to build. Repeat for multiple sites.")
    parser.add_argument("--limit", type=int, default=0, help="Optional limit on the first N eligible sites after site filtering.")
    parser.add_argument("--force", action="store_true", help="Rebuild even when the product fingerprint appears unchanged.")
    parser.add_argument(
        "--resolution",
        default=MONTHLY_RESOLUTION,
        help="Comma-separated resolutions to build (monthly, weekly, daily, annual). Default: monthly.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report work without downloading or writing preview artifacts.")
    return parser.parse_args(argv)


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def normalize_site_id(value: str) -> str:
    return str(value or "").strip().upper()


def display_site_id(value: str) -> str:
    return str(value or "").strip()


def safe_filename(value: str, fallback: str = "artifact") -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip()).strip("._-")
    return name or fallback


def first_field(row: Dict[str, str], names: Sequence[str]) -> str:
    lookup = {normalize_key(key): value for key, value in row.items()}
    for name in names:
        key = normalize_key(name)
        if key in lookup and str(lookup[key] or "").strip():
            return str(lookup[key] or "").strip()
    return ""


def load_snapshot_rows(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"Snapshot does not exist: {path}")
    if path.suffix.lower() == ".json":
        return load_snapshot_json(path)
    return load_snapshot_csv(path)


def load_snapshot_json(path: Path) -> List[Dict[str, str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("columns"), list) and isinstance(payload.get("rows"), list):
        columns = [str(column or "").strip() for column in payload["columns"]]
        rows: List[Dict[str, str]] = []
        for raw_row in payload["rows"]:
            if isinstance(raw_row, list):
                rows.append({columns[index]: stringify(raw_row[index]) if index < len(raw_row) else "" for index in range(len(columns))})
            elif isinstance(raw_row, dict):
                rows.append({str(key or "").strip(): stringify(value) for key, value in raw_row.items()})
        return rows
    if isinstance(payload, list):
        return [{str(key or "").strip(): stringify(value) for key, value in row.items()} for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("rows"), list):
        return [{str(key or "").strip(): stringify(value) for key, value in row.items()} for row in payload["rows"] if isinstance(row, dict)]
    raise ValueError(f"Unsupported snapshot JSON shape: {path}")


def load_snapshot_csv(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return [{str(key or "").strip(): stringify(value) for key, value in row.items()} for row in reader]


def stringify(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def product_row_from_snapshot(row: Dict[str, str]) -> Optional[ProductRow]:
    site_id = first_field(row, ["site_id", "site", "site_code", "mysitename"])
    download_url = first_field(row, ["download_link", "download_url", "url", "direct_download_url"])
    if not site_id or not download_url:
        return None
    normalized = {normalize_key(key): stringify(value) for key, value in row.items()}
    normalized.setdefault("site_id", site_id)
    normalized.setdefault("download_link", download_url)
    return ProductRow(site_id=display_site_id(site_id), download_url=download_url, fields=normalized)


def eligible_products(rows: Sequence[Dict[str, str]], sites: Sequence[str], limit: int = 0) -> List[ProductRow]:
    selected = {normalize_site_id(site) for site in sites if str(site or "").strip()}
    products: List[ProductRow] = []
    seen: set[str] = set()
    for row in rows:
        product = product_row_from_snapshot(row)
        if product is None:
            continue
        key = normalize_site_id(product.site_id)
        if selected and key not in selected:
            continue
        if key in seen:
            continue
        seen.add(key)
        products.append(product)
    products.sort(key=lambda product: normalize_site_id(product.site_id))
    if limit and limit > 0:
        return products[:limit]
    return products


def parse_resolutions(value: str) -> List[str]:
    raw = [part.strip().lower() for part in str(value or "").split(",") if part.strip()]
    if not raw:
        raw = [MONTHLY_RESOLUTION]
    invalid = sorted(set(raw) - set(RESOLUTION_CONFIG))
    if invalid:
        raise ValueError(f"Unsupported resolution(s): {', '.join(invalid)}")
    return list(dict.fromkeys(raw))


def compute_fingerprint(product: ProductRow) -> ProductFingerprint:
    fields = {name: product.fields.get(name, "") for name in FINGERPRINT_FIELDS if product.fields.get(name, "")}
    warning = ""
    if not fields:
        fields = {"site_id": product.site_id, "download_link": product.download_url}
        warning = "No stable snapshot metadata fields were available; used site ID and product URL fallback."
    elif "download_link" not in fields:
        fields["download_link"] = product.download_url
        warning = "Snapshot lacked a normalized download_link field; included product URL fallback."
    canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"))
    value = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return ProductFingerprint(value=value, fields=fields, warning=warning)


def site_dir(output_dir: Path, site_id: str) -> Path:
    return output_dir / "sites" / display_site_id(site_id)


def site_manifest_path(output_dir: Path, site_id: str) -> Path:
    return site_dir(output_dir, site_id) / SITE_MANIFEST_FILENAME


def read_json_if_exists(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def existing_fingerprint_value(site_manifest: Optional[Dict[str, Any]]) -> str:
    raw = site_manifest.get("productFingerprint") if isinstance(site_manifest, dict) else None
    if isinstance(raw, dict):
        return str(raw.get("value") or "")
    return ""


def cache_archive_path(cache_dir: Path, product: ProductRow, fingerprint: ProductFingerprint) -> Path:
    product_name = safe_filename(product.product_name or Path(product.download_url.split("?", 1)[0]).name, "product.zip")
    if not product_name.lower().endswith(".zip"):
        product_name += ".zip"
    return cache_dir / safe_filename(product.site_id, "site") / f"{fingerprint.value[:16]}-{product_name}"


@dataclass
class LocalArchiveIndex:
    archive_dir: Path
    archives: List[Path]


@dataclass
class LocalArchiveLookup:
    archive_path: Optional[Path]
    rejected: List[Tuple[Path, str]] = field(default_factory=list)
    candidates: List[Path] = field(default_factory=list)

    @property
    def has_candidates(self) -> bool:
        return bool(self.candidates)

    @property
    def rejected_no_fluxmet(self) -> bool:
        return any(reason.startswith("no_fluxmet_") for _path, reason in self.rejected)


def build_local_archive_index(archive_dir: Optional[Path]) -> Optional[LocalArchiveIndex]:
    if archive_dir is None:
        return None
    if not archive_dir.exists() or not archive_dir.is_dir():
        raise FileNotFoundError(f"Archive directory does not exist or is not a directory: {archive_dir}")
    archives = sorted(path for path in archive_dir.rglob("*") if path.is_file() and path.suffix.lower() == ".zip")
    return LocalArchiveIndex(archive_dir=archive_dir, archives=archives)


def site_id_filename_pattern(site_id: str) -> re.Pattern[str]:
    return re.compile(r"(^|[_-])" + re.escape(site_id) + r"($|[_-])", re.IGNORECASE)


def local_archive_candidates(product: ProductRow, archive_index: LocalArchiveIndex) -> List[Path]:
    site_pattern = site_id_filename_pattern(product.site_id)
    product_name = product.product_name.lower()
    candidates = []
    for archive_path in archive_index.archives:
        name = archive_path.name
        if product_name and name.lower() == product_name:
            candidates.append(archive_path)
        elif site_pattern.search(name):
            candidates.append(archive_path)
    return sorted(candidates, key=lambda path: local_archive_sort_key(product, path))


def local_archive_sort_key(product: ProductRow, archive_path: Path) -> Tuple[int, int, int, Tuple[int, ...], int, int, str]:
    name = archive_path.name
    lower_name = name.lower()
    lower_product_name = product.product_name.lower()
    years = f"{product.first_year}-{product.last_year}" if product.first_year and product.last_year else ""
    product_id = product.product_id.lower()
    version, revision, end_year, base = parse_version_rank(name)
    return (
        0 if lower_product_name and lower_name == lower_product_name else 1,
        0 if years and years in lower_name else 1,
        0 if product_id and product_id in lower_name else 1,
        tuple(-part for part in version),
        -revision,
        -end_year,
        base.lower(),
    )


def archive_available_resolutions(archive_path: Path, resolutions: Sequence[str]) -> List[str]:
    if not is_valid_zip_file(archive_path):
        return []
    with zipfile.ZipFile(archive_path) as zip_file:
        names = zip_file.namelist()
        return [
            resolution
            for resolution in resolutions
            if any(is_fluxmet_resolution_file(name, RESOLUTION_CONFIG[resolution]["code"]) for name in names)
        ]


def local_archive_validation_reason(archive_path: Path, resolutions: Sequence[str] = (MONTHLY_RESOLUTION,)) -> str:
    if not is_valid_zip_file(archive_path):
        return "invalid_zip"
    try:
        available = archive_available_resolutions(archive_path, resolutions)
        if not available:
            if len(resolutions) == 1:
                resolution = list(resolutions)[0]
                return "no_fluxmet_mm" if resolution == MONTHLY_RESOLUTION else f"no_fluxmet_{resolution}"
            return "no_requested_fluxmet"
    except zipfile.BadZipFile:
        return "malformed_zip"
    except OSError:
        return "unreadable"
    return ""


def find_local_archive(
    product: ProductRow,
    archive_index: Optional[LocalArchiveIndex],
    resolutions: Sequence[str],
    log: LogFunc,
) -> LocalArchiveLookup:
    if archive_index is None:
        return LocalArchiveLookup(None)
    candidates = local_archive_candidates(product, archive_index)
    rejected: List[Tuple[Path, str]] = []
    valid: List[Path] = []
    for archive_path in candidates:
        reason = local_archive_validation_reason(archive_path, resolutions)
        if reason:
            rejected.append((archive_path, reason))
            log(f"[{product.site_id}] rejecting local archive {archive_path}: {reason}")
            continue
        valid.append(archive_path)
    if not valid:
        return LocalArchiveLookup(None, rejected=rejected, candidates=candidates)
    selected = valid[0]
    if len(valid) > 1:
        log(
            f"[{product.site_id}] multiple matching local archives found; selected {selected} from "
            + ", ".join(str(path) for path in valid)
        )
    if rejected:
        log(f"[{product.site_id}] selected local archive {selected} after rejecting {len(rejected)} candidate(s)")
    return LocalArchiveLookup(selected, rejected=rejected, candidates=candidates)


def local_archive_missing_reason(product: ProductRow, lookup: LocalArchiveLookup, archive_index: Optional[LocalArchiveIndex]) -> str:
    archive_dir = str(archive_index.archive_dir) if archive_index is not None else "archive directory"
    if not lookup.has_candidates:
        return f"no matching local archive found in {archive_dir}"
    rejected = "; ".join(f"{path.name}: {reason}" for path, reason in lookup.rejected[:5])
    suffix = f"; rejected candidates: {rejected}" if rejected else ""
    return f"no usable local archive found in {archive_dir} for {product.site_id}{suffix}"


def parsed_url(value: str) -> urllib.parse.ParseResult:
    return urllib.parse.urlparse(str(value or "").strip())


def is_icos_host(url: str) -> bool:
    return parsed_url(url).netloc.lower() == ICOS_HOST


def is_icos_license_acceptance_url(url: str) -> bool:
    parsed = parsed_url(url)
    return parsed.netloc.lower() == ICOS_HOST and parsed.path.rstrip("/") == "/licence_accept"


def is_icos_license_page_url(url: str) -> bool:
    parsed = parsed_url(url)
    return parsed.netloc.lower() == ICOS_HOST and parsed.path.startswith("/licence")


def extract_icos_object_ids(url: str) -> List[str]:
    query = urllib.parse.parse_qs(parsed_url(url).query)
    raw_values = query.get("ids") or []
    if not raw_values:
        return []
    raw = raw_values[0].strip()
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        decoded = raw
    if isinstance(decoded, list):
        return [str(value).strip() for value in decoded if str(value or "").strip()]
    if str(decoded or "").strip():
        return [str(decoded).strip()]
    return []


def icos_object_download_url(object_id: str) -> str:
    return ICOS_OBJECT_URL_PREFIX + urllib.parse.quote(object_id, safe="")


def icos_auth_token() -> str:
    return os.environ.get(ICOS_CPAUTH_TOKEN_ENV, "").strip()


def request_for_url(url: str, headers: Optional[Dict[str, str]] = None) -> urllib.request.Request:
    request_headers = {"User-Agent": USER_AGENT}
    request_headers.update(headers or {})
    return urllib.request.Request(url, headers=request_headers)


def request_for_product(product: ProductRow) -> urllib.request.Request:
    return request_for_url(product.download_url)


def icos_authenticated_object_request(product: ProductRow) -> urllib.request.Request:
    token = icos_auth_token()
    if not token:
        raise IcosLicenseRequired()
    object_ids = extract_icos_object_ids(product.download_url)
    if len(object_ids) != 1:
        raise PreviewBuildError(
            f"ICOS licence_accept URL contains {len(object_ids)} object IDs; only single-object URLs are supported",
            category="failed",
        )
    return request_for_url(icos_object_download_url(object_ids[0]), {"Cookie": f"cpauthToken={token}"})


def is_valid_zip_file(path: Path) -> bool:
    try:
        return path.is_file() and zipfile.is_zipfile(path)
    except OSError:
        return False


def remove_invalid_cached_archive(path: Path, log: LogFunc) -> None:
    if not path.exists() or is_valid_zip_file(path):
        return
    log(f"cached archive {path} is not a valid zip; deleting invalid cache entry")
    try:
        path.unlink()
    except OSError as error:
        raise DownloadFailedError(f"could not delete invalid cached archive {path}: {error}") from error


def response_header(response: Any, name: str) -> str:
    headers = getattr(response, "headers", None)
    if headers is None:
        headers = getattr(response, "info", lambda: None)()
    if headers is None:
        return ""
    getter = getattr(headers, "get", None)
    if callable(getter):
        return str(getter(name, "") or "")
    return ""


def downloaded_file_looks_like_html(path: Path) -> bool:
    try:
        sample = path.read_bytes()[:512].lstrip().lower()
    except OSError:
        return False
    return sample.startswith(b"<!doctype html") or sample.startswith(b"<html") or sample.startswith(b"<")


def delete_download(path: Path) -> None:
    if path.exists():
        path.unlink(missing_ok=True)  # type: ignore[arg-type]


@dataclass
class DownloadAttempt:
    final_url: str
    content_type: str
    looks_html: bool


def download_request_to_path(
    request: urllib.request.Request,
    destination: Path,
    opener: Optional[urllib.request.OpenerDirector] = None,
) -> DownloadAttempt:
    open_func = opener.open if opener is not None else urllib.request.urlopen
    with open_func(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)
        final_url = response.geturl() if hasattr(response, "geturl") else request.full_url
        content_type = response_header(response, "Content-Type")
    return DownloadAttempt(final_url=final_url, content_type=content_type, looks_html=downloaded_file_looks_like_html(destination))


def non_zip_message(attempt: DownloadAttempt) -> str:
    detail = "HTML response" if attempt.looks_html or "html" in attempt.content_type.lower() else "non-zip response"
    return f"downloaded {detail} instead of a zip archive: {attempt.final_url}"


def download_with_retries(
    request: urllib.request.Request,
    tmp_path: Path,
    opener: Optional[urllib.request.OpenerDirector] = None,
) -> DownloadAttempt:
    last_error: Optional[BaseException] = None
    for attempt_index in range(DOWNLOAD_RETRIES + 1):
        try:
            return download_request_to_path(request, tmp_path, opener)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            delete_download(tmp_path)
            if attempt_index < DOWNLOAD_RETRIES:
                time.sleep(RETRY_DELAY_SECONDS * (attempt_index + 1))
    raise DownloadFailedError(f"download failed: {last_error}")


def commit_zip_download(tmp_path: Path, destination: Path, attempt: DownloadAttempt) -> bool:
    if not is_valid_zip_file(tmp_path):
        delete_download(tmp_path)
        return False
    tmp_path.replace(destination)
    return True


def default_download(product: ProductRow, destination: Path) -> Optional[str]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = destination.with_suffix(destination.suffix + ".tmp")
    if is_icos_license_acceptance_url(product.download_url):
        cookie_jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
        unauthenticated_attempt = download_with_retries(request_for_product(product), tmp_path, opener)
        if commit_zip_download(tmp_path, destination, unauthenticated_attempt):
            return ICOS_UNAUTHENTICATED_SUCCESS_REASON
        token = icos_auth_token()
        if token:
            authenticated_attempt = download_with_retries(icos_authenticated_object_request(product), tmp_path, opener)
            if commit_zip_download(tmp_path, destination, authenticated_attempt):
                return "authenticated ICOS object download succeeded after licence_accept returned non-zip"
            raise IcosLicenseRequired(non_zip_message(authenticated_attempt))
        raise IcosLicenseRequired(non_zip_message(unauthenticated_attempt))

    request = request_for_product(product)
    attempt = download_with_retries(request, tmp_path)
    if not commit_zip_download(tmp_path, destination, attempt):
        if is_icos_license_page_url(attempt.final_url):
            raise IcosLicenseRequired(non_zip_message(attempt))
        raise NonZipResponseError(non_zip_message(attempt))
    return None


def zip_member_basename(name: str) -> str:
    return Path(str(name or "")).name


def is_fluxmet_resolution_file(name: str, resolution_code: str) -> bool:
    base = zip_member_basename(name).upper()
    return base.endswith(".CSV") and f"_FLUXNET_FLUXMET_{resolution_code}_" in base


def is_bifvarinfo_resolution_file(name: str, resolution_code: str) -> bool:
    base = zip_member_basename(name).upper()
    return base.endswith(".CSV") and f"_FLUXNET_BIFVARINFO_{resolution_code}_" in base


def parse_version_rank(name: str) -> Tuple[Tuple[int, ...], int, int, str]:
    base = zip_member_basename(name)
    version_match = re.search(r"_v(\d+(?:\.\d+)*)_r(\d+)", base, re.IGNORECASE)
    years_match = re.search(r"_(\d{4})-(\d{4})_", base)
    version = tuple(int(part) for part in version_match.group(1).split(".")) if version_match else tuple()
    revision = int(version_match.group(2)) if version_match else 0
    end_year = int(years_match.group(2)) if years_match else 0
    return version, revision, end_year, base


def choose_resolution_member(zip_file: zipfile.ZipFile, resolution_code: str) -> Tuple[str, List[str]]:
    matches = sorted(name for name in zip_file.namelist() if is_fluxmet_resolution_file(name, resolution_code))
    if not matches:
        resolution_by_code = {config["code"]: name for name, config in RESOLUTION_CONFIG.items()}
        resolution = resolution_by_code.get(resolution_code, resolution_code.lower())
        category = "no_fluxmet_mm" if resolution == MONTHLY_RESOLUTION else f"no_fluxmet_{resolution}"
        raise PreviewBuildError(f"no *_FLUXNET_FLUXMET_{resolution_code}_*.csv file found", category=category)
    ranked = sorted(matches, key=parse_version_rank, reverse=True)
    warnings: List[str] = []
    if len(matches) > 1:
        warnings.append(
            "multiple FLUXMET_%s files found; selected %s deterministically from %s"
            % (resolution_code, zip_member_basename(ranked[0]), ", ".join(zip_member_basename(name) for name in matches))
        )
    return ranked[0], warnings


def choose_bifvarinfo_member(zip_file: zipfile.ZipFile, resolution_code: str) -> Optional[str]:
    matches = sorted(name for name in zip_file.namelist() if is_bifvarinfo_resolution_file(name, resolution_code))
    if not matches:
        return None
    return sorted(matches, key=parse_version_rank, reverse=True)[0]


def text_reader_from_zip(zip_file: zipfile.ZipFile, member: str) -> io.TextIOWrapper:
    return io.TextIOWrapper(zip_file.open(member), encoding="utf-8-sig", newline="")


def normalize_column_name(value: str) -> str:
    return str(value or "").strip().upper()


def select_source_columns(fieldnames: Sequence[str]) -> Dict[str, str]:
    columns_by_upper = {normalize_column_name(column): column for column in fieldnames}
    selected: Dict[str, str] = {}
    for variable in STANDARD_TARGET_VARIABLES:
        for alias in VARIABLE_ALIASES[variable]:
            if normalize_column_name(alias) in columns_by_upper:
                selected[variable] = columns_by_upper[normalize_column_name(alias)]
                break
    return selected


def find_timestamp_column(fieldnames: Sequence[str], resolution: str = MONTHLY_RESOLUTION) -> str:
    # Start is deliberately preferred for weekly files so the plotted date is
    # the first day of the represented interval when both bounds are present.
    candidates = (
        ["TIMESTAMP_START", "TIMESTAMP", "TIMESTAMP_BEGIN", "TIMESTAMP_DATE", "DATE"]
        if resolution in {WEEKLY_RESOLUTION, DAILY_RESOLUTION}
        else ["TIMESTAMP", "TIMESTAMP_START", "TIMESTAMP_BEGIN", "TIMESTAMP_DATE", "DATE", "MONTH"]
    )
    columns_by_upper = {normalize_column_name(column): column for column in fieldnames}
    for candidate in candidates:
        if candidate in columns_by_upper:
            return columns_by_upper[candidate]
    for column in fieldnames:
        if normalize_column_name(column).startswith("TIMESTAMP"):
            return column
    raise PreviewBuildError(f"no {resolution} timestamp column found", category="parse_date_failure")


def parse_month(value: str) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    if re.fullmatch(r"\d{6}", raw):
        year = int(raw[:4])
        month = int(raw[4:6])
    elif re.fullmatch(r"\d{8}", raw):
        year = int(raw[:4])
        month = int(raw[4:6])
    elif re.fullmatch(r"\d{4}-\d{2}", raw):
        year = int(raw[:4])
        month = int(raw[5:7])
    elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        year = int(raw[:4])
        month = int(raw[5:7])
    else:
        digits = re.sub(r"\D", "", raw)
        if len(digits) >= 6:
            year = int(digits[:4])
            month = int(digits[4:6])
        else:
            return None
    if year < 1900 or year > 2100 or month < 1 or month > 12:
        return None
    return f"{year:04d}-{month:02d}"


def parse_week(value: str) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    parsed: Optional[date] = None
    try:
        if re.fullmatch(r"\d{8}", raw):
            parsed = datetime.strptime(raw, "%Y%m%d").date()
        elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            parsed = datetime.strptime(raw, "%Y-%m-%d").date()
        else:
            # Some products encode ISO year/week instead of a calendar date.
            # ISO weekday 1 is Monday, used deterministically as period start.
            match = re.fullmatch(r"(\d{4})(?:-?W?)(\d{2})", raw, re.IGNORECASE)
            if match:
                parsed = date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)
    except ValueError:
        return None
    if parsed is None or parsed.year < 1900 or parsed.year > 2100:
        return None
    return parsed.isoformat()


def parse_day(value: str) -> Optional[str]:
    raw = str(value or "").strip()
    try:
        if re.fullmatch(r"\d{8}", raw):
            parsed = datetime.strptime(raw, "%Y%m%d").date()
        elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            parsed = datetime.strptime(raw, "%Y-%m-%d").date()
        else:
            return None
    except ValueError:
        return None
    return parsed.isoformat() if 1900 <= parsed.year <= 2100 else None


def parse_annual(value: str) -> Optional[str]:
    raw = str(value or "").strip()
    match = re.fullmatch(r"(\d{4})(?:0101)?", re.sub(r"-", "", raw))
    if not match:
        return None
    year = int(match.group(1))
    return f"{year:04d}-01-01" if 1900 <= year <= 2100 else None


def parse_number(value: Any) -> Optional[float]:
    raw = str(value if value is not None else "").strip()
    if raw.upper() in FILL_VALUES:
        return None
    try:
        number = float(raw)
    except ValueError:
        return None
    if number <= -9990 or number == -6999:
        return None
    return number


def date_range(records: Sequence[Dict[str, Any]]) -> List[str]:
    dates = sorted(str(record["date"]) for record in records if record.get("date"))
    if not dates:
        return []
    return [month_start_date(dates[0]), month_end_date(dates[-1])]


def month_start_date(month: str) -> str:
    return f"{month}-01" if re.fullmatch(r"\d{4}-\d{2}", month) else month


def month_end_date(month: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        return month
    year = int(month[:4])
    month_number = int(month[5:7])
    last_day = calendar.monthrange(year, month_number)[1]
    return f"{month}-{last_day:02d}"


def read_bifvarinfo_metadata(zip_file: zipfile.ZipFile, member: Optional[str]) -> Dict[str, Dict[str, str]]:
    if not member:
        return {}
    lookup: Dict[str, Dict[str, str]] = {}
    try:
        with text_reader_from_zip(zip_file, member) as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                variable = first_field(row, ["variable", "variable_name", "var", "name", "field", "column", "column_name"])
                if not variable:
                    continue
                unit = first_field(row, ["unit", "units", "variable_unit", "var_unit"])
                label = first_field(row, ["label", "description", "long_name", "variable_description", "comment"])
                lookup[normalize_column_name(variable)] = {"unit": unit, "label": label}
    except (OSError, csv.Error, UnicodeDecodeError):
        return {}
    return lookup


def variable_manifest_metadata(
    variable: str,
    source_column: Optional[str],
    bif_metadata: Dict[str, Dict[str, str]],
    records: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    defaults = VARIABLE_METADATA[variable]
    source_meta = bif_metadata.get(normalize_column_name(source_column or ""), {})
    non_null_count = sum(record.get(variable) is not None for record in records) if source_column else 0
    return {
        "label": defaults["label"],
        "description": defaults["description"],
        "unit": source_meta.get("unit") or defaults["unit"],
        "available": bool(source_column and non_null_count),
        "sourceColumn": source_column,
        "nonNullCount": non_null_count,
        "recordCount": len(records),
    }


def parse_resolution_preview_from_zip(zip_path: Path, resolution: str) -> ResolutionPreview:
    if resolution not in RESOLUTION_CONFIG:
        raise ValueError(f"Unsupported resolution: {resolution}")
    if not is_valid_zip_file(zip_path):
        raise NonZipResponseError(f"archive is not a valid zip: {zip_path}")
    config = RESOLUTION_CONFIG[resolution]
    resolution_code = config["code"]
    parse_date: Callable[[str], Optional[str]] = {
        MONTHLY_RESOLUTION: parse_month,
        WEEKLY_RESOLUTION: parse_week,
        DAILY_RESOLUTION: parse_day,
        ANNUAL_RESOLUTION: parse_annual,
    }[resolution]
    try:
        with zipfile.ZipFile(zip_path) as zf:
            source_member, selection_warnings = choose_resolution_member(zf, resolution_code)
            bif_member = choose_bifvarinfo_member(zf, resolution_code)
            bif_metadata = read_bifvarinfo_metadata(zf, bif_member)
            with text_reader_from_zip(zf, source_member) as handle:
                reader = csv.DictReader(handle)
                if not reader.fieldnames:
                    raise PreviewBuildError(
                        f"{resolution} file {zip_member_basename(source_member)} is missing a header",
                        category="parse_date_failure",
                    )
                timestamp_column = find_timestamp_column(reader.fieldnames, resolution)
                source_columns = select_source_columns(reader.fieldnames)
                if not source_columns:
                    raise PreviewBuildError(
                        f"no target preview variables found in {zip_member_basename(source_member)}",
                        category="no_target_variables",
                    )
                records: List[Dict[str, Any]] = []
                skipped_malformed_dates = 0
                for row in reader:
                    record_date = parse_date(str(row.get(timestamp_column, "")))
                    if not record_date:
                        skipped_malformed_dates += 1
                        continue
                    record: Dict[str, Any] = {"date": record_date}
                    for variable in TARGET_VARIABLES:
                        if variable in source_columns:
                            record[variable] = parse_number(row.get(source_columns[variable]))
                    records.append(record)
                if not records:
                    raise PreviewBuildError(
                        f"no valid {resolution} records found in {zip_member_basename(source_member)}",
                        category="parse_date_failure",
                    )
                variables = [
                    variable
                    for variable in TARGET_VARIABLES
                    if variable in source_columns and any(record.get(variable) is not None for record in records)
                ]
                empty_variables = [variable for variable in TARGET_VARIABLES if variable in source_columns and variable not in variables]
                if empty_variables:
                    selection_warnings.append(
                        "excluded all-null preview variables: " + ", ".join(empty_variables)
                    )
                if not variables:
                    raise PreviewBuildError(
                        f"target columns contain no numeric preview values in {zip_member_basename(source_member)}",
                        category="no_target_variables",
                    )
                variable_metadata = {
                    variable: variable_manifest_metadata(variable, source_columns.get(variable), bif_metadata, records)
                    for variable in STANDARD_TARGET_VARIABLES
                }
                preview = ResolutionPreview(
                    resolution=resolution,
                    records=records,
                    variables=variables,
                    source_columns=source_columns,
                    source_file=zip_member_basename(source_member),
                    variable_metadata=variable_metadata,
                    skipped_malformed_dates=skipped_malformed_dates,
                    selection_warnings=selection_warnings,
                )
                return preview
    except zipfile.BadZipFile as error:
        raise MalformedZipError(f"archive cannot be opened as zip: {error}") from error


def parse_monthly_preview_from_zip(zip_path: Path) -> ResolutionPreview:
    return parse_resolution_preview_from_zip(zip_path, MONTHLY_RESOLUTION)


def parse_weekly_preview_from_zip(zip_path: Path) -> ResolutionPreview:
    return parse_resolution_preview_from_zip(zip_path, WEEKLY_RESOLUTION)


def parse_daily_preview_from_zip(zip_path: Path) -> ResolutionPreview:
    return parse_resolution_preview_from_zip(zip_path, DAILY_RESOLUTION)


def parse_annual_preview_from_zip(zip_path: Path) -> ResolutionPreview:
    return parse_resolution_preview_from_zip(zip_path, ANNUAL_RESOLUTION)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_site_manifest(
    product: ProductRow,
    fingerprint: ProductFingerprint,
    previews: Dict[str, ResolutionPreview],
    built_at: str,
) -> Dict[str, Any]:
    all_records = [record for preview in previews.values() for record in preview.records]
    resolutions_manifest: Dict[str, Dict[str, Any]] = {}
    source_files: Dict[str, str] = {}
    source_columns: Dict[str, Dict[str, str]] = {}
    source_rows: Dict[str, Dict[str, Any]] = {}
    for resolution in RESOLUTION_CONFIG:
        preview = previews.get(resolution)
        if not preview:
            continue
        resolutions_manifest[resolution] = {
            "path": RESOLUTION_CONFIG[resolution]["output"],
            "dateFormat": RESOLUTION_CONFIG[resolution]["dateFormat"],
            "variables": {variable: preview.variable_metadata[variable] for variable in STANDARD_TARGET_VARIABLES},
            "sourceFile": preview.source_file,
            "sourceColumns": preview.source_columns,
        }
        source_files[resolution] = preview.source_file
        source_columns[resolution] = preview.source_columns
        source_rows[resolution] = {
            "recordCount": len(preview.records),
            "skippedMalformedDates": preview.skipped_malformed_dates,
            "warnings": preview.selection_warnings,
        }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "siteId": product.site_id,
        "source": SOURCE_LABEL,
        "productLabel": "Site Data Preview",
        "dateRange": date_range(all_records),
        "lastPreviewBuild": built_at,
        "resolutions": resolutions_manifest,
        "notice": NOTICE_TEXT,
        "productFingerprint": fingerprint.to_manifest(),
        "sourceFiles": source_files,
        "sourceColumns": source_columns,
        "sourceRows": source_rows,
        "product": {
            "url": product.download_url,
            "name": product.product_name,
            "id": product.product_id,
            "firstYear": product.first_year,
            "lastYear": product.last_year,
            "dataHub": product.fields.get("data_hub", ""),
            "sourceNetwork": product.fields.get("product_source_network") or product.fields.get("source_network", ""),
        },
    }


def global_entry_from_site_manifest(site_manifest: Dict[str, Any]) -> Dict[str, Any]:
    site_id = str(site_manifest.get("siteId") or "")
    resolutions = site_manifest.get("resolutions") if isinstance(site_manifest.get("resolutions"), dict) else {}
    resolution_names = [name for name in RESOLUTION_CONFIG if name in resolutions]
    available_variables: set[str] = set()
    for spec in resolutions.values():
        if isinstance(spec, dict) and isinstance(spec.get("variables"), dict):
            available_variables.update(str(variable) for variable in spec["variables"])
    variables = [
        variable for variable in TARGET_VARIABLES
        if variable in available_variables and any(
            isinstance(spec, dict)
            and isinstance(spec.get("variables"), dict)
            and isinstance(spec["variables"].get(variable), dict)
            and spec["variables"][variable].get("available") is not False
            for spec in resolutions.values()
        )
    ]
    return {
        "siteId": site_id,
        "hasPreview": True,
        "siteManifestPath": f"sites/{site_id}/{SITE_MANIFEST_FILENAME}",
        "resolutions": resolution_names,
        "variables": variables,
    }


def load_global_manifest(output_dir: Path) -> Dict[str, Any]:
    payload = read_json_if_exists(output_dir / GLOBAL_MANIFEST_FILENAME)
    if not payload:
        return {"schemaVersion": SCHEMA_VERSION, "builtAt": "", "source": SOURCE_LABEL, "sites": {}}
    if not isinstance(payload.get("sites"), dict):
        payload["sites"] = {}
    payload.setdefault("schemaVersion", SCHEMA_VERSION)
    payload.setdefault("source", SOURCE_LABEL)
    payload.setdefault("builtAt", "")
    return payload


def write_global_manifest(output_dir: Path, built_at: str, entries: Dict[str, Dict[str, Any]]) -> None:
    manifest = load_global_manifest(output_dir)
    sites = manifest.setdefault("sites", {})
    for site_id, entry in entries.items():
        sites[site_id] = entry
    manifest["schemaVersion"] = SCHEMA_VERSION
    manifest["source"] = SOURCE_LABEL
    manifest["builtAt"] = built_at
    write_json(output_dir / GLOBAL_MANIFEST_FILENAME, manifest)


def write_site_artifacts(
    output_dir: Path,
    product: ProductRow,
    fingerprint: ProductFingerprint,
    previews: Dict[str, ResolutionPreview],
    built_at: str,
) -> Dict[str, Any]:
    directory = site_dir(output_dir, product.site_id)
    for resolution, preview in previews.items():
        write_json(directory / RESOLUTION_CONFIG[resolution]["output"], preview.records)
    site_manifest = build_site_manifest(product, fingerprint, previews, built_at)
    write_json(directory / SITE_MANIFEST_FILENAME, site_manifest)
    return global_entry_from_site_manifest(site_manifest)


def manifest_has_resolutions(
    site_manifest: Optional[Dict[str, Any]],
    output_dir: Path,
    site_id: str,
    resolutions: Sequence[str],
) -> bool:
    specs = site_manifest.get("resolutions") if isinstance(site_manifest, dict) else None
    if not isinstance(specs, dict):
        return False
    for resolution in resolutions:
        spec = specs.get(resolution)
        if not isinstance(spec, dict) or not str(spec.get("path") or "").strip():
            return False
        if not (site_dir(output_dir, site_id) / str(spec["path"])).exists():
            return False
    return True


def parse_requested_previews(
    archive_path: Path,
    resolutions: Sequence[str],
) -> Tuple[Dict[str, ResolutionPreview], Dict[str, str]]:
    previews: Dict[str, ResolutionPreview] = {}
    missing: Dict[str, str] = {}
    for resolution in resolutions:
        try:
            previews[resolution] = parse_resolution_preview_from_zip(archive_path, resolution)
        except PreviewBuildError as error:
            if error.category.startswith("no_fluxmet_"):
                missing[resolution] = str(error)
                continue
            raise
    if not previews:
        if len(resolutions) == 1:
            resolution = resolutions[0]
            category = "no_fluxmet_mm" if resolution == MONTHLY_RESOLUTION else f"no_fluxmet_{resolution}"
            raise PreviewBuildError(missing.get(resolution, f"no {resolution} FLUXMET file"), category=category)
        raise PreviewBuildError("no requested FLUXMET files", category="no_fluxmet_mm")
    return previews, missing


def build_product_preview(
    product: ProductRow,
    output_dir: Path,
    cache_dir: Path,
    archive_index: Optional[LocalArchiveIndex],
    offline: bool,
    resolutions: Sequence[str],
    force: bool,
    dry_run: bool,
    built_at: str,
    download_func: Optional[DownloadFunc],
    log: LogFunc,
) -> SiteResult:
    requested = parse_resolutions(",".join(resolutions))
    fingerprint = compute_fingerprint(product)
    existing_manifest = read_json_if_exists(site_manifest_path(output_dir, product.site_id))
    if (
        existing_fingerprint_value(existing_manifest) == fingerprint.value
        and manifest_has_resolutions(existing_manifest, output_dir, product.site_id, requested)
        and not force
    ):
        entry = global_entry_from_site_manifest(existing_manifest) if existing_manifest else None
        status = "dry-run-skip" if dry_run else "skipped"
        return SiteResult(product.site_id, status, "product fingerprint unchanged", entry, fingerprint=fingerprint)

    def build_from_archive(archive_path: Path, source_label: str, download_note: str = "") -> SiteResult:
        previews, missing = parse_requested_previews(archive_path, requested)
        entry = write_site_artifacts(output_dir, product, fingerprint, previews, built_at)
        counts = ", ".join(f"{len(preview.records)} {resolution} records" for resolution, preview in previews.items())
        reason = f"built {counts} from {source_label}"
        if missing:
            reason += "; missing " + ", ".join(sorted(missing))
        if download_note:
            reason += f"; {download_note}"
        return SiteResult(
            product.site_id,
            "built",
            reason,
            entry,
            previews=previews,
            missing_resolutions=missing,
            fingerprint=fingerprint,
            cache_path=archive_path,
        )

    local_lookup = find_local_archive(product, archive_index, requested, log)
    if local_lookup.archive_path is not None:
        archive_path = local_lookup.archive_path
        if dry_run:
            return SiteResult(
                product.site_id,
                "dry-run-build",
                f"would build preview from local archive {archive_path.name}",
                fingerprint=fingerprint,
                cache_path=archive_path,
            )
        log(f"[{product.site_id}] using local archive {archive_path}")
        return build_from_archive(archive_path, "local archive")

    if archive_index is not None and offline:
        reason = local_archive_missing_reason(product, local_lookup, archive_index)
        if local_lookup.rejected_no_fluxmet:
            resolution = requested[0] if len(requested) == 1 else MONTHLY_RESOLUTION
            category = "no_fluxmet_mm" if resolution == MONTHLY_RESOLUTION else f"no_fluxmet_{resolution}"
            raise PreviewBuildError(reason, category=category)
        raise MissingLocalArchiveError(reason)

    archive_path = cache_archive_path(cache_dir, product, fingerprint)
    if offline:
        if dry_run:
            if is_valid_zip_file(archive_path):
                return SiteResult(
                    product.site_id,
                    "dry-run-build",
                    f"would build preview from cached archive {archive_path.name}",
                    fingerprint=fingerprint,
                    cache_path=archive_path,
                )
            raise MissingLocalArchiveError("offline mode found no matching local archive and no cached archive")
        remove_invalid_cached_archive(archive_path, log)
        if not archive_path.exists():
            raise MissingLocalArchiveError("offline mode found no matching local archive and no cached archive")
        log(f"[{product.site_id}] using cached archive {archive_path}")
        return build_from_archive(archive_path, "cached archive")
    if dry_run:
        return SiteResult(product.site_id, "dry-run-build", "would download/build preview", fingerprint=fingerprint)

    remove_invalid_cached_archive(archive_path, log)
    download_note = ""
    if archive_path.exists():
        log(f"[{product.site_id}] using cached archive {archive_path}")
    else:
        log(f"[{product.site_id}] downloading Shuttle product")
        download_note = (download_func or default_download)(product, archive_path) or ""
        if not archive_path.exists():
            raise DownloadFailedError("download did not create an archive")
        if not is_valid_zip_file(archive_path):
            try:
                archive_path.unlink()
            except OSError as error:
                raise DownloadFailedError(f"downloaded archive is invalid and could not be deleted: {error}") from error
            raise NonZipResponseError("downloaded response is not a zip archive")
    return build_from_archive(archive_path, "archive", download_note)


def run_build(
    snapshot: Path,
    output_dir: Path,
    cache_dir: Path,
    archive_dir: Optional[Path] = None,
    offline: bool = False,
    sites: Sequence[str] = (),
    limit: int = 0,
    force: bool = False,
    resolutions: Sequence[str] = (MONTHLY_RESOLUTION,),
    dry_run: bool = False,
    built_at: Optional[str] = None,
    download_func: Optional[DownloadFunc] = None,
    log: LogFunc = log_stdout,
) -> BuildSummary:
    rows = load_snapshot_rows(snapshot)
    products = eligible_products(rows, sites, limit)
    archive_index = build_local_archive_index(archive_dir)
    summary = BuildSummary()
    built_at_value = built_at or utc_now()
    entries_to_update: Dict[str, Dict[str, Any]] = {}
    requested = parse_resolutions(",".join(resolutions))
    if not products:
        log("No eligible Shuttle products found for the requested filters.")
        return summary
    for product in products:
        try:
            result = build_product_preview(
                product,
                output_dir,
                cache_dir,
                archive_index,
                offline,
                requested,
                force=force,
                dry_run=dry_run,
                built_at=built_at_value,
                download_func=download_func,
                log=log,
            )
        except PreviewBuildError as error:
            result = SiteResult(product.site_id, error.category, str(error))
        except Exception as error:  # site-scoped by design
            result = SiteResult(product.site_id, "failed", str(error))
        summary.add(result)
        if result.global_entry and result.status in {"built", "skipped"}:
            entries_to_update[result.site_id] = result.global_entry
        log(f"[{result.site_id}] {result.status}: {result.reason}")
    if entries_to_update and not dry_run:
        write_global_manifest(output_dir, built_at_value, entries_to_update)
    return summary


def print_summary(summary: BuildSummary, log: LogFunc = log_stdout) -> None:
    counts = summary.counts()
    log(
        "Summary: built={built}, skipped={skipped}, failed={failed}, unavailable={unavailable}, "
        "requires_icos_license_auth={requires_icos_license_auth}, download_failed={download_failed}, "
        "non_zip_response={non_zip_response}, malformed_zip={malformed_zip}, "
        "missing_local_archive={missing_local_archive}, no_fluxmet_mm={no_fluxmet_mm}, "
        "no_fluxmet_weekly={no_fluxmet_weekly}, no_fluxmet_daily={no_fluxmet_daily}, "
        "no_fluxmet_annual={no_fluxmet_annual}, "
        "no_target_variables={no_target_variables}, parse_date_failure={parse_date_failure}, "
        "dry_run_build={dry_run_build}, dry_run_skip={dry_run_skip}".format(**counts)
    )
    grouped_results = (
        ("failed", summary.failed),
        ("unavailable", summary.unavailable),
        ("requires_icos_license_auth", summary.requires_icos_license_auth),
        ("download_failed", summary.download_failed),
        ("non_zip_response", summary.non_zip_response),
        ("malformed_zip", summary.malformed_zip),
        ("missing_local_archive", summary.missing_local_archive),
        ("no_fluxmet_mm", summary.no_fluxmet_mm),
        ("no_fluxmet_weekly", summary.no_fluxmet_weekly),
        ("no_fluxmet_daily", summary.no_fluxmet_daily),
        ("no_fluxmet_annual", summary.no_fluxmet_annual),
        ("no_target_variables", summary.no_target_variables),
        ("parse_date_failure", summary.parse_date_failure),
    )
    for label, results in grouped_results:
        for result in results:
            log(f"  {label}: {result.site_id}: {result.reason}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        resolutions = parse_resolutions(args.resolution)
        summary = run_build(
            snapshot=args.snapshot,
            output_dir=args.output_dir,
            cache_dir=args.cache_dir,
            archive_dir=args.archive_dir,
            offline=args.offline,
            sites=args.site,
            limit=args.limit,
            force=args.force,
            resolutions=resolutions,
            dry_run=args.dry_run,
        )
        print_summary(summary)
        return 1 if summary.has_errors() else 0
    except Exception as error:
        print(f"preview builder failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
