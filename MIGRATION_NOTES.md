# Migration Notes

## Current Repository Model

`trevorkeenan/fluxnet-data-explorer` is now the canonical source, GitHub Pages hosting, release, and Zenodo DOI repository for FLUXNET Data Explorer code, tests, generated manifests and snapshots, refresh scripts, refresh workflows, license metadata, and citation metadata.

The live public application is served from this repository at `https://www.keenangroup.info/fluxnet-data-explorer/`. The old `https://www.keenangroup.info/fluxnet-explorer.html` page in `trevorkeenan/trevorkeenan.github.io` should remain only as a lightweight legacy compatibility pointer.

Future Explorer changes should be made, validated, released, and archived here. Do not maintain a second full Explorer copy in the lab website repository.

## Copied Files

Copied the Explorer page from the lab website repository to `index.html` so GitHub Pages can serve the standalone site from the repository root.

Copied Explorer runtime assets:

- `assets/shuttle-explorer.js`
- `assets/shuttle-explorer.css`
- `assets/site-navigation.js`
- committed snapshot and metadata files used by the Explorer, including Shuttle, ICOS, JapanFlux, EFD, AmeriFlux, FLUXNET2015, site-name, vegetation, and all-known-sites assets

Copied maintenance code:

- snapshot refresh scripts in `scripts/`
- `.github/scripts/shuttle_snapshot_csv_to_json.py`
- `.github/workflows/update-shuttle-snapshot.yml`
- Explorer JavaScript and Python regression tests in `tests/`

Copied only the theme files and image/font assets referenced by the current Explorer page.

## Path Changes

- Renamed `fluxnet-explorer.html` to `index.html`.
- Updated favicon and touch-icon paths to use local `images/me.png`.
- Updated the RapidWeaver `RwSet.baseurl` value for the hosted Explorer URL at `https://www.keenangroup.info/fluxnet-data-explorer/`.
- Updated the Explorer menu so links to the broader lab website use absolute `https://www.keenangroup.info/...` URLs.
- Updated the current Explorer menu link to `index.html`.
- Updated copied tests that referenced `fluxnet-explorer.html` so they read `index.html`.
- Normalized copied theme CSS image paths that pointed to missing root-level theme images.
- Replaced a machine-specific default external-docs path in `scripts/build_all_known_flux_sites.py` with optional repo-local `external_site_lists/`.

## Files Considered But Not Copied

- The large `keenangroup-data-assets/` tree was not copied because it is unrelated to the Explorer page and would make the standalone repository much larger.
- Broader lab website HTML pages were not copied; the standalone Explorer links back to the live lab website instead.
- General website images and people/project assets were not copied unless directly referenced by the Explorer page or copied theme files.
- Python bytecode caches and `.DS_Store` files were not copied.
- No release/citation/Zenodo metadata files should be maintained in the lab website deployment repository; those belong in this canonical repository.

## TODOs And Assumptions

- Apache-2.0 has been selected for the Explorer software code and original documentation. Third-party datasets, metadata, APIs, download URLs, logos, trademarks, and data products remain governed by the original providers' terms and data-use policies.
- After Zenodo reserves or assigns a DOI, replace `TODO_ZENODO_DOI` in `README.md`, `CITATION.cff`, `.zenodo.json` if needed, `index.html`, and the legacy website pointer if it includes the DOI placeholder.
- The current workflow refreshes the primary Explorer snapshots, matching the original website workflow. The all-known-sites map assets remain committed and can be regenerated separately with `scripts/build_all_known_flux_sites.py`.
- Optional external site lists for `scripts/build_all_known_flux_sites.py` should be placed in `external_site_lists/` if they are intended to be public and released.

## Suggested Next Steps

1. Test the standalone site locally with `python3 -m http.server 8000`.
2. Review the local Explorer page and confirm map, filters, source links, download helpers, and attribution text.
3. Create the GitHub repository and push `main`.
4. Enable GitHub Pages from `main` and `/`.
5. Create a version tag and release.
6. Connect the GitHub repository to Zenodo and archive the first release.
7. Enable GitHub Pages for this repository from `main` and `/`.
8. Keep the old lab website `fluxnet-explorer.html` page as a legacy pointer to `https://www.keenangroup.info/fluxnet-data-explorer/`.
