#!/usr/bin/env python3
"""Plan an incremental FLUXNET Shuttle preview refresh."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Optional, Sequence


BUILDER_PATH = Path(__file__).resolve().with_name("build-shuttle-preview.py")
SPEC = importlib.util.spec_from_file_location("build_shuttle_preview", BUILDER_PATH)
builder = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = builder
SPEC.loader.exec_module(builder)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path, help="Path to Shuttle snapshot/catalog JSON or CSV.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--existing-preview-dir", type=Path, help="Existing local preview root, for example .../fluxnet-preview/v1.")
    source.add_argument("--existing-preview-url", help="Existing hosted preview base URL.")
    parser.add_argument("--output-plan", required=True, type=Path, help="Path to write preview refresh plan JSON.")
    parser.add_argument(
        "--resolution",
        default="monthly,weekly,daily,annual",
        help="Comma-separated resolutions to validate in existing artifacts. Default: monthly,weekly,daily,annual.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        resolutions = builder.parse_resolutions(args.resolution)
        plan = builder.plan_preview_refresh(
            snapshot=args.snapshot,
            existing_preview_dir=args.existing_preview_dir,
            existing_preview_url=args.existing_preview_url or "",
            resolutions=resolutions,
        )
        builder.write_json(args.output_plan, plan)
        counts = ", ".join(f"{name}={count}" for name, count in plan["counts"].items())
        print(f"Preview refresh plan: {counts}")
        print(f"Wrote plan: {args.output_plan}")
        return 0
    except Exception as error:
        print(f"preview refresh planning failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
