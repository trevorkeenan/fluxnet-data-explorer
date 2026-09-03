# Local preview fixture and refresh guide

This directory contains small **synthetic** preview fixtures for local development. They are not scientific data or the production FLUXNET preview collection; do not replace them with a complete generated artifact tree.

The hosted production manifest is [https://fluxnet-preview.keenangroup.info/v1/manifest.json](https://fluxnet-preview.keenangroup.info/v1/manifest.json). General preview architecture, one-site builds, storage conventions, and production upload precautions are in the [maintainer guide](../MAINTAINING.md#preview-artifacts).

## Incremental refresh workflow

Run these commands from the repository root. Keep source archives, generated artifacts, and caches outside the repository. Choose an absolute local directory:

```bash
PREVIEW_DATA_ROOT="/absolute/path/to/explorer-data"
```

The examples expect the current complete preview tree at `$PREVIEW_DATA_ROOT/fluxnet-preview/v1`, source archives at `$PREVIEW_DATA_ROOT/fluxnet_downloads`, and a rebuildable cache at `$PREVIEW_DATA_ROOT/preview-builder-cache`.

Plan the refresh against the current complete tree:

```bash
PYTHONPYCACHEPREFIX=/tmp/fluxnet_preview_pycache \
python3 scripts/plan-preview-refresh.py \
  --snapshot assets/shuttle_snapshot.json \
  --existing-preview-dir "$PREVIEW_DATA_ROOT/fluxnet-preview/v1" \
  --output-plan /tmp/preview-refresh-plan.json
```

Inspect the plan before building. It classifies sites as `new`, `changed`, `unchanged`, `needs_rebuild_due_to_missing_artifacts`, or `missing_from_snapshot`. An unexpectedly large rebuild set may indicate a source or snapshot problem.

Build only sites requiring work:

```bash
python3 scripts/build-shuttle-preview.py \
  --snapshot assets/shuttle_snapshot.json \
  --output-dir /tmp/fluxnet-preview-refresh/v1 \
  --archive-dir "$PREVIEW_DATA_ROOT/fluxnet_downloads" \
  --cache-dir "$PREVIEW_DATA_ROOT/preview-builder-cache" \
  --resolution monthly,weekly,daily,annual \
  --sites-from-plan /tmp/preview-refresh-plan.json \
  --force
```

When the plan records `existingPreviewDir`, the builder prefills the output from the previous complete tree, then replaces rebuilt sites and global metadata. It writes `manifest.json`, `build-index.json`, and `refresh-report.json`.

Validate the complete result:

```bash
python3 scripts/validate-preview-artifacts.py \
  --preview-dir /tmp/fluxnet-preview-refresh/v1 \
  --plan /tmp/preview-refresh-plan.json \
  --summary-out /tmp/preview-validation-summary.json
```

Review the plan, validation summary, refresh report, and build index. Check rebuilt site counts, failed sites, retained previous previews, missing resolutions, and validation errors. Do not promote output that is incomplete or unexpectedly different.

For a local production upload, follow the [production upload precautions](../MAINTAINING.md#production-upload), using the reviewed `/tmp/fluxnet-preview-refresh/v1` tree as the source in place of `$PREVIEW_DATA_ROOT/fluxnet-preview/v1`.

## GitHub Actions preview refresh

The [Update FLUXNET Preview Artifacts](../.github/workflows/update-preview-artifacts.yml) workflow follows the same sequence:

1. Copy the current production collection from R2.
2. Plan against `assets/shuttle_snapshot.json`.
3. Stop when the rebuild count exceeds `max_rebuild_sites`.
4. Build a complete output tree.
5. Validate that tree.
6. Upload diagnostic files as a workflow artifact.
7. Upload the preview tree only when an authorized manual run explicitly enables it.

Scheduled runs execute every Tuesday at 10:37 UTC. They plan, build, validate, and publish diagnostics, but **do not upload to R2**.

Manual dispatch accepts:

- `upload_to_r2`, which defaults to `false`. Set it to `true` only after the plan, build report, and validation summary are ready for production.
- `max_rebuild_sites`, which defaults to `25`. The workflow stops before building when this guardrail is exceeded.

The workflow requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` repository secrets. It constructs a temporary `cloudflare-r2` rclone configuration on the runner. Never commit these credentials or print them in diagnostics.

The `preview-refresh-diagnostics` workflow artifact contains:

- `preview-refresh-plan.json`
- `preview-validation-summary.json`
- `refresh-report.json`
- `build-index.json`

A normal promotion sequence is:

1. Let scheduled runs, or manual runs with `upload_to_r2=false`, establish a small and stable plan.
2. Review the diagnostic artifact.
3. Rerun manually with `upload_to_r2=true`.
4. Verify the hosted global manifest and representative rebuilt site previews.

The workflow uses `rclone copy`, not `rclone sync`, and does not delete R2 objects. Do not introduce remote deletion without a separate review.
