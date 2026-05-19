# Migration Notes

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
- Updated the RapidWeaver `RwSet.baseurl` value for the future standalone GitHub Pages URL.
- Updated the Explorer menu so links to the broader lab website use absolute `https://trevorkeenan.github.io/...` URLs.
- Updated the current Explorer menu link to `index.html`.
- Updated copied tests that referenced `fluxnet-explorer.html` so they read `index.html`.
- Normalized copied theme CSS image paths that pointed to missing root-level theme images.
- Replaced a machine-specific default external-docs path in `scripts/build_all_known_flux_sites.py` with optional repo-local `external_site_lists/`.

## Files Considered But Not Copied

- The large `keenangroup-data-assets/` tree was not copied because it is unrelated to the Explorer page and would make the standalone repository much larger.
- Broader lab website HTML pages were not copied; the standalone Explorer links back to the live lab website instead.
- General website images and people/project assets were not copied unless directly referenced by the Explorer page or copied theme files.
- Python bytecode caches and `.DS_Store` files were not copied.
- No repository-level license file was present in the source website repository, so `LICENSE-TODO.md` was created instead of inventing a license.

## TODOs And Assumptions

- Select and add an explicit license before the first Zenodo DOI release.
- After Zenodo assigns a DOI, update `README.md`, `CITATION.cff`, and optionally `index.html` with the DOI and citation badge.
- The current workflow refreshes the primary Explorer snapshots, matching the original website workflow. The all-known-sites map assets remain committed and can be regenerated separately with `scripts/build_all_known_flux_sites.py`.
- Optional external site lists for `scripts/build_all_known_flux_sites.py` should be placed in `external_site_lists/` if they are intended to be public and released.

## Suggested Next Steps

1. Test the standalone site locally with `python3 -m http.server 8000`.
2. Review the local Explorer page and confirm map, filters, source links, download helpers, and attribution text.
3. Create the GitHub repository and push `main`.
4. Enable GitHub Pages from `main` and `/`.
5. Create a version tag and release.
6. Connect the GitHub repository to Zenodo and archive the first release.
7. Later, update the old lab website `fluxnet-explorer.html` to redirect to the standalone Explorer, or keep the old URL as a wrapper or landing page.
