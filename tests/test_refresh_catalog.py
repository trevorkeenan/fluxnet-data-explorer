import io
import json
import shutil
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError

import pytest

from scripts import refresh_catalog as catalog
from scripts import refresh_icos_direct_fluxnet as icos
from scripts import refresh_japanflux_direct as japanflux
from scripts.refresh_errors import SourceUnavailableError
from scripts.snapshot_validation import SnapshotValidationError


NOW = "2026-10-27T12:00:00Z"
LATER = "2026-10-28T12:00:00Z"
OLD = "2026-10-22T10:00:00Z"


@pytest.fixture
def assets(tmp_path):
    directory = tmp_path / "assets"
    directory.mkdir()
    for source in catalog.SOURCES:
        for name in source.files:
            shutil.copyfile(catalog.ROOT / "assets" / name, directory / name)
    # CSV-only metadata has no embedded dates; later runs persist them in this report.
    catalog.write_json(directory / catalog.STATUS_FILE, {
        "source_statuses": {s.name: {"status": "fresh", "last_successful_refresh_at": OLD}
                            for s in catalog.SOURCES if not s.paired},
    })
    return directory


def fresh_callbacks(when=NOW):
    def fresh(source):
        def run(directory):
            if source.paired:
                path = directory / source.files[1]
                payload = json.loads(path.read_text())
                payload["meta"].update(snapshot_refreshed_at=when, snapshot_refreshed_date=when[:10])
                payload["meta"].pop("source_statuses", None)
                if source.name == "FLUXNET Shuttle":
                    payload["meta"]["source_statuses"] = {
                        hub: {"status": "fresh", "last_successful_refresh_at": when}
                        for hub in ("AmeriFlux", "ICOS", "TERN")
                    }
                catalog.write_json(path, payload)
        return run
    return [fresh(source) for source in catalog.SOURCES]


def run_catalog(assets, callbacks, when=NOW, strict=False):
    return catalog.refresh_catalog(assets, callbacks=callbacks, attempted_at=when, strict=strict)


def all_bytes(assets):
    return {path.name: path.read_bytes() for path in assets.iterdir()}


def ads_404(directory):
    endpoint = japanflux.ADS_API_BASE + "/metadata/A20240722-001/versions"
    with mock.patch.object(japanflux, "urlopen", side_effect=HTTPError(
            endpoint, 404, "Not Found", {}, io.BytesIO(b"<html>404 Not Found</html>"))):
        japanflux.main([
            "--output-csv", str(directory / "japanflux_direct_snapshot.csv"),
            "--output-json", str(directory / "japanflux_direct_snapshot.json"),
            "--snapshot-updated-at", NOW, "--retries", "1",
        ])


def icos_timeout(directory):
    with mock.patch.object(icos, "urlopen", side_effect=TimeoutError("The read operation timed out")):
        icos.sparql_post("SELECT * WHERE {}", timeout=1, retries=1, retry_delay=0)


def test_actual_ads_404_and_icos_timeout_publish_other_sources(assets):
    original_csv = (assets / "japanflux_direct_snapshot.csv").read_bytes()
    original_json = json.loads((assets / "japanflux_direct_snapshot.json").read_text())
    callbacks = fresh_callbacks()
    callbacks[1:3] = [icos_timeout, ads_404]
    report = run_catalog(assets, callbacks)
    assert report["status"] == "degraded"
    assert report["source_statuses"]["ICOS-direct"]["status"] == "carried_forward"
    assert report["source_statuses"]["JapanFlux"]["http_status"] == 404
    assert report["source_statuses"]["JapanFlux"]["endpoint"].endswith("/versions")
    assert report["source_statuses"]["EFD"]["status"] == "fresh"
    assert report["source_statuses"]["AmeriFlux site metadata"]["last_successful_refresh_at"] == NOW
    retained = json.loads((assets / "japanflux_direct_snapshot.json").read_text())
    assert retained["rows"] == original_json["rows"]
    for key in ("inventory_version", "version", "snapshot_updated_at"):
        assert retained["meta"][key] == original_json["meta"][key]
    assert (assets / "japanflux_direct_snapshot.csv").read_bytes() == original_csv
    icos_meta = json.loads((assets / "icos_direct_fluxnet.json").read_text())["meta"]
    assert icos_meta["source_statuses"]["ICOS-direct"]["status"] == "carried_forward"
    assert catalog.main(["--assets-dir", str(assets), "--check-health"]) == 1


def test_repeated_failures_preserve_success_and_recovery_clears_status(assets):
    callbacks = fresh_callbacks()
    callbacks[1] = icos_timeout
    first = run_catalog(assets, callbacks)
    callbacks = fresh_callbacks(LATER)
    callbacks[1] = icos_timeout
    second = run_catalog(assets, callbacks, LATER)
    a, b = [r["source_statuses"]["ICOS-direct"] for r in (first, second)]
    assert a["last_successful_refresh_at"] == b["last_successful_refresh_at"]
    assert b["last_refresh_attempt_at"] == LATER
    third = run_catalog(assets, fresh_callbacks(LATER), LATER)
    assert third["source_statuses"]["ICOS-direct"] == {
        "status": "fresh", "last_successful_refresh_at": LATER,
        "last_successful_refresh_date": LATER[:10], "last_refresh_attempt_at": LATER,
        "published_row_count": 365,
    }
    assert third["status"] == "fresh"
    assert catalog.main(["--assets-dir", str(assets), "--check-health"]) == 0


def test_csv_metadata_outage_keeps_data_and_original_success_date(assets):
    before = (assets / "site_vegetation_metadata.csv").read_bytes()
    def fail(directory):
        raise SourceUnavailableError("HTTP 503", endpoint="https://example.org/metadata", status_code=503)
    callbacks = fresh_callbacks()
    callbacks[5] = fail
    first = run_catalog(assets, callbacks)
    second = run_catalog(assets, callbacks, LATER)
    assert (assets / "site_vegetation_metadata.csv").read_bytes() == before
    assert first["source_statuses"]["Vegetation metadata"]["last_successful_refresh_at"] == OLD
    assert second["source_statuses"]["Vegetation metadata"]["last_successful_refresh_at"] == OLD
    shuttle_meta = json.loads((assets / "shuttle_snapshot.json").read_text())["meta"]
    assert shuttle_meta["source_statuses"]["Vegetation metadata"]["status"] == "carried_forward"


@pytest.mark.parametrize("failure", [RuntimeError("program bug"), TypeError("program bug"), ValueError("invalid upstream JSON")])
def test_unexpected_error_blocks_all_publication(assets, failure):
    before = all_bytes(assets)
    def broken(directory):
        (directory / "icos_direct_fluxnet.csv").write_text("partial output")
        raise failure
    callbacks = fresh_callbacks()
    callbacks[1] = broken
    with pytest.raises(type(failure)):
        run_catalog(assets, callbacks)
    assert all_bytes(assets) == before


@pytest.mark.parametrize("index", [1, 2])
def test_strict_refresh_rejects_retained_sources_without_publication(assets, index):
    callbacks = fresh_callbacks()
    callbacks[index] = [icos_timeout, ads_404][index - 1]
    before = all_bytes(assets)
    with pytest.raises(SourceUnavailableError):
        run_catalog(assets, callbacks, strict=True)
    assert all_bytes(assets) == before


def test_corrupt_same_length_fallback_blocks_publication(assets):
    path = assets / "icos_direct_fluxnet.json"
    payload = json.loads(path.read_text())
    payload["rows"][0][payload["columns"].index("download_link")] = "https://example.org/wrong"
    catalog.write_json(path, payload)
    before = all_bytes(assets)
    callbacks = fresh_callbacks()
    callbacks[1] = icos_timeout
    with pytest.raises(SnapshotValidationError, match="contents differ"):
        run_catalog(assets, callbacks)
    assert all_bytes(assets) == before


def test_suspicious_site_loss_retains_snapshot_and_flags_reason(assets):
    def incomplete(directory):
        path = directory / "icos_direct_fluxnet.json"
        payload = json.loads(path.read_text())
        row = dict(zip(payload["columns"], payload["rows"][0]))
        icos.write_csv(directory / "icos_direct_fluxnet.csv", [row])
        icos.write_json(path, [row], {}, NOW, NOW[:10])
    callbacks = fresh_callbacks()
    callbacks[1] = incomplete
    before = (assets / "icos_direct_fluxnet.csv").read_bytes()
    report = run_catalog(assets, callbacks)
    assert "retained 1/365" in report["source_statuses"]["ICOS-direct"]["reason"]
    assert (assets / "icos_direct_fluxnet.csv").read_bytes() == before


def test_duplicate_candidate_is_fatal(assets):
    def duplicate(directory):
        path = directory / "icos_direct_fluxnet.csv"
        with path.open("a") as handle:
            handle.write(path.read_text().splitlines(keepends=True)[1])
    callbacks = fresh_callbacks()
    callbacks[1] = duplicate
    before = all_bytes(assets)
    with pytest.raises(SnapshotValidationError, match="Duplicate"):
        run_catalog(assets, callbacks)
    assert all_bytes(assets) == before


def test_icos_server_timeout_is_recoverable_but_bad_query_is_fatal():
    for code, body, expected in [(400, b"SPARQL execution timeout", SourceUnavailableError),
                                 (400, b"Malformed query", HTTPError)]:
        error = HTTPError(icos.SPARQL_ENDPOINT, code, "Bad Request", {}, io.BytesIO(body))
        with mock.patch.object(icos, "urlopen", side_effect=error):
            with pytest.raises(expected):
                icos.sparql_post("query", timeout=1, retries=1, retry_delay=0)


def test_missing_fallback_blocks_publication(assets):
    (assets / "efd_curated_sites_snapshot.json").unlink()
    before = all_bytes(assets)
    with pytest.raises(SnapshotValidationError, match="Unreadable JSON"):
        run_catalog(assets, fresh_callbacks())
    assert all_bytes(assets) == before


def test_shuttle_outage_preserves_hub_dates_and_strict_mode_rejects_it(assets):
    callbacks = fresh_callbacks()
    callbacks[0] = catalog.refreshers(NOW)[0]
    previous = json.loads((assets / "shuttle_snapshot.json").read_text())
    with mock.patch.object(catalog.shuttle, "fetch_candidate_csv_via_shuttle", side_effect=TimeoutError("provider timed out")):
        report = run_catalog(assets, callbacks)
        for hub in ("AmeriFlux", "ICOS", "TERN"):
            assert report["source_statuses"][hub]["status"] == "carried_forward"
            assert report["source_statuses"][hub]["last_successful_refresh_at"] == previous["meta"]["source_statuses"][hub]["last_successful_refresh_at"]
        updated = json.loads((assets / "shuttle_snapshot.json").read_text())
        assert updated["meta"]["snapshot_refreshed_at"] != NOW
        before = all_bytes(assets)
        with pytest.raises(SourceUnavailableError):
            run_catalog(assets, callbacks, strict=True)
        assert all_bytes(assets) == before


def test_shuttle_programming_error_is_not_treated_as_outage(assets):
    callbacks = fresh_callbacks()
    callbacks[0] = catalog.refreshers(NOW)[0]
    before = all_bytes(assets)
    with mock.patch.object(catalog.shuttle, "fetch_candidate_csv_via_shuttle", side_effect=TypeError("bug")):
        with pytest.raises(TypeError):
            run_catalog(assets, callbacks)
    assert all_bytes(assets) == before
