# FLUXNET Data Explorer

The FLUXNET Data Explorer is a web-based tool for discovering and accessing flux-tower datasets across FLUXNET-related sources. It combines the FLUXNET Shuttle catalog with selected supplemental metadata snapshots from regional or source-specific portals, including AmeriFlux, ICOS, JapanFlux, and EFD.

Preferred live application: https://www.keenangroup.info/fluxnet-data-explorer/

## Repository And Deployment Model

This repository is the canonical source, release, Zenodo DOI, and GitHub Pages hosting repository for the FLUXNET Data Explorer. It contains the Explorer source code, tests, generated manifests and snapshots, refresh scripts, refresh workflows, release metadata, Apache-2.0 license, and citation metadata.

The live public Explorer is served from this repository at https://www.keenangroup.info/fluxnet-data-explorer/.

## Data Snapshots

The Explorer serves committed CSV and JSON metadata snapshots from `assets/`. These snapshots are refreshed from upstream sources by the scheduled update workflow in this repository when available. The live GitHub Pages app at https://www.keenangroup.info/fluxnet-data-explorer/ reads those generated files from this repository.

Live source availability can change between repository releases. Zenodo releases are for versioned Explorer software releases and bundled metadata snapshots, not every daily manifest refresh.

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

Use of the FLUXNET Data Explorer does not imply endorsement by UC Berkeley, the Keenan Lab, FLUXNET, AmeriFlux, ICOS, JapanFlux, AsiaFlux, EFD, or any data provider.

## Citation

Citation metadata are provided in `CITATION.cff`.

Suggested citation:

> Keenan TF. 2026. FLUXNET Data Explorer (v1.0.0). Zenodo. https://doi.org/10.5281/zenodo.20331228

Zenodo may provide both an all-versions/concept DOI for citing the Explorer project generally and a version-specific DOI for citing an exact release. Use the version-specific DOI when you need to cite the exact software and bundled metadata snapshots used. The live GitHub Pages app may continue to receive updated snapshots after a release.
