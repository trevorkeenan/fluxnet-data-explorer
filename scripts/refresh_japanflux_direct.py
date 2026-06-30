#!/usr/bin/env python3
"""Refresh a cached JapanFlux-direct snapshot for the FLUXNET Data Explorer."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

try:
    from .inventory_fingerprint import compact_rows_to_records, inventory_version
    from .refresh_logging import compact_error, compact_text, log, phase
except ImportError:  # pragma: no cover - supports direct script execution
    from inventory_fingerprint import compact_rows_to_records, inventory_version
    from refresh_logging import compact_error, compact_text, log, phase

ADS_API_BASE = "https://ads.nipr.ac.jp/api/v1"
ADS_DATASET_BASE = "https://ads.nipr.ac.jp/dataset"
JAPANFLUX_SOURCE = "JapanFlux"
JAPANFLUX_SOURCE_ORIGIN = "japanflux_direct"
JAPANFLUX_SOURCE_PRIORITY = 250
PROCESSING_LINEAGE_OTHER_PROCESSED = "other_processed"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_RETRIES = 5
DEFAULT_RETRY_DELAY_SECONDS = 2.0
DEFAULT_MAX_FAILURES = 3
DIRECT_DOWNLOAD_PROBE_TIMEOUT_SECONDS = 5
USER_AGENT = "trevorkeenan.github.io/fluxnet-explorer-japanflux-refresh"
DIRECT_DOWNLOAD_PATH = "data/zip/DATA"

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
    "metadata_id",
    "version",
    "direct_download_url",
    "landing_page_url",
)

JAPANFLUX_FILE_RE = re.compile(
    r"^FLX_(?P<site_id>[^_]+)_JapanFLUX2024_(?P<product>[^_]+)_(?P<resolution>[^_]+)_(?P<first>\d{4})-(?P<last>\d{4})_(?P<version>[^.]+)\.csv$",
    re.IGNORECASE,
)

SITE_INVENTORY_TSV = """metadata_id\tsite_id\tsite_name\tigbp\tlatitude\tlongitude
A20240722-001\tJP-Ozm\tOizumi Urban Park\tURB\t34.563470\t135.533484
A20240722-002\tJP-BBY\tBibai bog\tWET\t43.322960\t141.810790
A20240722-003\tJP-Om1\tB11 building OMU\tURB\t34.547178\t135.502861
A20240722-004\tJP-Om2\tFarm field OMU\tGRA\t34.542453\t135.508228
A20241022-001\tJP-Api\tAppi forest\tDBF\t40.001359\t140.936586
A20241022-002\tJP-Fjy\tFujiyoshida forest\tENF\t35.454540\t138.762250
A20241022-003\tKH-Kmp\tKampong Thom forest\tEBF\t12.744580\t105.478566
A20241022-004\tJP-Kwg\tKawagoe forest\tDBF\t35.872500\t139.486900
A20241022-005\tJP-Kzw\tKaruizawa\tDBF\t36.406667\t138.572500
A20241022-006\tMY-LHP\tLambir Hills National Park\tEBF\t4.201007\t114.039079
A20241022-007\tJP-MBF\tMoshiri Birch Forest\tDBF\t44.384167\t142.318611
A20241022-008\tJP-MMF\tMoshiri Mixed Forest\tMF\t44.321944\t142.261389
A20241022-009\tJP-Mra\tMuramatsu agricultural field\tCRO\t37.690275\t139.194429
A20241022-010\tRU-NeB\tNeleger Burnt Forest\tGRA\t62.325937\t129.487342
A20241022-011\tRU-NeC\tNeleger Cutover\tOSH\t62.314844\t129.500075
A20241022-012\tRU-NeF\tNeleger larch forest\tDNF\t62.315615\t129.499964
A20241022-013\tID-PaB\tPalangkaraya Drained Burnt forest\tOSH\t-2.340796\t114.037900
A20241022-014\tCN-HaM\tQinghai Flux Research Site\tGRA\t37.607432\t101.332000
A20241022-015\tJP-Sac\tSakai City Office\tURB\t34.573914\t135.482889
A20241022-016\tJP-Sb1\tSarobetsu Mire Moss\tWET\t45.104722\t141.688194
A20241022-017\tJP-Sb2\tSarobetsu Mire Sasa\tWET\t45.103611\t141.680833
A20241022-018\tJP-Srk\tShirakami Beech Forest\tDBF\t40.565485\t140.127794
A20241022-019\tJP-SwL\tSuwa Lake Site\tWAT\t36.046572\t138.108353
A20241022-020\tJP-Ta2\tTakayama evergreen coniferous\tENF\t36.139722\t137.370833
A20241022-021\tJP-Tak\tTakayama deciduous broadleaf\tDBF\t36.146167\t137.423111
A20241022-022\tJP-Tmk\tTomakomai Flux Research Site\tDNF\t42.736972\t141.516944
A20241022-023\tRU-Tur\tTura\tDNF\t64.208888\t100.463555
A20241022-024\tJP-Yms\tYamashiro forest\tDBF\t34.790278\t135.840939
A20241022-025\tJP-Ynf\tYona-Field Tower Site\tEBF\t26.751000\t128.212667
A20241022-026\tMN-Hst\tHustai grassland\tGRA\t47.594131\t105.856439
A20241022-027\tMN-Nkh\tNalaikh grassland\tGRA\t47.693592\t107.489342
A20241022-028\tJP-Hc3\tHachihama Double Crop\tCRO\t34.539672\t133.911731
A20241022-029\tRU-Ege\tElgeeii forest station\tDNF\t60.015516\t133.824012
A20241022-030\tJP-KaL\tKoshin Lake Kasumigaura\tWAT\t36.037778\t140.404167
A20241022-031\tJP-Nkm\tNishikoma Site\tENF\t35.808064\t137.833883
A20241022-032\tID-PaD\tPalangkaraya Drained forest\tEBF\t-2.346071\t114.036408
A20241022-033\tID-Pag\tPalangkaraya Undrained Forest\tEBF\t-2.323917\t113.904392
A20241022-034\tJP-SMF\tSeto Mixed Forest Site\tMF\t35.261528\t137.078750
A20241022-035\tRU-SkP\tYakutsk Spasskaya Pad larch\tDNF\t62.254710\t129.618543
A20241022-036\tRU-Sk2\tYakutsk Spasskaya Pad Pine\tENF\t62.241291\t129.651336
A20241022-037\tJP-Hc1\tHachihama Intl Rice Experiment\tCRO\t34.537892\t133.926797
A20241022-038\tJP-KaP\tKasumigaura lotus paddy\tCRO\t36.080000\t140.240000
A20241022-039\tJP-Km1\tKushiro Mire Onnenai Fen\tWET\t43.107511\t144.330906
A20241022-040\tJP-Nsb\tNIAES Soybean\tCRO\t36.024303\t140.114975
A20241022-041\tCN-In1\tInner Mongolia dune\tBSV\t42.929708\t120.707350
A20241022-042\tCN-In2\tInner Mongolia grassland\tGRA\t42.933964\t120.710964
A20241022-043\tCN-In3\tInner Mongolia soybean\tCRO\t42.925572\t120.699039
A20241022-044\tCN-In4\tInner Mongolia maize\tCRO\t42.944133\t120.726622
A20241022-045\tCN-In5\tInner Mongolia no grazing\tGRA\t42.934158\t120.709078
A20241022-046\tCN-In6\tInner Mongolia heavy grazing\tGRA\t42.934014\t120.711547
A20241022-047\tCN-In7\tInner Mongolia light grazing\tGRA\t42.933919\t120.709606
A20241022-048\tCN-In8\tInner Mongolia medium grazing\tGRA\t42.933967\t120.710531
A20241022-049\tJP-Hc2\tHachihama Experimental Farm\tCRO\t34.537518\t133.927545
A20241210-001\tJP-Ako\tAkou green belt\tEBF\t34.735192\t134.374798
A20241210-002\tJP-Fhk\tFuji Hokuroku Flux Obs Site\tDNF\t35.443556\t138.764693
A20241210-003\tJP-Fmt\tField Museum Tama Hills\tMF\t35.638745\t139.379748
A20241210-004\tMN-Kbu\tKherlenbayan Ulaan\tGRA\t47.213972\t108.737333
A20241210-005\tJP-Khw\tKahoku Experiment watershed\tENF\t33.136580\t130.708340
A20241210-006\tCN-Lsh\tLaoshan\tDNF\t45.279839\t127.578206
A20241210-007\tJP-Mse\tMase paddy flux site\tCRO\t36.053930\t140.026930
A20241210-008\tJP-Nuf\tNagoya University Forest\tDBF\t35.152417\t136.971889
A20241210-009\tJP-Shn\tShinshu Univ Experimental Forest\tMF\t35.865755\t137.932563
A20241210-010\tJP-Spp\tSapporo forest\tDBF\t42.986843\t141.385331
A20241210-011\tMN-Skt\tSouthern Khentei Taiga\tDNF\t48.351861\t108.654333
A20241210-012\tJP-Tdf\tToyota Deciduous Forest\tDBF\t35.035889\t137.185778
A20241210-013\tJP-Tgf\tTERC Univ of Tsukuba\tGRA\t36.113530\t140.094880
A20241210-014\tJP-Toc\tTomakomai Crane site\tDBF\t42.709727\t141.565898
A20241210-015\tJP-Tom\tTomakomai Experimental Forest\tDBF\t42.698906\t141.571488
A20241210-016\tJP-Tef\tTeshio Experimental Forest\tDNF\t45.055808\t142.107122
A20241210-017\tMN-Udg\tUdleg practice forest\tDNF\t48.256389\t106.851111
A20241210-018\tJP-Kgu\tKugahara urban residential\tURB\t35.582859\t139.693543
A20241210-019\tJP-Yrp\tYawara Rice paddy\tCRO\t36.007667\t140.030175
A20241210-020\tJP-Hrt\tHiratsuka Rice Paddy\tCRO\t35.362778\t139.338056
A20241210-021\tTH-Kms\tKamphaeng Saen Rice Paddy\tCRO\t14.009167\t99.984167
A20241210-022\tJP-Tkb\tTsukuba Experimental Watershed\tENF\t36.173379\t140.176634
A20241210-023\tTH-Kog\tKog-Ma Watershed\tEBF\t18.800000\t98.900000
A20241210-024\tTH-Mae\tMae Moh plantation\tDBF\t18.383333\t99.716667
A20241210-025\tJP-Nap\tNunoike Agricultural Pond\tWAT\t34.774850\t134.892442
A20241210-026\tJP-Km2\tKushiro Mire Akanuma Bog\tWET\t43.100000\t144.350000
A20241210-027\tRU-USk\tUlakhan Sykkhan Alas\tGRA\t62.150995\t130.527517
A20241210-028\tJP-NsM\tNasu Research Manure Plot\tGRA\t36.915833\t139.935833
A20241210-029\tJP-NsC\tNasu Research Chemical Fert Plot\tGRA\t36.915000\t139.936667
A20241210-030\tJP-Tmd\tTomakomai Flux Research Disturbed\tDNF\t42.735911\t141.523147
"""


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
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
        "--max-failures",
        type=int,
        default=DEFAULT_MAX_FAILURES,
        help=f"Abort after this many site failures to avoid spending the whole job on an upstream outage (default: {DEFAULT_MAX_FAILURES}).",
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
    parser.add_argument(
        "--strict-refresh",
        action="store_true",
        help="Fail instead of carrying forward the previous valid snapshot when ADS is temporarily unavailable.",
    )
    parser.add_argument(
        "--status-output",
        default="",
        help="Optional diagnostic JSON path describing the JapanFlux source refresh status.",
    )
    return parser.parse_args(argv)


class ResponseParseError(RuntimeError):
    """Raised when an upstream ADS response is not valid JSON."""


class UpstreamUnavailableError(RuntimeError):
    """Raised when ADS appears temporarily unavailable after bounded retries."""


def maybe_float(value: Any) -> Optional[float]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def derive_country(site_id: str) -> str:
    raw = str(site_id or "").strip()
    if not raw:
        return ""
    if "-" in raw:
        return raw.split("-", 1)[0].upper()
    if "_" in raw:
        return raw.split("_", 1)[0].upper()
    return raw[:2].upper()


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


def choose_requested_refresh_fields(requested_updated_at: str, requested_updated_date: str) -> Tuple[str, str]:
    updated_at = normalize_snapshot_updated_at(requested_updated_at)
    if not updated_at:
        updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    updated_date = normalize_snapshot_updated_date(requested_updated_date, updated_at)
    return updated_at, updated_date


def load_existing_payload(output_path: Path) -> Dict[str, Any]:
    if not output_path.exists():
        return {}
    try:
        payload = json.loads(output_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def load_source_statuses(meta: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    raw = meta.get("source_statuses")
    if not isinstance(raw, dict):
        return {}
    statuses: Dict[str, Dict[str, Any]] = {}
    for source_name, value in raw.items():
        if isinstance(value, dict):
            statuses[str(source_name)] = dict(value)
    return statuses


def choose_snapshot_updated_fields(
    existing_meta: Dict[str, Any],
    existing_inventory_version: str,
    new_inventory_version: str,
    requested_updated_at: str,
    requested_updated_date: str,
) -> Tuple[str, str]:
    existing_updated_at = normalize_snapshot_updated_at(str(existing_meta.get("snapshot_updated_at") or ""))
    existing_updated_date = normalize_snapshot_updated_date(
        str(existing_meta.get("snapshot_updated_date") or ""),
        existing_updated_at,
    )
    if existing_inventory_version == new_inventory_version and existing_updated_at and existing_updated_date:
        return existing_updated_at, existing_updated_date

    updated_at = normalize_snapshot_updated_at(requested_updated_at)
    if not updated_at:
        updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    updated_date = normalize_snapshot_updated_date(requested_updated_date, updated_at)
    return updated_at, updated_date


def parse_site_inventory() -> List[Dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(SITE_INVENTORY_TSV), delimiter="\t")
    records: List[Dict[str, Any]] = []
    for row in reader:
        site_id = str(row.get("site_id") or "").strip()
        metadata_id = str(row.get("metadata_id") or "").strip()
        if not site_id or not metadata_id:
            continue
        records.append(
            {
                "metadata_id": metadata_id,
                "site_id": site_id,
                "site_name": str(row.get("site_name") or "").strip(),
                "vegetation_type": str(row.get("igbp") or "").strip(),
                "country": derive_country(site_id),
                "latitude": maybe_float(row.get("latitude")),
                "longitude": maybe_float(row.get("longitude")),
            }
        )
    return records


def parse_version_tuple(value: str) -> Tuple[int, ...]:
    parts = []
    for token in str(value or "").strip().split("."):
        token = token.strip()
        if not token:
            continue
        try:
            parts.append(int(token))
        except ValueError:
            parts.append(0)
    return tuple(parts)


def should_retry_http_status(status_code: int) -> bool:
    return status_code >= 500 or status_code in (408, 409, 425, 429)


def is_temporary_ads_http_error(status_code: int, detail: str) -> bool:
    lowered = str(detail or "").casefold()
    return (
        status_code >= 500
        or status_code in (408, 425, 429)
        or "ads is under maintenance" in lowered
        or "maintenance" in lowered and status_code == 503
    )


def read_http_error_preview(error: HTTPError) -> str:
    try:
        raw = error.read()
    except Exception:  # pragma: no cover - defensive fallback for unusual HTTPError objects
        return compact_text(error, 300)
    return compact_text(raw.decode("utf-8", "replace"), 300)


def request_json(url: str, timeout: int, retries: int, retry_delay: float, label: str) -> Any:
    last_error: Optional[Exception] = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            request = Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": USER_AGENT,
                },
                method="GET",
            )
            with urlopen(request, timeout=timeout) as response:
                raw = response.read()
                text = raw.decode("utf-8", "replace")
                try:
                    return json.loads(text)
                except json.JSONDecodeError as err:
                    if "ads is under maintenance" in text.casefold():
                        raise UpstreamUnavailableError(
                            f"ADS returned a maintenance page for {label}; bytes={len(raw)}; preview={compact_text(text, 300)}"
                        ) from err
                    raise ResponseParseError(
                        f"Invalid JSON from ADS {label}; bytes={len(raw)}; preview={compact_text(text, 300)}; parse_error={err}"
                    ) from err
        except HTTPError as err:
            detail = read_http_error_preview(err)
            last_error = RuntimeError(f"HTTP {err.code}: {detail}")
            if attempt >= retries or not should_retry_http_status(err.code):
                if is_temporary_ads_http_error(err.code, detail):
                    raise UpstreamUnavailableError(
                        f"ADS unavailable after {attempt} attempt(s) ({label}): HTTP {err.code}: {detail}"
                    ) from err
                break
            delay = min(30.0, retry_delay * (2 ** (attempt - 1)))
            log(f"ADS retry {attempt}/{retries} ({label}) after {delay:.1f}s: {compact_error(last_error)}")
            time.sleep(delay)
        except UpstreamUnavailableError:
            raise
        except ResponseParseError:
            raise
        except (URLError, TimeoutError, OSError) as err:
            last_error = err
            if attempt >= retries:
                raise UpstreamUnavailableError(
                    f"ADS network request failed after {attempt} attempt(s) ({label}): {compact_error(err)}"
                ) from err
            delay = min(30.0, retry_delay * (2 ** (attempt - 1)))
            log(f"ADS retry {attempt}/{retries} ({label}) after {delay:.1f}s: {compact_error(err)}")
            time.sleep(delay)
    raise RuntimeError(f"ADS request failed after {retries} attempt(s) ({label}): {last_error}")


def looks_like_ads_outage(error: object) -> bool:
    if isinstance(error, UpstreamUnavailableError):
        return True
    text = str(error or "").casefold()
    return (
        "ads is under maintenance" in text
        or "http 503" in text
        or "http error 503" in text
        or "ads network request failed" in text
    )


def extract_latest_version(metadata_id: str, timeout: int, retries: int, retry_delay: float) -> str:
    url = f"{ADS_API_BASE}/metadata/{quote(metadata_id)}/versions"
    payload = request_json(url, timeout, retries, retry_delay, f"{metadata_id} versions")
    records = payload.get("record") if isinstance(payload, dict) else None
    versions: List[str] = []
    if isinstance(records, list):
        for record in records:
            if not isinstance(record, dict):
                continue
            constraint = record.get("constraint")
            if not isinstance(constraint, dict):
                continue
            version = str(constraint.get("version") or "").strip()
            if version:
                versions.append(version)
    if not versions:
        raise RuntimeError(f"No versions returned for {metadata_id}")
    return sorted(versions, key=parse_version_tuple)[-1]


def list_directory(
    metadata_id: str,
    version: str,
    timeout: int,
    retries: int,
    retry_delay: float,
    *,
    object_type: str,
    path: str = "",
) -> List[Dict[str, Any]]:
    url = f"{ADS_API_BASE}/metadata/{quote(metadata_id)}/{quote(version)}/directory?object_type={quote(object_type)}"
    if path:
        url += f"&path={quote(path)}"
    payload = request_json(url, timeout, retries, retry_delay, f"{metadata_id} {version} directory {object_type} {path or '<root>'}")
    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected directory payload for {metadata_id} {version}: {type(payload).__name__}")
    return [entry for entry in payload if isinstance(entry, dict)]


def parse_japanflux_filename(file_name: str) -> Optional[Dict[str, Any]]:
    match = JAPANFLUX_FILE_RE.match(str(file_name or "").strip())
    if not match:
        return None
    return {
        "site_id": match.group("site_id"),
        "product": match.group("product").upper(),
        "resolution": match.group("resolution").upper(),
        "first_year": int(match.group("first")),
        "last_year": int(match.group("last")),
        "version": match.group("version"),
    }


def collect_measurement_years(allvars_entries: Iterable[Dict[str, Any]], site_id: str) -> Tuple[int, int]:
    first_years: List[int] = []
    last_years: List[int] = []
    expected_site_id = str(site_id or "").strip()
    for entry in allvars_entries:
        if bool(entry.get("directory")):
            continue
        parsed = parse_japanflux_filename(str(entry.get("name") or ""))
        if not parsed:
            continue
        if parsed["site_id"] != expected_site_id:
            continue
        if parsed["product"] == "ERA5":
            continue
        first_years.append(parsed["first_year"])
        last_years.append(parsed["last_year"])
    if not first_years or not last_years:
        raise RuntimeError(f"No non-ERA5 ALLVARS files found for {expected_site_id}")
    return min(first_years), max(last_years)


def landing_page_url(metadata_id: str) -> str:
    return f"{ADS_DATASET_BASE}/{metadata_id}"


def build_direct_download_url(metadata_id: str, version: str) -> str:
    return f"{ADS_API_BASE}/metadata/{quote(metadata_id)}/{quote(version)}/{DIRECT_DOWNLOAD_PATH}"


def probe_direct_download_url(url: str, timeout: int) -> Optional[str]:
    def valid_headers(response: Any) -> bool:
        content_type = str(response.headers.get("Content-Type") or "").lower()
        content_disposition = str(response.headers.get("Content-Disposition") or "").lower()
        final_url = str(response.geturl() or "")
        if "text/html" in content_type:
            return False
        if "application/zip" in content_type or "application/octet-stream" in content_type:
            return True
        if "attachment" in content_disposition or ".zip" in content_disposition:
            return True
        return final_url.lower().endswith(".zip")

    head_request = Request(
        url,
        headers={
            "Accept": "*/*",
            "User-Agent": USER_AGENT,
        },
        method="HEAD",
    )
    try:
        with urlopen(head_request, timeout=timeout) as response:
            if valid_headers(response):
                return str(response.geturl() or url)
    except HTTPError as err:
        if err.code not in (400, 403, 404, 405):
            detail = read_http_error_preview(err)
            if is_temporary_ads_http_error(err.code, detail):
                raise UpstreamUnavailableError(
                    f"ADS direct download probe unavailable: HTTP {err.code}: {detail}"
                ) from err
            raise
    except (URLError, TimeoutError, OSError):
        pass

    get_request = Request(
        url,
        headers={
            "Accept": "*/*",
            "Range": "bytes=0-0",
            "User-Agent": USER_AGENT,
        },
        method="GET",
    )
    try:
        with urlopen(get_request, timeout=timeout) as response:
            if valid_headers(response):
                chunk = response.read(64)
                if chunk.lstrip().lower().startswith((b"<!doctype html", b"<html")):
                    return None
                return str(response.geturl() or url)
    except HTTPError as err:
        detail = read_http_error_preview(err)
        if is_temporary_ads_http_error(err.code, detail):
            raise UpstreamUnavailableError(
                f"ADS direct download probe unavailable: HTTP {err.code}: {detail}"
            ) from err
        return None
    except (URLError, TimeoutError, OSError):
        return None
    return None


def validate_direct_download_url(
    metadata_id: str,
    version: str,
    timeout: int,
) -> str:
    return probe_direct_download_url(build_direct_download_url(metadata_id, version), timeout=timeout) or ""


def load_previous_direct_downloads(output_path: Path) -> Dict[Tuple[str, str], str]:
    """Load last-known-good direct URLs keyed by stable dataset identity/version.

    ADS occasionally rate-limits or times out individual ZIP probes while the
    catalog APIs remain healthy. A failed probe is therefore not evidence that
    an already validated endpoint disappeared. Keeping that endpoint prevents
    transient probe flaps from changing the published availability inventory.
    """

    payload = load_existing_payload(output_path)
    records = compact_rows_to_records(payload)
    direct_downloads: Dict[Tuple[str, str], str] = {}
    for record in records:
        metadata_id = str(record.get("metadata_id") or "").strip()
        version = str(record.get("version") or "").strip()
        direct_url = str(record.get("direct_download_url") or "").strip()
        if metadata_id and version and direct_url:
            direct_downloads[(metadata_id, version)] = direct_url
    return direct_downloads


def retain_previous_direct_download(
    metadata_id: str,
    version: str,
    validated_url: str,
    previous_direct_downloads: Dict[Tuple[str, str], str],
) -> Tuple[str, bool]:
    """Prefer a current validation, else retain the same dataset/version URL."""

    current = str(validated_url or "").strip()
    if current:
        return current, False
    previous = str(previous_direct_downloads.get((metadata_id, version), "") or "").strip()
    return previous, bool(previous)


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
    existing_payload = load_existing_payload(path)
    existing_meta = existing_payload.get("meta") if isinstance(existing_payload.get("meta"), dict) else {}
    new_inventory_version = inventory_version(rows, OUTPUT_COLUMNS)
    existing_inventory_version = str(existing_meta.get("inventory_version") or "").strip()
    if not existing_inventory_version and existing_payload:
        existing_inventory_version = inventory_version(
            compact_rows_to_records(existing_payload),
            existing_payload.get("columns") if isinstance(existing_payload.get("columns"), list) else None,
        )
    updated_at, updated_date = choose_snapshot_updated_fields(
        existing_meta,
        existing_inventory_version,
        new_inventory_version,
        snapshot_updated_at,
        snapshot_updated_date,
    )
    payload = {
        "meta": {
            "schema_version": 1,
            "version": version_value,
            "inventory_version": new_inventory_version,
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


def site_ids_from_rows(rows: Sequence[Dict[str, Any]]) -> set[str]:
    return {str(row.get("site_id") or "").strip() for row in rows if str(row.get("site_id") or "").strip()}


def site_ids_from_payload(columns: Sequence[str], rows: Sequence[Sequence[Any]]) -> set[str]:
    try:
        site_id_index = list(columns).index("site_id")
    except ValueError:
        return set()
    return {str(row[site_id_index] or "").strip() for row in rows if len(row) > site_id_index and str(row[site_id_index] or "").strip()}


def fallback_last_success(existing_meta: Dict[str, Any], existing_status: Dict[str, Any] | None) -> Tuple[str, str]:
    if existing_status:
        status_at = normalize_snapshot_updated_at(str(existing_status.get("last_successful_refresh_at") or ""))
        status_date = normalize_snapshot_updated_date(
            str(existing_status.get("last_successful_refresh_date") or ""),
            status_at,
        )
        if status_at or status_date:
            return status_at, status_date
    meta_at = normalize_snapshot_updated_at(str(existing_meta.get("snapshot_updated_at") or ""))
    meta_date = normalize_snapshot_updated_date(str(existing_meta.get("snapshot_updated_date") or ""), meta_at)
    return meta_at, meta_date


def build_fresh_status(
    rows: Sequence[Dict[str, Any]],
    *,
    snapshot_updated_at: str,
    snapshot_updated_date: str,
) -> Dict[str, Any]:
    return {
        "status": "fresh",
        "source": JAPANFLUX_SOURCE,
        "last_successful_refresh_at": normalize_snapshot_updated_at(snapshot_updated_at),
        "last_successful_refresh_date": normalize_snapshot_updated_date(snapshot_updated_date, snapshot_updated_at),
        "published_row_count": len(rows),
        "published_site_count": len(site_ids_from_rows(rows)),
    }


def build_carried_forward_status(
    rows: Sequence[Sequence[Any]],
    columns: Sequence[str],
    existing_meta: Dict[str, Any],
    *,
    reason: str,
    requested_at: str,
    requested_date: str,
    output_csv: Path,
    output_json: Path,
) -> Dict[str, Any]:
    existing_status = load_source_statuses(existing_meta).get(JAPANFLUX_SOURCE)
    last_success_at, last_success_date = fallback_last_success(existing_meta, existing_status)
    return {
        "status": "carried_forward",
        "source": JAPANFLUX_SOURCE,
        "last_successful_refresh_at": last_success_at,
        "last_successful_refresh_date": last_success_date,
        "published_row_count": len(rows),
        "published_site_count": len(site_ids_from_payload(columns, rows)),
        "candidate_row_count": 0,
        "candidate_site_count": 0,
        "carried_forward_at": requested_at,
        "carried_forward_date": requested_date,
        "previous_snapshot_refreshed_at": normalize_snapshot_updated_at(str(existing_meta.get("snapshot_refreshed_at") or "")),
        "previous_snapshot_refreshed_date": normalize_snapshot_updated_date(
            str(existing_meta.get("snapshot_refreshed_date") or ""),
            str(existing_meta.get("snapshot_refreshed_at") or ""),
        ),
        "previous_snapshot_json": str(output_json),
        "previous_snapshot_csv": str(output_csv),
        "reason": reason,
    }


def build_fatal_status(reason: str, *, failed_at: str, failed_date: str) -> Dict[str, Any]:
    return {
        "status": "failed_fatally",
        "source": JAPANFLUX_SOURCE,
        "failed_at": failed_at,
        "failed_date": failed_date,
        "reason": reason,
    }


def source_status_output_payload(source_status: Dict[str, Any]) -> Dict[str, Any]:
    status = str(source_status.get("status") or "").strip().lower()
    carried_forward_sources = [JAPANFLUX_SOURCE] if status == "carried_forward" else []
    fatal_sources = [JAPANFLUX_SOURCE] if status == "failed_fatally" else []
    return {
        "source_statuses": {JAPANFLUX_SOURCE: source_status},
        "carried_forward_sources": carried_forward_sources,
        "fatal_sources": fatal_sources,
    }


def write_status_output(path_value: str, source_status: Dict[str, Any]) -> None:
    if not str(path_value or "").strip():
        return
    path = Path(path_value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(source_status_output_payload(source_status), ensure_ascii=True, separators=(",", ":")), encoding="utf-8")


def load_previous_valid_snapshot(output_json: Path, output_csv: Path) -> Tuple[Dict[str, Any], List[str], List[List[Any]], int]:
    if not output_json.exists():
        raise RuntimeError(f"No previous valid JapanFlux JSON snapshot exists at {output_json}")
    if not output_csv.exists():
        raise RuntimeError(f"No previous valid JapanFlux CSV snapshot exists at {output_csv}")

    try:
        payload = json.loads(output_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        raise RuntimeError(f"Previous JapanFlux JSON snapshot is not readable JSON: {output_json}: {err}") from err
    if not isinstance(payload, dict):
        raise RuntimeError(f"Previous JapanFlux JSON snapshot must be an object: {output_json}")

    meta = payload.get("meta")
    columns = payload.get("columns")
    rows = payload.get("rows")
    if not isinstance(meta, dict):
        raise RuntimeError(f"Previous JapanFlux JSON snapshot is missing object meta: {output_json}")
    if not str(meta.get("version") or "").strip():
        raise RuntimeError(f"Previous JapanFlux JSON snapshot is missing meta.version: {output_json}")
    if not isinstance(columns, list) or [str(column) for column in columns] != list(OUTPUT_COLUMNS):
        raise RuntimeError(f"Previous JapanFlux JSON snapshot columns do not match expected schema: {output_json}")
    if not isinstance(rows, list) or not rows:
        raise RuntimeError(f"Previous JapanFlux JSON snapshot has no rows to carry forward: {output_json}")

    normalized_rows: List[List[Any]] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, list) or len(row) != len(OUTPUT_COLUMNS):
            raise RuntimeError(f"Previous JapanFlux JSON row {index} does not match expected schema: {output_json}")
        normalized_rows.append(list(row))

    try:
        with output_csv.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            csv_columns = [str(column or "").strip() for column in (reader.fieldnames or [])]
            if csv_columns != list(OUTPUT_COLUMNS):
                raise RuntimeError(f"Previous JapanFlux CSV columns do not match expected schema: {output_csv}")
            csv_row_count = sum(1 for _ in reader)
    except OSError as err:
        raise RuntimeError(f"Previous JapanFlux CSV snapshot is not readable: {output_csv}: {err}") from err

    if csv_row_count != len(normalized_rows):
        raise RuntimeError(
            f"Previous JapanFlux JSON/CSV row counts differ: json_rows={len(normalized_rows)} csv_rows={csv_row_count}"
        )

    return payload, [str(column) for column in columns], normalized_rows, csv_row_count


def write_carried_forward_json(
    output_json: Path,
    output_csv: Path,
    payload: Dict[str, Any],
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
    source_status: Dict[str, Any],
    *,
    requested_at: str,
    requested_date: str,
) -> None:
    meta = dict(payload["meta"])
    source_statuses = load_source_statuses(meta)
    source_statuses[JAPANFLUX_SOURCE] = source_status
    meta["source_statuses"] = {source_name: source_statuses[source_name] for source_name in sorted(source_statuses)}
    meta["snapshot_refreshed_at"] = requested_at
    meta["snapshot_refreshed_date"] = requested_date
    meta["last_refresh_status"] = "carried_forward"
    output_payload = {
        "meta": meta,
        "columns": list(columns),
        "rows": [list(row) for row in rows],
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(output_payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
    log(f"Retained previous JapanFlux CSV without rewriting: {output_csv}")
    log(f"Updated JapanFlux JSON carry-forward metadata: {output_json}")


def build_site_row(
    inventory_record: Dict[str, Any],
    version: str,
    first_year: int,
    last_year: int,
    direct_download_url: str,
) -> Dict[str, Any]:
    metadata_id = str(inventory_record["metadata_id"])
    site_id = str(inventory_record["site_id"])
    direct_url = str(direct_download_url or "").strip()
    page_url = landing_page_url(metadata_id)
    has_direct_url = bool(direct_url)
    return {
        "site_id": site_id,
        "site_name": str(inventory_record["site_name"]),
        "country": str(inventory_record["country"]),
        "data_hub": JAPANFLUX_SOURCE,
        "network": JAPANFLUX_SOURCE,
        "source_network": JAPANFLUX_SOURCE,
        "processing_lineage": PROCESSING_LINEAGE_OTHER_PROCESSED,
        "vegetation_type": str(inventory_record["vegetation_type"]),
        "first_year": first_year,
        "last_year": last_year,
        "latitude": inventory_record["latitude"],
        "longitude": inventory_record["longitude"],
        "download_link": direct_url or page_url,
        "download_mode": "direct" if has_direct_url else "landing_page",
        "source": JAPANFLUX_SOURCE,
        "source_label": JAPANFLUX_SOURCE,
        "source_reason": (
            "Available from the JapanFlux2024 ADS archive; direct ZIP URL validated automatically."
            if has_direct_url
            else "Available from the JapanFlux2024 ADS landing page; direct ZIP URL could not be validated automatically."
        ),
        "source_priority": JAPANFLUX_SOURCE_PRIORITY,
        "source_origin": JAPANFLUX_SOURCE_ORIGIN,
        "metadata_id": metadata_id,
        "version": version,
        "direct_download_url": direct_url,
        "landing_page_url": page_url,
    }


def fetch_site_row(
    inventory_record: Dict[str, Any],
    timeout: int,
    retries: int,
    retry_delay: float,
    previous_direct_downloads: Dict[Tuple[str, str], str] | None = None,
) -> Dict[str, Any]:
    metadata_id = str(inventory_record["metadata_id"])
    site_id = str(inventory_record["site_id"])
    version = extract_latest_version(metadata_id, timeout, retries, retry_delay)
    data_entries = list_directory(
        metadata_id,
        version,
        timeout,
        retries,
        retry_delay,
        object_type="DATA",
    )
    if not data_entries:
        raise RuntimeError(f"{metadata_id} ({site_id}) returned no DATA entries")
    if not any(str(entry.get("authority") or "").strip().lower() == "allow" for entry in data_entries):
        raise RuntimeError(f"{metadata_id} ({site_id}) DATA entries are not public")
    if not any(str(entry.get("name") or "").strip().upper() == "ALLVARS" for entry in data_entries):
        raise RuntimeError(f"{metadata_id} ({site_id}) is missing ALLVARS")

    allvars_entries = list_directory(
        metadata_id,
        version,
        timeout,
        retries,
        retry_delay,
        object_type="DATA",
        path="ALLVARS",
    )
    first_year, last_year = collect_measurement_years(allvars_entries, site_id)

    direct_download_url = ""
    direct_download_url = validate_direct_download_url(
        metadata_id,
        version,
        timeout=max(1, min(timeout, DIRECT_DOWNLOAD_PROBE_TIMEOUT_SECONDS)),
    )
    direct_download_url, direct_download_carried_forward = retain_previous_direct_download(
        metadata_id,
        version,
        direct_download_url,
        previous_direct_downloads or {},
    )
    if direct_download_carried_forward:
        log(
            f"JapanFlux retained previously validated direct download for {site_id} "
            f"({metadata_id}) v{version} after an inconclusive probe."
        )

    row = build_site_row(inventory_record, version, first_year, last_year, direct_download_url)
    row["_direct_download_carried_forward"] = direct_download_carried_forward
    return row


def preflight_ads_availability(
    inventory: Sequence[Dict[str, Any]],
    timeout: int,
    retries: int,
    retry_delay: float,
) -> None:
    if not inventory:
        raise RuntimeError("JapanFlux static inventory is empty.")
    first_record = inventory[0]
    metadata_id = str(first_record["metadata_id"])
    site_id = str(first_record["site_id"])
    log(f"JapanFlux ADS preflight endpoint: {metadata_id} versions ({site_id})")
    version = extract_latest_version(metadata_id, timeout, retries, retry_delay)
    log(f"JapanFlux ADS preflight succeeded: {metadata_id} latest version={version}")


def carry_forward_previous_snapshot(
    *,
    args: argparse.Namespace,
    output_csv: Path,
    output_json: Path,
    reason: str,
    requested_at: str,
    requested_date: str,
) -> None:
    if bool(args.strict_refresh):
        raise UpstreamUnavailableError(
            "JapanFlux ADS unavailable and --strict-refresh is enabled; refusing to carry forward previous snapshot. "
            + reason
        )

    with phase("carry forward previous JapanFlux snapshot"):
        payload, columns, rows, csv_row_count = load_previous_valid_snapshot(output_json, output_csv)
        source_status = build_carried_forward_status(
            rows,
            columns,
            payload["meta"],
            reason=reason,
            requested_at=requested_at,
            requested_date=requested_date,
            output_csv=output_csv,
            output_json=output_json,
        )
        write_carried_forward_json(
            output_json,
            output_csv,
            payload,
            columns,
            rows,
            source_status,
            requested_at=requested_at,
            requested_date=requested_date,
        )
        write_status_output(args.status_output, source_status)
        log(
            "JapanFlux ADS unavailable; carrying forward previous valid snapshot. "
            f"previous_json={output_json} previous_csv={output_csv} "
            f"previous_snapshot_date={source_status.get('last_successful_refresh_date') or 'unavailable'} "
            f"rows={len(rows)} csv_rows={csv_row_count}. Workflow is continuing."
        )


def refresh(args: argparse.Namespace) -> None:
    output_csv = Path(args.output_csv)
    output_json = Path(args.output_json)
    requested_at, requested_date = choose_requested_refresh_fields(args.snapshot_updated_at, args.snapshot_updated_date)
    inventory = parse_site_inventory()
    log(f"JapanFlux inventory sites: {len(inventory)}")
    log(f"JapanFlux strict refresh mode: {bool(args.strict_refresh)}")

    try:
        with phase("preflight JapanFlux ADS availability"):
            preflight_ads_availability(
                inventory,
                timeout=max(1, args.timeout),
                retries=max(1, args.retries),
                retry_delay=max(0.1, args.retry_delay),
            )
    except UpstreamUnavailableError as err:
        reason = f"JapanFlux ADS is unavailable or under maintenance during preflight: {compact_error(err, 300)}"
        log("JapanFlux ADS unavailable; carrying forward previous valid snapshot")
        carry_forward_previous_snapshot(
            args=args,
            output_csv=output_csv,
            output_json=output_json,
            reason=reason,
            requested_at=requested_at,
            requested_date=requested_date,
        )
        return

    rows: List[Dict[str, Any]] = []
    failures: List[str] = []
    direct_download_count = 0
    landing_page_count = 0
    total = len(inventory)
    previous_direct_downloads = load_previous_direct_downloads(output_json)
    retained_direct_download_count = 0

    with phase("refresh JapanFlux sites"):
        for index, site_record in enumerate(inventory, start=1):
            site_id = str(site_record["site_id"])
            metadata_id = str(site_record["metadata_id"])
            try:
                row = fetch_site_row(
                    site_record,
                    timeout=max(1, args.timeout),
                    retries=max(1, args.retries),
                    retry_delay=max(0.1, args.retry_delay),
                    previous_direct_downloads=previous_direct_downloads,
                )
                rows.append(row)
                if row.pop("_direct_download_carried_forward", False):
                    retained_direct_download_count += 1
                if row["download_mode"] == "direct":
                    direct_download_count += 1
                else:
                    landing_page_count += 1
                log(
                    f"JapanFlux site {index}/{total}: {site_id} ({metadata_id}) -> {row['download_mode']} {row['first_year']}-{row['last_year']} v{row['version']}"
                )
                time.sleep(0.05)
            except Exception as err:  # noqa: BLE001 - collect enough failures to diagnose before failing the refresh
                failure = f"{site_id} ({metadata_id}): {compact_error(err)}"
                failures.append(failure)
                log(f"JapanFlux site {index}/{total}: {site_id} ({metadata_id}) FAILED: {compact_error(err)}")
                if looks_like_ads_outage(err):
                    reason = (
                        "JapanFlux ADS is unavailable or under maintenance during site refresh; "
                        f"no partial JapanFlux output was written. First failing site: {failure}"
                    )
                    log("JapanFlux ADS unavailable; carrying forward previous valid snapshot")
                    carry_forward_previous_snapshot(
                        args=args,
                        output_csv=output_csv,
                        output_json=output_json,
                        reason=reason,
                        requested_at=requested_at,
                        requested_date=requested_date,
                    )
                    return
                if len(failures) >= max(1, int(args.max_failures)):
                    raise RuntimeError(
                        f"JapanFlux refresh aborted after {len(failures)} site failure(s): "
                        + "; ".join(failures)
                    ) from err

    rows.sort(key=lambda row: (str(row.get("country") or ""), str(row.get("site_id") or "")))

    with phase("write JapanFlux outputs"):
        source_status = build_fresh_status(
            rows,
            snapshot_updated_at=requested_at,
            snapshot_updated_date=requested_date,
        )
        write_csv(output_csv, rows)
        version_hash = write_json(
            output_json,
            rows,
            meta_extra={
                "discovery_method": "ADS REST API with static inventory",
                "api_base": ADS_API_BASE,
                "total_inventory_sites": total,
                "successful_sites": len(rows),
                "failed_sites": len(failures),
                "direct_download_urls": direct_download_count,
                "landing_page_fallbacks": landing_page_count,
                "retained_direct_downloads_after_probe_failure": retained_direct_download_count,
                "source": "JapanFlux2024 (Ueyama et al., 2025, ESSD)",
                "license": "CC BY 4.0",
                "source_statuses": {JAPANFLUX_SOURCE: source_status},
                "last_refresh_status": "fresh",
            },
            snapshot_updated_at=requested_at,
            snapshot_updated_date=requested_date,
        )
        write_status_output(args.status_output, source_status)

    log(f"Wrote JapanFlux CSV: {output_csv}")
    log(f"Wrote JapanFlux JSON: {output_json}")
    log(f"Rows: {len(rows)} / {total}")
    log(f"Direct download URLs: {direct_download_count}")
    log(f"Landing-page fallbacks: {landing_page_count}")
    log(f"Version: sha256:{version_hash}")

    if failures:
        raise RuntimeError("JapanFlux refresh completed with site failures: " + "; ".join(failures))


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    try:
        refresh(args)
    except Exception as err:
        requested_at, requested_date = choose_requested_refresh_fields(args.snapshot_updated_at, args.snapshot_updated_date)
        write_status_output(
            args.status_output,
            build_fatal_status(compact_error(err, 500), failed_at=requested_at, failed_date=requested_date),
        )
        raise


if __name__ == "__main__":
    main()
