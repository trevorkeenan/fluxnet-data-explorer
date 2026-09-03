# Maintainer guide

This guide covers development and operation of the FLUXNET Data Explorer. For the user workflow, data-access limitations, license, and citation, see the [README](README.md).

Commands below assume the repository root as the working directory. Refresh and build commands can contact upstream providers and write files; production uploads and releases are separate, deliberate operations.

## Repository and deployment

`trevorkeenan/fluxnet-data-explorer` is the canonical source, GitHub Pages hosting, release, and Zenodo archival repository. The public application is [https://www.keenangroup.info/fluxnet-data-explorer/](https://www.keenangroup.info/fluxnet-data-explorer/).

Maintain Explorer code, tests, snapshots, and citation/release metadata here. The lab website repository, `trevorkeenan/trevorkeenan.github.io`, should retain only the legacy `fluxnet-explorer.html` pointer to the application, not a second Explorer implementation. [Migration notes](MIGRATION_NOTES.md) document that transition; their original setup checklist is historical.

| Path | Purpose |
| --- | --- |
| [index.html](index.html) | Static application entry point and production preview configuration. |
| [assets/](assets/) | Explorer JavaScript/CSS and committed catalog and metadata snapshots. |
| [scripts/](scripts/) | Refresh, validation, inventory, and preview-building utilities. |
| [.github/workflows/](.github/workflows/) | Snapshot and preview refresh workflows. |
| [tests/](tests/) | JavaScript and Python regression tests. |
| [fluxnet-preview/](fluxnet-preview/) | Synthetic local preview fixtures and incremental-refresh instructions. |
| [stylesheets/](stylesheets/) and [images/](images/) | Theme assets used by the page. |

## Development and tests

For local startup, see [Run locally and contribute](README.md#run-locally-and-contribute). Serving the app requires only a static HTTP server; Node.js and the Python development dependencies are for tests and maintenance.

Use a Python environment with the [development dependencies](requirements-dev.txt), and a Node.js version supporting the built-in test runner. The snapshot workflow currently uses Python 3.12.8.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
node --test tests/shuttle-explorer.test.js
python -m pytest tests
```

JavaScript tests include generated shell-script checks, which also require Bash and standard Unix command-line utilities. Run the tests without contacting production download services; the download regression tests use mocks.

For changes to the interface, inspect the local application as well: search and filters, map/table linking, source-specific actions, preview states, bulk selections, and data-policy exports. Do not treat synthetic fixture values as real observations.

## Catalog snapshots and refreshes

The browser loads CSV/JSON snapshots from `assets/` and supplements them with live AmeriFlux FLUXNET, BASE-BADM CC-BY-4.0, BASE-BADM Legacy, and FLUXNET2015 availability queries. Live availability is cached separately and can fall back to cached or committed records when an upstream source is unavailable.

The [snapshot workflow](.github/workflows/update-shuttle-snapshot.yml) runs on a daily schedule at 05:17 UTC or by manual dispatch. It:

1. Installs the upstream FLUXNET Shuttle package and refreshes its catalog.
2. Converts the Shuttle CSV to compact JSON.
3. Refreshes ICOS-direct records and validates their coverage.
4. Refreshes JapanFlux-direct and curated EFD records.
5. Refreshes AmeriFlux site metadata, vegetation metadata, and source citation metadata.
6. Commits only the specified generated artifacts when their files differ.

The workflow installs Shuttle separately from `requirements-dev.txt`. Refreshes can update timestamps even when the available data inventory is unchanged; a refresh commit does not by itself indicate new observations. Manual dispatch exposes `strict_refresh` to fail rather than carry forward supported previous snapshots after upstream failures. Inspect source-status warnings and workflow logs before interpreting a refresh as complete.

The [AmeriFlux site-info refresher](scripts/refresh_ameriflux_site_info.py) validates that sites from the FLUXNET and both BASE-BADM policy endpoints are represented. Vegetation and citation refresh logic is in [refresh_site_vegetation_metadata.py](scripts/refresh_site_vegetation_metadata.py) and [refresh_source_citation_metadata.py](scripts/refresh_source_citation_metadata.py).

The wider known-sites map assets, `assets/all_known_flux_sites*`, are regenerated separately with [build_all_known_flux_sites.py](scripts/build_all_known_flux_sites.py). Public supplemental lists belong in [external_site_lists/](external_site_lists/); do not add private source lists to a release.

### Refresh dates and inventory changes

The snapshot metadata separates refresh activity from changes to availability:

- `snapshot_refreshed_at` / `snapshot_refreshed_date` drive **Explorer refreshed** and advance after successful source refreshes.
- `snapshot_updated_at` / `snapshot_updated_date` drive **New data last added** and advance when `inventory_version` changes.
- `version` fingerprints the browser payload for cache invalidation and can change after descriptive metadata corrections.

The field contract is defined in [inventory_fingerprint.py](scripts/inventory_fingerprint.py). `inventory_version` is an order-insensitive SHA-256 fingerprint of normalized availability records. Site/source/product identity, processing lineage, temporal coverage, access mode, and download/request/landing endpoints contribute. Descriptive names, coordinates, contacts, citations, provenance text, generated/checked timestamps, source-status logs, and row ordering do not.

Consequently, removals, changed access endpoints, and revised product coverage can advance the displayed inventory date as well as newly available data.

JapanFlux endpoint probes are conservative: a previously validated endpoint for the same metadata ID and dataset version is retained after an inconclusive probe, since ADS may rate-limit or time out. A new version must validate its own URL. See [refresh_japanflux_direct.py](scripts/refresh_japanflux_direct.py).

## Preview artifacts

The preview client fetches precomputed lightweight JSON; opening **Preview plot** does not download or unzip a complete source product in the browser.

A preview root has this structure:

```text
v1/
  manifest.json
  sites/
    SITE_ID/
      manifest.json
      monthly.json
      weekly.json
      daily.json
      annual.json
```

Resolution files are present where supported by the source archives. Incremental builds also produce `build-index.json` and `refresh-report.json`.

The interface displays a standard menu of 16 variables, disabling entries without non-missing output for the selected site/resolution. Series use wide JSON records, for example `{ "date": "2001-01-02", "GPP_NT_VUT_REF": 1.23 }`. The client retains compatibility with older simplified or generic GPP/RECO keys.

### Local fixtures and URL configuration

The committed [fixture directory](fluxnet-preview/README.md) contains synthetic examples for `US-Ha1` and `CA-DBB`. Do not replace it with a complete generated production tree.

The preview base URL is resolved in this order:

1. The Explorer root's `data-preview-base-url` attribute.
2. `window.FLUXNET_EXPLORER_CONFIG.previewBaseUrl` or `fluxnetPreviewBaseUrl`.
3. Supported globals, including `window.VITE_FLUXNET_PREVIEW_BASE_URL` and `window.FLUXNET_PREVIEW_BASE_URL`.
4. The client's default local preview path.

The committed [page configuration](index.html) uses `fluxnet-preview/v1` on localhost and `https://fluxnet-preview.keenangroup.info/v1` in production. A hosted preview root must permit CORS requests from the Explorer origin and retain the manifest/site path structure.

### Storage outside the repository

Keep downloaded archives, generated production artifacts, and rebuildable caches outside the repository. Choose an absolute directory on your own machine and set it in the shell before using the examples:

```bash
PREVIEW_DATA_ROOT="/absolute/path/to/explorer-data"
```

Replace the placeholder with your actual directory. The examples use:

- `$PREVIEW_DATA_ROOT/fluxnet_downloads`: downloaded source archives.
- `$PREVIEW_DATA_ROOT/fluxnet-preview/v1`: complete generated production artifacts.
- `$PREVIEW_DATA_ROOT/preview-builder-cache`: rebuildable cache.

The current production destination is `cloudflare-r2:fluxnet-preview/v1`, served at [https://fluxnet-preview.keenangroup.info/v1/manifest.json](https://fluxnet-preview.keenangroup.info/v1/manifest.json). The `cloudflare-r2` remote must be configured separately; do not put credentials in the repository.

### Build and validate

[build-shuttle-preview.py](scripts/build-shuttle-preview.py) reads a committed Shuttle JSON snapshot or CSV catalog. It downloads selected ZIP products into a local cache, or uses existing archives in offline mode. It reads values from the matching `FLUXMET_MM`, `FLUXMET_WW`, `FLUXMET_DD`, and `FLUXMET_YY` files, ignoring ERA5 files and never deriving one resolution from another. Matching `BIFVARINFO` files can supply units. Annual dates use `YYYY-01-01` internally, while chart axes display years.

Start with a dry run, which reports work without downloading or writing preview artifacts:

```bash
python3 scripts/build-shuttle-preview.py \
  --snapshot assets/shuttle_snapshot.json \
  --output-dir /tmp/fluxnet-preview-dry-run/v1 \
  --cache-dir /tmp/fluxnet-shuttle-preview-cache \
  --site AR-Bal \
  --dry-run
```

Build one site's monthly preview:

```bash
python3 scripts/build-shuttle-preview.py \
  --snapshot assets/shuttle_snapshot.json \
  --output-dir /tmp/fluxnet-preview-dev/v1 \
  --cache-dir /tmp/fluxnet-shuttle-preview-cache \
  --site AR-Bal
```

To build a small catalog subset, replace `--site AR-Bal` with `--limit 25`. Repeat `--site SITE_ID` for an explicit subset. Use `--force` to rebuild unchanged fingerprints and `--resolution monthly,weekly,daily,annual` to request all four resolutions; the builder's default is monthly only.

For a complete offline rebuild from already downloaded archives, set `PREVIEW_DATA_ROOT` as above, then run:

```bash
PYTHONPYCACHEPREFIX=/tmp/fluxnet_preview_pycache \
python3 scripts/build-shuttle-preview.py \
  --snapshot assets/shuttle_snapshot.json \
  --output-dir "$PREVIEW_DATA_ROOT/fluxnet-preview/v1" \
  --archive-dir "$PREVIEW_DATA_ROOT/fluxnet_downloads" \
  --cache-dir "$PREVIEW_DATA_ROOT/preview-builder-cache" \
  --offline \
  --resolution monthly,weekly,daily,annual \
  --force
```

Review the build report for missing archives, failed sites, and unavailable resolutions. Do not promote incomplete output as a complete production collection.

For incremental updates, follow the [preview refresh guide](fluxnet-preview/README.md#incremental-refresh-workflow), including its plan, validation, and diagnostics steps. Its [GitHub Actions section](fluxnet-preview/README.md#github-actions-preview-refresh) documents the scheduled build/validation workflow and explicit production-promotion switch. Scheduled preview runs do not upload to production automatically.

### Production upload

Upload only a reviewed, validated complete artifact tree. This command writes to the public preview bucket:

```bash
rclone copy \
  "$PREVIEW_DATA_ROOT/fluxnet-preview/v1" \
  cloudflare-r2:fluxnet-preview/v1 \
  --progress \
  --transfers 16 \
  --checkers 32
```

Use `rclone copy`; do not use `rclone sync` unless deletion of stale remote objects is intentional and separately reviewed. Uploading an incomplete tree can still overwrite shared manifests, even without deleting objects. Verify the hosted manifest and a representative site's plots after promotion.

## Releases and archival

Run the relevant tests and review generated snapshots before creating a tagged software release in this repository. Keep [CITATION.cff](CITATION.cff), [.zenodo.json](.zenodo.json), the README citation, and the application's citation text consistent with the release being described.

Zenodo archives versioned Explorer software and bundled metadata snapshots, not every refresh or all externally hosted preview artifacts. The live application and upstream source products can change after a release. Use a version-specific DOI when citing an exact release; distinguish it from the project-wide concept DOI.

Do not publish downloaded third-party source archives as software release assets. Their licensing and citation requirements remain separate from the Explorer's Apache-2.0 license.

## Analytics verification

The application uses GA4 measurement ID `G-DXJ7N8LZEX`. [index.html](index.html) includes the Google tag and sets the canonical page path to `/fluxnet-data-explorer/`. [shuttle-explorer.js](assets/shuttle-explorer.js) emits `fx_*` events for search/filter interactions, outbound links, downloads, and helper exports.

After an authorized deployment:

1. Connect [Google Tag Assistant](https://tagassistant.google.com/) to the public Explorer URL.
2. Confirm one Google tag for `G-DXJ7N8LZEX` and the initial `page_view` path `/fluxnet-data-explorer/`.
3. Check representative interactions and events such as `fx_row_download_click`, `fx_request_page_click`, `fx_landing_page_click`, and bulk helper events. Avoid requesting large datasets solely to test analytics.
4. In GA4 Realtime, confirm activity for the corresponding property.
5. If checking legacy traffic, inspect [fluxnet-explorer.html](https://www.keenangroup.info/fluxnet-explorer.html). It should report to the same property without loading the full Explorer implementation.
