import importlib.util
import io
import json
import shutil
import sys
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "build-shuttle-preview.py"
SPEC = importlib.util.spec_from_file_location("build_shuttle_preview", MODULE_PATH)
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


def write_zip(path: Path, files: dict[str, str]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as zf:
        for name, text in files.items():
            zf.writestr(name, text)
    return path


def zip_payload(files: dict[str, str]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as zf:
        for name, text in files.items():
            zf.writestr(name, text)
    return output.getvalue()


class FakeUrlopenResponse(io.BytesIO):
    def __init__(self, body: bytes, url: str, content_type: str = "application/octet-stream"):
        super().__init__(body)
        self._url = url
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        self.close()

    def geturl(self):
        return self._url


class FakeOpener:
    def __init__(self, handler):
        self.handler = handler

    def open(self, request, timeout=None):
        return self.handler(request, timeout)


def monthly_csv(value: str = "1.23", timestamp: str = "202001", extra_columns: str = "") -> str:
    header = [
        "TIMESTAMP",
        "GPP_DT_VUT_REF",
        "GPP_NT_VUT_REF",
        "NEE_VUT_REF",
        "RECO_NT_VUT_REF",
        "LE_F_MDS",
        "H_F_MDS",
        "TA_F",
        "VPD_F",
        "SW_IN_F",
        "P_F",
    ]
    row = [timestamp, value, "9.99", "-0.8", "2.1", "45.2", "22.7", "12.4", "0.7", "130.1", "-9999"]
    if extra_columns:
        header.append(extra_columns)
        row.append("42")
    return ",".join(header) + "\n" + ",".join(row) + "\nmalformed," + ",".join(["1"] * (len(header) - 1)) + "\n"


def no_target_monthly_csv() -> str:
    return "TIMESTAMP,NOT_A_TARGET\n202001,1\n"


def bifvarinfo_csv() -> str:
    return "VARIABLE,UNIT,LABEL\nGPP_DT_VUT_REF,custom_unit,Custom GPP label\n"


def snapshot_json(path: Path, rows: list[dict[str, str]]) -> Path:
    columns = sorted({key for row in rows for key in row})
    payload = {
        "columns": columns,
        "rows": [[row.get(column, "") for column in columns] for row in rows],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def snapshot_row(site_id: str, url: str = "https://example.test/product.zip") -> dict[str, str]:
    return {
        "site_id": site_id,
        "site_name": site_id + " Site",
        "data_hub": "AmeriFlux",
        "network": "AmeriFlux",
        "source_network": "AMF",
        "first_year": "2020",
        "last_year": "2021",
        "download_link": url,
        "fluxnet_product_name": f"AMF_{site_id}_FLUXNET_2020-2021_v1.3_r1.zip",
        "product_id": "10.1234/test",
        "oneflux_code_version": "v1.3",
        "product_source_network": "AMF",
    }


class ShuttlePreviewBuilderTests(unittest.TestCase):
    ICOS_URL = "https://data.icos-cp.eu/licence_accept?ids=%5B%22SR8Y7XJE2CuwVkPh9WO7iXKF%22%5D"

    def test_monthly_parser_selects_fluxmet_mm_and_ignores_era5_and_other_resolutions(self):
        with TemporaryDirectory() as tmp:
            zip_path = write_zip(
                Path(tmp) / "site.zip",
                {
                    "AMF_US-Test_FLUXNET_ERA5_MM_1981-2025_v1.3_r1.csv": "TIMESTAMP,GPP\n202001,99\n",
                    "AMF_US-Test_FLUXNET_FLUXMET_HH_2020-2021_v1.3_r1.csv": "TIMESTAMP_START,GPP\n202001010000,88\n",
                    "AMF_US-Test_FLUXNET_FLUXMET_DD_2020-2021_v1.3_r1.csv": "TIMESTAMP,GPP\n20200101,77\n",
                    "AMF_US-Test_FLUXNET_FLUXMET_WW_2020-2021_v1.3_r1.csv": "TIMESTAMP,GPP\n202001,66\n",
                    "AMF_US-Test_FLUXNET_FLUXMET_YY_2020-2021_v1.3_r1.csv": "TIMESTAMP,GPP\n2020,55\n",
                    "AMF_US-Test_FLUXNET_BIFVARINFO_MM_2020-2021_v1.3_r1.csv": bifvarinfo_csv(),
                    "AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv(),
                },
            )

            preview = module.parse_monthly_preview_from_zip(zip_path)

        self.assertEqual(preview.source_file, "AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv")
        self.assertEqual(preview.records[0]["date"], "2020-01")
        self.assertEqual(preview.records[0]["GPP"], 1.23)
        self.assertIsNone(preview.records[0]["P"])
        self.assertEqual(preview.source_columns["GPP"], "GPP_DT_VUT_REF")
        self.assertEqual(preview.variable_metadata["GPP"]["unit"], "custom_unit")
        self.assertEqual(preview.skipped_malformed_dates, 1)

    def test_multiple_fluxmet_mm_files_choose_highest_version_and_revision(self):
        with TemporaryDirectory() as tmp:
            zip_path = write_zip(
                Path(tmp) / "site.zip",
                {
                    "AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.2_r4.csv": monthly_csv("1.0"),
                    "AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv("2.0"),
                    "AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r2.csv": monthly_csv("3.0"),
                },
            )

            preview = module.parse_monthly_preview_from_zip(zip_path)

        self.assertEqual(preview.source_file, "AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r2.csv")
        self.assertEqual(preview.records[0]["GPP"], 3.0)
        self.assertEqual(len(preview.selection_warnings), 1)
        self.assertIn("multiple FLUXMET_MM files found", preview.selection_warnings[0])

    def test_missing_fluxmet_mm_file_is_site_scoped_failure(self):
        with TemporaryDirectory() as tmp:
            zip_path = write_zip(
                Path(tmp) / "site.zip",
                {"AMF_US-Test_FLUXNET_ERA5_MM_1981-2025_v1.3_r1.csv": "TIMESTAMP,GPP\n202001,99\n"},
            )

            with self.assertRaisesRegex(module.PreviewBuildError, r"no \*_FLUXNET_FLUXMET_MM_\*.csv"):
                module.parse_monthly_preview_from_zip(zip_path)

    def test_timestamp_parsing_and_variable_alias_priority(self):
        self.assertEqual(module.parse_month("202001"), "2020-01")
        self.assertEqual(module.parse_month("20200101"), "2020-01")
        self.assertEqual(module.parse_month("2020-01"), "2020-01")
        self.assertEqual(module.parse_month("2020-01-31"), "2020-01")
        self.assertIsNone(module.parse_month("bad"))
        self.assertEqual(
            module.select_source_columns(["TIMESTAMP", "GPP_NT_VUT_REF", "GPP_DT_VUT_REF"])["GPP"],
            "GPP_DT_VUT_REF",
        )

    def test_monthly_wide_output_and_manifest_generation(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_zip = write_zip(
                tmp_path / "source.zip",
                {"AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv()},
            )
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", [snapshot_row("US-Test")])
            output_dir = tmp_path / "preview" / "v1"
            cache_dir = tmp_path / "cache"

            def download(product, destination):
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source_zip, destination)

            summary = module.run_build(
                snapshot_path,
                output_dir,
                cache_dir,
                sites=["US-Test"],
                force=True,
                built_at="2026-06-24T00:00:00Z",
                download_func=download,
                log=lambda _message: None,
            )

            monthly = json.loads((output_dir / "sites" / "US-Test" / "monthly.json").read_text())
            site_manifest = json.loads((output_dir / "sites" / "US-Test" / "manifest.json").read_text())
            global_manifest = json.loads((output_dir / "manifest.json").read_text())

        self.assertEqual(len(summary.built), 1)
        self.assertEqual(monthly[0]["date"], "2020-01")
        self.assertEqual(monthly[0]["NEE"], -0.8)
        self.assertEqual(site_manifest["sourceFiles"]["monthly"], "AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv")
        self.assertEqual(site_manifest["sourceColumns"]["monthly"]["GPP"], "GPP_DT_VUT_REF")
        self.assertEqual(site_manifest["sourceRows"]["monthly"]["warnings"], [])
        self.assertIn("productFingerprint", site_manifest)
        self.assertEqual(global_manifest["sites"]["US-Test"]["siteManifestPath"], "sites/US-Test/manifest.json")

    def test_failed_site_does_not_abort_other_sites(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            good_zip = write_zip(
                tmp_path / "good.zip",
                {"AMF_US-Good_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv()},
            )
            bad_zip = write_zip(
                tmp_path / "bad.zip",
                {"AMF_US-Bad_FLUXNET_ERA5_MM_1981-2025_v1.3_r1.csv": "TIMESTAMP,GPP\n202001,99\n"},
            )
            rows = [snapshot_row("US-Good", "https://example.test/good.zip"), snapshot_row("US-Bad", "https://example.test/bad.zip")]
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", rows)

            def download(product, destination):
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(good_zip if product.site_id == "US-Good" else bad_zip, destination)

            summary = module.run_build(
                snapshot_path,
                tmp_path / "preview" / "v1",
                tmp_path / "cache",
                force=True,
                download_func=download,
                log=lambda _message: None,
            )

        self.assertEqual([result.site_id for result in summary.built], ["US-Good"])
        self.assertEqual([result.site_id for result in summary.no_fluxmet_mm], ["US-Bad"])

    def test_fingerprint_skip_and_force_rebuild_logic(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source_zip = write_zip(
                tmp_path / "source.zip",
                {"AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv()},
            )
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", [snapshot_row("US-Test")])
            output_dir = tmp_path / "preview" / "v1"
            cache_dir = tmp_path / "cache"

            def download(product, destination):
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source_zip, destination)

            first = module.run_build(snapshot_path, output_dir, cache_dir, force=False, download_func=download, log=lambda _message: None)
            second = module.run_build(snapshot_path, output_dir, cache_dir, force=False, download_func=download, log=lambda _message: None)
            forced = module.run_build(snapshot_path, output_dir, cache_dir, force=True, download_func=download, log=lambda _message: None)

        self.assertEqual(len(first.built), 1)
        self.assertEqual(len(second.skipped), 1)
        self.assertEqual(second.skipped[0].reason, "product fingerprint unchanged")
        self.assertEqual(len(forced.built), 1)

    def test_dry_run_reports_build_without_download_or_writes(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", [snapshot_row("US-Test")])
            output_dir = tmp_path / "preview" / "v1"

            summary = module.run_build(
                snapshot_path,
                output_dir,
                tmp_path / "cache",
                sites=["US-Test"],
                dry_run=True,
                download_func=lambda _product, _destination: self.fail("dry run should not download"),
                log=lambda _message: None,
            )

        self.assertEqual([result.site_id for result in summary.dry_run_build], ["US-Test"])
        self.assertFalse(output_dir.exists())

    def test_no_target_variables_is_failure(self):
        with TemporaryDirectory() as tmp:
            zip_path = write_zip(
                Path(tmp) / "site.zip",
                {"AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": no_target_monthly_csv()},
            )

            with self.assertRaisesRegex(module.PreviewBuildError, "no target preview variables"):
                module.parse_monthly_preview_from_zip(zip_path)

    def test_icos_licence_accept_url_extracts_object_id(self):
        self.assertTrue(module.is_icos_license_acceptance_url(self.ICOS_URL))
        self.assertEqual(module.extract_icos_object_ids(self.ICOS_URL), ["SR8Y7XJE2CuwVkPh9WO7iXKF"])

    def test_icos_licence_accept_without_token_attempts_unauthenticated_download_and_builds_zip(self):
        with TemporaryDirectory() as tmp, mock.patch.dict(module.os.environ, {}, clear=True):
            tmp_path = Path(tmp)
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", [snapshot_row("AT-Mmg", self.ICOS_URL)])
            requested = []
            payload = zip_payload({"AMF_AT-Mmg_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv()})

            def fake_open(request, timeout):
                requested.append((request.full_url, request.get_header("Cookie"), timeout))
                return FakeUrlopenResponse(payload, request.full_url)

            with mock.patch.object(module.urllib.request, "build_opener", return_value=FakeOpener(fake_open)):
                summary = module.run_build(
                    snapshot_path,
                    tmp_path / "preview" / "v1",
                    tmp_path / "cache",
                    force=True,
                    log=lambda _message: None,
                )
                monthly = json.loads((tmp_path / "preview" / "v1" / "sites" / "AT-Mmg" / "monthly.json").read_text())

        self.assertEqual(requested, [(self.ICOS_URL, None, module.DOWNLOAD_TIMEOUT_SECONDS)])
        self.assertEqual([result.site_id for result in summary.built], ["AT-Mmg"])
        self.assertIn(module.ICOS_UNAUTHENTICATED_SUCCESS_REASON, summary.built[0].reason)
        self.assertEqual(monthly[0]["date"], "2020-01")
        self.assertEqual(monthly[0]["GPP"], 1.23)
        self.assertFalse(summary.has_errors())

    def test_dry_run_icos_licence_accept_without_token_is_reported_buildable(self):
        with TemporaryDirectory() as tmp, mock.patch.dict(module.os.environ, {}, clear=True):
            tmp_path = Path(tmp)
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", [snapshot_row("AT-Mmg", self.ICOS_URL)])

            summary = module.run_build(
                snapshot_path,
                tmp_path / "preview" / "v1",
                tmp_path / "cache",
                dry_run=True,
                log=lambda _message: None,
            )

        self.assertEqual([result.site_id for result in summary.dry_run_build], ["AT-Mmg"])
        self.assertEqual(summary.requires_icos_license_auth, [])
        self.assertFalse(summary.has_errors())

    def test_redirect_to_icos_licence_page_is_classified_as_requires_auth(self):
        with TemporaryDirectory() as tmp, mock.patch.dict(module.os.environ, {}, clear=True):
            destination = Path(tmp) / "download.zip"
            product = module.ProductRow(
                "AT-Test",
                "https://data.icos-cp.eu/some-download-endpoint",
                {"site_id": "AT-Test", "download_link": "https://data.icos-cp.eu/some-download-endpoint"},
            )

            def fake_urlopen(_request, timeout=None):
                return FakeUrlopenResponse(b"<html>ICOS Data Licence</html>", "https://data.icos-cp.eu/licence")

            with mock.patch.object(module.urllib.request, "urlopen", fake_urlopen):
                with self.assertRaises(module.IcosLicenseRequired):
                    module.default_download(product, destination)

        self.assertFalse(destination.exists())

    def test_icos_licence_accept_with_token_falls_back_to_object_url_after_html(self):
        with TemporaryDirectory() as tmp, mock.patch.dict(module.os.environ, {module.ICOS_CPAUTH_TOKEN_ENV: "secret-token"}, clear=True):
            requested = []
            payload = zip_payload({"AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv()})

            def fake_open(request, timeout):
                requested.append((request.full_url, request.get_header("Cookie"), timeout))
                if request.full_url == self.ICOS_URL:
                    return FakeUrlopenResponse(b"<html>ICOS Data Licence</html>", "https://data.icos-cp.eu/licence", "text/html")
                return FakeUrlopenResponse(payload, request.full_url)

            with mock.patch.object(module.urllib.request, "build_opener", return_value=FakeOpener(fake_open)):
                destination = Path(tmp) / "download.zip"
                product = module.ProductRow("AT-Mmg", self.ICOS_URL, {"site_id": "AT-Mmg", "download_link": self.ICOS_URL})
                module.default_download(product, destination)
                downloaded_is_zip = zipfile.is_zipfile(destination)

        self.assertEqual(requested[0], (self.ICOS_URL, None, module.DOWNLOAD_TIMEOUT_SECONDS))
        self.assertEqual(requested[1], ("https://data.icos-cp.eu/objects/SR8Y7XJE2CuwVkPh9WO7iXKF", "cpauthToken=secret-token", module.DOWNLOAD_TIMEOUT_SECONDS))
        self.assertTrue(downloaded_is_zip)

    def test_icos_licence_accept_html_is_deleted_and_classified_as_requires_auth(self):
        with TemporaryDirectory() as tmp, mock.patch.dict(module.os.environ, {}, clear=True):
            tmp_path = Path(tmp)
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", [snapshot_row("AT-Mmg", self.ICOS_URL)])
            requested = []

            def fake_open(request, timeout):
                requested.append(request.full_url)
                return FakeUrlopenResponse(b"<html>ICOS Data Licence</html>", "https://data.icos-cp.eu/licence", "text/html")

            with mock.patch.object(module.urllib.request, "build_opener", return_value=FakeOpener(fake_open)):
                summary = module.run_build(
                    snapshot_path,
                    tmp_path / "preview" / "v1",
                    tmp_path / "cache",
                    force=True,
                    log=lambda _message: None,
                )
                cached_tmp_files = list((tmp_path / "cache").glob("**/*.tmp"))
                cached_zip_files = list((tmp_path / "cache").glob("**/*.zip"))

        self.assertEqual(requested, [self.ICOS_URL])
        self.assertEqual([result.site_id for result in summary.requires_icos_license_auth], ["AT-Mmg"])
        self.assertIn("HTML response", summary.requires_icos_license_auth[0].reason)
        self.assertFalse(cached_tmp_files)
        self.assertFalse(cached_zip_files)
        self.assertFalse(summary.has_errors())

    def test_html_icos_cache_is_deleted_and_not_reused_as_zip(self):
        with TemporaryDirectory() as tmp, mock.patch.dict(module.os.environ, {}, clear=True):
            tmp_path = Path(tmp)
            row = snapshot_row("AT-Mmg", self.ICOS_URL)
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", [row])
            product = module.product_row_from_snapshot(row)
            assert product is not None
            cache_path = module.cache_archive_path(tmp_path / "cache", product, module.compute_fingerprint(product))
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text("<html>ICOS licence page</html>", encoding="utf-8")
            logs = []

            def fake_open(request, timeout):
                return FakeUrlopenResponse(b"<html>ICOS licence page</html>", "https://data.icos-cp.eu/licence", "text/html")

            with mock.patch.object(module.urllib.request, "build_opener", return_value=FakeOpener(fake_open)):
                summary = module.run_build(
                    snapshot_path,
                    tmp_path / "preview" / "v1",
                    tmp_path / "cache",
                    force=True,
                    log=logs.append,
                )
                cache_path_exists = cache_path.exists()

        self.assertFalse(cache_path_exists)
        self.assertEqual([result.site_id for result in summary.requires_icos_license_auth], ["AT-Mmg"])
        self.assertTrue(any("not a valid zip" in message for message in logs))

    def test_normal_amf_and_tern_product_download_validates_zip_and_builds(self):
        with TemporaryDirectory() as tmp, mock.patch.dict(module.os.environ, {}, clear=True):
            tmp_path = Path(tmp)
            rows = [
                snapshot_row("US-Test", "https://example.test/amf-product.zip"),
                {
                    **snapshot_row("AU-Test", "https://example.test/tern-product.zip"),
                    "data_hub": "TERN",
                    "network": "TERN",
                    "source_network": "TERN",
                    "product_source_network": "TERN",
                    "fluxnet_product_name": "TERN_AU-Test_FLUXNET_2020-2021_v1.3_r1.zip",
                },
            ]
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", rows)
            payloads = {
                "US-Test": zip_payload({"AMF_US-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv()}),
                "AU-Test": zip_payload({"TERN_AU-Test_FLUXNET_FLUXMET_MM_2020-2021_v1.3_r1.csv": monthly_csv("2.34")}),
            }

            def fake_urlopen(request, timeout):
                site_id = "AU-Test" if "tern" in request.full_url else "US-Test"
                return FakeUrlopenResponse(payloads[site_id], request.full_url)

            with mock.patch.object(module.urllib.request, "urlopen", fake_urlopen):
                summary = module.run_build(
                    snapshot_path,
                    tmp_path / "preview" / "v1",
                    tmp_path / "cache",
                    force=True,
                    log=lambda _message: None,
                )
                cached_paths_are_zips = [bool(result.cache_path and zipfile.is_zipfile(result.cache_path)) for result in summary.built]

        self.assertEqual([result.site_id for result in summary.built], ["AU-Test", "US-Test"])
        self.assertEqual(cached_paths_are_zips, [True, True])

    def test_summary_grouping_separates_icos_auth_from_non_zip_response(self):
        with TemporaryDirectory() as tmp, mock.patch.dict(module.os.environ, {}, clear=True):
            tmp_path = Path(tmp)
            rows = [
                snapshot_row("AT-Mmg", self.ICOS_URL),
                snapshot_row("US-Bad", "https://example.test/not-a-zip.zip"),
            ]
            snapshot_path = snapshot_json(tmp_path / "snapshot.json", rows)

            def fake_urlopen(request, timeout):
                return FakeUrlopenResponse(b"<html>not a zip</html>", request.full_url, "text/html")

            def fake_open(request, timeout):
                return FakeUrlopenResponse(b"<html>ICOS Data Licence</html>", "https://data.icos-cp.eu/licence", "text/html")

            with mock.patch.object(module.urllib.request, "urlopen", fake_urlopen), mock.patch.object(
                module.urllib.request, "build_opener", return_value=FakeOpener(fake_open)
            ):
                summary = module.run_build(
                    snapshot_path,
                    tmp_path / "preview" / "v1",
                    tmp_path / "cache",
                    force=True,
                    log=lambda _message: None,
                )

        self.assertEqual([result.site_id for result in summary.requires_icos_license_auth], ["AT-Mmg"])
        self.assertEqual([result.site_id for result in summary.non_zip_response], ["US-Bad"])
        self.assertTrue(summary.has_errors())


if __name__ == "__main__":
    unittest.main()
