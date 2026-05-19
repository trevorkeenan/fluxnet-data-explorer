import unittest

from scripts import refresh_efd_sites as module


DETAIL_WITH_POLICY_HTML = """
<div class="TabbedPanelsContent tabPan1">
  <b>Site name:</b> Brasschaat<br />
  <b>Site code:</b> BE-Bra<br />
  <b>Site coordinates:</b> 51.30761 (lat) / 4.51984 (long)<br />
  <b>IGBP:</b> MF<br />
</div>
<div class="TabbedPanelsContent">
  <table class="tabInfo">
    <tr class="flTit">
      <td class="tdx">YEAR</td><td class="tdx">DATA ACCESS</td><td class="tdx">DATA USE</td>
    </tr>
    <tr class='innerTr'><td><b>2001</b></td><td>Public</td><td>Open</td></tr>
    <tr class='innerTr'><td><b>2002</b></td><td>Private</td><td>Close</td></tr>
  </table>
</div>
"""

DETAIL_WITHOUT_POLICY_HTML = """
<div class="TabbedPanelsContent tabPan1">
  <b>Site name:</b> Abu Dhabi Eastern Mangroves<br />
  <b>Site code:</b> AE-ADb<br />
  <b>Site coordinates:</b> 24.450883 (lat) / 54.428792 (long)<br />
  <b>IGBP:</b> WET<br />
</div>
<div class="TabbedPanelsContent">
  <table class="tabInfo">
    <tr class="flTit">
      <td class="tdx">FLUX LIST</td><td class="tdx">METHOD</td><td class="tdx">START YEAR</td><td class="tdx">END YEAR</td>
    </tr>
    <tr class='innerTr'><td><b>CO2</b></td><td>Eddy Covariance</td><td>2017</td><td></td></tr>
  </table>
</div>
<div class="TabbedPanelsContent"></div>
"""


class RefreshEfdSitesTests(unittest.TestCase):
    def test_split_html_tokens_handles_breaks_and_deduplicates(self):
        tokens = module.split_html_tokens("Public<br />Private<br>Public")
        self.assertEqual(tokens, ["Public", "Private"])

    def test_build_site_row_uses_public_request_workflow(self):
        row = module.build_site_row(
            {
                "Code": "BE-Bra",
                "Name": "Brasschaat",
                "Igbp": "MF",
                "Latitude": 51.30761,
                "Longitude": 4.51984,
                "FluxList": "CO2-E<br />LE-E<br />",
                "Access": "Public<br />Private",
                "DataUse": "Open<br />Close",
                "Networks": "EuroFlux<br />ICOS",
            },
            "2026-04-07T00:00:00Z",
        )

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["site_id"], "BE-Bra")
        self.assertEqual(row["country"], "BE")
        self.assertEqual(row["data_hub"], "EFD")
        self.assertEqual(row["download_mode"], "request_page")
        self.assertEqual(row["download_link"], module.REQUEST_PAGE_URL)
        self.assertEqual(row["source_origin"], "efd")
        self.assertEqual(row["network"], "EuroFlux; ICOS")
        self.assertEqual(row["flux_list"], "CO2-E; LE-E")
        self.assertEqual(row["access_label"], "Public; Private")
        self.assertEqual(row["data_use_label"], "Open; Close")
        self.assertEqual(row["processing_lineage"], "")
        self.assertEqual(row["site_page_url"], "https://www.europe-fluxdata.eu/home/site-details?id=BE-Bra")
        self.assertEqual(row["known_data_record"], "")

    def test_parse_public_site_json_uses_structured_fallback_lists(self):
        rows = module.parse_public_site_json(
            {
                "d": [
                    {
                        "Code": "DE-Foo",
                        "Name": "Foo Forest",
                        "Igbp": "ENF",
                        "Latitude": 50.0,
                        "Longitude": 8.0,
                        "FluxList": "",
                        "Access": "Public",
                        "DataUse": "Open",
                        "Networks": "",
                        "Country": "DE",
                        "lNet": [{"Name": "CarboEuropeIP"}],
                        "mFlux": [{"Name": "CO2"}, {"Name": "LE"}],
                    }
                ]
            },
            "2026-04-07T00:00:00Z",
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["site_id"], "DE-Foo")
        self.assertEqual(rows[0]["network"], "CarboEuropeIP")
        self.assertEqual(rows[0]["flux_list"], "CO2; LE")
        self.assertEqual(rows[0]["country"], "DE")

    def test_parse_public_site_csv_builds_partial_rows_when_json_is_unavailable(self):
        rows = module.parse_public_site_csv(
            "\n".join(
                [
                    "Site Code,Site Name,Site Latitude,Site Longitude,IGBP Code,Fluxes",
                    "FI-Bar,Bar Wetland,61.1,24.2,WET,CO2-E|LE-E",
                ]
            ),
            "2026-04-07T00:00:00Z",
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["site_id"], "FI-Bar")
        self.assertEqual(rows[0]["download_mode"], "request_page")
        self.assertEqual(rows[0]["flux_list"], "CO2-E; LE-E")
        self.assertEqual(rows[0]["access_label"], "")
        self.assertEqual(rows[0]["data_use_label"], "")

    def test_extract_policy_rows_reads_year_access_and_data_use(self):
        rows = module.extract_policy_rows(DETAIL_WITH_POLICY_HTML)
        self.assertEqual(
            rows,
            [
                {"year": "2001", "access": "Public", "data_use": "Open"},
                {"year": "2002", "access": "Private", "data_use": "Close"},
            ],
        )

    def test_build_curated_site_row_requires_policy_evidence(self):
        base_row = module.build_site_row(
            {"Code": "AE-ADb", "Name": "Abu Dhabi Eastern Mangroves", "Igbp": "WET"},
            "2026-04-07T00:00:00Z",
        )
        assert base_row is not None

        self.assertIsNone(module.build_curated_site_row(base_row, DETAIL_WITHOUT_POLICY_HTML, "2026-04-07T00:00:00Z"))

    def test_build_curated_site_row_summarizes_known_data_record(self):
        base_row = module.build_site_row(
            {
                "Code": "BE-Bra",
                "Name": "Brasschaat",
                "Igbp": "MF",
                "Latitude": 51.30761,
                "Longitude": 4.51984,
                "FluxList": "CO2-E<br />LE-E<br />",
                "Networks": "EuroFlux<br />ICOS",
            },
            "2026-04-07T00:00:00Z",
        )
        assert base_row is not None

        row = module.build_curated_site_row(base_row, DETAIL_WITH_POLICY_HTML, "2026-04-07T00:00:00Z")

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["site_name"], "Brasschaat")
        self.assertEqual(row["known_data_record"], "true")
        self.assertEqual(row["efd_access_summary"], "mixed")
        self.assertEqual(row["efd_policy_year_count"], "2")
        self.assertEqual(row["efd_policy_years"], "2001; 2002")
        self.assertEqual(row["efd_policy_first_year"], "2001")
        self.assertEqual(row["efd_policy_last_year"], "2002")
        self.assertEqual(row["first_year"], "2001")
        self.assertEqual(row["last_year"], "2002")
        self.assertEqual(row["access_label"], "Public; Private")
        self.assertEqual(row["data_use_label"], "Open; Close")
        self.assertEqual(row["site_page_url"], "https://www.europe-fluxdata.eu/home/site-details?id=BE-Bra")
        self.assertIn("Known EFD data record", row["source_reason"])
        self.assertIn("2026-04-07", row["efd_provenance"])
        self.assertEqual(row["download_mode"], "request_page")

    def test_dedupe_site_rows_prefers_more_complete_record(self):
        rows = module.dedupe_site_rows(
            [
                {
                    "site_id": "FR-Test",
                    "site_name": "Test",
                    "network": "",
                    "vegetation_type": "",
                    "flux_list": "",
                    "access_label": "",
                    "data_use_label": "",
                    "latitude": "",
                    "longitude": "",
                    "site_page_url": "",
                    "known_data_record": "",
                    "efd_policy_year_count": "",
                },
                {
                    "site_id": "FR-Test",
                    "site_name": "Test",
                    "network": "ICOS",
                    "vegetation_type": "DBF",
                    "flux_list": "CO2-E",
                    "access_label": "Public",
                    "data_use_label": "Open",
                    "latitude": "48.0",
                    "longitude": "2.0",
                    "site_page_url": "https://www.europe-fluxdata.eu/home/site-details?id=FR-Test",
                    "known_data_record": "true",
                    "efd_policy_year_count": "5",
                },
            ]
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["network"], "ICOS")
        self.assertEqual(rows[0]["access_label"], "Public")
        self.assertEqual(rows[0]["known_data_record"], "true")


if __name__ == "__main__":
    unittest.main()
