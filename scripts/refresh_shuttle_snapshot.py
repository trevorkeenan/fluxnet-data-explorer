#!/usr/bin/env python3
"""Build a stable FLUXNET Shuttle snapshot with per-source carry-forward safeguards."""

from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple

PROCESSING_LINEAGE_ONEFLUX = "oneflux"
REQUIRED_FIELDS = ("data_hub", "site_id", "download_link")
DEFAULT_MIN_SITE_RETENTION_RATIO = 0.8
DEFAULT_MIN_GUARDED_SITE_COUNT = 25


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-csv", required=True, help="Published Shuttle snapshot CSV path.")
    parser.add_argument(
        "--existing-json",
        default="",
        help="Existing published Shuttle snapshot JSON path for prior metadata/status lookup.",
    )
    parser.add_argument(
        "--candidate-csv",
        default="",
        help="Optional candidate Shuttle CSV path. When omitted, the script fetches a fresh candidate via fluxnet_shuttle.listall().",
    )
    parser.add_argument(
        "--source-status-output",
        default="",
        help="Optional JSON path to write per-source refresh status metadata.",
    )
    parser.add_argument(
        "--snapshot-updated-at",
        default="",
        help="Snapshot refresh timestamp in ISO-8601 form (e.g. 2026-03-11T06:04:47Z).",
    )
    parser.add_argument(
        "--snapshot-updated-date",
        default="",
        help="Snapshot refresh date in YYYY-MM-DD form.",
    )
    parser.add_argument(
        "--min-site-retention-ratio",
        type=float,
        default=DEFAULT_MIN_SITE_RETENTION_RATIO,
        help="Minimum fraction of previously published sites that must still be present before a source update is accepted.",
    )
    parser.add_argument(
        "--min-guarded-site-count",
        type=int,
        default=DEFAULT_MIN_GUARDED_SITE_COUNT,
        help="Only apply relative completeness safeguards to sources with at least this many previously published sites.",
    )
    return parser.parse_args()


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
    if raw and len(raw) == 10:
        return raw
    fallback = normalize_snapshot_updated_at(fallback_at)
    if fallback:
        return fallback.split("T", 1)[0]
    return ""


def choose_requested_refresh_fields(requested_updated_at: str, requested_updated_date: str) -> tuple[str, str]:
    updated_at = normalize_snapshot_updated_at(requested_updated_at)
    if not updated_at:
        updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    updated_date = normalize_snapshot_updated_date(requested_updated_date, updated_at)
    return updated_at, updated_date


def load_existing_meta(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    meta = payload.get("meta")
    if isinstance(meta, dict):
        return meta
    return {}


def load_source_statuses(meta: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    raw = meta.get("source_statuses")
    if not isinstance(raw, dict):
        return {}
    statuses: Dict[str, Dict[str, Any]] = {}
    for hub, value in raw.items():
        if isinstance(value, dict):
            statuses[str(hub)] = dict(value)
    return statuses


def read_csv_snapshot(path: Path) -> tuple[List[str], List[Dict[str, str]]]:
    if not path.exists():
        return [], []
    with path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        fieldnames = [str(field or "").strip() for field in (reader.fieldnames or []) if str(field or "").strip()]
        rows = [{str(key or "").strip(): "" if value is None else str(value).strip() for key, value in row.items()} for row in reader]
    return fieldnames, rows


def insert_processing_lineage_field(fieldnames: Sequence[str]) -> List[str]:
    fields = [str(field or "").strip() for field in fieldnames if str(field or "").strip()]
    if "processing_lineage" in fields:
        return list(fields)
    if "product_source_network" in fields:
        insert_at = fields.index("product_source_network") + 1
    elif "network" in fields:
        insert_at = fields.index("network") + 1
    else:
        insert_at = len(fields)
    return fields[:insert_at] + ["processing_lineage"] + fields[insert_at:]


def row_sort_key(row: Dict[str, str]) -> tuple[str, str, str, str]:
    return (
        str(row.get("data_hub") or ""),
        str(row.get("site_id") or ""),
        str(row.get("fluxnet_product_name") or ""),
        str(row.get("product_id") or ""),
    )


def normalize_snapshot_rows(
    fieldnames: Sequence[str],
    rows: Sequence[Dict[str, str]],
    *,
    empty_rows_message: str,
) -> tuple[List[str], List[Dict[str, str]]]:
    normalized_fieldnames = insert_processing_lineage_field(fieldnames)
    if not normalized_fieldnames:
        raise RuntimeError("Snapshot CSV is missing a header row.")

    missing_fields = sorted(set(REQUIRED_FIELDS) - set(normalized_fieldnames))
    if missing_fields:
        raise RuntimeError(f"Snapshot CSV is missing required columns: {missing_fields}")

    normalized_rows: List[Dict[str, str]] = []
    seen_keys: set[tuple[str, str]] = set()
    for index, row in enumerate(rows, start=1):
        normalized_row = {field: str(row.get(field, "") or "").strip() for field in normalized_fieldnames}
        if not normalized_row.get("processing_lineage"):
            normalized_row["processing_lineage"] = PROCESSING_LINEAGE_ONEFLUX
        missing_values = [field for field in REQUIRED_FIELDS if not normalized_row.get(field)]
        if missing_values:
            raise RuntimeError(f"Row {index} is missing required values: {missing_values}")
        key = (normalized_row["data_hub"], normalized_row["site_id"])
        if key in seen_keys:
            raise RuntimeError(f"Snapshot contains duplicate site entries for hub/site {key!r}")
        seen_keys.add(key)
        normalized_rows.append(normalized_row)

    if not normalized_rows:
        raise RuntimeError(empty_rows_message)

    normalized_rows.sort(key=row_sort_key)
    return normalized_fieldnames, normalized_rows


def group_rows_by_hub(rows: Sequence[Dict[str, str]]) -> Dict[str, List[Dict[str, str]]]:
    grouped: Dict[str, List[Dict[str, str]]] = {}
    for row in rows:
        hub = str(row.get("data_hub") or "").strip()
        grouped.setdefault(hub, []).append(row)
    return grouped


def row_list_equal(left: Sequence[Dict[str, str]], right: Sequence[Dict[str, str]]) -> bool:
    if len(left) != len(right):
        return False
    for left_row, right_row in zip(left, right):
        if left_row != right_row:
            return False
    return True


def site_ids(rows: Sequence[Dict[str, str]]) -> set[str]:
    return {str(row.get("site_id") or "").strip() for row in rows if str(row.get("site_id") or "").strip()}


def fallback_last_success(existing_meta: Dict[str, Any], existing_status: Dict[str, Any] | None) -> tuple[str, str]:
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
    hub: str,
    published_rows: Sequence[Dict[str, str]],
    *,
    last_successful_refresh_at: str,
    last_successful_refresh_date: str,
    previous_site_count: int = 0,
) -> Dict[str, Any]:
    status: Dict[str, Any] = {
        "status": "fresh",
        "last_successful_refresh_at": normalize_snapshot_updated_at(last_successful_refresh_at),
        "last_successful_refresh_date": normalize_snapshot_updated_date(
            last_successful_refresh_date,
            last_successful_refresh_at,
        ),
        "published_row_count": len(published_rows),
        "published_site_count": len(site_ids(published_rows)),
    }
    if previous_site_count > 0:
        status["site_retention_ratio_vs_previous"] = round(len(site_ids(published_rows)) / previous_site_count, 4)
    return status


def build_carried_forward_status(
    hub: str,
    published_rows: Sequence[Dict[str, str]],
    candidate_rows: Sequence[Dict[str, str]],
    *,
    last_successful_refresh_at: str,
    last_successful_refresh_date: str,
    reason: str,
    previous_site_count: int,
    retained_site_count: int,
) -> Dict[str, Any]:
    status: Dict[str, Any] = {
        "status": "carried_forward",
        "last_successful_refresh_at": normalize_snapshot_updated_at(last_successful_refresh_at),
        "last_successful_refresh_date": normalize_snapshot_updated_date(
            last_successful_refresh_date,
            last_successful_refresh_at,
        ),
        "published_row_count": len(published_rows),
        "published_site_count": len(site_ids(published_rows)),
        "candidate_row_count": len(candidate_rows),
        "candidate_site_count": len(site_ids(candidate_rows)),
        "reason": reason,
    }
    if previous_site_count > 0:
        status["site_retention_ratio_vs_previous"] = round(retained_site_count / previous_site_count, 4)
    return status


def keep_existing_status(existing_status: Dict[str, Any], published_rows: Sequence[Dict[str, str]]) -> Dict[str, Any]:
    kept = dict(existing_status)
    kept["published_row_count"] = len(published_rows)
    kept["published_site_count"] = len(site_ids(published_rows))
    return kept


def evaluate_candidate_hub(
    hub: str,
    candidate_rows: Sequence[Dict[str, str]],
    existing_rows: Sequence[Dict[str, str]],
    *,
    min_site_retention_ratio: float,
    min_guarded_site_count: int,
) -> tuple[bool, str, int]:
    if not candidate_rows:
        return False, f"{hub} candidate refresh returned no rows.", 0

    existing_sites = site_ids(existing_rows)
    existing_count = len(existing_sites)
    if existing_count == 0:
        return True, "", 0

    candidate_sites = site_ids(candidate_rows)
    retained_count = len(existing_sites & candidate_sites)
    candidate_count = len(candidate_sites)

    if existing_count < max(1, min_guarded_site_count):
        return True, "", retained_count

    count_ratio = candidate_count / existing_count
    retained_ratio = retained_count / existing_count
    if count_ratio < min_site_retention_ratio or retained_ratio < min_site_retention_ratio:
        reason = (
            f"{hub} candidate retained {retained_count} of {existing_count} previously published sites "
            f"({retained_ratio:.1%}) and published {candidate_count} total site rows "
            f"({count_ratio:.1%} of the prior count), below the {min_site_retention_ratio:.1%} "
            "minimum retention threshold."
        )
        return False, reason, retained_count

    return True, "", retained_count


def build_status_output(
    source_statuses: Dict[str, Dict[str, Any]],
    published_rows: Sequence[Dict[str, str]],
) -> Dict[str, Any]:
    rows_by_hub = group_rows_by_hub(published_rows)
    carried_forward_sources = sorted(
        hub for hub, status in source_statuses.items() if str(status.get("status") or "").strip().lower() == "carried_forward"
    )
    return {
        "source_statuses": {hub: source_statuses[hub] for hub in sorted(source_statuses)},
        "published_rows": len(published_rows),
        "published_rows_by_source": {hub: len(rows_by_hub[hub]) for hub in sorted(rows_by_hub)},
        "carried_forward_sources": carried_forward_sources,
    }


def stabilize_snapshot(
    candidate_rows: Sequence[Dict[str, str]],
    existing_rows: Sequence[Dict[str, str]],
    existing_meta: Dict[str, Any],
    *,
    snapshot_updated_at: str,
    snapshot_updated_date: str,
    min_site_retention_ratio: float,
    min_guarded_site_count: int,
    candidate_error: str = "",
) -> tuple[List[Dict[str, str]], Dict[str, Dict[str, Any]]]:
    existing_rows_by_hub = group_rows_by_hub(existing_rows)
    candidate_rows_by_hub = group_rows_by_hub(candidate_rows)
    existing_statuses = load_source_statuses(existing_meta)

    if candidate_error:
        if not existing_rows:
            raise RuntimeError(f"Unable to publish Shuttle snapshot: {candidate_error}")
        published_rows = list(existing_rows)
        source_statuses: Dict[str, Dict[str, Any]] = {}
        for hub in sorted(existing_rows_by_hub):
            existing_status = existing_statuses.get(hub)
            if existing_status and str(existing_status.get("status") or "").strip().lower() == "carried_forward":
                source_statuses[hub] = keep_existing_status(existing_status, existing_rows_by_hub[hub])
                continue
            last_success_at, last_success_date = fallback_last_success(existing_meta, existing_status)
            source_statuses[hub] = build_carried_forward_status(
                hub,
                existing_rows_by_hub[hub],
                [],
                last_successful_refresh_at=last_success_at,
                last_successful_refresh_date=last_success_date,
                reason=f"Unable to validate candidate Shuttle snapshot: {candidate_error}",
                previous_site_count=len(site_ids(existing_rows_by_hub[hub])),
                retained_site_count=len(site_ids(existing_rows_by_hub[hub])),
            )
        return published_rows, source_statuses

    published_rows: List[Dict[str, str]] = []
    source_statuses = {}
    all_hubs = sorted(set(existing_rows_by_hub) | set(candidate_rows_by_hub))
    for hub in all_hubs:
        existing_hub_rows = existing_rows_by_hub.get(hub, [])
        candidate_hub_rows = candidate_rows_by_hub.get(hub, [])
        existing_status = existing_statuses.get(hub)
        existing_site_count = len(site_ids(existing_hub_rows))
        rows_same_as_existing = bool(existing_hub_rows) and row_list_equal(candidate_hub_rows, existing_hub_rows)

        accepted, reason, retained_count = evaluate_candidate_hub(
            hub,
            candidate_hub_rows,
            existing_hub_rows,
            min_site_retention_ratio=min_site_retention_ratio,
            min_guarded_site_count=min_guarded_site_count,
        )

        if accepted:
            if not candidate_hub_rows:
                continue
            published_rows.extend(candidate_hub_rows)
            source_statuses[hub] = build_fresh_status(
                hub,
                candidate_hub_rows,
                last_successful_refresh_at=snapshot_updated_at,
                last_successful_refresh_date=snapshot_updated_date,
                previous_site_count=existing_site_count,
            )
            continue

        if existing_hub_rows:
            published_rows.extend(existing_hub_rows)
            if existing_status and str(existing_status.get("status") or "").strip().lower() == "carried_forward":
                source_statuses[hub] = keep_existing_status(existing_status, existing_hub_rows)
            else:
                last_success_at, last_success_date = fallback_last_success(existing_meta, existing_status)
                source_statuses[hub] = build_carried_forward_status(
                    hub,
                    existing_hub_rows,
                    candidate_hub_rows,
                    last_successful_refresh_at=last_success_at,
                    last_successful_refresh_date=last_success_date,
                    reason=reason,
                    previous_site_count=existing_site_count,
                    retained_site_count=retained_count or existing_site_count,
                )

    if not published_rows:
        raise RuntimeError("Refusing to publish an empty Shuttle snapshot.")

    published_rows.sort(key=row_sort_key)
    return published_rows, source_statuses


def fetch_candidate_csv_via_shuttle() -> Path:
    tmp_dir = Path(os.environ.get("RUNNER_TEMP", ".")) / "fluxnet-shuttle"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    import fluxnet_shuttle.plugins  # noqa: F401
    from fluxnet_shuttle.shuttle import listall

    return Path(listall(output_dir=str(tmp_dir)))


def write_csv_snapshot(path: Path, fieldnames: Sequence[str], rows: Sequence[Dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(fieldnames))
        writer.writeheader()
        writer.writerows(rows)


def write_status_output(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")


def format_counts_by_hub(rows: Sequence[Dict[str, str]]) -> Dict[str, int]:
    grouped = group_rows_by_hub(rows)
    return {hub: len(grouped[hub]) for hub in sorted(grouped)}


def main() -> None:
    args = parse_args()
    output_csv = Path(args.output_csv)
    existing_json = Path(args.existing_json) if args.existing_json else output_csv.with_suffix(".json")
    source_status_output = Path(args.source_status_output) if args.source_status_output else None

    snapshot_updated_at, snapshot_updated_date = choose_requested_refresh_fields(
        args.snapshot_updated_at,
        args.snapshot_updated_date,
    )

    existing_fieldnames, raw_existing_rows = read_csv_snapshot(output_csv)
    existing_meta = load_existing_meta(existing_json)
    normalized_existing_fieldnames: List[str] = []
    normalized_existing_rows: List[Dict[str, str]] = []
    if raw_existing_rows:
        normalized_existing_fieldnames, normalized_existing_rows = normalize_snapshot_rows(
            existing_fieldnames,
            raw_existing_rows,
            empty_rows_message="Existing published Shuttle snapshot is empty.",
        )

    candidate_error = ""
    normalized_candidate_fieldnames: List[str] = []
    normalized_candidate_rows: List[Dict[str, str]] = []
    try:
        candidate_path = Path(args.candidate_csv) if args.candidate_csv else fetch_candidate_csv_via_shuttle()
        candidate_fieldnames, raw_candidate_rows = read_csv_snapshot(candidate_path)
        normalized_candidate_fieldnames, normalized_candidate_rows = normalize_snapshot_rows(
            candidate_fieldnames,
            raw_candidate_rows,
            empty_rows_message="Refusing to overwrite Shuttle snapshot: listall() returned zero rows.",
        )
    except Exception as err:  # noqa: BLE001 - preserve last-known-good snapshot when candidate generation fails
        candidate_error = str(err)
        print(f"Warning: {candidate_error}", flush=True)

    published_rows, source_statuses = stabilize_snapshot(
        normalized_candidate_rows,
        normalized_existing_rows,
        existing_meta,
        snapshot_updated_at=snapshot_updated_at,
        snapshot_updated_date=snapshot_updated_date,
        min_site_retention_ratio=max(0.0, min(1.0, float(args.min_site_retention_ratio))),
        min_guarded_site_count=max(1, int(args.min_guarded_site_count)),
        candidate_error=candidate_error,
    )

    fieldnames = normalized_candidate_fieldnames or normalized_existing_fieldnames
    if not fieldnames:
        raise RuntimeError("Unable to determine Shuttle snapshot fieldnames.")

    write_csv_snapshot(output_csv, fieldnames, published_rows)

    status_payload = build_status_output(source_statuses, published_rows)
    if source_status_output:
        write_status_output(source_status_output, status_payload)

    print(f"Wrote {len(published_rows)} rows to {output_csv}", flush=True)
    print(f"Rows by hub: {format_counts_by_hub(published_rows)}", flush=True)
    if status_payload["carried_forward_sources"]:
        print(
            "Carried forward sources: " + ", ".join(status_payload["carried_forward_sources"]),
            flush=True,
        )
        for hub in status_payload["carried_forward_sources"]:
            reason = str(source_statuses.get(hub, {}).get("reason") or "").strip()
            if reason:
                print(f"  - {hub}: {reason}", flush=True)
    else:
        print("Carried forward sources: none", flush=True)


if __name__ == "__main__":
    main()
