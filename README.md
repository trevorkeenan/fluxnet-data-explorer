# FLUXNET Data Explorer

The FLUXNET Data Explorer is a web-based tool for discovering and accessing flux-tower datasets across FLUXNET-related sources. It combines the FLUXNET Shuttle catalog with selected supplemental metadata snapshots from regional or source-specific portals, including AmeriFlux, ICOS, JapanFlux, and EFD.

AmeriFlux BASE-BADM availability includes records shared under CC-BY-4.0 and records shared under the AmeriFlux Legacy Data Policy. Legacy-policy products are labeled explicitly in the Explorer and in generated bulk-download helpers. AmeriFlux FLUXNET/ONEFlux products remain CC-BY-4.0 only.

Preferred live application: https://www.keenangroup.info/fluxnet-data-explorer/

## Repository And Deployment Model

This repository is the canonical source, release, Zenodo DOI, and GitHub Pages hosting repository for the FLUXNET Data Explorer. It contains the Explorer source code, tests, generated manifests and snapshots, refresh scripts, refresh workflows, release metadata, Apache-2.0 license, and citation metadata.

The live public Explorer is served from this repository at https://www.keenangroup.info/fluxnet-data-explorer/.

## Data Snapshots

The Explorer serves committed CSV and JSON metadata snapshots from `assets/`. These snapshots are refreshed from upstream sources by the scheduled update workflow in this repository when available. The live GitHub Pages app at https://www.keenangroup.info/fluxnet-data-explorer/ reads those generated files from this repository.

Snapshot status metadata deliberately separates refresh activity from data availability:

- `snapshot_refreshed_at` / `snapshot_refreshed_date` power **Explorer refreshed** and advance after every successful source refresh.
- `snapshot_updated_at` / `snapshot_updated_date` power **New data last added** and advance only when `inventory_version` changes.
- `version` hashes the full browser payload for cache invalidation. It may change after descriptive metadata corrections without changing `inventory_version`.

`inventory_version` is an order-insensitive SHA-256 fingerprint of normalized availability records. Its explicit field contract is in `scripts/inventory_fingerprint.py`: site, source/product identity, temporal coverage, access mode, and download/request/landing endpoints are included. Descriptive names, coordinates, contacts, citations, provenance text, generated/checked timestamps, source-status logs, and row ordering are excluded. Adding or removing a site/product, changing its covered years or access mode, or adding/removing/changing an access endpoint is therefore an inventory change; metadata-only edits are not.

JapanFlux direct-download probes are treated conservatively because ADS can rate-limit or time out individual ZIP checks. Once a direct endpoint has been validated for a metadata ID and dataset version, an inconclusive later probe retains that committed endpoint. A new dataset version must validate its own URL. This prevents transient endpoint downgrades from advancing `snapshot_updated_*` while still allowing newly validated endpoints and new releases to count as inventory changes.

Live source availability can change between repository releases. Zenodo releases are for versioned Explorer software releases and bundled metadata snapshots, not every daily manifest refresh.

## Data Preview

The Explorer includes a Data Preview for FLUXNET Shuttle rows. It is a catalog/discovery preview only: clicking `Preview data` fetches precomputed lightweight JSON artifacts and never downloads or unzips the full Shuttle product in the browser.

Preview artifacts are static files with this layout:

```text
fluxnet-preview/
  v1/
    manifest.json
    sites/
      SITE_ID/
        manifest.json
        monthly.json
        weekly.json
```

The UI supports single-site, single-variable monthly and weekly previews for Shuttle-backed rows, showing only the resolutions and variables advertised by each site manifest. The data files are plot-ready wide JSON records such as `{ "date": "2001-01-02", "GPP_NT_REF": 1.23 }`. Older monthly artifacts with generic `GPP` and `RECO` remain supported.

The static app resolves the preview base URL from the Explorer root attribute `data-preview-base-url`, then `window.FLUXNET_EXPLORER_CONFIG.previewBaseUrl` or `window.FLUXNET_EXPLORER_CONFIG.fluxnetPreviewBaseUrl`, then global values such as `window.VITE_FLUXNET_PREVIEW_BASE_URL` or `window.FLUXNET_PREVIEW_BASE_URL`. The committed page config uses `fluxnet-preview/v1` on localhost and `https://fluxnet-preview.keenangroup.info/v1` in production, so the deployed Explorer fetches `https://fluxnet-preview.keenangroup.info/v1/manifest.json`.

Tiny synthetic local fixtures are committed under `fluxnet-preview/v1/` for `US-Ha1` and `CA-DBB`. To test locally, run the normal static server, search one of those site IDs, and click `Preview data`.

Build preview artifacts with `scripts/build-shuttle-preview.py`. The builder reads the committed Shuttle snapshot or CSV catalog, downloads selected Shuttle zip products into a local cache, and reads requested values directly from `*_FLUXNET_FLUXMET_MM_*.csv` and/or `*_FLUXNET_FLUXMET_WW_*.csv`. It ignores ERA5 files and never derives one resolution from another; matching `BIFVARINFO` files may be used for units.

Recommended dry run before downloading:

```bash
python3 scripts/build-shuttle-preview.py \
  --snapshot assets/shuttle_snapshot.json \
  --output-dir fluxnet-preview/v1 \
  --cache-dir /tmp/fluxnet-shuttle-preview-cache \
  --site AR-Bal \
  --dry-run
```

Build one site:

```bash
python3 scripts/build-shuttle-preview.py \
  --snapshot assets/shuttle_snapshot.json \
  --output-dir fluxnet-preview/v1 \
  --cache-dir /tmp/fluxnet-shuttle-preview-cache \
  --site AR-Bal
```

Build a small subset from the eligible catalog:

```bash
python3 scripts/build-shuttle-preview.py \
  --snapshot assets/shuttle_snapshot.json \
  --output-dir fluxnet-preview/v1 \
  --cache-dir /tmp/fluxnet-shuttle-preview-cache \
  --limit 25
```

Use repeated `--site SITE_ID` arguments for an explicit subset, `--force` to rebuild unchanged fingerprints, and `--resolution weekly` or `--resolution monthly,weekly` to choose output resolutions. The default remains monthly. The resolution configuration is structured so daily can be added later without changing the artifact contract.

The output directory can be copied to Cloudflare R2 or another static host. Enable CORS for the Explorer origin, preserve the `v1/manifest.json` and `v1/sites/...` paths, and set the preview base URL in the page configuration to the hosted `v1` directory.

## Repository Structure

- `index.html`: GitHub Pages entry point for the Explorer.
- `assets/`: Explorer JavaScript, CSS, and committed metadata snapshots.
- `scripts/`: Snapshot refresh, validation, and catalog-building scripts.
- `.github/workflows/`: GitHub Actions workflow for refreshing Explorer snapshots.
- `tests/`: JavaScript and Python regression tests.
- `stylesheets/` and `images/`: Minimal copied website theme assets needed by the current Explorer page.

## Run Locally

From the repository root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/ in a browser.

## Update Workflow

The GitHub Actions workflow in `.github/workflows/update-shuttle-snapshot.yml` can be run manually or on its schedule. It refreshes the Shuttle, ICOS-direct, JapanFlux-direct, and curated EFD snapshot files, validates ICOS coverage, and commits only the generated snapshot artifacts back to this repository when they materially change.

AmeriFlux site metadata and vegetation metadata can be refreshed with `scripts/refresh_ameriflux_site_info.py` and `scripts/refresh_site_vegetation_metadata.py`. The AmeriFlux site-info refresh validates that sites surfaced by the AmeriFlux FLUXNET, BASE-BADM CC-BY-4.0, and BASE-BADM Legacy availability endpoints are present in the metadata snapshot.

The broader known-sites map assets are committed in `assets/all_known_flux_sites*`. They can be regenerated with `scripts/build_all_known_flux_sites.py`; optional supplemental source lists should be placed in `external_site_lists/` when needed.

## Maintainer Workflow

Make Explorer changes in this repository, run the JavaScript and Python tests here, update manifests and snapshots here, and create tagged releases here for Zenodo archival.

Do not edit Explorer code, manifests, snapshots, tests, release metadata, or citation metadata in `trevorkeenan/trevorkeenan.github.io`. That repository should keep only a lightweight legacy pointer from `fluxnet-explorer.html` to the hosted app in this repository.

## Analytics Verification

The Explorer uses the Keenan Group GA4 measurement ID `G-DXJ7N8LZEX`. The Google tag is included once in `index.html` and sends the canonical page path `/fluxnet-data-explorer/`. Custom Explorer events are emitted from `assets/shuttle-explorer.js` through `gtag("event", ...)`, including search/filter interactions and outbound or download actions such as `fx_row_download_click`, `fx_request_page_click`, `fx_landing_page_click`, and bulk-download helper events.

To verify tracking after deployment:

1. Open Google Tag Assistant at https://tagassistant.google.com/ and connect to `https://www.keenangroup.info/fluxnet-data-explorer/`.
2. Confirm exactly one Google tag is detected for `G-DXJ7N8LZEX`, then confirm the initial `page_view` reports `/fluxnet-data-explorer/`.
3. Trigger a few Explorer interactions, such as search, filter changes, row download links, and generated script or manifest downloads. Confirm the corresponding `fx_*` events appear in the Tag Assistant event stream.
4. In GA4, open Reports > Realtime for the same property. Confirm an active user appears for the Explorer and that the event count includes `page_view` plus the tested `fx_*` events.
5. To measure residual old-link traffic, repeat the Tag Assistant or Realtime check for `https://www.keenangroup.info/fluxnet-explorer.html`; that legacy page should also report to `G-DXJ7N8LZEX`, but it should not load the full Explorer app.

## License

The Explorer software code and original documentation in this repository are licensed under the Apache License, Version 2.0. See `LICENSE`.

Third-party datasets, metadata, download URLs, APIs, logos, trademarks, and data products surfaced by the Explorer remain governed by the original providers' terms, licenses, citation requirements, and data-use policies, including those of FLUXNET, AmeriFlux, ICOS, JapanFlux, AsiaFlux, EFD, and other contributing networks or repositories.

The Explorer preserves product-level data-policy labels for AmeriFlux API-backed products so generated manifests and download helpers can apply the policy associated with each selected product.

Use of the FLUXNET Data Explorer does not imply endorsement by UC Berkeley, the Keenan Lab, FLUXNET, AmeriFlux, ICOS, JapanFlux, AsiaFlux, EFD, or any data provider.

## Citation

Citation metadata are provided in `CITATION.cff`.

Suggested citation:

> Keenan TF. 2026. FLUXNET Data Explorer (v1.0.0). Zenodo. https://doi.org/10.5281/zenodo.20331228

Zenodo may provide both an all-versions/concept DOI for citing the Explorer project generally and a version-specific DOI for citing an exact release. Use the version-specific DOI when you need to cite the exact software and bundled metadata snapshots used. The live GitHub Pages app may continue to receive updated snapshots after a release.
