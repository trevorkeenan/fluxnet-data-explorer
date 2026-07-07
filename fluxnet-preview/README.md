# Local preview fixture

This directory contains a tiny committed synthetic fixture for local development. It is not the production FLUXNET preview artifact set and should not be replaced with generated full-site output.

Maintainer production artifacts live outside the repository at:

```text
/Users/trevorkeenan/Data/ExplorerFluxData/fluxnet-preview/v1
```

Hosted production artifacts are served from:

```text
https://fluxnet-preview.keenangroup.info/v1
```

## Incremental refresh workflow

Plan a local refresh against the current production artifact tree:

```bash
PYTHONPYCACHEPREFIX=/tmp/fluxnet_preview_pycache \
python3 scripts/plan-preview-refresh.py \
  --snapshot assets/shuttle_snapshot.json \
  --existing-preview-dir /Users/trevorkeenan/Data/ExplorerFluxData/fluxnet-preview/v1 \
  --output-plan /tmp/preview-refresh-plan.json
```

Build only sites classified as `new`, `changed`, or `needs_rebuild_due_to_missing_artifacts`:

```bash
python3 scripts/build-shuttle-preview.py \
  --snapshot assets/shuttle_snapshot.json \
  --output-dir /tmp/fluxnet-preview-refresh/v1 \
  --archive-dir /Users/trevorkeenan/Data/ExplorerFluxData/fluxnet_downloads \
  --cache-dir /Users/trevorkeenan/Data/ExplorerFluxData/preview-builder-cache \
  --resolution monthly,weekly,daily,annual \
  --sites-from-plan /tmp/preview-refresh-plan.json \
  --force
```

When the plan contains `existingPreviewDir`, the builder prefills the output
directory from the previous complete preview tree, then overwrites rebuilt
sites and global metadata. It writes `manifest.json`, `build-index.json`, and
`refresh-report.json`.

Safe R2 upload command for a complete refresh output:

```bash
rclone copy \
  "/tmp/fluxnet-preview-refresh/v1" \
  cloudflare-r2:fluxnet-preview/v1 \
  --progress \
  --transfers 16 \
  --checkers 32
```

For a changed-file-only output, upload the changed site files plus
`manifest.json`, `build-index.json`, and `refresh-report.json` with explicit
`rclone copy` commands. Do not use `rclone sync` for the initial automation.

## GitHub Actions preview refresh

The `Update FLUXNET Preview Artifacts` workflow wraps the same incremental
refresh sequence on GitHub Actions:

1. copy current production preview artifacts from R2 to `/tmp/existing-preview/v1`;
2. plan against `assets/shuttle_snapshot.json`;
3. fail if the number of `new`, `changed`, or
   `needs_rebuild_due_to_missing_artifacts` sites exceeds `max_rebuild_sites`;
4. build a complete output tree at `/tmp/fluxnet-preview-refresh/v1`;
5. validate the output tree with `scripts/validate-preview-artifacts.py`;
6. upload only small diagnostics as Actions artifacts.

Scheduled runs execute every Tuesday at 10:37 UTC and are upload-disabled by
default. They plan, build, validate, and publish diagnostics, but do not write
to R2.

Manual `workflow_dispatch` runs expose:

- `upload_to_r2`: defaults to `"false"`. Set to `"true"` only when the plan,
  build report, and validation summary look ready to promote to production.
- `max_rebuild_sites`: defaults to `25`. The workflow fails before building if
  the plan would rebuild more sites than this guardrail allows.

Required GitHub repository secrets:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

The workflow configures a temporary `cloudflare-r2` rclone remote on the runner.
It uses `rclone copy` for both download and optional upload. It never uses
`rclone sync` and does not delete R2 objects.

After each run, inspect the `preview-refresh-diagnostics` Actions artifact. It
contains:

- `preview-refresh-plan.json`
- `preview-validation-summary.json`
- `refresh-report.json`
- `build-index.json`

Promotion pattern:

1. Let scheduled runs or manual runs with `upload_to_r2=false` establish that
   plans are small and validation is stable.
2. Inspect the diagnostics artifact, especially rebuild counts, failed sites,
   retained previous previews, and validation errors.
3. Re-run manually with `upload_to_r2=true` to promote the validated output tree
   using `rclone copy`.
