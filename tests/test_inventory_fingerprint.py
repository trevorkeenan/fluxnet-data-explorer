import csv
import json
import subprocess
import sys

from scripts.inventory_fingerprint import inventory_change_summary, inventory_version


SHUTTLE_COLUMNS = [
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
    "download_link",
    "fluxnet_product_name",
    "product_citation",
    "product_id",
]


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=SHUTTLE_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def run_converter(input_path, output_path, timestamp, *, return_output=False):
    result = subprocess.run(
        [
            sys.executable,
            ".github/scripts/shuttle_snapshot_csv_to_json.py",
            "--input",
            str(input_path),
            "--output",
            str(output_path),
            "--snapshot-updated-at",
            timestamp,
            "--snapshot-updated-date",
            timestamp[:10],
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    return (payload, result.stdout) if return_output else payload


def sample_row(**overrides):
    row = {
        "site_id": "US-Test",
        "site_name": "Test site",
        "country": "US",
        "data_hub": "AmeriFlux",
        "network": "AmeriFlux",
        "source_network": "AmeriFlux",
        "processing_lineage": "oneflux",
        "vegetation_type": "ENF",
        "first_year": "2001",
        "last_year": "2003",
        "download_link": "https://example.test/data-v1.zip",
        "fluxnet_product_name": "FLUXNET product",
        "product_citation": "Original citation",
        "product_id": "product-v1",
    }
    row.update(overrides)
    return row


def test_metadata_and_order_do_not_change_inventory_fingerprint():
    first = sample_row()
    second = sample_row(site_id="US-Second", download_link="https://example.test/second.zip")
    changed_metadata = dict(first, site_name="Renamed site", product_citation="Corrected citation")

    assert inventory_version([first, second], SHUTTLE_COLUMNS) == inventory_version(
        [second, changed_metadata], SHUTTLE_COLUMNS
    )


def test_site_product_and_download_changes_each_change_inventory_fingerprint():
    baseline = sample_row()
    baseline_version = inventory_version([baseline], SHUTTLE_COLUMNS)

    for changed_rows in (
        [baseline, sample_row(site_id="US-New")],
        [sample_row(product_id="product-v2")],
        [sample_row(download_link="https://example.test/replacement.zip")],
    ):
        assert inventory_version(changed_rows, SHUTTLE_COLUMNS) != baseline_version


def test_inventory_change_summary_reports_only_normalized_availability_changes():
    old_rows = [sample_row(), sample_row(site_id="US-Removed")]
    new_rows = [
        sample_row(site_name="Metadata-only rename", product_id="product-v2"),
        sample_row(site_id="US-Added"),
    ]

    summary = inventory_change_summary("test-source", old_rows, new_rows, SHUTTLE_COLUMNS)

    assert summary["source"] == "test-source"
    assert summary["inventory_changed"] is True
    assert summary["changed_site_ids"] == ["US-Added", "US-Removed", "US-Test"]
    assert summary["added_site_ids"] == ["US-Added"]
    assert summary["removed_site_ids"] == ["US-Removed"]
    changed_site = next(site for site in summary["sites"] if site["site_id"] == "US-Test")
    assert changed_site["fields"]["product_id"] == {
        "old": ["product-v1"],
        "new": ["product-v2"],
    }
    assert "site_name" not in changed_site["fields"]


def test_inventory_change_summary_ignores_metadata_and_row_order():
    first = sample_row()
    second = sample_row(site_id="US-Second")
    new_rows = [second, sample_row(site_name="Renamed site", product_citation="Corrected citation")]

    summary = inventory_change_summary("test-source", [first, second], new_rows, SHUTTLE_COLUMNS)

    assert summary["inventory_changed"] is False
    assert summary["changed_site_ids"] == []
    assert summary["sites"] == []


def test_inventory_change_summary_does_not_report_unchanged_fields_after_product_reordering():
    old_rows = [
        sample_row(product_id="product-a", download_link="https://example.test/z.zip"),
        sample_row(product_id="product-b", download_link="https://example.test/a.zip"),
    ]
    new_rows = [
        sample_row(product_id="product-c", download_link="https://example.test/z.zip"),
        sample_row(product_id="product-b", download_link="https://example.test/a.zip"),
    ]

    summary = inventory_change_summary("test-source", old_rows, new_rows, SHUTTLE_COLUMNS)

    assert summary["changed_site_ids"] == ["US-Test"]
    assert summary["sites"][0]["fields"] == {
        "product_id": {
            "old": ["product-a", "product-b"],
            "new": ["product-b", "product-c"],
        }
    }


def test_refresh_date_advances_but_new_data_date_only_advances_for_inventory_change(tmp_path):
    csv_path = tmp_path / "snapshot.csv"
    json_path = tmp_path / "snapshot.json"
    write_csv(csv_path, [sample_row()])

    first = run_converter(csv_path, json_path, "2026-06-01T01:00:00Z")

    # Metadata-only edits and a later refresh must not count as new data.
    write_csv(csv_path, [sample_row(site_name="Renamed site", product_citation="Corrected citation")])
    second = run_converter(csv_path, json_path, "2026-06-02T01:00:00Z")
    assert second["meta"]["snapshot_refreshed_date"] == "2026-06-02"
    assert second["meta"]["snapshot_updated_date"] == "2026-06-01"
    assert second["meta"]["inventory_version"] == first["meta"]["inventory_version"]
    assert second["meta"]["version"] != first["meta"]["version"]

    # A new product/download endpoint is a meaningful availability change.
    write_csv(
        csv_path,
        [
            sample_row(site_name="Renamed site", product_citation="Corrected citation"),
            sample_row(
                site_id="US-New",
                product_id="product-v2",
                download_link="https://example.test/data-v2.zip",
            ),
        ],
    )
    third = run_converter(csv_path, json_path, "2026-06-03T01:00:00Z")
    assert third["meta"]["snapshot_refreshed_date"] == "2026-06-03"
    assert third["meta"]["snapshot_updated_date"] == "2026-06-03"
    assert third["meta"]["inventory_version"] != second["meta"]["inventory_version"]


def test_converter_emits_inventory_change_summary_before_write(tmp_path):
    csv_path = tmp_path / "snapshot.csv"
    json_path = tmp_path / "snapshot.json"
    write_csv(csv_path, [sample_row()])

    _, stdout = run_converter(
        csv_path,
        json_path,
        "2026-06-01T01:00:00Z",
        return_output=True,
    )

    summary_line = next(line for line in stdout.splitlines() if "inventory_change_summary=" in line)
    summary = json.loads(summary_line.split("inventory_change_summary=", 1)[1])
    assert summary["source"] == "FLUXNET Shuttle"
    assert summary["changed_site_ids"] == ["US-Test"]
    assert summary["added_site_ids"] == ["US-Test"]
