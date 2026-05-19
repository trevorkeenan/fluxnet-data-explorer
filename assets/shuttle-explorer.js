(function () {
  "use strict";

  var DEFAULT_JSON_URL = "assets/shuttle_snapshot.json";
  var DEFAULT_CSV_URL = "assets/shuttle_snapshot.csv";
  var DEFAULT_ICOS_DIRECT_JSON_URL = "assets/icos_direct_fluxnet.json";
  var DEFAULT_ICOS_DIRECT_CSV_URL = "assets/icos_direct_fluxnet.csv";
  var DEFAULT_JAPANFLUX_DIRECT_JSON_URL = "assets/japanflux_direct_snapshot.json";
  var DEFAULT_JAPANFLUX_DIRECT_CSV_URL = "assets/japanflux_direct_snapshot.csv";
  var DEFAULT_EFD_JSON_URL = "assets/efd_curated_sites_snapshot.json";
  var DEFAULT_EFD_CSV_URL = "assets/efd_curated_sites_snapshot.csv";
  var AMERIFLUX_SITE_INFO_URL = "assets/ameriflux_site_info.csv";
  var FLUXNET2015_SITE_INFO_URL = "assets/siteinfo_fluxnet2015.csv";
  var SITE_NAME_METADATA_URL = "assets/site_name_metadata.csv";
  var SITE_VEGETATION_METADATA_URL = "assets/site_vegetation_metadata.csv";
  var DEFAULT_ALL_KNOWN_SITES_MAP_JSON_URL = "assets/all_known_flux_sites_map.json";
  var DEFAULT_GLOBAL_LAND_BOUNDS = [[-60, -180], [85, 180]];
  var LEAFLET_WORLD_TILE_SIZE = 256;
  var DEFAULT_PAGE_SIZE = 10;
  var DEFAULT_MINIMUM_YEARS_FILTER = 1;
  var MAP_LINKED_ROW_ACTIVE_MS = 3200;
  var MIN_PLAUSIBLE_DATA_YEAR = 1900;
  var MAX_FUTURE_DATA_YEAR_BUFFER = 5;
  var MAX_PAGE_BUTTONS = 7;
  var SEARCH_DEBOUNCE_MS = 180;
  var STYLE_ID = "shuttle-explorer-inline-styles";
  var SNAPSHOT_CACHE_SCHEMA_VERSION = 9;
  var SNAPSHOT_CACHE_STORAGE_PREFIX = "shuttle-explorer:snapshot-cache:v9";
  var MAP_CATEGORY_COLORS = {
    filteredAccessible: {
      color: "#9b6a08",
      fillColor: "#f3d58a"
    },
    accessibleData: {
      color: "#2f5374",
      fillColor: "#5f8bb3"
    },
    withoutSharedData: {
      color: "#6d8fb2",
      fillColor: "#d8e6f4"
    }
  };
  var AMERIFLUX_FLUXNET_AVAILABILITY_URL = "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/FLUXNET/CCBY4.0";
  var AMERIFLUX_BASE_AVAILABILITY_URL = "https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/BASE-BADM/CCBY4.0";
  var FLUXNET2015_AVAILABILITY_URL = "https://amfcdn.lbl.gov/api/v2/data_availability/FLUXNET/FLUXNET2015/CCBY4.0";
  var AMERIFLUX_V2_DOWNLOAD_URL = "https://amfcdn.lbl.gov/api/v2/data_download";
  var AMERIFLUX_V1_DOWNLOAD_URL = "https://amfcdn.lbl.gov/api/v1/data_download";
  var AMERIFLUX_DOWNLOAD_LOGGER_URL = "https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request";
  var AMERIFLUX_DEFAULT_VARIANT = "FULLSET";
  var AMERIFLUX_DEFAULT_POLICY = "CCBY4.0";
  var AMERIFLUX_V2_INTENDED_USE = "other_research";
  var AMERIFLUX_V1_INTENDED_USE = "QED Lab FLUXNET Data Explorer";
  var AMERIFLUX_DEFAULT_USER_ID = "FluxnetDataExplorer";
  var AMERIFLUX_DEFAULT_USER_EMAIL = "fluxnet@explorer.edu";
  var AMERIFLUX_LOGGER_USER_NAME = "Fluxnet Data Explorer";
  var AMERIFLUX_LOGGER_DESCRIPTION = "Download requested through the FLUXNET Data Explorer";
  var AMERIFLUX_LOGGER_INTENDED_USE = AMERIFLUX_V2_INTENDED_USE;
  var AMERIFLUX_TEMPLATE_USER_ID = AMERIFLUX_DEFAULT_USER_ID;
  var AMERIFLUX_TEMPLATE_USER_EMAIL = AMERIFLUX_DEFAULT_USER_EMAIL;
  var AMERIFLUX_BULK_FALLBACK_USER_ID = AMERIFLUX_DEFAULT_USER_ID;
  var AMERIFLUX_BULK_FALLBACK_USER_EMAIL = AMERIFLUX_DEFAULT_USER_EMAIL;
  var AMERIFLUX_BULK_IDENTITY_STORAGE_KEY = "shuttle-explorer:ameriflux-bulk-identity:v1";
  var AMERIFLUX_TRUSTED_RUNTIME_FLAG = "amerifluxTrustedRuntime";
  var ICOS_DIRECT_SOURCE_ONLY = "ICOS";
  var AMERIFLUX_SOURCE_ONLY = "AmeriFlux";
  var BASE_SOURCE_ONLY = "BASE";
  var FLUXNET2015_SOURCE_ONLY = "FLUXNET2015";
  var AMERIFLUX_SHUTTLE = "AmeriFlux-Shuttle";
  var SHUTTLE_SOURCE = "Shuttle";
  var SOURCE_FILTER_TAG_AMERIFLUX = "AmeriFlux";
  var SOURCE_FILTER_TAG_AMERIFLUX_SHUTTLE = "AmeriFlux-Shuttle";
  var SOURCE_FILTER_TAG_CHINAFLUX = "ChinaFlux";
  var SOURCE_FILTER_TAG_EFD = "EFD";
  var SOURCE_FILTER_TAG_FLUXNET_2015 = "FLUXNET-2015";
  var SOURCE_FILTER_TAG_FLUXNET_SHUTTLE = "FLUXNET-Shuttle";
  var SOURCE_FILTER_TAG_ICOS = "ICOS";
  var SOURCE_FILTER_TAG_ICOS_SHUTTLE = "ICOS-Shuttle";
  var SOURCE_FILTER_TAG_JAPANFLUX = "JapanFlux";
  var SOURCE_FILTER_TAG_TERN = "TERN";
  var SOURCE_FILTER_TAG_TERN_SHUTTLE = "TERN-Shuttle";
  var SOURCE_FILTER_OPTIONS = [
    SOURCE_FILTER_TAG_AMERIFLUX,
    SOURCE_FILTER_TAG_AMERIFLUX_SHUTTLE,
    SOURCE_FILTER_TAG_CHINAFLUX,
    SOURCE_FILTER_TAG_EFD,
    SOURCE_FILTER_TAG_FLUXNET_2015,
    SOURCE_FILTER_TAG_FLUXNET_SHUTTLE,
    SOURCE_FILTER_TAG_ICOS,
    SOURCE_FILTER_TAG_ICOS_SHUTTLE,
    SOURCE_FILTER_TAG_JAPANFLUX,
    SOURCE_FILTER_TAG_TERN,
    SOURCE_FILTER_TAG_TERN_SHUTTLE
  ];
  var FLUXNET2015_COUNTRY_ALIAS_NORMALIZATIONS = {
    "russian federation": "russia",
    "people s republic of china": "china",
    "peoples republic of china": "china",
    "pr china": "china"
  };
  var FLUXNET2015_AMERICAS_COUNTRY_CODES = [
    "AG", "AI", "AR", "AW", "BB", "BL", "BM", "BO", "BQ", "BR", "BS", "BZ",
    "CA", "CL", "CO", "CR", "CU", "CW", "DM", "DO", "EC", "FK", "GD", "GF",
    "GL", "GP", "GT", "GY", "HN", "HT", "JM", "KN", "KY", "LC", "MF", "MQ",
    "MS", "MX", "NI", "PA", "PE", "PM", "PR", "PY", "SR", "SV", "SX", "TC",
    "TT", "US", "UY", "VC", "VE", "VG", "VI"
  ];
  var FLUXNET2015_ICOS_COUNTRY_CODES = [
    "AD", "AL", "AO", "AT", "BE", "BF", "BG", "BI", "BJ", "BW", "BY", "CD",
    "CF", "CG", "CH", "CI", "CM", "CV", "CY", "CZ", "DE", "DJ", "DK", "DZ",
    "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FO", "FR", "GA", "GB", "GH",
    "GI", "GM", "GN", "GQ", "GR", "GW", "HR", "HU", "IE", "IM", "IS", "IT",
    "KE", "KM", "XK", "LI", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC",
    "MD", "ME", "MG", "MK", "ML", "MT", "MU", "MW", "MZ", "NA", "NE", "NG",
    "NL", "NO", "PL", "PT", "RE", "RO", "RS", "RU", "RW", "SC", "SD", "SE",
    "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SS", "ST", "SZ", "TD",
    "TG", "TN", "TZ", "UA", "UG", "UK", "VA", "YT", "ZA", "ZM", "ZW"
  ];
  var FLUXNET2015_TERN_COUNTRY_CODES = ["AU", "NZ"];
  var FLUXNET2015_CHINA_COUNTRY_CODES = ["CN"];
  var SHUTTLE_SOURCE_ORIGIN = "shuttle";
  var ICOS_DIRECT_SOURCE_ORIGIN = "icos_direct";
  var JAPANFLUX_DIRECT_SOURCE_ORIGIN = "japanflux_direct";
  var EFD_SOURCE_ORIGIN = "efd";
  var AMERIFLUX_API_SOURCE_ORIGIN = "ameriflux_api";
  var SHUTTLE_SOURCE_PRIORITY = 400;
  var ICOS_DIRECT_SOURCE_PRIORITY = 300;
  var JAPANFLUX_DIRECT_SOURCE_PRIORITY = 250;
  var AMERIFLUX_SOURCE_PRIORITY = 200;
  var FLUXNET2015_SOURCE_PRIORITY = 100;
  var EFD_SOURCE_PRIORITY = 50;
  var AMERIFLUX_FLUXNET_PRODUCT = "FLUXNET";
  var AMERIFLUX_BASE_PRODUCT = "BASE-BADM";
  var FLUXNET2015_PRODUCT = "FLUXNET2015";
  var AMERIFLUX_DATA_HUB = "AmeriFlux";
  var LANDING_PAGE_DOWNLOAD_MODE = "landing_page";
  var REQUEST_PAGE_DOWNLOAD_MODE = "request_page";
  var AMERIFLUX_FLUXNET_AVAILABILITY_CACHE_KEY = "shuttle-explorer:ameriflux-fluxnet-availability:v1";
  var AMERIFLUX_BASE_AVAILABILITY_CACHE_KEY = "shuttle-explorer:ameriflux-base-availability:v1";
  var FLUXNET2015_AVAILABILITY_CACHE_KEY = "shuttle-explorer:fluxnet2015-availability:v1";
  var AMERIFLUX_AVAILABILITY_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  var PRODUCT_FAMILY_FLUXNET = "FLUXNET";
  var PRODUCT_FAMILY_BASE = "BASE";
  var PRODUCT_FAMILY_ICOS_ETC = "ICOS_ETC";
  var PROCESSING_LINEAGE_ONEFLUX = "oneflux";
  var PROCESSING_LINEAGE_OTHER = "other_processed";
  var ICOS_CLASSIC_ARCHIVE_SPEC_URI = "http://meta.icos-cp.eu/resources/cpmeta/miscFluxnetArchiveProduct";
  var ICOS_PRODUCT_SPEC_URI = "http://meta.icos-cp.eu/resources/cpmeta/miscFluxnetProduct";
  var ICOS_ETC_ARCHIVE_SPEC_URI = "http://meta.icos-cp.eu/resources/cpmeta/etcArchiveProduct";
  var ICOS_RELEASE_VERSION_RE = /_(\d{4})_(\d+)-(\d+)(?:\.|_|$)/i;
  var ICOS_CURRENT_VERSION_RE = /_v(\d+(?:\.\d+)*)_r(\d+)/i;
  var ICOS_BETA_VERSION_RE = /_beta[-_]?(\d+)/i;
  var ICOS_RESOLUTION_PRODUCT_RE = /_(HH|HR|DD|WW|MM|YY|NRT)_/i;
  var SURFACED_CLASSIFICATION_FLUXNET_PROCESSED = "fluxnet_processed";
  var SURFACED_CLASSIFICATION_OTHER_PROCESSED = "other_processed";
  var SURFACED_CLASSIFICATION_FLUXNET_AND_OTHER = "fluxnet_and_other_processed";
  var FILTER_LABEL_FLUXNET_PROCESSED = "FLUXNET processed";
  var FILTER_LABEL_OTHER_PROCESSED = "Other processed";
  var FILTER_LABEL_FLUXNET_AND_OTHER = "Sites with both FLUXNET and additional processed years";
  var TABLE_LABEL_FLUXNET_AND_OTHER = "Sites with both FLUXNET and additional processed years";
  var MAX_HTTP_RETRIES = 3;
  var RETRY_BASE_DELAY_MS = 500;
  var EXTERNAL_REQUEST_TIMEOUT_MS = 8000;
  var AVAILABILITY_HTTP_RETRIES = 1;
  var AVAILABILITY_REQUEST_TIMEOUT_MS = 4000;
  var AMERIFLUX_LIVE_UNAVAILABLE_WARNING = "AmeriFlux live availability is temporarily unavailable; showing committed snapshot data. Some live download actions may be temporarily unavailable.";
  var AMERIFLUX_LIVE_CACHED_WARNING = "AmeriFlux live availability could not be refreshed; showing cached availability with committed snapshot data. Some live download actions may be temporarily unavailable.";
  var COPY_TABLE_BUTTON_LABEL = "Copy table to clipboard";
  var COPY_TABLE_SUCCESS_LABEL = "Copied!";
  var COPY_TABLE_FAILURE_LABEL = "Copy failed";
  var COPY_TABLE_FEEDBACK_MS = 1800;
  var COUNTRY_CODE_TO_NAME = {
    AR: "Argentina",
    AT: "Austria",
    AU: "Australia",
    BE: "Belgium",
    BR: "Brazil",
    CA: "Canada",
    CG: "Republic of the Congo",
    CH: "Switzerland",
    CL: "Chile",
    CN: "China",
    CO: "Colombia",
    CR: "Costa Rica",
    CZ: "Czech Republic",
    DE: "Germany",
    DK: "Denmark",
    ES: "Spain",
    FI: "Finland",
    FR: "France",
    GF: "French Guiana",
    GH: "Ghana",
    GL: "Greenland",
    ID: "Indonesia",
    IT: "Italy",
    JP: "Japan",
    KH: "Cambodia",
    MN: "Mongolia",
    MX: "Mexico",
    MY: "Malaysia",
    NL: "Netherlands",
    PA: "Panama",
    PE: "Peru",
    PR: "Puerto Rico",
    RU: "Russia",
    SD: "Sudan",
    SE: "Sweden",
    SJ: "Svalbard and Jan Mayen",
    SN: "Senegal",
    TH: "Thailand",
    UK: "United Kingdom",
    US: "USA",
    XK: "Kosovo",
    ZA: "South Africa",
    ZM: "Zambia"
  };
  var COUNTRY_NAME_ALIASES = {
    "u s": "USA",
    "u s a": "USA",
    "usa": "USA",
    "united states": "USA",
    "united states of america": "USA"
  };
  var COUNTRY_DISPLAY_NAMES = null;
  var NETWORK_TOKEN_DISPLAY_NAMES = {
    CNF: "ChinaFlux",
    EUF: "EuroFlux",
    JPF: "JapanFlux",
    KOF: "KoreaFlux"
  };
  var VEGETATION_IGBP_DISPLAY_NAMES = {
    BSV: "Barren or Sparsely Vegetated",
    CRO: "Croplands",
    CSH: "Closed Shrublands",
    CVM: "Cropland/Natural Vegetation Mosaics",
    DBF: "Deciduous Broadleaf Forests",
    DNF: "Deciduous Needleleaf Forests",
    EBF: "Evergreen Broadleaf Forests",
    ENF: "Evergreen Needleleaf Forests",
    GRA: "Grasslands",
    MF: "Mixed Forests",
    OSH: "Open Shrublands",
    SAV: "Savannas",
    SNO: "Snow and Ice",
    URB: "Urban and Built-Up Lands",
    WAT: "Water Bodies",
    WET: "Permanent Wetlands",
    WSA: "Woody Savannas"
  };
  var VEGETATION_IGBP_LABEL_ALIASES = {
    BSV: ["Barren or Sparsely Vegetated Lands", "Barren or Sparsely Vegetated Land"],
    CRO: ["Cropland"],
    CSH: ["Closed Shrubland"],
    CVM: ["Cropland/Natural Vegetation Mosaic", "Cropland Natural Vegetation Mosaic", "Cropland Natural Vegetation Mosaics"],
    DBF: ["Deciduous Broadleaf Forest"],
    DNF: ["Deciduous Needleleaf Forest"],
    EBF: ["Evergreen Broadleaf Forest"],
    ENF: ["Evergreen Needleleaf Forest"],
    GRA: ["Grassland"],
    MF: ["Mixed Forest"],
    OSH: ["Open Shrubland"],
    SAV: ["Savanna"],
    URB: ["Urban and Built Up Lands", "Urban and Built Up Land", "Urban and Built-up Lands", "Urban and Built-up Land"],
    WAT: ["Water Body"],
    WET: ["Permanent Wetland"],
    WSA: ["Woody Savanna"]
  };

  var SORT_COLUMNS = [
    { key: "site_id", label: "Site ID", type: "string" },
    { key: "site_name", label: "Site Name", type: "string" },
    { key: "country", label: "Country", type: "string" },
    { key: "latitude", label: "Lat", type: "coordinate" },
    { key: "longitude", label: "Lon", type: "coordinate" },
    { key: "data_hub", label: "Hub", type: "string" },
    { key: "vegetation_type", label: "Veg Type", type: "string" },
    { key: "years", label: "Years", type: "years" },
    { key: "length_years", label: "Length", type: "number" }
  ];

  function bySelector(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function qsa(root, selector) {
    return root ? Array.prototype.slice.call(root.querySelectorAll(selector)) : [];
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toSnakeCase(name) {
    return String(name || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  function normalizeSiteId(siteId) {
    return String(siteId || "").trim().toUpperCase();
  }

  function firstDefinedString(raw, keys) {
    var i;
    if (!raw || typeof raw !== "object") {
      return "";
    }
    for (i = 0; i < keys.length; i += 1) {
      var value = raw[keys[i]];
      if (value == null) {
        continue;
      }
      value = String(value).trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function ameriFluxSiteInfoSiteId(raw) {
    return normalizeSiteId(firstDefinedString(raw, ["site_id", "site", "site_code", "siteid"]));
  }

  function fluxnet2015SiteInfoSiteId(raw) {
    return normalizeSiteId(firstDefinedString(raw, ["site_id", "mysitename", "site_code", "siteid", "site"]));
  }

  function vegetationMetadataSiteId(raw) {
    return normalizeSiteId(firstDefinedString(raw, ["site_id", "mysitename", "site_code", "siteid", "site"]));
  }

  function siteNameMetadataSiteId(raw) {
    return normalizeSiteId(firstDefinedString(raw, ["site_id", "mysitename", "site_code", "siteid", "site"]));
  }

  function siteInfoSiteName(raw) {
    return firstDefinedString(raw, ["site_name", "site_title", "site_label", "name", "sitename"]);
  }

  function siteInfoCountry(raw) {
    return firstDefinedString(raw, ["country", "country_name", "country_code"]);
  }

  function extractVegetationMetadataValue(raw) {
    return firstDefinedString(raw, ["vegetation_type", "igbp", "veg_type"]);
  }

  function countryCodeToName(code) {
    var normalized = String(code || "").trim().toUpperCase();
    var displayName;
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) {
      return "";
    }
    if (COUNTRY_CODE_TO_NAME[normalized]) {
      return COUNTRY_CODE_TO_NAME[normalized];
    }
    if (COUNTRY_DISPLAY_NAMES == null && typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      try {
        COUNTRY_DISPLAY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
      } catch (e) {
        COUNTRY_DISPLAY_NAMES = false;
      }
    }
    if (COUNTRY_DISPLAY_NAMES && typeof COUNTRY_DISPLAY_NAMES.of === "function") {
      try {
        displayName = COUNTRY_DISPLAY_NAMES.of(normalized);
      } catch (err) {
        displayName = "";
      }
      if (displayName && displayName !== normalized && String(displayName).toLowerCase().indexOf("unknown") !== 0) {
        return displayName;
      }
    }
    return "";
  }

  function normalizeCountryName(value) {
    var raw = String(value || "").trim();
    var aliasKey = raw.toLowerCase().replace(/\./g, "").replace(/[^a-z]+/g, " ").trim();
    var mapped = countryCodeToName(raw);
    if (aliasKey && COUNTRY_NAME_ALIASES[aliasKey]) {
      return COUNTRY_NAME_ALIASES[aliasKey];
    }
    return mapped || raw;
  }

  function countryLookupKey(value) {
    var normalized = normalizeCountryName(value);
    var key = String(normalized || value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\./g, "")
      .replace(/[^a-z]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return FLUXNET2015_COUNTRY_ALIAS_NORMALIZATIONS[key] || key;
  }

  function buildCountryLookup(codes) {
    var lookup = {};
    (Array.isArray(codes) ? codes : []).forEach(function (code) {
      var rawCode = String(code || "").trim().toUpperCase();
      var normalizedName = countryLookupKey(rawCode);
      if (!rawCode) {
        return;
      }
      lookup[rawCode.toLowerCase()] = true;
      if (normalizedName) {
        lookup[normalizedName] = true;
      }
    });
    return lookup;
  }

  var FLUXNET2015_AMERICAS_COUNTRY_LOOKUP = buildCountryLookup(FLUXNET2015_AMERICAS_COUNTRY_CODES);
  var FLUXNET2015_ICOS_COUNTRY_LOOKUP = buildCountryLookup(FLUXNET2015_ICOS_COUNTRY_CODES);
  var FLUXNET2015_TERN_COUNTRY_LOOKUP = buildCountryLookup(FLUXNET2015_TERN_COUNTRY_CODES);
  var FLUXNET2015_CHINA_COUNTRY_LOOKUP = buildCountryLookup(FLUXNET2015_CHINA_COUNTRY_CODES);

  function inferFluxnet2015NetworkFromCountry(country) {
    var key = countryLookupKey(country);
    if (!key) {
      return null;
    }
    if (FLUXNET2015_CHINA_COUNTRY_LOOKUP[key]) {
      return SOURCE_FILTER_TAG_CHINAFLUX;
    }
    if (FLUXNET2015_TERN_COUNTRY_LOOKUP[key]) {
      return SOURCE_FILTER_TAG_TERN;
    }
    if (FLUXNET2015_AMERICAS_COUNTRY_LOOKUP[key]) {
      return SOURCE_FILTER_TAG_AMERIFLUX;
    }
    if (FLUXNET2015_ICOS_COUNTRY_LOOKUP[key]) {
      return SOURCE_FILTER_TAG_ICOS;
    }
    return null;
  }

  function buildSiteInfoEntry(siteId, raw) {
    return {
      site_id: siteId,
      site_name: siteInfoSiteName(raw),
      country: normalizeCountryName(siteInfoCountry(raw)),
      latitude: extractRawLatitude(raw),
      longitude: extractRawLongitude(raw)
    };
  }

  function parseIntOrNull(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s || !/^-?\d+$/.test(s)) {
      return null;
    }
    var n = parseInt(s, 10);
    return isFinite(n) ? n : null;
  }

  function formatIsoDate(date) {
    if (!(date instanceof Date) || !isFinite(date.getTime())) {
      return "";
    }
    var y = date.getUTCFullYear();
    var m = String(date.getUTCMonth() + 1).padStart(2, "0");
    var d = String(date.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function normalizeSnapshotUpdatedDate(value) {
    var raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }
    return formatIsoDate(new Date(raw));
  }

  function extractSnapshotUpdatedDate(meta) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return "";
    }
    return normalizeSnapshotUpdatedDate(meta.snapshot_updated_date) ||
      normalizeSnapshotUpdatedDate(meta.snapshot_updated_at);
  }

  function extractSnapshotRefreshedDate(meta) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return "";
    }
    return normalizeSnapshotUpdatedDate(meta.snapshot_refreshed_date) ||
      normalizeSnapshotUpdatedDate(meta.snapshot_refreshed_at) ||
      extractSnapshotUpdatedDate(meta);
  }

  function latestSnapshotDate(dates) {
    var latest = "";
    (dates || []).forEach(function (dateValue) {
      var normalized = normalizeSnapshotUpdatedDate(dateValue);
      if (normalized && (!latest || normalized > latest)) {
        latest = normalized;
      }
    });
    return latest;
  }

  function latestSnapshotRefreshedDateFromResults(results) {
    return latestSnapshotDate((results || []).map(function (result) {
      return extractSnapshotRefreshedDate(result && result.meta ? result.meta : {});
    }));
  }

  function extractSnapshotSourceStatuses(meta) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return {};
    }
    var statuses = meta.source_statuses;
    if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) {
      return {};
    }
    return statuses;
  }

  function buildSnapshotSourceStatusWarning(meta) {
    var statuses = extractSnapshotSourceStatuses(meta);
    var stale = [];
    Object.keys(statuses).sort().forEach(function (hub) {
      var entry = statuses[hub];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }
      if (String(entry.status || "").trim().toLowerCase() !== "carried_forward") {
        return;
      }
      stale.push(String(hub).trim() + " (" + snapshotUpdatedDateDisplayText(entry.last_successful_refresh_date || entry.last_successful_refresh_at || "") + ")");
    });
    if (!stale.length) {
      return "";
    }
    if (stale.length === 1) {
      return stale[0] + " Shuttle snapshot data is being carried forward from the last validated refresh. Site browsing remains available, but this source may be temporarily stale.";
    }
    return "Some Shuttle snapshot sources are being carried forward from the last validated refresh: " + stale.join(", ") + ". Site browsing remains available, but those sources may be temporarily stale.";
  }

  function logSnapshotSourceStatusWarnings(meta) {
    var statuses = extractSnapshotSourceStatuses(meta);
    if (!window.console || typeof console.warn !== "function") {
      return;
    }
    Object.keys(statuses).sort().forEach(function (hub) {
      var entry = statuses[hub];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }
      if (String(entry.status || "").trim().toLowerCase() !== "carried_forward") {
        return;
      }
      console.warn(
        "Shuttle snapshot source carried forward:",
        hub,
        String(entry.reason || "No carry-forward reason recorded."),
        "Last successful refresh:",
        snapshotUpdatedDateDisplayText(entry.last_successful_refresh_date || entry.last_successful_refresh_at || "")
      );
    });
  }

  function snapshotUpdatedDateDisplayText(snapshotUpdatedDate) {
    return normalizeSnapshotUpdatedDate(snapshotUpdatedDate) || "unavailable";
  }

  function gaEvent(name, params) {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params || {});
    }
  }

  function safeJsonParse(text) {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function getLocalStorageSafe() {
    try {
      return window.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  function normalizeOptionalInputValue(value) {
    return String(value == null ? "" : value).trim();
  }

  function resolveAmeriFluxBulkIdentity(userIdInput, userEmailInput) {
    var enteredUserId = normalizeOptionalInputValue(userIdInput);
    var enteredUserEmail = normalizeOptionalInputValue(userEmailInput);
    return {
      enteredUserId: enteredUserId,
      enteredUserEmail: enteredUserEmail,
      user_id: enteredUserId || AMERIFLUX_BULK_FALLBACK_USER_ID,
      user_email: enteredUserEmail || AMERIFLUX_BULK_FALLBACK_USER_EMAIL
    };
  }

  function resolveAmeriFluxIdentityOverride(identityOverride) {
    if (!identityOverride || typeof identityOverride !== "object") {
      return null;
    }
    return resolveAmeriFluxBulkIdentity(
      firstDefinedString(identityOverride, ["enteredUserId", "user_id", "userId"]),
      firstDefinedString(identityOverride, ["enteredUserEmail", "user_email", "userEmail"])
    );
  }

  function readAmeriFluxBulkIdentityPreferences() {
    var storage = getLocalStorageSafe();
    var stored;
    if (!storage) {
      return { userId: "", userEmail: "" };
    }
    try {
      stored = safeJsonParse(storage.getItem(AMERIFLUX_BULK_IDENTITY_STORAGE_KEY));
    } catch (e) {
      stored = null;
    }
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return { userId: "", userEmail: "" };
    }
    return {
      userId: normalizeOptionalInputValue(stored.userId),
      userEmail: normalizeOptionalInputValue(stored.userEmail)
    };
  }

  function writeAmeriFluxBulkIdentityPreferences(userIdInput, userEmailInput) {
    var storage = getLocalStorageSafe();
    var userId = normalizeOptionalInputValue(userIdInput);
    var userEmail = normalizeOptionalInputValue(userEmailInput);
    if (!storage) {
      return;
    }
    try {
      if (!userId && !userEmail) {
        storage.removeItem(AMERIFLUX_BULK_IDENTITY_STORAGE_KEY);
        return;
      }
      storage.setItem(AMERIFLUX_BULK_IDENTITY_STORAGE_KEY, JSON.stringify({
        userId: userId,
        userEmail: userEmail
      }));
    } catch (e) {
      return;
    }
  }

  function snapshotCacheBaseKey(jsonUrl, csvUrl) {
    return [
      SNAPSHOT_CACHE_STORAGE_PREFIX,
      encodeURIComponent(String(jsonUrl || "")),
      encodeURIComponent(String(csvUrl || ""))
    ].join("|");
  }

  function snapshotCacheIndexKey(baseKey) {
    return baseKey + "|index";
  }

  function snapshotCacheRecordKey(baseKey, freshnessKey) {
    return baseKey + "|record|" + encodeURIComponent(String(freshnessKey || "unknown"));
  }

  function readSnapshotCache(jsonUrl, csvUrl) {
    var storage = getLocalStorageSafe();
    if (!storage) {
      return null;
    }
    var baseKey = snapshotCacheBaseKey(jsonUrl, csvUrl);
    var indexKey = snapshotCacheIndexKey(baseKey);

    try {
      var index = safeJsonParse(storage.getItem(indexKey));
      if (!index || index.schema !== SNAPSHOT_CACHE_SCHEMA_VERSION || !index.recordKey) {
        return null;
      }
      var record = safeJsonParse(storage.getItem(String(index.recordKey)));
      if (!record || record.schema !== SNAPSHOT_CACHE_SCHEMA_VERSION || !Array.isArray(record.rows)) {
        return null;
      }
      return record;
    } catch (e) {
      return null;
    }
  }

  function writeSnapshotCache(jsonUrl, csvUrl, entry) {
    var storage = getLocalStorageSafe();
    if (!storage || !entry || !Array.isArray(entry.rows)) {
      return;
    }
    var baseKey = snapshotCacheBaseKey(jsonUrl, csvUrl);
    var indexKey = snapshotCacheIndexKey(baseKey);
    var freshnessKey = String(entry.freshnessKey || "unknown");
    var recordKey = snapshotCacheRecordKey(baseKey, freshnessKey);

    var record = {
      schema: SNAPSHOT_CACHE_SCHEMA_VERSION,
      freshnessKey: freshnessKey,
      source: entry.source || "",
      sourceUrl: entry.sourceUrl || "",
      warning: entry.warning || "",
      downloadWarning: entry.downloadWarning || "",
      snapshotRefreshedDate: entry.snapshotRefreshedDate || "",
      snapshotUpdatedDate: entry.snapshotUpdatedDate || "",
      rows: entry.rows,
      droppedRows: entry.droppedRows || 0,
      amerifluxTotalSites: entry.amerifluxTotalSites || 0,
      amerifluxSitesWithYears: entry.amerifluxSitesWithYears || 0,
      amerifluxOverlapSites: entry.amerifluxOverlapSites || 0,
      amerifluxOnlySites: entry.amerifluxOnlySites || 0,
      fluxnet2015TotalSites: entry.fluxnet2015TotalSites || 0,
      fluxnet2015SitesWithYears: entry.fluxnet2015SitesWithYears || 0,
      fluxnet2015OnlySites: entry.fluxnet2015OnlySites || 0,
      cachedAt: new Date().toISOString()
    };

    try {
      var oldIndex = safeJsonParse(storage.getItem(indexKey));
      storage.setItem(recordKey, JSON.stringify(record));
      storage.setItem(indexKey, JSON.stringify({
        schema: SNAPSHOT_CACHE_SCHEMA_VERSION,
        recordKey: recordKey,
        freshnessKey: freshnessKey
      }));
      if (oldIndex && oldIndex.recordKey && oldIndex.recordKey !== recordKey) {
        storage.removeItem(String(oldIndex.recordKey));
      }
    } catch (e) {
      try {
        storage.removeItem(indexKey);
      } catch (e2) {
        // Ignore localStorage cleanup failures.
      }
    }
  }

  function splitNetworks(value) {
    var s = String(value || "").trim();
    if (!s) {
      return [];
    }
    var parts = s.split(";").map(function (item) {
      return item.trim();
    }).filter(Boolean);
    return parts.length ? parts : [s];
  }

  function normalizeNetworkToken(value) {
    var token = String(value || "").trim();
    var mapped;
    if (!token) {
      return "";
    }
    mapped = NETWORK_TOKEN_DISPLAY_NAMES[token.toUpperCase()];
    return mapped || token;
  }

  function normalizeNetworkTokens(value) {
    var seen = {};
    var tokens = [];
    splitNetworks(value).forEach(function (token) {
      var normalized = normalizeNetworkToken(token);
      var key = String(normalized || "").toLowerCase();
      if (!normalized || seen[key]) {
        return;
      }
      seen[key] = true;
      tokens.push(normalized);
    });
    return tokens;
  }

  function normalizeNetworkDisplayValue(value) {
    return normalizeNetworkTokens(value).join(";");
  }

  function vegetationLookupKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildVegetationNameToCodeMap() {
    var lookup = {};
    Object.keys(VEGETATION_IGBP_DISPLAY_NAMES).forEach(function (code) {
      var names = [VEGETATION_IGBP_DISPLAY_NAMES[code]].concat(VEGETATION_IGBP_LABEL_ALIASES[code] || []);
      names.forEach(function (name) {
        var key = vegetationLookupKey(name);
        if (key) {
          lookup[key] = code;
        }
      });
    });
    return lookup;
  }

  var VEGETATION_NAME_TO_IGBP_CODE = buildVegetationNameToCodeMap();

  function normalizeVegetationType(value) {
    var raw = String(value == null ? "" : value).trim();
    var canonicalCode;
    if (!raw) {
      return "";
    }
    canonicalCode = VEGETATION_NAME_TO_IGBP_CODE[vegetationLookupKey(raw)];
    return canonicalCode || raw;
  }

  function vegetationDisplayLabel(value) {
    var raw = String(value == null ? "" : value).trim();
    var canonicalCode;
    if (!raw) {
      return "";
    }
    canonicalCode = String(normalizeVegetationType(raw) || "").trim().toUpperCase();
    return VEGETATION_IGBP_DISPLAY_NAMES[canonicalCode] || raw;
  }

  function hasNetworkTag(value, expected) {
    var target = String(expected || "").trim().toLowerCase();
    if (!target) {
      return false;
    }
    return splitNetworks(value).some(function (token) {
      return String(token || "").toLowerCase() === target;
    });
  }

  function normalizeNetworkDisplay(row) {
    if (!row || typeof row !== "object") {
      return row;
    }
    var sourceLabel = String(row.source_label || "").trim();
    var dataProduct = String(row.api_data_product || "").trim().toUpperCase();
    var networkDisplay = String(row.network_display || row.network || row.source_network || "").trim();
    var reliableFluxnet2015Tokens;
    var inferredFluxnet2015Network;
    if (
      sourceLabel === FLUXNET2015_SOURCE_ONLY ||
      dataProduct === FLUXNET2015_PRODUCT ||
      hasNetworkTag(row.network_display, FLUXNET2015_SOURCE_ONLY) ||
      hasNetworkTag(row.network, FLUXNET2015_SOURCE_ONLY) ||
      hasNetworkTag(row.source_network, FLUXNET2015_SOURCE_ONLY)
    ) {
      reliableFluxnet2015Tokens = rowNetworkTokens(row).filter(function (token) {
        return String(token || "").trim() && String(token || "").trim() !== FLUXNET2015_SOURCE_ONLY;
      });
      inferredFluxnet2015Network = inferFluxnet2015NetworkFromCountry(row.country);
      networkDisplay = reliableFluxnet2015Tokens.length
        ? reliableFluxnet2015Tokens.join(";")
        : (inferredFluxnet2015Network || "");
      row.network = networkDisplay;
      row.source_network = networkDisplay;
    } else if (
      sourceLabel === BASE_SOURCE_ONLY ||
      dataProduct === AMERIFLUX_BASE_PRODUCT ||
      String(row.data_hub || "").toLowerCase() === "ameriflux" ||
      sourceLabel === AMERIFLUX_SOURCE_ONLY ||
      sourceLabel === AMERIFLUX_SHUTTLE ||
      hasNetworkTag(row.network_display, AMERIFLUX_SOURCE_ONLY) ||
      hasNetworkTag(row.network, AMERIFLUX_SOURCE_ONLY) ||
      hasNetworkTag(row.source_network, AMERIFLUX_SOURCE_ONLY)
    ) {
      networkDisplay = AMERIFLUX_SOURCE_ONLY;
    }
    row.network_display = normalizeNetworkDisplayValue(networkDisplay);
    row.network_tokens = normalizeNetworkTokens(networkDisplay);
    return row;
  }

  function deriveCountry(siteId, fallback) {
    var fb = normalizeCountryName(fallback);
    if (fb) {
      return fb;
    }
    var s = String(siteId || "").trim();
    var code = "";
    if (!s) {
      return "";
    }
    var idx = s.indexOf("-");
    if (idx > 0) {
      code = s.slice(0, idx).toUpperCase();
    } else {
      idx = s.indexOf("_");
      if (idx > 0) {
        code = s.slice(0, idx).toUpperCase();
      } else {
        code = s.slice(0, 2).toUpperCase();
      }
    }
    return countryCodeToName(code) || code;
  }

  function isIcosRow(row) {
    var url = String(row.download_link || "").toLowerCase();
    return resolveSourceOrigin(row) === ICOS_DIRECT_SOURCE_ORIGIN ||
      String(row && row.source_label || "").trim() === ICOS_DIRECT_SOURCE_ONLY ||
      /data\.icos-cp\.eu\/licence_accept/.test(url);
  }

  function normalizeProductFamily(value) {
    var normalized = String(value || "").trim().toUpperCase();
    if (normalized === PRODUCT_FAMILY_BASE) {
      return PRODUCT_FAMILY_BASE;
    }
    if (normalized === PRODUCT_FAMILY_ICOS_ETC || normalized === "ICOS ETC") {
      return PRODUCT_FAMILY_ICOS_ETC;
    }
    return PRODUCT_FAMILY_FLUXNET;
  }

  function normalizeVersionReference(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function inferRowProductFamily(row) {
    var explicit = String(row && (row.product_family || row.productFamily) || "").trim();
    var objectSpec = String(row && row.object_spec || "").trim();
    var fileName = String(row && row.file_name || "").trim().toUpperCase();
    var dataProduct = String(row && (row.api_data_product || row.apiDataProduct) || "").trim().toUpperCase();

    if (explicit) {
      return normalizeProductFamily(explicit);
    }
    if (dataProduct === AMERIFLUX_BASE_PRODUCT) {
      return PRODUCT_FAMILY_BASE;
    }
    if (
      objectSpec === ICOS_ETC_ARCHIVE_SPEC_URI ||
      fileName.indexOf("ICOSETC_") === 0 ||
      fileName.indexOf("ARCHIVE_L2") !== -1
    ) {
      return PRODUCT_FAMILY_ICOS_ETC;
    }
    return PRODUCT_FAMILY_FLUXNET;
  }

  function isIcosEtcRow(row) {
    return isIcosRow(row) && inferRowProductFamily(row) === PRODUCT_FAMILY_ICOS_ETC;
  }

  function isIcosResolutionProduct(fileName) {
    var upper = String(fileName || "").trim().toUpperCase();
    return /\.CSV\.ZIP$/.test(upper) || ICOS_RESOLUTION_PRODUCT_RE.test(upper);
  }

  function isPreferredIcosClassicArchiveRow(row) {
    var fileName = String(row && row.file_name || "").trim();
    var upper = fileName.toUpperCase();
    if (inferRowProductFamily(row) !== PRODUCT_FAMILY_FLUXNET) {
      return false;
    }
    if (String(row && row.object_spec || "").trim() === ICOS_CLASSIC_ARCHIVE_SPEC_URI) {
      return true;
    }
    if (isIcosResolutionProduct(fileName)) {
      return false;
    }
    if (upper.indexOf("FULLSET") !== -1) {
      return true;
    }
    return upper.indexOf("_FLUXNET_") !== -1;
  }

  function parseIcosVersionRank(fileName) {
    var release = ICOS_RELEASE_VERSION_RE.exec(String(fileName || ""));
    var current;
    var beta;

    if (release) {
      return [3, [parseInt(release[1], 10), parseInt(release[2], 10), parseInt(release[3], 10)], 0];
    }

    current = ICOS_CURRENT_VERSION_RE.exec(String(fileName || ""));
    if (current) {
      return [
        2,
        current[1].split(".").map(function (part) { return parseInt(part, 10) || 0; }),
        parseInt(current[2], 10) || 0
      ];
    }

    beta = ICOS_BETA_VERSION_RE.exec(String(fileName || ""));
    if (beta) {
      return [1, [parseInt(beta[1], 10) || 0], 0];
    }

    return [0, [], 0];
  }

  function icosCoverageRank(row) {
    var firstYear = parseIntOrNull(row && row.first_year);
    var lastYear = parseIntOrNull(row && row.last_year);
    var length = firstYear != null && lastYear != null && lastYear >= firstYear ? (lastYear - firstYear) + 1 : 0;
    var earlierStartBonus = firstYear != null ? (9999 - firstYear) : 0;
    return [lastYear || 0, length, earlierStartBonus];
  }

  function icosCanonicalNameBonus(row) {
    var upper = String(row && row.file_name || "").trim().toUpperCase();
    if (inferRowProductFamily(row) === PRODUCT_FAMILY_ICOS_ETC) {
      return [
        upper.indexOf("ICOSETC_") === 0 ? 1 : 0,
        upper.indexOf("ARCHIVE_L2") !== -1 ? 1 : 0
      ];
    }
    return [
      upper.indexOf("FLX_") === 0 ? 1 : 0,
      upper.indexOf("FULLSET") !== -1 ? 1 : 0
    ];
  }

  function icosFamilyRank(row) {
    return inferRowProductFamily(row) === PRODUCT_FAMILY_ICOS_ETC ? 1 : 2;
  }

  function icosMetadataVersionRank(row) {
    var metadataUrl = normalizeVersionReference(row && row.metadata_url);
    var latestVersionUrl = normalizeVersionReference(row && row.latest_version_url);
    return [metadataUrl && latestVersionUrl && metadataUrl === latestVersionUrl ? 1 : 0, 0];
  }

  function compareRankValues(left, right) {
    var leftIsArray = Array.isArray(left);
    var rightIsArray = Array.isArray(right);
    var index;
    var cmp;
    var leftValue;
    var rightValue;

    if (leftIsArray || rightIsArray) {
      leftValue = leftIsArray ? left : [left];
      rightValue = rightIsArray ? right : [right];
      for (index = 0; index < Math.max(leftValue.length, rightValue.length); index += 1) {
        cmp = compareRankValues(
          index < leftValue.length ? leftValue[index] : 0,
          index < rightValue.length ? rightValue[index] : 0
        );
        if (cmp) {
          return cmp;
        }
      }
      return 0;
    }

    leftValue = left == null ? "" : left;
    rightValue = right == null ? "" : right;
    if (leftValue === rightValue) {
      return 0;
    }
    return leftValue > rightValue ? -1 : 1;
  }

  function compareIcosRows(left, right) {
    var rankedPairs = [
      [icosFamilyRank(left), icosFamilyRank(right)],
      [isPreferredIcosClassicArchiveRow(left) ? 1 : 0, isPreferredIcosClassicArchiveRow(right) ? 1 : 0],
      [icosMetadataVersionRank(left), icosMetadataVersionRank(right)],
      [parseIcosVersionRank(left && left.file_name), parseIcosVersionRank(right && right.file_name)],
      [icosCoverageRank(left), icosCoverageRank(right)],
      [icosCanonicalNameBonus(left), icosCanonicalNameBonus(right)],
      [String(left && left.production_end || ""), String(right && right.production_end || "")],
      [String(left && left.coverage_end || ""), String(right && right.coverage_end || "")]
    ];
    var index;
    var cmp;
    var leftTail;
    var rightTail;

    for (index = 0; index < rankedPairs.length; index += 1) {
      cmp = compareRankValues(rankedPairs[index][0], rankedPairs[index][1]);
      if (cmp) {
        return cmp;
      }
    }

    leftTail = [String(left && left.file_name || ""), String(left && left.object_id || "")];
    rightTail = [String(right && right.file_name || ""), String(right && right.object_id || "")];
    if (leftTail[0] < rightTail[0]) {
      return -1;
    }
    if (leftTail[0] > rightTail[0]) {
      return 1;
    }
    if (leftTail[1] < rightTail[1]) {
      return -1;
    }
    if (leftTail[1] > rightTail[1]) {
      return 1;
    }
    return 0;
  }

  function dedupeIcosDirectRows(rows) {
    var grouped = {};
    var siteIds;

    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var siteId = normalizeSiteId(row && row.site_id);
      if (!siteId) {
        return;
      }
      if (!grouped[siteId]) {
        grouped[siteId] = [];
      }
      grouped[siteId].push(row);
    });

    siteIds = Object.keys(grouped).sort();
    return siteIds.map(function (siteId) {
      return grouped[siteId].slice().sort(compareIcosRows)[0];
    });
  }

  function dedupeSiteLevelRows(rows) {
    var grouped = {};
    var siteIds;

    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var siteId = normalizeSiteId(row && row.site_id);
      if (!siteId || grouped[siteId]) {
        return;
      }
      grouped[siteId] = row;
    });

    siteIds = Object.keys(grouped).sort();
    return siteIds.map(function (siteId) {
      return grouped[siteId];
    });
  }

  function isJapanFluxSourceRow(row) {
    var sourceLabel = String(row && row.source_label || "").trim();
    var sourceOrigin = resolveSourceOrigin(row);
    var dataHub = String(row && row.data_hub || "").trim().toLowerCase();
    return sourceOrigin === JAPANFLUX_DIRECT_SOURCE_ORIGIN ||
      sourceLabel === SOURCE_FILTER_TAG_JAPANFLUX ||
      dataHub === "japanflux";
  }

  function isEfdSourceRow(row) {
    var sourceLabel = String(row && row.source_label || "").trim();
    var sourceOrigin = resolveSourceOrigin(row);
    var dataHub = String(row && row.data_hub || "").trim().toLowerCase();
    return sourceOrigin === EFD_SOURCE_ORIGIN ||
      sourceLabel === SOURCE_FILTER_TAG_EFD ||
      dataHub === "efd";
  }

  function isRequestOnlyRow(row) {
    return String(row && row.download_mode || "").trim() === REQUEST_PAGE_DOWNLOAD_MODE;
  }

  function resolveSourceOrigin(row) {
    var explicit = String(row && row.source_origin || "").trim();
    if (explicit) {
      return explicit;
    }
    if (String(row && row.download_mode || "").trim() === "ameriflux_api") {
      return AMERIFLUX_API_SOURCE_ORIGIN;
    }
    if (String(row && row.source_label || "").trim() === SOURCE_FILTER_TAG_JAPANFLUX) {
      return JAPANFLUX_DIRECT_SOURCE_ORIGIN;
    }
    if (String(row && row.source_label || "").trim() === SOURCE_FILTER_TAG_EFD) {
      return EFD_SOURCE_ORIGIN;
    }
    if (String(row && row.source_label || "").trim() === ICOS_DIRECT_SOURCE_ONLY) {
      return ICOS_DIRECT_SOURCE_ORIGIN;
    }
    return SHUTTLE_SOURCE_ORIGIN;
  }

  function resolveSourcePriority(row) {
    var explicit = parseIntOrNull(row && row.source_priority);
    var sourceLabel;
    var dataProduct;
    var sourceOrigin;
    if (explicit != null) {
      return explicit;
    }
    sourceLabel = String(row && row.source_label || "").trim();
    dataProduct = String(row && row.api_data_product || "").trim().toUpperCase();
    sourceOrigin = resolveSourceOrigin(row);
    if (sourceOrigin === ICOS_DIRECT_SOURCE_ORIGIN || sourceLabel === ICOS_DIRECT_SOURCE_ONLY) {
      return ICOS_DIRECT_SOURCE_PRIORITY;
    }
    if (sourceOrigin === JAPANFLUX_DIRECT_SOURCE_ORIGIN || sourceLabel === SOURCE_FILTER_TAG_JAPANFLUX) {
      return JAPANFLUX_DIRECT_SOURCE_PRIORITY;
    }
    if (sourceOrigin === EFD_SOURCE_ORIGIN || sourceLabel === SOURCE_FILTER_TAG_EFD) {
      return EFD_SOURCE_PRIORITY;
    }
    if (dataProduct === FLUXNET2015_PRODUCT || sourceLabel === FLUXNET2015_SOURCE_ONLY) {
      return FLUXNET2015_SOURCE_PRIORITY;
    }
    if (
      sourceOrigin === AMERIFLUX_API_SOURCE_ORIGIN ||
      sourceLabel === AMERIFLUX_SOURCE_ONLY ||
      sourceLabel === BASE_SOURCE_ONLY ||
      dataProduct === AMERIFLUX_BASE_PRODUCT
    ) {
      return AMERIFLUX_SOURCE_PRIORITY;
    }
    return SHUTTLE_SOURCE_PRIORITY;
  }

  function isShuttleCatalogRow(row) {
    return resolveSourceOrigin(row) === SHUTTLE_SOURCE_ORIGIN && String(row && row.download_mode || "").trim() !== "ameriflux_api";
  }

  function yearRangeLabel(firstYear, lastYear) {
    if (firstYear && lastYear) {
      return String(firstYear) + "-" + String(lastYear);
    }
    if (firstYear) {
      return String(firstYear) + "-";
    }
    if (lastYear) {
      return "-" + String(lastYear);
    }
    return "\u2014";
  }

  function calculateCoverageLength(firstYear, lastYear) {
    var start = parseIntOrNull(firstYear);
    var end = parseIntOrNull(lastYear);
    if (start == null || end == null || end < start) {
      return null;
    }
    return (end - start) + 1;
  }

  function buildRowSearchText(row) {
    var networkDisplay = String(row && (row.network_display || row.network || row.source_network) || "").trim();
    var surfacedSummary = buildSurfacedCoverageSummary(row && row.surfacedProducts);
    var classification = String(row && row.surfacedProductClassification || "").trim();
    var availabilityLabels = Array.isArray(row && row.availability_filter_labels) ? row.availability_filter_labels.join(" ") : "";
    var sourceTags = Array.isArray(row && row.source_filter_tags) ? row.source_filter_tags.join(" ") : "";
    var fluxList = String(row && row.flux_list || "").trim();
    var accessLabel = String(row && row.access_label || "").trim();
    var dataUseLabel = String(row && row.data_use_label || "").trim();
    var efdAccessSummary = String(row && row.efd_access_summary || "").trim();
    var efdPolicyYearCount = String(row && row.efd_policy_year_count || "").trim();
    var efdPolicyYears = Array.isArray(row && row.efd_policy_years)
      ? row.efd_policy_years.join(" ")
      : String(row && row.efd_policy_years || "").trim();
    var efdPolicyFirstYear = String(row && row.efd_policy_first_year || "").trim();
    var efdPolicyLastYear = String(row && row.efd_policy_last_year || "").trim();
    var efdProvenance = String(row && row.efd_provenance || "").trim();
    return (
      String(row && row.site_id || "") + " " +
      String(row && row.site_name || "") + " " +
      String(row && row.country || "") + " " +
      networkDisplay + " " +
      String(row && row.source_network || "") + " " +
      String(row && row.vegetation_type || "") + " " +
      String(row && row.source_label || "") + " " +
      String(row && row.primarySourceLabel || "") + " " +
      String(row && row.source_filter || "") + " " +
      sourceTags + " " +
      availabilityLabels + " " +
      fluxList + " " +
      accessLabel + " " +
      dataUseLabel + " " +
      efdAccessSummary + " " +
      efdPolicyYearCount + " " +
      efdPolicyYears + " " +
      efdPolicyFirstYear + " " +
      efdPolicyLastYear + " " +
      efdProvenance + " " +
      String(row && row.years || "") + " " +
      surfacedSummary + " " +
      classification
    ).toLowerCase();
  }

  function applyRowSourceFilterState(row) {
    if (!row || typeof row !== "object") {
      return row;
    }
    row.primarySourceLabel = primarySourceLabel(row);
    row.source_provenance_filter = row.primarySourceLabel;
    row.source_filter = row.primarySourceLabel;
    row.source_filter_tags = computeSourceFilterTags(row);
    row.availability_filter_labels = availabilityFilterLabels(row);
    return row;
  }

  function finalizeRowComputedState(row) {
    var explicitYears;
    var exactYears;
    if (!row || typeof row !== "object") {
      return row;
    }
    row.country = deriveCountry(row.site_id, row.country);
    row.vegetation_type = normalizeVegetationType(row.vegetation_type);
    row.first_year = parseIntOrNull(row.first_year);
    row.last_year = parseIntOrNull(row.last_year);
    explicitYears = normalizePublishYears(preferredExplicitYearSource(row.publish_years, row.efd_policy_years));
    exactYears = normalizedExactYears(explicitYears, row.first_year, row.last_year);
    row.publish_years = explicitYears.slice();
    row.efd_policy_years = isEfdSourceRow(row)
      ? normalizePublishYears(preferredExplicitYearSource(row.efd_policy_years, explicitYears))
      : normalizePublishYears(row.efd_policy_years);
    if (isEfdSourceRow(row) && row.efd_policy_years.length) {
      if (!String(row.efd_policy_year_count || "").trim()) {
        row.efd_policy_year_count = String(row.efd_policy_years.length);
      }
      if (!String(row.efd_policy_first_year || "").trim()) {
        row.efd_policy_first_year = String(row.efd_policy_years[0]);
      }
      if (!String(row.efd_policy_last_year || "").trim()) {
        row.efd_policy_last_year = String(row.efd_policy_years[row.efd_policy_years.length - 1]);
      }
    }
    if (exactYears.length) {
      row.first_year = exactYears[0];
      row.last_year = exactYears[exactYears.length - 1];
      row.years = exactYearCoverageLabel(exactYears, row.first_year, row.last_year);
      row.length_years = exactYears.length;
    } else {
      row.years = yearRangeLabel(row.first_year, row.last_year);
      row.length_years = calculateCoverageLength(row.first_year, row.last_year);
    }
    normalizeNetworkDisplay(row);
    row.source_origin = resolveSourceOrigin(row);
    row.source_priority = resolveSourcePriority(row);
    row.product_family = inferRowProductFamily(row);
    row.processing_lineage = resolveProcessingLineage(row);
    applyRowSourceFilterState(row);
    row.is_icos = isIcosRow(row);
    row.has_coordinates = parseCoordinate(row.latitude, -90, 90) != null &&
      parseCoordinate(row.longitude, -180, 180) != null;
    row.search_text = buildRowSearchText(row);
    return row;
  }

  function stripUrlQueryForFilename(url) {
    return String(url || "").split("?")[0];
  }

  function filenameFromUrl(url) {
    var cleanUrl = stripUrlQueryForFilename(url).trim();
    if (!cleanUrl) {
      return "";
    }
    var idx = cleanUrl.lastIndexOf("/");
    if (idx < 0) {
      return cleanUrl;
    }
    return cleanUrl.slice(idx + 1);
  }

  function isValidAmeriFluxZipFilename(filename) {
    var value = String(filename || "").trim();
    return !!(value &&
      /\.zip$/i.test(value) &&
      value.indexOf("/") < 0 &&
      value.indexOf("\\") < 0 &&
      value.indexOf("?") < 0 &&
      value.indexOf("#") < 0);
  }

  function amerifluxZipFilenameFromDownloadEntry(entry) {
    var candidates = [];
    var i;
    var candidate;
    var filename;
    if (entry && typeof entry === "object") {
      candidates.push(
        entry.zip_filename,
        entry.zipFilename,
        entry.filename,
        entry.file_name,
        entry.url,
        entry.download_url,
        entry.downloadUrl,
        entry.href
      );
    } else {
      candidates.push(entry);
    }
    for (i = 0; i < candidates.length; i += 1) {
      candidate = String(candidates[i] || "").trim();
      if (!candidate) {
        continue;
      }
      filename = filenameFromUrl(candidate);
      if (isValidAmeriFluxZipFilename(filename)) {
        return filename;
      }
    }
    return "";
  }

  function amerifluxZipFilenamesFromDownloadEntries(entries) {
    var seen = {};
    var filenames = [];
    (Array.isArray(entries) ? entries : [entries]).forEach(function (entry) {
      var filename = amerifluxZipFilenameFromDownloadEntry(entry);
      var key = filename.toLowerCase();
      if (!filename || seen[key]) {
        return;
      }
      seen[key] = true;
      filenames.push(filename);
    });
    return filenames;
  }

  function normalizeAmeriFluxLoggerIntendedUse(value) {
    var normalized = String(value == null ? "" : value).trim();
    var allowed = {
      synthesis: true,
      model: true,
      remote_sensing: true,
      other_research: true,
      education: true,
      other: true
    };
    return allowed[normalized] ? normalized : null;
  }

  function buildAmeriFluxDownloadLogPayload(downloadEntries, options) {
    var opts = options || {};
    return {
      user_id: AMERIFLUX_DEFAULT_USER_ID,
      zip_filenames: amerifluxZipFilenamesFromDownloadEntries(downloadEntries),
      user_email: AMERIFLUX_DEFAULT_USER_EMAIL,
      user_name: String(opts.userName || AMERIFLUX_LOGGER_USER_NAME),
      intended_use: normalizeAmeriFluxLoggerIntendedUse(opts.intendedUse || AMERIFLUX_LOGGER_INTENDED_USE),
      description: String(opts.description || AMERIFLUX_LOGGER_DESCRIPTION)
    };
  }

  function logAmeriFluxDownloadEntries(downloadEntries, options) {
    var opts = options || {};
    var payload = buildAmeriFluxDownloadLogPayload(downloadEntries, opts);
    if (!payload.zip_filenames.length || typeof fetch !== "function") {
      return Promise.resolve({ logged: false, skipped: true });
    }
    return fetchWithTimeout(AMERIFLUX_DOWNLOAD_LOGGER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload),
      timeoutMs: opts.timeoutMs
    }, opts.timeoutMs).then(function (response) {
      if (response && response.ok) {
        return { logged: true };
      }
      throw new Error("HTTP " + (response && response.status ? response.status : "error") + " for AmeriFlux download logger");
    }).catch(function (error) {
      if (typeof console !== "undefined" && console && console.warn) {
        console.warn("AmeriFlux download logging failed; continuing without blocking download.", error);
      }
      return { logged: false, error: error };
    });
  }

  function shellSingleQuote(value) {
    return String(value == null ? "" : value).replace(/'/g, "'\"'\"'");
  }

  function shellDoubleQuote(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"")
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");
  }

  function base64EncodeUtf8(value) {
    var text = String(value == null ? "" : value);
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
      return Buffer.from(text, "utf8").toString("base64");
    }
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(text)));
    }
    throw new Error("Base64 encoding is unavailable in this runtime.");
  }

  function buildBase64DecodeShellFunctionLines(errorMessage) {
    return [
      "decode_base64() {",
      "  if command -v base64 >/dev/null 2>&1; then",
      "    if printf '%s' 'WA==' | base64 --decode >/dev/null 2>&1; then",
      "      printf '%s' \"$1\" | base64 --decode",
      "      return",
      "    fi",
      "    if printf '%s' 'WA==' | base64 -D >/dev/null 2>&1; then",
      "      printf '%s' \"$1\" | base64 -D",
      "      return",
      "    fi",
      "  fi",
      "",
      "  if command -v python3 >/dev/null 2>&1; then",
      "    python3 -c 'import base64, sys; sys.stdout.write(base64.b64decode(sys.argv[1]).decode(\"utf-8\"))' \"$1\"",
      "    return",
      "  fi",
      "",
      "  echo \"" + shellDoubleQuote(String(errorMessage || "This command requires base64 or python3 to resolve the request URL.")) + "\" >&2",
      "  return 1",
      "}"
    ];
  }

  function buildAmeriFluxLoggerShellFunctionLines(options) {
    var opts = options || {};
    var curlLine = "  curl -sS -X POST \"$AMERIFLUX_LOGGER_URL\" \\";
    var failureLine = opts.logToFile
      ? "    || echo \"Warning: AmeriFlux download logging failed for ${log_filename}.\" | tee -a \"$LOGFILE\" >&2"
      : "    || echo \"Warning: AmeriFlux download logging failed for ${log_filename}.\" >&2";
    return [
      "AMERIFLUX_LOGGER_URL=\"" + shellDoubleQuote(String(opts.loggerUrl || AMERIFLUX_DOWNLOAD_LOGGER_URL)) + "\"",
      "AMERIFLUX_LOGGER_USER_ID=\"" + shellDoubleQuote(AMERIFLUX_DEFAULT_USER_ID) + "\"",
      "AMERIFLUX_LOGGER_USER_EMAIL=\"" + shellDoubleQuote(AMERIFLUX_DEFAULT_USER_EMAIL) + "\"",
      "AMERIFLUX_LOGGER_USER_NAME=\"" + shellDoubleQuote(AMERIFLUX_LOGGER_USER_NAME) + "\"",
      "AMERIFLUX_LOGGER_INTENDED_USE=\"" + shellDoubleQuote(AMERIFLUX_LOGGER_INTENDED_USE) + "\"",
      "AMERIFLUX_LOGGER_DESCRIPTION=\"" + shellDoubleQuote(AMERIFLUX_LOGGER_DESCRIPTION) + "\"",
      "",
      "log_ameriflux_download() {",
      "  log_filename=\"${1:-}\"",
      "  [ -n \"$log_filename\" ] || return 0",
      "  case \"$log_filename\" in",
      "    *.zip|*.ZIP) ;;",
      "    *) return 0 ;;",
      "  esac",
      "  case \"$log_filename\" in",
      "    *\\\"*|*\\\\*|*/*) return 0 ;;",
      "  esac",
      curlLine,
      "    -H \"Content-Type: application/json\" \\",
      "    -H \"accept: application/json\" \\",
      "    --data-binary \"{",
      "      \\\"user_id\\\": \\\"${AMERIFLUX_LOGGER_USER_ID}\\\",",
      "      \\\"user_email\\\": \\\"${AMERIFLUX_LOGGER_USER_EMAIL}\\\",",
      "      \\\"user_name\\\": \\\"${AMERIFLUX_LOGGER_USER_NAME}\\\",",
      "      \\\"zip_filenames\\\": [\\\"${log_filename}\\\"],",
      "      \\\"intended_use\\\": \\\"${AMERIFLUX_LOGGER_INTENDED_USE}\\\",",
      "      \\\"description\\\": \\\"${AMERIFLUX_LOGGER_DESCRIPTION}\\\"",
      "    }\" >/dev/null 2>&1 \\",
      failureLine,
      "}"
    ];
  }

  function buildAmeriFluxDownloadDiagnosticsShellFunctionLines() {
    return [
      "emit_ameriflux_download_message() {",
      "  if [ -n \"${LOGFILE:-}\" ]; then",
      "    echo \"$1\" | tee -a \"$LOGFILE\" >&2",
      "  else",
      "    echo \"$1\" >&2",
      "  fi",
      "}",
      "",
      "is_success_http_status() {",
      "  case \"${1:-}\" in",
      "    2??) return 0 ;;",
      "    *) return 1 ;;",
      "  esac",
      "}",
      "",
      "extract_urls() {",
      "  if command -v jq >/dev/null 2>&1; then",
      "    printf '%s' \"$1\" | jq -r '.data_urls[]?.url // empty'",
      "    return",
      "  fi",
      "",
      "  if command -v python3 >/dev/null 2>&1; then",
      "    printf '%s' \"$1\" | python3 -c '",
      "import json",
      "import sys",
      "data = json.load(sys.stdin)",
      "for item in data.get(\"data_urls\", []):",
      "    url = item.get(\"url\")",
      "    if url:",
      "        print(url)",
      "'",
      "    return",
      "  fi",
      "",
      "  echo \"This command requires jq or python3 to parse the AmeriFlux API response.\" >&2",
      "  return 1",
      "}",
      "",
      "extract_error_message() {",
      "  parsed_message=\"\"",
      "  if command -v jq >/dev/null 2>&1; then",
      "    parsed_message=\"$(printf '%s' \"$1\" | jq -r '[.error?, .message?, .detail?, .details?, .errors?, .error_description?] | map(if type == \"string\" then . elif type == \"array\" or type == \"object\" then tojson else empty end) | map(select(length > 0)) | unique | join(\"; \")' 2>/dev/null || true)\"",
      "    if [ -n \"$parsed_message\" ]; then",
      "      printf '%s' \"$parsed_message\"",
      "      return",
      "    fi",
      "  fi",
      "",
      "  if command -v python3 >/dev/null 2>&1; then",
      "    parsed_message=\"$(printf '%s' \"$1\" | python3 -c '",
      "import json",
      "import sys",
      "def stringify(value):",
      "    if isinstance(value, str):",
      "        return value",
      "    if isinstance(value, (list, dict)):",
      "        return json.dumps(value, separators=(\",\", \":\"))",
      "    return \"\"",
      "try:",
      "    data = json.load(sys.stdin)",
      "except Exception:",
      "    sys.exit(0)",
      "values = []",
      "for key in (\"error\", \"message\", \"detail\", \"details\", \"errors\", \"error_description\"):",
      "    if isinstance(data, dict) and key in data:",
      "        text = stringify(data.get(key))",
      "        if text and text not in values:",
      "            values.append(text)",
      "sys.stdout.write(\"; \".join(values))",
      "' 2>/dev/null || true)\"",
      "    if [ -n \"$parsed_message\" ]; then",
      "      printf '%s' \"$parsed_message\"",
      "      return",
      "    fi",
      "  fi",
      "}",
      "",
      "response_mentions_account_problem() {",
      "  account_text=\"$(printf '%s\\n%s' \"$(extract_error_message \"$1\" 2>/dev/null || true)\" \"$1\" | tr '[:upper:]' '[:lower:]')\"",
      "  case \"$account_text\" in",
      "    *user*|*user_id*|*username*|*account*|*unauthorized*|*invalid*|*permission*|*registered*|*email*) return 0 ;;",
      "    *) return 1 ;;",
      "  esac",
      "}",
      "",
      "print_download_request_error() {",
      "  error_site_id=\"${1:-SITE_ID_HERE}\"",
      "  error_data_product=\"${2:-FLUXNET}\"",
      "  error_http_status=\"${3:-}\"",
      "  error_response=\"${4:-}\"",
      "  api_message=\"$(extract_error_message \"$error_response\" 2>/dev/null || true)\"",
      "  if [ -n \"$error_http_status\" ] && ! is_success_http_status \"$error_http_status\"; then",
      "    emit_ameriflux_download_message \"AmeriFlux API request failed for ${error_site_id} (${error_data_product}) with HTTP ${error_http_status}.\"",
      "  else",
      "    emit_ameriflux_download_message \"No download URLs returned for ${error_site_id} (${error_data_product}).\"",
      "  fi",
      "  if [ -n \"$api_message\" ]; then",
      "    emit_ameriflux_download_message \"AmeriFlux API message: ${api_message}\"",
      "  fi",
      "  if response_mentions_account_problem \"$error_response\"; then",
      "    emit_ameriflux_download_message \"This looks like an AmeriFlux account, username, email, permission, or registration issue.\"",
      "    emit_ameriflux_download_message \"Active AmeriFlux identity: USER_ID=${USER_ID:-<unset>} USER_EMAIL=${USER_EMAIL:-<unset>}\"",
      "    emit_ameriflux_download_message \"Check AMERIFLUX_USER_ID and AMERIFLUX_USER_EMAIL, or unset them to use the Explorer defaults.\"",
      "    return 2",
      "  fi",
      "  return 0",
      "}"
    ];
  }

  function rowNetworkTokens(row) {
    var seen = {};
    var tokens = [];

    function addTokens(value) {
      normalizeNetworkTokens(value).forEach(function (token) {
        var key = String(token || "").toLowerCase();
        if (!token || seen[key]) {
          return;
        }
        seen[key] = true;
        tokens.push(token);
      });
    }

    if (Array.isArray(row && row.network_tokens)) {
      row.network_tokens.forEach(function (token) {
        addTokens(token);
      });
    }
    addTokens(row && row.network_display);
    addTokens(row && row.network);
    addTokens(row && row.source_network);
    return tokens;
  }

  function rowHasNetworkToken(row, expected) {
    var target = String(expected || "").trim().toLowerCase();
    if (!target) {
      return false;
    }
    return rowNetworkTokens(row).some(function (token) {
      return String(token || "").toLowerCase() === target;
    });
  }

  function isFluxnet2015SupplementalRow(row) {
    var sourceLabel = String(row && row.source_label || "").trim();
    var dataProduct = getApiRowDataProduct(row);
    return sourceLabel === FLUXNET2015_SOURCE_ONLY ||
      dataProduct === FLUXNET2015_PRODUCT ||
      rowHasNetworkToken(row, FLUXNET2015_SOURCE_ONLY);
  }

  function isAmeriFluxNetworkRow(row) {
    var sourceLabel = String(row && row.source_label || "").trim();
    var sourceOrigin = resolveSourceOrigin(row);
    var dataHub = String(row && row.data_hub || "").trim().toLowerCase();
    var dataProduct = getApiRowDataProduct(row);
    if (
      sourceLabel === AMERIFLUX_SOURCE_ONLY ||
      sourceLabel === AMERIFLUX_SHUTTLE ||
      sourceLabel === BASE_SOURCE_ONLY ||
      dataProduct === AMERIFLUX_BASE_PRODUCT ||
      rowHasNetworkToken(row, AMERIFLUX_SOURCE_ONLY)
    ) {
      return true;
    }
    if (isFluxnet2015SupplementalRow(row)) {
      return false;
    }
    return dataHub === "ameriflux" || sourceOrigin === AMERIFLUX_API_SOURCE_ORIGIN;
  }

  function isIcosNetworkRow(row) {
    return rowHasNetworkToken(row, ICOS_DIRECT_SOURCE_ONLY) ||
      String(row && row.source_label || "").trim() === ICOS_DIRECT_SOURCE_ONLY ||
      String(row && row.data_hub || "").trim().toLowerCase() === "icos" ||
      isIcosRow(row);
  }

  function isTernNetworkRow(row) {
    return rowHasNetworkToken(row, SOURCE_FILTER_TAG_TERN) ||
      String(row && row.source_label || "").trim() === SOURCE_FILTER_TAG_TERN ||
      String(row && row.data_hub || "").trim().toLowerCase() === "tern";
  }

  function isChinaFluxNetworkRow(row) {
    return rowHasNetworkToken(row, SOURCE_FILTER_TAG_CHINAFLUX) ||
      String(row && row.source_label || "").trim() === SOURCE_FILTER_TAG_CHINAFLUX ||
      String(row && row.data_hub || "").trim().toLowerCase() === "chinaflux";
  }

  function computeSourceFilterTags(row) {
    var tags = [];
    var seen = {};
    var shuttleAvailable = isShuttleCatalogRow(row);
    var ameriFluxNetwork = isAmeriFluxNetworkRow(row);
    var chinaFluxNetwork = isChinaFluxNetworkRow(row);
    var icosNetwork = isIcosNetworkRow(row);
    var ternNetwork = isTernNetworkRow(row);
    var fluxnet2015Supplemental = isFluxnet2015SupplementalRow(row);

    function addTag(tag) {
      if (!tag || seen[tag]) {
        return;
      }
      seen[tag] = true;
      tags.push(tag);
    }

    if (isEfdSourceRow(row)) {
      addTag(SOURCE_FILTER_TAG_EFD);
      return tags;
    }

    if (ameriFluxNetwork) {
      addTag(SOURCE_FILTER_TAG_AMERIFLUX);
      if (shuttleAvailable) {
        addTag(SOURCE_FILTER_TAG_AMERIFLUX_SHUTTLE);
      }
    }
    if (chinaFluxNetwork) {
      addTag(SOURCE_FILTER_TAG_CHINAFLUX);
    }
    if (icosNetwork) {
      addTag(SOURCE_FILTER_TAG_ICOS);
      if (shuttleAvailable) {
        addTag(SOURCE_FILTER_TAG_ICOS_SHUTTLE);
      }
    }
    if (isJapanFluxSourceRow(row)) {
      addTag(SOURCE_FILTER_TAG_JAPANFLUX);
    }
    if (ternNetwork) {
      addTag(SOURCE_FILTER_TAG_TERN);
      if (shuttleAvailable) {
        addTag(SOURCE_FILTER_TAG_TERN_SHUTTLE);
      }
    }
    if (fluxnet2015Supplemental) {
      addTag(SOURCE_FILTER_TAG_FLUXNET_2015);
    }
    if (shuttleAvailable) {
      addTag(SOURCE_FILTER_TAG_FLUXNET_SHUTTLE);
    }
    return tags;
  }

  function sourceFilterTags(row) {
    if (Array.isArray(row && row.source_filter_tags) && row.source_filter_tags.length) {
      return row.source_filter_tags.slice();
    }
    return computeSourceFilterTags(row);
  }

  function primarySourceLabel(row) {
    var explicit = String(row && (row.primarySourceLabel || row.source_provenance_filter) || "").trim();
    var shuttleAvailable;
    if (explicit) {
      return explicit;
    }
    shuttleAvailable = isShuttleCatalogRow(row);
    if (isEfdSourceRow(row)) {
      return SOURCE_FILTER_TAG_EFD;
    }
    if (isAmeriFluxNetworkRow(row)) {
      return shuttleAvailable ? SOURCE_FILTER_TAG_AMERIFLUX_SHUTTLE : SOURCE_FILTER_TAG_AMERIFLUX;
    }
    if (isChinaFluxNetworkRow(row)) {
      return SOURCE_FILTER_TAG_CHINAFLUX;
    }
    if (isIcosNetworkRow(row)) {
      return shuttleAvailable ? SOURCE_FILTER_TAG_ICOS_SHUTTLE : SOURCE_FILTER_TAG_ICOS;
    }
    if (isJapanFluxSourceRow(row)) {
      return SOURCE_FILTER_TAG_JAPANFLUX;
    }
    if (isTernNetworkRow(row)) {
      return shuttleAvailable ? SOURCE_FILTER_TAG_TERN_SHUTTLE : SOURCE_FILTER_TAG_TERN;
    }
    if (isFluxnet2015SupplementalRow(row)) {
      return SOURCE_FILTER_TAG_FLUXNET_2015;
    }
    if (shuttleAvailable) {
      return SOURCE_FILTER_TAG_FLUXNET_SHUTTLE;
    }
    return String(row && row.source_label || "").trim() || SHUTTLE_SOURCE;
  }

  function sourceFilterValue(row) {
    return primarySourceLabel(row);
  }

  function uniqueSourceFilterValues() {
    return SOURCE_FILTER_OPTIONS.slice();
  }

  function normalizeProcessingLineage(lineage) {
    var normalized = String(lineage || "").trim().toLowerCase();
    if (normalized === PROCESSING_LINEAGE_ONEFLUX) {
      return PROCESSING_LINEAGE_ONEFLUX;
    }
    if (normalized === PROCESSING_LINEAGE_OTHER || normalized === "other") {
      return PROCESSING_LINEAGE_OTHER;
    }
    return "";
  }

  function resolveProcessingLineage(fields) {
    // Prefer explicit snapshot lineage. The source/product checks below are a
    // temporary compatibility fallback for legacy payloads that predate the field.
    var explicit = normalizeProcessingLineage(fields && (fields.processingLineage || fields.processing_lineage));
    var sourceOrigin = String(fields && (fields.sourceOrigin || fields.source_origin || fields.source) || "").trim();
    var sourceLabel = String(fields && (fields.sourceLabel || fields.source_label) || "").trim();
    var dataHub = String(fields && (fields.dataHub || fields.data_hub) || "").trim();
    var dataProduct = normalizeDownloadProduct(fields && (fields.apiDataProduct || fields.api_data_product));
    var productFamily = String(fields && (fields.productFamily || fields.product_family) || "").trim().toUpperCase();
    var downloadMode = String(fields && (fields.downloadMode || fields.download_mode) || "").trim();
    if (explicit) {
      return explicit;
    }
    if (sourceOrigin === EFD_SOURCE_ORIGIN || sourceLabel === SOURCE_FILTER_TAG_EFD || dataHub === SOURCE_FILTER_TAG_EFD || downloadMode === REQUEST_PAGE_DOWNLOAD_MODE) {
      return "";
    }
    if (
      sourceOrigin === JAPANFLUX_DIRECT_SOURCE_ORIGIN ||
      sourceLabel === SOURCE_FILTER_TAG_JAPANFLUX ||
      dataHub === SOURCE_FILTER_TAG_JAPANFLUX ||
      dataProduct === AMERIFLUX_BASE_PRODUCT ||
      productFamily === PRODUCT_FAMILY_BASE ||
      productFamily === PRODUCT_FAMILY_ICOS_ETC
    ) {
      return PROCESSING_LINEAGE_OTHER;
    }
    return PROCESSING_LINEAGE_ONEFLUX;
  }

  function processingLineageForProduct(product) {
    return normalizeProcessingLineage(product && (product.processingLineage || product.processing_lineage)) ||
      resolveProcessingLineage(product || {});
  }

  function buildProductYearLookup(products, targetLineage) {
    var years = {};
    (Array.isArray(products) ? products : []).forEach(function (product) {
      if (processingLineageForProduct(product) !== targetLineage) {
        return;
      }
      normalizedExactYears(
        product && (product.exactYears || product.exact_years),
        product && (product.firstYear || product.first_year),
        product && (product.lastYear || product.last_year)
      ).forEach(function (year) {
        years[year] = true;
      });
    });
    return years;
  }

  function hasAdditionalOtherProcessedYears(products) {
    var oneFluxYears = buildProductYearLookup(products, PROCESSING_LINEAGE_ONEFLUX);
    var otherYears = buildProductYearLookup(products, PROCESSING_LINEAGE_OTHER);
    var hasOneFlux = Object.keys(oneFluxYears).length > 0;
    var hasOther = Object.keys(otherYears).length > 0;
    if (!hasOneFlux || !hasOther) {
      return false;
    }
    return Object.keys(otherYears).some(function (year) {
      return !oneFluxYears[year];
    });
  }

  function classifySurfacedProducts(products) {
    var lineages = {};
    (Array.isArray(products) ? products : []).forEach(function (product) {
      var lineage = processingLineageForProduct(product);
      if (lineage) {
        lineages[lineage] = true;
      }
    });

    if (lineages[PROCESSING_LINEAGE_ONEFLUX] && lineages[PROCESSING_LINEAGE_OTHER]) {
      return hasAdditionalOtherProcessedYears(products)
        ? SURFACED_CLASSIFICATION_FLUXNET_AND_OTHER
        : SURFACED_CLASSIFICATION_FLUXNET_PROCESSED;
    }
    if (lineages[PROCESSING_LINEAGE_ONEFLUX]) {
      return SURFACED_CLASSIFICATION_FLUXNET_PROCESSED;
    }
    if (lineages[PROCESSING_LINEAGE_OTHER]) {
      return SURFACED_CLASSIFICATION_OTHER_PROCESSED;
    }
    return "";
  }

  function availabilityFilterLabels(row) {
    var classification = String(row && row.surfacedProductClassification || "").trim();
    if (classification === SURFACED_CLASSIFICATION_FLUXNET_PROCESSED) {
      return [FILTER_LABEL_FLUXNET_PROCESSED];
    }
    if (classification === SURFACED_CLASSIFICATION_OTHER_PROCESSED) {
      return [FILTER_LABEL_OTHER_PROCESSED];
    }
    if (classification === SURFACED_CLASSIFICATION_FLUXNET_AND_OTHER) {
      return [FILTER_LABEL_FLUXNET_AND_OTHER];
    }
    return [];
  }

  function uniqueAvailabilityFilterValues(rows) {
    var available = {};
    (rows || []).forEach(function (row) {
      availabilityFilterLabels(row).forEach(function (label) {
        available[label] = true;
      });
    });
    return [
      FILTER_LABEL_FLUXNET_PROCESSED,
      FILTER_LABEL_OTHER_PROCESSED,
      FILTER_LABEL_FLUXNET_AND_OTHER
    ].filter(function (label) {
      return !!available[label];
    });
  }

  function hasFluxnetAvailability(row) {
    var classification = String(row && row.surfacedProductClassification || "").trim();
    if (typeof (row && row.hasFluxnetAvailable) === "boolean") {
      return row.hasFluxnetAvailable;
    }
    return classification === SURFACED_CLASSIFICATION_FLUXNET_PROCESSED ||
      classification === SURFACED_CLASSIFICATION_FLUXNET_AND_OTHER;
  }

  function availabilityFilterMatches(row, selectedAvailability) {
    var selected = String(selectedAvailability || "").trim();
    if (!selected) {
      return true;
    }
    if (selected === FILTER_LABEL_FLUXNET_PROCESSED) {
      return hasFluxnetAvailability(row);
    }
    return availabilityFilterLabels(row).indexOf(selected) !== -1;
  }

  function normalizeFilterSelection(value) {
    var seen = {};
    var values = [];
    var addValue = function (item) {
      var normalized = String(item == null ? "" : item).trim();
      if (!normalized || seen[normalized]) {
        return;
      }
      seen[normalized] = true;
      values.push(normalized);
    };
    if (Array.isArray(value)) {
      value.forEach(addValue);
      return values;
    }
    if (value && typeof value === "object") {
      Object.keys(value).forEach(function (key) {
        if (value[key]) {
          addValue(key);
        }
      });
      return values;
    }
    addValue(value);
    return values;
  }

  function filterSelectionHasValues(value) {
    return normalizeFilterSelection(value).length > 0;
  }

  function filterSelectionMatches(value, matcher) {
    var selected = normalizeFilterSelection(value);
    if (!selected.length) {
      return true;
    }
    return selected.some(matcher);
  }

  function pruneFilterSelection(value, allowedValues) {
    var allowed = {};
    (allowedValues || []).forEach(function (allowedValue) {
      allowed[String(allowedValue)] = true;
    });
    return normalizeFilterSelection(value).filter(function (selectedValue) {
      return !!allowed[selectedValue];
    });
  }

  function filterSelectionLabel(value, options, allLabel, pluralLabel) {
    var selected = normalizeFilterSelection(value);
    var labelsByValue = {};
    var labels;
    (options || []).forEach(function (option) {
      if (!option) {
        return;
      }
      if (typeof option === "object") {
        labelsByValue[String(option.value)] = String(option.label || option.value || "");
      } else {
        labelsByValue[String(option)] = String(option);
      }
    });
    if (!selected.length) {
      return allLabel;
    }
    labels = selected.map(function (selectedValue) {
      return labelsByValue[selectedValue] || selectedValue;
    });
    if (labels.length <= 2) {
      return labels.join(", ");
    }
    return labels.length + " " + pluralLabel;
  }

  function normalizeMinimumYearsValue(value, maxValue) {
    var maximum = parseIntOrNull(maxValue);
    var normalized = parseIntOrNull(value);
    if (maximum != null && maximum < DEFAULT_MINIMUM_YEARS_FILTER) {
      maximum = DEFAULT_MINIMUM_YEARS_FILTER;
    }
    if (normalized == null || normalized < DEFAULT_MINIMUM_YEARS_FILTER) {
      normalized = DEFAULT_MINIMUM_YEARS_FILTER;
    }
    if (maximum != null && normalized > maximum) {
      normalized = maximum;
    }
    return normalized;
  }

  function siteAvailableYears(row) {
    var cachedYears;
    var surfacedYears;
    if (!row || typeof row !== "object") {
      return [];
    }
    cachedYears = Array.isArray(row.available_years) ? row.available_years.slice() : [];
    if (cachedYears.length) {
      return cachedYears;
    }
    surfacedYears = buildSurfacedYearUnion(
      Array.isArray(row.surfacedProducts) && row.surfacedProducts.length
        ? row.surfacedProducts
        : getSurfacedProductsForRow(row)
    );
    if (surfacedYears.length) {
      return surfacedYears;
    }
    return normalizedExactYears(row.publish_years, row.first_year, row.last_year);
  }

  function siteAvailableYearCount(row) {
    var cachedCount = parseIntOrNull(row && row.available_year_count);
    if (cachedCount != null && cachedCount >= 0) {
      return cachedCount;
    }
    return siteAvailableYears(row).length;
  }

  function maxSiteAvailableYearCount(rows) {
    return Math.max(
      DEFAULT_MINIMUM_YEARS_FILTER,
      (Array.isArray(rows) ? rows : []).reduce(function (maxValue, row) {
        return Math.max(maxValue, siteAvailableYearCount(row));
      }, 0)
    );
  }

  function maxPlausibleDataYear() {
    var currentYear = new Date().getFullYear();
    return currentYear + MAX_FUTURE_DATA_YEAR_BUFFER;
  }

  function normalizeCoverageYear(value) {
    var year = parseIntOrNull(value);
    if (year == null || year < MIN_PLAUSIBLE_DATA_YEAR || year > maxPlausibleDataYear()) {
      return null;
    }
    return year;
  }

  function normalizeCoverageYears(values) {
    var seen = {};
    var years = [];
    normalizePublishYears(values).forEach(function (year) {
      var normalized = normalizeCoverageYear(year);
      if (normalized == null || seen[normalized]) {
        return;
      }
      seen[normalized] = true;
      years.push(normalized);
    });
    years.sort(function (a, b) {
      return a - b;
    });
    return years;
  }

  function normalizeYearInterval(startValue, endValue) {
    var start = normalizeCoverageYear(startValue);
    var end = normalizeCoverageYear(endValue);
    if (start == null || end == null || end < start) {
      return null;
    }
    return { start: start, end: end };
  }

  function contiguousYearIntervals(years) {
    var normalizedYears = normalizeCoverageYears(years);
    var intervals = [];
    var rangeStart;
    var previousYear;
    if (!normalizedYears.length) {
      return intervals;
    }
    rangeStart = normalizedYears[0];
    previousYear = normalizedYears[0];
    normalizedYears.slice(1).forEach(function (year) {
      if (year === previousYear + 1) {
        previousYear = year;
        return;
      }
      intervals.push({ start: rangeStart, end: previousYear });
      rangeStart = year;
      previousYear = year;
    });
    intervals.push({ start: rangeStart, end: previousYear });
    return intervals;
  }

  function yearLabelIntervals(value) {
    var text = String(value == null ? "" : value);
    var intervals = [];
    var rangeRe = /\b((?:19|20)\d{2})\b\s*(?:-|–|—|\bto\b)\s*\b((?:19|20)\d{2})\b/g;
    var match;
    var exactYears;
    var interval;
    while ((match = rangeRe.exec(text))) {
      interval = normalizeYearInterval(match[1], match[2]);
      if (interval) {
        intervals.push(interval);
      }
    }
    if (intervals.length) {
      return intervals;
    }
    exactYears = normalizeCoverageYears(text);
    return exactYears.length ? contiguousYearIntervals(exactYears) : [];
  }

  function firstNonEmptyYearSource() {
    var i;
    var years;
    for (i = 0; i < arguments.length; i += 1) {
      years = normalizeCoverageYears(arguments[i]);
      if (years.length) {
        return years;
      }
    }
    return [];
  }

  function productAvailableYearIntervals(product) {
    var exactYears = firstNonEmptyYearSource(
      product && (product.exactYears || product.exact_years),
      product && product.publish_years
    );
    var interval;
    var labelIntervals;
    if (exactYears.length) {
      return contiguousYearIntervals(exactYears);
    }
    interval = normalizeYearInterval(
      product && (product.firstYear || product.first_year),
      product && (product.lastYear || product.last_year)
    );
    if (interval) {
      return [interval];
    }
    labelIntervals = yearLabelIntervals(product && (product.coverageLabel || product.coverage_label || product.years));
    return labelIntervals.length ? labelIntervals : [];
  }

  function siteAvailableYearIntervals(row) {
    var products;
    var intervals = [];
    var exactYears;
    var interval;
    if (!row || typeof row !== "object") {
      return intervals;
    }
    products = Array.isArray(row.surfacedProducts) && row.surfacedProducts.length
      ? row.surfacedProducts
      : getSurfacedProductsForRow(row);
    if (products.length) {
      products.forEach(function (product) {
        intervals = intervals.concat(productAvailableYearIntervals(product));
      });
      if (intervals.length) {
        return intervals;
      }
    }
    exactYears = firstNonEmptyYearSource(row.available_years, row.publish_years, row.efd_policy_years);
    if (exactYears.length) {
      return contiguousYearIntervals(exactYears);
    }
    intervals = yearLabelIntervals(row.years);
    if (intervals.length) {
      return intervals;
    }
    interval = normalizeYearInterval(row.first_year, row.last_year);
    return interval ? [interval] : [];
  }

  function availableYearRangeBounds(rows) {
    var minYear = null;
    var maxYear = null;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      siteAvailableYearIntervals(row).forEach(function (interval) {
        if (minYear == null || interval.start < minYear) {
          minYear = interval.start;
        }
        if (maxYear == null || interval.end > maxYear) {
          maxYear = interval.end;
        }
      });
    });
    return {
      start: minYear,
      end: maxYear,
      hasBounds: minYear != null && maxYear != null && maxYear >= minYear
    };
  }

  function normalizeYearRangeFilter(yearRange, bounds) {
    var boundsStart = normalizeCoverageYear(bounds && bounds.start);
    var boundsEnd = normalizeCoverageYear(bounds && bounds.end);
    var normalizedBounds = boundsStart != null && boundsEnd != null && boundsEnd >= boundsStart
      ? { start: boundsStart, end: boundsEnd, hasBounds: true }
      : availableYearRangeBounds([]);
    var start;
    var end;
    if (!normalizedBounds.hasBounds) {
      return {
        start: null,
        end: null,
        bounds: normalizedBounds,
        hasBounds: false,
        isDefault: true
      };
    }
    start = normalizeCoverageYear(yearRange && yearRange.start);
    end = normalizeCoverageYear(yearRange && yearRange.end);
    if (start == null) {
      start = normalizedBounds.start;
    }
    if (end == null) {
      end = normalizedBounds.end;
    }
    start = Math.max(normalizedBounds.start, Math.min(start, normalizedBounds.end));
    end = Math.max(normalizedBounds.start, Math.min(end, normalizedBounds.end));
    if (start > end) {
      var swapped = start;
      start = end;
      end = swapped;
    }
    return {
      start: start,
      end: end,
      bounds: normalizedBounds,
      hasBounds: true,
      isDefault: start === normalizedBounds.start && end === normalizedBounds.end
    };
  }

  function yearIntervalsOverlap(interval, range) {
    return !!interval && !!range && interval.start <= range.end && interval.end >= range.start;
  }

  function yearRangeFilterMatches(row, yearRange, bounds) {
    var normalized = normalizeYearRangeFilter(yearRange, bounds);
    var intervals;
    if (!normalized.hasBounds || normalized.isDefault) {
      return true;
    }
    intervals = siteAvailableYearIntervals(row);
    if (!intervals.length) {
      return false;
    }
    return intervals.some(function (interval) {
      return yearIntervalsOverlap(interval, normalized);
    });
  }

  function minimumYearsFilterMatches(row, minimumYears) {
    var threshold = normalizeMinimumYearsValue(minimumYears);
    var availableYears = siteAvailableYearCount(row);
    if (availableYears > 0) {
      return availableYears >= threshold;
    }
    return threshold <= DEFAULT_MINIMUM_YEARS_FILTER;
  }

  function rowMatchesExplorerFilters(row, filters) {
    var opts = filters || {};
    var search = String(opts.search || "").trim().toLowerCase();
    var selectedNetwork = opts.selectedNetworks != null ? opts.selectedNetworks : opts.selectedNetwork;
    var selectedSource = opts.selectedSources != null ? opts.selectedSources : opts.selectedSource;
    var selectedAvailability = opts.selectedAvailabilities != null ? opts.selectedAvailabilities : opts.selectedAvailability;
    var selectedCountry = opts.selectedCountries != null ? opts.selectedCountries : opts.selectedCountry;
    var selectedVegetation = opts.selectedVegetations != null ? opts.selectedVegetations : opts.selectedVegetation;
    var minimumYears = opts.minimumYears;
    var yearRange = opts.yearRange || { start: opts.yearRangeStart, end: opts.yearRangeEnd };
    var yearRangeBounds = opts.yearRangeBounds;

    if (search && String(row && row.search_text || "").indexOf(search) === -1) {
      return false;
    }
    if (!filterSelectionMatches(selectedNetwork, function (network) {
      return !!row && row.network_tokens.indexOf(network) !== -1;
    })) {
      return false;
    }
    if (!filterSelectionMatches(selectedSource, function (source) {
      return sourceFilterTags(row).indexOf(source) !== -1;
    })) {
      return false;
    }
    if (!filterSelectionMatches(selectedAvailability, function (availability) {
      return availabilityFilterMatches(row, availability);
    })) {
      return false;
    }
    if (!filterSelectionMatches(selectedCountry, function (country) {
      return String(row && row.country || "") === country;
    })) {
      return false;
    }
    if (!filterSelectionMatches(selectedVegetation, function (vegetation) {
      return String(row && row.vegetation_type || "") === vegetation;
    })) {
      return false;
    }
    if (!minimumYearsFilterMatches(row, minimumYears)) {
      return false;
    }
    if (!yearRangeFilterMatches(row, yearRange, yearRangeBounds)) {
      return false;
    }
    return true;
  }

  function uniqueVegetationFilterValues(rows) {
    var seen = {};
    var values = [];
    (rows || []).forEach(function (row) {
      var value = String(row && row.vegetation_type || "").trim();
      if (!value || seen[value]) {
        return;
      }
      seen[value] = true;
      values.push(value);
    });
    return values.sort();
  }

  function buildVegetationFilterOptions(rows) {
    return uniqueVegetationFilterValues(rows)
      .map(function (vegetationType) {
        return {
          value: vegetationType,
          label: vegetationDisplayLabel(vegetationType)
        };
      })
      .sort(function (a, b) {
        var byLabel = a.label.localeCompare(b.label);
        return byLabel || a.value.localeCompare(b.value);
      });
  }

  function getApiRowDataProduct(row) {
    var value = String(row && row.api_data_product || "").trim().toUpperCase();
    if (value === AMERIFLUX_BASE_PRODUCT || value === PRODUCT_FAMILY_BASE) {
      return AMERIFLUX_BASE_PRODUCT;
    }
    if (value === FLUXNET2015_PRODUCT) {
      return FLUXNET2015_PRODUCT;
    }
    return AMERIFLUX_FLUXNET_PRODUCT;
  }

  function apiProductDisplayName(dataProduct) {
    var normalized = normalizeDownloadProduct(dataProduct);
    if (normalized === AMERIFLUX_BASE_PRODUCT) {
      return BASE_SOURCE_ONLY;
    }
    if (normalized === FLUXNET2015_PRODUCT) {
      return FLUXNET2015_SOURCE_ONLY;
    }
    return PRODUCT_FAMILY_FLUXNET;
  }

  function productFamilyDisplayName(productFamily, useLongLabel) {
    var family = normalizeProductFamily(productFamily);
    if (family === PRODUCT_FAMILY_BASE) {
      return useLongLabel ? "BASE (standardized observations)" : PRODUCT_FAMILY_BASE;
    }
    if (family === PRODUCT_FAMILY_ICOS_ETC) {
      return useLongLabel ? "ICOS ETC L2 archive" : "ICOS ETC";
    }
    return useLongLabel ? "FLUXNET (ONEFlux-derived)" : PRODUCT_FAMILY_FLUXNET;
  }

  function surfacedProductDisplayName(product, useLongLabel) {
    if (String(product && product.sourceLabel || "").trim() === SOURCE_FILTER_TAG_JAPANFLUX ||
      String(product && product.source_label || "").trim() === SOURCE_FILTER_TAG_JAPANFLUX ||
      String(product && product.sourceOrigin || product && product.source_origin || "").trim() === JAPANFLUX_DIRECT_SOURCE_ORIGIN) {
      return useLongLabel ? "JapanFlux2024" : SOURCE_FILTER_TAG_JAPANFLUX;
    }
    return productFamilyDisplayName(product && product.productFamily, useLongLabel);
  }

  function getApiActionCopyLabel(dataProduct) {
    return "Copy " + apiProductDisplayName(dataProduct) + " curl command";
  }

  function getApiActionRequestLabel(dataProduct) {
    return "Request " + apiProductDisplayName(dataProduct) + " URL";
  }

  function getApiActionPreparingLabel(dataProduct, canDirectDownload) {
    var productName = apiProductDisplayName(dataProduct);
    return canDirectDownload
      ? ("Requesting " + productName + " URL…")
      : ("Preparing " + productName + " command…");
  }

  function normalizeDownloadProduct(dataProduct) {
    var normalized = String(dataProduct || "").trim().toUpperCase();
    if (normalized === FLUXNET2015_PRODUCT) {
      return FLUXNET2015_PRODUCT;
    }
    if (normalized === AMERIFLUX_BASE_PRODUCT || normalized === PRODUCT_FAMILY_BASE || normalized === BASE_SOURCE_ONLY) {
      return AMERIFLUX_BASE_PRODUCT;
    }
    return AMERIFLUX_FLUXNET_PRODUCT;
  }

  // AmeriFlux request routing varies by product.
  function getDownloadEndpointForProduct(dataProduct) {
    return normalizeDownloadProduct(dataProduct) === FLUXNET2015_PRODUCT
      ? AMERIFLUX_V1_DOWNLOAD_URL
      : AMERIFLUX_V2_DOWNLOAD_URL;
  }

  function buildAmeriFluxDownloadDescription(dataProduct, siteIds) {
    var product = normalizeDownloadProduct(dataProduct);
    var sites = Array.isArray(siteIds) ? siteIds.filter(Boolean) : [];
    var siteLabel = sites.length ? sites.join(", ") : "SITE_ID_HERE";
    return "Request " + product + " download for " + siteLabel + " via the Q.E.D. Lab FLUXNET Data Explorer for Keenan Group research workflows.";
  }

  function buildV2DownloadPayload(siteIds, variant, policy, identity, dataProduct) {
    var sites = Array.isArray(siteIds) ? siteIds.filter(Boolean) : [];
    var product = normalizeDownloadProduct(dataProduct);
    return {
      user_id: String(identity && identity.user_id || "").trim(),
      user_email: String(identity && identity.user_email || "").trim(),
      data_policy: String(policy || AMERIFLUX_DEFAULT_POLICY),
      data_product: product,
      data_variant: String(variant || AMERIFLUX_DEFAULT_VARIANT),
      site_ids: sites,
      intended_use: AMERIFLUX_V2_INTENDED_USE,
      description: buildAmeriFluxDownloadDescription(product, sites)
    };
  }

  function buildV1DownloadPayload(siteIds, variant, policy, identity, dataProduct) {
    var sites = Array.isArray(siteIds) ? siteIds.filter(Boolean) : [];
    var product = normalizeDownloadProduct(dataProduct);
    return {
      user_id: String(identity && identity.user_id || "").trim(),
      user_email: String(identity && identity.user_email || "").trim(),
      data_product: product,
      data_variant: String(variant || AMERIFLUX_DEFAULT_VARIANT),
      data_policy: String(policy || AMERIFLUX_DEFAULT_POLICY),
      site_ids: sites,
      intended_use: AMERIFLUX_V1_INTENDED_USE,
      description: "Download " + product + " for " + sites.join(", "),
      agree_policy: true
    };
  }

  function buildDownloadPayloadForProduct(siteIds, variant, policy, identity, dataProduct) {
    return normalizeDownloadProduct(dataProduct) === FLUXNET2015_PRODUCT
      ? buildV1DownloadPayload(siteIds, variant, policy, identity, dataProduct)
      : buildV2DownloadPayload(siteIds, variant, policy, identity, dataProduct);
  }

  function buildAmeriFluxCurlCommand(siteId, variant, policy, endpointUrl, dataProduct, identityOverride) {
    var site = String(siteId || "").trim();
    var product = normalizeDownloadProduct(dataProduct);
    var requestUrl = String(endpointUrl || getDownloadEndpointForProduct(product));
    var resolvedIdentity = resolveAmeriFluxIdentityOverride(identityOverride);
    var payload = buildDownloadPayloadForProduct(
      [site || "SITE_ID_HERE"],
      variant,
      policy,
      resolvedIdentity
        ? {
          user_id: resolvedIdentity.user_id,
          user_email: resolvedIdentity.user_email
        }
        : {
          user_id: AMERIFLUX_TEMPLATE_USER_ID,
          user_email: AMERIFLUX_TEMPLATE_USER_EMAIL
        },
      product
    );
    var payloadJson = JSON.stringify(payload, null, 2);
    var commandLines = buildAmeriFluxLoggerShellFunctionLines();
    commandLines.push("");
    commandLines = commandLines.concat(buildAmeriFluxDownloadDiagnosticsShellFunctionLines());
    commandLines.push("");
    if (product === FLUXNET2015_PRODUCT) {
      commandLines = commandLines.concat(buildBase64DecodeShellFunctionLines("This command requires base64 or python3 to resolve the AmeriFlux request URL."));
      commandLines.push("");
      commandLines.push("REQUEST_URL_B64=\"" + shellDoubleQuote(base64EncodeUtf8(requestUrl)) + "\"");
      commandLines.push("REQUEST_URL=\"$(decode_base64 \"$REQUEST_URL_B64\" 2>/dev/null || true)\"");
    } else {
      commandLines.push("REQUEST_URL=\"" + shellDoubleQuote(requestUrl) + "\"");
    }
    commandLines = commandLines.concat([
      "USER_ID=\"" + shellDoubleQuote(String(payload.user_id || "")) + "\"",
      "USER_EMAIL=\"" + shellDoubleQuote(String(payload.user_email || "")) + "\"",
      "DATA_PRODUCT=\"" + shellDoubleQuote(product) + "\"",
      "SITE_ID=\"" + shellDoubleQuote(site || "SITE_ID_HERE") + "\"",
      "REQUEST_BODY='" + shellSingleQuote(payloadJson) + "'",
      "if [ -z \"$REQUEST_URL\" ]; then",
      "  emit_ameriflux_download_message \"Failed to resolve request URL for ${SITE_ID} (${DATA_PRODUCT}).\"",
      "else",
      "RESPONSE_FILE=\"$(mktemp \"${TMPDIR:-/tmp}/ameriflux_response.XXXXXX\" 2>/dev/null || true)\"",
      "if [ -z \"$RESPONSE_FILE\" ]; then",
      "  emit_ameriflux_download_message \"Could not create a temporary response file for ${SITE_ID} (${DATA_PRODUCT}).\"",
      "else",
      "  if HTTP_STATUS=\"$(curl -sS -w \"%{http_code}\" -o \"$RESPONSE_FILE\" -X POST \"$REQUEST_URL\" \\",
      "    -H \"Content-Type: application/json\" \\",
      "    -H \"accept: application/json\" \\",
      "    --data-binary \"$REQUEST_BODY\")\"; then",
      "    RESPONSE=\"$(cat \"$RESPONSE_FILE\")\"",
      "    printf '%s' \"$RESPONSE\" > download_response.json",
      "    if ! is_success_http_status \"$HTTP_STATUS\"; then",
      "      print_download_request_error \"$SITE_ID\" \"$DATA_PRODUCT\" \"$HTTP_STATUS\" \"$RESPONSE\" || true",
      "    else",
      "      URLS=\"$(extract_urls \"$RESPONSE\" 2>/dev/null || true)\"",
      "      if [ -z \"$URLS\" ]; then",
      "        print_download_request_error \"$SITE_ID\" \"$DATA_PRODUCT\" \"$HTTP_STATUS\" \"$RESPONSE\" || true",
      "      else",
      "        printf '%s\\n' \"$URLS\" | while read -r url; do",
      "          [ -n \"$url\" ] || continue",
      "          clean_url=\"${url%%\\?*}\"",
      "          filename=\"$(basename \"$clean_url\")\"",
      "          log_ameriflux_download \"$filename\"",
      "          curl -L \"$url\" -o \"$filename\"",
      "        done",
      "      fi",
      "    fi",
      "  else",
      "    emit_ameriflux_download_message \"Request failed for ${SITE_ID} (${DATA_PRODUCT}); check connectivity and the AmeriFlux API endpoint.\"",
      "  fi",
      "  rm -f \"$RESPONSE_FILE\"",
      "fi",
      "fi"
    ]);
    return commandLines.join("\n");
  }

  function uniqueSiteIdsFromRows(rows) {
    var seen = {};
    var siteIds = [];
    (rows || []).forEach(function (row) {
      var siteId = String(row && row.site_id || "").trim();
      if (!siteId || seen[siteId]) {
        return;
      }
      seen[siteId] = true;
      siteIds.push(siteId);
    });
    return siteIds;
  }

  function selectedSiteIdsText(siteIds) {
    var ids = Array.isArray(siteIds) ? siteIds.filter(Boolean) : [];
    return ids.join("\n") + "\n";
  }

  function normalizeAmeriFluxBulkEntries(entries) {
    var seen = {};
    var out = [];
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      var siteId;
      var dataProduct;
      var sourceLabel;
      var dedupeKey;
      if (typeof entry === "string") {
        siteId = String(entry || "").trim();
        dataProduct = AMERIFLUX_FLUXNET_PRODUCT;
        sourceLabel = AMERIFLUX_SOURCE_ONLY;
      } else {
        siteId = String(entry && (entry.site_id || entry.siteId) || "").trim();
        dataProduct = String(entry && (entry.data_product || entry.dataProduct || entry.api_data_product || entry.apiDataProduct) || AMERIFLUX_FLUXNET_PRODUCT).trim().toUpperCase();
        sourceLabel = String(entry && (entry.source_label || entry.sourceLabel) || "").trim();
      }
      if (!siteId) {
        return;
      }
      if (dataProduct !== FLUXNET2015_PRODUCT && dataProduct !== AMERIFLUX_BASE_PRODUCT) {
        dataProduct = AMERIFLUX_FLUXNET_PRODUCT;
      }
      if (!sourceLabel) {
        sourceLabel = dataProduct === FLUXNET2015_PRODUCT
          ? FLUXNET2015_SOURCE_ONLY
          : (dataProduct === AMERIFLUX_BASE_PRODUCT ? BASE_SOURCE_ONLY : AMERIFLUX_SOURCE_ONLY);
      }
      dedupeKey = siteId + "|" + dataProduct;
      if (seen[dedupeKey]) {
        return;
      }
      seen[dedupeKey] = true;
      out.push({
        site_id: siteId,
        data_product: dataProduct,
        source_label: sourceLabel
      });
    });
    return out;
  }

  function buildAmeriFluxSelectedSitesText(entries) {
    var normalized = normalizeAmeriFluxBulkEntries(entries);
    var lines = ["# site_id\tdata_product\tsource_label"];
    if (!normalized.length) {
      lines.push("# AR-Bal\tFLUXNET\tAmeriFlux");
    } else {
      normalized.forEach(function (entry) {
        lines.push([
          String(entry.site_id || ""),
          String(entry.data_product || AMERIFLUX_FLUXNET_PRODUCT),
          String(entry.source_label || "")
        ].join("\t"));
      });
    }
    return lines.join("\n") + "\n";
  }

  function buildManualActionProduct(row) {
    if (!row) {
      return null;
    }
    return {
      displayLabel: String(row.source_label || row.data_hub || "Request").trim() || "Request",
      downloadMode: String(row.download_mode || "").trim(),
      download_mode: String(row.download_mode || "").trim(),
      downloadLink: String(row.download_link || "").trim(),
      download_link: String(row.download_link || "").trim(),
      sourceLabel: String(row.source_label || "").trim(),
      source_label: String(row.source_label || "").trim(),
      sourceOrigin: resolveSourceOrigin(row),
      source_origin: resolveSourceOrigin(row),
      sourceReason: String(row.source_reason || "").trim(),
      source_reason: String(row.source_reason || "").trim(),
      siteId: String(row.site_id || "").trim(),
      site_id: String(row.site_id || "").trim(),
      coverageLabel: String(row.years || "").trim(),
      years: String(row.years || "").trim()
    };
  }

  function getRowActionProducts(row) {
    var products = getSurfacedProductsForRow(row);
    if (products.length) {
      return products;
    }
    if (row && String(row.download_mode || "").trim() && String(row.download_mode || "").trim() !== "direct") {
      return [buildManualActionProduct(row)].filter(Boolean);
    }
    return [];
  }

  function flattenActionProducts(rows) {
    var products = [];
    (rows || []).forEach(function (row) {
      getRowActionProducts(row).forEach(function (product) {
        products.push(Object.assign({}, product, {
          parentSelectionKey: String(row && row._selection_key || "")
        }));
      });
    });
    return products;
  }

  function partitionRowsByBulkSource(rows) {
    var shuttleRows = [];
    var shuttleDownloadRows = [];
    var manualLandingPageRows = [];
    var requestOnlyRows = [];
    var ameriFluxRows = [];
    flattenActionProducts(rows).forEach(function (product) {
      if (product.download_mode === "ameriflux_api") {
        ameriFluxRows.push(product);
        return;
      }
      if (product.download_mode === REQUEST_PAGE_DOWNLOAD_MODE) {
        requestOnlyRows.push(product);
        return;
      }
      if (product.download_mode === LANDING_PAGE_DOWNLOAD_MODE) {
        manualLandingPageRows.push(product);
        shuttleRows.push(product);
        return;
      }
      shuttleDownloadRows.push(product);
      shuttleRows.push(product);
    });
    return {
      shuttleRows: shuttleRows,
      shuttleDownloadRows: shuttleDownloadRows,
      manualLandingPageRows: manualLandingPageRows,
      requestOnlyRows: requestOnlyRows,
      ameriFluxRows: ameriFluxRows
    };
  }

  function summarizeBulkSelection(rows) {
    var partition = partitionRowsByBulkSource(rows);
    var shuttleCount = uniqueSiteIdsFromRows(partition.shuttleRows).length;
    var shuttleDownloadCount = uniqueSiteIdsFromRows(partition.shuttleDownloadRows).length;
    var manualLandingPageCount = uniqueSiteIdsFromRows(partition.manualLandingPageRows).length;
    var requestOnlyCount = uniqueSiteIdsFromRows(partition.requestOnlyRows).length;
    var ameriFluxCount = uniqueSiteIdsFromRows(partition.ameriFluxRows).length;
    return {
      shuttleRows: partition.shuttleRows,
      shuttleDownloadRows: partition.shuttleDownloadRows,
      manualLandingPageRows: partition.manualLandingPageRows,
      requestOnlyRows: partition.requestOnlyRows,
      ameriFluxRows: partition.ameriFluxRows,
      shuttleCount: shuttleCount,
      shuttleDownloadCount: shuttleDownloadCount,
      manualLandingPageCount: manualLandingPageCount,
      requestOnlyCount: requestOnlyCount,
      ameriFluxCount: ameriFluxCount,
      showAllSelectedActions: shuttleDownloadCount > 0 || ameriFluxCount > 0,
      showShuttleSection: shuttleCount > 0,
      showAmeriFluxSection: ameriFluxCount > 0
    };
  }

  function buildAmeriFluxBulkScriptText(siteEntries, options) {
    var opts = options || {};
    var entries = normalizeAmeriFluxBulkEntries(siteEntries);
    var embeddedSites = buildAmeriFluxSelectedSitesText(entries).replace(/\n$/, "");
    var defaultUserId = shellDoubleQuote(String(opts.defaultUserId || AMERIFLUX_BULK_FALLBACK_USER_ID));
    var defaultUserEmail = shellDoubleQuote(String(opts.defaultUserEmail || AMERIFLUX_BULK_FALLBACK_USER_EMAIL));
    var v2DownloadUrl = shellDoubleQuote(String(opts.v2DownloadUrl || AMERIFLUX_V2_DOWNLOAD_URL));
    var fluxnet2015RequestUrlB64 = shellDoubleQuote(base64EncodeUtf8(String(opts.v1DownloadUrl || AMERIFLUX_V1_DOWNLOAD_URL)));
    var variant = shellDoubleQuote(String(opts.variant || AMERIFLUX_DEFAULT_VARIANT));
    var policy = shellDoubleQuote(String(opts.policy || AMERIFLUX_DEFAULT_POLICY));
    var v2IntendedUse = shellDoubleQuote(String(opts.v2IntendedUse || AMERIFLUX_V2_INTENDED_USE));
    var v1IntendedUse = shellDoubleQuote(String(opts.v1IntendedUse || AMERIFLUX_V1_INTENDED_USE));

    return [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      "OUTDIR=\"${1:-ameriflux_downloads}\"",
      "SITES_FILE=\"${2:-ameriflux_selected_sites.txt}\"",
      "LOGFILE=\"${3:-ameriflux_bulk_download.log}\"",
      "USER_ID=\"${AMERIFLUX_USER_ID:-" + defaultUserId + "}\"",
      "USER_EMAIL=\"${AMERIFLUX_USER_EMAIL:-" + defaultUserEmail + "}\"",
      "V2_DOWNLOAD_URL=\"${AMERIFLUX_V2_DOWNLOAD_URL:-" + v2DownloadUrl + "}\"",
      "FLUXNET2015_REQUEST_URL_B64=\"${AMERIFLUX_FLUXNET2015_REQUEST_URL_B64:-" + fluxnet2015RequestUrlB64 + "}\"",
      ""
    ].concat(buildAmeriFluxLoggerShellFunctionLines({ logToFile: true }), [
      "",
      "mkdir -p \"$OUTDIR\"",
      "cd \"$OUTDIR\"",
      ": > \"$LOGFILE\"",
      "",
      "decode_base64() {",
      "  if command -v base64 >/dev/null 2>&1; then",
      "    if printf '%s' 'WA==' | base64 --decode >/dev/null 2>&1; then",
      "      printf '%s' \"$1\" | base64 --decode",
      "      return",
      "    fi",
      "    if printf '%s' 'WA==' | base64 -D >/dev/null 2>&1; then",
      "      printf '%s' \"$1\" | base64 -D",
      "      return",
      "    fi",
      "  fi",
      "",
      "  if command -v python3 >/dev/null 2>&1; then",
      "    python3 -c 'import base64, sys; sys.stdout.write(base64.b64decode(sys.argv[1]).decode(\"utf-8\"))' \"$1\"",
      "    return",
      "  fi",
      "",
      "  echo \"This script requires base64 or python3 to resolve the AmeriFlux request URL.\" >&2",
      "  return 1",
      "}",
      "",
      "resolve_request_url() {",
      "  local data_product",
      "  data_product=\"${1:-}\"",
      "  if [ \"$data_product\" = \"" + FLUXNET2015_PRODUCT + "\" ]; then",
      "    if [ -n \"${AMERIFLUX_V1_DOWNLOAD_URL:-}\" ]; then",
      "      printf '%s' \"$AMERIFLUX_V1_DOWNLOAD_URL\"",
      "      return",
      "    fi",
      "    decode_base64 \"$FLUXNET2015_REQUEST_URL_B64\"",
      "    return",
      "  fi",
      "  printf '%s' \"$V2_DOWNLOAD_URL\"",
      "}",
      "",
      "print_jq_install_guidance() {",
      "  local kernel distro",
      "  kernel=\"$(uname -s 2>/dev/null || printf '')\"",
      "  case \"$kernel\" in",
      "    Darwin)",
      "      echo \"macOS: brew install jq\" >&2",
      "      return",
      "      ;;",
      "    MINGW*|MSYS*|CYGWIN*)",
      "      echo \"Windows shells:\" >&2",
      "      echo \"  choco install jq\" >&2",
      "      echo \"  scoop install jq\" >&2",
      "      echo \"  winget install jqlang.jq\" >&2",
      "      return",
      "      ;;",
      "    Linux)",
      "      distro=\"\"",
      "      if [ -r /etc/os-release ]; then",
      "        distro=\"$(. /etc/os-release && printf '%s' \"${ID:-}\")\"",
      "      fi",
      "      case \"$distro\" in",
      "        debian|ubuntu)",
      "          echo \"Debian/Ubuntu: sudo apt-get install jq\" >&2",
      "          return",
      "          ;;",
      "        fedora|rhel)",
      "          echo \"Fedora/RHEL: sudo dnf install jq\" >&2",
      "          return",
      "          ;;",
      "        arch)",
      "          echo \"Arch: sudo pacman -S jq\" >&2",
      "          return",
      "          ;;",
      "      esac",
      "      ;;",
      "  esac",
      "  echo \"See https://jqlang.github.io/jq/download/\" >&2",
      "}",
      ""
    ].concat(buildAmeriFluxDownloadDiagnosticsShellFunctionLines(), [
      "",
      "if ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then",
      "  echo \"This script requires jq or python3 to parse the AmeriFlux API response.\" >&2",
      "  print_jq_install_guidance",
      "  exit 1",
      "fi",
      "",
      "if [ ! -f \"$SITES_FILE\" ]; then",
      "  cat > \"$SITES_FILE\" <<'AMERIFLUX_SITES'",
      embeddedSites,
      "AMERIFLUX_SITES",
      "fi",
      "",
      "if [ ! -s \"$SITES_FILE\" ]; then",
      "  echo \"No AmeriFlux API-backed sites provided in $SITES_FILE.\" | tee -a \"$LOGFILE\"",
      "  exit 0",
      "fi",
      "",
      "while IFS=$'\\t' read -r SITE_ID DATA_PRODUCT SOURCE_LABEL; do",
      "  SITE_ID=\"${SITE_ID%$'\\r'}\"",
      "  DATA_PRODUCT=\"${DATA_PRODUCT%$'\\r'}\"",
      "  SOURCE_LABEL=\"${SOURCE_LABEL%$'\\r'}\"",
      "  [ -n \"$SITE_ID\" ] || continue",
      "  case \"$SITE_ID\" in",
      "    \\#*) continue ;;",
      "  esac",
      "  if [ -z \"$DATA_PRODUCT\" ]; then",
      "    DATA_PRODUCT=\"" + AMERIFLUX_FLUXNET_PRODUCT + "\"",
      "  fi",
      "  if [ -z \"$SOURCE_LABEL\" ]; then",
      "    SOURCE_LABEL=\"" + AMERIFLUX_SOURCE_ONLY + "\"",
      "  fi",
      "  echo \"Requesting ${DATA_PRODUCT} URLs for ${SITE_ID} (${SOURCE_LABEL})...\" | tee -a \"$LOGFILE\"",
      "  REQUEST_URL=\"$(resolve_request_url \"$DATA_PRODUCT\")\" || {",
      "      echo \"Failed to resolve request URL for ${SITE_ID}; skipping.\" | tee -a \"$LOGFILE\"",
      "      continue",
      "    }",
      "  REQUEST_BODY=\"{",
      "      \\\"user_id\\\": \\\"${USER_ID}\\\",",
      "      \\\"user_email\\\": \\\"${USER_EMAIL}\\\",",
      "      \\\"data_policy\\\": \\\"" + policy + "\\\",",
      "      \\\"data_product\\\": \\\"${DATA_PRODUCT}\\\",",
      "      \\\"data_variant\\\": \\\"" + variant + "\\\",",
      "      \\\"site_ids\\\": [\\\"${SITE_ID}\\\"],",
      "      \\\"intended_use\\\": \\\"" + v2IntendedUse + "\\\",",
      "      \\\"description\\\": \\\"Request ${DATA_PRODUCT} download for ${SITE_ID} via the Q.E.D. Lab FLUXNET Data Explorer for Keenan Group research workflows.\\\"",
      "    }\"",
      "  if [ \"$DATA_PRODUCT\" = \"" + FLUXNET2015_PRODUCT + "\" ]; then",
      "    REQUEST_BODY=\"{",
      "      \\\"user_id\\\": \\\"${USER_ID}\\\",",
      "      \\\"user_email\\\": \\\"${USER_EMAIL}\\\",",
      "      \\\"data_product\\\": \\\"${DATA_PRODUCT}\\\",",
      "      \\\"data_variant\\\": \\\"" + variant + "\\\",",
      "      \\\"data_policy\\\": \\\"" + policy + "\\\",",
      "      \\\"site_ids\\\": [\\\"${SITE_ID}\\\"],",
      "      \\\"intended_use\\\": \\\"" + v1IntendedUse + "\\\",",
      "      \\\"description\\\": \\\"Download ${DATA_PRODUCT} for ${SITE_ID}\\\",",
      "      \\\"agree_policy\\\": true",
      "    }\"",
      "  fi",
      "",
      "  RESPONSE_FILE=\"$(mktemp \"${TMPDIR:-/tmp}/ameriflux_response.XXXXXX\" 2>/dev/null || true)\"",
      "  if [ -z \"$RESPONSE_FILE\" ]; then",
      "    echo \"Could not create a temporary response file for ${SITE_ID} (${DATA_PRODUCT}); skipping.\" | tee -a \"$LOGFILE\"",
      "    continue",
      "  fi",
      "",
      "  if ! HTTP_STATUS=$(curl -sS -w \"%{http_code}\" -o \"$RESPONSE_FILE\" -X POST \"$REQUEST_URL\" \\",
      "    -H \"Content-Type: application/json\" \\",
      "    -H \"accept: application/json\" \\",
      "    --data-binary \"$REQUEST_BODY\"); then",
      "      rm -f \"$RESPONSE_FILE\"",
      "      echo \"Request failed for ${SITE_ID} (${DATA_PRODUCT}); check connectivity and the AmeriFlux API endpoint.\" | tee -a \"$LOGFILE\"",
      "      continue",
      "  fi",
      "  RESPONSE=\"$(cat \"$RESPONSE_FILE\")\"",
      "  rm -f \"$RESPONSE_FILE\"",
      "",
      "  if ! is_success_http_status \"$HTTP_STATUS\"; then",
      "    if print_download_request_error \"$SITE_ID\" \"$DATA_PRODUCT\" \"$HTTP_STATUS\" \"$RESPONSE\"; then",
      "      continue",
      "    else",
      "      diagnostic_status=\"$?\"",
      "      if [ \"$diagnostic_status\" = \"2\" ]; then",
      "        exit 1",
      "      fi",
      "      continue",
      "    fi",
      "  fi",
      "",
      "  URLS=$(extract_urls \"$RESPONSE\" 2>/dev/null || true)",
      "  if [ -z \"$URLS\" ]; then",
      "    if print_download_request_error \"$SITE_ID\" \"$DATA_PRODUCT\" \"$HTTP_STATUS\" \"$RESPONSE\"; then",
      "      continue",
      "    else",
      "      diagnostic_status=\"$?\"",
      "      if [ \"$diagnostic_status\" = \"2\" ]; then",
      "        exit 1",
      "      fi",
      "    fi",
      "    continue",
      "  fi",
      "",
      "  while IFS= read -r url; do",
      "    [ -n \"$url\" ] || continue",
      "    clean_url=\"${url%%\\?*}\"",
      "    filename=\"$(basename \"$clean_url\")\"",
      "    log_ameriflux_download \"$filename\"",
      "    echo \"Downloading ${filename} (${SITE_ID}, ${DATA_PRODUCT})\" | tee -a \"$LOGFILE\"",
      "    curl -L \"$url\" -o \"$filename\" || echo \"Download failed for ${SITE_ID} (${DATA_PRODUCT}): $url\" | tee -a \"$LOGFILE\"",
      "  done <<< \"$URLS\"",
      "done < \"$SITES_FILE\"",
      "",
      "echo \"AmeriFlux API bulk download complete.\" | tee -a \"$LOGFILE\""
    ])).join("\n");
  }

  function buildDownloadAllSelectedScriptText(options) {
    var opts = options || {};
    var includeShuttle = opts.includeShuttle !== false;
    var includeAmeriFlux = opts.includeAmeriFlux !== false;
    var shuttleScript = String(opts.shuttleScript || "./download_shuttle_selected.sh");
    var ameriFluxScript = String(opts.ameriFluxScript || "./download_ameriflux_selected.sh");
    var lines = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      "# Bulk download wrapper for surfaced products from selected FLUXNET sites",
      "# Validated direct links are handled by download_shuttle_selected.sh.",
      "# AmeriFlux API-backed surfaced products (FLUXNET, BASE, and FLUXNET2015) are downloaded via the AmeriFlux API.",
      "",
      "SCRIPT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\"",
      "cd \"$SCRIPT_DIR\"",
      "",
      "echo \"Starting bulk download for selected FLUXNET sites...\""
    ];

    if (includeShuttle) {
      lines.push(
        "",
        "if [ -f \"" + shuttleScript + "\" ]; then",
        "  echo \"Running Shuttle bulk download...\"",
        "  bash \"" + shuttleScript + "\" || {",
        "    echo \"Shuttle bulk download failed.\" >&2",
        "    exit 1",
        "  }",
        "else",
        "  echo \"Expected " + shuttleScript + " but it was not found.\" >&2",
        "  exit 1",
        "fi"
      );
    } else {
      lines.push("", "echo \"No Shuttle-backed selected sites to download.\"");
    }

    if (includeAmeriFlux) {
      lines.push(
        "",
        "if [ -f \"" + ameriFluxScript + "\" ]; then",
        "  echo \"Running AmeriFlux bulk download...\"",
        "  bash \"" + ameriFluxScript + "\" || {",
        "    echo \"AmeriFlux bulk download failed.\" >&2",
        "    exit 1",
        "  }",
        "else",
        "  echo \"Expected " + ameriFluxScript + " but it was not found.\" >&2",
        "  exit 1",
        "fi"
      );
    } else {
      lines.push("", "echo \"No AmeriFlux API-backed selected sites to download.\"");
    }

    lines.push("", "echo \"Bulk download complete.\"");
    return lines.join("\n");
  }

  function buildDownloadAllSelectedFileBundle(options) {
    var opts = options || {};
    return [
      {
        filename: "download_all_selected.sh",
        mimeType: "text/x-shellscript;charset=utf-8",
        text: String(opts.wrapperText || "")
      },
      {
        filename: "download_ameriflux_selected.sh",
        mimeType: "text/x-shellscript;charset=utf-8",
        text: String(opts.ameriFluxText || "")
      },
      {
        filename: "download_shuttle_selected.sh",
        mimeType: "text/x-shellscript;charset=utf-8",
        text: String(opts.shuttleText || "")
      }
    ];
  }

  function delayMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, ms || 0));
    });
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var timeout = Math.max(0, parseInt(timeoutMs, 10) || 0);
    var fetchOptions = {};

    Object.keys(options || {}).forEach(function (key) {
      if (key !== "timeoutMs") {
        fetchOptions[key] = options[key];
      }
    });

    if (!timeout || typeof AbortController === "undefined") {
      return fetch(url, fetchOptions);
    }

    return new Promise(function (resolve, reject) {
      var controller = new AbortController();
      var timer = setTimeout(function () {
        controller.abort();
      }, timeout);

      fetchOptions.signal = controller.signal;

      fetch(url, fetchOptions)
        .then(function (response) {
          clearTimeout(timer);
          resolve(response);
        })
        .catch(function (error) {
          clearTimeout(timer);
          if (error && error.name === "AbortError") {
            var timeoutError = new Error("Request timed out after " + timeout + " ms for " + url);
            timeoutError.isTimeout = true;
            reject(timeoutError);
            return;
          }
          reject(error);
        });
    });
  }

  function fetchWithRetry(url, options, retryCount, baseDelayMs) {
    var retries = Math.max(0, parseInt(retryCount, 10) || 0);
    var delayBase = Math.max(50, parseInt(baseDelayMs, 10) || RETRY_BASE_DELAY_MS);

    function attempt(attemptNo) {
      return fetchWithTimeout(url, options || {}, options && options.timeoutMs)
        .then(function (res) {
          if (res.ok) {
            return res;
          }
          return res.text().then(function (bodyText) {
            var err = new Error("HTTP " + res.status + " for " + url + (bodyText ? (": " + String(bodyText).slice(0, 260)) : ""));
            err.status = res.status;
            err.responseBody = bodyText || "";
            err.noRetry = res.status >= 400 && res.status < 500;
            throw err;
          });
        })
        .catch(function (error) {
          if (error && error.noRetry) {
            throw error;
          }
          if (attemptNo >= retries) {
            throw error;
          }
          var jitter = Math.floor(Math.random() * 120);
          var waitMs = (Math.pow(2, attemptNo) * delayBase) + jitter;
          return delayMs(waitMs).then(function () {
            return attempt(attemptNo + 1);
          });
        });
    }

    return attempt(0);
  }

  function fetchJsonWithRetry(url, options, retryCount, baseDelayMs) {
    return fetchWithRetry(url, options, retryCount, baseDelayMs).then(function (res) {
      return res.json().then(function (payload) {
        return {
          payload: payload,
          lastModified: res.headers && res.headers.get ? (res.headers.get("last-modified") || "") : ""
        };
      }).catch(function (error) {
        var parseErr = new Error("Failed to parse JSON response from " + url + ": " + (error && error.message ? error.message : String(error)));
        parseErr.noRetry = true;
        throw parseErr;
      });
    });
  }

  function stableHashString(value) {
    var s = String(value || "");
    var h = 2166136261;
    var i;
    for (i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return "h" + ((h >>> 0).toString(16));
  }

  function readAvailabilityCache(cacheKey) {
    var storage = getLocalStorageSafe();
    var key = String(cacheKey || "").trim();
    if (!storage || !key) {
      return null;
    }
    try {
      var payload = safeJsonParse(storage.getItem(key));
      if (!payload || payload.schema !== 1 || !Array.isArray(payload.sites)) {
        return null;
      }
      var cachedAt = parseInt(payload.cachedAt || "0", 10) || 0;
      var ageMs = Date.now() - cachedAt;
      payload.isFresh = ageMs >= 0 && ageMs <= AMERIFLUX_AVAILABILITY_CACHE_MAX_AGE_MS;
      return payload;
    } catch (e) {
      return null;
    }
  }

  function writeAvailabilityCache(cacheKey, parsed) {
    var storage = getLocalStorageSafe();
    var key = String(cacheKey || "").trim();
    if (!storage || !key || !parsed || !Array.isArray(parsed.sites)) {
      return;
    }
    var payload = {
      schema: 1,
      cachedAt: String(Date.now()),
      totalSites: parsed.totalSites || 0,
      sitesWithYears: parsed.sitesWithYears || 0,
      sites: parsed.sites,
      freshnessKey: parsed.freshnessKey || ""
    };
    try {
      storage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      // Ignore localStorage quota issues.
    }
  }

  function normalizePublishYears(values) {
    var out = [];
    var seen = {};
    function addYear(value) {
      var year = parseIntOrNull(value);
      if (year == null) {
        return;
      }
      if (seen[year]) {
        return;
      }
      seen[year] = true;
      out.push(year);
    }
    function addValue(value) {
      var matches;
      if (Array.isArray(value)) {
        value.forEach(addValue);
        return;
      }
      if (value == null || value === "") {
        return;
      }
      if (typeof value === "string") {
        matches = value.match(/\b(?:19|20)\d{2}\b/g);
        if (matches && (matches.length > 1 || /[,;|]/.test(value))) {
          matches.forEach(addYear);
          return;
        }
      }
      addYear(value);
    }
    addValue(values);
    out.sort(function (a, b) {
      return a - b;
    });
    return out;
  }

  function preferredExplicitYearSource(values, fallbackValues) {
    if (Array.isArray(values)) {
      return values.length ? values : fallbackValues;
    }
    if (values != null && String(values).trim() !== "") {
      return values;
    }
    return fallbackValues;
  }

  function buildContiguousYearArray(firstYear, lastYear) {
    var start = parseIntOrNull(firstYear);
    var end = parseIntOrNull(lastYear);
    var years = [];
    var year;
    if (start == null || end == null || end < start) {
      return years;
    }
    for (year = start; year <= end; year += 1) {
      years.push(year);
    }
    return years;
  }

  function normalizedExactYears(values, firstYear, lastYear) {
    var years = normalizePublishYears(values);
    if (years.length) {
      return years;
    }
    return buildContiguousYearArray(firstYear, lastYear);
  }

  function yearCoverageSegmentLabel(startYear, endYear) {
    return startYear === endYear ? String(startYear) : (String(startYear) + "-" + String(endYear));
  }

  function exactYearCoverageLabel(values, firstYear, lastYear) {
    var years = normalizedExactYears(values, firstYear, lastYear);
    var labels = [];
    var rangeStart;
    var previousYear;

    if (!years.length) {
      return yearRangeLabel(firstYear, lastYear);
    }

    rangeStart = years[0];
    previousYear = years[0];

    years.slice(1).forEach(function (year) {
      if (year === previousYear + 1) {
        previousYear = year;
        return;
      }
      labels.push(yearCoverageSegmentLabel(rangeStart, previousYear));
      rangeStart = year;
      previousYear = year;
    });

    labels.push(yearCoverageSegmentLabel(rangeStart, previousYear));
    return labels.join(", ");
  }

  function exactYearSetKey(values, firstYear, lastYear) {
    return normalizedExactYears(values, firstYear, lastYear).join(",");
  }

  function exactYearSetsMatch(aYears, bYears, aFirstYear, aLastYear, bFirstYear, bLastYear) {
    return exactYearSetKey(aYears, aFirstYear, aLastYear) === exactYearSetKey(bYears, bFirstYear, bLastYear);
  }

  function buildSiteAvailabilityLookup(sites) {
    var lookup = {};
    (Array.isArray(sites) ? sites : []).forEach(function (site) {
      var siteId = normalizeSiteId(site && site.site_id);
      if (!siteId) {
        return;
      }
      lookup[siteId] = Object.assign({}, site, {
        site_id: String(site && site.site_id || "").trim() || siteId,
        publish_years: normalizedExactYears(site && site.publish_years, site && site.first_year, site && site.last_year)
      });
    });
    return lookup;
  }

  function parseAmeriFluxAvailabilityPayload(payload, freshnessNamespace) {
    var values = payload && Array.isArray(payload.values) ? payload.values : [];
    var sites = [];

    values.forEach(function (entry) {
      var siteId = String(entry && entry.site_id || "").trim();
      if (!siteId) {
        return;
      }
      var publishYears = normalizePublishYears(entry && entry.publish_years);
      if (!publishYears.length) {
        return;
      }
      sites.push({
        site_id: siteId,
        publish_years: publishYears,
        first_year: publishYears[0],
        last_year: publishYears[publishYears.length - 1],
        years: exactYearCoverageLabel(publishYears, publishYears[0], publishYears[publishYears.length - 1]),
        country: deriveCountry(siteId, "")
      });
    });

    sites.sort(function (a, b) {
      var aa = String(a.site_id || "").toLowerCase();
      var bb = String(b.site_id || "").toLowerCase();
      if (aa < bb) {
        return -1;
      }
      if (aa > bb) {
        return 1;
      }
      return 0;
    });

    var canonical = JSON.stringify(sites.map(function (item) {
      return [item.site_id, item.first_year, item.last_year, item.publish_years.join(",")];
    }));

    return {
      totalSites: values.length,
      sitesWithYears: sites.length,
      sites: sites,
      freshnessKey: String(freshnessNamespace || "ameriflux") + ":" + stableHashString(canonical)
    };
  }

  function availabilitySourceName(sourceLabel) {
    var label = String(sourceLabel || "").trim();
    if (!label) {
      return "AmeriFlux live availability";
    }
    return label + " live availability";
  }

  function logSupplementalDependencyFailure(sourceLabel, url, error) {
    if (!(typeof window !== "undefined" && window.console && console.warn)) {
      return;
    }
    console.warn(
      "[shuttle-explorer] " +
        availabilitySourceName(sourceLabel) +
        " unavailable for " +
        url +
        ": " +
        (error && error.message ? error.message : String(error)),
      error
    );
  }

  function buildAvailabilityFallbackResult(sourceLabel, freshnessNamespace, warningText) {
    return {
      totalSites: 0,
      sitesWithYears: 0,
      sites: [],
      warning: warningText || "",
      downloadWarning: warningText || "",
      freshnessKey: String(freshnessNamespace || sourceLabel || "availability") + ":unavailable"
    };
  }

  function buildAmeriFluxApiRow(site, index, options) {
    var opts = options || {};
    var siteId = String(site && site.site_id || "").trim();
    var siteName = String(site && site.site_name || "").trim();
    var country = deriveCountry(siteId, site && site.country ? site.country : "");
    var publishYears = normalizedExactYears(site && site.publish_years, site && site.first_year, site && site.last_year);
    var firstYear = publishYears.length ? publishYears[0] : parseIntOrNull(site && site.first_year);
    var lastYear = publishYears.length ? publishYears[publishYears.length - 1] : parseIntOrNull(site && site.last_year);
    var years = exactYearCoverageLabel(publishYears, firstYear, lastYear);
    var keySuffix = years === "\u2014" ? "unknown" : years;
    var latitude = parseCoordinate(site && site.latitude, -90, 90);
    var longitude = parseCoordinate(site && site.longitude, -180, 180);
    var dataProduct = String(opts.dataProduct || AMERIFLUX_FLUXNET_PRODUCT).trim().toUpperCase();
    var networkLabel;
    if (dataProduct !== FLUXNET2015_PRODUCT && dataProduct !== AMERIFLUX_BASE_PRODUCT) {
      dataProduct = AMERIFLUX_FLUXNET_PRODUCT;
    }
    networkLabel = dataProduct === FLUXNET2015_PRODUCT
      ? (inferFluxnet2015NetworkFromCountry(country) || "")
      : AMERIFLUX_SOURCE_ONLY;
    var sourceLabel = String(opts.sourceLabel || "").trim() || (dataProduct === FLUXNET2015_PRODUCT
      ? FLUXNET2015_SOURCE_ONLY
      : (dataProduct === AMERIFLUX_BASE_PRODUCT ? BASE_SOURCE_ONLY : AMERIFLUX_SOURCE_ONLY));
    var sourceReason = String(opts.sourceReason || "").trim() || (sourceLabel === FLUXNET2015_SOURCE_ONLY
      ? "Only available from AmeriFlux API FLUXNET2015 fallback."
      : "Only available from AmeriFlux API.");
    var processingLineage = dataProduct === AMERIFLUX_BASE_PRODUCT
      ? PROCESSING_LINEAGE_OTHER
      : PROCESSING_LINEAGE_ONEFLUX;
    var row = {
      _index: index,
      _selection_key: "ameriflux_api|" + dataProduct + "|" + siteId + "|" + keySuffix,
      site_id: siteId,
      site_name: siteName,
      country: country,
      data_hub: AMERIFLUX_DATA_HUB,
      network: networkLabel,
      source_network: networkLabel,
      network_display: networkLabel,
      network_tokens: networkLabel ? [networkLabel] : [],
      vegetation_type: firstDefinedString(site, ["vegetation_type", "igbp", "veg_type"]),
      first_year: firstYear,
      last_year: lastYear,
      years: years,
      length_years: calculateCoverageLength(firstYear, lastYear),
      latitude: latitude,
      longitude: longitude,
      download_link: "",
      download_mode: "ameriflux_api",
      processing_lineage: processingLineage,
      source_label: sourceLabel,
      source_reason: sourceReason,
      source_origin: AMERIFLUX_API_SOURCE_ORIGIN,
      api_data_product: dataProduct,
      publish_years: publishYears
    };
    return finalizeRowComputedState(row);
  }

  function inferProcessedDataProduct(row) {
    var explicit = getApiRowDataProduct(row);
    var fileName = String(row && (row.file_name || row.download_link) || "").toUpperCase();
    var sourceLabel = String(row && row.source_label || "").trim();
    if (explicit === FLUXNET2015_PRODUCT || sourceLabel === FLUXNET2015_SOURCE_ONLY || fileName.indexOf("FLUXNET2015") !== -1) {
      return FLUXNET2015_PRODUCT;
    }
    return AMERIFLUX_FLUXNET_PRODUCT;
  }

  function buildSurfacedProductMetadata(fields) {
    var sourceOrigin = String(fields && (fields.sourceOrigin || fields.source_origin || fields.source) || "").trim();
    var siteId = String(fields && (fields.siteId || fields.site_id) || "").trim();
    var canonicalSiteId = normalizeSiteId(siteId);
    var exactYears = normalizedExactYears(
      fields && (fields.exactYears || fields.exact_years || fields.publish_years),
      fields && (fields.firstYear || fields.first_year),
      fields && (fields.lastYear || fields.last_year)
    );
    var firstYear = exactYears.length ? exactYears[0] : parseIntOrNull(fields && (fields.firstYear || fields.first_year));
    var lastYear = exactYears.length ? exactYears[exactYears.length - 1] : parseIntOrNull(fields && (fields.lastYear || fields.last_year));
    var productFamily = normalizeProductFamily(fields && (fields.productFamily || fields.product_family) || PRODUCT_FAMILY_FLUXNET);
    var sourceLabel = String(fields && (fields.sourceLabel || fields.source_label) || "").trim();
    var downloadMode = String(fields && (fields.downloadMode || fields.download_mode) || "").trim() || "direct";
    var apiDataProduct = normalizeDownloadProduct(fields && (fields.apiDataProduct || fields.api_data_product));
    var downloadLink = String(fields && (fields.downloadLink || fields.download_link) || "").trim();
    var dataHub = String(fields && (fields.dataHub || fields.data_hub) || "").trim();
    var siteName = String(fields && (fields.siteName || fields.site_name) || "").trim();
    var country = deriveCountry(canonicalSiteId || siteId, fields && (fields.country || fields.country_name) ? (fields.country || fields.country_name) : "");
    var vegetationType = normalizeVegetationType(fields && (fields.vegetationType || fields.vegetation_type || fields.igbp));
    var latitude = parseCoordinate(fields && (fields.latitude || fields.location_lat), -90, 90);
    var longitude = parseCoordinate(fields && (fields.longitude || fields.location_long || fields.location_lon), -180, 180);
    var coverageLabel = exactYearCoverageLabel(exactYears, firstYear, lastYear);
    var sourceReason = String(fields && (fields.sourceReason || fields.source_reason) || "").trim();
    var objectId = String(fields && (fields.objectId || fields.object_id) || "").trim();
    var fileName = String(fields && (fields.fileName || fields.file_name) || "").trim();
    var directDownloadUrl = String(fields && (fields.directDownloadUrl || fields.direct_download_url) || "").trim();
    var metadataUrl = String(fields && (fields.metadataUrl || fields.metadata_url) || "").trim();
    var accessUrl = String(fields && (fields.accessUrl || fields.access_url) || "").trim();
    var citation = String(fields && fields.citation || "").trim();
    var isIcos = !!(fields && (fields.isIcos || fields.is_icos));
    var network = String(fields && fields.network || "").trim();
    var sourceNetwork = String(fields && (fields.sourceNetwork || fields.source_network) || "").trim();
    var networkDisplay = String(fields && (fields.networkDisplay || fields.network_display) || network || sourceNetwork).trim();
    var processingLineage = resolveProcessingLineage(fields || {});

    return {
      productFamily: productFamily,
      processingLineage: processingLineage,
      source: sourceOrigin || resolveSourceOrigin(fields || {}),
      sourceLabel: sourceLabel,
      siteId: siteId || canonicalSiteId,
      exactYears: exactYears,
      coverageLabel: coverageLabel,
      firstYear: firstYear,
      lastYear: lastYear,
      lengthYears: exactYears.length || calculateCoverageLength(firstYear, lastYear),
      downloadMode: downloadMode,
      downloadLink: downloadLink,
      apiDataProduct: downloadMode === "ameriflux_api" ? apiDataProduct : inferProcessedDataProduct(fields || {}),
      dataHub: dataHub,
      sourceOrigin: sourceOrigin || resolveSourceOrigin(fields || {}),
      sourceReason: sourceReason,
      siteName: siteName,
      country: country,
      vegetationType: vegetationType,
      latitude: latitude,
      longitude: longitude,
      isIcos: isIcos,
      objectId: objectId,
      fileName: fileName,
      directDownloadUrl: directDownloadUrl,
      metadataUrl: metadataUrl,
      accessUrl: accessUrl,
      citation: citation,
      network: network,
      sourceNetwork: sourceNetwork,
      networkDisplay: networkDisplay,
      processing_lineage: processingLineage,
      site_id: siteId || canonicalSiteId,
      source_label: sourceLabel,
      download_mode: downloadMode,
      download_link: downloadLink,
      api_data_product: downloadMode === "ameriflux_api" ? apiDataProduct : inferProcessedDataProduct(fields || {}),
      data_hub: dataHub,
      source_origin: sourceOrigin || resolveSourceOrigin(fields || {}),
      source_reason: sourceReason,
      site_name: siteName,
      vegetation_type: vegetationType,
      network: network,
      source_network: sourceNetwork,
      network_display: networkDisplay,
      first_year: firstYear,
      last_year: lastYear,
      years: coverageLabel,
      length_years: exactYears.length || calculateCoverageLength(firstYear, lastYear),
      is_icos: isIcos,
      object_id: objectId,
      file_name: fileName,
      direct_download_url: directDownloadUrl,
      metadata_url: metadataUrl,
      access_url: accessUrl,
      display_label: surfacedProductDisplayName(fields || {}, true)
    };
  }

  function resolveProcessedExactYears(row, availabilityLookups) {
    var siteId = normalizeSiteId(row && row.site_id);
    var explicitYears = normalizePublishYears(row && row.publish_years);
    var lookups = availabilityLookups || {};
    var ameriFluxLookup = lookups.ameriFluxFluxnet || {};
    var fluxnet2015Lookup = lookups.fluxnet2015 || {};
    var baseLookup = lookups.ameriFluxBase || {};
    var dataHub = String(row && row.data_hub || "").trim();
    var sourceLabel = String(row && row.source_label || "").trim();
    var inferredProduct = inferProcessedDataProduct(row);

    if (explicitYears.length) {
      return explicitYears;
    }
    if (siteId && inferredProduct === FLUXNET2015_PRODUCT && fluxnet2015Lookup[siteId]) {
      return normalizedExactYears(
        fluxnet2015Lookup[siteId].publish_years,
        fluxnet2015Lookup[siteId].first_year,
        fluxnet2015Lookup[siteId].last_year
      );
    }
    if (siteId && baseLookup[siteId] && ameriFluxLookup[siteId]) {
      return normalizedExactYears(
        ameriFluxLookup[siteId].publish_years,
        ameriFluxLookup[siteId].first_year,
        ameriFluxLookup[siteId].last_year
      );
    }
    if (
      siteId &&
      ameriFluxLookup[siteId] &&
      (
        dataHub === AMERIFLUX_DATA_HUB ||
        sourceLabel === AMERIFLUX_SOURCE_ONLY ||
        sourceLabel === AMERIFLUX_SHUTTLE ||
        hasNetworkTag(row && row.network_display, AMERIFLUX_SOURCE_ONLY) ||
        hasNetworkTag(row && row.network, AMERIFLUX_SOURCE_ONLY) ||
        hasNetworkTag(row && row.source_network, AMERIFLUX_SOURCE_ONLY)
      )
    ) {
      return normalizedExactYears(
        ameriFluxLookup[siteId].publish_years,
        ameriFluxLookup[siteId].first_year,
        ameriFluxLookup[siteId].last_year
      );
    }
    return buildContiguousYearArray(row && row.first_year, row && row.last_year);
  }

  function buildPrimaryProcessedProduct(row, availabilityLookups) {
    var sourceLabel = String(row && row.source_label || "").trim();
    var dataProduct = getApiRowDataProduct(row);
    if (!row || sourceLabel === BASE_SOURCE_ONLY || dataProduct === AMERIFLUX_BASE_PRODUCT || isRequestOnlyRow(row) || isEfdSourceRow(row)) {
      return null;
    }
    return buildSurfacedProductMetadata(Object.assign({}, row, {
      productFamily: inferRowProductFamily(row),
      exactYears: resolveProcessedExactYears(row, availabilityLookups)
    }));
  }

  function buildAmeriFluxBaseProduct(site) {
    if (!site) {
      return null;
    }
    return buildSurfacedProductMetadata({
      productFamily: PRODUCT_FAMILY_BASE,
      processingLineage: PROCESSING_LINEAGE_OTHER,
      source: AMERIFLUX_API_SOURCE_ORIGIN,
      sourceLabel: BASE_SOURCE_ONLY,
      siteId: site.site_id,
      exactYears: site.publish_years,
      firstYear: site.first_year,
      lastYear: site.last_year,
      downloadMode: "ameriflux_api",
      downloadLink: "",
      apiDataProduct: AMERIFLUX_BASE_PRODUCT,
      dataHub: AMERIFLUX_DATA_HUB,
      sourceOrigin: AMERIFLUX_API_SOURCE_ORIGIN,
      sourceReason: "Available from AmeriFlux API.",
      siteName: site.site_name,
      country: site.country,
      vegetationType: site.vegetation_type,
      latitude: site.latitude,
      longitude: site.longitude
    });
  }

  function buildSurfacedCoverageSummary(products) {
    return (Array.isArray(products) ? products : []).map(function (product) {
      return surfacedProductDisplayName(product, false) + ": " + String(product && product.coverageLabel || "\u2014");
    }).join(" \u00b7 ");
  }

  function buildSurfacedYearUnion(products) {
    var years = [];
    var seen = {};
    (Array.isArray(products) ? products : []).forEach(function (product) {
      (Array.isArray(product && product.exactYears) ? product.exactYears : []).forEach(function (year) {
        if (seen[year]) {
          return;
        }
        seen[year] = true;
        years.push(year);
      });
    });
    years.sort(function (a, b) {
      return a - b;
    });
    return years;
  }

  function applySurfacedProductsToRow(row, primaryProcessedProduct, ameriFluxBaseProduct, surfacedProducts, classification) {
    var products = Array.isArray(surfacedProducts) ? surfacedProducts.slice() : [];
    var unionYears = buildSurfacedYearUnion(products);
    var availableYears = unionYears.length
      ? unionYears.slice()
      : normalizedExactYears(row && row.publish_years, row && row.first_year, row && row.last_year);
    var rowClassification = String(classification || "").trim() || classifySurfacedProducts(products);

    if (!rowClassification && isEfdSourceRow(row)) {
      // EFD rows are request-only discovery records, but they still belong in the
      // non-FLUXNET "Other processed" availability bucket.
      rowClassification = SURFACED_CLASSIFICATION_OTHER_PROCESSED;
    }

    row.primaryProcessedProduct = primaryProcessedProduct || null;
    row.ameriFluxBaseProduct = ameriFluxBaseProduct || null;
    row.surfacedProducts = products;
    row.surfacedProductClassification = rowClassification;
    row.hasProcessedProduct = !!primaryProcessedProduct;
    row.hasFluxnetAvailable = rowClassification === SURFACED_CLASSIFICATION_FLUXNET_PROCESSED ||
      rowClassification === SURFACED_CLASSIFICATION_FLUXNET_AND_OTHER;

    if (unionYears.length) {
      row.first_year = unionYears[0];
      row.last_year = unionYears[unionYears.length - 1];
      row.years = buildSurfacedCoverageSummary(products);
      row.length_years = unionYears.length;
    } else if (availableYears.length) {
      row.first_year = availableYears[0];
      row.last_year = availableYears[availableYears.length - 1];
      row.years = exactYearCoverageLabel(availableYears, row.first_year, row.last_year);
      row.length_years = availableYears.length;
    } else {
      row.years = isEfdSourceRow(row) || isRequestOnlyRow(row)
        ? "Request via EFD"
        : yearRangeLabel(row.first_year, row.last_year);
      row.length_years = calculateCoverageLength(row.first_year, row.last_year);
    }
    row.available_years = availableYears;
    row.available_year_count = availableYears.length;
    row.available_year_count_known = availableYears.length > 0;

    applyRowSourceFilterState(row);
    row.search_text = buildRowSearchText(row);
    return row;
  }

  function getSurfacedProductsForRow(row) {
    if (row && Array.isArray(row.surfacedProducts) && row.surfacedProducts.length) {
      return row.surfacedProducts.slice();
    }
    if (row && row.primaryProcessedProduct) {
      return [row.primaryProcessedProduct];
    }
    if (!row) {
      return [];
    }
    return [buildPrimaryProcessedProduct(row, {})].filter(Boolean);
  }

  function applySurfacedProductSelection(row, availabilityLookups) {
    var siteId = normalizeSiteId(row && row.site_id);
    var lookups = availabilityLookups || {};
    var primaryProcessedProduct = buildPrimaryProcessedProduct(row, lookups);
    var ameriFluxBaseProduct = siteId && lookups.ameriFluxBase && lookups.ameriFluxBase[siteId]
      ? buildAmeriFluxBaseProduct(lookups.ameriFluxBase[siteId])
      : null;
    var surfacedProducts;

    if (!primaryProcessedProduct && ameriFluxBaseProduct) {
      surfacedProducts = [ameriFluxBaseProduct];
    } else if (primaryProcessedProduct && !ameriFluxBaseProduct) {
      surfacedProducts = [primaryProcessedProduct];
    } else if (primaryProcessedProduct && ameriFluxBaseProduct && exactYearSetsMatch(
      primaryProcessedProduct.exactYears,
      ameriFluxBaseProduct.exactYears,
      primaryProcessedProduct.firstYear,
      primaryProcessedProduct.lastYear,
      ameriFluxBaseProduct.firstYear,
      ameriFluxBaseProduct.lastYear
    )) {
      surfacedProducts = [primaryProcessedProduct];
    } else {
      surfacedProducts = [primaryProcessedProduct, ameriFluxBaseProduct].filter(Boolean);
    }

    return applySurfacedProductsToRow(
      row,
      primaryProcessedProduct,
      ameriFluxBaseProduct,
      surfacedProducts,
      classifySurfacedProducts(surfacedProducts)
    );
  }

  function mergeCatalogRows(shuttleRows, icosDirectRows, japanFluxRows, ameriFluxSites, fluxnet2015Sites, ameriFluxBaseSites, efdRows) {
    if (arguments.length < 6) {
      var legacyAmeriFluxBaseSites = arguments.length >= 5 ? fluxnet2015Sites : [];
      fluxnet2015Sites = ameriFluxSites;
      ameriFluxSites = japanFluxRows;
      japanFluxRows = [];
      ameriFluxBaseSites = legacyAmeriFluxBaseSites;
    }
    var mergedRows = (Array.isArray(shuttleRows) ? shuttleRows : []).map(function (row) {
      return Object.assign({}, row);
    });
    var icosSites = dedupeIcosDirectRows((Array.isArray(icosDirectRows) ? icosDirectRows : []).map(function (row) {
      return Object.assign({}, row);
    }));
    var japanFluxSites = (Array.isArray(japanFluxRows) ? japanFluxRows : []).map(function (row) {
      return Object.assign({}, row);
    });
    var ameriSites = Array.isArray(ameriFluxSites) ? ameriFluxSites : [];
    var fluxnet2015 = Array.isArray(fluxnet2015Sites) ? fluxnet2015Sites : [];
    var ameriFluxBase = Array.isArray(ameriFluxBaseSites) ? ameriFluxBaseSites : [];
    var efdSites = dedupeSiteLevelRows((Array.isArray(efdRows) ? efdRows : []).map(function (row) {
      return Object.assign({}, row);
    }));
    var shuttleBySite = {};
    var canonicalSiteIds = {};
    var icosSuppressedByShuttle = 0;
    var icosDirectOnlySites = 0;
    var japanFluxSuppressedByHigherPrecedence = 0;
    var japanFluxOnlySites = 0;
    var overlapSites = 0;
    var ameriOnlySites = 0;
    var fluxnet2015OnlySites = 0;
    var baseOnlySites = 0;
    var additionalBaseYearsSites = 0;
    var efdSuppressedByHigherPrecedence = 0;
    var efdOnlySites = 0;

    // Keep precedence centralized here: Shuttle > ICOS-direct > JapanFlux-direct > AmeriFlux FLUXNET > FLUXNET2015 > BASE > EFD.
    mergedRows.forEach(function (row) {
      var siteId = String(row && row.site_id || "").trim();
      if (!siteId) {
        return;
      }
      if (!shuttleBySite[siteId]) {
        shuttleBySite[siteId] = [];
      }
      if (!row.download_mode) {
        row.download_mode = "direct";
      }
      if (!row.source_label) {
        row.source_label = "";
      }
      if (!row.source_reason) {
        row.source_reason = "";
      }
      if (!row.source_origin) {
        row.source_origin = SHUTTLE_SOURCE_ORIGIN;
      }
      row.source_priority = resolveSourcePriority(row);
      row.source_filter = sourceFilterValue(row);
      canonicalSiteIds[siteId] = true;
      shuttleBySite[siteId].push(row);
    });

    icosSites.forEach(function (row) {
      var siteId = String(row && row.site_id || "").trim();
      if (!siteId) {
        return;
      }
      if (shuttleBySite[siteId] && shuttleBySite[siteId].length) {
        icosSuppressedByShuttle += 1;
        return;
      }
      if (canonicalSiteIds[siteId]) {
        return;
      }
      if (!row.data_hub) {
        row.data_hub = ICOS_DIRECT_SOURCE_ONLY;
      }
      if (!row.download_mode) {
        row.download_mode = "direct";
      }
      if (!row.download_link && row.direct_download_url) {
        row.download_link = row.direct_download_url;
      }
      if (!row.source_label) {
        row.source_label = ICOS_DIRECT_SOURCE_ONLY;
      }
      if (!row.source_reason) {
        row.source_reason = "Available directly from the ICOS Carbon Portal archive.";
      }
      if (!row.source_origin) {
        row.source_origin = ICOS_DIRECT_SOURCE_ORIGIN;
      }
      row.source_priority = resolveSourcePriority(row);
      row.source_filter = sourceFilterValue(row);
      canonicalSiteIds[siteId] = true;
      icosDirectOnlySites += 1;
      mergedRows.push(row);
    });

    japanFluxSites.forEach(function (row) {
      var siteId = String(row && row.site_id || "").trim();
      if (!siteId) {
        return;
      }
      if (shuttleBySite[siteId] && shuttleBySite[siteId].length) {
        japanFluxSuppressedByHigherPrecedence += 1;
        return;
      }
      if (canonicalSiteIds[siteId]) {
        japanFluxSuppressedByHigherPrecedence += 1;
        return;
      }
      if (!row.data_hub) {
        row.data_hub = SOURCE_FILTER_TAG_JAPANFLUX;
      }
      if (!row.download_mode) {
        row.download_mode = "direct";
      }
      if (!row.source_label) {
        row.source_label = SOURCE_FILTER_TAG_JAPANFLUX;
      }
      if (!row.source_reason) {
        row.source_reason = "Available from the JapanFlux2024 ADS archive.";
      }
      if (!row.source_origin) {
        row.source_origin = JAPANFLUX_DIRECT_SOURCE_ORIGIN;
      }
      row.source_priority = resolveSourcePriority(row);
      row.source_filter = sourceFilterValue(row);
      canonicalSiteIds[siteId] = true;
      japanFluxOnlySites += 1;
      mergedRows.push(row);
    });

    ameriSites.forEach(function (site) {
      var siteId = String(site && site.site_id || "").trim();
      if (!siteId) {
        return;
      }
      var shuttleMatches = shuttleBySite[siteId];
      if (shuttleMatches && shuttleMatches.length) {
        overlapSites += 1;
        shuttleMatches.forEach(function (row) {
          row.source_label = AMERIFLUX_SHUTTLE;
          row.source_reason = "Available in both Shuttle and AmeriFlux; Shuttle is preferred when both exist.";
          row.source_filter = sourceFilterValue(row);
        });
        return;
      }
      if (canonicalSiteIds[siteId]) {
        return;
      }
      ameriOnlySites += 1;
      canonicalSiteIds[siteId] = true;
      mergedRows.push(buildAmeriFluxApiRow(site, mergedRows.length, {
        dataProduct: AMERIFLUX_FLUXNET_PRODUCT,
        sourceLabel: AMERIFLUX_SOURCE_ONLY,
        sourceReason: "Only available from AmeriFlux API."
      }));
    });

    fluxnet2015.forEach(function (site) {
      var siteId = String(site && site.site_id || "").trim();
      if (!siteId || canonicalSiteIds[siteId]) {
        return;
      }
      fluxnet2015OnlySites += 1;
      canonicalSiteIds[siteId] = true;
      mergedRows.push(buildAmeriFluxApiRow(site, mergedRows.length, {
        dataProduct: FLUXNET2015_PRODUCT,
        sourceLabel: FLUXNET2015_SOURCE_ONLY,
        sourceReason: "Only available from AmeriFlux API FLUXNET2015 fallback."
      }));
    });

    mergedRows.forEach(function (row, idx) {
      var siteId = String(row.site_id || "").trim();
      row._index = idx;
      if (!row._selection_key) {
        row._selection_key = String(row.data_hub || "unknown") + "|" + siteId + "|" + String(row.download_link || "dynamic");
      }
      finalizeRowComputedState(row);
    });

    var availabilityLookups = {
      ameriFluxFluxnet: buildSiteAvailabilityLookup(ameriSites),
      fluxnet2015: buildSiteAvailabilityLookup(fluxnet2015),
      ameriFluxBase: buildSiteAvailabilityLookup(ameriFluxBase)
    };
    var finalRows = mergedRows.map(function (row) {
      return applySurfacedProductSelection(row, availabilityLookups);
    });
    var finalSiteIds = {};

    finalRows.forEach(function (row) {
      var siteId = normalizeSiteId(row && row.site_id);
      if (siteId) {
        finalSiteIds[siteId] = true;
      }
      if (row && row.surfacedProductClassification === SURFACED_CLASSIFICATION_FLUXNET_AND_OTHER) {
        additionalBaseYearsSites += 1;
      }
    });

    ameriFluxBase.forEach(function (site) {
      var siteId = normalizeSiteId(site && site.site_id);
      var baseRow;
      if (!siteId || finalSiteIds[siteId]) {
        return;
      }
      baseOnlySites += 1;
      finalSiteIds[siteId] = true;
      baseRow = buildAmeriFluxApiRow(site, finalRows.length, {
        dataProduct: AMERIFLUX_BASE_PRODUCT,
        sourceLabel: BASE_SOURCE_ONLY,
        sourceReason: "Only available from AmeriFlux API."
      });
      finalRows.push(applySurfacedProductSelection(baseRow, availabilityLookups));
    });

    efdSites.forEach(function (row) {
      var siteId = normalizeSiteId(row && row.site_id);
      var finalizedRow;
      if (!siteId) {
        return;
      }
      if (finalSiteIds[siteId]) {
        efdSuppressedByHigherPrecedence += 1;
        return;
      }
      if (!row.data_hub) {
        row.data_hub = SOURCE_FILTER_TAG_EFD;
      }
      if (!row.download_link && row.request_page_url) {
        row.download_link = row.request_page_url;
      }
      if (!row.download_mode) {
        row.download_mode = REQUEST_PAGE_DOWNLOAD_MODE;
      }
      if (!row.source_label) {
        row.source_label = SOURCE_FILTER_TAG_EFD;
      }
      if (!row.source_reason) {
        row.source_reason = "Known EFD data record based on the public EFD site details and data-policy pages.";
      }
      if (!row.source_origin) {
        row.source_origin = EFD_SOURCE_ORIGIN;
      }
      row.source_priority = resolveSourcePriority(row);
      row.source_filter = sourceFilterValue(row);
      finalizedRow = applySurfacedProductSelection(finalizeRowComputedState(row), availabilityLookups);
      finalRows.push(finalizedRow);
      finalSiteIds[siteId] = true;
      efdOnlySites += 1;
    });

    finalRows.forEach(function (row, idx) {
      row._index = idx;
      if (!row._selection_key) {
        row._selection_key = String(row.data_hub || "unknown") + "|" + String(row.site_id || "") + "|" + String(row.download_link || "dynamic");
      }
      row.search_text = buildRowSearchText(row);
    });

    return {
      rows: finalRows,
      icosDirectTotalSites: icosSites.length,
      icosDirectSuppressedByShuttle: icosSuppressedByShuttle,
      icosDirectOnlySites: icosDirectOnlySites,
      japanFluxTotalSites: japanFluxSites.length,
      japanFluxSuppressedByHigherPrecedence: japanFluxSuppressedByHigherPrecedence,
      japanFluxOnlySites: japanFluxOnlySites,
      amerifluxTotalSites: ameriSites.length,
      amerifluxSitesWithYears: ameriSites.length,
      amerifluxOverlapSites: overlapSites,
      amerifluxOnlySites: ameriOnlySites,
      ameriFluxBaseTotalSites: ameriFluxBase.length,
      ameriFluxBaseSitesWithYears: ameriFluxBase.length,
      baseOnlySites: baseOnlySites,
      additionalBaseYearsSites: additionalBaseYearsSites,
      fluxnet2015TotalSites: fluxnet2015.length,
      fluxnet2015SitesWithYears: fluxnet2015.length,
      fluxnet2015OnlySites: fluxnet2015OnlySites,
      efdTotalSites: efdSites.length,
      efdSuppressedByHigherPrecedence: efdSuppressedByHigherPrecedence,
      efdOnlySites: efdOnlySites
    };
  }

  function mergeShuttleAndAmeriFluxRows(shuttleRows, ameriFluxSites) {
    return mergeCatalogRows(shuttleRows, [], ameriFluxSites, []);
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i;
    var ch;
    var next;

    for (i = 0; i < text.length; i += 1) {
      ch = text.charAt(i);
      next = i + 1 < text.length ? text.charAt(i + 1) : "";

      if (inQuotes) {
        if (ch === "\"") {
          if (next === "\"") {
            field += "\"";
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === "\"") {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        if (next === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
          i += 1;
        } else {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        }
      } else {
        field += ch;
      }
    }

    if (inQuotes) {
      throw new Error("CSV parse error: unmatched quote");
    }

    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function csvTextToObjects(text) {
    var matrix = parseCsv(String(text || ""));
    if (!matrix.length) {
      return [];
    }
    var headers = (matrix.shift() || []).map(function (h) {
      return toSnakeCase(h);
    });
    var out = [];

    matrix.forEach(function (cells) {
      if (!cells || !cells.length || (cells.length === 1 && cells[0] === "")) {
        return;
      }
      var obj = {};
      var i;
      for (i = 0; i < headers.length; i += 1) {
        obj[headers[i]] = cells[i] == null ? "" : String(cells[i]).trim();
      }
      out.push(obj);
    });

    return out;
  }

  function payloadJsonToObjects(payload) {
    if (Array.isArray(payload)) {
      return payload.map(function (row) {
        var obj = {};
        Object.keys(row || {}).forEach(function (key) {
          obj[toSnakeCase(key)] = row[key];
        });
        return obj;
      });
    }

    if (payload && Array.isArray(payload.columns) && Array.isArray(payload.rows)) {
      var columns = payload.columns.map(function (col) {
        return toSnakeCase(col);
      });
      return payload.rows.map(function (cells) {
        var obj = {};
        var i;
        for (i = 0; i < columns.length; i += 1) {
          obj[columns[i]] = Array.isArray(cells) ? cells[i] : undefined;
        }
        return obj;
      });
    }

    throw new Error("Unsupported snapshot JSON format");
  }

  function buildRawSelectionKey(raw) {
    var siteId = String(raw && (raw.site_id || raw.site) || "").trim();
    var hub = String(raw && (raw.data_hub || raw.hub) || "").trim();
    var downloadLink = String(raw && (raw.download_link || raw.url) || "").trim();
    if (!siteId || !hub || !downloadLink) {
      return "";
    }
    return hub + "|" + siteId + "|" + downloadLink;
  }

  function parseCoordinate(value, min, max) {
    var number = typeof value === "number" ? value : parseFloat(String(value == null ? "" : value).trim());
    if (!isFinite(number)) {
      return null;
    }
    if (typeof min === "number" && number < min) {
      return null;
    }
    if (typeof max === "number" && number > max) {
      return null;
    }
    return number;
  }

  function extractRawLatitude(raw) {
    return parseCoordinate(
      raw && (raw.location_lat || raw.latitude || raw.lat),
      -90,
      90
    );
  }

  function extractRawLongitude(raw) {
    return parseCoordinate(
      raw && (raw.location_long || raw.location_lon || raw.longitude || raw.lon || raw.lng),
      -180,
      180
    );
  }

  function buildCoordinateLookup(rawRows) {
    var lookup = {};
    (Array.isArray(rawRows) ? rawRows : []).forEach(function (raw) {
      var key = buildRawSelectionKey(raw);
      var latitude = extractRawLatitude(raw);
      var longitude = extractRawLongitude(raw);
      if (!key || latitude == null || longitude == null) {
        return;
      }
      lookup[key] = {
        location_lat: latitude,
        location_long: longitude
      };
    });
    return lookup;
  }

  function enrichRowsWithCoordinateLookup(rawRows, coordinateLookup) {
    if (!Array.isArray(rawRows) || !coordinateLookup) {
      return Array.isArray(rawRows) ? rawRows.slice() : [];
    }
    return rawRows.map(function (raw) {
      var key = buildRawSelectionKey(raw);
      var coords = key ? coordinateLookup[key] : null;
      var latitude = extractRawLatitude(raw);
      var longitude = extractRawLongitude(raw);
      var enriched;
      if (!coords || (latitude != null && longitude != null)) {
        return raw;
      }
      enriched = {};
      Object.keys(raw || {}).forEach(function (prop) {
        enriched[prop] = raw[prop];
      });
      enriched.location_lat = coords.location_lat;
      enriched.location_long = coords.location_long;
      return enriched;
    });
  }

  function buildAmeriFluxSiteInfoLookup(rawRows) {
    var lookup = {};
    (Array.isArray(rawRows) ? rawRows : []).forEach(function (raw) {
      var siteId = ameriFluxSiteInfoSiteId(raw);
      if (!siteId) {
        return;
      }
      lookup[siteId] = buildSiteInfoEntry(siteId, raw);
    });
    return lookup;
  }

  function buildSiteNameMetadataLookup(rawRows) {
    var lookup = {};
    (Array.isArray(rawRows) ? rawRows : []).forEach(function (raw) {
      var siteId = siteNameMetadataSiteId(raw);
      var siteName = siteInfoSiteName(raw);
      if (!siteId || !siteName || lookup[siteId]) {
        return;
      }
      lookup[siteId] = siteName;
    });
    return lookup;
  }

  function buildVegetationMetadataLookup(rawRows) {
    var lookup = {};
    (Array.isArray(rawRows) ? rawRows : []).forEach(function (raw) {
      var siteId = vegetationMetadataSiteId(raw);
      var vegetationType = extractVegetationMetadataValue(raw);
      if (!siteId || !vegetationType) {
        return;
      }
      lookup[siteId] = vegetationType;
    });
    return lookup;
  }

  function loadAmeriFluxSiteInfo(url) {
    return fetchText(url).then(function (result) {
      return {
        lookup: buildAmeriFluxSiteInfoLookup(csvTextToObjects(result.text)),
        source: "csv",
        sourceUrl: url,
        lastModified: result.lastModified || "",
        warning: ""
      };
    }).catch(function (error) {
      return {
        lookup: {},
        source: "csv",
        sourceUrl: url,
        lastModified: "",
        warning: "AmeriFlux site metadata unavailable; API-only site map coverage may be incomplete.",
        error: error
      };
    });
  }

  function loadSiteNameMetadata(url) {
    return fetchText(url).then(function (result) {
      var lookup = buildSiteNameMetadataLookup(csvTextToObjects(result.text));
      var canonical = JSON.stringify(Object.keys(lookup).sort().map(function (siteId) {
        return [siteId, lookup[siteId]];
      }));
      return {
        lookup: lookup,
        source: "csv",
        sourceUrl: url,
        lastModified: result.lastModified || "",
        meta: {
          version: stableHashString(canonical)
        },
        warning: ""
      };
    }).catch(function (error) {
      return {
        lookup: {},
        source: "csv",
        sourceUrl: url,
        lastModified: "",
        meta: {},
        warning: "Site-name metadata unavailable; rows with missing names may still show site IDs.",
        error: error
      };
    });
  }

  function loadVegetationMetadata(url) {
    return fetchText(url).then(function (result) {
      var lookup = buildVegetationMetadataLookup(csvTextToObjects(result.text));
      var canonical = JSON.stringify(Object.keys(lookup).sort().map(function (siteId) {
        return [siteId, lookup[siteId]];
      }));
      return {
        lookup: lookup,
        source: "csv",
        sourceUrl: url,
        lastModified: result.lastModified || "",
        meta: {
          version: stableHashString(canonical)
        },
        warning: ""
      };
    }).catch(function (error) {
      return {
        lookup: {},
        source: "csv",
        sourceUrl: url,
        lastModified: "",
        meta: {},
        warning: "Vegetation metadata unavailable; API-only vegetation coverage may be incomplete.",
        error: error
      };
    });
  }

  function siteNameNeedsFallback(siteId, siteName) {
    var normalizedSiteId = normalizeSiteId(siteId);
    var trimmedSiteName = String(siteName == null ? "" : siteName).trim();
    if (!trimmedSiteName) {
      return true;
    }
    if (normalizedSiteId && normalizeSiteId(trimmedSiteName) === normalizedSiteId) {
      return true;
    }
    return false;
  }

  function enrichSurfacedProductSiteName(product, siteName) {
    var enriched;
    if (!product || !siteName || !siteNameNeedsFallback(product.siteId || product.site_id, product.siteName || product.site_name)) {
      return product;
    }
    enriched = Object.assign({}, product);
    enriched.siteName = siteName;
    enriched.site_name = siteName;
    return enriched;
  }

  function enrichRowsWithSiteNameLookup(rows, siteNameLookup) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      var siteId = normalizeSiteId(row && row.site_id);
      var siteName = siteId && siteNameLookup ? siteNameLookup[siteId] : "";
      var enriched;
      if (!siteName || !siteNameNeedsFallback(siteId, row && row.site_name)) {
        return row;
      }
      enriched = Object.assign({}, row);
      enriched.site_name = siteName;
      if (enriched.primaryProcessedProduct) {
        enriched.primaryProcessedProduct = enrichSurfacedProductSiteName(enriched.primaryProcessedProduct, siteName);
      }
      if (enriched.ameriFluxBaseProduct) {
        enriched.ameriFluxBaseProduct = enrichSurfacedProductSiteName(enriched.ameriFluxBaseProduct, siteName);
      }
      if (Array.isArray(enriched.surfacedProducts)) {
        enriched.surfacedProducts = enriched.surfacedProducts.map(function (product) {
          return enrichSurfacedProductSiteName(product, siteName);
        });
      }
      enriched.search_text = buildRowSearchText(enriched);
      return enriched;
    });
  }

  function enrichSitesWithMetadata(sites, siteInfoLookup, vegetationLookup) {
    return (Array.isArray(sites) ? sites : []).map(function (site) {
      var siteId = normalizeSiteId(site && site.site_id);
      var siteInfo = siteId && siteInfoLookup ? siteInfoLookup[siteId] : null;
      var enriched = Object.assign({}, site);
      var derivedCountry = deriveCountry(siteId, "");
      var vegetationType = extractVegetationMetadataValue(enriched);
      enriched.country = deriveCountry(siteId, enriched.country);
      if (vegetationType) {
        enriched.vegetation_type = vegetationType;
      } else if (siteId && vegetationLookup && vegetationLookup[siteId]) {
        enriched.vegetation_type = vegetationLookup[siteId];
      }
      if (siteInfo) {
        if (!String(enriched.site_name || "").trim() && siteInfo.site_name) {
          enriched.site_name = siteInfo.site_name;
        }
        if ((!String(enriched.country || "").trim() || String(enriched.country || "").trim() === derivedCountry) && siteInfo.country) {
          enriched.country = siteInfo.country;
        }
        if (parseCoordinate(enriched.latitude, -90, 90) == null && siteInfo.latitude != null) {
          enriched.latitude = siteInfo.latitude;
        }
        if (parseCoordinate(enriched.longitude, -180, 180) == null && siteInfo.longitude != null) {
          enriched.longitude = siteInfo.longitude;
        }
      }
      return enriched;
    });
  }

  function enrichAmeriFluxSitesWithMetadata(sites, siteInfoLookup, vegetationLookup) {
    return enrichSitesWithMetadata(sites, siteInfoLookup, vegetationLookup);
  }

  function buildFluxnet2015SiteLookup(rawRows) {
    var lookup = {};
    (Array.isArray(rawRows) ? rawRows : []).forEach(function (raw) {
      var siteId = fluxnet2015SiteInfoSiteId(raw);
      if (!siteId) {
        return;
      }
      lookup[siteId] = buildSiteInfoEntry(siteId, raw);
    });
    return lookup;
  }

  function loadFluxnet2015SiteInfo(url) {
    return fetchText(url).then(function (result) {
      return {
        lookup: buildFluxnet2015SiteLookup(csvTextToObjects(result.text)),
        source: "csv",
        sourceUrl: url,
        lastModified: result.lastModified || "",
        warning: ""
      };
    }).catch(function (error) {
      return {
        lookup: {},
        source: "csv",
        sourceUrl: url,
        lastModified: "",
        warning: "FLUXNET2015 site metadata unavailable; FLUXNET2015 API-only map coverage may be incomplete.",
        error: error
      };
    });
  }

  function enrichFluxnet2015SitesWithMetadata(sites, siteInfoLookup, vegetationLookup) {
    return enrichSitesWithMetadata(sites, siteInfoLookup, vegetationLookup);
  }

  function summarizeApiOnlyRowCoordinateCoverage(rows) {
    var summary = {
      amerifluxWithCoordinates: 0,
      amerifluxWithoutCoordinates: 0,
      fluxnet2015WithCoordinates: 0,
      fluxnet2015WithoutCoordinates: 0,
      fluxnet2015MissingSiteIds: []
    };

    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var sourceLabel = String(row && row.source_label || "").trim();
      var hasCoordinates = parseCoordinate(row && row.latitude, -90, 90) != null &&
        parseCoordinate(row && row.longitude, -180, 180) != null;

      if (sourceLabel === AMERIFLUX_SOURCE_ONLY) {
        if (hasCoordinates) {
          summary.amerifluxWithCoordinates += 1;
        } else {
          summary.amerifluxWithoutCoordinates += 1;
        }
        return;
      }

      if (sourceLabel === FLUXNET2015_SOURCE_ONLY) {
        if (hasCoordinates) {
          summary.fluxnet2015WithCoordinates += 1;
        } else {
          summary.fluxnet2015WithoutCoordinates += 1;
          if (row && row.site_id) {
            summary.fluxnet2015MissingSiteIds.push(String(row.site_id));
          }
        }
      }
    });

    summary.fluxnet2015MissingSiteIds.sort();
    return summary;
  }

  function normalizeRow(raw, index) {
    var siteId = String(raw.site_id || raw.site || "").trim();
    var siteName = String(raw.site_name || "").trim();
    var hub = String(raw.data_hub || raw.hub || "").trim();
    var network = String(raw.network || "").trim();
    var sourceNetwork = String(raw.source_network || raw.product_source_network || "").trim();
    var networkDisplay = network || sourceNetwork;
    var vegetationType = String(raw.vegetation_type || raw.igbp || raw.veg_type || "").trim();
    var country = deriveCountry(siteId, raw.country || raw.country_code || "");
    var firstYear = parseIntOrNull(raw.first_year || raw.year_start || "");
    var lastYear = parseIntOrNull(raw.last_year || raw.year_end || "");
    var directDownloadUrl = String(raw.direct_download_url || "").trim();
    var downloadLink = String(raw.download_link || raw.url || directDownloadUrl).trim();
    var latitude = extractRawLatitude(raw);
    var longitude = extractRawLongitude(raw);
    var downloadMode = String(raw.download_mode || "").trim() || "direct";
    var sourceLabel = String(raw.source_label || raw.source || "").trim();
    var sourceReason = String(raw.source_reason || "").trim();
    var apiDataProduct = String(raw.api_data_product || "").trim();
    var sourceOrigin = String(raw.source_origin || raw.catalog_source || "").trim() || SHUTTLE_SOURCE_ORIGIN;
    var sourcePriority = parseIntOrNull(raw.source_priority);
    var objectId = String(raw.object_id || "").trim();
    var fileName = String(raw.file_name || raw.filename || "").trim();
    var metadataUrl = String(raw.metadata_url || "").trim();
    var latestVersionUrl = String(raw.latest_version_url || "").trim();
    var accessUrl = String(raw.access_url || "").trim();
    var objectSpec = String(raw.object_spec || "").trim();
    var project = String(raw.project || "").trim();
    var coverageStart = String(raw.coverage_start || "").trim();
    var coverageEnd = String(raw.coverage_end || "").trim();
    var productionEnd = String(raw.production_end || "").trim();
    var citation = String(raw.citation || "").trim();
    var landingPageUrl = String(raw.landing_page_url || "").trim();
    var metadataId = String(raw.metadata_id || "").trim();
    var version = String(raw.version || "").trim();
    var productFamily = String(raw.product_family || "").trim();
    var fluxList = String(raw.flux_list || "").trim();
    var accessLabel = String(raw.access_label || raw.access_policy_label || "").trim();
    var dataUseLabel = String(raw.data_use_label || raw.data_use_policy_label || "").trim();
    var requestPageUrl = String(raw.request_page_url || "").trim();
    var sitePageUrl = String(raw.site_page_url || "").trim();
    var knownDataRecord = String(raw.known_data_record || "").trim();
    var efdAccessSummary = String(raw.efd_access_summary || "").trim();
    var efdPolicyYearCount = String(raw.efd_policy_year_count || "").trim();
    var publishYears = normalizePublishYears(preferredExplicitYearSource(raw.publish_years, raw.efd_policy_years));
    var efdPolicyYears = publishYears.slice();
    var efdPolicyFirstYear = String(raw.efd_policy_first_year || "").trim();
    var efdPolicyLastYear = String(raw.efd_policy_last_year || "").trim();
    var efdProvenance = String(raw.efd_provenance || "").trim();
    var lastUpdated = String(raw.last_updated || "").trim();

    if (!siteId || !hub || !downloadLink) {
      return null;
    }

    var row = {
      _index: index,
      _selection_key: hub + "|" + siteId + "|" + downloadLink,
      site_id: siteId,
      site_name: siteName,
      country: country,
      data_hub: hub,
      network: network,
      source_network: sourceNetwork,
      network_display: networkDisplay,
      network_tokens: splitNetworks(networkDisplay),
      vegetation_type: vegetationType,
      first_year: publishYears.length ? publishYears[0] : firstYear,
      last_year: publishYears.length ? publishYears[publishYears.length - 1] : lastYear,
      years: exactYearCoverageLabel(publishYears, firstYear, lastYear),
      length_years: publishYears.length ? publishYears.length : calculateCoverageLength(firstYear, lastYear),
      latitude: latitude,
      longitude: longitude,
      download_link: downloadLink,
      download_mode: downloadMode,
      source_label: sourceLabel,
      source_reason: sourceReason,
      source_origin: sourceOrigin,
      source_priority: sourcePriority,
      product_family: productFamily,
      api_data_product: apiDataProduct,
      object_id: objectId,
      file_name: fileName,
      direct_download_url: directDownloadUrl,
      metadata_url: metadataUrl,
      latest_version_url: latestVersionUrl,
      access_url: accessUrl,
      object_spec: objectSpec,
      project: project,
      coverage_start: coverageStart,
      coverage_end: coverageEnd,
      production_end: productionEnd,
      citation: citation,
      landing_page_url: landingPageUrl,
      metadata_id: metadataId,
      version: version,
      flux_list: fluxList,
      access_label: accessLabel,
      data_use_label: dataUseLabel,
      request_page_url: requestPageUrl,
      site_page_url: sitePageUrl,
      known_data_record: knownDataRecord,
      efd_access_summary: efdAccessSummary,
      efd_policy_year_count: efdPolicyYearCount,
      efd_policy_years: efdPolicyYears,
      efd_policy_first_year: efdPolicyFirstYear,
      efd_policy_last_year: efdPolicyLastYear,
      efd_provenance: efdProvenance,
      last_updated: lastUpdated,
      publish_years: publishYears
    };
    return finalizeRowComputedState(row);
  }

  function normalizeRows(rawRows) {
    var rows = [];
    var dropped = 0;
    rawRows.forEach(function (raw, index) {
      var row = normalizeRow(raw || {}, index);
      if (row) {
        rows.push(row);
      } else {
        dropped += 1;
      }
    });
    return { rows: rows, dropped: dropped };
  }

  function normalizeBooleanValue(value) {
    if (value === true || value === false) {
      return value;
    }
    var text = String(value == null ? "" : value).trim().toLowerCase();
    return text === "true" || text === "1" || text === "yes";
  }

  function normalizeKnownSiteMapRows(rawRows) {
    var rows = [];
    (rawRows || []).forEach(function (raw, index) {
      var siteId = String(raw && raw.site_id || "").trim();
      var siteCode = String(raw && raw.site_code || "").trim();
      var siteName = String(raw && raw.site_name || "").trim();
      var countryCode = String(raw && raw.country_code || "").trim();
      var country = deriveCountry(siteId || siteCode, raw && (raw.country || countryCode) || "");
      var latitude = extractRawLatitude(raw || {});
      var longitude = extractRawLongitude(raw || {});
      if ((latitude == null || longitude == null) || !(siteId || siteCode || siteName)) {
        return;
      }
      rows.push({
        _index: index,
        site_id: siteId,
        site_code: siteCode,
        site_name: siteName,
        country_code: countryCode,
        country: country,
        latitude: latitude,
        longitude: longitude,
        in_explorer: normalizeBooleanValue(raw && raw.in_explorer),
        has_accessible_data: normalizeBooleanValue(raw && raw.has_accessible_data),
        known_site_only: normalizeBooleanValue(raw && raw.known_site_only),
        source_network: String(raw && raw.source_network || "").trim(),
        source_category: String(raw && raw.source_category || "").trim() || (
          normalizeBooleanValue(raw && raw.known_site_only) ? "known_site_only" : "accessible_data_site"
        )
      });
    });
    return rows;
  }

  function knownSiteDataAvailabilityLabel(row) {
    return row && row.known_site_only ? "no public data" : "accessible data";
  }

  function mapCategoryColors(category) {
    var colors = MAP_CATEGORY_COLORS[category] || MAP_CATEGORY_COLORS.withoutSharedData;
    return {
      color: colors.color,
      fillColor: colors.fillColor
    };
  }

  function mapLegendSwatchStyle(category) {
    var colors = mapCategoryColors(category);
    return "border:1.4px solid " + colors.color + ";background:" + colors.fillColor + ";";
  }

  function filteredAccessibleMapMarkerStyle() {
    var colors = mapCategoryColors("filteredAccessible");
    return {
      radius: 4.5,
      weight: 1.1,
      color: colors.color,
      fillColor: colors.fillColor,
      fillOpacity: 0.45
    };
  }

  function linkedMarkerHighlightStyle(baseStyle) {
    var base = baseStyle || {};
    var radius = parseFloat(base.radius);
    var weight = parseFloat(base.weight);
    var fillOpacity = parseFloat(base.fillOpacity);
    return {
      radius: (Number.isFinite(radius) ? radius : 4.5) + 2,
      weight: Math.max(Number.isFinite(weight) ? weight + 1.8 : 3, 3),
      color: base.color,
      fillColor: base.fillColor,
      fillOpacity: Math.min((Number.isFinite(fillOpacity) ? fillOpacity : 0.45) + 0.22, 0.82)
    };
  }

  function knownSiteMapMarkerStyle(row) {
    var knownSiteOnly = !!(row && row.known_site_only);
    var colors = mapCategoryColors(knownSiteOnly ? "withoutSharedData" : "accessibleData");
    return {
      radius: knownSiteOnly ? 4.5 : 4,
      weight: knownSiteOnly ? 1.4 : 1.1,
      color: colors.color,
      fillColor: colors.fillColor,
      fillOpacity: knownSiteOnly ? 0.6 : 0.45
    };
  }

  function mapSiteKey(row, index) {
    var siteId = normalizeSiteId(row && (row.site_id || row.site_code));
    var latitude;
    var longitude;
    if (siteId) {
      return "site:" + siteId;
    }
    latitude = parseCoordinate(row && row.latitude, -90, 90);
    longitude = parseCoordinate(row && row.longitude, -180, 180);
    if (latitude != null && longitude != null) {
      return "coord:" + latitude + ":" + longitude;
    }
    return "row:" + String(row && row._selection_key || row && row._index || index || "");
  }

  function addToSiteKeyLookup(lookup, siteKey, value) {
    if (!lookup || !siteKey || value == null) {
      return [];
    }
    if (!lookup[siteKey]) {
      lookup[siteKey] = [];
    }
    lookup[siteKey].push(value);
    return lookup[siteKey];
  }

  function siteKeyLookupEntries(lookup, siteKey) {
    return lookup && siteKey && Array.isArray(lookup[siteKey]) ? lookup[siteKey] : [];
  }

  function mapRowWithCoordinates(row) {
    var latitude = parseCoordinate(row && row.latitude, -90, 90);
    var longitude = parseCoordinate(row && row.longitude, -180, 180);
    var out = Object.assign({}, row || {});
    if (latitude == null || longitude == null) {
      out.has_coordinates = false;
      return out;
    }
    out.latitude = latitude;
    out.longitude = longitude;
    out.has_coordinates = true;
    return out;
  }

  function uniqueMapSiteEntries(rows, selectedKeys) {
    var selected = selectedKeys && typeof selectedKeys === "object" ? selectedKeys : {};
    var entries = [];
    var byKey = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row, index) {
      var key = mapSiteKey(row, index);
      var candidate = mapRowWithCoordinates(row);
      var entry = byKey[key];
      if (!entry) {
        entry = {
          key: key,
          row: candidate,
          selected: !!(row && selected[row._selection_key])
        };
        byKey[key] = entry;
        entries.push(entry);
        return;
      }
      entry.selected = entry.selected || !!(row && selected[row._selection_key]);
      if (!entry.row.has_coordinates && candidate.has_coordinates) {
        entry.row = candidate;
      }
    });
    return entries;
  }

  function buildKnownSiteMapDisplayState(rows, accessibleRows) {
    var entries = [];
    var byKey = {};
    var hasCanonicalAccessibleRows = Array.isArray(accessibleRows);
    function addRow(row, index, forceAccessible, forceKnownOnly) {
      var source = Object.assign({}, row || {});
      var key;
      var candidate;
      var entry;
      var previous;
      if (forceKnownOnly) {
        source.in_explorer = false;
        source.has_accessible_data = false;
        source.known_site_only = true;
        source.source_category = "known_site_only";
      }
      if (forceAccessible) {
        source.in_explorer = true;
        source.has_accessible_data = true;
        source.known_site_only = false;
        source.source_category = "accessible_data_site";
      }
      key = mapSiteKey(source, index);
      candidate = mapRowWithCoordinates(source);
      entry = byKey[key];
      if (!entry) {
        entry = {
          key: key,
          row: candidate
        };
        byKey[key] = entry;
        entries.push(entry);
        return;
      }
      if (entry.row.known_site_only && !candidate.known_site_only) {
        previous = entry.row;
        entry.row = Object.assign({}, previous, candidate);
        if (!candidate.has_coordinates && previous.has_coordinates) {
          entry.row.latitude = previous.latitude;
          entry.row.longitude = previous.longitude;
          entry.row.has_coordinates = true;
        }
        return;
      }
      if (!entry.row.has_coordinates && candidate.has_coordinates) {
        entry.row = candidate;
      }
    }
    (Array.isArray(rows) ? rows : []).forEach(function (row, index) {
      addRow(row, index, false, hasCanonicalAccessibleRows);
    });
    (Array.isArray(accessibleRows) ? accessibleRows : []).forEach(function (row, index) {
      addRow(row, index, true, false);
    });
    var displayRows = entries.map(function (entry) {
      return entry.row;
    }).filter(function (row) {
      return row && row.has_coordinates;
    });
    var accessibleCount = 0;
    var knownSiteOnlyCount = 0;
    displayRows.forEach(function (row) {
      if (row && row.known_site_only) {
        knownSiteOnlyCount += 1;
      } else {
        accessibleCount += 1;
      }
    });
    return {
      rows: displayRows,
      totalCount: displayRows.length,
      accessibleCount: accessibleCount,
      knownSiteOnlyCount: knownSiteOnlyCount
    };
  }

  function buildKnownSitesExportCsv(rows) {
    var lines = [
      ["site_id", "site_name", "latitude", "longitude", "country", "data_availability"].join(",")
    ];
    (rows || []).forEach(function (row) {
      lines.push([
        csvEscape(row && row.site_id || ""),
        csvEscape(row && row.site_name || ""),
        csvEscape(row && row.latitude),
        csvEscape(row && row.longitude),
        csvEscape(row && row.country || ""),
        csvEscape(knownSiteDataAvailabilityLabel(row))
      ].join(","));
    });
    return lines.join("\n") + "\n";
  }

  function extractSnapshotMeta(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {};
    }
    var meta = payload.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return {};
    }
    return meta;
  }

  function buildSnapshotFreshnessKey(result) {
    if (result && result.meta && result.meta.version) {
      return [
        "meta",
        String(result.meta.version),
        String(result.meta.snapshot_refreshed_at || ""),
        String(result.meta.snapshot_refreshed_date || ""),
        String(result.meta.snapshot_updated_at || ""),
        String(result.meta.snapshot_updated_date || "")
      ].join(":");
    }
    if (result && result.lastModified) {
      return "last-modified:" + String(result.lastModified);
    }
    return "source:" + String(result && result.source ? result.source : "") + ":" + String(result && result.sourceUrl ? result.sourceUrl : "");
  }

  function fetchText(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) {
        throw new Error("HTTP " + res.status + " for " + url);
      }
      return res.text().then(function (text) {
        return {
          text: text,
          lastModified: res.headers && res.headers.get ? (res.headers.get("last-modified") || "") : ""
        };
      });
    });
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) {
        throw new Error("HTTP " + res.status + " for " + url);
      }
      return res.json().then(function (payload) {
        return {
          payload: payload,
          lastModified: res.headers && res.headers.get ? (res.headers.get("last-modified") || "") : ""
        };
      });
    });
  }

  function loadSnapshot(jsonUrl, csvUrl) {
    function settle(promise) {
      return promise.then(function (value) {
        return { ok: true, value: value };
      }).catch(function (error) {
        return { ok: false, error: error };
      });
    }

    return Promise.all([
      settle(fetchJson(jsonUrl)),
      settle(fetchText(csvUrl))
    ]).then(function (results) {
      var jsonResult = results[0] && results[0].ok ? results[0].value : null;
      var csvResult = results[1] && results[1].ok ? results[1].value : null;
      var jsonError = results[0] && !results[0].ok ? results[0].error : null;
      var csvError = results[1] && !results[1].ok ? results[1].error : null;
      var csvRows;
      var coordinateLookup;

      if (jsonResult) {
        var snapshotMeta = extractSnapshotMeta(jsonResult.payload);
        var snapshotMetaWarning = buildSnapshotSourceStatusWarning(snapshotMeta);
        if (snapshotMetaWarning) {
          logSnapshotSourceStatusWarnings(snapshotMeta);
        }
        csvRows = csvResult ? csvTextToObjects(csvResult.text) : [];
        coordinateLookup = csvRows.length ? buildCoordinateLookup(csvRows) : null;
        return {
          rawRows: coordinateLookup
            ? enrichRowsWithCoordinateLookup(payloadJsonToObjects(jsonResult.payload), coordinateLookup)
            : payloadJsonToObjects(jsonResult.payload),
          source: "json",
          sourceUrl: jsonUrl,
          lastModified: jsonResult.lastModified || "",
          meta: snapshotMeta,
          warning: snapshotMetaWarning
        };
      }

      if (csvResult) {
        return {
          rawRows: csvTextToObjects(csvResult.text),
          source: "csv",
          sourceUrl: csvUrl,
          lastModified: csvResult.lastModified || "",
          meta: {},
          warning: "JSON snapshot unavailable; loaded CSV fallback.",
          jsonError: jsonError
        };
      }

      var error = new Error(
        "Failed to load snapshot JSON and CSV fallback. JSON error: " +
        (jsonError && jsonError.message ? jsonError.message : String(jsonError)) +
        "; CSV error: " +
        (csvError && csvError.message ? csvError.message : String(csvError))
      );
      error.jsonError = jsonError;
      error.csvError = csvError;
      throw error;
    });
  }

  function loadKnownSiteMap(jsonUrl) {
    return fetchJson(jsonUrl).then(function (result) {
      return {
        rows: normalizeKnownSiteMapRows(payloadJsonToObjects(result.payload)),
        sourceUrl: jsonUrl,
        lastModified: result.lastModified || "",
        meta: extractSnapshotMeta(result.payload),
        warning: ""
      };
    });
  }

  function ShuttleSource(jsonUrl, csvUrl) {
    this.jsonUrl = jsonUrl;
    this.csvUrl = csvUrl;
  }

  ShuttleSource.prototype.list_sites = function () {
    return loadSnapshot(this.jsonUrl, this.csvUrl).then(function (result) {
      var normalized = normalizeRows(result.rawRows || []);
      return {
        rows: normalized.rows,
        droppedRows: normalized.dropped,
        source: result.source || "",
        sourceUrl: result.sourceUrl || "",
        warning: result.warning || "",
        lastModified: result.lastModified || "",
        meta: result.meta || {}
      };
    });
  };

  function resolveAmeriFluxIdentityFromRoot(root) {
    var globalCfg = (typeof window !== "undefined" && window && window.FLUXNET_EXPLORER_CONFIG && typeof window.FLUXNET_EXPLORER_CONFIG === "object")
      ? window.FLUXNET_EXPLORER_CONFIG
      : {};
    var cfgUserId = String(globalCfg.amerifluxUserId || "").trim();
    var cfgEmail = String(globalCfg.amerifluxUserEmail || "").trim();
    var trustedRuntime = !!(globalCfg[AMERIFLUX_TRUSTED_RUNTIME_FLAG] || globalCfg.allowBrowserAmeriFluxDownload);
    return {
      userId: cfgUserId,
      userEmail: cfgEmail,
      trustedRuntime: trustedRuntime
    };
  }

  function AmeriFluxSource(options) {
    var opts = options || {};
    this.availabilityUrl = String(opts.availabilityUrl || AMERIFLUX_FLUXNET_AVAILABILITY_URL);
    this.userId = String(opts.userId || "").trim();
    this.userEmail = String(opts.userEmail || "").trim();
    this.trustedRuntime = !!opts.trustedRuntime;
    this.dataProduct = normalizeDownloadProduct(opts.dataProduct || AMERIFLUX_FLUXNET_PRODUCT);
    this.downloadUrl = String(opts.downloadUrl || getDownloadEndpointForProduct(this.dataProduct));
    this.sourceLabel = String(opts.sourceLabel || "").trim() || (this.dataProduct === FLUXNET2015_PRODUCT
      ? FLUXNET2015_SOURCE_ONLY
      : (this.dataProduct === AMERIFLUX_BASE_PRODUCT ? BASE_SOURCE_ONLY : AMERIFLUX_SOURCE_ONLY));
    this.availabilityCacheKey = String(opts.availabilityCacheKey || (this.dataProduct === FLUXNET2015_PRODUCT
      ? FLUXNET2015_AVAILABILITY_CACHE_KEY
      : (this.dataProduct === AMERIFLUX_BASE_PRODUCT ? AMERIFLUX_BASE_AVAILABILITY_CACHE_KEY : AMERIFLUX_FLUXNET_AVAILABILITY_CACHE_KEY)));
    this.freshnessNamespace = String(opts.freshnessNamespace || this.dataProduct.toLowerCase());
    this.retryCount = parseInt(opts.retryCount, 10);
    if (!isFinite(this.retryCount)) {
      this.retryCount = MAX_HTTP_RETRIES;
    }
    this.retryBaseDelayMs = parseInt(opts.retryBaseDelayMs, 10);
    if (!isFinite(this.retryBaseDelayMs)) {
      this.retryBaseDelayMs = RETRY_BASE_DELAY_MS;
    }
    this.requestTimeoutMs = parseInt(opts.requestTimeoutMs, 10);
    if (!isFinite(this.requestTimeoutMs)) {
      this.requestTimeoutMs = EXTERNAL_REQUEST_TIMEOUT_MS;
    }
    this.availabilityRetryCount = parseInt(opts.availabilityRetryCount, 10);
    if (!isFinite(this.availabilityRetryCount)) {
      this.availabilityRetryCount = this.retryCount;
    }
    this.availabilityTimeoutMs = parseInt(opts.availabilityTimeoutMs, 10);
    if (!isFinite(this.availabilityTimeoutMs)) {
      this.availabilityTimeoutMs = this.requestTimeoutMs;
    }
  }

  AmeriFluxSource.prototype.getDownloadIdentity = function () {
    var userId = String(this.userId || "").trim();
    var userEmail = String(this.userEmail || "").trim();
    var hasCredentials = !!(userId && userEmail);
    var trustedRuntime = !!this.trustedRuntime;
    var enabled = !!(trustedRuntime && hasCredentials);
    var reason = "";
    if (!trustedRuntime) {
      reason = "manual_download_required";
    } else if (!hasCredentials) {
      reason = "missing_credentials";
    }
    return {
      user_id: userId,
      user_email: userEmail,
      enabled: enabled,
      trusted_runtime: trustedRuntime,
      has_credentials: hasCredentials,
      reason: reason
    };
  };

  AmeriFluxSource.prototype.canDownload = function () {
    return !!this.getDownloadIdentity().enabled;
  };

  AmeriFluxSource.prototype.list_sites = function () {
    var cached = readAvailabilityCache(this.availabilityCacheKey);
    var self = this;
    if (cached && cached.isFresh) {
      return Promise.resolve({
        totalSites: cached.totalSites || 0,
        sitesWithYears: cached.sitesWithYears || 0,
        sites: Array.isArray(cached.sites) ? cached.sites : [],
        warning: "",
        freshnessKey: cached.freshnessKey || "ameriflux-cache:" + String(cached.cachedAt || "")
      });
    }

    return fetchJsonWithRetry(this.availabilityUrl, {
      timeoutMs: this.availabilityTimeoutMs
    }, this.availabilityRetryCount, this.retryBaseDelayMs)
      .then(function (result) {
        var parsed = parseAmeriFluxAvailabilityPayload(result.payload || {}, self.freshnessNamespace);
        writeAvailabilityCache(self.availabilityCacheKey, parsed);
        return {
          totalSites: parsed.totalSites,
          sitesWithYears: parsed.sitesWithYears,
          sites: parsed.sites,
          warning: "",
          downloadWarning: "",
          freshnessKey: parsed.freshnessKey
        };
      })
      .catch(function (error) {
        logSupplementalDependencyFailure(self.sourceLabel, self.availabilityUrl, error);
        if (cached && Array.isArray(cached.sites) && cached.sites.length) {
          return {
            totalSites: cached.totalSites || 0,
            sitesWithYears: cached.sitesWithYears || 0,
            sites: cached.sites,
            warning: AMERIFLUX_LIVE_CACHED_WARNING,
            downloadWarning: AMERIFLUX_LIVE_CACHED_WARNING,
            freshnessKey: cached.freshnessKey || "ameriflux-cache:" + String(cached.cachedAt || "")
          };
        }
        return buildAvailabilityFallbackResult(self.sourceLabel, self.freshnessNamespace, AMERIFLUX_LIVE_UNAVAILABLE_WARNING);
      });
  };

  AmeriFluxSource.prototype.buildDownloadPayload = function (siteIds, variant, policy, identityOverride) {
    var identity = identityOverride || this.getDownloadIdentity();
    return buildDownloadPayloadForProduct(siteIds, variant, policy, identity, this.dataProduct);
  };

  AmeriFluxSource.prototype.getManualDownloadResult = function (siteId, variant, policy, reason, identityOverride) {
    var site = String(siteId || "").trim();
    var manualReason = String(reason || "").trim();
    var resolvedIdentity = resolveAmeriFluxIdentityOverride(identityOverride);
    var payloadTemplate = this.buildDownloadPayload([site || "SITE_ID_HERE"], variant, policy, {
      user_id: resolvedIdentity ? resolvedIdentity.user_id : AMERIFLUX_TEMPLATE_USER_ID,
      user_email: resolvedIdentity ? resolvedIdentity.user_email : AMERIFLUX_TEMPLATE_USER_EMAIL
    });
    return {
      mode: "manual",
      manual_download_required: true,
      site_id: site,
      reason: manualReason || "AmeriFlux downloads require configured credentials in a trusted runtime context.",
      message: this.sourceLabel + " downloads require your own AmeriFlux identity. Copy and run the generated curl command locally.",
      payload_template: payloadTemplate,
      curl_command: buildAmeriFluxCurlCommand(site, variant, policy, this.downloadUrl, this.dataProduct, resolvedIdentity || undefined),
      manifest: {},
      data_urls: []
    };
  };

  AmeriFluxSource.prototype.get_download_urls = function (siteId, variant, policy, identityOverride) {
    var runtimeIdentity = this.getDownloadIdentity();
    var site = String(siteId || "").trim();
    if (!site) {
      return Promise.reject(new Error("AmeriFlux download requires a site_id."));
    }
    if (!runtimeIdentity.enabled) {
      var reason = !runtimeIdentity.trusted_runtime
        ? "AmeriFlux API downloads are disabled in this browser runtime."
        : "AMERIFLUX_USER_ID or AMERIFLUX_USER_EMAIL is missing.";
      return Promise.resolve(this.getManualDownloadResult(site, variant, policy, reason, identityOverride));
    }

    var requestIdentity = resolveAmeriFluxIdentityOverride(identityOverride) || runtimeIdentity;
    var identity = {
      user_id: requestIdentity.user_id,
      user_email: requestIdentity.user_email
    };
    var payload = this.buildDownloadPayload([site], variant, policy, identity);
    return fetchJsonWithRetry(this.downloadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload),
      timeoutMs: this.requestTimeoutMs
    }, this.retryCount, this.retryBaseDelayMs).then(function (result) {
      var responsePayload = result.payload || {};
      var dataUrls = Array.isArray(responsePayload.data_urls) ? responsePayload.data_urls : [];
      if (!dataUrls.length) {
        throw new Error("AmeriFlux download request succeeded but returned empty data_urls for " + site + ".");
      }
      return {
        mode: "api",
        manual_download_required: false,
        manifest: responsePayload.manifest || {},
        data_urls: dataUrls
      };
    }).catch(function (error) {
      var detail = error && error.message ? error.message : String(error);
      throw new Error("AmeriFlux download request failed for " + site + ": " + detail);
    });
  };

  AmeriFluxSource.prototype.download_site = function (siteId, variant, policy, identityOverride) {
    return this.get_download_urls(siteId, variant, policy, identityOverride);
  };

  function coordinateBoundsForKey(columnKey) {
    if (columnKey === "latitude") {
      return [-90, 90];
    }
    if (columnKey === "longitude") {
      return [-180, 180];
    }
    return null;
  }

  function compareRows(a, b, sortKey, sortDir) {
    var dir = sortDir === "desc" ? -1 : 1;
    var coordinateBounds = coordinateBoundsForKey(sortKey);
    var av;
    var bv;

    if (sortKey === "years") {
      av = a.first_year == null ? Number.POSITIVE_INFINITY : a.first_year;
      bv = b.first_year == null ? Number.POSITIVE_INFINITY : b.first_year;
      if (av !== bv) {
        return (av < bv ? -1 : 1) * dir;
      }
      av = a.last_year == null ? Number.POSITIVE_INFINITY : a.last_year;
      bv = b.last_year == null ? Number.POSITIVE_INFINITY : b.last_year;
      if (av !== bv) {
        return (av < bv ? -1 : 1) * dir;
      }
    } else if (coordinateBounds) {
      av = parseCoordinate(a && a[sortKey], coordinateBounds[0], coordinateBounds[1]);
      bv = parseCoordinate(b && b[sortKey], coordinateBounds[0], coordinateBounds[1]);
      av = av == null ? Number.POSITIVE_INFINITY : av;
      bv = bv == null ? Number.POSITIVE_INFINITY : bv;
      if (av !== bv) {
        return (av < bv ? -1 : 1) * dir;
      }
    } else {
      av = a[sortKey];
      bv = b[sortKey];
      if (typeof av === "number" || typeof bv === "number") {
        av = av == null ? Number.POSITIVE_INFINITY : av;
        bv = bv == null ? Number.POSITIVE_INFINITY : bv;
        if (av !== bv) {
          return (av < bv ? -1 : 1) * dir;
        }
      } else {
        av = String(av || "").toLowerCase();
        bv = String(bv || "").toLowerCase();
        if (av !== bv) {
          return (av < bv ? -1 : 1) * dir;
        }
      }
    }

    var aHub = String(a.data_hub || "").toLowerCase();
    var bHub = String(b.data_hub || "").toLowerCase();
    if (aHub !== bHub) {
      return aHub < bHub ? -1 : 1;
    }
    var aSite = String(a.site_id || "").toLowerCase();
    var bSite = String(b.site_id || "").toLowerCase();
    if (aSite !== bSite) {
      return aSite < bSite ? -1 : 1;
    }
    return a._index - b._index;
  }

  function buildAttributionText(snapshotUpdatedDate, snapshotRefreshedDate) {
    return "We appreciate acknowledgement of the QED FLUXNET Data Explorer when convenient. Contact TF Keenan (trevorkeenan@berkeley.edu) with any questions or suggestions. Funding for the FLUXNET Data Explorer was generously provided by the NSF AccelNet program. Explorer refreshed: " + snapshotUpdatedDateDisplayText(snapshotRefreshedDate) + ". New data last added: " + snapshotUpdatedDateDisplayText(snapshotUpdatedDate) + ".";
  }

  function buildAttributionHtml(snapshotUpdatedDate, snapshotRefreshedDate) {
    return "We appreciate acknowledgement of the QED FLUXNET Data Explorer when convenient. Contact TF Keenan (<a href=\"mailto:trevorkeenan@berkeley.edu\">trevorkeenan@berkeley.edu</a>) with any questions or suggestions. Funding for the FLUXNET Data Explorer was generously provided by the NSF AccelNet program. Explorer refreshed: " + escapeHtml(snapshotUpdatedDateDisplayText(snapshotRefreshedDate)) + ". New data last added: " + escapeHtml(snapshotUpdatedDateDisplayText(snapshotUpdatedDate)) + ".";
  }

  function buildKnownSitesLegendHtml() {
    return [
      "<div class=\"shuttle-explorer__tiny shuttle-explorer__map-legend\" data-role=\"known-sites-legend\" aria-label=\"Map legend\">",
      "  <span class=\"shuttle-explorer__map-legend-item\"><span class=\"shuttle-explorer__map-legend-swatch shuttle-explorer__map-legend-swatch--filtered\" style=\"" + mapLegendSwatchStyle("filteredAccessible") + "\" aria-hidden=\"true\"></span><span>filtered accessible-data sites</span></span>",
      "  <span class=\"shuttle-explorer__map-legend-item\"><span class=\"shuttle-explorer__map-legend-swatch shuttle-explorer__map-legend-swatch--accessible\" style=\"" + mapLegendSwatchStyle("accessibleData") + "\" aria-hidden=\"true\"></span><span>sites with accessible data</span></span>",
      "  <span class=\"shuttle-explorer__map-legend-item\"><span class=\"shuttle-explorer__map-legend-swatch shuttle-explorer__map-legend-swatch--unshared\" style=\"" + mapLegendSwatchStyle("withoutSharedData") + "\" aria-hidden=\"true\"></span><span>sites without shared data</span></span>",
      "</div>"
    ].join("");
  }

  function buildMultiSelectFilterHtml(config) {
    var id = config.id;
    var labelId = id + "-label";
    var summaryId = id + "-summary";
    var labelHtml = config.labelHtml || ("<label id=\"" + escapeHtml(labelId) + "\">" + escapeHtml(config.label || "") + "</label>");
    return [
      "<div class=\"shuttle-explorer__field shuttle-explorer__multi-field\" data-role=\"" + escapeHtml(config.role) + "\" data-filter-key=\"" + escapeHtml(config.filterKey) + "\" data-all-label=\"" + escapeHtml(config.allLabel) + "\" data-plural-label=\"" + escapeHtml(config.pluralLabel) + "\" data-track-label=\"" + escapeHtml(config.trackLabel) + "\">",
      "  " + labelHtml,
      "  <button id=\"" + escapeHtml(id) + "\" type=\"button\" class=\"shuttle-explorer__multi-toggle\" data-role=\"multi-toggle\" aria-haspopup=\"true\" aria-expanded=\"false\" aria-labelledby=\"" + escapeHtml(labelId) + " " + escapeHtml(summaryId) + "\"><span id=\"" + escapeHtml(summaryId) + "\" data-role=\"multi-summary\">" + escapeHtml(config.allLabel) + "</span></button>",
      "  <div class=\"shuttle-explorer__multi-menu shuttle-explorer__hidden\" data-role=\"multi-menu\" role=\"group\" aria-labelledby=\"" + escapeHtml(labelId) + "\">",
      "    <label class=\"shuttle-explorer__multi-option shuttle-explorer__multi-option--all\"><input type=\"checkbox\" data-role=\"multi-all\" checked /><span class=\"shuttle-explorer__multi-option-label\" title=\"" + escapeHtml(config.allLabel) + "\">" + escapeHtml(config.allLabel) + "</span></label>",
      "    <div class=\"shuttle-explorer__multi-options\" data-role=\"multi-options\"></div>",
      "  </div>",
      "</div>"
    ].join("");
  }

  function csvEscape(value) {
    var s = String(value == null ? "" : value);
    if (/[",\r\n]/.test(s)) {
      return "\"" + s.replace(/"/g, "\"\"") + "\"";
    }
    return s;
  }

  function combineWarnings() {
    var parts = [];
    var seen = {};
    var i;
    for (i = 0; i < arguments.length; i += 1) {
      var value = String(arguments[i] || "").trim();
      if (value && !seen[value]) {
        seen[value] = true;
        parts.push(value);
      }
    }
    return parts.join(" ");
  }

  function shouldEnableBulkToolsActions(selectedCount) {
    return (parseIntOrNull(selectedCount) || 0) > 1;
  }

  function formatSelectedSiteCount(selectedCount) {
    var count = parseIntOrNull(selectedCount) || 0;
    return count + " selected " + (count === 1 ? "site" : "sites");
  }

  function normalizeClipboardCellText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function formatCoordinate(value, min, max) {
    var numeric = parseCoordinate(value, min, max);
    if (numeric == null) {
      return "\u2014";
    }
    return numeric.toFixed(2);
  }

  function tableDisplayCellValue(row, columnKey) {
    var value;
    var coordinateBounds = coordinateBoundsForKey(columnKey);
    if (!row || !columnKey) {
      return "\u2014";
    }
    if (coordinateBounds) {
      return formatCoordinate(row[columnKey], coordinateBounds[0], coordinateBounds[1]);
    }
    if (columnKey === "length_years") {
      return row.length_years == null ? "\u2014" : String(row.length_years);
    }
    value = normalizeClipboardCellText(row[columnKey]);
    return value || "\u2014";
  }

  function tableClipboardCellValue(row, columnKey) {
    return tableDisplayCellValue(row, columnKey);
  }

  function buildTableClipboardText(rows) {
    var visibleRows = Array.isArray(rows) ? rows : [];
    var lines = [
      SORT_COLUMNS.map(function (column) {
        return normalizeClipboardCellText(column.label);
      }).join("\t")
    ];
    visibleRows.forEach(function (row) {
      lines.push(SORT_COLUMNS.map(function (column) {
        return tableClipboardCellValue(row, column.key);
      }).join("\t"));
    });
    return lines.join("\n") + "\n";
  }

  function tableColumnClassName(columnKey) {
    if (columnKey === "latitude") {
      return "shuttle-explorer__coord-col shuttle-explorer__coord-col--lat";
    }
    if (columnKey === "longitude") {
      return "shuttle-explorer__coord-col shuttle-explorer__coord-col--lon";
    }
    return "";
  }

  function renderTableCellHtml(row, columnKey, sourceBadgeHtml) {
    var displayValue;
    if (columnKey === "site_id") {
      return "<strong>" + escapeHtml(row && row.site_id || "") + "</strong>" + (sourceBadgeHtml || "");
    }
    if (columnKey === "years") {
      return renderSurfacedCoverageHtml(row);
    }
    displayValue = tableDisplayCellValue(row, columnKey);
    if (displayValue === "\u2014") {
      return "<span class=\"shuttle-explorer__muted\">—</span>";
    }
    return escapeHtml(displayValue);
  }

  function sourceBadgeClass(sourceLabel) {
    if (sourceLabel === ICOS_DIRECT_SOURCE_ONLY) {
      return "shuttle-explorer__source-badge--icos";
    }
    if (sourceLabel === SOURCE_FILTER_TAG_EFD) {
      return "shuttle-explorer__source-badge--efd";
    }
    if (sourceLabel === SOURCE_FILTER_TAG_JAPANFLUX) {
      return "shuttle-explorer__source-badge--japanflux";
    }
    if (sourceLabel === BASE_SOURCE_ONLY) {
      return "shuttle-explorer__source-badge--base";
    }
    if (sourceLabel === AMERIFLUX_SOURCE_ONLY) {
      return "shuttle-explorer__source-badge--ameriflux";
    }
    if (sourceLabel === FLUXNET2015_SOURCE_ONLY) {
      return "shuttle-explorer__source-badge--fluxnet2015";
    }
    if (sourceLabel === AMERIFLUX_SHUTTLE) {
      return "shuttle-explorer__source-badge--ameriflux-shuttle";
    }
    return "";
  }

  function renderSourceBadgeHtml(sourceLabel, sourceReason) {
    var label = String(sourceLabel || "").trim();
    if (!label) {
      return "<span class=\"shuttle-explorer__muted\">\u2014</span>";
    }
    var klass = sourceBadgeClass(label);
    var title = sourceReason ? (" title=\"" + escapeHtml(sourceReason) + "\"") : "";
    return "<span class=\"shuttle-explorer__source-badge " + escapeHtml(klass) + "\"" + title + ">" + escapeHtml(label) + "</span>";
  }

  function renderSurfacedCoverageHtml(row) {
    var products = getSurfacedProductsForRow(row);
    var content;
    var badgeHtml = "";

    if (!products.length) {
      return escapeHtml(String(row && row.years || "\u2014"));
    }

    content = products.map(function (product) {
      return "<span class=\"shuttle-explorer__coverage-item\"><strong>" +
        escapeHtml(surfacedProductDisplayName(product, false)) +
        ":</strong> " +
        escapeHtml(String(product && product.coverageLabel || "\u2014")) +
        "</span>";
    }).join("<span class=\"shuttle-explorer__coverage-sep\" aria-hidden=\"true\">\u00b7</span>");

    if (row && row.surfacedProductClassification === SURFACED_CLASSIFICATION_FLUXNET_AND_OTHER) {
      badgeHtml = "<div class=\"shuttle-explorer__coverage-badge\"><span class=\"shuttle-explorer__source-badge shuttle-explorer__source-badge--base-addition\">" + escapeHtml(TABLE_LABEL_FLUXNET_AND_OTHER) + "</span></div>";
    }

    return "<div class=\"shuttle-explorer__coverage-list\">" + content + "</div>" + badgeHtml;
  }

  function buildRowDownloadOptions(row, canAmeriFluxDownload) {
    return getRowActionProducts(row).map(function (product) {
      var dataProduct = normalizeDownloadProduct(product && product.apiDataProduct);
      var option = {
        product: product,
        displayLabel: String(product && (product.displayLabel || product.display_label) || "").trim() || surfacedProductDisplayName(product, true),
        mode: String(product && product.downloadMode || ""),
        siteId: String(product && product.siteId || ""),
        sourceLabel: String(product && product.sourceLabel || ""),
        sourceOrigin: String(product && (product.sourceOrigin || product.source_origin) || ""),
        dataProduct: dataProduct,
        downloadLink: String(product && product.downloadLink || ""),
        isIcos: !!(product && product.isIcos),
        title: ""
      };

      if (option.mode === "ameriflux_api") {
        option.actionLabel = canAmeriFluxDownload ? getApiActionRequestLabel(dataProduct) : getApiActionCopyLabel(dataProduct);
        if (!canAmeriFluxDownload) {
          option.title = apiProductDisplayName(dataProduct) + " downloads require your own AmeriFlux identity. Click to copy a curl command template.";
        }
      } else if (option.mode === REQUEST_PAGE_DOWNLOAD_MODE) {
        option.actionLabel = option.sourceOrigin === EFD_SOURCE_ORIGIN || option.sourceLabel === SOURCE_FILTER_TAG_EFD
          ? "Request via EFD"
          : "Open request page";
        option.title = "Known EFD data record. Login may be required, some data may require PI approval or PI contact, and current direct download is not implied.";
      } else if (option.mode === LANDING_PAGE_DOWNLOAD_MODE) {
        option.actionLabel = "Open landing page";
        option.title = "Direct ZIP URL could not be validated automatically; open the ADS landing page to download manually.";
      } else {
        option.actionLabel = option.isIcos ? "Accept ICOS license and download" : "Download";
      }

      return option;
    });
  }

  function ensureStyles() {
    if (document.querySelector("link[href*='shuttle-explorer.css']")) {
      return;
    }
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.type = "text/css";
    style.textContent = [
      ".shuttle-explorer{max-width:1100px;margin:24px auto 0;padding:10px;border:1px solid #d5dbe3;border-radius:8px;background:#fff;}",
      ".shuttle-explorer *{box-sizing:border-box;}",
      ".shuttle-explorer h2{margin:0 0 6px 0;}",
      ".shuttle-explorer p{margin:0 0 8px 0;line-height:1.4;}",
      ".shuttle-explorer__status{margin:0 0 10px 0;padding:8px 10px;border-radius:6px;background:#f8fafc;color:#33475b;font-size:.9em;}",
      ".shuttle-explorer__status.is-error{background:#fff3f3;color:#8b1e1e;border:1px solid #f2c7c7;}",
      ".shuttle-explorer__status.is-loading{background:#f2f7ff;color:#234d7b;border:1px solid #d6e5fb;}",
      ".shuttle-explorer__status.is-ok{background:#f3fbf4;color:#225e2b;border:1px solid #cfe8d4;}",
	      ".shuttle-explorer__controls{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;gap:10px;margin:0 0 10px;}",
	      ".shuttle-explorer__field{display:flex;flex-direction:column;gap:4px;}",
	      ".shuttle-explorer__field--full{grid-column:1 / -1;}",
	      ".shuttle-explorer__field label{font-size:.82em;color:#4d5b6a;}",
	      ".shuttle-explorer__multi-field{position:relative;}",
	      ".shuttle-explorer__multi-toggle{width:100%;min-width:0;padding:7px 26px 7px 8px;border:1px solid #b7c1ce;border-radius:6px;background:#fff;color:#23364a;font:inherit;font-size:.9em;line-height:1.2;text-align:left;cursor:pointer;position:relative;}",
	      ".shuttle-explorer__multi-toggle::after{content:\"\";position:absolute;right:9px;top:50%;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #607184;transform:translateY(-40%);}",
	      ".shuttle-explorer__multi-menu{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:auto;width:max(100%,240px);max-width:calc(100vw - 32px);max-height:240px;overflow-y:auto;overflow-x:hidden;padding:6px;border:1px solid #b7c1ce;border-radius:8px;background:#fff;box-shadow:0 10px 24px rgba(35,54,74,.16);}",
	      ".shuttle-explorer__multi-option{display:flex;align-items:center;justify-content:flex-start;gap:.4rem;width:100%;box-sizing:border-box;text-align:left;padding:5px 4px;border-radius:5px;color:#23364a;font-size:.86em;line-height:1.25;cursor:pointer;}",
	      ".shuttle-explorer__multi-option:hover,.shuttle-explorer__multi-option:focus-within{background:#eef3f9;}",
	      ".shuttle-explorer__field .shuttle-explorer__multi-option input[type=\"checkbox\"]{appearance:auto;-webkit-appearance:checkbox;flex:0 0 auto;width:13px;min-width:13px;height:13px;padding:0;border:0;border-radius:0;background:transparent;margin:0;accent-color:#2f5374;}",
	      ".shuttle-explorer__multi-option-label{flex:1 1 auto;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:normal;}",
	      ".shuttle-explorer__years-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:10px;padding:8px 10px;border:1px solid #d5dbe3;border-radius:8px;background:#fff;}",
	      ".shuttle-explorer__years-control{display:flex;align-items:center;gap:10px;min-width:0;}",
	      ".shuttle-explorer__years-control label{flex:0 0 auto;white-space:nowrap;}",
	      ".shuttle-explorer__range-header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}",
      ".shuttle-explorer__range-value{color:inherit;font-size:inherit;font-weight:inherit;line-height:inherit;}",
      ".shuttle-explorer__range-meta{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}",
      ".shuttle-explorer__dual-range{position:relative;flex:1 1 auto;min-width:140px;height:22px;--shuttle-slider-track-height:4px;--shuttle-slider-track-color:#d5dbe3;--shuttle-slider-selection-color:rgba(47,83,116,.22);--year-range-start-pct:0%;--year-range-end-pct:100%;}",
      ".shuttle-explorer__dual-range::before,.shuttle-explorer__dual-range::after{content:\"\";position:absolute;left:0;right:0;top:50%;height:var(--shuttle-slider-track-height,4px);border-radius:999px;transform:translateY(-50%);pointer-events:none;}",
      ".shuttle-explorer__dual-range::before{background:var(--shuttle-slider-track-color,#d5dbe3);}",
      ".shuttle-explorer__dual-range::after{left:var(--year-range-start-pct);right:calc(100% - var(--year-range-end-pct));background:var(--shuttle-slider-selection-color,rgba(47,83,116,.22));}",
      ".shuttle-explorer__dual-range .shuttle-explorer__range-input{position:absolute;left:0;right:0;top:50%;width:100%;transform:translateY(-50%);pointer-events:none;appearance:none;-webkit-appearance:none;background:transparent;--shuttle-slider-input-track-color:transparent;z-index:1;}",
      ".shuttle-explorer__dual-range .shuttle-explorer__range-input::-webkit-slider-runnable-track{background:transparent;}",
      ".shuttle-explorer__dual-range .shuttle-explorer__range-input::-moz-range-track,.shuttle-explorer__dual-range .shuttle-explorer__range-input::-moz-range-progress{background:transparent;}",
      ".shuttle-explorer__dual-range .shuttle-explorer__range-input::-webkit-slider-thumb{pointer-events:auto;}",
      ".shuttle-explorer__dual-range .shuttle-explorer__range-input::-moz-range-thumb{pointer-events:auto;}",
      ".shuttle-explorer__label-row{display:inline-flex;align-items:center;gap:6px;}",
      ".shuttle-explorer__tooltip-wrap{position:relative;display:inline-flex;align-items:center;}",
      ".shuttle-explorer__tooltip-toggle{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:1px solid #b7c1ce;border-radius:999px;background:#fff;color:#2f5374;font-size:.74em;font-weight:700;line-height:1;cursor:help;}",
      ".shuttle-explorer__tooltip-toggle:hover,.shuttle-explorer__tooltip-toggle:focus{background:#eef3f9;}",
      ".shuttle-explorer__tooltip-toggle:focus{outline:2px solid #2f5374;outline-offset:1px;}",
      ".shuttle-explorer__tooltip{position:absolute;top:calc(100% + 6px);right:0;z-index:5;display:block;width:min(260px,calc(100vw - 40px));padding:8px 10px;border:1px solid #d5dbe3;border-radius:8px;background:#fff;box-shadow:0 8px 18px rgba(35,54,74,.12);color:#33475b;font-size:.82em;line-height:1.4;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-2px);transition:opacity .12s ease,transform .12s ease,visibility .12s ease;}",
      ".shuttle-explorer__tooltip-wrap.is-open .shuttle-explorer__tooltip,.shuttle-explorer__tooltip-wrap:hover .shuttle-explorer__tooltip,.shuttle-explorer__tooltip-wrap:focus-within .shuttle-explorer__tooltip{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0);}",
      ".shuttle-explorer__tooltip a{color:#2f5374;}",
      ".shuttle-explorer__tooltip a:hover,.shuttle-explorer__tooltip a:focus{text-decoration:underline;}",
	      ".shuttle-explorer__field input,.shuttle-explorer__field select{width:100%;padding:7px 8px;border:1px solid #b7c1ce;border-radius:6px;background:#fff;font:inherit;}",
      ".shuttle-explorer__field input.shuttle-explorer__range-input{--shuttle-slider-track-height:4px;--shuttle-slider-thumb-size:14px;--shuttle-slider-track-color:#d5dbe3;--shuttle-slider-thumb-color:#2f5374;--shuttle-slider-selection-color:rgba(47,83,116,.22);flex:1 1 auto;min-width:0;height:22px;padding:0;border:0;border-radius:0;background:transparent;accent-color:#2f5374;appearance:none;-webkit-appearance:none;}",
      ".shuttle-explorer__field input.shuttle-explorer__range-input::-webkit-slider-runnable-track{height:var(--shuttle-slider-track-height);border:0;border-radius:999px;background:var(--shuttle-slider-input-track-color,var(--shuttle-slider-track-color));}",
      ".shuttle-explorer__field input.shuttle-explorer__range-input::-webkit-slider-thumb{width:var(--shuttle-slider-thumb-size);height:var(--shuttle-slider-thumb-size);margin-top:calc((var(--shuttle-slider-track-height) - var(--shuttle-slider-thumb-size)) / 2);border:0;border-radius:50%;background:var(--shuttle-slider-thumb-color);cursor:pointer;appearance:none;-webkit-appearance:none;}",
      ".shuttle-explorer__field input.shuttle-explorer__range-input::-moz-range-track{height:var(--shuttle-slider-track-height);border:0;border-radius:999px;background:var(--shuttle-slider-input-track-color,var(--shuttle-slider-track-color));}",
      ".shuttle-explorer__field input.shuttle-explorer__range-input::-moz-range-progress{height:var(--shuttle-slider-track-height);border:0;border-radius:999px;background:var(--shuttle-slider-input-track-color,var(--shuttle-slider-track-color));}",
      ".shuttle-explorer__field input.shuttle-explorer__range-input::-moz-range-thumb{width:var(--shuttle-slider-thumb-size);height:var(--shuttle-slider-thumb-size);border:0;border-radius:50%;background:var(--shuttle-slider-thumb-color);cursor:pointer;}",
		      ".shuttle-explorer__row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 10px;}",
      ".shuttle-explorer__selection-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;}",
      ".shuttle-explorer__bulk{margin:0 0 10px;border:1px solid #d5dbe3;border-radius:8px;background:#fbfdff;}",
      ".shuttle-explorer__bulk-summary{margin:0;padding:10px;cursor:pointer;font-weight:600;font-size:.88em;color:#23364a;}",
      ".shuttle-explorer__bulk-summary-label{font-size:inherit;}",
      ".shuttle-explorer__bulk-summary-count{display:inline-block;margin-left:8px;color:#556779;font-size:.92em;font-weight:400;}",
      ".shuttle-explorer__bulk[open] .shuttle-explorer__bulk-summary{margin:0 0 8px 0;border-bottom:1px solid #e7edf4;}",
      ".shuttle-explorer__bulk-body{display:block;padding:0 10px 10px;}",
      ".shuttle-explorer__bulk-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:0 0 8px;}",
      ".shuttle-explorer__bulk-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0;}",
      ".shuttle-explorer__bulk-source{margin:10px 0 0;padding:10px;border:1px solid #dce3eb;border-radius:8px;background:#ffffff;}",
      ".shuttle-explorer__bulk-identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:8px 0 0;}",
      ".shuttle-explorer__bulk-source h4{margin:0;font-size:.95em;}",
      ".shuttle-explorer__bulk-guide{margin:10px 0 0;}",
      ".shuttle-explorer__cli-panel{margin:10px 0 0;padding:10px;border:1px solid #dce3eb;border-radius:8px;background:#ffffff;}",
      ".shuttle-explorer__cli-pre{margin:8px 0 0;padding:10px;border-radius:6px;background:#f3f6fa;overflow:auto;font-size:.82em;line-height:1.35;}",
      ".shuttle-explorer__summary{font-size:.9em;color:#33475b;}",
      ".shuttle-explorer__btn{display:inline-block;padding:7px 10px;border:1px solid #b7c1ce;border-radius:6px;background:#fff;color:#23364a;text-decoration:none;font:inherit;cursor:pointer;}",
      ".shuttle-explorer__btn:hover,.shuttle-explorer__btn:focus{background:#eef3f9;text-decoration:none;}",
      ".shuttle-explorer__btn:focus{outline:2px solid #2f5374;outline-offset:1px;}",
      ".shuttle-explorer__btn--small{padding:5px 8px;font-size:.86em;}",
      ".shuttle-explorer__btn[disabled]{opacity:.45;cursor:default;}",
      ".shuttle-explorer__table-wrap{overflow:auto;border:1px solid #d5dbe3;border-radius:8px;background:#fff;}",
      ".shuttle-explorer__table{width:100%;border-collapse:collapse;min-width:880px;font-size:.9em;}",
      ".shuttle-explorer__table th,.shuttle-explorer__table td{padding:8px 10px;border-bottom:1px solid #edf1f5;vertical-align:top;text-align:left;}",
      ".shuttle-explorer__table thead th{position:sticky;top:0;background:#f8fafc;z-index:1;}",
      ".shuttle-explorer__table tbody tr.shuttle-explorer__row--map-linked>td{background:#f3f7fb;box-shadow:inset 4px 0 0 #9b6a08;}",
      ".shuttle-explorer__table tbody tr.shuttle-explorer__row--map-active>td{background:#eef6ff;box-shadow:inset 4px 0 0 #2f5374;transition:background .18s ease,box-shadow .18s ease;}",
      ".shuttle-explorer__table th.shuttle-explorer__coord-col,.shuttle-explorer__table td.shuttle-explorer__coord-col{width:72px;min-width:72px;white-space:nowrap;}",
      ".shuttle-explorer__table td.shuttle-explorer__coord-col{font-variant-numeric:tabular-nums;}",
      ".shuttle-explorer__coord-col .shuttle-explorer__sort{white-space:nowrap;}",
      ".shuttle-explorer__source-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:.86em;font-weight:600;line-height:1.25;}",
      ".shuttle-explorer__source-badge--icos{background:#eef7f8;border:1px solid #b7d9dc;color:#245761;}",
      ".shuttle-explorer__source-badge--efd{background:#f9efe5;border:1px solid #dfc09a;color:#7b4a13;}",
      ".shuttle-explorer__source-badge--japanflux{background:#f4efe7;border:1px solid #d7b99a;color:#704624;}",
      ".shuttle-explorer__source-badge--base{background:#f8f3e8;border:1px solid #d9c288;color:#755319;}",
      ".shuttle-explorer__source-badge--ameriflux{background:#edf7f0;border:1px solid #b6dcc2;color:#1f6c3f;}",
      ".shuttle-explorer__source-badge--fluxnet2015{background:#fff4e5;border:1px solid #ebc47d;color:#8a5600;}",
      ".shuttle-explorer__source-badge--ameriflux-shuttle{background:#eef3fa;border:1px solid #b8c9e4;color:#2a4f7a;}",
      ".shuttle-explorer__source-badge--base-addition{background:#f4efe2;border:1px solid #d4bf92;color:#6f5220;}",
      ".shuttle-explorer__site-badge{margin-top:4px;}",
      ".shuttle-explorer__coverage-list{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}",
      ".shuttle-explorer__coverage-item{display:inline-flex;align-items:center;gap:4px;}",
      ".shuttle-explorer__coverage-sep{color:#607184;}",
      ".shuttle-explorer__coverage-badge{margin-top:6px;}",
      ".shuttle-explorer__download-cell{min-width:220px;}",
      ".shuttle-explorer__download-option + .shuttle-explorer__download-option{margin-top:8px;}",
      ".shuttle-explorer__download-option-label{margin:0 0 4px;color:#556779;font-size:.8em;font-weight:600;line-height:1.25;}",
      ".shuttle-explorer__sort{display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;padding:0;margin:0;color:inherit;font:inherit;cursor:pointer;}",
      ".shuttle-explorer__sort-indicator{color:#6b7a89;font-size:.9em;}",
      ".shuttle-explorer__table-copy-btn{display:inline-flex;max-width:11rem;padding:0;margin:0;border:0;background:transparent;color:#2f5374;font:inherit;font-weight:600;line-height:1.25;text-align:left;cursor:pointer;white-space:normal;}",
      ".shuttle-explorer__table-copy-btn:hover,.shuttle-explorer__table-copy-btn:focus{text-decoration:underline;}",
      ".shuttle-explorer__table-copy-btn:focus{outline:2px solid #2f5374;outline-offset:2px;border-radius:4px;}",
      ".shuttle-explorer__table-copy-btn.is-success{color:#25673a;}",
      ".shuttle-explorer__table-copy-btn.is-error{color:#a22f2f;}",
      ".shuttle-explorer__muted{color:#607184;}",
      ".shuttle-explorer__header p + p{margin-top:12px;}",
      ".shuttle-explorer__pagination{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 0;}",
      ".shuttle-explorer__pages{display:flex;flex-wrap:wrap;gap:6px;}",
      ".shuttle-explorer__page.is-active{background:#e8f0fb;border-color:#a8bddb;}",
      ".shuttle-explorer__empty{margin:10px 0 0;padding:12px;border:1px dashed #c6d1dd;border-radius:8px;background:#fbfdff;color:#3a4d60;}",
      ".shuttle-explorer__hidden{display:none !important;}",
      ".shuttle-explorer__attribution{margin:12px 0 0;padding:10px;border:1px solid #d5dbe3;border-radius:8px;background:#ffffff;}",
      ".shuttle-explorer__attribution h3{margin:0 0 6px;font-size:.95em;}",
      ".shuttle-explorer__attribution ul{margin:8px 0 0 18px;padding:0;}",
      ".shuttle-explorer__attribution li + li{margin-top:6px;}",
      ".shuttle-explorer__attribution-row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:8px 0 0;}",
	      ".shuttle-explorer__tiny{font-size:.82em;color:#556779;}",
		      ".shuttle-explorer__map-actions{display:flex;flex-direction:column;align-items:flex-end;gap:8px;}",
		      ".shuttle-explorer__map-reset-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:nowrap;width:max-content;max-width:100%;}",
	      ".shuttle-explorer__map-export-btn{font-size:.71em;}",
	      ".shuttle-explorer__map-shell{position:relative;}",
	      ".shuttle-explorer__map-control-panel{position:absolute;left:10px;bottom:10px;z-index:700;display:flex;flex-direction:column;gap:6px;max-width:min(280px,calc(100% - 20px));padding:8px 9px;border:1px solid rgba(183,193,206,.85);border-radius:8px;background:rgba(255,255,255,.94);box-shadow:0 4px 14px rgba(35,54,74,.14);}",
	      ".shuttle-explorer__map-toggle{display:inline-flex;align-items:center;gap:6px;font-size:.82em;color:#33475b;line-height:1.25;}",
	      ".shuttle-explorer__map-legend{display:flex;flex-direction:column;gap:5px;margin:0;max-width:260px;}",
	      ".shuttle-explorer__map-legend-item{display:inline-flex;align-items:center;gap:6px;line-height:1.3;}",
	      ".shuttle-explorer__map-legend-swatch{display:inline-block;width:10px;height:10px;border-radius:999px;flex:0 0 auto;}",
		      "@media (max-width: 860px){.shuttle-explorer__controls{grid-template-columns:1fr;}.shuttle-explorer__years-row{grid-template-columns:1fr;}.shuttle-explorer__row{flex-direction:column;align-items:flex-start;}.shuttle-explorer__bulk-identity-grid{grid-template-columns:1fr;}.shuttle-explorer__map-header{flex-direction:column;align-items:flex-start;}.shuttle-explorer__map-actions{align-items:flex-start;}.shuttle-explorer__map-reset-actions{justify-content:flex-start;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function createLayout(root) {
    root.classList.add("shuttle-explorer");
    root.innerHTML = [
      "<div class=\"shuttle-explorer__header\">",
      "  <h2>FLUXNET Data Explorer</h2>",
      "  <p class=\"shuttle-explorer__muted\">Explore and download a regularly refreshed snapshot of FLUXNET Shuttle coverage, selected direct FLUXNET archive supplements, JapanFlux2024 archive records, and AmeriFlux BASE (standardized observations) coverage (explorer refreshed: <span data-role=\"widget-refreshed-inline\">unavailable</span>). Search by site ID or site name, then open the download or landing-page links shown in the table. This explorer keeps source provenance explicit instead of folding every record into the FLUXNET Shuttle bucket.</p>",
      "  <p class=\"shuttle-explorer__muted\">Data are provided by site teams around the world. Shuttle-backed FLUXNET rows are served via the FLUXNET Shuttle (<a href=\"https://data.fluxnet.org/\" target=\"_blank\" rel=\"noopener\">https://data.fluxnet.org/</a>), additional FLUXNET rows may be surfaced through ICOS and AmeriFlux APIs, and JapanFlux2024 rows are surfaced separately from the ADS archive because they use FLUXNET-style conventions with dataset-specific adaptations.</p>",
      "</div>",
      "<p class=\"shuttle-explorer__status is-loading\" data-role=\"status\" role=\"status\" aria-live=\"polite\">Loading snapshot…</p>",
      "<div class=\"shuttle-explorer__controls shuttle-explorer__hidden\" data-role=\"controls\">",
      "  <div class=\"shuttle-explorer__field\">",
      "    <label for=\"shuttle-search\">Search (site ID or site name)</label>",
      "    <input id=\"shuttle-search\" type=\"search\" placeholder=\"e.g., US-Ton or Tonzi\" data-role=\"search\" />",
      "  </div>",
      "  " + buildMultiSelectFilterHtml({
        id: "shuttle-availability",
        role: "availability-filter",
        filterKey: "selectedAvailabilities",
        label: "Availability",
        allLabel: "All sites",
        pluralLabel: "availability filters",
        trackLabel: "availability"
      }),
      "  " + buildMultiSelectFilterHtml({
        id: "shuttle-source",
        role: "source-filter",
        filterKey: "selectedSources",
        label: "Source",
        allLabel: "All sources",
        pluralLabel: "sources",
        trackLabel: "source"
      }),
      "  " + buildMultiSelectFilterHtml({
        id: "shuttle-network",
        role: "network-filter",
        filterKey: "selectedNetworks",
        label: "Network",
        allLabel: "All networks",
        pluralLabel: "networks",
        trackLabel: "network"
      }),
      "  " + buildMultiSelectFilterHtml({
        id: "shuttle-country",
        role: "country-filter",
        filterKey: "selectedCountries",
        label: "Country",
        allLabel: "All countries",
        pluralLabel: "countries",
        trackLabel: "country"
      }),
      "  " + buildMultiSelectFilterHtml({
        id: "shuttle-vegetation",
        role: "vegetation-filter",
        filterKey: "selectedVegetations",
        labelHtml: [
          "<div class=\"shuttle-explorer__label-row\">",
          "  <label id=\"shuttle-vegetation-label\">Veg. type</label>",
          "  <span class=\"shuttle-explorer__tooltip-wrap\" data-role=\"vegetation-info-wrap\">",
          "    <button type=\"button\" class=\"shuttle-explorer__tooltip-toggle\" data-role=\"vegetation-info-toggle\" aria-label=\"About IGBP vegetation codes\" aria-describedby=\"shuttle-vegetation-tooltip\" aria-expanded=\"false\">i</button>",
          "    <span class=\"shuttle-explorer__tooltip\" id=\"shuttle-vegetation-tooltip\" role=\"tooltip\">Vegetation codes follow IGBP classifications as outlined <a href=\"https://fluxnet.org/data/badm-data-templates/igbp-classification/\" target=\"_blank\" rel=\"noopener noreferrer\">here</a></span>",
          "  </span>",
          "</div>"
        ].join(""),
        allLabel: "All Veg types",
        pluralLabel: "vegetation types",
        trackLabel: "vegetation_type"
      }),
      "  <div class=\"shuttle-explorer__field shuttle-explorer__field--full shuttle-explorer__years-row\">",
      "    <div class=\"shuttle-explorer__years-control shuttle-explorer__years-control--minimum\">",
      "      <label for=\"shuttle-minimum-years\">Min length: <span class=\"shuttle-explorer__range-value\" data-role=\"minimum-years-value\">1</span>+</label>",
      "      <input id=\"shuttle-minimum-years\" class=\"shuttle-explorer__range-input\" type=\"range\" min=\"1\" max=\"1\" step=\"1\" value=\"1\" data-role=\"minimum-years-filter\" />",
      "    </div>",
      "    <div class=\"shuttle-explorer__years-control shuttle-explorer__years-control--range\">",
      "      <label for=\"shuttle-year-range-start\">Years: <span class=\"shuttle-explorer__range-value\" data-role=\"year-range-value\">All years</span></label>",
      "      <div class=\"shuttle-explorer__dual-range\" data-role=\"year-range-control\">",
      "        <input id=\"shuttle-year-range-start\" class=\"shuttle-explorer__range-input\" type=\"range\" min=\"1900\" max=\"1900\" step=\"1\" value=\"1900\" data-role=\"year-range-start-filter\" aria-label=\"Start year\" />",
      "        <input id=\"shuttle-year-range-end\" class=\"shuttle-explorer__range-input\" type=\"range\" min=\"1900\" max=\"1900\" step=\"1\" value=\"1900\" data-role=\"year-range-end-filter\" aria-label=\"End year\" />",
      "      </div>",
      "    </div>",
      "  </div>",
      "</div>",
      "<section class=\"shuttle-explorer__map-panel shuttle-explorer__hidden\" data-role=\"map-panel\" aria-labelledby=\"shuttle-map-heading\">",
      "  <div class=\"shuttle-explorer__map-header\">",
      "    <div>",
      "      <h3 id=\"shuttle-map-heading\">Flux sites map</h3>",
      "      <p class=\"shuttle-explorer__tiny shuttle-explorer__map-summary\" data-role=\"map-summary\">Select one or more accessible-data sites to highlight them on the map.</p>",
      "    </div>",
      "    <div class=\"shuttle-explorer__map-actions\">",
      "      <div class=\"shuttle-explorer__map-reset-actions\">",
      "        <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"reset\">Reset filters</button>",
      "        <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small shuttle-explorer__hidden\" data-role=\"reset-map-view\">Reset map view</button>",
      "      </div>",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small shuttle-explorer__map-export-btn shuttle-explorer__hidden\" data-role=\"download-known-sites-csv\">Download site CSV</button>",
      "    </div>",
      "  </div>",
      "  <div class=\"shuttle-explorer__map-shell\">",
      "    <div class=\"shuttle-explorer__map-canvas\" data-role=\"map-canvas\" aria-label=\"Map of known and selected FLUXNET sites\"></div>",
      "    <div class=\"shuttle-explorer__map-empty\" data-role=\"map-empty\" aria-live=\"polite\">Select one or more accessible-data sites to highlight them on the map.</div>",
      "    <div class=\"shuttle-explorer__map-control-panel\" data-role=\"map-control-panel\">",
      "      <label class=\"shuttle-explorer__map-toggle\"><input type=\"checkbox\" data-role=\"known-sites-toggle\" checked /> Show all known sites</label>",
      "      " + buildKnownSitesLegendHtml(),
      "    </div>",
      "  </div>",
      "</section>",
      "<div class=\"shuttle-explorer__selection-actions shuttle-explorer__hidden\" data-role=\"selection-actions\">",
      "  <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"select-filtered\">Select all (filtered results)</button>",
      "  <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"select-all-sites\">Select all (all sites)</button>",
      "  <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"clear-selection\">Clear selection</button>",
      "</div>",
      "<details class=\"shuttle-explorer__bulk shuttle-explorer__hidden\" data-role=\"bulk-panel\">",
      "  <summary class=\"shuttle-explorer__bulk-summary\">",
      "    <span class=\"shuttle-explorer__bulk-summary-label\">Bulk download tools</span>",
      "    <span class=\"shuttle-explorer__bulk-summary-count\" data-role=\"selection-count\">0 selected sites</span>",
      "  </summary>",
      "  <div class=\"shuttle-explorer__bulk-body\">",
      "  <p class=\"shuttle-explorer__bulk-warning shuttle-explorer__hidden\" data-role=\"bulk-warning\"></p>",
      "  <div class=\"shuttle-explorer__bulk-actions shuttle-explorer__hidden\" data-role=\"all-selected-actions\">",
      "    <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"download-all-selected-script\">Download all selected scripts</button>",
      "    <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"copy-all-selected-script\">Copy download all selected script</button>",
      "  </div>",
      "  <section class=\"shuttle-explorer__bulk-source shuttle-explorer__hidden\" data-role=\"shuttle-bulk-section\" aria-labelledby=\"shuttle-bulk-source-heading\">",
      "    <div class=\"shuttle-explorer__bulk-header\">",
      "      <h4 id=\"shuttle-bulk-source-heading\">Bulk download for direct-link and Shuttle catalog rows</h4>",
      "      <p class=\"shuttle-explorer__tiny\" data-role=\"shuttle-selection-count\">0 direct-source sites selected</p>",
      "    </div>",
      "    <p class=\"shuttle-explorer__tiny\">Applies to validated direct-download rows from the FLUXNET Shuttle, ICOS direct links, and JapanFlux direct links. Landing-page-only rows remain in the manifest but are excluded from the links and shell-script outputs.</p>",
      "    <div class=\"shuttle-explorer__bulk-actions\">",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"download-script\">Download download_shuttle_selected.sh</button>",
      "    </div>",
      "    <div class=\"shuttle-explorer__bulk-actions\">",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"download-manifest\">Download shuttle_selected_manifest.csv</button>",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"download-links\">Download shuttle_links.txt</button>",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"download-sites-file\">Download shuttle_selected_sites.txt</button>",
      "    </div>",
      "    <div class=\"shuttle-explorer__bulk-actions\">",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"show-cli-command\">Show Shuttle CLI command</button>",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"copy-command\">Copy Shuttle CLI command</button>",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"copy-links\">Copy Shuttle links</button>",
      "    </div>",
      "  </section>",
      "  <section class=\"shuttle-explorer__bulk-source shuttle-explorer__hidden\" data-role=\"ameriflux-bulk-section\" aria-labelledby=\"ameriflux-bulk-source-heading\">",
      "    <div class=\"shuttle-explorer__bulk-header\">",
      "      <h4 id=\"ameriflux-bulk-source-heading\">Bulk download for surfaced AmeriFlux API products</h4>",
      "      <p class=\"shuttle-explorer__tiny\" data-role=\"ameriflux-selection-count\">0 sites available elsewhere selected</p>",
      "    </div>",
      "    <p class=\"shuttle-explorer__tiny\">Applies to surfaced AmeriFlux API products selected in the table. This includes AmeriFlux FLUXNET rows, BASE rows, FLUXNET2015 fallback rows, and any additional non-ONEFlux processed years surfaced alongside a FLUXNET-processed product.</p>",
      "    <p class=\"shuttle-explorer__tiny\">Optional: enter your own AmeriFlux username and email. If left blank, the generated script will use default values.</p>",
      "    <div class=\"shuttle-explorer__bulk-identity-grid\">",
      "      <div class=\"shuttle-explorer__field\">",
      "        <label>AmeriFlux username (optional)</label>",
      "        <input type=\"text\" autocomplete=\"username\" data-role=\"ameriflux-bulk-user-id\" />",
      "      </div>",
      "      <div class=\"shuttle-explorer__field\">",
      "        <label>AmeriFlux email (optional)</label>",
      "        <input type=\"email\" autocomplete=\"email\" data-role=\"ameriflux-bulk-user-email\" />",
      "      </div>",
      "    </div>",
      "    <div class=\"shuttle-explorer__bulk-actions\">",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"download-ameriflux-script\">Download download_ameriflux_selected.sh</button>",
      "    </div>",
      "    <div class=\"shuttle-explorer__bulk-actions\">",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"copy-ameriflux-script\">Copy AmeriFlux API shell script</button>",
      "      <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"download-ameriflux-sites-file\">Download ameriflux_selected_sites.txt</button>",
      "    </div>",
      "  </section>",
      "  <details class=\"shuttle-explorer__bulk-guide\">",
      "    <summary>How to use these bulk tools</summary>",
      "    <ul>",
      "      <li><strong>download_all_selected.sh</strong>: wrapper script that runs the direct-link and AmeriFlux API bulk scripts in sequence when the three generated scripts are kept in the same directory.</li>",
      "      <li><strong>Shuttle script</strong>: uses validated direct URLs plus retries/resume support for non-AmeriFlux rows that expose direct downloads.</li>",
      "      <li><strong>AmeriFlux API script</strong>: requests URLs dynamically for the surfaced AmeriFlux API products selected in the table, resolves the appropriate request URL for each selected product, and then downloads each returned file.</li>",
      "      <li><strong>Show Shuttle CLI command</strong>: reveals a command template that uses <code>shuttle_selected_sites.txt</code> and your local snapshot file.</li>",
      "      <li><strong>Copy Shuttle CLI command</strong>: copies the Shuttle CLI helper command shown in the panel.</li>",
      "      <li><strong>shuttle_selected_sites.txt</strong>: one <code>site_id</code> per line for Shuttle CLI workflows.</li>",
      "      <li><strong>ameriflux_selected_sites.txt</strong>: tab-delimited <code>site_id</code>, <code>data_product</code>, and <code>source_label</code> for AmeriFlux API-backed workflows.</li>",
      "      <li><strong>shuttle_selected_manifest.csv</strong>: selected non-AmeriFlux rows with source metadata, download modes, and links.</li>",
      "      <li><strong>shuttle_links.txt / Copy Shuttle links</strong>: validated direct URLs only (AmeriFlux rows, landing-page-only rows, and request-only rows are excluded).</li>",
      "    </ul>",
      "  </details>",
      "  <div class=\"shuttle-explorer__cli-panel shuttle-explorer__hidden\" data-role=\"cli-panel\">",
      "    <p class=\"shuttle-explorer__tiny\">The FLUXNET Shuttle CLI supports <code>download -f SNAPSHOT.csv -s SITE1 SITE2 ...</code> but does not provide a sites-file option. Use the helper command below with <code>shuttle_selected_sites.txt</code>.</p>",
      "    <pre class=\"shuttle-explorer__cli-pre\" data-role=\"cli-command\"></pre>",
      "  </div>",
      "  <p class=\"shuttle-explorer__tiny shuttle-explorer__bulk-status\" data-role=\"bulk-status\" aria-live=\"polite\"></p>",
      "  </div>",
      "</details>",
      "<div class=\"shuttle-explorer__table-wrap shuttle-explorer__hidden\" data-role=\"table-wrap\">",
      "  <table class=\"shuttle-explorer__table\" data-role=\"table\">",
      "    <thead><tr data-role=\"thead-row\"></tr></thead>",
      "    <tbody data-role=\"tbody\"></tbody>",
      "  </table>",
      "</div>",
      "<div class=\"shuttle-explorer__empty shuttle-explorer__hidden\" data-role=\"empty\"></div>",
      "<div class=\"shuttle-explorer__pagination shuttle-explorer__hidden\" data-role=\"pagination\">",
      "  <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"prev-page\">Previous</button>",
      "  <div class=\"shuttle-explorer__pages\" data-role=\"page-buttons\"></div>",
      "  <button type=\"button\" class=\"shuttle-explorer__btn shuttle-explorer__btn--small\" data-role=\"next-page\">Next</button>",
      "  <span class=\"shuttle-explorer__tiny shuttle-explorer__page-summary\" data-role=\"page-summary\"></span>",
      "</div>",
      "<aside class=\"shuttle-explorer__attribution\" data-role=\"data-notes\">",
      "  <h3>Data Notes</h3>",
      "  <p class=\"shuttle-explorer__tiny\">These notes highlight how the explorer labels datasets and how the bulk tools behave.</p>",
      "  <ul class=\"shuttle-explorer__tiny\">",
      "    <li>The explorer includes both gap-filled and partitioned data [FLUXNET] and non-gap-filled, non-partitioned observations [e.g., AmeriFlux-BASE].</li>",
      "    <li>If a site has different versions of its dataset published at different times, the explorer surfaces the most recently processed dataset.</li>",
      "    <li>Data labeled as FLUXNET in the year column have been gap-filled and partitioned with the ONEFlux processing pipeline. Use the Availability filter options [FLUXNET processed], [Other processed], and [Sites with both FLUXNET and additional processed years] to distinguish ONEFlux-derived coverage from non-ONEFlux processed coverage.</li>",
      "    <li>FLUXNET data are contributed by site teams around the world and distributed through one of three processing hubs: AmeriFlux (<a href=\"https://ameriflux.lbl.gov/\" target=\"_blank\" rel=\"noopener noreferrer\">https://ameriflux.lbl.gov/</a>), ICOS (<a href=\"https://www.icos-etc.eu/icos/\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.icos-etc.eu/icos/</a>), or TERN (<a href=\"https://www.tern.org.au/\" target=\"_blank\" rel=\"noopener noreferrer\">https://www.tern.org.au/</a>).</li>",
      "    <li>The FLUXNET Shuttle serves data processed with the most recent ONEFlux version and should generally be treated as the highest-quality processed product available here. Choose the Source filter option [FLUXNET-Shuttle] to view the subset of FLUXNET-format datasets generated with this most up-to-date processing.</li>",
      "    <li>Rows labeled [JapanFlux] come from the public JapanFlux2024 ADS archive. Although JapanFlux2024 is provided in the FLUXNET format and gap-filled/partitioned, it is not processed with ONEflux.</li>",
      "    <li>EFD rows indicate known data records from the public EFD site and policy pages. Access remains request-based, may require PI approval or PI contact, and may not be directly downloadable from EFD.</li>",
      "    <li>For some sites, the AmeriFlux-BASE product currently extends to years that are not yet available in the corresponding FLUXNET product. Records from both products are presented in such cases</li>",
      "    <li>The bulk-download scripts may require users to install a jq package if neither jq nor python3 are already installed. jq is a lightweight command-line JSON parser used by the script workflow.</li>",
      "  </ul>",
      "</aside>",
      "<aside class=\"shuttle-explorer__attribution\" data-role=\"attribution\">",
      "  <h3>Data Use and Attribution</h3>",
      "  <p class=\"shuttle-explorer__tiny\">Data users must follow dataset- and network-specific access, attribution, and citation guidance included with each downloaded archive or request workflow. All directly downloadable data are provided under <a href=\"https://creativecommons.org/licenses/by/4.0/\" target=\"_blank\" rel=\"noopener noreferrer\">CC-BY 4.0</a></p>",
      "</aside>"
    ].join("");
  }

  function Explorer(root) {
    var savedAmeriFluxBulkIdentity = readAmeriFluxBulkIdentityPreferences();
    this.root = root;
    this.jsonUrl = root.getAttribute("data-json-src") || DEFAULT_JSON_URL;
    this.csvUrl = root.getAttribute("data-csv-src") || DEFAULT_CSV_URL;
    this.icosDirectJsonUrl = root.getAttribute("data-icos-direct-json-src") || DEFAULT_ICOS_DIRECT_JSON_URL;
    this.icosDirectCsvUrl = root.getAttribute("data-icos-direct-csv-src") || DEFAULT_ICOS_DIRECT_CSV_URL;
    this.japanFluxJsonUrl = root.getAttribute("data-japanflux-direct-json-src") || DEFAULT_JAPANFLUX_DIRECT_JSON_URL;
    this.japanFluxCsvUrl = root.getAttribute("data-japanflux-direct-csv-src") || DEFAULT_JAPANFLUX_DIRECT_CSV_URL;
    this.efdJsonUrl = root.getAttribute("data-efd-curated-json-src") || root.getAttribute("data-efd-json-src") || DEFAULT_EFD_JSON_URL;
    this.efdCsvUrl = root.getAttribute("data-efd-curated-csv-src") || root.getAttribute("data-efd-csv-src") || DEFAULT_EFD_CSV_URL;
    this.ameriFluxSiteInfoUrl = root.getAttribute("data-ameriflux-site-info-src") || AMERIFLUX_SITE_INFO_URL;
    this.fluxnet2015SiteInfoUrl = root.getAttribute("data-fluxnet2015-site-info-src") || FLUXNET2015_SITE_INFO_URL;
    this.siteNameMetadataUrl = root.getAttribute("data-site-name-metadata-src") || SITE_NAME_METADATA_URL;
    this.vegetationMetadataUrl = root.getAttribute("data-vegetation-metadata-src") || SITE_VEGETATION_METADATA_URL;
    this.allKnownSitesMapJsonUrl = root.getAttribute("data-all-known-sites-map-json-src") || DEFAULT_ALL_KNOWN_SITES_MAP_JSON_URL;
    this.pageSize = Math.max(1, parseInt(root.getAttribute("data-page-size") || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE);
    var ameriIdentity = resolveAmeriFluxIdentityFromRoot(root);
    this.shuttleSource = new ShuttleSource(this.jsonUrl, this.csvUrl);
    this.icosDirectSource = new ShuttleSource(this.icosDirectJsonUrl, this.icosDirectCsvUrl);
    this.japanFluxSource = new ShuttleSource(this.japanFluxJsonUrl, this.japanFluxCsvUrl);
    this.efdSource = new ShuttleSource(this.efdJsonUrl, this.efdCsvUrl);
    this.ameriFluxSource = new AmeriFluxSource({
      availabilityUrl: AMERIFLUX_FLUXNET_AVAILABILITY_URL,
      downloadUrl: AMERIFLUX_V2_DOWNLOAD_URL,
      userId: ameriIdentity.userId,
      userEmail: ameriIdentity.userEmail,
      trustedRuntime: ameriIdentity.trustedRuntime,
      dataProduct: AMERIFLUX_FLUXNET_PRODUCT,
      sourceLabel: AMERIFLUX_SOURCE_ONLY,
      availabilityCacheKey: AMERIFLUX_FLUXNET_AVAILABILITY_CACHE_KEY,
      freshnessNamespace: "ameriflux-fluxnet",
      availabilityRetryCount: AVAILABILITY_HTTP_RETRIES,
      availabilityTimeoutMs: AVAILABILITY_REQUEST_TIMEOUT_MS
    });
    this.ameriFluxBaseSource = new AmeriFluxSource({
      availabilityUrl: AMERIFLUX_BASE_AVAILABILITY_URL,
      downloadUrl: AMERIFLUX_V2_DOWNLOAD_URL,
      userId: ameriIdentity.userId,
      userEmail: ameriIdentity.userEmail,
      trustedRuntime: ameriIdentity.trustedRuntime,
      dataProduct: AMERIFLUX_BASE_PRODUCT,
      sourceLabel: BASE_SOURCE_ONLY,
      availabilityCacheKey: AMERIFLUX_BASE_AVAILABILITY_CACHE_KEY,
      freshnessNamespace: "ameriflux-base",
      availabilityRetryCount: AVAILABILITY_HTTP_RETRIES,
      availabilityTimeoutMs: AVAILABILITY_REQUEST_TIMEOUT_MS
    });
    this.fluxnet2015Source = new AmeriFluxSource({
      availabilityUrl: FLUXNET2015_AVAILABILITY_URL,
      downloadUrl: AMERIFLUX_V1_DOWNLOAD_URL,
      userId: ameriIdentity.userId,
      userEmail: ameriIdentity.userEmail,
      trustedRuntime: ameriIdentity.trustedRuntime,
      dataProduct: FLUXNET2015_PRODUCT,
      sourceLabel: FLUXNET2015_SOURCE_ONLY,
      availabilityCacheKey: FLUXNET2015_AVAILABILITY_CACHE_KEY,
      freshnessNamespace: "ameriflux-fluxnet2015",
      availabilityRetryCount: AVAILABILITY_HTTP_RETRIES,
      availabilityTimeoutMs: AVAILABILITY_REQUEST_TIMEOUT_MS
    });
    this.ameriFluxApiSources = {};
    this.ameriFluxApiSources[AMERIFLUX_FLUXNET_PRODUCT] = this.ameriFluxSource;
    this.ameriFluxApiSources[AMERIFLUX_BASE_PRODUCT] = this.ameriFluxBaseSource;
    this.ameriFluxApiSources[FLUXNET2015_PRODUCT] = this.fluxnet2015Source;

    this.state = {
      mode: "loading",
      rows: [],
      filteredRows: [],
      source: "",
      sourceUrl: "",
      warning: "",
      downloadWarning: "",
      snapshotRefreshedDate: "",
      snapshotUpdatedDate: "",
      droppedRows: 0,
      errorMessage: "",
      search: "",
      selectedNetwork: "",
      selectedSource: "",
      selectedAvailability: "",
      selectedCountry: "",
      selectedVegetation: "",
      selectedNetworks: [],
      selectedSources: [],
      selectedAvailabilities: [],
      selectedCountries: [],
      selectedVegetations: [],
      minimumYears: DEFAULT_MINIMUM_YEARS_FILTER,
      maxAvailableYears: DEFAULT_MINIMUM_YEARS_FILTER,
      yearRangeStart: null,
      yearRangeEnd: null,
      yearRangeBounds: availableYearRangeBounds([]),
      selectedKeys: {},
      cliPanelVisible: false,
      sortKey: "data_hub",
      sortDir: "asc",
      page: 1,
      ameriFluxBulkUserIdInput: savedAmeriFluxBulkIdentity.userId,
      ameriFluxBulkUserEmailInput: savedAmeriFluxBulkIdentity.userEmail,
      amerifluxTotalSites: 0,
      amerifluxSitesWithYears: 0,
      amerifluxOverlapSites: 0,
      amerifluxOnlySites: 0,
      fluxnet2015TotalSites: 0,
      fluxnet2015SitesWithYears: 0,
      fluxnet2015OnlySites: 0,
      knownSiteMapRows: [],
      mapAccessibleRows: [],
      knownSiteOverlayEnabled: true,
      knownSiteMapWarning: ""
    };
    this.tableRowsBySiteKey = {};
    this.mapMarkerBySiteKey = {};
    this.tableHoveredSiteKey = "";
    this.mapHoveredSiteKey = "";
    this.highlightedMapMarkerSiteKey = "";
    this.highlightedMapMarker = null;
    this.activeLinkedRowSiteKey = "";
    this._linkedRowActiveTimer = null;

    createLayout(root);
    this.bindings = this.getBindings();
    this.syncAmeriFluxBulkIdentityInputs();
    this.bindEvents();
    this.renderTableHeader();
    this.setAttributionText(buildAttributionText("", ""), buildAttributionHtml("", ""));
    this.render();
  }

  Explorer.prototype.getBindings = function () {
    return {
      status: bySelector(this.root, "[data-role='status']"),
      controls: bySelector(this.root, "[data-role='controls']"),
      search: bySelector(this.root, "[data-role='search']"),
      networkFilter: bySelector(this.root, "[data-role='network-filter']"),
      sourceFilter: bySelector(this.root, "[data-role='source-filter']"),
      availabilityFilter: bySelector(this.root, "[data-role='availability-filter']"),
      countryFilter: bySelector(this.root, "[data-role='country-filter']"),
      vegetationFilter: bySelector(this.root, "[data-role='vegetation-filter']"),
      minimumYearsFilter: bySelector(this.root, "[data-role='minimum-years-filter']"),
      minimumYearsValue: bySelector(this.root, "[data-role='minimum-years-value']"),
      minimumYearsRange: bySelector(this.root, "[data-role='minimum-years-range']"),
      yearRangeStartFilter: bySelector(this.root, "[data-role='year-range-start-filter']"),
      yearRangeEndFilter: bySelector(this.root, "[data-role='year-range-end-filter']"),
      yearRangeValue: bySelector(this.root, "[data-role='year-range-value']"),
      vegetationInfoWrap: bySelector(this.root, "[data-role='vegetation-info-wrap']"),
      vegetationInfoToggle: bySelector(this.root, "[data-role='vegetation-info-toggle']"),
      widgetRefreshedInline: bySelector(this.root, "[data-role='widget-refreshed-inline']"),
      widgetLastUpdatedInline: bySelector(this.root, "[data-role='widget-last-updated-inline']"),
      summary: bySelector(this.root, "[data-role='summary']"),
      reset: bySelector(this.root, "[data-role='reset']"),
      selectionActions: bySelector(this.root, "[data-role='selection-actions']"),
      bulkPanel: bySelector(this.root, "[data-role='bulk-panel']"),
      selectionCount: bySelector(this.root, "[data-role='selection-count']"),
      allSelectedActions: bySelector(this.root, "[data-role='all-selected-actions']"),
      bulkWarning: bySelector(this.root, "[data-role='bulk-warning']"),
      downloadAllSelectedScript: bySelector(this.root, "[data-role='download-all-selected-script']"),
      copyAllSelectedScript: bySelector(this.root, "[data-role='copy-all-selected-script']"),
      shuttleBulkSection: bySelector(this.root, "[data-role='shuttle-bulk-section']"),
      shuttleSelectionCount: bySelector(this.root, "[data-role='shuttle-selection-count']"),
      ameriFluxBulkSection: bySelector(this.root, "[data-role='ameriflux-bulk-section']"),
      ameriFluxSelectionCount: bySelector(this.root, "[data-role='ameriflux-selection-count']"),
      ameriFluxBulkUserId: bySelector(this.root, "[data-role='ameriflux-bulk-user-id']"),
      ameriFluxBulkUserEmail: bySelector(this.root, "[data-role='ameriflux-bulk-user-email']"),
      selectFiltered: bySelector(this.root, "[data-role='select-filtered']"),
      selectAllSites: bySelector(this.root, "[data-role='select-all-sites']"),
      clearSelection: bySelector(this.root, "[data-role='clear-selection']"),
      downloadManifest: bySelector(this.root, "[data-role='download-manifest']"),
      downloadLinks: bySelector(this.root, "[data-role='download-links']"),
      downloadScript: bySelector(this.root, "[data-role='download-script']"),
      downloadSitesFile: bySelector(this.root, "[data-role='download-sites-file']"),
      downloadAmeriFluxSitesFile: bySelector(this.root, "[data-role='download-ameriflux-sites-file']"),
      downloadAmeriFluxScript: bySelector(this.root, "[data-role='download-ameriflux-script']"),
      copyAmeriFluxScript: bySelector(this.root, "[data-role='copy-ameriflux-script']"),
      copyLinks: bySelector(this.root, "[data-role='copy-links']"),
      showCliCommand: bySelector(this.root, "[data-role='show-cli-command']"),
      copyCommand: bySelector(this.root, "[data-role='copy-command']"),
      cliPanel: bySelector(this.root, "[data-role='cli-panel']"),
      cliCommand: bySelector(this.root, "[data-role='cli-command']"),
      bulkStatus: bySelector(this.root, "[data-role='bulk-status']"),
      mapPanel: bySelector(this.root, "[data-role='map-panel']"),
      mapSummary: bySelector(this.root, "[data-role='map-summary']"),
      knownSitesToggle: bySelector(this.root, "[data-role='known-sites-toggle']"),
      knownSitesLegend: bySelector(this.root, "[data-role='known-sites-legend']"),
      mapControlPanel: bySelector(this.root, "[data-role='map-control-panel']"),
      mapCanvas: bySelector(this.root, "[data-role='map-canvas']"),
      mapEmpty: bySelector(this.root, "[data-role='map-empty']"),
      resetMapView: bySelector(this.root, "[data-role='reset-map-view']"),
      downloadKnownSitesCsv: bySelector(this.root, "[data-role='download-known-sites-csv']"),
      tableWrap: bySelector(this.root, "[data-role='table-wrap']"),
      table: bySelector(this.root, "[data-role='table']"),
      theadRow: bySelector(this.root, "[data-role='thead-row']"),
      tbody: bySelector(this.root, "[data-role='tbody']"),
      empty: bySelector(this.root, "[data-role='empty']"),
      pagination: bySelector(this.root, "[data-role='pagination']"),
      prevPage: bySelector(this.root, "[data-role='prev-page']"),
      nextPage: bySelector(this.root, "[data-role='next-page']"),
      pageButtons: bySelector(this.root, "[data-role='page-buttons']"),
      pageSummary: bySelector(this.root, "[data-role='page-summary']"),
      attributionText: bySelector(this.root, "[data-role='attribution-text']"),
      copyAttribution: bySelector(this.root, "[data-role='copy-attribution']"),
      copyStatus: bySelector(this.root, "[data-role='copy-status']")
    };
  };

	  Explorer.prototype.setVegetationTooltipOpen = function (isOpen) {
	    if (!this.bindings.vegetationInfoWrap || !this.bindings.vegetationInfoToggle) {
	      return;
	    }
	    this.bindings.vegetationInfoWrap.classList.toggle("is-open", !!isOpen);
	    this.bindings.vegetationInfoToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
	  };

  Explorer.prototype.getMultiFilterContainers = function () {
    return [
      this.bindings.availabilityFilter,
      this.bindings.sourceFilter,
      this.bindings.networkFilter,
      this.bindings.countryFilter,
      this.bindings.vegetationFilter
    ].filter(Boolean);
  };

  Explorer.prototype.syncLegacySingleFilterState = function (filterKey) {
    var selected = normalizeFilterSelection(this.state[filterKey]);
    var singleValue = selected.length === 1 ? selected[0] : "";
    if (filterKey === "selectedNetworks") {
      this.state.selectedNetwork = singleValue;
    } else if (filterKey === "selectedSources") {
      this.state.selectedSource = singleValue;
    } else if (filterKey === "selectedAvailabilities") {
      this.state.selectedAvailability = singleValue;
    } else if (filterKey === "selectedCountries") {
      this.state.selectedCountry = singleValue;
    } else if (filterKey === "selectedVegetations") {
      this.state.selectedVegetation = singleValue;
    }
  };

  Explorer.prototype.setMultiFilterSelection = function (filterKey, values) {
    if (!filterKey) {
      return [];
    }
    this.state[filterKey] = normalizeFilterSelection(values);
    this.syncLegacySingleFilterState(filterKey);
    return this.state[filterKey];
  };

  Explorer.prototype.setMultiSelectOpen = function (container, isOpen) {
    var toggle = bySelector(container, "[data-role='multi-toggle']");
    var menu = bySelector(container, "[data-role='multi-menu']");
    if (!container || !toggle || !menu) {
      return;
    }
    container.classList.toggle("is-open", !!isOpen);
    menu.classList.toggle("shuttle-explorer__hidden", !isOpen);
    if (isOpen) {
      menu.scrollLeft = 0;
    }
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  Explorer.prototype.closeMultiSelects = function (except) {
    this.getMultiFilterContainers().forEach(function (container) {
      if (container !== except) {
        this.setMultiSelectOpen(container, false);
      }
    }, this);
  };

  Explorer.prototype.optionValuesFromMultiSelect = function (container) {
    return qsa(container, "input[data-role='multi-option']:checked").map(function (input) {
      return String(input.value || "");
    }).filter(Boolean);
  };

  Explorer.prototype.syncMultiSelectFilterControl = function (container) {
    var filterKey = container ? String(container.getAttribute("data-filter-key") || "") : "";
    var allLabel = container ? String(container.getAttribute("data-all-label") || "All") : "All";
    var pluralLabel = container ? String(container.getAttribute("data-plural-label") || "items") : "items";
    var inputs;
    var optionList;
    var selected;
    var selectedLookup = {};
    var allInput;
    var summary;
    if (!container || !filterKey) {
      return;
    }
    inputs = qsa(container, "input[data-role='multi-option']");
    optionList = inputs.map(function (input) {
      var label = input.parentNode && input.parentNode.querySelector
        ? input.parentNode.querySelector(".shuttle-explorer__multi-option-label")
        : null;
      return {
        value: String(input.value || ""),
        label: label ? String(label.textContent || input.value || "") : String(input.value || "")
      };
    }).filter(function (option) {
      return !!option.value;
    });
    selected = normalizeFilterSelection(this.state[filterKey]);
    if (optionList.length) {
      selected = pruneFilterSelection(selected, optionList.map(function (option) {
        return option.value;
      }));
      this.setMultiFilterSelection(filterKey, selected);
    }
    selected.forEach(function (value) {
      selectedLookup[value] = true;
    });
    inputs.forEach(function (input) {
      input.checked = !!selectedLookup[String(input.value || "")];
    });
    allInput = bySelector(container, "[data-role='multi-all']");
    if (allInput) {
      allInput.checked = selected.length === 0;
    }
    summary = bySelector(container, "[data-role='multi-summary']");
    if (summary) {
      summary.textContent = filterSelectionLabel(selected, optionList, allLabel, pluralLabel);
      summary.title = summary.textContent;
    }
  };

  Explorer.prototype.syncMultiSelectFilterControls = function () {
    this.getMultiFilterContainers().forEach(function (container) {
      this.syncMultiSelectFilterControl(container);
    }, this);
  };

  Explorer.prototype.applyMultiSelectFilter = function (container, shouldTrack) {
    var filterKey = container ? String(container.getAttribute("data-filter-key") || "") : "";
    var trackLabel = container ? String(container.getAttribute("data-track-label") || filterKey) : filterKey;
    var selected;
    if (!filterKey) {
      return;
    }
    selected = this.setMultiFilterSelection(filterKey, this.optionValuesFromMultiSelect(container));
    this.syncMultiSelectFilterControl(container);
    this.state.page = 1;
    this.updateDerivedState();
    this.render();
    if (shouldTrack) {
      this.trackFilterChange(trackLabel, selected.join("|"));
    }
  };

  Explorer.prototype.bindMultiSelectFilter = function (container) {
    var self = this;
    if (!container) {
      return;
    }
    container.addEventListener("click", function (event) {
      var toggle = event.target && event.target.closest ? event.target.closest("[data-role='multi-toggle']") : null;
      if (!toggle || !container.contains(toggle)) {
        return;
      }
      event.preventDefault();
      self.closeMultiSelects(container);
      self.setMultiSelectOpen(container, !container.classList.contains("is-open"));
    });
    container.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || event.key === "Esc") {
        self.setMultiSelectOpen(container, false);
        var toggle = bySelector(container, "[data-role='multi-toggle']");
        if (toggle) {
          toggle.focus();
        }
      }
    });
    container.addEventListener("change", function (event) {
      var target = event.target;
      if (!target || target.tagName !== "INPUT") {
        return;
      }
      if (target.getAttribute("data-role") === "multi-all") {
        qsa(container, "input[data-role='multi-option']").forEach(function (input) {
          input.checked = false;
        });
        self.applyMultiSelectFilter(container, true);
        return;
      }
      if (target.getAttribute("data-role") === "multi-option") {
        self.applyMultiSelectFilter(container, true);
      }
    });
  };

  Explorer.prototype.populateMultiSelectFilter = function (container, options) {
    var filterKey = container ? String(container.getAttribute("data-filter-key") || "") : "";
    var optionList = (options || []).map(function (option) {
      if (option && typeof option === "object") {
        return {
          value: String(option.value || ""),
          label: String(option.label || option.value || "")
        };
      }
      return {
        value: String(option || ""),
        label: String(option || "")
      };
    }).filter(function (option) {
      return !!option.value;
    });
    var optionValues = optionList.map(function (option) {
      return option.value;
    });
    var selected;
    var optionsWrap;
    if (!container || !filterKey) {
      return;
    }
    selected = pruneFilterSelection(this.state[filterKey], optionValues);
    this.setMultiFilterSelection(filterKey, selected);
    optionsWrap = bySelector(container, "[data-role='multi-options']");
    if (optionsWrap) {
      optionsWrap.innerHTML = "";
      optionList.forEach(function (option) {
        var label = document.createElement("label");
        var input = document.createElement("input");
        var text = document.createElement("span");
        label.className = "shuttle-explorer__multi-option";
        text.className = "shuttle-explorer__multi-option-label";
        input.type = "checkbox";
        input.value = option.value;
        input.checked = selected.indexOf(option.value) !== -1;
        input.setAttribute("data-role", "multi-option");
        text.textContent = option.label;
        text.title = option.label;
        label.appendChild(input);
        label.appendChild(text);
        optionsWrap.appendChild(label);
      });
    }
    this.syncMultiSelectFilterControl(container);
  };

	  Explorer.prototype.findLinkedTableRow = function (target) {
    var tbody = this.bindings.tbody;
    while (target && target !== tbody) {
      if (target.tagName === "TR" && target.getAttribute("data-site-key")) {
        return target;
      }
      target = target.parentNode;
    }
    return null;
  };

  Explorer.prototype.registerLinkedTableRow = function (row, tr) {
    var siteKey = mapSiteKey(row);
    if (!siteKey || !tr) {
      return "";
    }
    tr.setAttribute("data-site-key", siteKey);
    addToSiteKeyLookup(this.tableRowsBySiteKey, siteKey, tr);
    this.applyLinkedRowStateToElement(tr, siteKey);
    return siteKey;
  };

  Explorer.prototype.applyLinkedRowStateToElement = function (rowEl, siteKey) {
    if (!rowEl || !rowEl.classList) {
      return;
    }
    rowEl.classList.toggle("shuttle-explorer__row--map-linked", !!siteKey && this.mapHoveredSiteKey === siteKey);
    rowEl.classList.toggle("shuttle-explorer__row--map-active", !!siteKey && this.activeLinkedRowSiteKey === siteKey);
  };

  Explorer.prototype.setLinkedRowsClass = function (siteKey, className, enabled) {
    siteKeyLookupEntries(this.tableRowsBySiteKey, siteKey).forEach(function (rowEl) {
      if (rowEl && rowEl.classList) {
        rowEl.classList.toggle(className, !!enabled);
      }
    });
  };

  Explorer.prototype.clearMapMarkerHighlight = function () {
    var marker = this.highlightedMapMarker;
    if (marker && marker.setStyle && marker._shuttleExplorerBaseStyle) {
      marker.setStyle(marker._shuttleExplorerBaseStyle);
    }
    this.highlightedMapMarker = null;
    this.highlightedMapMarkerSiteKey = "";
  };

  Explorer.prototype.setMapMarkerHighlight = function (siteKey) {
    var marker;
    if (siteKey === this.highlightedMapMarkerSiteKey) {
      return;
    }
    this.clearMapMarkerHighlight();
    marker = this.mapMarkerBySiteKey && siteKey ? this.mapMarkerBySiteKey[siteKey] : null;
    if (!marker || !marker.setStyle) {
      return;
    }
    marker.setStyle(linkedMarkerHighlightStyle(marker._shuttleExplorerBaseStyle || marker.options || {}));
    if (marker.bringToFront) {
      marker.bringToFront();
    }
    this.highlightedMapMarker = marker;
    this.highlightedMapMarkerSiteKey = siteKey;
  };

  Explorer.prototype.updateMapMarkerHighlight = function () {
    this.setMapMarkerHighlight(this.mapHoveredSiteKey || this.tableHoveredSiteKey || "");
  };

  Explorer.prototype.handleTableRowMapLinkEnter = function (rowEl) {
    var siteKey = rowEl ? String(rowEl.getAttribute("data-site-key") || "") : "";
    if (!siteKey) {
      return;
    }
    this.tableHoveredSiteKey = siteKey;
    this.updateMapMarkerHighlight();
  };

  Explorer.prototype.handleTableRowMapLinkLeave = function (rowEl) {
    var siteKey = rowEl ? String(rowEl.getAttribute("data-site-key") || "") : "";
    if (siteKey && this.tableHoveredSiteKey === siteKey) {
      this.tableHoveredSiteKey = "";
      this.updateMapMarkerHighlight();
    }
  };

  Explorer.prototype.handleMapMarkerLinkEnter = function (siteKey) {
    if (!siteKey) {
      return;
    }
    if (this.mapHoveredSiteKey && this.mapHoveredSiteKey !== siteKey) {
      this.setLinkedRowsClass(this.mapHoveredSiteKey, "shuttle-explorer__row--map-linked", false);
    }
    this.mapHoveredSiteKey = siteKey;
    this.setLinkedRowsClass(siteKey, "shuttle-explorer__row--map-linked", true);
    this.updateMapMarkerHighlight();
  };

  Explorer.prototype.handleMapMarkerLinkLeave = function (siteKey) {
    if (!siteKey || this.mapHoveredSiteKey !== siteKey) {
      return;
    }
    this.setLinkedRowsClass(siteKey, "shuttle-explorer__row--map-linked", false);
    this.mapHoveredSiteKey = "";
    this.updateMapMarkerHighlight();
  };

  Explorer.prototype.activateLinkedTableRows = function (siteKey, shouldScroll) {
    var rows = siteKeyLookupEntries(this.tableRowsBySiteKey, siteKey);
    var timer = typeof window !== "undefined" && window.setTimeout ? window : globalThis;
    if (!rows.length) {
      return false;
    }
    if (this.activeLinkedRowSiteKey && this.activeLinkedRowSiteKey !== siteKey) {
      this.setLinkedRowsClass(this.activeLinkedRowSiteKey, "shuttle-explorer__row--map-active", false);
    }
    this.activeLinkedRowSiteKey = siteKey;
    this.setLinkedRowsClass(siteKey, "shuttle-explorer__row--map-active", true);
    if (shouldScroll && rows[0] && rows[0].scrollIntoView) {
      rows[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (this._linkedRowActiveTimer) {
      timer.clearTimeout(this._linkedRowActiveTimer);
    }
    this._linkedRowActiveTimer = timer.setTimeout(function () {
      this.setLinkedRowsClass(siteKey, "shuttle-explorer__row--map-active", false);
      if (this.activeLinkedRowSiteKey === siteKey) {
        this.activeLinkedRowSiteKey = "";
      }
      this._linkedRowActiveTimer = null;
    }.bind(this), MAP_LINKED_ROW_ACTIVE_MS);
    return true;
  };

  Explorer.prototype.handleMapMarkerLinkClick = function (siteKey) {
    this.activateLinkedTableRows(siteKey, true);
  };

  Explorer.prototype.bindLinkedMapMarker = function (marker, siteKey) {
    var self = this;
    if (!marker || !siteKey || !marker.on) {
      return;
    }
    marker.on("mouseover", function () {
      self.handleMapMarkerLinkEnter(siteKey);
    });
    marker.on("mouseout", function () {
      self.handleMapMarkerLinkLeave(siteKey);
    });
    marker.on("click", function () {
      self.handleMapMarkerLinkClick(siteKey);
    });
  };

  Explorer.prototype.bindEvents = function () {
    var self = this;
    var b = this.bindings;
    var applySearch = function () {
      self._searchDebounceTimer = null;
      self.state.search = String(b.search.value || "");
      self.state.page = 1;
      self.updateDerivedState();
      self.render();
      gaEvent("fx_search", {
        q_len: self.state.search.length,
        results: self.state.filteredRows.length
      });
    };

    if (b.search) {
      b.search.addEventListener("input", function () {
        if (self._searchDebounceTimer) {
          window.clearTimeout(self._searchDebounceTimer);
        }
        self._searchDebounceTimer = window.setTimeout(applySearch, SEARCH_DEBOUNCE_MS);
      });
    }

    this.getMultiFilterContainers().forEach(function (container) {
      self.bindMultiSelectFilter(container);
    });
    if (typeof document !== "undefined") {
      document.addEventListener("click", function (event) {
        var target = event.target;
        if (self.getMultiFilterContainers().some(function (container) {
          return container && container.contains(target);
        })) {
          return;
        }
        self.closeMultiSelects();
      });
    }

    if (b.minimumYearsFilter) {
      var applyMinimumYears = function (shouldTrack) {
        self.state.minimumYears = normalizeMinimumYearsValue(
          b.minimumYearsFilter.value,
          self.state.maxAvailableYears
        );
        self.state.page = 1;
        self.syncMinimumYearsFilterControl();
        self.updateDerivedState();
        self.render();
        if (shouldTrack) {
          self.trackFilterChange("minimum_years", self.state.minimumYears);
        }
      };

      b.minimumYearsFilter.addEventListener("input", function () {
        applyMinimumYears(false);
      });
      b.minimumYearsFilter.addEventListener("change", function () {
        applyMinimumYears(true);
      });
    }

    if (b.yearRangeStartFilter && b.yearRangeEndFilter) {
      var applyYearRange = function (changedHandle, shouldTrack) {
        var start = normalizeCoverageYear(b.yearRangeStartFilter.value);
        var end = normalizeCoverageYear(b.yearRangeEndFilter.value);
        if (start != null && end != null && start > end) {
          if (changedHandle === "start") {
            end = start;
          } else {
            start = end;
          }
        }
        var normalized = normalizeYearRangeFilter(
          { start: start, end: end },
          self.state.yearRangeBounds
        );
        self.state.yearRangeStart = normalized.start;
        self.state.yearRangeEnd = normalized.end;
        self.state.page = 1;
        self.syncYearRangeFilterControl(true);
        self.updateDerivedState();
        self.render();
        if (shouldTrack) {
          self.trackFilterChange("year_range", normalized.hasBounds ? (normalized.start + "-" + normalized.end) : "");
        }
      };

      b.yearRangeStartFilter.addEventListener("input", function () {
        applyYearRange("start", false);
      });
      b.yearRangeStartFilter.addEventListener("change", function () {
        applyYearRange("start", true);
      });
      b.yearRangeEndFilter.addEventListener("input", function () {
        applyYearRange("end", false);
      });
      b.yearRangeEndFilter.addEventListener("change", function () {
        applyYearRange("end", true);
      });
    }

    if (b.vegetationInfoWrap && b.vegetationInfoToggle) {
      this.setVegetationTooltipOpen(false);
      b.vegetationInfoToggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        self.setVegetationTooltipOpen(!b.vegetationInfoWrap.classList.contains("is-open"));
      });
      b.vegetationInfoToggle.addEventListener("keydown", function (event) {
        if (event.key === "Escape" || event.key === "Esc") {
          self.setVegetationTooltipOpen(false);
          b.vegetationInfoToggle.blur();
        }
      });
      b.vegetationInfoWrap.addEventListener("focusout", function (event) {
        if (!b.vegetationInfoWrap.contains(event.relatedTarget)) {
          self.setVegetationTooltipOpen(false);
        }
      });
      document.addEventListener("click", function (event) {
        if (!b.vegetationInfoWrap.contains(event.target)) {
          self.setVegetationTooltipOpen(false);
        }
      });
    }

    if (b.reset) {
      b.reset.addEventListener("click", function () {
        self.resetFilters();
      });
    }

    if (b.selectFiltered) {
      b.selectFiltered.addEventListener("click", function () {
        self.selectRows(self.state.filteredRows, true);
        gaEvent("fx_select_all_filtered", {
          count: self.state.filteredRows.length
        });
      });
    }

    if (b.selectAllSites) {
      b.selectAllSites.addEventListener("click", function () {
        self.selectRows(self.state.rows, true);
      });
    }

    if (b.clearSelection) {
      b.clearSelection.addEventListener("click", function () {
        self.clearAllSelection();
      });
    }

    if (b.downloadAllSelectedScript) {
      b.downloadAllSelectedScript.addEventListener("click", function () {
        self.handleDownloadAllSelectedScript();
      });
    }

    if (b.copyAllSelectedScript) {
      b.copyAllSelectedScript.addEventListener("click", function () {
        self.handleCopyAllSelectedScript();
      });
    }

    if (b.downloadManifest) {
      b.downloadManifest.addEventListener("click", function () {
        self.handleDownloadManifest();
      });
    }

    if (b.downloadLinks) {
      b.downloadLinks.addEventListener("click", function () {
        self.handleDownloadLinks();
      });
    }

    if (b.downloadScript) {
      b.downloadScript.addEventListener("click", function () {
        self.handleDownloadScript();
      });
    }

    if (b.downloadSitesFile) {
      b.downloadSitesFile.addEventListener("click", function () {
        self.handleDownloadSitesFile();
      });
    }

    if (b.downloadAmeriFluxSitesFile) {
      b.downloadAmeriFluxSitesFile.addEventListener("click", function () {
        self.handleDownloadAmeriFluxSitesFile();
      });
    }

    function handleAmeriFluxBulkIdentityInput() {
      self.state.ameriFluxBulkUserIdInput = String(b.ameriFluxBulkUserId && b.ameriFluxBulkUserId.value || "");
      self.state.ameriFluxBulkUserEmailInput = String(b.ameriFluxBulkUserEmail && b.ameriFluxBulkUserEmail.value || "");
      writeAmeriFluxBulkIdentityPreferences(self.state.ameriFluxBulkUserIdInput, self.state.ameriFluxBulkUserEmailInput);
      self.renderBulkPanel();
    }

    if (b.ameriFluxBulkUserId) {
      b.ameriFluxBulkUserId.addEventListener("input", handleAmeriFluxBulkIdentityInput);
      b.ameriFluxBulkUserId.addEventListener("change", handleAmeriFluxBulkIdentityInput);
    }

    if (b.ameriFluxBulkUserEmail) {
      b.ameriFluxBulkUserEmail.addEventListener("input", handleAmeriFluxBulkIdentityInput);
      b.ameriFluxBulkUserEmail.addEventListener("change", handleAmeriFluxBulkIdentityInput);
    }

    if (b.downloadAmeriFluxScript) {
      b.downloadAmeriFluxScript.addEventListener("click", function () {
        self.handleDownloadAmeriFluxScript();
      });
    }

    if (b.copyAmeriFluxScript) {
      b.copyAmeriFluxScript.addEventListener("click", function () {
        self.handleCopyAmeriFluxScript();
      });
    }

    if (b.copyLinks) {
      b.copyLinks.addEventListener("click", function () {
        self.handleCopyLinks();
      });
    }

    if (b.showCliCommand) {
      b.showCliCommand.addEventListener("click", function () {
        self.toggleCliPanel();
      });
    }

    if (b.copyCommand) {
      b.copyCommand.addEventListener("click", function () {
        self.handleCopyCommand();
      });
    }

    if (b.resetMapView) {
      b.resetMapView.addEventListener("click", function () {
        self.resetMapView();
      });
    }

    if (b.downloadKnownSitesCsv) {
      b.downloadKnownSitesCsv.addEventListener("click", function () {
        self.handleDownloadKnownSitesCsv();
      });
    }

    if (b.knownSitesToggle) {
      b.knownSitesToggle.addEventListener("change", function () {
        self.state.knownSiteOverlayEnabled = !!b.knownSitesToggle.checked;
        self.render();
      });
    }

    if (b.prevPage) {
      b.prevPage.addEventListener("click", function () {
        if (self.state.page > 1) {
          self.state.page -= 1;
          self.render();
        }
      });
    }

    if (b.nextPage) {
      b.nextPage.addEventListener("click", function () {
        var totalPages = self.getTotalPages();
        if (self.state.page < totalPages) {
          self.state.page += 1;
          self.render();
        }
      });
    }

    if (b.pageButtons) {
      b.pageButtons.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || target.tagName !== "BUTTON") {
          return;
        }
        var page = parseInt(target.getAttribute("data-page") || "", 10);
        if (!page || page < 1) {
          return;
        }
        self.state.page = page;
        self.render();
      });
    }

    if (b.theadRow) {
      b.theadRow.addEventListener("click", function (event) {
        var target = event.target;
        while (target && target !== b.theadRow && !(target.tagName === "BUTTON" && (target.hasAttribute("data-sort-key") || target.getAttribute("data-role") === "copy-table-button"))) {
          target = target.parentNode;
        }
        if (!target || target === b.theadRow) {
          return;
        }
        if (target.getAttribute("data-role") === "copy-table-button") {
          self.handleCopyTable();
          return;
        }
        var key = target.getAttribute("data-sort-key");
        if (!key) {
          return;
        }
        if (self.state.sortKey === key) {
          self.state.sortDir = self.state.sortDir === "asc" ? "desc" : "asc";
        } else {
          self.state.sortKey = key;
          self.state.sortDir = "asc";
        }
        self.state.page = 1;
        self.updateDerivedState();
        self.render();
      });
    }

    if (b.tbody) {
      b.tbody.addEventListener("mouseover", function (event) {
        var row = self.findLinkedTableRow(event.target);
        if (!row || row.contains(event.relatedTarget)) {
          return;
        }
        self.handleTableRowMapLinkEnter(row);
      });

      b.tbody.addEventListener("mouseout", function (event) {
        var row = self.findLinkedTableRow(event.target);
        if (!row || row.contains(event.relatedTarget)) {
          return;
        }
        self.handleTableRowMapLinkLeave(row);
      });

      b.tbody.addEventListener("change", function (event) {
        var target = event.target;
        if (!target || target.tagName !== "INPUT" || target.type !== "checkbox" || target.getAttribute("data-role") !== "row-select") {
          return;
        }
        var key = String(target.getAttribute("data-key") || "");
        if (!key) {
          return;
        }
        self.state.selectedKeys[key] = !!target.checked;
        self.render();
      });

      b.tbody.addEventListener("click", function (event) {
        var target = event.target;
        while (
          target &&
          target !== b.tbody &&
          !(
            (target.tagName === "BUTTON" && target.getAttribute("data-role") === "ameriflux-download") ||
            (target.tagName === "A" && target.getAttribute("data-role") === "row-link-action")
          )
        ) {
          target = target.parentNode;
        }
        if (!target || target === b.tbody) {
          return;
        }
        if (target.tagName === "A" && target.getAttribute("data-role") === "row-link-action") {
          gaEvent(String(target.getAttribute("data-outbound-event") || "fx_row_link_click"), {
            site_id: String(target.getAttribute("data-site-id") || ""),
            mode: String(target.getAttribute("data-link-mode") || ""),
            source_label: String(target.getAttribute("data-source-label") || "")
          });
          return;
        }
        var siteId = String(target.getAttribute("data-site-id") || "");
        var dataProduct = String(target.getAttribute("data-product") || "");
        var sourceLabel = String(target.getAttribute("data-source-label") || "");
        if (!siteId) {
          return;
        }
        self.handleAmeriFluxRowDownload(siteId, dataProduct, sourceLabel, target);
      });
    }

    if (b.copyAttribution) {
      b.copyAttribution.addEventListener("click", function () {
        self.copyAttribution();
      });
    }

  };

  Explorer.prototype.setAttributionText = function (text, html) {
    var pageAttributionNote = document.getElementById("shuttle-attribution-note");
    if (pageAttributionNote) {
      pageAttributionNote.setAttribute("data-plain-text", String(text || ""));
      pageAttributionNote.innerHTML = html || escapeHtml(String(text || ""));
    }
  };

  Explorer.prototype.syncAmeriFluxBulkIdentityInputs = function () {
    if (this.bindings.ameriFluxBulkUserId) {
      this.bindings.ameriFluxBulkUserId.value = String(this.state.ameriFluxBulkUserIdInput || "");
    }
    if (this.bindings.ameriFluxBulkUserEmail) {
      this.bindings.ameriFluxBulkUserEmail.value = String(this.state.ameriFluxBulkUserEmailInput || "");
    }
  };

  Explorer.prototype.syncMinimumYearsFilterControl = function () {
    var maximum = maxSiteAvailableYearCount(this.state.rows);
    var currentValue = normalizeMinimumYearsValue(this.state.minimumYears, maximum);
    this.state.maxAvailableYears = maximum;
    this.state.minimumYears = currentValue;
    if (this.bindings.minimumYearsFilter) {
      this.bindings.minimumYearsFilter.min = String(DEFAULT_MINIMUM_YEARS_FILTER);
      this.bindings.minimumYearsFilter.max = String(maximum);
      this.bindings.minimumYearsFilter.step = "1";
      this.bindings.minimumYearsFilter.value = String(currentValue);
    }
    if (this.bindings.minimumYearsValue) {
      this.bindings.minimumYearsValue.textContent = String(currentValue);
    }
    if (this.bindings.minimumYearsRange) {
      this.bindings.minimumYearsRange.textContent = DEFAULT_MINIMUM_YEARS_FILTER + " … " + maximum;
    }
  };

  Explorer.prototype.syncYearRangeFilterControl = function (preserveSelection) {
    var previousBounds = this.state.yearRangeBounds || availableYearRangeBounds([]);
    var previousSelection = normalizeYearRangeFilter({
      start: this.state.yearRangeStart,
      end: this.state.yearRangeEnd
    }, previousBounds);
    var bounds = availableYearRangeBounds(this.state.rows);
    var shouldUseFullRange = !preserveSelection || !previousSelection.hasBounds || previousSelection.isDefault;
    var selected = shouldUseFullRange
      ? normalizeYearRangeFilter({ start: null, end: null }, bounds)
      : normalizeYearRangeFilter({
        start: this.state.yearRangeStart,
        end: this.state.yearRangeEnd
      }, bounds);
    var denominator = selected.hasBounds ? Math.max(1, bounds.end - bounds.start) : 1;
    var startPct = selected.hasBounds ? ((selected.start - bounds.start) / denominator) * 100 : 0;
    var endPct = selected.hasBounds ? ((selected.end - bounds.start) / denominator) * 100 : 100;

    this.state.yearRangeBounds = bounds;
    this.state.yearRangeStart = selected.start;
    this.state.yearRangeEnd = selected.end;

    if (this.bindings.yearRangeStartFilter && this.bindings.yearRangeStartFilter.parentNode) {
      this.bindings.yearRangeStartFilter.parentNode.style.setProperty("--year-range-start-pct", startPct + "%");
      this.bindings.yearRangeStartFilter.parentNode.style.setProperty("--year-range-end-pct", endPct + "%");
    }

    [this.bindings.yearRangeStartFilter, this.bindings.yearRangeEndFilter].forEach(function (input) {
      if (!input) {
        return;
      }
      input.disabled = !selected.hasBounds;
      input.min = String(selected.hasBounds ? bounds.start : MIN_PLAUSIBLE_DATA_YEAR);
      input.max = String(selected.hasBounds ? bounds.end : MIN_PLAUSIBLE_DATA_YEAR);
      input.step = "1";
    });
    if (this.bindings.yearRangeStartFilter) {
      this.bindings.yearRangeStartFilter.value = String(selected.hasBounds ? selected.start : MIN_PLAUSIBLE_DATA_YEAR);
    }
    if (this.bindings.yearRangeEndFilter) {
      this.bindings.yearRangeEndFilter.value = String(selected.hasBounds ? selected.end : MIN_PLAUSIBLE_DATA_YEAR);
    }
    if (this.bindings.yearRangeValue) {
      this.bindings.yearRangeValue.textContent = selected.hasBounds
        ? (selected.start + "\u2013" + selected.end)
        : "Unavailable";
    }
  };

  Explorer.prototype.trackFilterChange = function (filterName, value) {
    gaEvent("fx_filter_change", {
      filter: String(filterName || ""),
      value: String(value || ""),
      results: this.state.filteredRows.length
    });
  };

  Explorer.prototype.trackExplorerLoadedOnce = function () {
    if (this._gaExplorerLoadedTracked) {
      return;
    }
    this._gaExplorerLoadedTracked = true;
    gaEvent("fx_explorer_loaded", {
      rows: this.state.rows.length,
      snapshot_last_updated: this.state.snapshotUpdatedDate || "",
      snapshot_refreshed: this.state.snapshotRefreshedDate || ""
    });
  };

  Explorer.prototype.renderSnapshotUpdatedText = function () {
    var refreshedLabel = snapshotUpdatedDateDisplayText(this.state.snapshotRefreshedDate);
    var updatedLabel = snapshotUpdatedDateDisplayText(this.state.snapshotUpdatedDate);
    if (this.bindings.widgetRefreshedInline) {
      this.bindings.widgetRefreshedInline.textContent = refreshedLabel;
    }
    if (this.bindings.widgetLastUpdatedInline) {
      this.bindings.widgetLastUpdatedInline.textContent = updatedLabel;
    }
    var pageRefreshedSpan = document.getElementById("shuttle-snapshot-refreshed");
    if (pageRefreshedSpan) {
      pageRefreshedSpan.textContent = refreshedLabel;
    }
    var pageIntroSpan = document.getElementById("shuttle-snapshot-last-updated");
    if (pageIntroSpan) {
      pageIntroSpan.textContent = updatedLabel;
    }
    this.setAttributionText(
      buildAttributionText(this.state.snapshotUpdatedDate, this.state.snapshotRefreshedDate),
      buildAttributionHtml(this.state.snapshotUpdatedDate, this.state.snapshotRefreshedDate)
    );
  };

  Explorer.prototype.copyAttribution = function () {
    var self = this;
    var attributionText = this.bindings.attributionText;
    var status = this.bindings.copyStatus;
    var plainText = attributionText
      ? String(attributionText.getAttribute("data-plain-text") || attributionText.textContent || "")
      : "";
    if (!attributionText) {
      return;
    }

    function setStatus(message) {
      if (status) {
        status.textContent = message;
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(plainText).then(function () {
        setStatus("Copied.");
      }).catch(function () {
        try {
          var helper = document.createElement("textarea");
          helper.value = plainText;
          helper.setAttribute("readonly", "readonly");
          helper.style.position = "absolute";
          helper.style.left = "-9999px";
          document.body.appendChild(helper);
          helper.focus();
          helper.select();
          document.execCommand("copy");
          document.body.removeChild(helper);
          setStatus("Copied.");
        } catch (err) {
          setStatus("Copy failed. Select and copy manually.");
        }
      });
      return;
    }

    try {
      var helperFallback = document.createElement("textarea");
      helperFallback.value = plainText;
      helperFallback.setAttribute("readonly", "readonly");
      helperFallback.style.position = "absolute";
      helperFallback.style.left = "-9999px";
      document.body.appendChild(helperFallback);
      helperFallback.focus();
      helperFallback.select();
      document.execCommand("copy");
      document.body.removeChild(helperFallback);
      setStatus("Copied.");
    } catch (err2) {
      setStatus("Copy failed. Select and copy manually.");
    }

    window.setTimeout(function () {
      if (status && status.textContent === "Copied.") {
        status.textContent = "";
      }
    }, 1500);
  };

  Explorer.prototype.setMode = function (mode, message, extraClass) {
    this.state.mode = mode;
    var status = this.bindings.status;
    if (!status) {
      return;
    }
    status.className = "shuttle-explorer__status" + (extraClass ? " " + extraClass : "");
    status.textContent = message || "";
  };

  Explorer.prototype.getTotalPages = function () {
    var total = this.state.filteredRows.length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  };

  Explorer.prototype.resetFilters = function () {
    if (this._searchDebounceTimer) {
      window.clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = null;
    }
    this.state.search = "";
    this.state.selectedNetwork = "";
    this.state.selectedSource = "";
    this.state.selectedAvailability = "";
    this.state.selectedCountry = "";
    this.state.selectedVegetation = "";
    this.state.selectedNetworks = [];
    this.state.selectedSources = [];
    this.state.selectedAvailabilities = [];
    this.state.selectedCountries = [];
    this.state.selectedVegetations = [];
    this.state.minimumYears = DEFAULT_MINIMUM_YEARS_FILTER;
    this.state.yearRangeStart = null;
    this.state.yearRangeEnd = null;
    this.state.sortKey = "data_hub";
    this.state.sortDir = "asc";
    this.state.page = 1;

    if (this.bindings.search) {
      this.bindings.search.value = "";
    }
    this.closeMultiSelects();
    this.syncMultiSelectFilterControls();
    this.syncMinimumYearsFilterControl();
    this.syncYearRangeFilterControl(false);

    this.updateDerivedState();
    this.render();
  };

  Explorer.prototype.getSelectedRows = function () {
    var selectedKeys = this.state.selectedKeys || {};
    return this.state.rows.filter(function (row) {
      return !!selectedKeys[row._selection_key];
    });
  };

  Explorer.prototype.getSelectedCount = function () {
    var count = 0;
    var selectedKeys = this.state.selectedKeys || {};
    Object.keys(selectedKeys).forEach(function (key) {
      if (selectedKeys[key]) {
        count += 1;
      }
    });
    return count;
  };

  Explorer.prototype.selectRows = function (rows, checked) {
    var self = this;
    (rows || []).forEach(function (row) {
      if (!row || !row._selection_key) {
        return;
      }
      self.state.selectedKeys[row._selection_key] = !!checked;
    });
    this.render();
  };

  Explorer.prototype.clearAllSelection = function () {
    this.state.selectedKeys = {};
    this.render();
  };

  function buildMapDisplayState(filteredRows, selectedKeys) {
    var entries = uniqueMapSiteEntries(filteredRows, selectedKeys);
    var rows = entries.map(function (entry) {
      return entry.row;
    });
    var selectedRows = entries.filter(function (entry) {
      return entry.selected;
    }).map(function (entry) {
      return entry.row;
    });
    var mappableRows = [];
    var missingCoordinates = 0;
    var signatureParts = [];

    rows.forEach(function (row) {
      if (!row || !row.has_coordinates) {
        missingCoordinates += 1;
        return;
      }
      mappableRows.push(row);
      signatureParts.push(mapSiteKey(row) + ":" + row.latitude + ":" + row.longitude);
    });

    signatureParts.sort();

    return {
      filteredRows: rows,
      selectedRows: selectedRows,
      mappableRows: mappableRows,
      missingCoordinates: missingCoordinates,
      signature: [
        String(rows.length),
        String(missingCoordinates),
        signatureParts.join("|")
      ].join("::")
    };
  }

  Explorer.prototype.getMapDisplayState = function () {
    return buildMapDisplayState(this.state.filteredRows, this.state.selectedKeys);
  };

  Explorer.prototype.ensureMap = function () {
    var L;
    if (this.map || !this.bindings.mapCanvas) {
      return !!this.map;
    }
    if (typeof window === "undefined" || !window.L) {
      return false;
    }

    L = window.L;
    this.map = L.map(this.bindings.mapCanvas, {
      scrollWheelZoom: true,
      worldCopyJump: true
    });
    this.map.setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18
    }).addTo(this.map);
    this.mapKnownSiteLayer = L.featureGroup().addTo(this.map);
    this.mapMarkerLayer = L.featureGroup().addTo(this.map);
	    if (this.map.attributionControl && this.map.attributionControl.setPrefix) {
	      this.map.attributionControl.setPrefix("");
	    }
    if (this.bindings.mapControlPanel && L.DomEvent) {
      if (L.DomEvent.disableClickPropagation) {
        L.DomEvent.disableClickPropagation(this.bindings.mapControlPanel);
      }
      if (L.DomEvent.disableScrollPropagation) {
        L.DomEvent.disableScrollPropagation(this.bindings.mapControlPanel);
      }
    }
	    if (!this._mapResizeHandler) {
	      var self = this;
      this._mapResizeHandler = function () {
        self.invalidateMapSize(false);
      };
      window.addEventListener("resize", this._mapResizeHandler);
    }
    return true;
  };

  Explorer.prototype.getMinimumSingleWorldZoom = function () {
    var size;
    var width;
    if (!this.map || !this.map.getSize) {
      return 0;
    }
    size = this.map.getSize();
    width = size && size.x ? size.x : 0;
    if (!width || width <= LEAFLET_WORLD_TILE_SIZE) {
      return 0;
    }
    return Math.ceil(Math.log(width / LEAFLET_WORLD_TILE_SIZE) / Math.LN2);
  };

  Explorer.prototype.fitDefaultGlobalMapView = function () {
    var currentZoom;
    var minimumSingleWorldZoom;
    var maxZoom;
    var nextZoom;
    if (!this.map) {
      return;
    }
    this.map.fitBounds(DEFAULT_GLOBAL_LAND_BOUNDS, {
      padding: [24, 24],
      animate: false
    });
    currentZoom = this.map.getZoom();
    if (typeof currentZoom !== "number" || !isFinite(currentZoom)) {
      return;
    }
    minimumSingleWorldZoom = this.getMinimumSingleWorldZoom();
    maxZoom = this.map.getMaxZoom();
    nextZoom = Math.max(currentZoom, minimumSingleWorldZoom);
    if (typeof maxZoom === "number" && isFinite(maxZoom)) {
      nextZoom = Math.min(nextZoom, maxZoom);
    }
    if (nextZoom !== currentZoom) {
      this.map.setZoom(nextZoom);
    }
  };

  Explorer.prototype.invalidateMapSize = function (refit) {
    var self = this;
    if (!this.map) {
      return;
    }
    var callback = function () {
      if (!self.map) {
        return;
      }
      self.map.invalidateSize(false);
      if (refit) {
        self.fitMapToMarkers();
      }
    };
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(callback);
      return;
    }
    window.setTimeout(callback, 0);
  };

  Explorer.prototype.fitMapToMarkers = function () {
    var layers;
    if (!this.map || !this.mapMarkerLayer || !this.mapKnownSiteLayer) {
      return;
    }
    layers = this.mapMarkerLayer.getLayers();
    if (!layers.length) {
      this.fitDefaultGlobalMapView();
      return;
    }
    if (layers.length === 1) {
      this.map.setView(layers[0].getLatLng(), 6);
      return;
    }
    this.map.fitBounds(this.mapMarkerLayer.getBounds(), {
      padding: [24, 24],
      maxZoom: 6
    });
  };

  Explorer.prototype.resetMapView = function () {
    if (!this.ensureMap()) {
      return;
    }
    this.fitMapToMarkers();
  };

  Explorer.prototype.buildMapPopupHtml = function (row, options) {
    var opts = options || {};
    var lines = [
      "<div class=\"shuttle-explorer__map-popup\">",
      "  <strong>" + escapeHtml(row.site_id || "") + "</strong>"
    ];

    if (row.site_name) {
      lines.push("  <div>" + escapeHtml(row.site_name) + "</div>");
    }
    if (row.country) {
      lines.push("  <div class=\"shuttle-explorer__map-popup-meta\">" + escapeHtml(row.country) + "</div>");
    }
    if (opts.showCategory && row.known_site_only) {
      lines.push("  <div class=\"shuttle-explorer__map-popup-meta\">Site location known but data holdings unavailable.</div>");
    }
    lines.push("</div>");
    return lines.join("");
  };

  Explorer.prototype.renderFilteredMapMarkers = function (rows) {
    var self = this;
    var L;
    if (!this.ensureMap() || !this.mapMarkerLayer) {
      return;
    }
    L = window.L;
    this.clearMapMarkerHighlight();
    this.mapMarkerBySiteKey = {};
    this.tableHoveredSiteKey = "";
    this.mapHoveredSiteKey = "";
    this.mapMarkerLayer.clearLayers();
    (rows || []).forEach(function (row) {
      var siteKey = mapSiteKey(row);
      var baseStyle = filteredAccessibleMapMarkerStyle();
      var marker = L.circleMarker([row.latitude, row.longitude], baseStyle);
      marker._shuttleExplorerBaseStyle = Object.assign({}, baseStyle);
      marker._shuttleExplorerSiteKey = siteKey;
      if (siteKey) {
        self.mapMarkerBySiteKey[siteKey] = marker;
      }
      marker.bindPopup(self.buildMapPopupHtml(row, { showCategory: false }), {
        autoPan: true
      });
      self.bindLinkedMapMarker(marker, siteKey);
      marker.on("click", function () {
        if (self.map) {
          self.map.panTo(marker.getLatLng(), {
            animate: true
          });
        }
      });
      self.mapMarkerLayer.addLayer(marker);
    });
  };

  Explorer.prototype.renderKnownSiteMapMarkers = function (rows) {
    var self = this;
    var L;
    if (!this.ensureMap() || !this.mapKnownSiteLayer) {
      return;
    }
    L = window.L;
    this.mapKnownSiteLayer.clearLayers();
    buildKnownSiteMapDisplayState(rows).rows.forEach(function (row) {
      var siteKey = mapSiteKey(row);
      var baseStyle = knownSiteMapMarkerStyle(row);
      var marker = L.circleMarker([row.latitude, row.longitude], baseStyle);
      marker._shuttleExplorerBaseStyle = Object.assign({}, baseStyle);
      marker._shuttleExplorerSiteKey = siteKey;
      marker.bindPopup(self.buildMapPopupHtml(row, { showCategory: true }), {
        autoPan: true
      });
      self.bindLinkedMapMarker(marker, siteKey);
      marker.on("click", function () {
        if (self.map) {
          self.map.panTo(marker.getLatLng(), {
            animate: true
          });
        }
      });
      self.mapKnownSiteLayer.addLayer(marker);
    });
  };

  Explorer.prototype.setMapEmptyState = function (message) {
    var empty = this.bindings.mapEmpty;
    if (!empty) {
      return;
    }
    empty.textContent = message || "";
    empty.classList.toggle("shuttle-explorer__hidden", !message);
  };

  function buildMapSummaryHtml(displayState, knownState, knownOverlayEnabled) {
    var filteredCount = displayState && displayState.filteredRows ? displayState.filteredRows.length : 0;
    var mappableCount = displayState && displayState.mappableRows ? displayState.mappableRows.length : 0;
    var missingCount = displayState && displayState.missingCoordinates ? displayState.missingCoordinates : 0;
    var known = knownState || {};
    var foregroundIsFiltered = !(knownOverlayEnabled && known.accessibleCount && filteredCount === known.accessibleCount);
    var foregroundLabel = (foregroundIsFiltered ? "filtered " : "") +
      (filteredCount === 1 ? "site" : "sites") + " with accessible data";
    var foregroundLine;
    var backgroundLine = "";
    if (!filteredCount) {
      foregroundLine = "No filtered sites with accessible data to show on the map.";
    } else if (!mappableCount) {
      foregroundLine = filteredCount + " " + foregroundLabel + " " + (filteredCount === 1 ? "is" : "are") + " missing map coordinates.";
    } else {
      foregroundLabel = (foregroundIsFiltered ? "filtered " : "") +
        (mappableCount === 1 ? "site" : "sites") + " with accessible data";
      foregroundLine = "Showing " + mappableCount + " " + foregroundLabel + " on the map.";
      if (missingCount) {
        foregroundLabel = (foregroundIsFiltered ? "filtered " : "") +
          (missingCount === 1 ? "site" : "sites") + " with accessible data";
        foregroundLine += " " + missingCount + " " + foregroundLabel + " " + (missingCount === 1 ? "was" : "were") + " omitted because coordinates are unavailable.";
      }
    }
    if (knownOverlayEnabled && known.totalCount) {
      backgroundLine = "Background layer: " + known.totalCount + " known flux " + (known.totalCount === 1 ? "site" : "sites") +
        ", including " + known.accessibleCount + " " + (known.accessibleCount === 1 ? "site" : "sites") +
        " with accessible data.";
    }
    return [
      escapeHtml(foregroundLine),
      backgroundLine ? escapeHtml(backgroundLine) : "",
      "<span class=\"shuttle-explorer__muted\">Is your site missing? Email <a href=\"mailto:trevorkeenan@berkeley.edu\">trevorkeenan@berkeley.edu</a> to be added.</span>"
    ].filter(Boolean).join("<br>");
  }

  Explorer.prototype.renderMap = function () {
    var b = this.bindings;
    var knownSiteRows;
    var knownDisplayState;
    var mapAccessibleRows;
    var displayState;
    var mapChanged = false;
    var mapSignature;
    var message = "";
    if (!b.mapPanel) {
      return;
    }

    displayState = this.getMapDisplayState();
    knownSiteRows = this.state.knownSiteOverlayEnabled
      ? (Array.isArray(this.state.knownSiteMapRows) ? this.state.knownSiteMapRows : [])
      : [];
    mapAccessibleRows = this.state.knownSiteOverlayEnabled && Array.isArray(this.state.mapAccessibleRows)
      ? this.state.mapAccessibleRows
      : [];
    knownDisplayState = buildKnownSiteMapDisplayState(
      knownSiteRows,
      mapAccessibleRows
    );

    if (b.knownSitesToggle) {
      b.knownSitesToggle.checked = !!this.state.knownSiteOverlayEnabled;
    }
    if (b.mapSummary) {
      b.mapSummary.innerHTML = buildMapSummaryHtml(displayState, knownDisplayState, this.state.knownSiteOverlayEnabled);
    }
    if (b.downloadKnownSitesCsv) {
      b.downloadKnownSitesCsv.classList.toggle(
        "shuttle-explorer__hidden",
        !(Array.isArray(this.state.knownSiteMapRows) && this.state.knownSiteMapRows.length)
      );
    }

    if (!this.ensureMap()) {
      if (b.resetMapView) {
        b.resetMapView.classList.add("shuttle-explorer__hidden");
      }
      this.setMapEmptyState("Map preview unavailable because the map library did not load.");
      return;
    }

    mapSignature = displayState.signature + "::known:" + String(this.state.knownSiteOverlayEnabled) +
      ":" + String(knownDisplayState.totalCount) + ":" + String(knownDisplayState.accessibleCount) +
      ":" + String(knownDisplayState.knownSiteOnlyCount);
    if (mapSignature !== this._mapDisplaySignature) {
      this._mapDisplaySignature = mapSignature;
      mapChanged = true;
      this.renderKnownSiteMapMarkers(knownDisplayState.rows);
      this.renderFilteredMapMarkers(displayState.mappableRows);
    }

    if (b.resetMapView) {
      b.resetMapView.classList.toggle("shuttle-explorer__hidden", !(displayState.mappableRows.length || knownDisplayState.totalCount));
    }

    if (!displayState.filteredRows.length && !knownDisplayState.totalCount) {
      message = this.state.knownSiteOverlayEnabled
        ? (this.state.knownSiteMapWarning || "Known-sites map layer is unavailable.")
        : "No filtered sites with accessible data to show on the map.";
    } else if (!displayState.mappableRows.length) {
      if (displayState.filteredRows.length) {
        message = "The filtered sites do not include map coordinates in the current metadata snapshot.";
      }
    }
    this.setMapEmptyState(message);
    this.invalidateMapSize(mapChanged);
  };

  Explorer.prototype.pruneSelection = function () {
    var valid = {};
    this.state.rows.forEach(function (row) {
      if (row && row._selection_key) {
        valid[row._selection_key] = true;
      }
    });
    Object.keys(this.state.selectedKeys || {}).forEach(function (key) {
      if (!valid[key]) {
        delete this.state.selectedKeys[key];
      }
    }, this);
  };

  Explorer.prototype.setBulkStatus = function (message) {
    if (this.bindings.bulkStatus) {
      this.bindings.bulkStatus.textContent = message || "";
    }
  };

  Explorer.prototype.downloadTextFile = function (filename, text, mimeType) {
    var blob = new Blob([String(text || "")], { type: mimeType || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  };

  Explorer.prototype.copyText = function (text, successMessage) {
    var self = this;
    var value = String(text || "");
    if (!value) {
      this.setBulkStatus("Nothing to copy.");
      return;
    }
    this.copyPlainText(
      value,
      function () {
        self.setBulkStatus(successMessage || "Copied.");
      },
      function () {
        self.setBulkStatus("Copy failed. Try downloading the file instead.");
      }
    );
  };

  Explorer.prototype.copyPlainText = function (text, onSuccess, onFailure) {
    var value = String(text || "");
    var self = this;
    if (!value) {
      if (typeof onFailure === "function") {
        onFailure();
      }
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        if (typeof onSuccess === "function") {
          onSuccess();
        }
      }).catch(function () {
        self.fallbackCopyText(value, onSuccess, onFailure);
      });
      return;
    }
    this.fallbackCopyText(value, onSuccess, onFailure);
  };

  Explorer.prototype.fallbackCopyText = function (text, onSuccess, onFailure) {
    var ta = document.createElement("textarea");
    ta.value = String(text || "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      if (typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      if (typeof onFailure === "function") {
        onFailure(err);
      }
    }
    document.body.removeChild(ta);
  };

  Explorer.prototype.getTableCopyButton = function () {
    return bySelector(this.bindings.theadRow, "[data-role='copy-table-button']");
  };

  Explorer.prototype.resetTableCopyButtonLabel = function () {
    var button = this.getTableCopyButton();
    if (!button) {
      return;
    }
    button.textContent = COPY_TABLE_BUTTON_LABEL;
    button.setAttribute("aria-label", COPY_TABLE_BUTTON_LABEL);
    button.classList.remove("is-success");
    button.classList.remove("is-error");
    if (this._tableCopyFeedbackTimer) {
      window.clearTimeout(this._tableCopyFeedbackTimer);
      this._tableCopyFeedbackTimer = null;
    }
  };

  Explorer.prototype.setTableCopyFeedback = function (label, stateClass) {
    var self = this;
    var button = this.getTableCopyButton();
    if (!button) {
      return;
    }
    if (this._tableCopyFeedbackTimer) {
      window.clearTimeout(this._tableCopyFeedbackTimer);
      this._tableCopyFeedbackTimer = null;
    }
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.classList.toggle("is-success", stateClass === "success");
    button.classList.toggle("is-error", stateClass === "error");
    this._tableCopyFeedbackTimer = window.setTimeout(function () {
      self.resetTableCopyButtonLabel();
    }, COPY_TABLE_FEEDBACK_MS);
  };

  Explorer.prototype.handleCopyTable = function () {
    var self = this;
    var text = buildTableClipboardText(this.getDisplayedRows());
    this.copyPlainText(
      text,
      function () {
        self.setTableCopyFeedback(COPY_TABLE_SUCCESS_LABEL, "success");
      },
      function () {
        self.setTableCopyFeedback(COPY_TABLE_FAILURE_LABEL, "error");
      }
    );
  };

  Explorer.prototype.getSelectedRowsOrWarn = function () {
    var selectedRows = this.getSelectedRows();
    if (!selectedRows.length) {
      this.setBulkStatus("Select one or more sites first.");
      return null;
    }
    return selectedRows;
  };

  Explorer.prototype.getShuttleRows = function (rows) {
    return partitionRowsByBulkSource(rows).shuttleRows;
  };

  Explorer.prototype.getShuttleDownloadRows = function (rows) {
    return partitionRowsByBulkSource(rows).shuttleDownloadRows;
  };

  Explorer.prototype.getManualLandingPageRows = function (rows) {
    return partitionRowsByBulkSource(rows).manualLandingPageRows;
  };

  Explorer.prototype.getRequestOnlyRows = function (rows) {
    return partitionRowsByBulkSource(rows).requestOnlyRows;
  };

  Explorer.prototype.getShuttleCliRows = function (rows) {
    return (rows || []).filter(isShuttleCatalogRow);
  };

  Explorer.prototype.getAmeriFluxRows = function (rows) {
    return partitionRowsByBulkSource(rows).ameriFluxRows;
  };

  Explorer.prototype.getBulkSelectionSummary = function (rows) {
    return summarizeBulkSelection(rows);
  };

  Explorer.prototype.getAmeriFluxApiSource = function (dataProduct) {
    var product = String(dataProduct || "").trim().toUpperCase();
    return this.ameriFluxApiSources[product] || this.ameriFluxSource;
  };

  Explorer.prototype.getAmeriFluxBulkEntries = function (rows) {
    return normalizeAmeriFluxBulkEntries((rows || []).map(function (row) {
      return {
        site_id: String(row && row.site_id || "").trim(),
        data_product: getApiRowDataProduct(row),
        source_label: String(row && row.source_label || "").trim()
      };
    }));
  };

  Explorer.prototype.buildSelectionManifestCsv = function (rows) {
    var lines = [
      ["site_id", "data_hub", "source_label", "download_mode", "network", "country", "download_link"].join(",")
    ];
    rows.forEach(function (row) {
      lines.push([
        csvEscape(row.site_id),
        csvEscape(row.data_hub),
        csvEscape(row.source_label || ""),
        csvEscape(row.download_mode || ""),
        csvEscape(row.network_display || row.network || ""),
        csvEscape(row.country || ""),
        csvEscape(row.download_link)
      ].join(","));
    });
    return lines.join("\n") + "\n";
  };

  Explorer.prototype.buildKnownSitesExportCsv = function (rows) {
    return buildKnownSitesExportCsv(rows);
  };

  Explorer.prototype.buildLinksText = function (rows) {
    return rows.map(function (row) {
      return row.download_link;
    }).join("\n") + "\n";
  };

  Explorer.prototype.buildSelectedSitesText = function (rows) {
    return selectedSiteIdsText(uniqueSiteIdsFromRows(rows));
  };

  Explorer.prototype.buildAmeriFluxSelectedSitesText = function (rows) {
    return buildAmeriFluxSelectedSitesText(this.getAmeriFluxBulkEntries(rows));
  };

  Explorer.prototype.getEffectiveAmeriFluxIdentity = function () {
    return resolveAmeriFluxBulkIdentity(
      this.state.ameriFluxBulkUserIdInput,
      this.state.ameriFluxBulkUserEmailInput
    );
  };

  Explorer.prototype.getAmeriFluxBulkIdentity = function () {
    return this.getEffectiveAmeriFluxIdentity();
  };

  Explorer.prototype.buildAmeriFluxBulkScript = function (rows) {
    var entries = this.getAmeriFluxBulkEntries(rows);
    var identity = this.getEffectiveAmeriFluxIdentity();
    return buildAmeriFluxBulkScriptText(entries, {
      defaultUserId: identity.user_id,
      defaultUserEmail: identity.user_email,
      v2DownloadUrl: AMERIFLUX_V2_DOWNLOAD_URL,
      v1DownloadUrl: AMERIFLUX_V1_DOWNLOAD_URL,
      variant: AMERIFLUX_DEFAULT_VARIANT,
      policy: AMERIFLUX_DEFAULT_POLICY,
      v2IntendedUse: AMERIFLUX_V2_INTENDED_USE,
      v1IntendedUse: AMERIFLUX_V1_INTENDED_USE
    });
  };

  Explorer.prototype.buildDownloadAllSelectedScript = function (rows) {
    var selectionSummary = this.getBulkSelectionSummary(rows);
    return buildDownloadAllSelectedScriptText({
      includeShuttle: selectionSummary.shuttleDownloadCount > 0,
      includeAmeriFlux: selectionSummary.ameriFluxCount > 0,
      shuttleScript: "./download_shuttle_selected.sh",
      ameriFluxScript: "./download_ameriflux_selected.sh"
    });
  };

  Explorer.prototype.buildDownloadAllSelectedFiles = function (rows) {
    var selectedRows = Array.isArray(rows) ? rows : [];
    return buildDownloadAllSelectedFileBundle({
      wrapperText: this.buildDownloadAllSelectedScript(selectedRows),
      ameriFluxText: this.buildAmeriFluxBulkScript(this.getAmeriFluxRows(selectedRows)),
      shuttleText: this.buildCurlScript(this.getShuttleDownloadRows(selectedRows))
    });
  };

  Explorer.prototype.buildManualLandingPageWarning = function (rows) {
    var manualCount = uniqueSiteIdsFromRows(this.getManualLandingPageRows(rows)).length;
    var requestOnlyCount = uniqueSiteIdsFromRows(this.getRequestOnlyRows(rows)).length;
    var parts = [];
    if (!manualCount && !requestOnlyCount) {
      return "";
    }
    if (manualCount) {
      parts.push(manualCount + " landing-page-only");
    }
    if (requestOnlyCount) {
      parts.push(requestOnlyCount + " request-only");
    }
    return parts.join(" and ") + " selection(s) were excluded from direct bulk output.";
  };

  Explorer.prototype.getDuplicateSelectedSiteIds = function (rows) {
    var counts = {};
    rows.forEach(function (row) {
      var siteId = String(row.site_id || "").trim();
      if (!siteId) {
        return;
      }
      counts[siteId] = (counts[siteId] || 0) + 1;
    });
    return Object.keys(counts).filter(function (siteId) {
      return counts[siteId] > 1;
    }).sort();
  };

  Explorer.prototype.buildCurlScript = function (rows) {
    var total = rows.length;
    var sanitizeScriptField = function (value) {
      return String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").trim();
    };
    var scriptRows = rows.map(function (row) {
      return [
        sanitizeScriptField(row.site_id),
        sanitizeScriptField(row.data_hub),
        sanitizeScriptField(row.first_year),
        sanitizeScriptField(row.last_year),
        sanitizeScriptField(row.download_link)
      ].join("\t");
    });
    return [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      "# NOTE: ICOS links may require interactive license acceptance in a browser before download.",
      "# If an ICOS URL does not download directly, open it in a browser and follow ICOS prompts.",
      "# NOTE: JapanFlux rows without validated ZIP URLs are excluded from this direct-download script.",
      "",
      "OUTDIR=\"${1:-fluxnet_downloads}\"",
      "LOGFILE=\"${2:-bulk_download.log}\"",
      "CONCURRENCY=\"${CONCURRENCY:-5}\"",
      "MAX_ATTEMPTS=\"${MAX_ATTEMPTS:-5}\"",
      "URL_FILE=\"${URL_FILE:-}\"",
      "PARALLEL_MODE=\"sequential\"",
      "SCRIPT_VERSION=\"2026-03-04-8\"",
      "",
      "mkdir -p \"$OUTDIR\"",
      "SUCCESS_FILE=\"$OUTDIR/download_success.txt\"",
      "FAILED_FILE=\"$OUTDIR/download_failed.txt\"",
      "QUEUE_DIR=\"$OUTDIR/.queue\"",
      "mkdir -p \"$QUEUE_DIR\"",
      ": > \"$SUCCESS_FILE\"",
      ": > \"$FAILED_FILE\"",
      ": > \"$LOGFILE\"",
      "",
      "if ! command -v curl >/dev/null 2>&1; then",
      "  echo \"curl is required but was not found in PATH.\" >&2",
      "  exit 1",
      "fi",
      "",
      "if command -v xargs >/dev/null 2>&1; then",
      "  if printf 'ok\\0' | xargs -0 -P 1 -I {} echo {} >/dev/null 2>&1; then",
      "    PARALLEL_MODE=\"xargs\"",
      "  fi",
      "fi",
      "",
      "if [ \"$PARALLEL_MODE\" = \"sequential\" ]; then",
      "  echo \"Parallel xargs mode unavailable; using sequential downloads.\" | tee -a \"$LOGFILE\"",
      "fi",
      "",
      "cat > \"$QUEUE_DIR/urls_all.txt\" <<'FLUXNET_URLS'",
      scriptRows.join("\n"),
      "FLUXNET_URLS",
      "",
      "if [ -n \"$URL_FILE\" ] && [ -f \"$URL_FILE\" ]; then",
      "  cp \"$URL_FILE\" \"$QUEUE_DIR/urls_all.txt\"",
      "fi",
      "",
      "sanitize_list() {",
      "  awk 'NF {",
      "    gsub(/^[[:space:]]+|[[:space:]]+$/, \"\", $0);",
      "    if ($0 != \"\") print $0;",
      "  }' \"$1\"",
      "}",
      "",
      "sanitize_list \"$QUEUE_DIR/urls_all.txt\" > \"$QUEUE_DIR/urls_0.txt\"",
      "TOTAL=$(wc -l < \"$QUEUE_DIR/urls_0.txt\" | tr -d ' ')",
      "if [ \"$TOTAL\" -eq 0 ]; then",
      "  echo \"No URLs to download.\" | tee -a \"$LOGFILE\"",
      "  exit 1",
      "fi",
      "",
      "echo \"FLUXNET bulk downloader version: $SCRIPT_VERSION\" | tee -a \"$LOGFILE\"",
      "echo \"Starting bulk download of $TOTAL files (MODE=$PARALLEL_MODE, CONCURRENCY=$CONCURRENCY, MAX_ATTEMPTS=$MAX_ATTEMPTS)\" | tee -a \"$LOGFILE\"",
      "",
      "url_hash() {",
      "  printf '%s' \"$1\" | cksum | awk '{print $1}'",
      "}",
      "",
      "safe_token() {",
      "  printf '%s' \"$1\" | tr -c '[:alnum:]_.-' '_' | sed 's/^_*//; s/_*$//'",
      "}",
      "",
      "filename_from_url() {",
      "  local url=\"$1\"",
      "  local site_id=\"${2:-}\"",
      "  local data_hub=\"${3:-}\"",
      "  local first_year=\"${4:-}\"",
      "  local last_year=\"${5:-}\"",
      "  local clean=\"${url%%\\?*}\"",
      "  local base=\"$(basename \"$clean\")\"",
      "  local hash=\"$(url_hash \"$url\")\"",
      "",
      "  if [ -z \"$base\" ] || [ \"$base\" = \".\" ] || [ \"$base\" = \"/\" ]; then",
      "    printf 'download_%s.bin\\n' \"$hash\"",
      "    return 0",
      "  fi",
      "",
      "  case \"$base\" in",
      "    licence_accept|license_accept)",
      "      local sid=\"$(safe_token \"$site_id\")\"",
      "      local hub=\"$(safe_token \"$data_hub\")\"",
      "      local years=\"unknown-years\"",
      "      if [ -z \"$hub\" ]; then",
      "        hub=\"ICOS\"",
      "      fi",
      "      if [ -n \"$first_year\" ] && [ -n \"$last_year\" ]; then",
      "        years=\"${first_year}-${last_year}\"",
      "      fi",
      "      if [ -n \"$sid\" ]; then",
      "        printf '%s_%s_FLUXNET_%s_%s.zip\\n' \"$hub\" \"$sid\" \"$years\" \"$hash\"",
      "      else",
      "        printf '%s_%s.zip\\n' \"$base\" \"$hash\"",
      "      fi",
      "      return 0",
      "      ;;",
      "    download|index|object|objects)",
      "      printf '%s_%s.bin\\n' \"$base\" \"$hash\"",
      "      return 0",
      "      ;;",
      "  esac",
      "",
      "  printf '%s\\n' \"$base\"",
      "}",
      "",
      "download_one() {",
      "  local entry=\"$1\"",
      "  local outdir=\"$2\"",
      "  local logfile=\"$3\"",
      "  local attempt=\"$4\"",
      "  local success_file=\"$5\"",
      "  local failed_file=\"$6\"",
      "",
      "  local site_id=\"\"",
      "  local data_hub=\"\"",
      "  local first_year=\"\"",
      "  local last_year=\"\"",
      "  local url=\"\"",
      "  IFS=$'\\t' read -r site_id data_hub first_year last_year url <<< \"$entry\"",
      "  if [ -z \"${url:-}\" ]; then",
      "    url=\"$entry\"",
      "    site_id=\"\"",
      "    data_hub=\"\"",
      "    first_year=\"\"",
      "    last_year=\"\"",
      "  fi",
      "",
      "  [ -n \"$url\" ] || return 0",
      "",
      "  local filename=\"$(filename_from_url \"$url\" \"$site_id\" \"$data_hub\" \"$first_year\" \"$last_year\")\"",
      "  if [ -z \"$filename\" ]; then",
      "    filename=\"download_$(url_hash \"$url\").bin\"",
      "  fi",
      "",
      "  local final_path=\"$outdir/$filename\"",
      "  local part_path=\"$final_path.part\"",
      "  local tmp_headers=\"$outdir/.headers.$$.tmp\"",
      "  local cookie_jar=\"$outdir/.cookies.$$.txt\"",
      "",
      "  local ts",
      "  ts=\"$(date +'%Y-%m-%dT%H:%M:%S%z')\"",
      "  echo \"$ts ATTEMPT=$attempt URL=$url FILE=$filename STATUS=START\" >> \"$logfile\"",
      "  echo \"Attempt $attempt START $filename\"",
      "",
      "  if [ -f \"$final_path\" ]; then",
      "    ts=\"$(date +'%Y-%m-%dT%H:%M:%S%z')\"",
      "    echo \"$ts ATTEMPT=$attempt URL=$url FILE=$filename STATUS=SKIP_EXISTS\" >> \"$logfile\"",
      "    echo \"Attempt $attempt SKIP $filename (already exists)\"",
      "    echo \"$url\" >> \"$success_file\"",
      "    rm -f \"$tmp_headers\"",
      "    rm -f \"$cookie_jar\"",
      "    return 0",
      "  fi",
      "",
      "  if curl --location --fail -C - \\",
      "      --connect-timeout 20 \\",
      "      --max-time 0 \\",
      "      --speed-time 60 --speed-limit 1024 \\",
      "      --retry 0 \\",
      "      --cookie \"$cookie_jar\" --cookie-jar \"$cookie_jar\" \\",
      "      --silent --show-error \\",
      "      --dump-header \"$tmp_headers\" \\",
      "      --output \"$part_path\" \\",
      "      \"$url\"; then",
      "    local content_type=\"\"",
      "    content_type=\"$(awk -F': ' 'BEGIN{IGNORECASE=1} /^Content-Type:/ {ct=$2} END {gsub(/\\r/, \"\", ct); print tolower(ct)}' \"$tmp_headers\" 2>/dev/null || true)\"",
      "    if echo \"$content_type\" | grep -q 'text/html'; then",
      "      ts=\"$(date +'%Y-%m-%dT%H:%M:%S%z')\"",
      "      echo \"$ts ATTEMPT=$attempt URL=$url FILE=$filename STATUS=FAIL_HTML CONTENT_TYPE=${content_type:-NA}\" >> \"$logfile\"",
      "      echo \"Attempt $attempt FAIL $filename (received HTML; likely license/landing page)\"",
      "      echo \"$url\" >> \"$failed_file\"",
      "      rm -f \"$part_path\" \"$tmp_headers\" \"$cookie_jar\"",
      "      return 1",
      "    fi",
      "",
      "    mv -f \"$part_path\" \"$final_path\"",
      "    ts=\"$(date +'%Y-%m-%dT%H:%M:%S%z')\"",
      "    echo \"$ts ATTEMPT=$attempt URL=$url FILE=$filename STATUS=SUCCESS\" >> \"$logfile\"",
      "    echo \"Attempt $attempt OK $filename\"",
      "    echo \"$url\" >> \"$success_file\"",
      "    rm -f \"$tmp_headers\" \"$cookie_jar\"",
      "    return 0",
      "  fi",
      "",
      "  local http_code=\"\"",
      "  http_code=\"$(awk 'toupper($1) ~ /^HTTP\\// {code=$2} END {print code}' \"$tmp_headers\" 2>/dev/null || true)\"",
      "  rm -f \"$tmp_headers\" \"$cookie_jar\"",
      "",
      "  ts=\"$(date +'%Y-%m-%dT%H:%M:%S%z')\"",
      "  echo \"$ts ATTEMPT=$attempt URL=$url FILE=$filename STATUS=FAIL HTTP=${http_code:-NA}\" >> \"$logfile\"",
      "  echo \"Attempt $attempt FAIL $filename HTTP=${http_code:-NA}\"",
      "  echo \"$url\" >> \"$failed_file\"",
      "  return 1",
      "}",
      "",
      "run_pass() {",
      "  local in_file=\"$1\"",
      "  local attempt=\"$2\"",
      "  local failed_out=\"$3\"",
      "  local pass_total=0",
      "  local start_success=0",
      "  local worker_pid=0",
      "  local current_success=0",
      "  local current_failed=0",
      "  local done_now=0",
      "  local last_reported=-1",
      "",
      "  : > \"$failed_out\"",
      "",
      "  if [ ! -s \"$in_file\" ]; then",
      "    return 0",
      "  fi",
      "",
      "  pass_total=$(wc -l < \"$in_file\" | tr -d ' ')",
      "  start_success=$(wc -l < \"$SUCCESS_FILE\" | tr -d ' ')",
      "  echo \"Pass $attempt: processing $pass_total URLs (mode=$PARALLEL_MODE, concurrency=$CONCURRENCY)\" | tee -a \"$LOGFILE\"",
      "",
      "  if [ \"$PARALLEL_MODE\" = \"xargs\" ]; then",
      "    export -f url_hash safe_token filename_from_url download_one",
      "    while IFS= read -r entry; do",
      "      [ -n \"$entry\" ] || continue",
      "      printf '%s\\0' \"$entry\"",
      "    done < \"$in_file\" | xargs -0 -P \"$CONCURRENCY\" -I {} bash -lc 'set -euo pipefail; download_one \"$@\"' _ \\",
      "      {} \"$OUTDIR\" \"$LOGFILE\" \"$attempt\" \"$SUCCESS_FILE\" \"$failed_out\" &",
      "    worker_pid=$!",
      "    while kill -0 \"$worker_pid\" 2>/dev/null; do",
      "      current_success=$(wc -l < \"$SUCCESS_FILE\" | tr -d ' ')",
      "      current_failed=0",
      "      if [ -s \"$failed_out\" ]; then",
      "        current_failed=$(wc -l < \"$failed_out\" | tr -d ' ')",
      "      fi",
      "      done_now=$((current_success - start_success + current_failed))",
      "      if [ \"$done_now\" -gt \"$pass_total\" ]; then",
      "        done_now=\"$pass_total\"",
      "      fi",
      "      if [ \"$done_now\" -ne \"$last_reported\" ]; then",
      "        echo \"Pass $attempt progress: $done_now/$pass_total completed\" | tee -a \"$LOGFILE\"",
      "        last_reported=\"$done_now\"",
      "      fi",
      "      sleep 15",
      "    done",
      "    wait \"$worker_pid\" || true",
      "  else",
      "    local seq_done=0",
      "    while IFS= read -r entry; do",
      "      [ -n \"$entry\" ] || continue",
      "      seq_done=$((seq_done + 1))",
      "      echo \"Pass $attempt progress: $seq_done/$pass_total\" | tee -a \"$LOGFILE\"",
      "      download_one \"$entry\" \"$OUTDIR\" \"$LOGFILE\" \"$attempt\" \"$SUCCESS_FILE\" \"$failed_out\" || true",
      "    done < \"$in_file\"",
      "  fi",
      "",
      "  sanitize_list \"$failed_out\" > \"$failed_out.tmp\" || true",
      "  mv -f \"$failed_out.tmp\" \"$failed_out\"",
      "}",
      "",
      "attempt=1",
      "queue_file=\"$QUEUE_DIR/urls_0.txt\"",
      "",
      "while [ \"$attempt\" -le \"$MAX_ATTEMPTS\" ]; do",
      "  next_failed=\"$QUEUE_DIR/failed_attempt_${attempt}.txt\"",
      "  run_pass \"$queue_file\" \"$attempt\" \"$next_failed\"",
      "",
      "  remaining=0",
      "  if [ -s \"$next_failed\" ]; then",
      "    remaining=$(wc -l < \"$next_failed\" | tr -d ' ')",
      "  fi",
      "",
      "  ts=\"$(date +'%Y-%m-%dT%H:%M:%S%z')\"",
      "  echo \"$ts PASS=$attempt REMAINING=$remaining\" >> \"$LOGFILE\"",
      "  echo \"Pass $attempt complete: remaining=$remaining\" | tee -a \"$LOGFILE\"",
      "",
      "  queue_file=\"$next_failed\"",
      "",
      "  if [ \"$remaining\" -eq 0 ]; then",
      "    break",
      "  fi",
      "",
      "  if [ \"$attempt\" -lt \"$MAX_ATTEMPTS\" ]; then",
      "    base_sleep=$((2 ** (attempt - 1)))",
      "    jitter=$((RANDOM % 3))",
      "    sleep_for=$((base_sleep + jitter))",
      "    echo \"Retry pass $((attempt + 1)) in ${sleep_for}s (remaining: $remaining)\" | tee -a \"$LOGFILE\"",
      "    sleep \"$sleep_for\"",
      "  fi",
      "",
      "  attempt=$((attempt + 1))",
      "done",
      "",
      "if [ -s \"$queue_file\" ]; then",
      "  cp \"$queue_file\" \"$FAILED_FILE\"",
      "else",
      "  : > \"$FAILED_FILE\"",
      "fi",
      "",
      "SUCCEEDED=0",
      "FAILED=0",
      "if [ -s \"$SUCCESS_FILE\" ]; then",
      "  SUCCEEDED=$(sort -u \"$SUCCESS_FILE\" | tee \"$SUCCESS_FILE.tmp\" | wc -l | tr -d ' ')",
      "  mv -f \"$SUCCESS_FILE.tmp\" \"$SUCCESS_FILE\"",
      "fi",
      "if [ -s \"$FAILED_FILE\" ]; then",
      "  FAILED=$(sort -u \"$FAILED_FILE\" | tee \"$FAILED_FILE.tmp\" | wc -l | tr -d ' ')",
      "  mv -f \"$FAILED_FILE.tmp\" \"$FAILED_FILE\"",
      "fi",
      "",
      "echo \"Done. total=$TOTAL succeeded=$SUCCEEDED failed=$FAILED\" | tee -a \"$LOGFILE\"",
      "echo \"Logs: $LOGFILE\"",
      "echo \"Success list: $SUCCESS_FILE\"",
      "echo \"Failed list: $FAILED_FILE\"",
      "",
      "if [ \"$FAILED\" -gt 0 ]; then",
      "  exit 1",
      "fi",
      ""
    ].join("\n");
  };

  Explorer.prototype.buildShuttleCommandText = function (rows) {
    var shuttleRows = this.getShuttleCliRows(rows);
    var duplicateSiteIds = this.getDuplicateSelectedSiteIds(shuttleRows);
    var skipped = (rows || []).length - shuttleRows.length;
    if (!shuttleRows.length) {
      return [
        "# No Shuttle snapshot rows are selected.",
        "# ICOS-direct and JapanFlux-direct rows are available through direct links / download_shuttle_selected.sh,",
        "# but they are not present in shuttle_snapshot.csv for Shuttle CLI site-id downloads."
      ].join("\n");
    }
    var lines = [
      "# FLUXNET Shuttle CLI syntax (confirmed from shuttle docs):",
      "# fluxnet-shuttle download -f shuttle_snapshot.csv -s SITE1 SITE2 ...",
      "#",
      "# The CLI does not support a --sites-file option, so this helper expands shuttle_selected_sites.txt:",
      "fluxnet-shuttle download -f shuttle_snapshot.csv -o fluxnet_downloads -s $(tr '\\n' ' ' < shuttle_selected_sites.txt)"
    ];
    if (skipped > 0) {
      lines.push(
        "",
        "# Note: " + skipped + " Otherwise-available selection(s) were excluded from this Shuttle CLI command."
      );
    }
    if (duplicateSiteIds.length) {
      lines.push(
        "",
        "# Warning: duplicate site_id values are selected (" + duplicateSiteIds.slice(0, 10).join(", ") +
          (duplicateSiteIds.length > 10 ? ", ..." : "") +
          "). Shuttle download uses site_id keys from the snapshot, so duplicates across hubs can be ambiguous.",
        "# For exact hub-specific downloads, prefer the links file / shell script generated by this page."
      );
    }
    return lines.join("\n");
  };

  Explorer.prototype.buildShuttleExclusionWarning = function (rows) {
    var excluded = uniqueSiteIdsFromRows(this.getAmeriFluxRows(rows)).length;
    if (!excluded) {
      return "";
    }
    return excluded + " AmeriFlux API-backed selection(s) were excluded from the direct-link bulk output.";
  };

  Explorer.prototype.handleDownloadAllSelectedScript = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    this.buildDownloadAllSelectedFiles(rows).forEach(function (file) {
      this.downloadTextFile(file.filename, file.text, file.mimeType);
    }, this);
    this.setBulkStatus("Downloaded download_all_selected.sh, download_ameriflux_selected.sh, and download_shuttle_selected.sh.");
    gaEvent("fx_download_all_script_download", { count: rows.length });
  };

  Explorer.prototype.handleCopyAllSelectedScript = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    this.copyText(this.buildDownloadAllSelectedScript(rows), "Copied download_all_selected.sh wrapper script. Keep it with the generated source-specific scripts.");
    gaEvent("fx_download_all_script_copy", { count: rows.length });
  };

  Explorer.prototype.handleDownloadManifest = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var shuttleRows = this.getShuttleRows(rows);
    if (!shuttleRows.length) {
      this.setBulkStatus("No direct-source rows are selected. Use the Otherwise-available bulk download tools for AmeriFlux API-backed sites.");
      return;
    }
    this.downloadTextFile("shuttle_selected_manifest.csv", this.buildSelectionManifestCsv(shuttleRows), "text/csv;charset=utf-8");
    var warning = this.buildShuttleExclusionWarning(rows);
    this.setBulkStatus("Downloaded shuttle_selected_manifest.csv for " + shuttleRows.length + " non-AmeriFlux row(s)." + (warning ? (" " + warning) : ""));
    gaEvent("fx_manifest_download", { count: shuttleRows.length });
  };

  Explorer.prototype.handleDownloadLinks = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var shuttleRows = this.getShuttleDownloadRows(rows);
    var landingPageWarning = this.buildManualLandingPageWarning(rows);
    if (!shuttleRows.length) {
      this.setBulkStatus(landingPageWarning || "No direct-download rows are selected. Otherwise-available rows do not produce static links.");
      return;
    }
    this.downloadTextFile("shuttle_links.txt", this.buildLinksText(shuttleRows), "text/plain;charset=utf-8");
    var warning = this.buildShuttleExclusionWarning(rows);
    this.setBulkStatus("Downloaded shuttle_links.txt for " + shuttleRows.length + " direct-download row(s)." + (warning || landingPageWarning ? (" " + [warning, landingPageWarning].filter(Boolean).join(" ")) : ""));
    gaEvent("fx_links_download", { count: shuttleRows.length });
  };

  Explorer.prototype.handleDownloadScript = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var shuttleRows = this.getShuttleDownloadRows(rows);
    var landingPageWarning = this.buildManualLandingPageWarning(rows);
    if (!shuttleRows.length) {
      this.setBulkStatus(landingPageWarning || "No direct-download rows are selected. Use the Otherwise-available shell script tools for AmeriFlux API-backed sites.");
      return;
    }
    this.downloadTextFile("download_shuttle_selected.sh", this.buildCurlScript(shuttleRows), "text/x-shellscript;charset=utf-8");
    var warning = this.buildShuttleExclusionWarning(rows);
    this.setBulkStatus("Downloaded download_shuttle_selected.sh for " + shuttleRows.length + " direct-download row(s)." + (warning || landingPageWarning ? (" " + [warning, landingPageWarning].filter(Boolean).join(" ")) : ""));
    gaEvent("fx_script_download", { count: shuttleRows.length });
  };

  Explorer.prototype.handleDownloadSitesFile = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var shuttleRows = this.getShuttleCliRows(rows);
    if (!shuttleRows.length) {
      this.setBulkStatus("No Shuttle snapshot rows are selected. ICOS-direct and JapanFlux-direct rows can still use download_shuttle_selected.sh or per-row links.");
      return;
    }
    this.downloadTextFile("shuttle_selected_sites.txt", this.buildSelectedSitesText(shuttleRows), "text/plain;charset=utf-8");
    if (shuttleRows.length < rows.length) {
      this.setBulkStatus("Downloaded shuttle_selected_sites.txt for Shuttle-backed rows only.");
      return;
    }
    this.setBulkStatus("Downloaded shuttle_selected_sites.txt.");
  };

  Explorer.prototype.handleDownloadKnownSitesCsv = function () {
    var rows = Array.isArray(this.state.knownSiteMapRows) ? this.state.knownSiteMapRows : [];
    if (!rows.length) {
      return;
    }
    this.downloadTextFile(
      "all_known_flux_sites_map_export.csv",
      this.buildKnownSitesExportCsv(rows),
      "text/csv;charset=utf-8"
    );
  };

  Explorer.prototype.handleDownloadAmeriFluxSitesFile = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var ameriFluxRows = this.getAmeriFluxRows(rows);
    if (!ameriFluxRows.length) {
      this.setBulkStatus("No Otherwise-available rows are selected.");
      return;
    }
    this.downloadTextFile("ameriflux_selected_sites.txt", this.buildAmeriFluxSelectedSitesText(ameriFluxRows), "text/plain;charset=utf-8");
    this.setBulkStatus("Downloaded ameriflux_selected_sites.txt for " + uniqueSiteIdsFromRows(ameriFluxRows).length + " AmeriFlux API-backed site(s).");
  };

  Explorer.prototype.handleDownloadAmeriFluxScript = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var ameriFluxRows = this.getAmeriFluxRows(rows);
    if (!ameriFluxRows.length) {
      this.setBulkStatus("No Otherwise-available rows are selected.");
      return;
    }
    this.downloadTextFile("download_ameriflux_selected.sh", this.buildAmeriFluxBulkScript(ameriFluxRows), "text/x-shellscript;charset=utf-8");
    this.setBulkStatus("Downloaded download_ameriflux_selected.sh for " + uniqueSiteIdsFromRows(ameriFluxRows).length + " AmeriFlux API-backed site(s).");
  };

  Explorer.prototype.handleCopyAmeriFluxScript = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var ameriFluxRows = this.getAmeriFluxRows(rows);
    if (!ameriFluxRows.length) {
      this.setBulkStatus("No Otherwise-available rows are selected.");
      return;
    }
    this.copyText(this.buildAmeriFluxBulkScript(ameriFluxRows), "Copied AmeriFlux API bulk shell script.");
    gaEvent("fx_ameriflux_script_copy", { count: uniqueSiteIdsFromRows(ameriFluxRows).length });
  };

  Explorer.prototype.handleCopyLinks = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var shuttleRows = this.getShuttleDownloadRows(rows);
    var landingPageWarning = this.buildManualLandingPageWarning(rows);
    if (!shuttleRows.length) {
      this.setBulkStatus(landingPageWarning || "No direct-download rows are selected. Otherwise-available rows require the Otherwise-available bulk shell script.");
      return;
    }
    this.copyText(this.buildLinksText(shuttleRows), "Copied Shuttle links.");
    var warning = this.buildShuttleExclusionWarning(rows);
    if (warning || landingPageWarning) {
      this.setBulkStatus("Copied Shuttle links. " + [warning, landingPageWarning].filter(Boolean).join(" "));
    }
    gaEvent("fx_copy_links", { count: shuttleRows.length });
  };

  Explorer.prototype.handleAmeriFluxRowDownload = function (siteId, dataProduct, sourceLabel, buttonEl) {
    var self = this;
    var site = String(siteId || "").trim();
    var product = normalizeDownloadProduct(dataProduct || AMERIFLUX_FLUXNET_PRODUCT);
    var label = String(sourceLabel || "").trim() || (product === FLUXNET2015_PRODUCT
      ? FLUXNET2015_SOURCE_ONLY
      : (product === AMERIFLUX_BASE_PRODUCT ? BASE_SOURCE_ONLY : AMERIFLUX_SOURCE_ONLY));
    var apiSource = this.getAmeriFluxApiSource(product);
    var identity = this.getEffectiveAmeriFluxIdentity();
    if (!site) {
      return;
    }

    var originalText = buttonEl ? buttonEl.textContent : "";
    var canDirectDownload = apiSource.canDownload();
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = getApiActionPreparingLabel(product, canDirectDownload);
    }

    apiSource.download_site(site, AMERIFLUX_DEFAULT_VARIANT, AMERIFLUX_DEFAULT_POLICY, identity)
      .then(function (result) {
        if (result && result.manual_download_required) {
          var curlCommand = String(result.curl_command || "").trim();
          if (curlCommand) {
            self.copyText(
              curlCommand,
              "Copied " + apiProductDisplayName(product) + " curl command for " + site + "."
            );
          } else {
            self.setBulkStatus(label + " downloads require your own AmeriFlux identity.");
          }
          gaEvent("fx_ameriflux_manual_command", { site_id: site, data_product: product });
          return;
        }
        var dataUrls = Array.isArray(result && result.data_urls) ? result.data_urls : [];
        var urls = dataUrls.map(function (entry) {
          return String(entry && entry.url || "").trim();
        }).filter(Boolean);
        if (!urls.length) {
          throw new Error("AmeriFlux returned an empty data_urls list.");
        }

        logAmeriFluxDownloadEntries(dataUrls, { timeoutMs: self.requestTimeoutMs });

        if (typeof window.open === "function") {
          window.open(urls[0], "_blank", "noopener,noreferrer");
        }
        if (urls.length > 1) {
          self.downloadTextFile(product.toLowerCase() + "_" + site + "_links.txt", urls.join("\n") + "\n", "text/plain;charset=utf-8");
        }
        self.setBulkStatus("Requested " + product + " download URL(s) for " + site + " (" + urls.length + " file" + (urls.length === 1 ? "" : "s") + ").");
        gaEvent("fx_ameriflux_download", { site_id: site, count: urls.length, data_product: product });
      })
      .catch(function (error) {
        self.setBulkStatus(product + " download request failed for " + site + ": " + (error && error.message ? error.message : String(error)));
      })
      .then(function () {
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.textContent = originalText || (apiSource.canDownload() ? getApiActionRequestLabel(product) : getApiActionCopyLabel(product));
        }
      });
  };

  Explorer.prototype.toggleCliPanel = function () {
    var rows = this.getSelectedRows();
    this.state.cliPanelVisible = !this.state.cliPanelVisible;
    if (this.state.cliPanelVisible && rows.length) {
      if (this.bindings.cliCommand) {
        this.bindings.cliCommand.textContent = this.buildShuttleCommandText(rows);
      }
    }
    this.render();
  };

  Explorer.prototype.handleCopyCommand = function () {
    var rows = this.getSelectedRowsOrWarn();
    if (!rows) {
      return;
    }
    var shuttleRows = this.getShuttleCliRows(rows);
    if (!shuttleRows.length) {
      this.setBulkStatus("No Shuttle-backed rows are selected for a Shuttle CLI command.");
      return;
    }
    this.copyText(this.buildShuttleCommandText(rows), "Copied Shuttle CLI helper command.");
    gaEvent("fx_copy_command", { count: shuttleRows.length });
  };

  Explorer.prototype.renderBulkPanel = function () {
    var b = this.bindings;
    var hasData = this.state.mode === "ready" && this.state.rows.length > 0;
    var selectedRows = this.getSelectedRows();
    var selectedCount = selectedRows.length;
    var allowBulkActions = shouldEnableBulkToolsActions(selectedCount);
    var selectionSummary = this.getBulkSelectionSummary(selectedRows);
    var allSelectedDisabled = !selectionSummary.showAllSelectedActions;
    var shuttleDisabled = !selectionSummary.shuttleCount;
    var shuttleCliDisabled = !this.getShuttleCliRows(selectedRows).length;
    var ameriFluxDisabled = !selectionSummary.ameriFluxCount;
    var wasHidden;

    if (!b.bulkPanel) {
      return;
    }

    wasHidden = b.bulkPanel.classList.contains("shuttle-explorer__hidden");
    b.bulkPanel.classList.toggle("shuttle-explorer__hidden", !hasData);
    if (!hasData) {
      b.bulkPanel.open = false;
      this.state.cliPanelVisible = false;
      return;
    }
    if (wasHidden) {
      b.bulkPanel.open = false;
    }

    if (b.selectionCount) {
      b.selectionCount.textContent = formatSelectedSiteCount(selectedCount);
    }
    if (b.bulkWarning) {
      b.bulkWarning.textContent = this.state.downloadWarning || "";
      b.bulkWarning.classList.toggle("shuttle-explorer__hidden", !this.state.downloadWarning);
    }

    if (b.allSelectedActions) {
      b.allSelectedActions.classList.toggle("shuttle-explorer__hidden", !(allowBulkActions && selectionSummary.showAllSelectedActions));
    }

    if (b.shuttleSelectionCount) {
      var shuttleSelectionParts = [selectionSummary.shuttleDownloadCount + " direct-download"];
      if (selectionSummary.manualLandingPageCount > 0) {
        shuttleSelectionParts.push(selectionSummary.manualLandingPageCount + " landing-page-only");
      }
      if (selectionSummary.requestOnlyCount > 0) {
        shuttleSelectionParts.push(selectionSummary.requestOnlyCount + " request-only");
      }
      b.shuttleSelectionCount.textContent = shuttleSelectionParts.join(", ") + " site(s) selected";
    }
    if (b.ameriFluxSelectionCount) {
      b.ameriFluxSelectionCount.textContent = selectionSummary.ameriFluxCount + " sites available elsewhere selected";
    }

    if (b.shuttleBulkSection) {
      b.shuttleBulkSection.classList.toggle("shuttle-explorer__hidden", !(allowBulkActions && selectionSummary.showShuttleSection));
    }
    if (b.ameriFluxBulkSection) {
      b.ameriFluxBulkSection.classList.toggle("shuttle-explorer__hidden", !(allowBulkActions && selectionSummary.showAmeriFluxSection));
    }

    if (b.downloadManifest) {
      b.downloadManifest.disabled = shuttleDisabled;
    }
    [
      b.downloadLinks,
      b.downloadScript,
      b.copyLinks
    ].forEach(function (btn) {
      if (btn) {
        btn.disabled = !selectionSummary.shuttleDownloadCount;
      }
    });
    [
      b.downloadSitesFile,
      b.copyCommand
    ].forEach(function (btn) {
      if (btn) {
        btn.disabled = shuttleCliDisabled;
      }
    });

    [
      b.downloadAllSelectedScript,
      b.copyAllSelectedScript
    ].forEach(function (btn) {
      if (btn) {
        btn.disabled = allSelectedDisabled;
      }
    });

    [
      b.downloadAmeriFluxSitesFile,
      b.downloadAmeriFluxScript,
      b.copyAmeriFluxScript
    ].forEach(function (btn) {
      if (btn) {
        btn.disabled = ameriFluxDisabled;
      }
    });

    if (b.showCliCommand) {
      b.showCliCommand.disabled = !allowBulkActions || shuttleCliDisabled;
      b.showCliCommand.textContent = this.state.cliPanelVisible ? "Hide Shuttle CLI command" : "Show Shuttle CLI command";
    }

    if (!allowBulkActions) {
      this.state.cliPanelVisible = false;
      this.setBulkStatus("");
    }

    if (b.cliPanel) {
      b.cliPanel.classList.toggle("shuttle-explorer__hidden", !(allowBulkActions && this.state.cliPanelVisible && !shuttleCliDisabled));
    }

    if (b.cliCommand && !shuttleCliDisabled) {
      b.cliCommand.textContent = this.buildShuttleCommandText(selectedRows);
    } else if (b.cliCommand) {
      b.cliCommand.textContent = "";
    }
  };

  Explorer.prototype.renderTableHeader = function () {
    var self = this;
    var row = this.bindings.theadRow;
    if (!row) {
      return;
    }
    row.innerHTML = "";

    var selectTh = document.createElement("th");
    selectTh.scope = "col";
    selectTh.className = "shuttle-explorer__select-col";
    selectTh.textContent = "Select";
    row.appendChild(selectTh);

    SORT_COLUMNS.forEach(function (col) {
      var th = document.createElement("th");
      var className = tableColumnClassName(col.key);
      th.scope = "col";
      if (className) {
        th.className = className;
      }
      th.setAttribute("aria-sort", "none");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shuttle-explorer__sort";
      btn.setAttribute("data-sort-key", col.key);
      btn.innerHTML =
        "<span>" + escapeHtml(col.label) + "</span>" +
        "<span class=\"shuttle-explorer__sort-indicator\" aria-hidden=\"true\">↕</span>";
      th.appendChild(btn);
      row.appendChild(th);
    });

    var downloadTh = document.createElement("th");
    downloadTh.scope = "col";
    var copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "shuttle-explorer__table-copy-btn";
    copyButton.setAttribute("data-role", "copy-table-button");
    copyButton.setAttribute("aria-label", COPY_TABLE_BUTTON_LABEL);
    copyButton.textContent = COPY_TABLE_BUTTON_LABEL;
    downloadTh.appendChild(copyButton);
    row.appendChild(downloadTh);

    row.addEventListener("mouseover", function () {
      self.updateHeaderSortIndicators();
    });
  };

  Explorer.prototype.updateHeaderSortIndicators = function () {
    var self = this;
    qsa(this.bindings.theadRow, "th").forEach(function (th) {
      th.setAttribute("aria-sort", "none");
    });
    qsa(this.bindings.theadRow, "button[data-sort-key]").forEach(function (btn) {
      var key = btn.getAttribute("data-sort-key");
      var th = btn.parentNode;
      var indicator = bySelector(btn, ".shuttle-explorer__sort-indicator");
      if (key === self.state.sortKey) {
        var asc = self.state.sortDir !== "desc";
        th.setAttribute("aria-sort", asc ? "ascending" : "descending");
        if (indicator) {
          indicator.textContent = asc ? "↑" : "↓";
        }
      } else if (indicator) {
        indicator.textContent = "↕";
      }
    });
  };

  Explorer.prototype.populateFilters = function () {
    var rows = this.state.rows;
    var b = this.bindings;
    var networkMap = {};
    var countryMap = {};

    rows.forEach(function (row) {
      row.network_tokens.forEach(function (token) {
        if (token) {
          networkMap[token] = true;
        }
      });
      if (row.country) {
        countryMap[row.country] = true;
      }
    });

    this.populateMultiSelectFilter(b.availabilityFilter, uniqueAvailabilityFilterValues(rows));
    this.populateMultiSelectFilter(b.sourceFilter, uniqueSourceFilterValues(rows));
    this.populateMultiSelectFilter(b.networkFilter, Object.keys(networkMap).sort());
    this.populateMultiSelectFilter(b.countryFilter, Object.keys(countryMap).sort());
    this.populateMultiSelectFilter(b.vegetationFilter, buildVegetationFilterOptions(rows));

    this.syncMinimumYearsFilterControl();
    this.syncYearRangeFilterControl(true);

  };

  Explorer.prototype.isDefaultMapAccessibleUniverse = function () {
    var normalizedYearRange;
    if (String(this.state.search || "").trim()) {
      return false;
    }
    if (filterSelectionHasValues(this.state.selectedNetworks) ||
        filterSelectionHasValues(this.state.selectedNetwork) ||
        filterSelectionHasValues(this.state.selectedSources) ||
        filterSelectionHasValues(this.state.selectedSource) ||
        filterSelectionHasValues(this.state.selectedAvailabilities) ||
        filterSelectionHasValues(this.state.selectedAvailability) ||
        filterSelectionHasValues(this.state.selectedCountries) ||
        filterSelectionHasValues(this.state.selectedCountry) ||
        filterSelectionHasValues(this.state.selectedVegetations) ||
        filterSelectionHasValues(this.state.selectedVegetation)) {
      return false;
    }
    if ((parseIntOrNull(this.state.minimumYears) || DEFAULT_MINIMUM_YEARS_FILTER) !== DEFAULT_MINIMUM_YEARS_FILTER) {
      return false;
    }
    normalizedYearRange = normalizeYearRangeFilter({
      start: this.state.yearRangeStart,
      end: this.state.yearRangeEnd
    }, this.state.yearRangeBounds);
    if (!normalizedYearRange.isDefault) {
      return false;
    }
    return true;
  };

  Explorer.prototype.updateDerivedState = function () {
    var self = this;
    var search = String(this.state.search || "").trim().toLowerCase();
    var selectedNetworks = normalizeFilterSelection(this.state.selectedNetworks).length
      ? normalizeFilterSelection(this.state.selectedNetworks)
      : normalizeFilterSelection(this.state.selectedNetwork);
    var selectedSources = normalizeFilterSelection(this.state.selectedSources).length
      ? normalizeFilterSelection(this.state.selectedSources)
      : normalizeFilterSelection(this.state.selectedSource);
    var selectedAvailabilities = normalizeFilterSelection(this.state.selectedAvailabilities).length
      ? normalizeFilterSelection(this.state.selectedAvailabilities)
      : normalizeFilterSelection(this.state.selectedAvailability);
    var selectedCountries = normalizeFilterSelection(this.state.selectedCountries).length
      ? normalizeFilterSelection(this.state.selectedCountries)
      : normalizeFilterSelection(this.state.selectedCountry);
    var selectedVegetations = normalizeFilterSelection(this.state.selectedVegetations).length
      ? normalizeFilterSelection(this.state.selectedVegetations)
      : normalizeFilterSelection(this.state.selectedVegetation);
    var minimumYears = this.state.minimumYears;
    var yearRange = {
      start: this.state.yearRangeStart,
      end: this.state.yearRangeEnd
    };
    var yearRangeBounds = this.state.yearRangeBounds;

    this.state.filteredRows = this.state.rows.filter(function (row) {
      return rowMatchesExplorerFilters(row, {
        search: search,
        selectedNetworks: selectedNetworks,
        selectedSources: selectedSources,
        selectedAvailabilities: selectedAvailabilities,
        selectedCountries: selectedCountries,
        selectedVegetations: selectedVegetations,
        minimumYears: minimumYears,
        yearRange: yearRange,
        yearRangeBounds: yearRangeBounds
      });
    }).slice().sort(function (a, b) {
      return compareRows(a, b, self.state.sortKey, self.state.sortDir);
    });

    if (this.isDefaultMapAccessibleUniverse()) {
      this.state.mapAccessibleRows = this.state.filteredRows.slice();
    }

    var totalPages = this.getTotalPages();
    if (this.state.page > totalPages) {
      this.state.page = totalPages;
    }
    if (this.state.page < 1) {
      this.state.page = 1;
    }
  };

  Explorer.prototype.getDisplayedRows = function () {
    return Array.isArray(this.state.filteredRows) ? this.state.filteredRows : [];
  };

  Explorer.prototype.renderRows = function () {
    var tbody = this.bindings.tbody;
    if (!tbody) {
      return;
    }
    var rows = this.getDisplayedRows();
    var pageRows = rows;
    var selectedKeys = this.state.selectedKeys || {};
    var canAmeriFluxDownload = this.ameriFluxSource.canDownload();

    tbody.innerHTML = "";
    this.tableRowsBySiteKey = {};

    pageRows.forEach(function (row) {
      var tr = document.createElement("tr");
      var sourceBadgeHtml = row.source_label
        ? "<div class=\"shuttle-explorer__site-badge\">" + renderSourceBadgeHtml(row.source_label, row.source_reason) + "</div>"
        : "";
      var cellsHtml = SORT_COLUMNS.map(function (column) {
        var className = tableColumnClassName(column.key);
        return "<td" + (className ? " class=\"" + className + "\"" : "") + ">" +
          renderTableCellHtml(row, column.key, sourceBadgeHtml) +
          "</td>";
      }).join("");
      var downloadOptions = buildRowDownloadOptions(row, canAmeriFluxDownload);
      tr.innerHTML = [
        "<td class=\"shuttle-explorer__select-cell\"><input type=\"checkbox\" data-role=\"row-select\" data-key=\"" + escapeHtml(row._selection_key) + "\"" +
          (selectedKeys[row._selection_key] ? " checked" : "") +
          " aria-label=\"Select " + escapeHtml(row.site_id) + "\" /></td>",
        cellsHtml
      ].join("");
      this.registerLinkedTableRow(row, tr);

      var downloadTd = document.createElement("td");
      downloadTd.className = "shuttle-explorer__download-cell";

      downloadOptions.forEach(function (option) {
        var optionWrap = document.createElement("div");
        var label = null;
        var control;
        optionWrap.className = "shuttle-explorer__download-option";

        if (downloadOptions.length > 1) {
          label = document.createElement("div");
          label.className = "shuttle-explorer__download-option-label";
          label.textContent = option.displayLabel;
          optionWrap.appendChild(label);
        }

        if (option.mode === "ameriflux_api") {
          control = document.createElement("button");
          control.type = "button";
          control.className = "shuttle-explorer__btn shuttle-explorer__btn--small";
          control.setAttribute("data-role", "ameriflux-download");
          control.setAttribute("data-site-id", option.siteId);
          control.setAttribute("data-product", option.dataProduct);
          control.setAttribute("data-source-label", option.sourceLabel);
          control.textContent = option.actionLabel;
          control.setAttribute("aria-label", option.actionLabel + " for " + option.siteId);
          if (option.title) {
            control.title = option.title;
          }
        } else {
          control = document.createElement("a");
          control.className = "shuttle-explorer__btn shuttle-explorer__btn--small";
          control.href = option.downloadLink;
          control.target = "_blank";
          control.rel = "noopener noreferrer";
          control.setAttribute("data-role", "row-link-action");
          control.setAttribute("data-site-id", option.siteId);
          control.setAttribute("data-link-mode", option.mode);
          control.setAttribute("data-source-label", option.sourceLabel);
          control.setAttribute(
            "data-outbound-event",
            option.mode === REQUEST_PAGE_DOWNLOAD_MODE
              ? "fx_request_page_click"
              : (option.mode === LANDING_PAGE_DOWNLOAD_MODE ? "fx_landing_page_click" : "fx_row_download_click")
          );
          control.textContent = option.actionLabel;
          control.setAttribute("aria-label", option.actionLabel + " for " + option.siteId);
          if (option.title) {
            control.title = option.title;
          }
        }

        optionWrap.appendChild(control);
        downloadTd.appendChild(optionWrap);
      });
      tr.appendChild(downloadTd);

      tbody.appendChild(tr);
    }, this);
  };

  Explorer.prototype.renderPagination = function () {
    var b = this.bindings;

    if (!b.pagination) {
      return;
    }
    b.pagination.classList.add("shuttle-explorer__hidden");
    if (b.pageButtons) {
      b.pageButtons.innerHTML = "";
    }
    if (b.pageSummary) {
      b.pageSummary.textContent = "";
    }
  };

  Explorer.prototype.renderSummary = function () {
    if (this.bindings.summary) {
      this.bindings.summary.textContent = "";
    }
  };

  Explorer.prototype.renderEmptyState = function () {
    var empty = this.bindings.empty;
    if (!empty) {
      return;
    }
    if (this.state.mode === "error") {
      empty.classList.remove("shuttle-explorer__hidden");
      empty.innerHTML =
        "<strong>Could not load snapshot.</strong> " +
        escapeHtml(this.state.errorMessage || "Unknown error.") +
        " " +
        "<a href=\"" + escapeHtml(this.csvUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Open CSV snapshot</a>";
      return;
    }

    if (this.state.mode !== "ready") {
      empty.classList.add("shuttle-explorer__hidden");
      empty.innerHTML = "";
      return;
    }

    if (!this.state.rows.length) {
      empty.classList.remove("shuttle-explorer__hidden");
      empty.innerHTML = "Snapshot loaded, but no rows are available.";
      return;
    }

    if (!this.state.filteredRows.length) {
      empty.classList.remove("shuttle-explorer__hidden");
      empty.textContent = "No matching sites.";
      return;
    }

    empty.classList.add("shuttle-explorer__hidden");
    empty.innerHTML = "";
  };

  Explorer.prototype.renderHubSummaryInStatus = function () {
    var total = this.state.rows.length;
    var msg = "Data is available for a total of " + total + " sites.";
    if (this.state.warning) {
      msg += " " + this.state.warning;
    }
    this.setMode("ready", msg, "is-ok");
  };

  Explorer.prototype.render = function () {
    var b = this.bindings;
    var hasData = this.state.mode === "ready" && this.state.rows.length > 0;
    var hasMatches = hasData && this.state.filteredRows.length > 0;

    if (this.state.mode === "loading") {
      this.setMode("loading", "Loading snapshot…", "is-loading");
    } else if (this.state.mode === "error") {
      this.setMode("error", "Error loading snapshot.", "is-error");
    } else if (this.state.mode === "ready") {
      this.renderHubSummaryInStatus();
    }

    this.renderSnapshotUpdatedText();

    if (b.controls) {
      b.controls.classList.toggle("shuttle-explorer__hidden", !hasData);
    }
    if (b.selectionActions) {
      b.selectionActions.classList.toggle("shuttle-explorer__hidden", !hasData);
    }
    if (b.mapPanel) {
      b.mapPanel.classList.toggle("shuttle-explorer__hidden", !hasData);
    }
    this.renderBulkPanel();
    if (b.tableWrap) {
      b.tableWrap.classList.toggle("shuttle-explorer__hidden", !hasMatches);
    }

    this.updateHeaderSortIndicators();
    if (hasData) {
      this.renderSummary();
    }
    if (hasMatches) {
      this.renderRows();
    } else if (b.tbody) {
      b.tbody.innerHTML = "";
      this.tableRowsBySiteKey = {};
    }
    this.renderPagination();
    this.renderEmptyState();
    if (hasData) {
      this.renderMap();
    }

  };

  Explorer.prototype.applyLoadedSnapshotState = function (snapshot) {
    this.state.rows = Array.isArray(snapshot && snapshot.rows)
      ? snapshot.rows.map(function (row) {
        return finalizeRowComputedState(Object.assign({}, row));
      })
      : [];
    this.pruneSelection();
    this.state.droppedRows = snapshot && snapshot.droppedRows ? snapshot.droppedRows : 0;
    this.state.source = snapshot && snapshot.source ? snapshot.source : "";
    this.state.sourceUrl = snapshot && snapshot.sourceUrl ? snapshot.sourceUrl : "";
    this.state.warning = snapshot && snapshot.warning ? snapshot.warning : "";
    this.state.downloadWarning = snapshot && snapshot.downloadWarning ? snapshot.downloadWarning : "";
    this.state.snapshotRefreshedDate = snapshot && snapshot.snapshotRefreshedDate ? snapshot.snapshotRefreshedDate : "";
    this.state.snapshotUpdatedDate = snapshot && snapshot.snapshotUpdatedDate ? snapshot.snapshotUpdatedDate : "";
    this.state.amerifluxTotalSites = snapshot && snapshot.amerifluxTotalSites ? snapshot.amerifluxTotalSites : 0;
    this.state.amerifluxSitesWithYears = snapshot && snapshot.amerifluxSitesWithYears ? snapshot.amerifluxSitesWithYears : 0;
    this.state.amerifluxOverlapSites = snapshot && snapshot.amerifluxOverlapSites ? snapshot.amerifluxOverlapSites : 0;
    this.state.amerifluxOnlySites = snapshot && snapshot.amerifluxOnlySites ? snapshot.amerifluxOnlySites : 0;
    this.state.fluxnet2015TotalSites = snapshot && snapshot.fluxnet2015TotalSites ? snapshot.fluxnet2015TotalSites : 0;
    this.state.fluxnet2015SitesWithYears = snapshot && snapshot.fluxnet2015SitesWithYears ? snapshot.fluxnet2015SitesWithYears : 0;
    this.state.fluxnet2015OnlySites = snapshot && snapshot.fluxnet2015OnlySites ? snapshot.fluxnet2015OnlySites : 0;
    this.state.errorMessage = "";

    this.populateFilters();
    this.updateDerivedState();
    this.state.mode = "ready";
    this.render();
    this.trackExplorerLoadedOnce();
  };

  function buildMergedSnapshotStateForRoot(jsonUrl, shuttleResult, icosDirectResult, japanFluxResult, efdResult, ameriResult, ameriBaseResult, fluxnet2015Result, ameriFluxSiteInfoResult, fluxnet2015SiteInfoResult, siteNameMetadataResult, vegetationMetadataResult) {
    var ameriFluxSiteInfoLookup = ameriFluxSiteInfoResult && ameriFluxSiteInfoResult.lookup ? ameriFluxSiteInfoResult.lookup : {};
    var fluxnet2015SiteInfoLookup = fluxnet2015SiteInfoResult && fluxnet2015SiteInfoResult.lookup ? fluxnet2015SiteInfoResult.lookup : {};
    var siteNameMetadataLookup = siteNameMetadataResult && siteNameMetadataResult.lookup ? siteNameMetadataResult.lookup : {};
    var vegetationMetadataLookup = vegetationMetadataResult && vegetationMetadataResult.lookup ? vegetationMetadataResult.lookup : {};
    var enrichedAmeriFluxSites = enrichAmeriFluxSitesWithMetadata(
      ameriResult && Array.isArray(ameriResult.sites) ? ameriResult.sites : [],
      ameriFluxSiteInfoLookup,
      vegetationMetadataLookup
    );
    var enrichedAmeriFluxBaseSites = enrichAmeriFluxSitesWithMetadata(
      ameriBaseResult && Array.isArray(ameriBaseResult.sites) ? ameriBaseResult.sites : [],
      ameriFluxSiteInfoLookup,
      vegetationMetadataLookup
    );
    var enrichedFluxnet2015Sites = enrichFluxnet2015SitesWithMetadata(
      fluxnet2015Result && Array.isArray(fluxnet2015Result.sites) ? fluxnet2015Result.sites : [],
      fluxnet2015SiteInfoLookup,
      vegetationMetadataLookup
    );
    var merge = mergeCatalogRows(
      shuttleResult && Array.isArray(shuttleResult.rows) ? shuttleResult.rows : [],
      icosDirectResult && Array.isArray(icosDirectResult.rows) ? icosDirectResult.rows : [],
      japanFluxResult && Array.isArray(japanFluxResult.rows) ? japanFluxResult.rows : [],
      enrichedAmeriFluxSites,
      enrichedFluxnet2015Sites,
      enrichedAmeriFluxBaseSites,
      efdResult && Array.isArray(efdResult.rows) ? efdResult.rows : []
    );
    var rows = enrichRowsWithSiteNameLookup(merge.rows, siteNameMetadataLookup);
    return {
      rows: rows,
      droppedRows: shuttleResult && shuttleResult.droppedRows ? shuttleResult.droppedRows : 0,
      source: "Shuttle + ICOS + JapanFlux + AmeriFlux FLUXNET + AmeriFlux BASE + FLUXNET2015 + EFD",
      sourceUrl: shuttleResult && shuttleResult.sourceUrl ? shuttleResult.sourceUrl : jsonUrl,
      warning: combineWarnings(
        shuttleResult && shuttleResult.warning ? shuttleResult.warning : "",
        icosDirectResult && icosDirectResult.warning ? icosDirectResult.warning : "",
        japanFluxResult && japanFluxResult.warning ? japanFluxResult.warning : "",
        efdResult && efdResult.warning ? efdResult.warning : "",
        ameriResult && ameriResult.warning ? ameriResult.warning : "",
        ameriBaseResult && ameriBaseResult.warning ? ameriBaseResult.warning : "",
        fluxnet2015Result && fluxnet2015Result.warning ? fluxnet2015Result.warning : "",
        ameriFluxSiteInfoResult && ameriFluxSiteInfoResult.warning ? ameriFluxSiteInfoResult.warning : "",
        fluxnet2015SiteInfoResult && fluxnet2015SiteInfoResult.warning ? fluxnet2015SiteInfoResult.warning : "",
        siteNameMetadataResult && siteNameMetadataResult.warning ? siteNameMetadataResult.warning : "",
        vegetationMetadataResult && vegetationMetadataResult.warning ? vegetationMetadataResult.warning : ""
      ),
      downloadWarning: combineWarnings(
        ameriResult && ameriResult.downloadWarning ? ameriResult.downloadWarning : "",
        ameriBaseResult && ameriBaseResult.downloadWarning ? ameriBaseResult.downloadWarning : "",
        fluxnet2015Result && fluxnet2015Result.downloadWarning ? fluxnet2015Result.downloadWarning : ""
      ),
      snapshotRefreshedDate: latestSnapshotRefreshedDateFromResults([
        shuttleResult,
        icosDirectResult,
        japanFluxResult,
        efdResult
      ]),
      snapshotUpdatedDate: extractSnapshotUpdatedDate(shuttleResult && shuttleResult.meta ? shuttleResult.meta : {}),
      amerifluxTotalSites: ameriResult && ameriResult.totalSites ? ameriResult.totalSites : 0,
      amerifluxSitesWithYears: ameriResult && ameriResult.sitesWithYears ? ameriResult.sitesWithYears : 0,
      amerifluxOverlapSites: merge.amerifluxOverlapSites || 0,
      amerifluxOnlySites: merge.amerifluxOnlySites || 0,
      fluxnet2015TotalSites: fluxnet2015Result && fluxnet2015Result.totalSites ? fluxnet2015Result.totalSites : 0,
      fluxnet2015SitesWithYears: fluxnet2015Result && fluxnet2015Result.sitesWithYears ? fluxnet2015Result.sitesWithYears : 0,
      fluxnet2015OnlySites: merge.fluxnet2015OnlySites || 0
    };
  };

  Explorer.prototype.buildMergedSnapshotState = function (shuttleResult, icosDirectResult, japanFluxResult, efdResult, ameriResult, ameriBaseResult, fluxnet2015Result, ameriFluxSiteInfoResult, fluxnet2015SiteInfoResult, siteNameMetadataResult, vegetationMetadataResult) {
    return buildMergedSnapshotStateForRoot(
      this.jsonUrl,
      shuttleResult,
      icosDirectResult,
      japanFluxResult,
      efdResult,
      ameriResult,
      ameriBaseResult,
      fluxnet2015Result,
      ameriFluxSiteInfoResult,
      fluxnet2015SiteInfoResult,
      siteNameMetadataResult,
      vegetationMetadataResult
    );
  };

  Explorer.prototype.loadKnownSiteMapOverlay = function () {
    var self = this;
    return loadKnownSiteMap(this.allKnownSitesMapJsonUrl).then(function (result) {
      self.state.knownSiteMapRows = Array.isArray(result && result.rows) ? result.rows : [];
      self.state.knownSiteMapWarning = String(result && result.warning || "");
      self.render();
      return result;
    }).catch(function (error) {
      self.state.knownSiteMapRows = [];
      self.state.knownSiteMapWarning = "Known-sites map layer unavailable.";
      if (typeof window !== "undefined" && window.console && console.warn) {
        console.warn("Failed to load known-sites map layer", error);
      }
      self.render();
      return {
        rows: [],
        sourceUrl: self.allKnownSitesMapJsonUrl,
        warning: self.state.knownSiteMapWarning
      };
    });
  };

  Explorer.prototype.load = function () {
    var self = this;
    var cached = readSnapshotCache(this.jsonUrl, this.csvUrl);
    var hadCache = !!(cached && Array.isArray(cached.rows) && cached.rows.length);
    var localResultsBundle = null;

    this.setMode("loading", "Loading snapshot…", "is-loading");
    this.loadKnownSiteMapOverlay();
    if (hadCache) {
      this.applyLoadedSnapshotState({
        rows: cached.rows,
        droppedRows: cached.droppedRows || 0,
        source: cached.source || "cache",
        sourceUrl: cached.sourceUrl || this.jsonUrl,
        warning: cached.warning || "",
        downloadWarning: cached.downloadWarning || "",
        snapshotRefreshedDate: cached.snapshotRefreshedDate || "",
        snapshotUpdatedDate: cached.snapshotUpdatedDate || "",
        amerifluxTotalSites: cached.amerifluxTotalSites || 0,
        amerifluxSitesWithYears: cached.amerifluxSitesWithYears || 0,
        amerifluxOverlapSites: cached.amerifluxOverlapSites || 0,
        amerifluxOnlySites: cached.amerifluxOnlySites || 0,
        fluxnet2015TotalSites: cached.fluxnet2015TotalSites || 0,
        fluxnet2015SitesWithYears: cached.fluxnet2015SitesWithYears || 0,
        fluxnet2015OnlySites: cached.fluxnet2015OnlySites || 0
      });
    }

    Promise.all([
      this.shuttleSource.list_sites(),
      this.icosDirectSource.list_sites(),
      this.japanFluxSource.list_sites(),
      this.efdSource.list_sites(),
      loadAmeriFluxSiteInfo(this.ameriFluxSiteInfoUrl),
      loadFluxnet2015SiteInfo(this.fluxnet2015SiteInfoUrl),
      loadSiteNameMetadata(this.siteNameMetadataUrl),
      loadVegetationMetadata(this.vegetationMetadataUrl)
    ])
      .then(function (results) {
        var shuttleResult = results[0] || {};
        var icosDirectResult = results[1] || {};
        var japanFluxResult = results[2] || {};
        var efdResult = results[3] || {};
        var ameriFluxSiteInfoResult = results[4] || {};
        var fluxnet2015SiteInfoResult = results[5] || {};
        var siteNameMetadataResult = results[6] || {};
        var vegetationMetadataResult = results[7] || {};
        var baseSnapshotState;

        localResultsBundle = {
          shuttleResult: shuttleResult,
          icosDirectResult: icosDirectResult,
          japanFluxResult: japanFluxResult,
          efdResult: efdResult,
          ameriFluxSiteInfoResult: ameriFluxSiteInfoResult,
          fluxnet2015SiteInfoResult: fluxnet2015SiteInfoResult,
          siteNameMetadataResult: siteNameMetadataResult,
          vegetationMetadataResult: vegetationMetadataResult
        };
        baseSnapshotState = self.buildMergedSnapshotState(
          shuttleResult,
          icosDirectResult,
          japanFluxResult,
          efdResult,
          buildAvailabilityFallbackResult(AMERIFLUX_SOURCE_ONLY, "ameriflux-fluxnet", ""),
          buildAvailabilityFallbackResult(BASE_SOURCE_ONLY, "ameriflux-base", ""),
          buildAvailabilityFallbackResult(FLUXNET2015_SOURCE_ONLY, "ameriflux-fluxnet2015", ""),
          ameriFluxSiteInfoResult,
          fluxnet2015SiteInfoResult,
          siteNameMetadataResult,
          vegetationMetadataResult
        );

        if (!hadCache || self.state.mode !== "ready" || !self.state.rows.length) {
          self.applyLoadedSnapshotState(baseSnapshotState);
        }

        return Promise.all([
          self.ameriFluxSource.list_sites(),
          self.ameriFluxBaseSource.list_sites(),
          self.fluxnet2015Source.list_sites()
        ]);
      })
      .then(function (availabilityResults) {
        var ameriResult = availabilityResults[0] || {};
        var ameriBaseResult = availabilityResults[1] || {};
        var fluxnet2015Result = availabilityResults[2] || {};
        var shuttleResult = localResultsBundle ? localResultsBundle.shuttleResult : {};
        var icosDirectResult = localResultsBundle ? localResultsBundle.icosDirectResult : {};
        var japanFluxResult = localResultsBundle ? localResultsBundle.japanFluxResult : {};
        var efdResult = localResultsBundle ? localResultsBundle.efdResult : {};
        var ameriFluxSiteInfoResult = localResultsBundle ? localResultsBundle.ameriFluxSiteInfoResult : {};
        var fluxnet2015SiteInfoResult = localResultsBundle ? localResultsBundle.fluxnet2015SiteInfoResult : {};
        var siteNameMetadataResult = localResultsBundle ? localResultsBundle.siteNameMetadataResult : {};
        var vegetationMetadataResult = localResultsBundle ? localResultsBundle.vegetationMetadataResult : {};
        var snapshotState = self.buildMergedSnapshotState(
          shuttleResult,
          icosDirectResult,
          japanFluxResult,
          efdResult,
          ameriResult,
          ameriBaseResult,
          fluxnet2015Result,
          ameriFluxSiteInfoResult,
          fluxnet2015SiteInfoResult,
          siteNameMetadataResult,
          vegetationMetadataResult
        );
        var freshnessKey = [
          "shuttle:" + buildSnapshotFreshnessKey(shuttleResult),
          "icos-direct:" + buildSnapshotFreshnessKey(icosDirectResult),
          "japanflux-direct:" + buildSnapshotFreshnessKey(japanFluxResult),
          "efd:" + buildSnapshotFreshnessKey(efdResult),
          String(ameriResult.freshnessKey || "ameriflux:none"),
          String(ameriBaseResult.freshnessKey || "ameriflux-base:none"),
          String(fluxnet2015Result.freshnessKey || "fluxnet2015:none"),
          "ameriflux-site-info:" + buildSnapshotFreshnessKey(ameriFluxSiteInfoResult),
          "fluxnet2015-site-info:" + buildSnapshotFreshnessKey(fluxnet2015SiteInfoResult),
          "site-name-metadata:" + buildSnapshotFreshnessKey(siteNameMetadataResult),
          "vegetation-metadata:" + buildSnapshotFreshnessKey(vegetationMetadataResult)
        ].join("|");

        self.applyLoadedSnapshotState(snapshotState);
        writeSnapshotCache(self.jsonUrl, self.csvUrl, {
          freshnessKey: freshnessKey,
          rows: snapshotState.rows,
          droppedRows: snapshotState.droppedRows,
          source: snapshotState.source,
          sourceUrl: snapshotState.sourceUrl,
          warning: snapshotState.warning,
          downloadWarning: snapshotState.downloadWarning,
          snapshotRefreshedDate: snapshotState.snapshotRefreshedDate,
          snapshotUpdatedDate: snapshotState.snapshotUpdatedDate,
          amerifluxTotalSites: snapshotState.amerifluxTotalSites,
          amerifluxSitesWithYears: snapshotState.amerifluxSitesWithYears,
          amerifluxOverlapSites: snapshotState.amerifluxOverlapSites,
          amerifluxOnlySites: snapshotState.amerifluxOnlySites,
          fluxnet2015TotalSites: snapshotState.fluxnet2015TotalSites,
          fluxnet2015SitesWithYears: snapshotState.fluxnet2015SitesWithYears,
          fluxnet2015OnlySites: snapshotState.fluxnet2015OnlySites
        });
      })
      .catch(function (error) {
        if (hadCache && self.state.mode === "ready" && self.state.rows.length) {
          var msg = localResultsBundle
            ? "Live availability refresh failed; showing cached or snapshot-backed data."
            : "Snapshot refresh failed; showing cached snapshot.";
          self.state.warning = self.state.warning ? (self.state.warning + " " + msg) : msg;
          self.render();
          return;
        }
        self.state.mode = "error";
        self.state.errorMessage = error && error.message ? error.message : String(error);
        self.state.rows = [];
        self.state.filteredRows = [];
        self.render();
      });
  };

  function initOne(root) {
    try {
      var explorer = new Explorer(root);
      explorer.load();
      root._shuttleExplorer = explorer;
    } catch (error) {
      if (window.console && console.error) {
        console.error("Failed to initialize shuttle explorer", error);
      }
      root.innerHTML =
        "<div class=\"shuttle-explorer shuttle-explorer__status is-error\">Failed to initialize FLUXNET explorer.</div>";
    }
  }

  function findRoots() {
    var roots = qsa(document, "[data-shuttle-explorer]");
    var idRoot = document.getElementById("shuttle-explorer");
    if (idRoot && roots.indexOf(idRoot) === -1) {
      roots.unshift(idRoot);
    }
    return roots;
  }

  function initAll() {
    ensureStyles();
    var roots = findRoots();
    if (!roots.length) {
      if (window.console && console.warn) {
        console.warn("shuttle-explorer.js loaded but no root container found (#shuttle-explorer or [data-shuttle-explorer]).");
      }
      return;
    }
    roots.forEach(function (root) {
      if (root && !root._shuttleExplorer) {
        initOne(root);
      }
    });
  }

  var testHooks = {
    payloadJsonToObjects: payloadJsonToObjects,
    parseAmeriFluxAvailabilityPayload: parseAmeriFluxAvailabilityPayload,
    mergeCatalogRows: mergeCatalogRows,
    mergeShuttleAndAmeriFluxRows: mergeShuttleAndAmeriFluxRows,
    countryCodeToName: countryCodeToName,
    normalizeCountryName: normalizeCountryName,
    inferFluxnet2015NetworkFromCountry: inferFluxnet2015NetworkFromCountry,
    deriveCountry: deriveCountry,
    normalizeRows: normalizeRows,
    normalizeKnownSiteMapRows: normalizeKnownSiteMapRows,
    knownSiteDataAvailabilityLabel: knownSiteDataAvailabilityLabel,
    mapCategoryColors: mapCategoryColors,
    mapLegendSwatchStyle: mapLegendSwatchStyle,
    filteredAccessibleMapMarkerStyle: filteredAccessibleMapMarkerStyle,
    linkedMarkerHighlightStyle: linkedMarkerHighlightStyle,
    knownSiteMapMarkerStyle: knownSiteMapMarkerStyle,
    mapSiteKey: mapSiteKey,
    addToSiteKeyLookup: addToSiteKeyLookup,
    siteKeyLookupEntries: siteKeyLookupEntries,
    buildKnownSitesExportCsv: buildKnownSitesExportCsv,
    buildKnownSiteMapDisplayState: buildKnownSiteMapDisplayState,
    buildMapDisplayState: buildMapDisplayState,
    buildMapSummaryHtml: buildMapSummaryHtml,
    normalizeNetworkToken: normalizeNetworkToken,
    normalizeNetworkTokens: normalizeNetworkTokens,
    normalizeNetworkDisplayValue: normalizeNetworkDisplayValue,
    normalizeVegetationType: normalizeVegetationType,
    vegetationDisplayLabel: vegetationDisplayLabel,
    calculateCoverageLength: calculateCoverageLength,
    formatCoordinate: formatCoordinate,
    normalizeMinimumYearsValue: normalizeMinimumYearsValue,
    siteAvailableYears: siteAvailableYears,
    siteAvailableYearCount: siteAvailableYearCount,
    maxSiteAvailableYearCount: maxSiteAvailableYearCount,
    normalizeCoverageYear: normalizeCoverageYear,
    normalizeCoverageYears: normalizeCoverageYears,
    siteAvailableYearIntervals: siteAvailableYearIntervals,
    availableYearRangeBounds: availableYearRangeBounds,
    normalizeYearRangeFilter: normalizeYearRangeFilter,
    yearRangeFilterMatches: yearRangeFilterMatches,
    minimumYearsFilterMatches: minimumYearsFilterMatches,
    shouldEnableBulkToolsActions: shouldEnableBulkToolsActions,
    formatSelectedSiteCount: formatSelectedSiteCount,
    resolveAmeriFluxBulkIdentity: resolveAmeriFluxBulkIdentity,
    normalizeSnapshotUpdatedDate: normalizeSnapshotUpdatedDate,
    extractSnapshotUpdatedDate: extractSnapshotUpdatedDate,
    extractSnapshotRefreshedDate: extractSnapshotRefreshedDate,
    latestSnapshotDate: latestSnapshotDate,
    latestSnapshotRefreshedDateFromResults: latestSnapshotRefreshedDateFromResults,
    extractSnapshotSourceStatuses: extractSnapshotSourceStatuses,
    buildSnapshotSourceStatusWarning: buildSnapshotSourceStatusWarning,
    snapshotUpdatedDateDisplayText: snapshotUpdatedDateDisplayText,
    buildAttributionText: buildAttributionText,
    getDownloadEndpointForProduct: getDownloadEndpointForProduct,
    buildV2DownloadPayload: buildV2DownloadPayload,
    buildV1DownloadPayload: buildV1DownloadPayload,
    amerifluxDownloadLoggerUrl: AMERIFLUX_DOWNLOAD_LOGGER_URL,
    exactYearSetsMatch: exactYearSetsMatch,
    resolveProcessingLineage: resolveProcessingLineage,
    stripUrlQueryForFilename: stripUrlQueryForFilename,
    filenameFromUrl: filenameFromUrl,
    isValidAmeriFluxZipFilename: isValidAmeriFluxZipFilename,
    amerifluxZipFilenameFromDownloadEntry: amerifluxZipFilenameFromDownloadEntry,
    amerifluxZipFilenamesFromDownloadEntries: amerifluxZipFilenamesFromDownloadEntries,
    buildAmeriFluxDownloadLogPayload: buildAmeriFluxDownloadLogPayload,
    logAmeriFluxDownloadEntries: logAmeriFluxDownloadEntries,
    buildAmeriFluxCurlCommand: buildAmeriFluxCurlCommand,
    buildAmeriFluxSelectedSitesText: buildAmeriFluxSelectedSitesText,
    buildAmeriFluxBulkScriptText: buildAmeriFluxBulkScriptText,
    buildDownloadAllSelectedScriptText: buildDownloadAllSelectedScriptText,
    buildDownloadAllSelectedFileBundle: buildDownloadAllSelectedFileBundle,
    buildTableClipboardText: buildTableClipboardText,
    compareRows: compareRows,
    getSortColumns: function () {
      return SORT_COLUMNS.map(function (column) {
        return Object.assign({}, column);
      });
    },
    getSurfacedProductsForRow: getSurfacedProductsForRow,
    buildRowDownloadOptions: buildRowDownloadOptions,
    renderSurfacedCoverageHtml: renderSurfacedCoverageHtml,
    partitionRowsByBulkSource: partitionRowsByBulkSource,
    summarizeBulkSelection: summarizeBulkSelection,
    computeSourceFilterTags: computeSourceFilterTags,
	    uniqueSourceFilterValues: uniqueSourceFilterValues,
	    uniqueAvailabilityFilterValues: uniqueAvailabilityFilterValues,
    normalizeFilterSelection: normalizeFilterSelection,
    filterSelectionLabel: filterSelectionLabel,
	    rowMatchesExplorerFilters: rowMatchesExplorerFilters,
    uniqueVegetationFilterValues: uniqueVegetationFilterValues,
    buildVegetationFilterOptions: buildVegetationFilterOptions,
    summarizeApiOnlyRowCoordinateCoverage: summarizeApiOnlyRowCoordinateCoverage,
    buildCoordinateLookup: buildCoordinateLookup,
    enrichRowsWithCoordinateLookup: enrichRowsWithCoordinateLookup,
    buildAmeriFluxSiteInfoLookup: buildAmeriFluxSiteInfoLookup,
    buildSiteNameMetadataLookup: buildSiteNameMetadataLookup,
    buildVegetationMetadataLookup: buildVegetationMetadataLookup,
    enrichRowsWithSiteNameLookup: enrichRowsWithSiteNameLookup,
    enrichAmeriFluxSitesWithMetadata: enrichAmeriFluxSitesWithMetadata,
    buildFluxnet2015SiteLookup: buildFluxnet2015SiteLookup,
    enrichFluxnet2015SitesWithMetadata: enrichFluxnet2015SitesWithMetadata,
    buildMergedSnapshotStateForRoot: buildMergedSnapshotStateForRoot,
    loadKnownSiteMap: loadKnownSiteMap,
    loadAmeriFluxSiteInfo: loadAmeriFluxSiteInfo,
    loadFluxnet2015SiteInfo: loadFluxnet2015SiteInfo,
    loadSiteNameMetadata: loadSiteNameMetadata,
    loadVegetationMetadata: loadVegetationMetadata,
    createAmeriFluxSource: function (options) {
      return new AmeriFluxSource(options || {});
    }
  };

  if (typeof module === "object" && module.exports) {
    module.exports = testHooks;
  }
  if (typeof window !== "undefined") {
    window.ShuttleExplorerTestHooks = testHooks;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})();
