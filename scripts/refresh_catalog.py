#!/usr/bin/env python3
"""Stage, validate, and publish catalog refreshes with per-source fallbacks."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

try:
    from . import refresh_ameriflux_site_info as ameriflux
    from . import refresh_efd_sites as efd
    from . import refresh_icos_direct_fluxnet as icos
    from . import refresh_japanflux_direct as japanflux
    from . import refresh_shuttle_snapshot as shuttle
    from . import refresh_site_vegetation_metadata as vegetation
    from . import refresh_source_citation_metadata as citations
    from .refresh_errors import SourceUnavailableError
    from .snapshot_validation import RetentionError, SnapshotValidationError, read_csv, validate_pair, validate_retention
except ImportError:  # pragma: no cover - direct script execution
    import refresh_ameriflux_site_info as ameriflux
    import refresh_efd_sites as efd
    import refresh_icos_direct_fluxnet as icos
    import refresh_japanflux_direct as japanflux
    import refresh_shuttle_snapshot as shuttle
    import refresh_site_vegetation_metadata as vegetation
    import refresh_source_citation_metadata as citations
    from refresh_errors import SourceUnavailableError
    from snapshot_validation import RetentionError, SnapshotValidationError, read_csv, validate_pair, validate_retention


ROOT = Path(__file__).resolve().parent.parent
STATUS_FILE = "catalog_refresh_status.json"


def load_converter():
    spec = importlib.util.spec_from_file_location(
        "catalog_csv_to_json", ROOT / ".github/scripts/shuttle_snapshot_csv_to_json.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONVERTER = load_converter()


@dataclass(frozen=True)
class Source:
    name: str
    stem: str
    required: tuple[str, ...]
    identity: tuple[str, ...]
    columns: tuple[str, ...] | None = None
    paired: bool = True

    @property
    def files(self):
        return [self.stem + extension for extension in ((".csv", ".json") if self.paired else (".csv",))]


SOURCES = (
    Source("FLUXNET Shuttle", "shuttle_snapshot", ("site_id", "data_hub", "download_link"), ("data_hub", "site_id")),
    Source("ICOS-direct", "icos_direct_fluxnet", ("site_id", "download_link"), ("site_id",), tuple(icos.OUTPUT_COLUMNS)),
    Source("JapanFlux", "japanflux_direct_snapshot", ("site_id", "download_link"), ("site_id",), tuple(japanflux.OUTPUT_COLUMNS)),
    Source("EFD", "efd_curated_sites_snapshot", ("site_id", "download_link"), ("site_id",), tuple(efd.OUTPUT_COLUMNS)),
    Source("AmeriFlux site metadata", "ameriflux_site_info", ("SITE_ID",), ("SITE_ID",), tuple(ameriflux.OUTPUT_COLUMNS), False),
    Source("Vegetation metadata", "site_vegetation_metadata", ("site_id",), ("site_id",), ("site_id", "vegetation_type", "metadata_source"), False),
    Source("Source citation metadata", "source_citation_metadata", ("site_id", "data_product", "data_policy"), ("site_id", "data_product", "data_policy"), tuple(citations.OUTPUT_COLUMNS), False),
)


def validate_source(source: Source, directory: Path) -> tuple[list[dict], dict]:
    csv_path = directory / source.files[0]
    rows = read_csv(csv_path, source.required, source.identity)
    if source.paired:
        payload = validate_pair(
            csv_path, directory / source.files[1], source.required, source.identity, columns=source.columns,
            normalize_csv=CONVERTER.build_record if source.name == "FLUXNET Shuttle" else None,
        )
        for row in rows:
            try:
                first, last = row.get("first_year"), row.get("last_year")
                if first and last and (int(first) < 1 or int(last) < int(first)):
                    raise ValueError("invalid year range")
            except ValueError as error:
                raise SnapshotValidationError(f"Invalid coverage for {row['site_id']}: {first}-{last}") from error
        return rows, payload["meta"]
    if list(rows[0]) != list(source.columns):
        raise SnapshotValidationError(f"Unexpected columns: {csv_path}")
    return rows, {}


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")


def previous_success(source: Source, directory: Path, meta: dict, previous_report: dict) -> str:
    # Never use checkout mtime: checking out an old file does not refresh it.
    status = meta.get("source_statuses", {}).get(source.name, {})
    status = previous_report.get("source_statuses", {}).get(source.name, status)
    if status.get("last_successful_refresh_at"):
        return status["last_successful_refresh_at"]
    if source.paired:
        return meta.get("snapshot_refreshed_at") or meta.get("snapshot_updated_at") or ""
    result = subprocess.run(
        ["git", "log", "-1", "--format=%cI", "--", str((directory / source.files[0]).resolve())],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def refresh_source(source: Source, assets: Path, staged: Path, refresh: Callable,
                   previous_report: dict, attempted_at: str, strict: bool) -> dict:
    # Validate fallbacks before running any provider code. A corrupt previous
    # snapshot is an error, even when another source happens to be healthy.
    previous_rows, previous_meta = validate_source(source, assets)
    for name in source.files:
        shutil.copyfile(assets / name, staged / name)
    prior_success = previous_success(source, assets, previous_meta, previous_report)
    failure = None
    try:
        refresh(staged)
        rows, meta = validate_source(source, staged)
        validate_retention(previous_rows, rows, source.identity[-1])
    except (SourceUnavailableError, RetentionError) as error:
        if strict:
            raise
        failure = error
        for name in source.files:
            shutil.copyfile(assets / name, staged / name)
        rows, meta = validate_source(source, staged)

    statuses = dict(meta.get("source_statuses", {}))
    if failure:
        status = {
            "status": "carried_forward", "last_successful_refresh_at": prior_success,
            "reason": str(failure),
        }
        if isinstance(failure, SourceUnavailableError):
            status.update(failure.details())
    elif source.name == "FLUXNET Shuttle":
        # Shuttle already evaluates and retains its three hubs independently.
        if strict and any(entry.get("status") == "carried_forward" for entry in statuses.values()):
            raise SourceUnavailableError("Strict refresh rejected retained Shuttle sources.")
        status = None
    else:
        status = statuses.get(source.name) or {"status": "fresh", "last_successful_refresh_at": attempted_at}
        if strict and status["status"] == "carried_forward":
            raise SourceUnavailableError("Strict refresh rejected retained " + source.name)
    if status is not None:
        statuses = {source.name: status}
    for name, entry in statuses.items():
        entry.update({"last_refresh_attempt_at": attempted_at, "published_row_count": len(rows) if status else entry.get("published_row_count", 0)})
        entry["last_successful_refresh_date"] = entry.get("last_successful_refresh_at", "")[:10]

    if source.paired:
        payload = json.loads((staged / source.files[1]).read_text())
        payload["meta"]["source_statuses"] = statuses
        payload["meta"]["last_refresh_attempt_at"] = attempted_at
        # Carry-forward may update status, never the last successful retrieval.
        successes = [entry.get("last_successful_refresh_at", "") for entry in statuses.values()]
        successful_at = max(successes, default="")
        if successful_at:
            payload["meta"]["snapshot_refreshed_at"] = successful_at
            payload["meta"]["snapshot_refreshed_date"] = successful_at[:10]
        write_json(staged / source.files[1], payload)
    return statuses


def refreshers(attempted_at: str) -> list[Callable]:
    timestamp = ["--snapshot-updated-at", attempted_at, "--snapshot-updated-date", attempted_at[:10]]

    def shuttle_refresh(directory):
        status_path = directory / "shuttle-source-status.json"
        shuttle.main([
            "--output-csv", str(directory / "shuttle_snapshot.csv"),
            "--existing-json", str(directory / "shuttle_snapshot.json"),
            "--source-status-output", str(status_path), "--candidate-timeout", "300", *timestamp,
        ])
        CONVERTER.main([
            "--input", str(directory / "shuttle_snapshot.csv"), "--output", str(directory / "shuttle_snapshot.json"),
            "--source-status-input", str(status_path), *timestamp,
        ])

    return [
        shuttle_refresh,
        lambda d: icos.main(["--shuttle-csv", str(d / "shuttle_snapshot.csv"),
                             "--output-csv", str(d / "icos_direct_fluxnet.csv"),
                             "--output-json", str(d / "icos_direct_fluxnet.json"), "--timeout", "45", "--retries", "5", *timestamp]),
        lambda d: japanflux.main(["--output-csv", str(d / "japanflux_direct_snapshot.csv"),
                                  "--output-json", str(d / "japanflux_direct_snapshot.json"),
                                  "--timeout", "30", "--retries", "4", *timestamp]),
        lambda d: efd.main(["--output-csv", str(d / "efd_curated_sites_snapshot.csv"),
                            "--output-json", str(d / "efd_curated_sites_snapshot.json"), "--timeout", "30", "--retries", "4", *timestamp]),
        lambda d: ameriflux.main(["--output-csv", str(d / "ameriflux_site_info.csv")]),
        lambda d: vegetation.main([str(d / "site_vegetation_metadata.csv")]),
        lambda d: citations.main(["--output-csv", str(d / "source_citation_metadata.csv")]),
    ]


def validate_coverage(directory: Path) -> None:
    site_ids = set()
    for source in SOURCES[:2]:
        rows, _ = validate_source(source, directory)
        site_ids.update(row["site_id"] for row in rows)
    missing = set(icos.EXPECTED_REGRESSION_SITE_IDS) - site_ids
    if missing:
        raise SnapshotValidationError("Missing expected Shuttle/ICOS sites: " + ", ".join(sorted(missing)))


def summary(report: dict) -> str:
    lines = ["## Catalog refresh", "", "Source | Status | Last successful refresh | Reason", "--- | --- | --- | ---"]
    for name, entry in sorted(report["source_statuses"].items()):
        reason = str(entry.get("reason", "")).replace("|", "/").replace("\n", " ")[:500]
        lines.append(f"{name} | {entry['status']} | {entry.get('last_successful_refresh_at') or 'unknown'} | {reason}")
    return "\n".join(lines) + "\n"


def refresh_catalog(assets: Path, *, strict=False, attempted_at=None, callbacks=None, coverage_check=validate_coverage) -> dict:
    attempted_at = attempted_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    previous_report = json.loads((assets / STATUS_FILE).read_text()) if (assets / STATUS_FILE).exists() else {}
    callbacks = refreshers(attempted_at) if callbacks is None else callbacks
    if len(callbacks) != len(SOURCES):
        raise ValueError("Expected one refresh callback per source.")
    report = {"schema_version": 1, "last_refresh_attempt_at": attempted_at, "source_statuses": {}}
    # All writes happen outside assets until every selected output validates.
    # GitHub publishes the resulting set together in one commit.
    with tempfile.TemporaryDirectory(prefix="catalog-refresh-", dir=assets.parent) as temp:
        staged = Path(temp)
        for source, callback in zip(SOURCES, callbacks):
            report["source_statuses"].update(refresh_source(source, assets, staged, callback, previous_report, attempted_at, strict))
        coverage_check(staged)
        report["status"] = "degraded" if any(s["status"] == "carried_forward" for s in report["source_statuses"].values()) else "fresh"
        # The Shuttle snapshot is always loaded by the browser. Include metadata
        # source statuses there so CSV-only fallbacks are visible too.
        path = staged / "shuttle_snapshot.json"
        payload = json.loads(path.read_text())
        payload["meta"].setdefault("source_statuses", {}).update({
            source.name: report["source_statuses"][source.name]
            for source in SOURCES if not source.paired
        })
        write_json(path, payload)
        for source in SOURCES:
            validate_source(source, staged)
        write_json(staged / STATUS_FILE, report)
        for name in [name for source in SOURCES for name in source.files] + [STATUS_FILE]:
            os.replace(staged / name, assets / name)
    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets-dir", type=Path, default=ROOT / "assets")
    parser.add_argument("--strict-refresh", action="store_true")
    parser.add_argument("--check-health", action="store_true", help="Report degraded health after publication; performs no refresh.")
    args = parser.parse_args(argv)
    if args.check_health:
        report = json.loads((args.assets_dir / STATUS_FILE).read_text())
    else:
        report = refresh_catalog(args.assets_dir, strict=args.strict_refresh)
    print(summary(report))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as handle:
            handle.write(summary(report))
    return int(args.check_health and report["status"] != "fresh")


if __name__ == "__main__":
    raise SystemExit(main())
