#!/usr/bin/env python3
"""Validate FLUXNET Shuttle preview artifact trees."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


STANDARD_TARGET_VARIABLES = [
    "GPP_NT_VUT_REF",
    "GPP_NT_CUT_REF",
    "GPP_DT_VUT_REF",
    "GPP_DT_CUT_REF",
    "NEE_VUT_REF",
    "NEE_CUT_REF",
    "RECO_NT_VUT_REF",
    "RECO_NT_CUT_REF",
    "RECO_DT_VUT_REF",
    "RECO_DT_CUT_REF",
    "LE",
    "H",
    "TA",
    "VPD",
    "SW_IN",
    "P",
]
PUBLIC_METADATA_FILES = {"manifest.json", "build-index.json"}
LOCAL_PATH_MARKERS = ("/Users/", "/tmp/", "ExplorerFluxData")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview-dir", required=True, type=Path, help="Preview artifact root, for example /tmp/fluxnet-preview-refresh/v1.")
    parser.add_argument("--plan", type=Path, help="Optional refresh plan JSON. When present, expected site count is read from plan.sites.")
    parser.add_argument("--summary-out", type=Path, help="Optional path to write validation summary JSON.")
    return parser.parse_args(argv)


def load_json(path: Path, errors: List[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        errors.append(f"{path}: {error}")
        return None


def relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def expected_site_count(plan_path: Optional[Path], errors: List[str]) -> Optional[int]:
    if plan_path is None:
        return None
    plan = load_json(plan_path, errors)
    if not isinstance(plan, dict):
        errors.append(f"{plan_path}: plan is not a JSON object")
        return None
    sites = plan.get("sites")
    if not isinstance(sites, list):
        errors.append(f"{plan_path}: plan.sites is not a list")
        return None
    return len(sites)


def has_local_path_marker(text: str) -> bool:
    return any(marker in text for marker in LOCAL_PATH_MARKERS)


def validate_variable_metadata(site_id: str, resolution: str, spec: Dict[str, Any], errors: List[str]) -> None:
    variables = spec.get("variables")
    if not isinstance(variables, dict):
        errors.append(f"{site_id}/{resolution}: missing variables object")
        return
    if list(variables.keys()) != STANDARD_TARGET_VARIABLES:
        errors.append(f"{site_id}/{resolution}: variable menu does not match the standard 16-variable order")
        return
    for variable in STANDARD_TARGET_VARIABLES:
        metadata = variables.get(variable)
        if not isinstance(metadata, dict):
            errors.append(f"{site_id}/{resolution}/{variable}: metadata is not an object")
            continue
        missing = [field for field in ("available", "label", "unit") if field not in metadata]
        if missing:
            errors.append(f"{site_id}/{resolution}/{variable}: missing metadata field(s): {', '.join(missing)}")


def validate_preview_tree(preview_dir: Path, plan_path: Optional[Path]) -> Dict[str, Any]:
    errors: List[str] = []
    required = ["manifest.json", "build-index.json", "refresh-report.json"]
    missing_top_level = [name for name in required if not (preview_dir / name).exists()]
    sites_dir = preview_dir / "sites"
    if not sites_dir.exists():
        missing_top_level.append("sites/")
    errors.extend(f"missing top-level artifact: {name}" for name in missing_top_level)

    parse_errors: List[str] = []
    json_files = sorted(path for path in preview_dir.rglob("*.json") if path.is_file()) if preview_dir.exists() else []
    for path in json_files:
        load_json(path, parse_errors)
    errors.extend(parse_errors)

    expected_count = expected_site_count(plan_path, errors)
    manifest = load_json(preview_dir / "manifest.json", errors) if (preview_dir / "manifest.json").exists() else {}
    build_index = load_json(preview_dir / "build-index.json", errors) if (preview_dir / "build-index.json").exists() else {}
    global_sites = manifest.get("sites") if isinstance(manifest, dict) and isinstance(manifest.get("sites"), dict) else {}
    build_index_sites = build_index.get("sites") if isinstance(build_index, dict) and isinstance(build_index.get("sites"), dict) else {}
    site_dirs = sorted(path for path in sites_dir.iterdir() if path.is_dir()) if sites_dir.exists() else []

    if expected_count is not None and len(site_dirs) != expected_count:
        errors.append(f"site directory count {len(site_dirs)} does not match expected plan site count {expected_count}")
    if len(global_sites) != len(site_dirs):
        errors.append(f"global manifest site count {len(global_sites)} does not match site directory count {len(site_dirs)}")
    if len(build_index_sites) != len(site_dirs):
        errors.append(f"build-index site count {len(build_index_sites)} does not match site directory count {len(site_dirs)}")

    public_files = [preview_dir / name for name in PUBLIC_METADATA_FILES if (preview_dir / name).exists()]
    for site_dir in site_dirs:
        site_id = site_dir.name
        site_manifest_path = site_dir / "manifest.json"
        public_files.append(site_manifest_path)
        if not site_manifest_path.exists():
            errors.append(f"{site_id}: missing site manifest")
            continue
        site_manifest = load_json(site_manifest_path, errors)
        if not isinstance(site_manifest, dict):
            errors.append(f"{site_id}: site manifest is not a JSON object")
            continue
        entry = global_sites.get(site_id) if isinstance(global_sites, dict) else None
        if not isinstance(entry, dict):
            errors.append(f"{site_id}: missing from global manifest")
        elif entry.get("siteManifestPath") != f"sites/{site_id}/manifest.json":
            errors.append(f"{site_id}: global manifest siteManifestPath is not relative to the preview root")
        if site_id not in build_index_sites:
            errors.append(f"{site_id}: missing from build-index")
        resolutions = site_manifest.get("resolutions")
        if not isinstance(resolutions, dict) or not resolutions:
            errors.append(f"{site_id}: missing resolutions object")
            continue
        for resolution, spec in resolutions.items():
            if not isinstance(spec, dict):
                errors.append(f"{site_id}/{resolution}: resolution spec is not an object")
                continue
            artifact = spec.get("path")
            if not isinstance(artifact, str) or not artifact:
                errors.append(f"{site_id}/{resolution}: missing artifact path")
            elif not (site_dir / artifact).exists():
                errors.append(f"{site_id}/{resolution}: missing artifact {artifact}")
            validate_variable_metadata(site_id, resolution, spec, errors)

    local_path_hits = []
    for path in public_files:
        if path.exists() and has_local_path_marker(path.read_text(encoding="utf-8")):
            local_path_hits.append(relative(path, preview_dir))
    if local_path_hits:
        errors.append("local filesystem path marker found in public metadata: " + ", ".join(local_path_hits[:20]))

    summary = {
        "previewDir": str(preview_dir),
        "expectedSiteCount": expected_count,
        "siteCount": len(site_dirs),
        "globalManifestSiteCount": len(global_sites),
        "buildIndexSiteCount": len(build_index_sites),
        "jsonFileCount": len(json_files),
        "parseErrorCount": len(parse_errors),
        "errorCount": len(errors),
        "errors": errors[:100],
    }
    return summary


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    summary = validate_preview_tree(args.preview_dir, args.plan)
    text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    if args.summary_out:
        args.summary_out.parent.mkdir(parents=True, exist_ok=True)
        args.summary_out.write_text(text, encoding="utf-8")
    print(text, end="")
    return 1 if summary["errorCount"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
