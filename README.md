# FLUXNET Data Explorer

The FLUXNET Data Explorer is a web-based tool for discovering and accessing flux-tower datasets across FLUXNET-related sources. It combines the FLUXNET Shuttle catalog with selected supplemental metadata snapshots from regional or source-specific portals, including AmeriFlux, ICOS, JapanFlux, and EFD.

Current live Explorer: https://trevorkeenan.github.io/fluxnet-explorer.html

Future standalone GitHub Pages URL: https://trevorkeenan.github.io/fluxnet-data-explorer/

## Data Snapshots

The Explorer serves committed CSV and JSON metadata snapshots from `assets/`. These snapshots are refreshed from upstream sources by the update workflow when available. Live source availability can change between repository releases, so a Zenodo DOI should identify a specific versioned release of the Explorer software and bundled metadata snapshots, while the public live site may continue to update.

## Repository Structure

- `index.html`: GitHub Pages entry point for the standalone Explorer.
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

The GitHub Actions workflow in `.github/workflows/update-shuttle-snapshot.yml` can be run manually or on its schedule. It refreshes the Shuttle, ICOS-direct, JapanFlux-direct, and curated EFD snapshot files, validates ICOS coverage, and commits only the generated snapshot artifacts when they change.

The broader known-sites map assets are committed in `assets/all_known_flux_sites*`. They can be regenerated with `scripts/build_all_known_flux_sites.py`; optional supplemental source lists should be placed in `external_site_lists/` when needed.

## Citation

Citation metadata are provided in `CITATION.cff`. A DOI should be added after the first Zenodo-backed GitHub release.

Placeholder citation:

> Keenan, Trevor F. FLUXNET Data Explorer. Version v1.0.0. DOI to be assigned after Zenodo release.

The DOI should identify the versioned release of the Explorer software and bundled metadata snapshots. The live website may continue to receive updated snapshots after that release.
