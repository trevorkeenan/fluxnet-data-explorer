import importlib.util
import csv
from pathlib import Path
import sys
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "refresh_source_citation_metadata.py"
sys.path.insert(0, str(SCRIPT_PATH.parent))
SPEC = importlib.util.spec_from_file_location("refresh_source_citation_metadata", SCRIPT_PATH)
module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(module)


class SourceCitationMetadataTests(unittest.TestCase):
    def test_parses_product_specific_ameriflux_citations(self):
        page = """
        <div id="doilist"><ul>
          <li class="major"><strong>AmeriFlux BASE:</strong>
            <a href="https://doi.org/10.17190/AMF/2315764">DOI</a><br>
            <strong>Citation:</strong> Example Team (2024), AmeriFlux BASE AR-Bal, (Dataset).
            https://doi.org/10.17190/AMF/2315764
          </li>
          <li class="major"><strong>AmeriFlux FLUXNET:</strong>
            <a href="https://doi.org/10.17190/AMF/2571144">DOI</a><br>
            <strong>Citation:</strong> Example Team (2026), AmeriFlux FLUXNET-1F AR-Bal, (Dataset).
            https://doi.org/10.17190/AMF/2571144
          </li>
        </ul></div>
        """

        records = module.parse_source_citations(page)

        self.assertEqual(records["BASE-BADM"]["citation_doi"], "10.17190/AMF/2315764")
        self.assertIn("AmeriFlux BASE AR-Bal", records["BASE-BADM"]["citation_text"])
        self.assertEqual(records["FLUXNET"]["citation_doi"], "10.17190/AMF/2571144")
        self.assertIn("FLUXNET-1F AR-Bal", records["FLUXNET"]["citation_text"])

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
        self.assertNotEqual(
            ar_bal_products["BASE-BADM"]["citation_text"],
            ar_bal_products["FLUXNET"]["citation_text"],
        )


if __name__ == "__main__":
    unittest.main()
