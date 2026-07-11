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


def _inventory_field_names(
    records: Sequence[Mapping[str, Any]],
    available_fields: Sequence[str] | None = None,
) -> list[str]:
    available = set(available_fields or ())
    if not available:
        for record in records:
            available.update(str(key) for key in record)
    return [field for field in INVENTORY_FIELDS if field in available]


def normalize_inventory_records(
    records: Sequence[Mapping[str, Any]],
    available_fields: Sequence[str] | None = None,
) -> list[list[str]]:
    """Return a deterministic, order-insensitive availability representation."""

    fields = _inventory_field_names(records, available_fields)
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


def inventory_change_summary(
    source: str,
    old_records: Sequence[Mapping[str, Any]],
    new_records: Sequence[Mapping[str, Any]],
    available_fields: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Describe availability changes using the exact normalized hash fields.

    Records are grouped by site because a source may expose multiple products
    for one site. Each site reports only fields whose normalized value lists
    changed, while descriptive and volatile metadata stay excluded.
    """

    all_records = [*old_records, *new_records]
    fields = _inventory_field_names(all_records, available_fields)

    def group(records: Sequence[Mapping[str, Any]]) -> dict[str, list[dict[str, str]]]:
        grouped: dict[str, list[dict[str, str]]] = {}
        for record in records:
            normalized = {field: _normalize_value(record.get(field)) for field in fields}
            site_id = normalized.get("site_id", "")
            grouped.setdefault(site_id, []).append(normalized)
        for site_records in grouped.values():
            site_records.sort(key=lambda record: json.dumps(record, ensure_ascii=True, separators=(",", ":")))
        return grouped

    old_by_site = group(old_records)
    new_by_site = group(new_records)
    old_site_ids = set(old_by_site)
    new_site_ids = set(new_by_site)
    changed_site_ids = sorted(
        site_id
        for site_id in old_site_ids | new_site_ids
        if old_by_site.get(site_id, []) != new_by_site.get(site_id, [])
    )

    site_changes = []
    for site_id in changed_site_ids:
        old_site_records = old_by_site.get(site_id, [])
        new_site_records = new_by_site.get(site_id, [])
        field_changes = {}
        for field in fields:
            old_values = sorted(record[field] for record in old_site_records)
            new_values = sorted(record[field] for record in new_site_records)
            if old_values != new_values and (any(old_values) or any(new_values)):
                field_changes[field] = {"old": old_values, "new": new_values}
        site_changes.append({"site_id": site_id, "fields": field_changes})

    return {
        "source": str(source),
        "inventory_changed": bool(changed_site_ids),
        "old_inventory_version": inventory_version(old_records, available_fields),
        "new_inventory_version": inventory_version(new_records, available_fields),
        "changed_site_ids": changed_site_ids,
        "added_site_ids": sorted(new_site_ids - old_site_ids),
        "removed_site_ids": sorted(old_site_ids - new_site_ids),
        "sites": site_changes,
    }


def inventory_change_summary_json(
    source: str,
    old_records: Sequence[Mapping[str, Any]],
    new_records: Sequence[Mapping[str, Any]],
    available_fields: Sequence[str] | None = None,
) -> str:
    """Return a compact deterministic summary suitable for workflow logs."""

    return json.dumps(
        inventory_change_summary(source, old_records, new_records, available_fields),
        ensure_ascii=True,
        separators=(",", ":"),
    )


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
