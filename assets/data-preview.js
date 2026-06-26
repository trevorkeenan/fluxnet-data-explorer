(function (root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FluxnetDataPreview = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * @typedef {Object} PreviewGlobalManifestSite
   * @property {string} siteId
   * @property {boolean} hasPreview
   * @property {string} siteManifestPath
   * @property {string[]} resolutions
   * @property {string[]} variables
   */

  /**
   * @typedef {Object} PreviewGlobalManifest
   * @property {number} schemaVersion
   * @property {string} builtAt
   * @property {string} source
   * @property {Object.<string, PreviewGlobalManifestSite>} sites
   */

  /**
   * @typedef {Object} PreviewVariableMetadata
   * @property {string} label
   * @property {string} unit
   */

  /**
   * @typedef {Object} PreviewResolutionManifest
   * @property {string} path
   * @property {Object.<string, PreviewVariableMetadata>} variables
   */

  /**
   * @typedef {Object} PreviewSiteManifest
   * @property {number} schemaVersion
   * @property {string} siteId
   * @property {string} source
   * @property {string} productLabel
   * @property {string[]} dateRange
   * @property {string} lastPreviewBuild
   * @property {Object.<string, PreviewResolutionManifest>} resolutions
   * @property {string} notice
   */

  /**
   * @typedef {Object} PreviewTimeSeriesPoint
   * @property {string} date
   * @property {number|null} value
   */

  var DEFAULT_PREVIEW_BASE_URL = "fluxnet-preview/v1";
  var GLOBAL_MANIFEST_PATH = "manifest.json";
  var PREVIEW_SOURCE_LABEL = "FLUXNET Shuttle";
  var VARIABLE_ORDER = ["GPP", "NEE", "RECO", "LE", "H", "TA", "VPD", "SW_IN", "P"];

  var ERROR_MESSAGES = {
    global_manifest_missing: "Preview manifest is unavailable. Site browsing still works.",
    global_manifest_malformed: "Preview manifest could not be read. Site browsing still works.",
    site_not_found: "No preview entry was found for this site.",
    site_no_preview: "Preview data are not available for this site yet.",
    site_manifest_missing: "The site preview manifest is unavailable.",
    site_manifest_malformed: "The site preview manifest could not be read.",
    variable_unavailable: "The selected variable is not available in this preview.",
    data_file_missing: "The selected preview data file is unavailable.",
    data_file_malformed: "The selected preview data file could not be read.",
    network_failure: "Preview data could not be loaded. Try again later."
  };

  var VARIABLE_REGISTRY = {
    GPP: {
      key: "GPP",
      label: "Gross primary productivity",
      defaultUnit: "g C m-2 d-1",
      description: "Ecosystem gross carbon uptake estimated from partitioned net exchange.",
      preferredAxisLabel: "GPP"
    },
    NEE: {
      key: "NEE",
      label: "Net ecosystem exchange",
      defaultUnit: "g C m-2 d-1",
      description: "Net carbon dioxide exchange between ecosystem and atmosphere.",
      preferredAxisLabel: "NEE"
    },
    RECO: {
      key: "RECO",
      label: "Ecosystem respiration",
      defaultUnit: "g C m-2 d-1",
      description: "Ecosystem respiration estimated from FLUXNET processing outputs.",
      preferredAxisLabel: "RECO"
    },
    LE: {
      key: "LE",
      label: "Latent heat flux",
      defaultUnit: "W m-2",
      description: "Latent heat exchange between land surface and atmosphere.",
      preferredAxisLabel: "LE"
    },
    H: {
      key: "H",
      label: "Sensible heat flux",
      defaultUnit: "W m-2",
      description: "Sensible heat exchange between land surface and atmosphere.",
      preferredAxisLabel: "H"
    },
    TA: {
      key: "TA",
      label: "Air temperature",
      defaultUnit: "deg C",
      description: "Near-surface air temperature.",
      preferredAxisLabel: "TA"
    },
    VPD: {
      key: "VPD",
      label: "Vapor pressure deficit",
      defaultUnit: "kPa",
      description: "Atmospheric evaporative demand expressed as vapor pressure deficit.",
      preferredAxisLabel: "VPD"
    },
    SW_IN: {
      key: "SW_IN",
      label: "Incoming shortwave radiation",
      defaultUnit: "W m-2",
      description: "Incoming shortwave radiation at the site.",
      preferredAxisLabel: "SW_IN"
    },
    P: {
      key: "P",
      label: "Precipitation",
      defaultUnit: "mm d-1",
      description: "Precipitation aggregated to the preview resolution.",
      preferredAxisLabel: "P"
    }
  };

  function normalizeSiteId(siteId) {
    return String(siteId || "").trim().toUpperCase();
  }

  function normalizeVariableKey(key) {
    return String(key || "").trim().toUpperCase();
  }

  function isAbsoluteUrl(value) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(String(value || "")) || /^\/\//.test(String(value || ""));
  }

  function trimSlashes(value) {
    return String(value || "").replace(/^\/+|\/+$/g, "");
  }

  function joinUrl(baseUrl, path) {
    var base = String(baseUrl || "").trim();
    var child = String(path || "").trim();
    if (isAbsoluteUrl(child)) {
      return child;
    }
    if (!base) {
      return child.replace(/^\/+/, "");
    }
    return base.replace(/\/+$/g, "") + "/" + child.replace(/^\/+/, "");
  }

  function dirnamePath(path) {
    var value = String(path || "").trim();
    var index;
    if (!value || isAbsoluteUrl(value)) {
      return "";
    }
    index = value.lastIndexOf("/");
    return index > -1 ? value.slice(0, index) : "";
  }

  function joinArtifactPath(parentPath, childPath) {
    var child = String(childPath || "").trim();
    var parent = String(parentPath || "").trim();
    if (!child || isAbsoluteUrl(child) || child.charAt(0) === "/") {
      return child;
    }
    return trimSlashes(parent) ? trimSlashes(parent) + "/" + child : child;
  }

  function previewErrorMessage(error) {
    var code = error && error.code ? String(error.code) : "";
    return ERROR_MESSAGES[code] || (error && error.message ? String(error.message) : ERROR_MESSAGES.network_failure);
  }

  function createPreviewError(code, message, details) {
    var error = new Error(message || ERROR_MESSAGES[code] || ERROR_MESSAGES.network_failure);
    error.code = code;
    error.isPreviewError = true;
    error.details = details || {};
    return error;
  }

  function clone(value) {
    if (Array.isArray(value)) {
      return value.slice();
    }
    if (value && typeof value === "object") {
      return Object.assign({}, value);
    }
    return value;
  }

  function resolvePreviewBaseUrl(root, fallback) {
    var elementValue = root && root.getAttribute ? root.getAttribute("data-preview-base-url") : "";
    var config = (typeof window !== "undefined" && window && window.FLUXNET_EXPLORER_CONFIG && typeof window.FLUXNET_EXPLORER_CONFIG === "object")
      ? window.FLUXNET_EXPLORER_CONFIG
      : {};
    var globalValue = typeof window !== "undefined"
      ? (window.VITE_FLUXNET_PREVIEW_BASE_URL || window.FLUXNET_PREVIEW_BASE_URL || "")
      : "";
    var metaValue = "";
    var meta;

    if (typeof document !== "undefined" && document.querySelector) {
      meta = document.querySelector("meta[name='fluxnet-preview-base-url']");
      metaValue = meta && meta.getAttribute ? meta.getAttribute("content") : "";
    }

    return String(
      elementValue ||
      config.previewBaseUrl ||
      config.fluxnetPreviewBaseUrl ||
      globalValue ||
      metaValue ||
      fallback ||
      DEFAULT_PREVIEW_BASE_URL
    ).trim().replace(/\/+$/g, "");
  }

  function variableDefinition(variableKey, siteVariableMeta) {
    var key = normalizeVariableKey(variableKey);
    var registryEntry = VARIABLE_REGISTRY[key] || {
      key: key,
      label: key,
      defaultUnit: "unit unavailable",
      description: "Preview variable from the site manifest.",
      preferredAxisLabel: key
    };
    var siteMeta = siteVariableMeta && typeof siteVariableMeta === "object" ? siteVariableMeta : {};
    var unit = String(siteMeta.unit || registryEntry.defaultUnit || "unit unavailable").trim();
    var label = String(siteMeta.label || registryEntry.label || key).trim();
    return {
      key: key,
      label: label,
      unit: unit,
      description: String(siteMeta.description || registryEntry.description || "").trim(),
      preferredAxisLabel: label + (unit ? " (" + unit + ")" : "")
    };
  }

  function normalizeGlobalManifest(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw createPreviewError("global_manifest_malformed");
    }
    if (!payload.sites || typeof payload.sites !== "object" || Array.isArray(payload.sites)) {
      throw createPreviewError("global_manifest_malformed");
    }
    return {
      schemaVersion: Number(payload.schemaVersion || payload.schema_version || 1),
      builtAt: String(payload.builtAt || payload.built_at || ""),
      source: String(payload.source || PREVIEW_SOURCE_LABEL),
      sites: payload.sites
    };
  }

  function normalizeSiteEntry(siteId, entry) {
    var value = entry && typeof entry === "object" ? entry : {};
    return {
      siteId: String(value.siteId || value.site_id || siteId || "").trim(),
      hasPreview: value.hasPreview !== false && value.has_preview !== false,
      siteManifestPath: String(value.siteManifestPath || value.site_manifest_path || "").trim(),
      resolutions: Array.isArray(value.resolutions) ? value.resolutions.slice() : [],
      variables: Array.isArray(value.variables) ? value.variables.slice() : []
    };
  }

  function findGlobalSiteEntry(manifest, siteId) {
    var sites = manifest && manifest.sites && typeof manifest.sites === "object" ? manifest.sites : {};
    var wanted = normalizeSiteId(siteId);
    var keys = Object.keys(sites);
    var i;
    var entry;
    var normalized;
    for (i = 0; i < keys.length; i += 1) {
      entry = normalizeSiteEntry(keys[i], sites[keys[i]]);
      normalized = normalizeSiteId(entry.siteId || keys[i]);
      if (normalized === wanted) {
        return entry;
      }
    }
    return null;
  }

  function buildSiteAvailabilityLookup(manifest) {
    var sites = manifest && manifest.sites && typeof manifest.sites === "object" ? manifest.sites : {};
    var lookup = {};
    Object.keys(sites).forEach(function (siteKey) {
      var entry = normalizeSiteEntry(siteKey, sites[siteKey]);
      var key = normalizeSiteId(entry.siteId || siteKey);
      if (key) {
        lookup[key] = entry;
      }
    });
    return lookup;
  }

  function normalizeResolutionSpec(spec) {
    var value = spec && typeof spec === "object" ? spec : {};
    var variables = value.variables || {};
    var normalizedVariables = {};
    if (Array.isArray(variables)) {
      variables.forEach(function (key) {
        if (normalizeVariableKey(key)) {
          normalizedVariables[normalizeVariableKey(key)] = {};
        }
      });
    } else if (variables && typeof variables === "object") {
      Object.keys(variables).forEach(function (key) {
        normalizedVariables[normalizeVariableKey(key)] = clone(variables[key]) || {};
      });
    }
    return {
      path: String(value.path || "").trim(),
      variables: normalizedVariables
    };
  }

  function normalizeSiteManifest(payload, entry) {
    var resolutions = {};
    var rawResolutions;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw createPreviewError("site_manifest_malformed");
    }
    rawResolutions = payload.resolutions;
    if (!rawResolutions || typeof rawResolutions !== "object" || Array.isArray(rawResolutions)) {
      throw createPreviewError("site_manifest_malformed");
    }
    Object.keys(rawResolutions).forEach(function (resolution) {
      resolutions[String(resolution || "").trim()] = normalizeResolutionSpec(rawResolutions[resolution]);
    });
    if (!Object.keys(resolutions).length) {
      throw createPreviewError("site_manifest_malformed");
    }
    return {
      schemaVersion: Number(payload.schemaVersion || payload.schema_version || 1),
      siteId: String(payload.siteId || payload.site_id || (entry && entry.siteId) || "").trim(),
      source: String(payload.source || PREVIEW_SOURCE_LABEL),
      productLabel: String(payload.productLabel || payload.product_label || "Site Data Preview"),
      dateRange: Array.isArray(payload.dateRange || payload.date_range) ? (payload.dateRange || payload.date_range).slice(0, 2) : [],
      lastPreviewBuild: String(payload.lastPreviewBuild || payload.last_preview_build || ""),
      resolutions: resolutions,
      notice: String(payload.notice || ""),
      _previewSiteManifestPath: entry ? entry.siteManifestPath : "",
      _previewSiteManifestDir: entry ? dirnamePath(entry.siteManifestPath) : ""
    };
  }

  function getResolutionNames(siteManifest) {
    var resolutions = siteManifest && siteManifest.resolutions && typeof siteManifest.resolutions === "object" ? siteManifest.resolutions : {};
    return Object.keys(resolutions).filter(Boolean).sort(function (a, b) {
      if (a === "monthly") {
        return -1;
      }
      if (b === "monthly") {
        return 1;
      }
      return a.localeCompare(b);
    });
  }

  function getResolutionSpec(siteManifest, resolution) {
    var name = String(resolution || "").trim();
    var resolutions = siteManifest && siteManifest.resolutions && typeof siteManifest.resolutions === "object" ? siteManifest.resolutions : {};
    return name && resolutions[name] ? resolutions[name] : null;
  }

  function listVariables(siteManifest, resolution) {
    var spec = getResolutionSpec(siteManifest, resolution);
    var variables = spec && spec.variables && typeof spec.variables === "object" ? Object.keys(spec.variables) : [];
    var seen = {};
    var ordered = [];
    VARIABLE_ORDER.forEach(function (key) {
      if (variables.indexOf(key) !== -1) {
        seen[key] = true;
        ordered.push(key);
      }
    });
    variables.sort().forEach(function (key) {
      var normalized = normalizeVariableKey(key);
      if (normalized && !seen[normalized]) {
        seen[normalized] = true;
        ordered.push(normalized);
      }
    });
    return ordered;
  }

  function chooseDefaultResolution(siteManifest) {
    var names = getResolutionNames(siteManifest);
    return names.indexOf("monthly") !== -1 ? "monthly" : (names[0] || "");
  }

  function chooseDefaultVariable(siteManifest, resolution) {
    return listVariables(siteManifest, resolution)[0] || "";
  }

  function valueToNumberOrNull(value) {
    var numberValue;
    if (value == null || value === "") {
      return null;
    }
    numberValue = Number(value);
    if (!isFinite(numberValue) || numberValue <= -9990) {
      return null;
    }
    return numberValue;
  }

  function normalizeTimeSeriesRecords(payload, variableKey) {
    var key = normalizeVariableKey(variableKey);
    var hasVariable = false;
    if (!Array.isArray(payload)) {
      throw createPreviewError("data_file_malformed");
    }
    payload.forEach(function (row) {
      if (row && typeof row === "object" && Object.prototype.hasOwnProperty.call(row, key)) {
        hasVariable = true;
      }
    });
    if (!hasVariable) {
      throw createPreviewError("variable_unavailable");
    }
    return payload.map(function (row) {
      if (!row || typeof row !== "object" || !String(row.date || "").trim()) {
        throw createPreviewError("data_file_malformed");
      }
      return {
        date: String(row.date).trim(),
        value: valueToNumberOrNull(row[key])
      };
    });
  }

  function PreviewClient(options) {
    var opts = options || {};
    this.baseUrl = String(opts.baseUrl || DEFAULT_PREVIEW_BASE_URL).trim().replace(/\/+$/g, "");
    this.fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch.bind(typeof window !== "undefined" ? window : globalThis) : null);
    this._globalManifestPromise = null;
    this._siteManifestPromises = {};
    this._seriesPromises = {};
  }

  PreviewClient.prototype.buildUrl = function (path) {
    return joinUrl(this.baseUrl, path || "");
  };

  PreviewClient.prototype._fetchJson = function (path, missingCode, malformedCode) {
    var url = this.buildUrl(path);
    var fetchImpl = this.fetchImpl;
    if (!fetchImpl) {
      return Promise.reject(createPreviewError("network_failure", ERROR_MESSAGES.network_failure, { url: url }));
    }
    return Promise.resolve()
      .then(function () {
        return fetchImpl(url, { headers: { Accept: "application/json" } });
      })
      .then(function (response) {
        if (!response || !response.ok) {
          throw createPreviewError(missingCode, ERROR_MESSAGES[missingCode], {
            url: url,
            status: response && response.status
          });
        }
        return response.json().catch(function (error) {
          throw createPreviewError(malformedCode, ERROR_MESSAGES[malformedCode], {
            url: url,
            cause: error && error.message ? error.message : String(error)
          });
        });
      })
      .catch(function (error) {
        if (error && error.isPreviewError) {
          throw error;
        }
        throw createPreviewError("network_failure", ERROR_MESSAGES.network_failure, {
          url: url,
          cause: error && error.message ? error.message : String(error)
        });
      });
  };

  PreviewClient.prototype.loadGlobalManifest = function () {
    var self = this;
    if (!this._globalManifestPromise) {
      this._globalManifestPromise = this._fetchJson(GLOBAL_MANIFEST_PATH, "global_manifest_missing", "global_manifest_malformed")
        .then(function (payload) {
          return normalizeGlobalManifest(payload);
        })
        .catch(function (error) {
          self._globalManifestPromise = null;
          throw error;
        });
    }
    return this._globalManifestPromise;
  };

  PreviewClient.prototype.getSitePreviewEntry = function (siteId) {
    return this.loadGlobalManifest().then(function (manifest) {
      var entry = findGlobalSiteEntry(manifest, siteId);
      if (!entry) {
        throw createPreviewError("site_not_found", ERROR_MESSAGES.site_not_found, { siteId: siteId });
      }
      if (!entry.hasPreview) {
        throw createPreviewError("site_no_preview", ERROR_MESSAGES.site_no_preview, { siteId: siteId });
      }
      return entry;
    });
  };

  PreviewClient.prototype.hasSitePreview = function (siteId) {
    return this.getSitePreviewEntry(siteId).then(function () {
      return true;
    }).catch(function (error) {
      if (error && (error.code === "site_not_found" || error.code === "site_no_preview")) {
        return false;
      }
      throw error;
    });
  };

  PreviewClient.prototype.loadSiteManifest = function (siteId) {
    var self = this;
    var cacheKey = normalizeSiteId(siteId);
    if (!this._siteManifestPromises[cacheKey]) {
      this._siteManifestPromises[cacheKey] = this.getSitePreviewEntry(siteId)
        .then(function (entry) {
          if (!entry.siteManifestPath) {
            throw createPreviewError("site_manifest_missing", ERROR_MESSAGES.site_manifest_missing, { siteId: siteId });
          }
          return self._fetchJson(entry.siteManifestPath, "site_manifest_missing", "site_manifest_malformed")
            .then(function (payload) {
              return normalizeSiteManifest(payload, entry);
            });
        })
        .catch(function (error) {
          delete self._siteManifestPromises[cacheKey];
          throw error;
        });
    }
    return this._siteManifestPromises[cacheKey];
  };

  PreviewClient.prototype.loadSeries = function (siteId, resolution, variableKey) {
    var self = this;
    return this.loadSiteManifest(siteId).then(function (siteManifest) {
      var resolvedResolution = String(resolution || "").trim() || chooseDefaultResolution(siteManifest);
      var spec = getResolutionSpec(siteManifest, resolvedResolution);
      var resolvedVariable = normalizeVariableKey(variableKey || chooseDefaultVariable(siteManifest, resolvedResolution));
      var variables = listVariables(siteManifest, resolvedResolution);
      var siteMeta;
      var dataPath;
      var cacheKey;
      if (!spec) {
        throw createPreviewError("site_manifest_malformed", "Preview resolution is not listed in the site manifest.", { resolution: resolvedResolution });
      }
      if (!resolvedVariable || variables.indexOf(resolvedVariable) === -1) {
        throw createPreviewError("variable_unavailable", ERROR_MESSAGES.variable_unavailable, { variable: resolvedVariable });
      }
      if (!spec.path) {
        throw createPreviewError("data_file_missing", ERROR_MESSAGES.data_file_missing, { resolution: resolvedResolution });
      }
      dataPath = joinArtifactPath(siteManifest._previewSiteManifestDir, spec.path);
      cacheKey = normalizeSiteId(siteId) + "|" + resolvedResolution + "|" + dataPath;
      siteMeta = spec.variables && spec.variables[resolvedVariable] ? spec.variables[resolvedVariable] : {};
      if (!self._seriesPromises[cacheKey]) {
        self._seriesPromises[cacheKey] = self._fetchJson(dataPath, "data_file_missing", "data_file_malformed")
          .catch(function (error) {
            delete self._seriesPromises[cacheKey];
            throw error;
          });
      }
      return self._seriesPromises[cacheKey].then(function (payload) {
        return {
          siteManifest: siteManifest,
          resolution: resolvedResolution,
          variable: resolvedVariable,
          variableMeta: variableDefinition(resolvedVariable, siteMeta),
          records: normalizeTimeSeriesRecords(payload, resolvedVariable)
        };
      });
    });
  };

  PreviewClient.prototype.resetCache = function () {
    this._globalManifestPromise = null;
    this._siteManifestPromises = {};
    this._seriesPromises = {};
  };

  function createPreviewClient(options) {
    return new PreviewClient(options || {});
  }

  return {
    DEFAULT_PREVIEW_BASE_URL: DEFAULT_PREVIEW_BASE_URL,
    PREVIEW_SOURCE_LABEL: PREVIEW_SOURCE_LABEL,
    VARIABLE_REGISTRY: VARIABLE_REGISTRY,
    VARIABLE_ORDER: VARIABLE_ORDER.slice(),
    ERROR_MESSAGES: ERROR_MESSAGES,
    PreviewClient: PreviewClient,
    createPreviewClient: createPreviewClient,
    createPreviewError: createPreviewError,
    previewErrorMessage: previewErrorMessage,
    normalizeSiteId: normalizeSiteId,
    normalizeVariableKey: normalizeVariableKey,
    resolvePreviewBaseUrl: resolvePreviewBaseUrl,
    joinUrl: joinUrl,
    variableDefinition: variableDefinition,
    normalizeGlobalManifest: normalizeGlobalManifest,
    buildSiteAvailabilityLookup: buildSiteAvailabilityLookup,
    getResolutionNames: getResolutionNames,
    listVariables: listVariables,
    chooseDefaultResolution: chooseDefaultResolution,
    chooseDefaultVariable: chooseDefaultVariable,
    normalizeTimeSeriesRecords: normalizeTimeSeriesRecords
  };
});
