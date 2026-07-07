import importlib.util
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "validate-preview-artifacts.py"
SPEC = importlib.util.spec_from_file_location("validate_preview_artifacts", MODULE_PATH)
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def variable_metadata() -> dict:
    return {
        variable: {"available": True, "label": variable, "unit": "unit"}
        for variable in module.STANDARD_TARGET_VARIABLES
    }


def write_valid_preview(root: Path) -> None:
    site_id = "US-Test"
    write_json(
        root / "manifest.json",
        {
            "schemaVersion": 1,
            "sites": {
                site_id: {
                    "siteId": site_id,
                    "siteManifestPath": f"sites/{site_id}/manifest.json",
                }
            },
        },
    )
    write_json(
        root / "build-index.json",
        {
            "schemaVersion": 1,
            "sites": {
                site_id: {
                    "siteId": site_id,
                    "artifacts": {"monthly": f"sites/{site_id}/monthly.json"},
                }
            },
        },
    )
    write_json(root / "refresh-report.json", {"schemaVersion": 1})
    write_json(root / "sites" / site_id / "monthly.json", [{"date": "2020-01"}])
    write_json(
        root / "sites" / site_id / "manifest.json",
        {
            "schemaVersion": 1,
            "siteId": site_id,
            "resolutions": {
                "monthly": {
                    "path": "monthly.json",
                    "variables": variable_metadata(),
                }
            },
        },
    )


class ValidatePreviewArtifactsTests(unittest.TestCase):
    def test_valid_preview_tree_passes(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "v1"
            write_valid_preview(root)
            plan_path = Path(tmp) / "plan.json"
            write_json(plan_path, {"sites": [{"siteId": "US-Test"}]})

            summary = module.validate_preview_tree(root, plan_path)

        self.assertEqual(summary["errorCount"], 0)
        self.assertEqual(summary["siteCount"], 1)
        self.assertEqual(summary["expectedSiteCount"], 1)

    def test_local_paths_in_public_metadata_fail(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "v1"
            write_valid_preview(root)
            manifest_path = root / "sites" / "US-Test" / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["debugPath"] = "/Users/example/private"
            write_json(manifest_path, manifest)

            summary = module.validate_preview_tree(root, None)

        self.assertGreater(summary["errorCount"], 0)
        self.assertTrue(any("local filesystem path marker" in error for error in summary["errors"]))

    def test_missing_resolution_artifact_fails(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "v1"
            write_valid_preview(root)
            (root / "sites" / "US-Test" / "monthly.json").unlink()

            summary = module.validate_preview_tree(root, None)

        self.assertGreater(summary["errorCount"], 0)
        self.assertTrue(any("missing artifact monthly.json" in error for error in summary["errors"]))


if __name__ == "__main__":
    unittest.main()
