import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts import refresh_efd_sites as efd_module
from scripts import refresh_icos_direct_fluxnet as icos_module
from scripts import refresh_japanflux_direct as japan_module


REPO_ROOT = Path(__file__).resolve().parents[1]
SHUTTLE_JSON_SCRIPT = REPO_ROOT / ".github" / "scripts" / "shuttle_snapshot_csv_to_json.py"


class ProcessingLineageGenerationTests(unittest.TestCase):
    def test_icos_rows_stamp_oneflux_processing_lineage(self):
        self.assertIn("processing_lineage", icos_module.OUTPUT_COLUMNS)
        self.assertEqual(
            icos_module.OUTPUT_COLUMNS.index("processing_lineage"),
            icos_module.OUTPUT_COLUMNS.index("source_network") + 1,
        )

        row = icos_module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/test-object"},
                "name": {"value": "FLX_BE-Test_FLUXNET2015_FULLSET_2001-2003_beta-3.zip"},
                "stationId": {"value": "BE-Test"},
                "spec": {"value": icos_module.ARCHIVE_SPEC_URI},
                "project": {"value": icos_module.PROJECT_FLUXNET},
            }
        )

        self.assertIsNotNone(row)
        self.assertEqual(row["processing_lineage"], "oneflux")

    def test_icos_etc_rows_stamp_other_processed_lineage(self):
        row = icos_module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/test-etc-object"},
                "name": {"value": "ICOSETC_CH-Dav_ARCHIVE_L2.zip"},
                "stationId": {"value": "CH-Dav"},
                "spec": {"value": icos_module.ETC_ARCHIVE_SPEC_URI},
                "project": {"value": icos_module.PROJECT_ICOS},
            }
        )

        self.assertIsNotNone(row)
        self.assertEqual(row["processing_lineage"], "other_processed")

    def test_japanflux_rows_stamp_other_processed_lineage(self):
        self.assertIn("processing_lineage", japan_module.OUTPUT_COLUMNS)
        self.assertEqual(
            japan_module.OUTPUT_COLUMNS.index("processing_lineage"),
            japan_module.OUTPUT_COLUMNS.index("source_network") + 1,
        )

        row = japan_module.build_site_row(
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

        self.assertEqual(row["processing_lineage"], "other_processed")

    def test_efd_rows_keep_processing_lineage_neutral_but_preserve_column_position(self):
        self.assertIn("processing_lineage", efd_module.OUTPUT_COLUMNS)
        self.assertEqual(
            efd_module.OUTPUT_COLUMNS.index("processing_lineage"),
            efd_module.OUTPUT_COLUMNS.index("source_network") + 1,
        )

        row = efd_module.build_site_row(
            {
                "Code": "DE-Efd",
                "Name": "EFD Site",
                "Igbp": "ENF",
                "Latitude": 50.0,
                "Longitude": 8.0,
                "Access": "Public",
                "DataUse": "Open",
            },
            "2026-04-02T00:00:00Z",
        )

        self.assertEqual(row["processing_lineage"], "")

    def test_shuttle_json_converter_defaults_processing_lineage_to_oneflux(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_dir = Path(tmp_dir)
            input_csv = temp_dir / "snapshot.csv"
            output_json = temp_dir / "snapshot.json"
            input_csv.write_text(
                "\n".join(
                    [
                        "data_hub,site_id,site_name,network,product_source_network,igbp,first_year,last_year,download_link",
                        "AmeriFlux,US-Test,Test Site,AmeriFlux,AMF,ENF,2001,2003,https://example.org/test.zip",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            subprocess.run(
                [
                    sys.executable,
                    str(SHUTTLE_JSON_SCRIPT),
                    "--input",
                    str(input_csv),
                    "--output",
                    str(output_json),
                    "--snapshot-updated-at",
                    "2026-03-31T00:00:00Z",
                    "--snapshot-updated-date",
                    "2026-03-31",
                ],
                check=True,
                cwd=REPO_ROOT,
            )

            payload = json.loads(output_json.read_text(encoding="utf-8"))
            columns = payload["columns"]
            row = payload["rows"][0]
            self.assertIn("processing_lineage", columns)
            self.assertEqual(columns.index("processing_lineage"), columns.index("source_network") + 1)
            self.assertEqual(row[columns.index("processing_lineage")], "oneflux")

    def test_shuttle_json_converter_preserves_explicit_processing_lineage(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_dir = Path(tmp_dir)
            input_csv = temp_dir / "snapshot.csv"
            output_json = temp_dir / "snapshot.json"
            input_csv.write_text(
                "\n".join(
                    [
                        "data_hub,site_id,site_name,network,product_source_network,processing_lineage,igbp,first_year,last_year,download_link",
                        "JapanFlux,JP-Test,Test Site,JapanFlux,JapanFlux,other_processed,URB,2015,2017,https://example.org/test.zip",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            subprocess.run(
                [
                    sys.executable,
                    str(SHUTTLE_JSON_SCRIPT),
                    "--input",
                    str(input_csv),
                    "--output",
                    str(output_json),
                    "--snapshot-updated-at",
                    "2026-03-31T00:00:00Z",
                    "--snapshot-updated-date",
                    "2026-03-31",
                ],
                check=True,
                cwd=REPO_ROOT,
            )

            payload = json.loads(output_json.read_text(encoding="utf-8"))
            columns = payload["columns"]
            row = payload["rows"][0]
            self.assertEqual(row[columns.index("processing_lineage")], "other_processed")

    def test_shuttle_json_converter_includes_source_status_metadata(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_dir = Path(tmp_dir)
            input_csv = temp_dir / "snapshot.csv"
            output_json = temp_dir / "snapshot.json"
            source_status_json = temp_dir / "source_status.json"
            input_csv.write_text(
                "\n".join(
                    [
                        "data_hub,site_id,site_name,network,product_source_network,processing_lineage,igbp,first_year,last_year,download_link",
                        "AmeriFlux,US-Test,Test Site,AmeriFlux,AMF,oneflux,ENF,2001,2003,https://example.org/test.zip",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            source_status_json.write_text(
                json.dumps(
                    {
                        "source_statuses": {
                            "AmeriFlux": {
                                "status": "carried_forward",
                                "last_successful_refresh_at": "2026-04-10T07:02:12Z",
                                "last_successful_refresh_date": "2026-04-10",
                                "reason": "AmeriFlux candidate retained 54 of 321 previously published sites.",
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            subprocess.run(
                [
                    sys.executable,
                    str(SHUTTLE_JSON_SCRIPT),
                    "--input",
                    str(input_csv),
                    "--output",
                    str(output_json),
                    "--source-status-input",
                    str(source_status_json),
                    "--snapshot-updated-at",
                    "2026-03-31T00:00:00Z",
                    "--snapshot-updated-date",
                    "2026-03-31",
                ],
                check=True,
                cwd=REPO_ROOT,
            )

            payload = json.loads(output_json.read_text(encoding="utf-8"))
            self.assertEqual(
                payload["meta"]["source_statuses"]["AmeriFlux"]["status"],
                "carried_forward",
            )
            self.assertEqual(
                payload["meta"]["source_statuses"]["AmeriFlux"]["last_successful_refresh_date"],
                "2026-04-10",
            )

    def test_committed_snapshot_assets_include_processing_lineage(self):
        csv_paths = [
            REPO_ROOT / "assets" / "shuttle_snapshot.csv",
            REPO_ROOT / "assets" / "icos_direct_fluxnet.csv",
            REPO_ROOT / "assets" / "japanflux_direct_snapshot.csv",
            REPO_ROOT / "assets" / "efd_curated_sites_snapshot.csv",
        ]
        json_paths = [
            REPO_ROOT / "assets" / "shuttle_snapshot.json",
            REPO_ROOT / "assets" / "icos_direct_fluxnet.json",
            REPO_ROOT / "assets" / "japanflux_direct_snapshot.json",
            REPO_ROOT / "assets" / "efd_curated_sites_snapshot.json",
        ]

        for path in csv_paths:
            with path.open("r", encoding="utf-8", newline="") as fh:
                header = next(csv.reader(fh))
            self.assertIn("processing_lineage", header, msg=str(path))

        for path in json_paths:
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertIn("processing_lineage", payload["columns"], msg=str(path))

    def test_committed_snapshot_csv_and_json_pairs_stay_in_sync(self):
        pairs = [
            (REPO_ROOT / "assets" / "shuttle_snapshot.csv", REPO_ROOT / "assets" / "shuttle_snapshot.json"),
            (REPO_ROOT / "assets" / "icos_direct_fluxnet.csv", REPO_ROOT / "assets" / "icos_direct_fluxnet.json"),
            (REPO_ROOT / "assets" / "japanflux_direct_snapshot.csv", REPO_ROOT / "assets" / "japanflux_direct_snapshot.json"),
            (REPO_ROOT / "assets" / "efd_curated_sites_snapshot.csv", REPO_ROOT / "assets" / "efd_curated_sites_snapshot.json"),
        ]

        for csv_path, json_path in pairs:
            with csv_path.open("r", encoding="utf-8", newline="") as fh:
                csv_rows = list(csv.DictReader(fh))
            payload = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(len(payload["rows"]), len(csv_rows), msg=f"{json_path} row count mismatch")

        shuttle_payload = json.loads((REPO_ROOT / "assets" / "shuttle_snapshot.json").read_text(encoding="utf-8"))
        self.assertIn("source_statuses", shuttle_payload["meta"])


if __name__ == "__main__":
    unittest.main()
