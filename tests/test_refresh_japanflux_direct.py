import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from unittest import mock

from scripts import refresh_japanflux_direct as module


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


class RefreshJapanFluxDirectTests(unittest.TestCase):
    def test_parse_site_inventory_has_expected_size(self):
        inventory = module.parse_site_inventory()
        self.assertEqual(len(inventory), 83)
        self.assertEqual(inventory[0]["site_id"], "JP-Ozm")
        self.assertEqual(inventory[-1]["site_id"], "JP-Tmd")

    def test_collect_measurement_years_ignores_era5_files(self):
        entries = [
            {"name": "FLX_JP-Ozm_JapanFLUX2024_ALLVARS_HH_2015-2017_1-3.csv", "directory": False},
            {"name": "FLX_JP-Ozm_JapanFLUX2024_ALLVARS_MM_2015-2017_1-3.csv", "directory": False},
            {"name": "FLX_JP-Ozm_JapanFLUX2024_ERA5_DD_1990-2024_1-3.csv", "directory": False},
        ]

        first_year, last_year = module.collect_measurement_years(entries, "JP-Ozm")

        self.assertEqual((first_year, last_year), (2015, 2017))

    def test_build_site_row_uses_landing_page_when_direct_url_missing(self):
        row = module.build_site_row(
            {
                "metadata_id": "A20240722-001",
                "site_id": "JP-Ozm",
                "site_name": "Oizumi Urban Park",
                "country": "JP",
                "vegetation_type": "URB",
                "latitude": 34.56347,
                "longitude": 135.533484,
            },
            "1.00",
            2015,
            2017,
            "",
        )

        self.assertEqual(row["download_mode"], "landing_page")
        self.assertEqual(row["download_link"], "https://ads.nipr.ac.jp/dataset/A20240722-001")
        self.assertEqual(row["direct_download_url"], "")
        self.assertEqual(row["processing_lineage"], "other_processed")

    def test_build_direct_download_url_uses_confirmed_ads_zip_endpoint(self):
        direct_url = module.build_direct_download_url("A20240722-001", "1.00")

        self.assertEqual(
            direct_url,
            "https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA",
        )

    def test_build_site_row_prefers_validated_direct_url(self):
        row = module.build_site_row(
            {
                "metadata_id": "A20240722-001",
                "site_id": "JP-Ozm",
                "site_name": "Oizumi Urban Park",
                "country": "JP",
                "vegetation_type": "URB",
                "latitude": 34.56347,
                "longitude": 135.533484,
            },
            "1.00",
            2015,
            2017,
            "https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA",
        )

        self.assertEqual(row["download_mode"], "direct")
        self.assertEqual(
            row["download_link"],
            "https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA",
        )
        self.assertEqual(
            row["landing_page_url"],
            "https://ads.nipr.ac.jp/dataset/A20240722-001",
        )

    def test_validate_direct_download_url_uses_confirmed_endpoint(self):
        with mock.patch.object(module, "probe_direct_download_url", return_value="https://example.org/japanflux.zip") as probe:
            resolved = module.validate_direct_download_url(
                "A20240722-001",
                "1.00",
                timeout=5,
            )

        self.assertEqual(resolved, "https://example.org/japanflux.zip")
        probe.assert_called_once_with(
            "https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA",
            timeout=5,
        )

    def test_validate_direct_download_url_falls_back_when_probe_fails(self):
        with mock.patch.object(module, "probe_direct_download_url", return_value=None):
            resolved = module.validate_direct_download_url(
                "A20240722-001",
                "1.00",
                timeout=5,
            )

        self.assertEqual(resolved, "")

    def test_ads_outage_detection_matches_maintenance_response(self):
        self.assertTrue(module.looks_like_ads_outage(RuntimeError("HTTP 503: ADS is under maintenance.")))
        self.assertFalse(module.looks_like_ads_outage(RuntimeError("No versions returned for A20240722-001")))

    def test_request_json_classifies_ads_503_maintenance_as_upstream_unavailable(self):
        maintenance = b"<html><body>ADS is under maintenance. Please wait.</body></html>"
        error = HTTPError(
            "https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/versions",
            503,
            "Service Unavailable",
            hdrs=None,
            fp=io.BytesIO(maintenance),
        )

        with mock.patch.object(module, "urlopen", side_effect=error), self.assertRaises(module.UpstreamUnavailableError) as ctx:
            module.request_json("https://example.test/versions", timeout=1, retries=1, retry_delay=0, label="JP-Ozm versions")

        self.assertIn("HTTP 503", str(ctx.exception))
        self.assertIn("ADS is under maintenance", str(ctx.exception))

    def test_request_json_treats_non_maintenance_invalid_json_as_fatal_parse_error(self):
        with mock.patch.object(module, "urlopen", return_value=FakeResponse(b"<html>unexpected proxy page</html>")):
            with self.assertRaises(module.ResponseParseError):
                module.request_json("https://example.test/versions", timeout=1, retries=1, retry_delay=0, label="JP-Ozm versions")

    def test_ads_maintenance_carries_forward_previous_snapshot_without_rewriting_csv(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_json, output_csv, status_output = self.write_previous_snapshot(Path(tmp))
            original_csv = output_csv.read_text(encoding="utf-8")

            with mock.patch.object(
                module,
                "extract_latest_version",
                side_effect=module.UpstreamUnavailableError("ADS unavailable after 1 attempt(s): HTTP 503: ADS is under maintenance."),
            ) as extract_latest_version:
                module.main(
                    [
                        "--output-csv",
                        str(output_csv),
                        "--output-json",
                        str(output_json),
                        "--status-output",
                        str(status_output),
                        "--snapshot-updated-at",
                        "2026-06-04T12:00:00Z",
                        "--snapshot-updated-date",
                        "2026-06-04",
                        "--timeout",
                        "1",
                        "--retries",
                        "1",
                    ]
                )

            extract_latest_version.assert_called_once()
            self.assertEqual(output_csv.read_text(encoding="utf-8"), original_csv)

            payload = json.loads(output_json.read_text(encoding="utf-8"))
            self.assertEqual(payload["rows"], [self.previous_row_values()])
            self.assertEqual(payload["meta"]["snapshot_refreshed_date"], "2026-06-04")
            self.assertEqual(payload["meta"]["snapshot_updated_date"], "2026-05-29")
            self.assertEqual(payload["meta"]["last_refresh_status"], "carried_forward")
            japanflux_status = payload["meta"]["source_statuses"]["JapanFlux"]
            self.assertEqual(japanflux_status["status"], "carried_forward")
            self.assertEqual(japanflux_status["last_successful_refresh_date"], "2026-05-29")
            self.assertEqual(japanflux_status["published_row_count"], 1)
            self.assertIn("under maintenance", japanflux_status["reason"])

            status_payload = json.loads(status_output.read_text(encoding="utf-8"))
            self.assertEqual(status_payload["carried_forward_sources"], ["JapanFlux"])
            self.assertEqual(status_payload["source_statuses"]["JapanFlux"]["status"], "carried_forward")

    def test_strict_refresh_fails_ads_maintenance_instead_of_carrying_forward(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_json, output_csv, status_output = self.write_previous_snapshot(Path(tmp))
            original_payload = output_json.read_text(encoding="utf-8")

            with mock.patch.object(
                module,
                "extract_latest_version",
                side_effect=module.UpstreamUnavailableError("HTTP 503: ADS is under maintenance."),
            ):
                with self.assertRaises(module.UpstreamUnavailableError):
                    module.main(
                        [
                            "--output-csv",
                            str(output_csv),
                            "--output-json",
                            str(output_json),
                            "--status-output",
                            str(status_output),
                            "--strict-refresh",
                            "--snapshot-updated-at",
                            "2026-06-04T12:00:00Z",
                            "--snapshot-updated-date",
                            "2026-06-04",
                            "--timeout",
                            "1",
                            "--retries",
                            "1",
                        ]
                    )

            self.assertEqual(output_json.read_text(encoding="utf-8"), original_payload)
            status_payload = json.loads(status_output.read_text(encoding="utf-8"))
            self.assertEqual(status_payload["fatal_sources"], ["JapanFlux"])
            self.assertEqual(status_payload["source_statuses"]["JapanFlux"]["status"], "failed_fatally")

    def test_ads_maintenance_fails_when_no_valid_previous_snapshot_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_csv = Path(tmp) / "japanflux.csv"
            output_json = Path(tmp) / "japanflux.json"
            status_output = Path(tmp) / "status.json"
            output_csv.write_text("not,the,right,columns\n", encoding="utf-8")
            output_json.write_text(json.dumps({"meta": {"version": "sha256:previous"}, "columns": ["site_id"], "rows": []}), encoding="utf-8")

            with mock.patch.object(
                module,
                "extract_latest_version",
                side_effect=module.UpstreamUnavailableError("HTTP 503: ADS is under maintenance."),
            ):
                with self.assertRaises(RuntimeError):
                    module.main(
                        [
                            "--output-csv",
                            str(output_csv),
                            "--output-json",
                            str(output_json),
                            "--status-output",
                            str(status_output),
                            "--snapshot-updated-at",
                            "2026-06-04T12:00:00Z",
                            "--snapshot-updated-date",
                            "2026-06-04",
                        ]
                    )

            status_payload = json.loads(status_output.read_text(encoding="utf-8"))
            self.assertEqual(status_payload["fatal_sources"], ["JapanFlux"])
            self.assertEqual(status_payload["source_statuses"]["JapanFlux"]["status"], "failed_fatally")

    def previous_row(self):
        return module.build_site_row(
            {
                "metadata_id": "A20240722-001",
                "site_id": "JP-Ozm",
                "site_name": "Oizumi Urban Park",
                "country": "JP",
                "vegetation_type": "URB",
                "latitude": 34.56347,
                "longitude": 135.533484,
            },
            "1.00",
            2015,
            2017,
            "https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA",
        )

    def previous_row_values(self):
        row = self.previous_row()
        return [row.get(column) for column in module.OUTPUT_COLUMNS]

    def write_previous_snapshot(self, tmp_path):
        output_csv = tmp_path / "japanflux.csv"
        output_json = tmp_path / "japanflux.json"
        status_output = tmp_path / "status.json"
        row = self.previous_row()
        module.write_csv(output_csv, [row])
        payload = {
            "meta": {
                "schema_version": 1,
                "version": "sha256:previous-valid",
                "snapshot_refreshed_at": "2026-06-02T09:23:39Z",
                "snapshot_refreshed_date": "2026-06-02",
                "snapshot_updated_at": "2026-05-29T09:00:32Z",
                "snapshot_updated_date": "2026-05-29",
            },
            "columns": list(module.OUTPUT_COLUMNS),
            "rows": [self.previous_row_values()],
        }
        output_json.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
        return output_json, output_csv, status_output


if __name__ == "__main__":
    unittest.main()
