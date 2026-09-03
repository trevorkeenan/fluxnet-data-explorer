# FLUXNET Data Explorer

[**Open the Explorer**](https://www.keenangroup.info/fluxnet-data-explorer/)

Find and access eddy-covariance tower observations of carbon, water, and energy exchange across FLUXNET and regional data sources. The Explorer brings together site metadata, coverage information, download or request links, and lightweight data previews in a searchable table and map.

Use the hosted application without installing software. The Explorer is a discovery and access tool, not a single uniformly processed dataset: the original providers distribute the full data products and define their terms of use.

## Get started

1. **Find sites.** Search by site ID or name, or filter by processing level, source, network, country, vegetation type, record length, and years.
2. **Inspect coverage.** Use the map and table to see where sites are located and which products and years are available.
3. **Preview a site.** For supported Shuttle records, choose **Preview plot**, then select a variable and time resolution.
4. **Access the data.** Use the row's download, command-copy, landing-page, or request action. For multiple sites, select rows or choose **Select all (filtered results)**, then open **Bulk Download Tools**.
5. **Prepare attribution.** Open **Data Policy Tools** for the selected sites to generate citation tables, references, and acknowledgements. Check these against the providers' requirements and fill in any missing metadata.

**Select all (all sites)** includes sites outside your current filters. Table and site-CSV exports contain metadata, not the underlying flux observations.

## Data sources and coverage

The Explorer combines committed metadata snapshots with live AmeriFlux and FLUXNET2015 availability queries. Source and network labels can overlap; they are not counts of independent datasets.

| Source or product group | What the Explorer includes |
| --- | --- |
| [FLUXNET Shuttle](https://data.fluxnet.org/) | Catalog records distributed through the AmeriFlux, ICOS, and TERN hubs. Shuttle records take precedence where sources overlap. |
| [AmeriFlux](https://ameriflux.lbl.gov/) | Additional CC-BY-4.0 FLUXNET products and BASE-BADM observations under CC-BY-4.0 or explicitly labeled Legacy policies. |
| FLUXNET2015 | Additional records obtained through the AmeriFlux-hosted availability API when not superseded by higher-priority sources. |
| ICOS direct | Supplemental FLUXNET and ETC archive records discovered through ICOS metadata. |
| JapanFlux2024 | Records from the ADS archive, with validated direct links or landing-page fallbacks. |
| EFD | Curated records from public site and policy pages; access is request-based and may require login, PI approval, or direct contact. |

**Processing matters.** The **Processing Level** filter distinguishes ONEFlux-derived FLUXNET coverage from other processed products. AmeriFlux BASE observations and JapanFlux2024 are not interchangeable with ONEFlux-derived products. A site may show both FLUXNET and BASE products when their coverage differs; compare the product-specific years before choosing data.

The **Show all known sites** map layer includes sites for which the Explorer has not identified shared data. A map marker is not a guarantee of downloadable observations, and absence from the Explorer does not establish that a site has no data.

## Downloading data

Individual row actions depend on the source. Some open a provider-hosted archive; others copy an AmeriFlux command to run locally, open a landing page, or start a provider's request workflow. ICOS downloads may require interactive license acceptance.

For a multi-site selection, download the self-contained `download_fluxnet_selected.sh` from **Bulk Download Tools**, review it, and run:

```bash
bash download_fluxnet_selected.sh
```

The script handles direct links and AmeriFlux API-backed products. It requires Bash, curl, standard Unix command-line utilities, and either `jq` or `python3` for AmeriFlux response parsing. FLUXNET2015 requests also need `base64` or `python3`. AmeriFlux username/email overrides are available in the tools; access remains subject to the provider's requirements.

By default, data are saved under `fluxnet_selected_downloads/siteData/` beside the script, with logs under `fluxnet_selected_downloads/logs/`. Review the logs for failures. Landing-page-only and request-only records are not downloaded automatically. The **Advanced files** section provides source-specific manifests, links, site lists, and helper scripts for custom workflows.

Year filters help select sites; they do not trim the contents of downloaded provider products.

## Previews, updates, and limitations

Previews show one site and variable at a time, with monthly, weekly, daily, and annual resolutions where artifacts are available. Variables include carbon fluxes, energy fluxes, and meteorological observations; unavailable variables are disabled. Previews load precomputed subsets, not full archives. Download the official product for analysis, quality assessment, and citation.

Catalog snapshots are scheduled for daily refresh. The application also queries live availability, with cached or committed-data fallbacks when sources are unavailable. Coverage and access links can therefore change, and a successful catalog refresh does not guarantee that every upstream service or download is available.

The application distinguishes:

- **Explorer refreshed:** when snapshot refresh activity last succeeded.
- **New data last added:** when recorded availability changed, including product coverage or access links—not necessarily when new observations were collected.

Preview artifacts and the broader known-sites inventory are maintained separately. Check the preview's own build date; it may lag the catalog. Versioned software releases do not freeze the continuously updated hosted application or upstream data.

## Data use, citation, and license

Follow the original providers' data-use policies and cite the datasets, site teams, networks, and product DOIs applicable to your analysis. **Data Policy Tools** help prepare those materials but do not replace checking them. AmeriFlux Legacy-policy BASE products remain explicitly labeled in the Explorer and generated download helpers.

To cite the Explorer software:

> Keenan TF. 2026. FLUXNET Data Explorer (v1.0.0). Zenodo. [doi:10.5281/zenodo.20331228](https://doi.org/10.5281/zenodo.20331228).

See [CITATION.cff](CITATION.cff) and the [software releases](https://github.com/trevorkeenan/fluxnet-data-explorer/releases). Cite the version actually used when reproducibility requires an exact software release; the citation above identifies v1.0.0, not every subsequent update to the live application.

The Explorer's software code and original documentation are licensed under [Apache-2.0](LICENSE). This does not relicense third-party data, metadata, APIs, download URLs, logos, or trademarks. Use of the Explorer does not imply endorsement by UC Berkeley, the Keenan Lab, FLUXNET, AmeriFlux, ICOS, JapanFlux, AsiaFlux, EFD, or other data providers.

## Run locally and contribute

Clone or download this repository. From its root, serve the static files with Python 3:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/). No application build step is required. External availability services, map tiles, and CDN-hosted libraries still require network access.

Local previews use small **synthetic fixtures** for `US-Ha1` and `CA-DBB`, not the production preview collection. They are development examples, not scientific data.

See the [maintainer guide](MAINTAINING.md) for repository structure, test setup, snapshot refreshes, preview builds, deployment, and release procedures. Report problems or suggest improvements through [GitHub issues](https://github.com/trevorkeenan/fluxnet-data-explorer/issues).

## Contact and acknowledgements

For questions, suggestions, or missing sites, contact Trevor F. Keenan at [trevorkeenan@berkeley.edu](mailto:trevorkeenan@berkeley.edu).

The Explorer depends on observations contributed by site teams and the work of participating networks and data providers. Funding for the FLUXNET Data Explorer was provided by the NSF AccelNet program.
