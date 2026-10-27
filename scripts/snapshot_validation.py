"""Validate complete candidate and fallback snapshots before publication."""

import csv
import json
from collections import Counter
from pathlib import Path


class SnapshotValidationError(RuntimeError):
    pass


class RetentionError(SnapshotValidationError):
    pass


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.6f}".rstrip("0").rstrip(".")
    return str(value)


def read_csv(path: Path, required: tuple[str, ...], identity: tuple[str, ...]) -> list[dict]:
    try:
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            columns = reader.fieldnames or []
            rows = list(reader)
    except (OSError, csv.Error, UnicodeError) as error:
        raise SnapshotValidationError(f"Unreadable CSV {path}: {error}") from error
    if len(columns) != len(set(columns)) or not set(required) <= set(columns):
        raise SnapshotValidationError(f"Invalid CSV columns: {path}")
    if not rows:
        raise RetentionError(f"Snapshot contains no data rows: {path}")
    seen = set()
    for row in rows:
        if None in row or any(value is None for value in row.values()) or any(not row[key].strip() for key in required):
            raise SnapshotValidationError(f"Missing required values or malformed row: {path}")
        key = tuple(row[column].strip().casefold() for column in identity)
        if key in seen:
            raise SnapshotValidationError(f"Duplicate record {key}: {path}")
        seen.add(key)
    return rows


def validate_pair(csv_path: Path, json_path: Path, required: tuple[str, ...], identity: tuple[str, ...],
                  *, columns=None, normalize_csv=None) -> dict:
    csv_rows = read_csv(csv_path, required, identity)
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SnapshotValidationError(f"Unreadable JSON {json_path}: {error}") from error
    if not isinstance(payload, dict):
        raise SnapshotValidationError(f"Expected JSON object: {json_path}")
    meta, fields, rows = (payload.get(key) for key in ("meta", "columns", "rows"))
    if (not isinstance(meta, dict) or meta.get("schema_version") != 1
            or not isinstance(meta.get("version"), str) or not meta["version"] or not isinstance(fields, list)
            or not all(isinstance(field, str) for field in fields) or len(fields) != len(set(fields))
            or not set(required) <= set(fields) or not isinstance(rows, list) or not rows):
        raise SnapshotValidationError(f"Invalid snapshot schema: {json_path}")
    if columns is not None and fields != list(columns):
        raise SnapshotValidationError(f"Unexpected snapshot columns: {json_path}")
    if normalize_csv is None and list(csv_rows[0]) != fields:
        raise SnapshotValidationError(f"CSV/JSON columns differ: {csv_path}, {json_path}")
    if any(not isinstance(row, list) or len(row) != len(fields) for row in rows):
        raise SnapshotValidationError(f"Invalid snapshot row width: {json_path}")
    if any(isinstance(value, (dict, list)) for row in rows for value in row):
        raise SnapshotValidationError(f"Non-scalar snapshot cells: {json_path}")
    normalized = [normalize_csv(row) if normalize_csv else row for row in csv_rows]
    # CSV writers round floats to six places. Compare every published cell,
    # independent of row ordering, rather than accepting matching row counts.
    try:
        csv_values = Counter(tuple(cell_text(row.get(field)) for field in fields) for row in normalized)
        json_values = Counter(tuple(cell_text(value) for value in row) for row in rows)
    except (TypeError, ValueError) as error:
        raise SnapshotValidationError(f"Invalid snapshot cells: {json_path}") from error
    if csv_values != json_values:
        raise SnapshotValidationError(f"CSV/JSON contents differ: {csv_path}, {json_path}")
    return payload


def validate_retention(previous: list[dict], candidate: list[dict], site_column: str,
                       minimum_ratio: float = 0.8) -> None:
    old = {row[site_column].casefold() for row in previous}
    new = {row[site_column].casefold() for row in candidate}
    if old and len(old & new) / len(old) < minimum_ratio:
        raise RetentionError(
            f"Candidate retained {len(old & new)}/{len(old)} previously published sites; "
            f"minimum retention is {minimum_ratio:.0%}."
        )
