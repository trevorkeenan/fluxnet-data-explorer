"""Stable fingerprints and dates for the Explorer's accessible data inventory.

An inventory change means that at least one normalized availability record is
added, removed, or changed.  Availability records contain only the identity of
the site/source/product, temporal coverage, access mode, and download/landing
endpoints.  Descriptive metadata (names, coordinates, contacts, citations,
provenance text), refresh/status metadata, and row/column ordering are excluded.

The full snapshot ``version`` may still change for those excluded fields; only
``inventory_version`` controls ``snapshot_updated_*`` ("New data last added").
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping, Sequence


# Ordered explicitly to make the comparison contract reviewable. Fields absent
# from a source schema are ignored. All values are stripped and stringified.
INVENTORY_FIELDS: tuple[str, ...] = (
    "site_id",
    "data_hub",
    "source",
    "source_origin",
    "source_network",
    "processing_lineage",
    "fluxnet_product_name",
    "product_id",
    "object_id",
    "metadata_id",
    "version",
    "first_year",
    "last_year",
    "coverage_start",
    "coverage_end",
    "download_mode",
    "download_link",
    "direct_download_url",
    "access_url",
    "landing_page_url",
    "request_page_url",
    "site_page_url",
    "access_label",
    "data_use_label",
    "efd_access_summary",
    "efd_policy_years",
    "known_data_record",
)


def _normalize_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip()


def normalize_inventory_records(
    records: Sequence[Mapping[str, Any]],
    available_fields: Sequence[str] | None = None,
) -> list[list[str]]:
    """Return a deterministic, order-insensitive availability representation."""

    available = set(available_fields or ())
    if not available:
        for record in records:
            available.update(str(key) for key in record)
    fields = [field for field in INVENTORY_FIELDS if field in available]
    normalized = [
        [_normalize_value(record.get(field)) for field in fields]
        for record in records
    ]
    normalized.sort()
    return [[*fields], *normalized]


def inventory_version(
    records: Sequence[Mapping[str, Any]],
    available_fields: Sequence[str] | None = None,
) -> str:
    """Hash only meaningful data-availability fields, never volatile metadata."""

    normalized = normalize_inventory_records(records, available_fields)
    canonical = json.dumps(normalized, ensure_ascii=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compact_rows_to_records(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Decode a committed compact snapshot for migration/fallback comparison."""

    columns = payload.get("columns")
    rows = payload.get("rows")
    if not isinstance(columns, list) or not isinstance(rows, list):
        return []
    names = [str(column) for column in columns]
    return [
        {name: values[index] if index < len(values) else "" for index, name in enumerate(names)}
        for values in rows
        if isinstance(values, list)
    ]
