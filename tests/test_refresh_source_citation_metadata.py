import importlib.util
import csv
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "refresh_source_citation_metadata.py"
sys.path.insert(0, str(SCRIPT_PATH.parent))
SPEC = importlib.util.spec_from_file_location("refresh_source_citation_metadata", SCRIPT_PATH)
module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(module)


class SourceCitationMetadataTests(unittest.TestCase):
    def test_builds_product_specific_ameriflux_v2_doi_lookup(self):
        lookup = module.build_ameriflux_doi_lookup({
            "values": [
                {
                    "site_id": "AR-Bal",
                    "doi": {
                        "AmeriFlux": "10.17190/AMF/2315764",
                        "FLUXNET": "10.17190/AMF/2571144",
                    },
                },
                {"site_id": "US-Missing", "doi": {}},
            ],
        })

        self.assertEqual(lookup["AR-BAL"]["BASE-BADM"], "10.17190/AMF/2315764")
        self.assertEqual(lookup["AR-BAL"]["FLUXNET"], "10.17190/AMF/2571144")
        self.assertEqual(lookup["US-MISSING"]["BASE-BADM"], "")
        self.assertEqual(lookup["US-MISSING"]["FLUXNET"], "")

    def test_parses_fluxnet2015_doi_only_record(self):
        page = """
        <div id="doilist"><ul>
          <li class="major"><strong>FLUXNET 2015:</strong>
            <a href="https://doi.org/10.18140/FLX/1440191">DOI</a>
          </li>
        </ul></div>
        """

        record = module.parse_source_citations(page)["FLUXNET2015"]

        self.assertEqual(record["citation_doi"], "10.18140/FLX/1440191")
        self.assertEqual(record["citation_url"], "https://doi.org/10.18140/FLX/1440191")
        self.assertEqual(record["citation_text"], "")

    def test_builds_ameriflux_rows_from_v2_doi_without_fetching_site_pages(self):
        availability_records = [
            {
                "site_id": "AR-Bal",
                "data_product": "BASE-BADM",
                "data_policy": "CCBY4.0",
                "citation_source": "AmeriFlux V2 site_info_display API",
                "citation_source_url": module.AMERIFLUX_SITE_INFO_DISPLAY_URL,
            },
            {
                "site_id": "AR-Bal",
                "data_product": "FLUXNET",
                "data_policy": "CCBY4.0",
                "citation_source": "AmeriFlux V2 site_info_display API",
                "citation_source_url": module.AMERIFLUX_SITE_INFO_DISPLAY_URL,
            },
            {
                "site_id": "US-Missing",
                "data_product": "BASE-BADM",
                "data_policy": "CCBY4.0",
                "citation_source": "AmeriFlux V2 site_info_display API",
                "citation_source_url": module.AMERIFLUX_SITE_INFO_DISPLAY_URL,
            },
        ]
        doi_lookup = {
            "AR-BAL": {
                "BASE-BADM": "10.17190/AMF/2315764",
                "FLUXNET": "10.17190/AMF/2571144",
            },
            "US-MISSING": {"BASE-BADM": "", "FLUXNET": ""},
        }

        with patch.object(module, "fetch_text") as fetch_text:
            rows = module.build_citation_rows(
                availability_records,
                timeout=1,
                retries=1,
                retry_delay=0.1,
                workers=1,
                ameriflux_doi_lookup=doi_lookup,
            )

        fetch_text.assert_not_called()
        by_product = {(row["site_id"], row["data_product"]): row for row in rows}
        self.assertEqual(by_product[("AR-Bal", "BASE-BADM")]["citation_doi"], "10.17190/AMF/2315764")
        self.assertEqual(by_product[("AR-Bal", "FLUXNET")]["citation_doi"], "10.17190/AMF/2571144")
        self.assertEqual(by_product[("US-Missing", "BASE-BADM")]["citation_doi"], "")
        self.assertEqual(by_product[("AR-Bal", "BASE-BADM")]["citation_text"], "")

    def test_committed_snapshot_contains_ar_slu_and_product_specific_ameriflux_records(self):
        snapshot_path = REPO_ROOT / "assets" / "source_citation_metadata.csv"
        with snapshot_path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))

        ar_slu = next(
            row for row in rows
            if row["site_id"] == "AR-SLu" and row["data_product"] == "FLUXNET2015"
        )
        ar_bal_products = {
            row["data_product"]: row
            for row in rows
            if row["site_id"] == "AR-Bal" and row["data_policy"] == "CCBY4.0"
        }

        self.assertEqual(ar_slu["citation_doi"], "10.18140/FLX/1440191")
        self.assertEqual(ar_slu["citation_text"], "")
        self.assertEqual(ar_bal_products["BASE-BADM"]["citation_doi"], "10.17190/AMF/2315764")
        self.assertEqual(ar_bal_products["FLUXNET"]["citation_doi"], "10.17190/AMF/2571144")
        self.assertEqual(ar_bal_products["BASE-BADM"]["citation_text"], "")
        self.assertEqual(ar_bal_products["FLUXNET"]["citation_text"], "")
        self.assertEqual(ar_bal_products["BASE-BADM"]["citation_source"], "AmeriFlux V2 site_info_display API")
        self.assertEqual(ar_bal_products["FLUXNET"]["citation_source"], "AmeriFlux V2 site_info_display API")


if __name__ == "__main__":
    unittest.main()
