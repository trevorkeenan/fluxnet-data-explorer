const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hooks = require('../assets/shuttle-explorer.js');

const BASH_PATH = childProcess.execFileSync('bash', ['-lc', 'command -v bash'], { encoding: 'utf8' }).trim();
const SCRIPT_RUNTIME_COMMANDS = ['basename', 'cat', 'mkdir', 'mktemp', 'rm', 'tee', 'tr', 'uname'];

function resolveCommandPath(command) {
  return childProcess.execFileSync('bash', ['-lc', 'command -v ' + command], { encoding: 'utf8' }).trim();
}

function writeExecutable(filePath, text) {
  fs.writeFileSync(filePath, text, { mode: 0o755 });
}

function buildScriptRuntimeBin(tempDir, options) {
  const opts = options || {};
  const binDir = path.join(tempDir, 'bin');
  const postUrlLogFile = String(opts.postUrlLogFile || '');
  const postBodyLogFile = String(opts.postBodyLogFile || '');
  const failLogger = !!opts.failLogger;
  const failDownloadRequest = !!opts.failDownloadRequest;
  const apiStatus = String(opts.apiStatus || '200');
  const responsePayload = opts.responsePayload == null
    ? JSON.stringify({
      data_urls: [
        { url: String(opts.responseUrl || 'https://example.org/mock.zip?download=1') }
      ]
    })
    : String(opts.responsePayload);
  fs.mkdirSync(binDir);

  SCRIPT_RUNTIME_COMMANDS.forEach((command) => {
    fs.symlinkSync(resolveCommandPath(command), path.join(binDir, command));
  });

  if (opts.includePython3) {
    fs.symlinkSync(resolveCommandPath('python3'), path.join(binDir, 'python3'));
  }

  if (opts.includeJq) {
    writeExecutable(
      path.join(binDir, 'jq'),
      [
        '#!' + BASH_PATH,
        'set -euo pipefail',
        '',
        'if [ "${1:-}" != "-r" ]; then',
        '  echo "unexpected jq args: $*" >&2',
        '  exit 1',
        'fi',
        'case "${2:-}" in',
        '  ".data_urls[].url"|".data_urls[]?.url // empty") ;;',
        '  *)',
        '    echo "unexpected jq args: $*" >&2',
        '    exit 1',
        '    ;;',
        'esac',
        '',
        'python3 -c \'import json, sys',
        'payload = json.load(sys.stdin)',
        'for item in payload.get("data_urls", []):',
        '    url = item.get("url")',
        '    if url:',
        '        print(url)',
        '\'',
        ''
      ].join('\n')
    );
  }

  writeExecutable(
    path.join(binDir, 'curl'),
    [
      '#!' + BASH_PATH,
      'set -euo pipefail',
      '',
      'POST_URL_LOG_FILE=' + JSON.stringify(postUrlLogFile),
      'POST_BODY_LOG_FILE=' + JSON.stringify(postBodyLogFile),
      'FAIL_LOGGER=' + JSON.stringify(failLogger ? '1' : ''),
      'FAIL_DOWNLOAD_REQUEST=' + JSON.stringify(failDownloadRequest ? '1' : ''),
      'API_STATUS=' + JSON.stringify(apiStatus),
      'RESPONSE_PAYLOAD=' + JSON.stringify(responsePayload),
      'LOGGER_URL="https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request"',
      '',
      'if [ "${1:-}" = "-sS" ]; then',
      '  post_url=""',
      '  post_body=""',
      '  post_output_file=""',
      '  post_write_out=""',
      '  while [ "$#" -gt 0 ]; do',
      '    case "${1:-}" in',
      '      http://*|https://*)',
      '        if [ -z "$post_url" ]; then',
      '          post_url="$1"',
      '        fi',
      '        ;;',
      '      --data-binary)',
      '        shift',
      '        post_body="${1:-}"',
      '        ;;',
      '      -o)',
      '        shift',
      '        post_output_file="${1:-}"',
      '        ;;',
      '      -w)',
      '        shift',
      '        post_write_out="${1:-}"',
      '        ;;',
      '    esac',
      '    shift || true',
      '  done',
      '  if [ -n "$POST_URL_LOG_FILE" ]; then',
      '    printf \'%s\\n\' "$post_url" >> "$POST_URL_LOG_FILE"',
      '  fi',
      '  if [ -n "$POST_BODY_LOG_FILE" ]; then',
      '    printf \'%s\\n---END---\\n\' "$post_body" >> "$POST_BODY_LOG_FILE"',
      '  fi',
      '  if [ "$post_url" = "$LOGGER_URL" ]; then',
      '    if [ "$FAIL_LOGGER" = "1" ]; then',
      '      echo "logger unavailable" >&2',
      '      exit 22',
      '    fi',
      '    printf \'{}\'',
      '    exit 0',
      '  fi',
      '  if [ "$FAIL_DOWNLOAD_REQUEST" = "1" ]; then',
      '    echo "download request unavailable" >&2',
      '    exit 7',
      '  fi',
      '  if [ -n "$post_output_file" ]; then',
      '    printf \'%s\' "$RESPONSE_PAYLOAD" > "$post_output_file"',
      '    if [ -n "$post_write_out" ]; then',
      '      printf \'%s\' "$API_STATUS"',
      '    fi',
      '  else',
      '    printf \'%s\' "$RESPONSE_PAYLOAD"',
      '  fi',
      '  exit 0',
      'fi',
      '',
      'if [ "${1:-}" = "-L" ]; then',
      '  url="${2:-}"',
      '  shift 2',
      '  if [ "${1:-}" != "-o" ] || [ -z "${2:-}" ]; then',
      '    echo "unexpected curl download args: $*" >&2',
      '    exit 1',
      '  fi',
      '  printf \'downloaded:%s\\n\' "$url" > "$2"',
      '  exit 0',
      'fi',
      '',
      'echo "unexpected curl args: $*" >&2',
      'exit 1',
      ''
    ].join('\n')
  );

  return binDir;
}

function makeCatalogRow(overrides) {
  return Object.assign(
    {
      site_id: 'XX-Test',
      site_name: 'Test Site',
      country: 'US',
      data_hub: 'ICOS',
      network: 'FLX',
      source_network: 'FLX',
      network_display: 'FLX',
      network_tokens: ['FLX'],
      vegetation_type: '',
      first_year: 2010,
      last_year: 2011,
      years: '2010-2011',
      download_link: 'https://example.org/test.zip',
      download_mode: 'direct',
      processing_lineage: 'oneflux',
      source_label: 'ICOS',
      source_reason: 'Available directly from the ICOS Carbon Portal archive.',
      source_origin: 'icos_direct'
    },
    overrides || {}
  );
}

function makeJapanFluxRow(overrides) {
  return makeCatalogRow(Object.assign(
    {
      site_id: 'JP-Test',
      site_name: 'JapanFlux Site',
      country: 'JP',
      data_hub: 'JapanFlux',
      network: 'JapanFlux',
      source_network: 'JapanFlux',
      network_display: 'JapanFlux',
      network_tokens: ['JapanFlux'],
      vegetation_type: 'URB',
      first_year: 2015,
      last_year: 2017,
      years: '2015-2017',
      download_link: 'https://ads.nipr.ac.jp/dataset/A20240722-001',
      download_mode: 'landing_page',
      processing_lineage: 'other_processed',
      source_label: 'JapanFlux',
      source_reason: 'Available from the JapanFlux2024 ADS landing page.',
      source_origin: 'japanflux_direct'
    },
    overrides || {}
  ));
}

function makeEfdRow(overrides) {
  return makeCatalogRow(Object.assign(
    {
      site_id: 'DE-Efd',
      site_name: 'EFD Site',
      country: 'DE',
      data_hub: 'EFD',
      network: 'EuroFlux;ICOS',
      source_network: 'EuroFlux;ICOS',
      network_display: 'EuroFlux;ICOS',
      network_tokens: ['EuroFlux', 'ICOS'],
      vegetation_type: 'ENF',
      first_year: 2001,
      last_year: 2002,
      years: '2001-2002',
      length_years: 2,
      download_link: 'https://www.europe-fluxdata.eu/home/data/request-data',
      download_mode: 'request_page',
      processing_lineage: '',
      source_label: 'EFD',
      source_reason: 'Known EFD data record based on the public EFD site details and data-policy pages. Access remains request-based via EFD; some data may require PI approval or PI contact, and current direct download is not implied.',
      source_origin: 'efd',
      publish_years: [2001, 2002],
      flux_list: 'CO2-E; LE-E',
      access_label: 'Public; Private',
      data_use_label: 'Open; Close',
      site_page_url: 'https://www.europe-fluxdata.eu/home/site-details?id=DE-Efd',
      known_data_record: 'true',
      efd_access_summary: 'mixed',
      efd_policy_year_count: '2',
      efd_policy_years: [2001, 2002],
      efd_policy_first_year: '2001',
      efd_policy_last_year: '2002',
      efd_provenance: 'Derived from the public EFD site-details pages and year-by-year data-policy tables on 2026-04-07.'
    },
    overrides || {}
  ));
}

function makeAvailabilitySite(siteId, publishYears, overrides) {
  const years = Array.isArray(publishYears) ? publishYears.slice() : [];
  const normalizedYears = years.slice().sort((a, b) => a - b);
  return Object.assign(
    {
      site_id: siteId,
      publish_years: normalizedYears,
      first_year: normalizedYears.length ? normalizedYears[0] : null,
      last_year: normalizedYears.length ? normalizedYears[normalizedYears.length - 1] : null,
      site_name: '',
      country: ''
    },
    overrides || {}
  );
}

function loadSnapshotResult(relativePath) {
  const absolutePath = path.join(__dirname, '..', relativePath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const normalized = hooks.normalizeRows(hooks.payloadJsonToObjects(payload));

  return {
    rows: normalized.rows,
    droppedRows: normalized.dropped,
    source: 'json',
    sourceUrl: relativePath,
    warning: '',
    meta: payload.meta || {}
  };
}

function emptyLookupResult() {
  return {
    lookup: {},
    source: 'csv',
    sourceUrl: '',
    lastModified: '',
    warning: '',
    meta: {}
  };
}

function mockHeaders(values) {
  const map = Object.assign({}, values || {});
  return {
    get(name) {
      return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : '';
    }
  };
}

function expectedJqGuidancePattern() {
  if (process.platform === 'darwin') {
    return /macOS: brew install jq/;
  }

  if (process.platform === 'win32') {
    return /Windows shells:\s+choco install jq\s+scoop install jq\s+winget install jqlang\.jq/s;
  }

  if (process.platform === 'linux') {
    var distroId = '';
    if (fs.existsSync('/etc/os-release')) {
      var osReleaseText = fs.readFileSync('/etc/os-release', 'utf8');
      var idMatch = osReleaseText.match(/^ID="?([^"\n]+)"?/m);
      if (idMatch) {
        distroId = idMatch[1];
      }
    }

    if (distroId === 'debian' || distroId === 'ubuntu') {
      return /Debian\/Ubuntu: sudo apt-get install jq/;
    }

    if (distroId === 'fedora' || distroId === 'rhel') {
      return /Fedora\/RHEL: sudo dnf install jq/;
    }

    if (distroId === 'arch') {
      return /Arch: sudo pacman -S jq/;
    }
  }

  return /See https:\/\/jqlang\.github\.io\/jq\/download\//;
}

test('AmeriFlux availability parser filters entries with empty publish_years', () => {
  const payload = {
    values: [
      { site_id: 'AR-Bal', publish_years: [2012, 2013] },
      { site_id: 'US-Empty', publish_years: [] },
      { site_id: 'CA-Mix', publish_years: ['2010', '2011', '2010', null] }
    ]
  };

  const parsed = hooks.parseAmeriFluxAvailabilityPayload(payload);
  assert.equal(parsed.totalSites, 3);
  assert.equal(parsed.sitesWithYears, 2);
  assert.deepEqual(
    parsed.sites.map((site) => site.site_id),
    ['AR-Bal', 'CA-Mix']
  );
  assert.deepEqual(parsed.sites[1].publish_years, [2010, 2011]);
});

test('FLUXNET2015 availability payload uses the same filtering rules', () => {
  const payload = {
    values: [
      { site_id: 'US-Leg', publish_years: [2001, 2002] },
      { site_id: 'US-None', publish_years: [] },
      { site_id: 'CA-Old', publish_years: [1999] }
    ]
  };

  const parsed = hooks.parseAmeriFluxAvailabilityPayload(payload, 'fluxnet2015');
  assert.equal(parsed.totalSites, 3);
  assert.equal(parsed.sitesWithYears, 2);
  assert.deepEqual(
    parsed.sites.map((site) => site.site_id),
    ['CA-Old', 'US-Leg']
  );
  assert.match(parsed.freshnessKey, /^fluxnet2015:/);
});

test('AmeriFlux availability payload preserves its authoritative source citation page URL', () => {
  const parsed = hooks.parseAmeriFluxAvailabilityPayload({
    values: [
      {
        site_id: 'AR-SLu',
        publish_years: [2009, 2010, 2011],
        url: 'https://fluxnet.org/sites/siteinfo/AR-SLu'
      }
    ]
  }, 'fluxnet2015');

  assert.equal(parsed.sites[0].citation_source_url, 'https://fluxnet.org/sites/siteinfo/AR-SLu');
});

test('AmeriFlux BASE Legacy availability keeps the explicit LEGACY policy', () => {
  const parsed = hooks.parseAmeriFluxAvailabilityPayload({
    values: [
      { site_id: 'US-Leg', publish_years: [2001, 2002] }
    ]
  }, 'ameriflux-base-legacy', 'LEGACY');

  assert.equal(parsed.sites.length, 1);
  assert.equal(parsed.sites[0].data_policy, 'LEGACY');
  assert.match(parsed.freshnessKey, /^ameriflux-base-legacy:/);
});

test('AmeriFlux BASE CC-BY and Legacy availability use V2 API endpoints', async () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const legacyUrl = 'https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/BASE-BADM/LEGACY';
  const originalFetch = global.fetch;
  const requests = [];

  assert.equal(explorerJs.includes('https://amfcdn.lbl.gov/api/v2/data_availability/AmeriFlux/BASE-BADM/CCBY4.0'), true);
  assert.equal(explorerJs.includes(legacyUrl), true);
  assert.equal(explorerJs.includes('/api/v1/data_availability/AmeriFlux/BASE-BADM/LEGACY'), false);

  global.fetch = async (url) => {
    requests.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        values: [
          { site_id: 'US-Leg', publish_years: [2001, 2002] }
        ]
      }),
      headers: mockHeaders()
    };
  };

  try {
    const source = hooks.createAmeriFluxSource({
      availabilityUrl: legacyUrl,
      dataProduct: 'BASE-BADM',
      dataPolicy: 'LEGACY',
      sourceLabel: 'AmeriFlux BASE (Legacy)',
      availabilityCacheKey: 'test-ameriflux-base-legacy-v2',
      freshnessNamespace: 'test-ameriflux-base-legacy-v2',
      availabilityRetryCount: 0
    });
    const result = await source.list_sites();

    assert.deepEqual(requests, [legacyUrl]);
    assert.equal(result.sites[0].data_policy, 'LEGACY');
    assert.equal(source.downloadUrl, 'https://amfcdn.lbl.gov/api/v2/data_download');
    assert.equal(source.buildDownloadPayload(['US-Leg'], 'FULLSET').data_policy, 'LEGACY');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Explorer default snapshot JSON files exist and are loadable by the current JSON loader', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const expectedJsonFiles = [
    'assets/shuttle_snapshot.json',
    'assets/icos_direct_fluxnet.json',
    'assets/japanflux_direct_snapshot.json',
    'assets/efd_curated_sites_snapshot.json'
  ];

  expectedJsonFiles.forEach((relativePath) => {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const raw = fs.readFileSync(absolutePath, 'utf8');
    const payload = JSON.parse(raw);
    const rows = hooks.payloadJsonToObjects(payload);

    assert.equal(explorerJs.includes('"' + relativePath + '"'), true);
    assert.equal(Array.isArray(payload.columns), true);
    assert.equal(Array.isArray(payload.rows), true);
    assert.equal(Array.isArray(rows), true);
    assert.equal(rows.length > 0, true);
  });
  assert.equal(explorerJs.includes('"assets/efd_sites_snapshot.json"'), false);
});

test('Explorer uses curated local EFD assets rather than the old public-snapshot path', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.equal(explorerJs.includes('"assets/efd_curated_sites_snapshot.json"'), true);
  assert.equal(explorerJs.includes('"assets/efd_curated_sites_snapshot.csv"'), true);
  assert.equal(explorerJs.includes('"assets/efd_sites_snapshot.json"'), false);
  assert.equal(explorerJs.includes('"assets/efd_sites_snapshot.csv"'), false);
  assert.equal(explorerHtml.includes('data-efd-curated-json-src="assets/efd_curated_sites_snapshot.json"'), true);
  assert.equal(explorerHtml.includes('data-efd-curated-csv-src="assets/efd_curated_sites_snapshot.csv"'), true);
});

test('Known-sites map asset exists and normalizes for the separate map overlay', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const relativePath = 'assets/all_known_flux_sites_map.json';
  const absolutePath = path.join(__dirname, '..', relativePath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const rows = hooks.normalizeKnownSiteMapRows(hooks.payloadJsonToObjects(payload));

  assert.equal(explorerJs.includes('"assets/all_known_flux_sites_map.json"'), true);
  assert.equal(explorerHtml.includes('data-all-known-sites-map-json-src="assets/all_known_flux_sites_map.json"'), true);
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length > 0, true);
  assert.equal(rows.some((row) => row.known_site_only === true), true);
  assert.equal(rows.some((row) => row.has_accessible_data === true), true);
  assert.equal(rows.some((row) => row.known_site_only === true && row.has_accessible_data === true), false);
});

test('Known-sites map copy uses the simplified popup text and visual legend labels', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.css'), 'utf8');

  assert.equal(explorerJs.includes('Show all known sites</label>'), true);
  assert.equal(explorerJs.includes('Show all known sites background layer'), false);
  assert.equal(explorerJs.includes('Download site CSV'), true);
  assert.equal(explorerJs.includes('Site location known but data holdings unavailable.'), true);
  assert.equal(explorerJs.includes('Known site only; accessible explorer data are not currently available.'), false);
  assert.equal(explorerJs.includes('sites with accessible data'), true);
  assert.equal(explorerJs.includes('sites without shared data'), true);
  assert.equal(explorerJs.includes('additional sites with accessible data'), false);
  assert.equal(explorerJs.includes('additional sites without shared data'), false);
  assert.equal(explorerJs.includes('shuttle-explorer__map-legend-swatch--selected'), false);
  assert.equal(explorerJs.includes('filtered accessible-data sites'), true);
  assert.equal(explorerJs.includes('data-site-key'), true);
  assert.equal(explorerJs.includes('handleMapMarkerLinkClick'), true);
  assert.equal(explorerJs.includes('without shared data.'), false);
  assert.equal(explorerJs.includes('Is your site missing? Email'), true);
  assert.equal(explorerJs.includes('href=\\"mailto:trevorkeenan@berkeley.edu\\"'), true);
  assert.equal(explorerCss.includes('.shuttle-explorer__map-actions {'), true);
  assert.equal(explorerCss.includes('.shuttle-explorer__map-legend-swatch--selected {'), false);
  assert.equal(explorerCss.includes('.shuttle-explorer__map-legend-swatch--filtered {'), false);
  assert.equal(explorerCss.includes('.shuttle-explorer__map-legend-swatch--accessible {'), false);
  assert.equal(explorerCss.includes('.shuttle-explorer__map-legend-swatch--unshared {'), false);
  assert.equal(explorerCss.includes('.shuttle-explorer__table tbody tr.shuttle-explorer__row--map-linked > td'), true);
  assert.equal(explorerCss.includes('.shuttle-explorer__table tbody tr.shuttle-explorer__row--map-active > td'), true);
});

test('Map marker and legend colors use the shared swapped category mapping', () => {
  assert.deepEqual(hooks.mapCategoryColors('filteredAccessible'), {
    color: '#9b6a08',
    fillColor: '#f3d58a'
  });
  assert.deepEqual(hooks.mapCategoryColors('accessibleData'), {
    color: '#2f5374',
    fillColor: '#5f8bb3'
  });
  assert.deepEqual(hooks.mapCategoryColors('withoutSharedData'), {
    color: '#6d8fb2',
    fillColor: '#d8e6f4'
  });
  assert.equal(
    hooks.mapLegendSwatchStyle('filteredAccessible'),
    'border:1.4px solid #9b6a08;background:#f3d58a;'
  );
  assert.equal(
    hooks.mapLegendSwatchStyle('accessibleData'),
    'border:1.4px solid #2f5374;background:#5f8bb3;'
  );
  assert.equal(
    hooks.mapLegendSwatchStyle('withoutSharedData'),
    'border:1.4px solid #6d8fb2;background:#d8e6f4;'
  );
  assert.deepEqual(hooks.filteredAccessibleMapMarkerStyle(), {
    radius: 4.5,
    weight: 1.1,
    color: '#9b6a08',
    fillColor: '#f3d58a',
    fillOpacity: 0.45
  });
});

test('Map/table linking uses canonical site keys and duplicate-row lookup entries', () => {
  const fluxnetRow = makeCatalogRow({
    site_id: 'US-Dup',
    source_label: 'AmeriFlux-FLUXNET',
    latitude: '38.1',
    longitude: '-120.2',
    _selection_key: 'US-Dup::FLUXNET'
  });
  const baseRow = makeCatalogRow({
    site_id: 'US-Dup',
    source_label: 'AmeriFlux-BASE',
    latitude: '38.1',
    longitude: '-120.2',
    _selection_key: 'US-Dup::BASE'
  });
  const lookup = {};
  const siteKey = hooks.mapSiteKey(fluxnetRow);

  assert.equal(siteKey, 'site:US-DUP');
  assert.equal(hooks.mapSiteKey(baseRow), siteKey);
  hooks.addToSiteKeyLookup(lookup, siteKey, { id: 'fluxnet-row' });
  hooks.addToSiteKeyLookup(lookup, hooks.mapSiteKey(baseRow), { id: 'base-row' });
  assert.deepEqual(
    hooks.siteKeyLookupEntries(lookup, siteKey).map((entry) => entry.id),
    ['fluxnet-row', 'base-row']
  );
  assert.deepEqual(hooks.siteKeyLookupEntries(lookup, 'site:US-Missing'), []);
});

test('Map/table linking falls back to coordinates and handles missing known-site-only rows safely', () => {
  const coordinateKey = hooks.mapSiteKey({
    site_id: '',
    latitude: '40.123',
    longitude: '-121.456'
  });
  const knownOnlyKey = hooks.mapSiteKey({
    site_id: 'US-KnownOnly',
    latitude: 41.2,
    longitude: -121.3,
    known_site_only: true
  });

  assert.equal(coordinateKey, 'coord:40.123:-121.456');
  assert.equal(knownOnlyKey, 'site:US-KNOWNONLY');
  assert.deepEqual(hooks.siteKeyLookupEntries({}, knownOnlyKey), []);
});

test('Linked marker highlight preserves semantic colors while increasing emphasis', () => {
  const base = hooks.filteredAccessibleMapMarkerStyle();
  const highlighted = hooks.linkedMarkerHighlightStyle(base);

  assert.equal(highlighted.color, base.color);
  assert.equal(highlighted.fillColor, base.fillColor);
  assert.equal(highlighted.radius > base.radius, true);
  assert.equal(highlighted.weight > base.weight, true);
  assert.equal(highlighted.fillOpacity > base.fillOpacity, true);
});

test('Known-sites helpers export availability labels and marker colors', () => {
  const accessibleRow = {
    site_id: 'US-Acc',
    site_name: 'Accessible Site',
    latitude: 40.1,
    longitude: -120.2,
    country: 'United States',
    has_accessible_data: true,
    known_site_only: false
  };
  const noPublicRow = {
    site_id: 'US-Npd',
    site_name: 'No Public Data Site',
    latitude: 41.2,
    longitude: -121.3,
    country: 'United States',
    has_accessible_data: false,
    known_site_only: true
  };

  assert.equal(hooks.knownSiteDataAvailabilityLabel(accessibleRow), 'accessible data');
  assert.equal(hooks.knownSiteDataAvailabilityLabel(noPublicRow), 'no public data');
  assert.deepEqual(
    hooks.knownSiteMapMarkerStyle(accessibleRow),
    {
      radius: 4,
      weight: 1.1,
      color: '#2f5374',
      fillColor: '#5f8bb3',
      fillOpacity: 0.45
    }
  );
  assert.deepEqual(
    hooks.knownSiteMapMarkerStyle(noPublicRow),
    {
      radius: 4.5,
      weight: 1.4,
      color: '#6d8fb2',
      fillColor: '#d8e6f4',
      fillOpacity: 0.6
    }
  );
  assert.equal(
    hooks.buildKnownSitesExportCsv([accessibleRow, noPublicRow]),
    [
      'site_id,site_name,latitude,longitude,country,data_availability',
      'US-Acc,Accessible Site,40.1,-120.2,United States,accessible data',
      'US-Npd,No Public Data Site,41.2,-121.3,United States,no public data',
      ''
    ].join('\n')
  );
});

test('Map display state is driven by filtered rows, not by selected rows', () => {
  const filteredRows = [
    makeCatalogRow({
      site_id: 'US-MapA',
      latitude: '38.1',
      longitude: '-120.2',
      _selection_key: 'US-MapA::ICOS'
    }),
    makeCatalogRow({
      site_id: 'US-MapB',
      latitude: '39.2',
      longitude: '-121.3',
      _selection_key: 'US-MapB::ICOS'
    })
  ];

  const unselectedState = hooks.buildMapDisplayState(filteredRows, {});
  const selectedState = hooks.buildMapDisplayState(filteredRows, {
    'US-MapB::ICOS': true,
    'US-Outside::ICOS': true
  });

  assert.equal(unselectedState.filteredRows.length, 2);
  assert.equal(unselectedState.mappableRows.length, 2);
  assert.equal(unselectedState.selectedRows.length, 0);
  assert.equal(unselectedState.mappableRows.some((row) => row.site_id === 'US-MapA'), true);
  assert.equal(selectedState.filteredRows.length, 2);
  assert.equal(selectedState.mappableRows.length, 2);
  assert.deepEqual(selectedState.selectedRows.map((row) => row.site_id), ['US-MapB']);
  assert.equal(selectedState.mappableRows.find((row) => row.site_id === 'US-MapB').is_map_selected, undefined);
  assert.equal(selectedState.mappableRows.find((row) => row.site_id === 'US-MapA').is_map_selected, undefined);
  assert.equal(selectedState.signature, unselectedState.signature);
});

test('Map display state follows filtered-result changes before selection buttons are used', () => {
  const rows = [
    makeCatalogRow({
      site_id: 'US-MapA',
      site_name: 'Alpha Site',
      latitude: '38.1',
      longitude: '-120.2',
      _selection_key: 'US-MapA::ICOS',
      search_text: 'us-mapa alpha site'
    }),
    makeCatalogRow({
      site_id: 'US-MapB',
      site_name: 'Beta Site',
      latitude: '39.2',
      longitude: '-121.3',
      _selection_key: 'US-MapB::ICOS',
      search_text: 'us-mapb beta site'
    })
  ];
  const filteredRows = rows.filter((row) => hooks.rowMatchesExplorerFilters(row, { search: 'beta' }));
  const mapState = hooks.buildMapDisplayState(filteredRows, {});

  assert.deepEqual(filteredRows.map((row) => row.site_id), ['US-MapB']);
  assert.deepEqual(mapState.mappableRows.map((row) => row.site_id), ['US-MapB']);
  assert.equal(mapState.selectedRows.length, 0);
});

test('Selection state is kept separate from marker category styling', () => {
  const filteredRows = [
    makeCatalogRow({
      site_id: 'US-StyleA',
      latitude: '38.1',
      longitude: '-120.2',
      _selection_key: 'US-StyleA::ICOS'
    })
  ];
  const selectedState = hooks.buildMapDisplayState(filteredRows, {
    'US-StyleA::ICOS': true
  });

  assert.deepEqual(selectedState.selectedRows.map((row) => row.site_id), ['US-StyleA']);
  assert.equal(Object.prototype.hasOwnProperty.call(selectedState.mappableRows[0], 'is_map_selected'), false);
  assert.equal(selectedState.signature, hooks.buildMapDisplayState(filteredRows, {}).signature);
});

test('Map display state counts unique map sites rather than duplicate product rows', () => {
  const duplicateRows = [
    makeCatalogRow({
      site_id: 'US-Dup',
      source_label: 'AmeriFlux-FLUXNET',
      latitude: '38.1',
      longitude: '-120.2',
      _selection_key: 'US-Dup::FLUXNET'
    }),
    makeCatalogRow({
      site_id: 'US-Dup',
      source_label: 'AmeriFlux-BASE',
      latitude: '38.1',
      longitude: '-120.2',
      _selection_key: 'US-Dup::BASE'
    }),
    makeCatalogRow({
      site_id: 'US-Other',
      latitude: '39.2',
      longitude: '-121.3',
      _selection_key: 'US-Other::ICOS'
    })
  ];
  const state = hooks.buildMapDisplayState(duplicateRows, {
    'US-Dup::BASE': true
  });

  assert.equal(state.filteredRows.length, 2);
  assert.equal(state.mappableRows.length, 2);
  assert.deepEqual(state.selectedRows.map((row) => row.site_id), ['US-Dup']);
});

test('Known-site map display state dedupes sites and lets accessible rows win over known-only duplicates', () => {
  const knownRows = [
    {
      site_id: 'US-Dup',
      latitude: 38.1,
      longitude: -120.2,
      known_site_only: true
    },
    {
      site_id: 'US-Dup',
      latitude: 38.1,
      longitude: -120.2,
      known_site_only: false
    },
    {
      site_id: 'US-Other',
      latitude: 39.2,
      longitude: -121.3,
      known_site_only: true
    }
  ];
  const state = hooks.buildKnownSiteMapDisplayState(knownRows);

  assert.equal(state.totalCount, 2);
  assert.equal(state.accessibleCount, 1);
  assert.equal(state.knownSiteOnlyCount, 1);
  assert.equal(state.rows.find((row) => row.site_id === 'US-Dup').known_site_only, false);
});

test('Known-site map display state includes accessible explorer sites missing from the known-sites asset', () => {
  const knownRows = [
    {
      site_id: 'US-Known',
      latitude: 38.1,
      longitude: -120.2,
      known_site_only: true
    },
    {
      site_id: 'US-Overlap',
      latitude: 39.2,
      longitude: -121.3,
      known_site_only: true
    }
  ];
  const accessibleRows = [
    makeCatalogRow({
      site_id: 'US-Overlap',
      latitude: '39.2',
      longitude: '-121.3'
    }),
    makeCatalogRow({
      site_id: 'US-NewAccessible',
      latitude: '40.3',
      longitude: '-122.4'
    })
  ];
  const state = hooks.buildKnownSiteMapDisplayState(knownRows, accessibleRows);

  assert.equal(state.totalCount, 3);
  assert.equal(state.accessibleCount, 2);
  assert.equal(state.knownSiteOnlyCount, 1);
  assert.equal(state.rows.find((row) => row.site_id === 'US-Overlap').known_site_only, false);
  assert.equal(state.rows.find((row) => row.site_id === 'US-NewAccessible').known_site_only, false);
});

test('Known-site map display state uses canonical accessible rows instead of stale known-site accessibility flags', () => {
  const knownRows = [
    {
      site_id: 'US-StaleAccessible',
      latitude: 38.1,
      longitude: -120.2,
      known_site_only: false
    },
    {
      site_id: 'US-CurrentAccessible',
      latitude: 39.2,
      longitude: -121.3,
      known_site_only: false
    }
  ];
  const accessibleRows = [
    makeCatalogRow({
      site_id: 'US-CurrentAccessible',
      latitude: '39.2',
      longitude: '-121.3'
    })
  ];
  const state = hooks.buildKnownSiteMapDisplayState(knownRows, accessibleRows);

  assert.equal(state.totalCount, 2);
  assert.equal(state.accessibleCount, 1);
  assert.equal(state.knownSiteOnlyCount, 1);
  assert.equal(state.rows.find((row) => row.site_id === 'US-StaleAccessible').known_site_only, true);
  assert.equal(state.rows.find((row) => row.site_id === 'US-CurrentAccessible').known_site_only, false);
});

test('Map summary is stable across selection changes and always includes the missing-site contact', () => {
  const knownState = {
    totalCount: 2,
    accessibleCount: 1,
    knownSiteOnlyCount: 1
  };
  const unselected = hooks.buildMapDisplayState([
    makeCatalogRow({
      site_id: 'US-Sum',
      latitude: '38.1',
      longitude: '-120.2',
      _selection_key: 'US-Sum::ICOS'
    })
  ], {});
  const selected = hooks.buildMapDisplayState([
    makeCatalogRow({
      site_id: 'US-Sum',
      latitude: '38.1',
      longitude: '-120.2',
      _selection_key: 'US-Sum::ICOS'
    })
  ], {
    'US-Sum::ICOS': true
  });
  const unselectedHtml = hooks.buildMapSummaryHtml(unselected, knownState, true);
  const selectedHtml = hooks.buildMapSummaryHtml(selected, knownState, true);

  assert.equal(unselectedHtml, selectedHtml);
  assert.equal(unselectedHtml.includes('Showing 1 site with accessible data on the map.'), true);
  assert.equal(unselectedHtml.includes('Background layer: 2 known flux sites, including 1 site with accessible data.'), true);
  assert.equal(unselectedHtml.includes('other known site without shared data'), false);
  assert.equal(unselectedHtml.includes('Is your site missing? Email'), true);
});

test('Map summary labels narrowed foreground counts separately from stable background totals', () => {
  const knownState = {
    totalCount: 4,
    accessibleCount: 3,
    knownSiteOnlyCount: 1
  };
  const narrowed = hooks.buildMapDisplayState([
    makeCatalogRow({
      site_id: 'US-Narrow',
      latitude: '38.1',
      longitude: '-120.2',
      _selection_key: 'US-Narrow::ICOS'
    })
  ], {});
  const html = hooks.buildMapSummaryHtml(narrowed, knownState, true);

  assert.equal(html.includes('Showing 1 filtered site with accessible data on the map.'), true);
  assert.equal(html.includes('Background layer: 4 known flux sites, including 3 sites with accessible data.'), true);
  assert.equal(html.includes('other known site without shared data'), false);
  assert.equal(html.includes('Is your site missing? Email'), true);
});

test('Map summary uses accessible-data wording without inferred known-only counts', () => {
  const knownState = {
    totalCount: 5,
    accessibleCount: 3,
    knownSiteOnlyCount: 2
  };
  const unfilteredHtml = hooks.buildMapSummaryHtml({
    filteredRows: [{}, {}, {}],
    mappableRows: [{}, {}, {}],
    missingCoordinates: 0
  }, knownState, true);
  const filteredHtml = hooks.buildMapSummaryHtml({
    filteredRows: [{}, {}],
    mappableRows: [{}, {}],
    missingCoordinates: 0
  }, knownState, true);

  assert.equal(unfilteredHtml.includes('Showing 3 sites with accessible data on the map.'), true);
  assert.equal(filteredHtml.includes('Showing 2 filtered sites with accessible data on the map.'), true);
  assert.equal(unfilteredHtml.includes('Background layer: 5 known flux sites, including 3 sites with accessible data.'), true);
  assert.equal(filteredHtml.includes('Background layer: 5 known flux sites, including 3 sites with accessible data.'), true);
  assert.equal(unfilteredHtml.includes('other known sites without shared data'), false);
  assert.equal(filteredHtml.includes('other known sites without shared data'), false);
  assert.equal(unfilteredHtml.includes('Is your site missing? Email'), true);
  assert.equal(filteredHtml.includes('Is your site missing? Email'), true);
});

test('Merge precedence is Shuttle > ICOS > AmeriFlux > FLUXNET2015 with no duplicates', () => {
  const shuttleRows = [
    {
      site_id: 'AR-Bal',
      site_name: 'Arroyo',
      country: 'AR',
      data_hub: 'AmeriFlux',
      network: 'AmeriFlux;Fluxnet-Canada',
      source_network: 'AmeriFlux',
      network_display: 'AmeriFlux;Fluxnet-Canada',
      network_tokens: ['AmeriFlux', 'Fluxnet-Canada'],
      vegetation_type: '',
      first_year: 2012,
      last_year: 2013,
      years: '2012-2013',
      download_link: 'https://data.fluxnet.org/shuttle/ar-bal.zip',
      download_mode: 'direct',
      _selection_key: 'shuttle|AR-Bal|1',
      _index: 0,
      source_label: '',
      source_reason: ''
    },
    {
      site_id: 'US-Var',
      site_name: 'Variant',
      country: 'US',
      data_hub: 'AmeriFlux',
      network: 'AmeriFlux;Phenocam',
      source_network: 'AmeriFlux',
      network_display: 'AmeriFlux;Phenocam',
      network_tokens: ['AmeriFlux', 'Phenocam'],
      vegetation_type: '',
      first_year: 2014,
      last_year: 2015,
      years: '2014-2015',
      download_link: 'https://data.fluxnet.org/shuttle/us-var.zip',
      download_mode: 'direct',
      _selection_key: 'shuttle|US-Var|1',
      _index: 1,
      source_label: '',
      source_reason: ''
    }
  ];

  const icosRows = [
    {
      site_id: 'AR-Bal',
      site_name: 'Arroyo ICOS',
      country: 'AR',
      data_hub: 'ICOS',
      network: 'FLX',
      source_network: 'FLX',
      network_display: 'FLX',
      network_tokens: ['FLX'],
      vegetation_type: '',
      first_year: 2012,
      last_year: 2014,
      years: '2012-2014',
      download_link: 'https://data.icos-cp.eu/licence_accept?ids=%5B%22obj-ar-bal%22%5D&fileName=FLX_AR-Bal_FLUXNET2015_FULLSET_2012-2014_beta-3.zip',
      download_mode: 'direct',
      processing_lineage: 'oneflux',
      source_label: 'ICOS',
      source_reason: 'Available directly from the ICOS Carbon Portal archive.',
      source_origin: 'icos_direct',
      object_id: 'obj-ar-bal',
      file_name: 'FLX_AR-Bal_FLUXNET2015_FULLSET_2012-2014_beta-3.zip',
      object_spec: 'http://meta.icos-cp.eu/resources/cpmeta/miscFluxnetArchiveProduct',
      direct_download_url: 'https://data.icos-cp.eu/licence_accept?ids=%5B%22obj-ar-bal%22%5D&fileName=FLX_AR-Bal_FLUXNET2015_FULLSET_2012-2014_beta-3.zip'
    },
    {
      site_id: 'AR-Bal',
      site_name: 'Arroyo ICOS ETC',
      country: 'AR',
      data_hub: 'ICOS',
      network: 'ICOS',
      source_network: 'ICOS',
      network_display: 'ICOS',
      network_tokens: ['ICOS'],
      vegetation_type: '',
      first_year: 2021,
      last_year: 2024,
      years: '2021-2024',
      download_link: 'https://data.icos-cp.eu/licence_accept?ids=%5B%22obj-ar-bal-etc%22%5D&fileName=ICOSETC_AR-Bal_ARCHIVE_L2.zip',
      download_mode: 'direct',
      processing_lineage: 'other_processed',
      source_label: 'ICOS',
      source_reason: 'Available directly from the ICOS Carbon Portal archive.',
      source_origin: 'icos_direct',
      object_id: 'obj-ar-bal-etc',
      file_name: 'ICOSETC_AR-Bal_ARCHIVE_L2.zip',
      object_spec: 'http://meta.icos-cp.eu/resources/cpmeta/etcArchiveProduct',
      direct_download_url: 'https://data.icos-cp.eu/licence_accept?ids=%5B%22obj-ar-bal-etc%22%5D&fileName=ICOSETC_AR-Bal_ARCHIVE_L2.zip'
    },
    {
      site_id: 'BE-Bra',
      site_name: 'Brasschaat',
      country: 'BE',
      data_hub: 'ICOS',
      network: 'FLX',
      source_network: 'FLX',
      network_display: 'FLX',
      network_tokens: ['FLX'],
      vegetation_type: '',
      first_year: 1996,
      last_year: 2020,
      years: '1996-2020',
      download_link: 'https://data.icos-cp.eu/licence_accept?ids=%5B%225BCT4nKCoGaYQh77DW6OW7gs%22%5D&fileName=FLX_BE-Bra_FLUXNET2015_FULLSET_1996-2020_beta-3.zip',
      download_mode: 'direct',
      processing_lineage: 'oneflux',
      source_label: 'ICOS',
      source_reason: 'Available directly from the ICOS Carbon Portal archive.',
      source_origin: 'icos_direct',
      object_id: '5BCT4nKCoGaYQh77DW6OW7gs',
      file_name: 'FLX_BE-Bra_FLUXNET2015_FULLSET_1996-2020_beta-3.zip',
      object_spec: 'http://meta.icos-cp.eu/resources/cpmeta/miscFluxnetArchiveProduct',
      direct_download_url: 'https://data.icos-cp.eu/licence_accept?ids=%5B%225BCT4nKCoGaYQh77DW6OW7gs%22%5D&fileName=FLX_BE-Bra_FLUXNET2015_FULLSET_1996-2020_beta-3.zip'
    },
    {
      site_id: 'BE-Bra',
      site_name: 'Brasschaat ETC',
      country: 'BE',
      data_hub: 'ICOS',
      network: 'ICOS',
      source_network: 'ICOS',
      network_display: 'ICOS',
      network_tokens: ['ICOS'],
      vegetation_type: '',
      first_year: 2021,
      last_year: 2024,
      years: '2021-2024',
      download_link: 'https://data.icos-cp.eu/licence_accept?ids=%5B%22obj-be-bra-etc%22%5D&fileName=ICOSETC_BE-Bra_ARCHIVE_L2.zip',
      download_mode: 'direct',
      processing_lineage: 'other_processed',
      source_label: 'ICOS',
      source_reason: 'Available directly from the ICOS Carbon Portal archive.',
      source_origin: 'icos_direct',
      object_id: 'obj-be-bra-etc',
      file_name: 'ICOSETC_BE-Bra_ARCHIVE_L2.zip',
      object_spec: 'http://meta.icos-cp.eu/resources/cpmeta/etcArchiveProduct',
      direct_download_url: 'https://data.icos-cp.eu/licence_accept?ids=%5B%22obj-be-bra-etc%22%5D&fileName=ICOSETC_BE-Bra_ARCHIVE_L2.zip'
    }
  ];

  const ameriSites = [
    { site_id: 'AR-Bal', publish_years: [2012, 2013], first_year: 2012, last_year: 2013 },
    { site_id: 'BE-Bra', publish_years: [1996, 2020], first_year: 1996, last_year: 2020 },
    { site_id: 'BR-New', publish_years: [2019], first_year: 2019, last_year: 2019 }
  ];

  const fluxnet2015Sites = [
    { site_id: 'AR-Bal', publish_years: [2012], first_year: 2012, last_year: 2012 },
    { site_id: 'BE-Bra', publish_years: [1996, 2020], first_year: 1996, last_year: 2020 },
    { site_id: 'BR-New', publish_years: [2019], first_year: 2019, last_year: 2019 },
    { site_id: 'CL-Old', publish_years: [2005], first_year: 2005, last_year: 2005 }
  ];

  const merged = hooks.mergeCatalogRows(shuttleRows, icosRows, ameriSites, fluxnet2015Sites);
  const overlap = merged.rows.find((row) => row.site_id === 'AR-Bal');
  const icosOnly = merged.rows.find((row) => row.site_id === 'BE-Bra');
  const ameriOnly = merged.rows.find((row) => row.site_id === 'BR-New');
  const fluxnet2015Only = merged.rows.find((row) => row.site_id === 'CL-Old');
  const shuttleAmeriFlux = merged.rows.find((row) => row.site_id === 'US-Var');

  assert.equal(merged.icosDirectTotalSites, 2);
  assert.equal(merged.icosDirectSuppressedByShuttle, 1);
  assert.equal(merged.icosDirectOnlySites, 1);
  assert.equal(merged.amerifluxOverlapSites, 1);
  assert.equal(merged.amerifluxOnlySites, 1);
  assert.equal(merged.fluxnet2015OnlySites, 1);
  assert.equal(merged.rows.filter((row) => row.site_id === 'AR-Bal').length, 1);
  assert.equal(merged.rows.filter((row) => row.site_id === 'BE-Bra').length, 1);
  assert.equal(merged.rows.filter((row) => row.site_id === 'BR-New').length, 1);

  assert.equal(overlap.source_label, 'AmeriFlux-Shuttle');
  assert.deepEqual(overlap.source_filter_tags, ['AmeriFlux', 'AmeriFlux-Shuttle', 'FLUXNET-Shuttle']);
  assert.equal(overlap.download_mode, 'direct');
  assert.equal(overlap.download_link, 'https://data.fluxnet.org/shuttle/ar-bal.zip');
  assert.equal(overlap.country, 'Argentina');
  assert.equal(overlap.network_display, 'AmeriFlux');
  assert.deepEqual(overlap.network_tokens, ['AmeriFlux']);

  assert.equal(ameriOnly.source_label, 'AmeriFlux');
  assert.equal(ameriOnly.download_mode, 'ameriflux_api');
  assert.equal(ameriOnly.data_hub, 'AmeriFlux');
  assert.equal(ameriOnly.api_data_product, 'FLUXNET');
  assert.equal(ameriOnly.length_years, 1);
  assert.deepEqual(ameriOnly.source_filter_tags, ['AmeriFlux']);

  assert.equal(icosOnly.source_label, 'ICOS');
  assert.equal(icosOnly.download_mode, 'direct');
  assert.equal(icosOnly.data_hub, 'ICOS');
  assert.equal(icosOnly.download_link.includes('licence_accept'), true);
  assert.equal(icosOnly.object_id, '5BCT4nKCoGaYQh77DW6OW7gs');
  assert.equal(icosOnly.file_name, 'FLX_BE-Bra_FLUXNET2015_FULLSET_1996-2020_beta-3.zip');
  assert.equal(icosOnly.source_priority, 300);
  assert.equal(icosOnly.is_icos, true);
  assert.equal(icosOnly.country, 'Belgium');
  assert.deepEqual(icosOnly.source_filter_tags, ['ICOS']);

  assert.equal(fluxnet2015Only.source_label, 'FLUXNET2015');
  assert.equal(fluxnet2015Only.download_mode, 'ameriflux_api');
  assert.equal(fluxnet2015Only.api_data_product, 'FLUXNET2015');
  assert.equal(fluxnet2015Only.data_hub, 'AmeriFlux');
  assert.equal(fluxnet2015Only.network, 'AmeriFlux');
  assert.equal(fluxnet2015Only.source_network, 'AmeriFlux');
  assert.equal(fluxnet2015Only.network_display, 'AmeriFlux');
  assert.deepEqual(fluxnet2015Only.network_tokens, ['AmeriFlux']);
  assert.equal(fluxnet2015Only.length_years, 1);
  assert.deepEqual(fluxnet2015Only.source_filter_tags, ['AmeriFlux', 'FLUXNET-2015']);

  assert.equal(shuttleAmeriFlux.network_display, 'AmeriFlux');
  assert.deepEqual(shuttleAmeriFlux.network_tokens, ['AmeriFlux']);
  assert.deepEqual(shuttleAmeriFlux.source_filter_tags, ['AmeriFlux', 'AmeriFlux-Shuttle', 'FLUXNET-Shuttle']);
});

test('ICOS ETC rows remain downloadable ICOS rows and surface as other processed', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [
      makeCatalogRow({
        site_id: 'CH-Dav',
        site_name: 'Davos',
        country: 'CH',
        network: 'ICOS',
        source_network: 'ICOS',
        network_display: 'ICOS',
        network_tokens: ['ICOS'],
        first_year: 2019,
        last_year: 2023,
        years: '2019-2023',
        download_link: 'https://data.icos-cp.eu/licence_accept?ids=%5B%22obj-ch-dav%22%5D&fileName=ICOSETC_CH-Dav_ARCHIVE_L2.zip',
        processing_lineage: 'other_processed',
        file_name: 'ICOSETC_CH-Dav_ARCHIVE_L2.zip',
        object_id: 'obj-ch-dav',
        object_spec: 'http://meta.icos-cp.eu/resources/cpmeta/etcArchiveProduct',
        direct_download_url: 'https://data.icos-cp.eu/licence_accept?ids=%5B%22obj-ch-dav%22%5D&fileName=ICOSETC_CH-Dav_ARCHIVE_L2.zip'
      })
    ],
    [],
    []
  );
  const row = merged.rows[0];
  const option = hooks.buildRowDownloadOptions(row, true)[0];

  assert.equal(row.source_label, 'ICOS');
  assert.equal(row.download_mode, 'direct');
  assert.equal(row.processing_lineage, 'other_processed');
  assert.equal(row.product_family, 'ICOS_ETC');
  assert.deepEqual(row.availability_filter_labels, ['Other processed']);
  assert.deepEqual(row.source_filter_tags, ['ICOS']);
  assert.equal(option.actionLabel, 'Accept ICOS license and download');
  assert.equal(option.displayLabel, 'ICOS ETC L2 archive');
});

test('BASE-only sites surface BASE only and bulk helpers keep the BASE product', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [],
    [],
    [
      makeAvailabilitySite('US-Base', [2005, 2006, 2007], {
        site_name: 'Base Site',
        country: 'US'
      })
    ]
  );
  const row = merged.rows[0];
  const partition = hooks.partitionRowsByBulkSource([row]);

  assert.equal(merged.baseOnlySites, 1);
  assert.equal(row.surfacedProductClassification, 'other_processed');
  assert.equal(row.processing_lineage, 'other_processed');
  assert.equal(row.source_filter, 'AmeriFlux');
  assert.equal(row.hasProcessedProduct, false);
  assert.deepEqual(row.availability_filter_labels, ['Other processed']);
  assert.equal(row.source_label, 'BASE');
  assert.equal(row.years, 'BASE: 2005-2007');
  assert.equal(row.length_years, 3);
  assert.deepEqual(
    row.surfacedProducts.map((product) => product.productFamily),
    ['BASE']
  );
  assert.deepEqual(
    row.surfacedProducts.map((product) => product.processing_lineage),
    ['other_processed']
  );
  assert.equal(row.surfacedProducts[0].apiDataProduct, 'BASE-BADM');
  assert.equal(partition.shuttleRows.length, 0);
  assert.equal(partition.ameriFluxRows.length, 1);
  assert.equal(partition.ameriFluxRows[0].api_data_product, 'BASE-BADM');
  assert.match(
    hooks.buildAmeriFluxSelectedSitesText(partition.ameriFluxRows),
    /US-Base\tBASE-BADM\tCCBY4\.0\tBASE/
  );
});

test('Legacy BASE-only sites surface with Legacy policy metadata and warning-aware bulk entries', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [
      makeAvailabilitySite('US-Leg', [2001, 2002], {
        data_policy: 'LEGACY'
      })
    ]
  );
  const row = merged.rows[0];
  const partition = hooks.partitionRowsByBulkSource([row]);
  const summary = hooks.summarizeBulkSelection([row]);

  assert.equal(row.source_label, 'AmeriFlux BASE (Legacy)');
  assert.equal(row.processing_lineage, 'other_processed');
  assert.equal(row.surfacedProducts.length, 1);
  assert.equal(row.surfacedProducts[0].apiDataProduct, 'BASE-BADM');
  assert.equal(row.surfacedProducts[0].data_policy, 'LEGACY');
  assert.equal(partition.ameriFluxRows[0].data_policy, 'LEGACY');
  assert.equal(summary.hasAmeriFluxLegacy, true);
  assert.match(hooks.renderSurfacedCoverageHtml(row), /Policy: Legacy/);
});

test('AmeriFlux Legacy BASE-only site metadata enriches CA-GL4 for table and map display', () => {
  const siteInfoLookup = hooks.buildAmeriFluxSiteInfoLookup([
    {
      SITE_ID: ' CA-GL4 ',
      SITE_NAME: 'Nine Mile Lighthouse',
      COUNTRY: 'Canada',
      LOCATION_LAT: '44.1516',
      LOCATION_LONG: '-76.5559'
    }
  ]);
  const vegetationLookup = hooks.buildVegetationMetadataLookup([
    {
      site_id: 'CA-GL4',
      vegetation_type: 'WAT'
    }
  ]);
  const enrichedLegacySites = hooks.enrichAmeriFluxSitesWithMetadata(
    [
      makeAvailabilitySite('CA-GL4', [2016, 2017, 2018], {
        data_policy: 'LEGACY'
      })
    ],
    siteInfoLookup,
    vegetationLookup
  );
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    enrichedLegacySites
  );
  const row = merged.rows.find((candidate) => candidate.site_id === 'CA-GL4');
  const mapState = hooks.buildMapDisplayState([row], {});
  const mapSummary = hooks.buildMapSummaryHtml(mapState, { totalCount: 0, accessibleCount: 0 }, false);
  const partition = hooks.partitionRowsByBulkSource([row]);

  assert.equal(row.site_name, 'Nine Mile Lighthouse');
  assert.equal(row.country, 'Canada');
  assert.equal(row.latitude, 44.1516);
  assert.equal(row.longitude, -76.5559);
  assert.equal(row.vegetation_type, 'WAT');
  assert.equal(row.has_coordinates, true);
  assert.equal(row.source_label, 'AmeriFlux BASE (Legacy)');
  assert.equal(row.surfacedProducts[0].data_policy, 'LEGACY');
  assert.equal(partition.ameriFluxRows[0].api_data_product, 'BASE-BADM');
  assert.equal(partition.ameriFluxRows[0].data_policy, 'LEGACY');
  assert.deepEqual(mapState.mappableRows.map((candidate) => candidate.site_id), ['CA-GL4']);
  assert.equal(mapState.missingCoordinates, 0);
  assert.equal(mapSummary.includes('omitted because coordinates are unavailable'), false);
});

test('BASE CC-BY and Legacy policies remain distinct products when their coverage differs', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [],
    [],
    [],
    [makeAvailabilitySite('US-Policy', [2001], { data_policy: 'CCBY4.0' })],
    [],
    [makeAvailabilitySite('US-Policy', [2001, 2002], { data_policy: 'LEGACY' })]
  );
  const row = merged.rows[0];
  const partition = hooks.partitionRowsByBulkSource([row]);

  assert.deepEqual(
    row.surfacedProducts.map((product) => product.data_policy),
    ['CCBY4.0', 'LEGACY']
  );
  assert.deepEqual(
    partition.ameriFluxRows.map((entry) => entry.data_policy),
    ['CCBY4.0', 'LEGACY']
  );
  assert.match(row.years, /BASE: 2001/);
  assert.match(row.years, /BASE \(Policy: Legacy\): 2001-2002/);
});

test('BASE Legacy products are suppressed when CC-BY coverage is identical', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [],
    [],
    [],
    [makeAvailabilitySite('US-SamePolicy', [2001, 2002], { data_policy: 'CCBY4.0' })],
    [],
    [makeAvailabilitySite('US-SamePolicy', [2001, 2002], { data_policy: 'LEGACY' })]
  );

  assert.deepEqual(
    merged.rows[0].surfacedProducts.map((product) => product.data_policy),
    ['CCBY4.0']
  );
});

test('Identical FLUXNET and BASE exact year sets suppress BASE from surfaced products', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Same',
        site_name: 'Same Site',
        country: 'US',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AmeriFlux',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        first_year: 2010,
        last_year: 2012,
        years: '2010-2012',
        download_link: 'https://example.org/us-same-fluxnet.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [],
    [makeAvailabilitySite('US-Same', [2010, 2011, 2012])],
    [],
    [makeAvailabilitySite('US-Same', [2010, 2011, 2012])]
  );
  const row = merged.rows[0];
  const partition = hooks.partitionRowsByBulkSource([row]);

  assert.equal(row.surfacedProductClassification, 'fluxnet_processed');
  assert.equal(row.processing_lineage, 'oneflux');
  assert.equal(row.source_filter, 'AmeriFlux-Shuttle');
  assert.deepEqual(row.source_filter_tags, ['AmeriFlux', 'AmeriFlux-Shuttle', 'FLUXNET-Shuttle']);
  assert.equal(row.hasProcessedProduct, true);
  assert.deepEqual(row.availability_filter_labels, ['FLUXNET processed']);
  assert.equal(row.surfacedProducts.length, 1);
  assert.equal(row.surfacedProducts[0].productFamily, 'FLUXNET');
  assert.equal(row.surfacedProducts[0].processing_lineage, 'oneflux');
  assert.equal(row.ameriFluxBaseProduct.productFamily, 'BASE');
  assert.equal(partition.shuttleRows.length, 1);
  assert.equal(partition.ameriFluxRows.length, 0);
});

test('Sites with additional BASE years surface both products and bulk helpers keep both download targets', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Ext',
        site_name: 'Extended Site',
        country: 'US',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AmeriFlux',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        first_year: 1999,
        last_year: 2014,
        years: '1999-2014',
        download_link: 'https://example.org/us-ext-fluxnet.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [],
    [makeAvailabilitySite('US-Ext', Array.from({ length: 16 }, (_, index) => 1999 + index))],
    [],
    [makeAvailabilitySite('US-Ext', Array.from({ length: 27 }, (_, index) => 1999 + index))]
  );
  const row = merged.rows[0];
  const partition = hooks.partitionRowsByBulkSource([row]);
  const optionLabels = hooks.buildRowDownloadOptions(row, true).map((option) => option.displayLabel);
  const coverageHtml = hooks.renderSurfacedCoverageHtml(row);

  assert.equal(merged.additionalBaseYearsSites, 1);
  assert.equal(row.surfacedProductClassification, 'fluxnet_and_other_processed');
  assert.equal(row.source_filter, 'AmeriFlux-Shuttle');
  assert.deepEqual(row.source_filter_tags, ['AmeriFlux', 'AmeriFlux-Shuttle', 'FLUXNET-Shuttle']);
  assert.equal(row.hasProcessedProduct, true);
  assert.deepEqual(
    row.availability_filter_labels,
    ['Sites with both FLUXNET and additional processed years']
  );
  assert.deepEqual(
    row.surfacedProducts.map((product) => product.productFamily),
    ['FLUXNET', 'BASE']
  );
  assert.equal(row.years, 'FLUXNET: 1999-2014 · BASE: 1999-2025');
  assert.equal(partition.shuttleRows.length, 1);
  assert.equal(partition.ameriFluxRows.length, 1);
  assert.equal(partition.ameriFluxRows[0].api_data_product, 'BASE-BADM');
  assert.deepEqual(
    optionLabels,
    ['FLUXNET (ONEFlux-derived)', 'BASE (standardized observations)']
  );
  assert.match(coverageHtml, /FLUXNET:/);
  assert.match(coverageHtml, /BASE:/);
  assert.match(coverageHtml, /Sites with both FLUXNET and additional processed years/);
});

test('Exact year-set comparison surfaces both products when coverage differs internally, not only at the endpoints', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Gap',
        site_name: 'Gap Site',
        country: 'US',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AmeriFlux',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        first_year: 1999,
        last_year: 2004,
        years: '1999-2004',
        download_link: 'https://example.org/us-gap-fluxnet.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [],
    [makeAvailabilitySite('US-Gap', [1999, 2000, 2002, 2004])],
    [],
    [makeAvailabilitySite('US-Gap', [1999, 2001, 2002, 2004])]
  );
  const row = merged.rows[0];

  assert.equal(
    hooks.exactYearSetsMatch([1999, 2000, 2002, 2004], [1999, 2001, 2002, 2004]),
    false
  );
  assert.equal(row.surfacedProductClassification, 'fluxnet_and_other_processed');
  assert.equal(row.surfacedProducts.length, 2);
  assert.deepEqual(row.surfacedProducts[0].exactYears, [1999, 2000, 2002, 2004]);
  assert.deepEqual(row.surfacedProducts[1].exactYears, [1999, 2001, 2002, 2004]);
  assert.equal(
    row.years,
    'FLUXNET: 1999-2000, 2002, 2004 · BASE: 1999, 2001-2002, 2004'
  );
});

test('Coverage length helper counts inclusive years and returns null for incomplete ranges', () => {
  assert.equal(hooks.calculateCoverageLength(2001, 2005), 5);
  assert.equal(hooks.calculateCoverageLength(2010, 2010), 1);
  assert.equal(hooks.calculateCoverageLength(2010, null), null);
  assert.equal(hooks.calculateCoverageLength(null, 2010), null);
});

test('Country helpers map ISO-2 codes case-insensitively and preserve full names', () => {
  assert.equal(hooks.countryCodeToName(' ar '), 'Argentina');
  assert.equal(hooks.normalizeCountryName('us'), 'USA');
  assert.equal(hooks.normalizeCountryName('United States'), 'USA');
  assert.equal(hooks.normalizeCountryName('United States of America'), 'USA');
  assert.equal(hooks.normalizeCountryName('Argentina'), 'Argentina');
  assert.equal(hooks.deriveCountry('CN-Du3', ''), 'China');
  assert.equal(hooks.deriveCountry('ZZ-Test', ''), 'ZZ');
  assert.equal(hooks.inferFluxnet2015NetworkFromCountry('Brazil'), 'AmeriFlux');
  assert.equal(hooks.inferFluxnet2015NetworkFromCountry('Germany'), 'ICOS');
  assert.equal(hooks.inferFluxnet2015NetworkFromCountry('Russian Federation'), 'ICOS');
  assert.equal(hooks.inferFluxnet2015NetworkFromCountry('South Africa'), 'ICOS');
  assert.equal(hooks.inferFluxnet2015NetworkFromCountry('Australia'), 'TERN');
  assert.equal(hooks.inferFluxnet2015NetworkFromCountry('New Zealand'), 'TERN');
  assert.equal(hooks.inferFluxnet2015NetworkFromCountry('China'), 'ChinaFlux');
  assert.equal(hooks.inferFluxnet2015NetworkFromCountry('ZZ'), null);
});

test('Network helpers normalize selected short codes to display names and dedupe mixed tokens', () => {
  assert.equal(hooks.normalizeNetworkToken('CNF'), 'ChinaFlux');
  assert.equal(hooks.normalizeNetworkToken('euf'), 'EuroFlux');
  assert.equal(hooks.normalizeNetworkToken('JPF'), 'JapanFlux');
  assert.equal(hooks.normalizeNetworkToken('KOF'), 'KoreaFlux');
  assert.equal(hooks.normalizeNetworkToken('AmeriFlux'), 'AmeriFlux');
  assert.equal(hooks.normalizeNetworkToken('FLX'), 'FLX');
  assert.deepEqual(
    hooks.normalizeNetworkTokens('CNF;ChinaFlux;AmeriFlux;KOF'),
    ['ChinaFlux', 'AmeriFlux', 'KoreaFlux']
  );
  assert.equal(
    hooks.normalizeNetworkDisplayValue('CNF;ChinaFlux;EUF'),
    'ChinaFlux;EuroFlux'
  );
});

test('Vegetation helper maps ICOS full-name variants to canonical IGBP codes and preserves codes', () => {
  assert.equal(hooks.normalizeVegetationType('Grasslands'), 'GRA');
  assert.equal(hooks.normalizeVegetationType(' grasslands '), 'GRA');
  assert.equal(hooks.normalizeVegetationType('Evergreen needleleaf forests'), 'ENF');
  assert.equal(hooks.normalizeVegetationType('Urban and Built-up lands'), 'URB');
  assert.equal(hooks.normalizeVegetationType('Permanent wetlands'), 'WET');
  assert.equal(hooks.normalizeVegetationType('GRA'), 'GRA');
  assert.equal(hooks.normalizeVegetationType('DNF'), 'DNF');
});

test('Merged Shuttle rows expose normalized network display names for filter tokens', () => {
  const merged = hooks.mergeCatalogRows([
    {
      site_id: 'CN-Test',
      site_name: 'China Test',
      country: 'CN',
      data_hub: 'TERN',
      network: 'CNF;JPF',
      source_network: '',
      network_display: 'CNF;JPF',
      network_tokens: ['CNF', 'JPF'],
      vegetation_type: '',
      first_year: 2010,
      last_year: 2011,
      years: '2010-2011',
      download_link: 'https://example.org/cn-test.zip',
      download_mode: 'direct',
      _selection_key: 'TERN|CN-Test|1',
      _index: 0,
      source_label: '',
      source_reason: ''
    }
  ], [], []);

  assert.equal(merged.rows[0].network_display, 'ChinaFlux;JapanFlux');
  assert.deepEqual(merged.rows[0].network_tokens, ['ChinaFlux', 'JapanFlux']);
});

test('Merged rows normalize mixed code and full-name vegetation values across sources', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Code',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AMF',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        vegetation_type: 'GRA',
        download_link: 'https://example.org/us-code.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [
      makeCatalogRow({
        site_id: 'AT-Full',
        vegetation_type: 'Grasslands',
        download_link: 'https://example.org/at-full.zip'
      }),
      makeCatalogRow({
        site_id: 'BE-Full',
        vegetation_type: 'Evergreen Needleleaf Forests',
        download_link: 'https://example.org/be-full.zip'
      })
    ],
    [],
    []
  );

  assert.equal(merged.rows.find((row) => row.site_id === 'US-Code').vegetation_type, 'GRA');
  assert.equal(merged.rows.find((row) => row.site_id === 'AT-Full').vegetation_type, 'GRA');
  assert.equal(merged.rows.find((row) => row.site_id === 'BE-Full').vegetation_type, 'ENF');
});

test('ICOS-style vegetation full names normalize robustly for case and spacing variants', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [
      makeCatalogRow({
        site_id: 'AT-Neu',
        vegetation_type: ' grasslands ',
        download_link: 'https://example.org/at-neu.zip'
      }),
      makeCatalogRow({
        site_id: 'SE-Nor',
        vegetation_type: 'Evergreen needleleaf forests',
        download_link: 'https://example.org/se-nor.zip'
      }),
      makeCatalogRow({
        site_id: 'US-Urb',
        vegetation_type: 'Urban and Built-up lands',
        download_link: 'https://example.org/us-urb.zip'
      })
    ],
    [],
    []
  );

  assert.equal(merged.rows.find((row) => row.site_id === 'AT-Neu').vegetation_type, 'GRA');
  assert.equal(merged.rows.find((row) => row.site_id === 'SE-Nor').vegetation_type, 'ENF');
  assert.equal(merged.rows.find((row) => row.site_id === 'US-Urb').vegetation_type, 'URB');
});

test('AmeriFlux-only rows keep backfilled vegetation through merge and search indexing', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [
      {
        site_id: 'BR-New',
        publish_years: [2019],
        first_year: 2019,
        last_year: 2019,
        country: 'BR',
        vegetation_type: 'Grasslands'
      }
    ],
    []
  );

  assert.equal(merged.rows[0].source_label, 'AmeriFlux');
  assert.equal(merged.rows[0].vegetation_type, 'GRA');
  assert.equal(merged.rows[0].search_text.includes('gra'), true);
});

test('FLUXNET2015 API-only rows keep backfilled vegetation through merge and search indexing', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [],
    [
      {
        site_id: 'AR-SLu',
        publish_years: [2002, 2003],
        first_year: 2002,
        last_year: 2003,
        country: 'AR',
        vegetation_type: 'Savannas'
      }
    ]
  );

  assert.equal(merged.rows[0].source_label, 'FLUXNET2015');
  assert.equal(merged.rows[0].network_display, 'AmeriFlux');
  assert.deepEqual(merged.rows[0].network_tokens, ['AmeriFlux']);
  assert.deepEqual(merged.rows[0].source_filter_tags, ['AmeriFlux', 'FLUXNET-2015']);
  assert.equal(merged.rows[0].vegetation_type, 'SAV');
  assert.equal(merged.rows[0].search_text.includes('sav'), true);
  assert.equal(merged.rows[0].search_text.includes('ameriflux'), true);
});

test('AmeriFlux-Shuttle overlap keeps Shuttle vegetation unchanged when API metadata also exists', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'AR-Bal',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AMF',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        vegetation_type: 'CRO',
        download_link: 'https://example.org/ar-bal.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [],
    [
      {
        site_id: 'AR-Bal',
        publish_years: [2012, 2013],
        first_year: 2012,
        last_year: 2013,
        country: 'AR',
        vegetation_type: 'Grasslands'
      }
    ],
    []
  );

  assert.equal(merged.rows[0].source_label, 'AmeriFlux-Shuttle');
  assert.equal(merged.rows[0].vegetation_type, 'CRO');
});

test('Sparse AmeriFlux availability records do not overwrite populated site metadata', () => {
  const [enriched] = hooks.enrichAmeriFluxSitesWithMetadata(
    [
      makeAvailabilitySite('CA-GL4', [2016], {
        site_name: '',
        country: 'CA',
        latitude: '',
        longitude: '',
        vegetation_type: ''
      })
    ],
    hooks.buildAmeriFluxSiteInfoLookup([
      {
        site_id: 'CA-GL4',
        site_name: 'Nine Mile Lighthouse',
        country: 'Canada',
        location_lat: '44.1516',
        location_long: '-76.5559'
      }
    ]),
    {
      'CA-GL4': 'WAT'
    }
  );

  assert.equal(enriched.site_name, 'Nine Mile Lighthouse');
  assert.equal(enriched.country, 'Canada');
  assert.equal(enriched.latitude, 44.1516);
  assert.equal(enriched.longitude, -76.5559);
  assert.equal(enriched.vegetation_type, 'WAT');
  assert.deepEqual(enriched.publish_years, [2016]);
});

test('API-only rows do not fabricate vegetation when authoritative metadata is absent', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [
      {
        site_id: 'US-NoVeg',
        publish_years: [2024],
        first_year: 2024,
        last_year: 2024,
        country: 'US'
      }
    ],
    []
  );

  assert.equal(merged.rows[0].vegetation_type, '');
  assert.equal(merged.rows[0].search_text.includes('gra'), false);
});

test('AmeriFlux download helpers route FLUXNET and BASE to v2, and FLUXNET2015 to v1', () => {
  assert.equal(
    hooks.getDownloadEndpointForProduct('FLUXNET'),
    'https://amfcdn.lbl.gov/api/v2/data_download'
  );
  assert.equal(
    hooks.getDownloadEndpointForProduct('BASE-BADM'),
    'https://amfcdn.lbl.gov/api/v2/data_download'
  );
  assert.equal(
    hooks.getDownloadEndpointForProduct('FLUXNET2015'),
    'https://amfcdn.lbl.gov/api/v1/data_download'
  );

  const v2Payload = hooks.buildV2DownloadPayload(
    ['AR-Bal'],
    'FULLSET',
    'CCBY4.0',
    { user_id: 'user', user_email: 'user@example.org' },
    'FLUXNET'
  );
  assert.equal(v2Payload.intended_use, 'other_research');
  assert.equal(v2Payload.description.includes('Q.E.D. Lab FLUXNET Data Explorer'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(v2Payload, 'agree_policy'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(v2Payload, 'is_test'), false);

  const basePayload = hooks.buildV2DownloadPayload(
    ['US-Base'],
    'FULLSET',
    'CCBY4.0',
    { user_id: 'user', user_email: 'user@example.org' },
    'BASE-BADM'
  );
  assert.equal(basePayload.data_product, 'BASE-BADM');
  assert.equal(basePayload.intended_use, 'other_research');

  const v1Payload = hooks.buildV1DownloadPayload(
    ['CL-Old'],
    'FULLSET',
    'CCBY4.0',
    { user_id: 'user', user_email: 'user@example.org' },
    'FLUXNET2015'
  );
  assert.equal(v1Payload.intended_use, 'QED Lab FLUXNET Data Explorer');
  assert.equal(v1Payload.agree_policy, true);
  assert.equal(Object.prototype.hasOwnProperty.call(v1Payload, 'is_test'), false);
});

test('Bulk tools action helper only activates for multi-site selections', () => {
  assert.equal(hooks.shouldEnableBulkToolsActions(0), false);
  assert.equal(hooks.shouldEnableBulkToolsActions(1), false);
  assert.equal(hooks.shouldEnableBulkToolsActions(2), true);
  assert.equal(hooks.formatSelectedSiteCount(1), '1 selected site');
  assert.equal(hooks.formatSelectedSiteCount(3), '3 selected sites');
});

test('Single-product and dual-product row download helpers stay explicit without duplicating site rows', () => {
  const singleDirectOptions = hooks.buildRowDownloadOptions(
    makeCatalogRow({
      site_id: 'US-Dir',
      site_name: 'Direct Site',
      data_hub: 'AmeriFlux',
      network: 'AmeriFlux',
      source_network: 'AmeriFlux',
      network_display: 'AmeriFlux',
      network_tokens: ['AmeriFlux'],
      surfacedProducts: [
        {
          productFamily: 'FLUXNET',
          siteId: 'US-Dir',
          coverageLabel: '2012-2014',
          exactYears: [2012, 2013, 2014],
          downloadMode: 'direct',
          downloadLink: 'https://example.org/us-dir.zip',
          sourceLabel: 'AmeriFlux-Shuttle',
          source_label: 'AmeriFlux-Shuttle',
          apiDataProduct: 'FLUXNET',
          api_data_product: 'FLUXNET'
        }
      ]
    }),
    true
  );

  assert.equal(singleDirectOptions.length, 1);
  assert.equal(singleDirectOptions[0].displayLabel, 'FLUXNET (ONEFlux-derived)');
  assert.equal(singleDirectOptions[0].actionLabel, 'Download');

  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Dual',
        site_name: 'Dual Site',
        country: 'US',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AmeriFlux',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        first_year: 2018,
        last_year: 2020,
        years: '2018-2020',
        download_link: 'https://example.org/us-dual-fluxnet.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [],
    [makeAvailabilitySite('US-Dual', [2018, 2019, 2020])],
    [],
    [makeAvailabilitySite('US-Dual', [2018, 2019, 2020, 2021])]
  );
  const dualRow = merged.rows[0];
  const dualOptions = hooks.buildRowDownloadOptions(dualRow, true);

  assert.equal(dualRow.surfacedProducts.length, 2);
  assert.deepEqual(
    dualOptions.map((option) => option.displayLabel),
    ['FLUXNET (ONEFlux-derived)', 'BASE (standardized observations)']
  );
  assert.deepEqual(
    dualOptions.map((option) => option.actionLabel),
    ['Download', 'Request BASE URL']
  );
});

test('Table clipboard export includes visible headers, preserves row order, and normalizes cell text', () => {
  const text = hooks.buildTableClipboardText([
    {
      site_id: 'AR-Bal',
      site_name: 'Balcarce\nBA',
      country: 'Argentina',
      latitude: -37.7596,
      longitude: -58.3024,
      data_hub: 'AmeriFlux',
      vegetation_type: 'Grassland  ',
      years: '2012-2013',
      length_years: 2
    },
    {
      site_id: 'US-Blank',
      site_name: '',
      country: 'USA',
      latitude: 'not-a-number',
      longitude: 181,
      data_hub: 'Shuttle',
      vegetation_type: null,
      years: '2010-2010',
      length_years: 1
    }
  ]);

  assert.equal(
    text,
    [
      'Site ID\tSite Name\tCountry\tLat\tLon\tHub\tVeg Type\tYears\tLength',
      'AR-Bal\tBalcarce BA\tArgentina\t-37.76\t-58.30\tAmeriFlux\tGrassland\t2012-2013\t2',
      'US-Blank\t—\tUSA\t—\t—\tShuttle\t—\t2010-2010\t1',
      ''
    ].join('\n')
  );
});

test('Table sort columns place Lat and Lon immediately after Country', () => {
  assert.deepEqual(
    hooks.getSortColumns().map((column) => column.key),
    [
      'site_id',
      'site_name',
      'country',
      'latitude',
      'longitude',
      'data_hub',
      'vegetation_type',
      'years',
      'length_years'
    ]
  );
});

test('Coordinate formatter rounds for display and handles invalid values safely', () => {
  assert.equal(hooks.formatCoordinate(37.87654, -90, 90), '37.88');
  assert.equal(hooks.formatCoordinate('-122.26487', -180, 180), '-122.26');
  assert.equal(hooks.formatCoordinate('', -90, 90), '—');
  assert.equal(hooks.formatCoordinate(181, -180, 180), '—');
});

test('Coordinate sorting uses underlying numeric values rather than formatted strings', () => {
  const lower = {
    _index: 0,
    site_id: 'US-Low',
    data_hub: 'AmeriFlux',
    latitude: '9.9'
  };
  const higher = {
    _index: 1,
    site_id: 'US-High',
    data_hub: 'AmeriFlux',
    latitude: '10.1'
  };
  const missing = {
    _index: 2,
    site_id: 'US-Miss',
    data_hub: 'AmeriFlux',
    latitude: 'bad'
  };

  assert.ok(hooks.compareRows(lower, higher, 'latitude', 'asc') < 0);
  assert.ok(hooks.compareRows(higher, lower, 'latitude', 'asc') > 0);
  assert.ok(hooks.compareRows(lower, missing, 'latitude', 'asc') < 0);
});

test('Site available year counting dedupes overlapping site-year coverage and exposes the dataset max', () => {
  const overlapping = {
    surfacedProducts: [
      { exactYears: [2010, 2011, 2012] },
      { exactYears: [2012, 2013, 2014] }
    ]
  };
  const shorter = makeCatalogRow({
    site_id: 'US-ShortYears',
    first_year: 2020,
    last_year: 2021
  });

  assert.deepEqual(hooks.siteAvailableYears(overlapping), [2010, 2011, 2012, 2013, 2014]);
  assert.equal(hooks.siteAvailableYearCount(overlapping), 5);
  assert.equal(hooks.maxSiteAvailableYearCount([shorter, overlapping]), 5);
});

test('Minimum years filter defaults to 1 and keeps unknown-year request rows only at the default threshold', () => {
  const requestOnlyRow = makeEfdRow({
    first_year: null,
    last_year: null,
    publish_years: [],
    efd_policy_years: [],
    efd_policy_year_count: '',
    efd_policy_first_year: '',
    efd_policy_last_year: '',
    surfacedProducts: [],
    length_years: null
  });

  assert.equal(hooks.normalizeMinimumYearsValue('', 9), 1);
  assert.equal(hooks.minimumYearsFilterMatches(requestOnlyRow, undefined), true);
  assert.equal(hooks.minimumYearsFilterMatches(requestOnlyRow, 1), true);
  assert.equal(hooks.minimumYearsFilterMatches(requestOnlyRow, 2), false);
});

test('EFD rows derive exact coverage years and minimum-length counts from explicit policy-bearing years', () => {
  const row = hooks.mergeCatalogRows([], [], [], [], [], [], [
    makeEfdRow({
      site_id: 'NO-Gap',
      first_year: null,
      last_year: null,
      years: 'Request via EFD',
      length_years: null,
      publish_years: [],
      efd_policy_years: '2001; 2003; 2005',
      efd_policy_year_count: '3',
      efd_policy_first_year: '2001',
      efd_policy_last_year: '2005'
    })
  ]).rows[0];

  assert.deepEqual(row.publish_years, [2001, 2003, 2005]);
  assert.deepEqual(row.efd_policy_years, [2001, 2003, 2005]);
  assert.deepEqual(hooks.siteAvailableYears(row), [2001, 2003, 2005]);
  assert.equal(hooks.siteAvailableYearCount(row), 3);
  assert.equal(row.first_year, 2001);
  assert.equal(row.last_year, 2005);
  assert.equal(row.years, '2001, 2003, 2005');
  assert.equal(row.length_years, 3);
  assert.equal(hooks.minimumYearsFilterMatches(row, 3), true);
  assert.equal(hooks.minimumYearsFilterMatches(row, 4), false);
  assert.equal(hooks.renderSurfacedCoverageHtml(row), '2001, 2003, 2005');
});

test('Minimum years filter excludes sites below the threshold and keeps sites at or above it', () => {
  const shortRow = makeCatalogRow({
    site_id: 'US-Two',
    first_year: 2010,
    last_year: 2011
  });
  const longRow = makeCatalogRow({
    site_id: 'US-Five',
    first_year: 2010,
    last_year: 2014
  });

  assert.equal(hooks.rowMatchesExplorerFilters(shortRow, { minimumYears: 3 }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(longRow, { minimumYears: 3 }), true);
});

test('Year range filter defaults to full inferred bounds and does not exclude sites', () => {
  const rows = [
    makeCatalogRow({ site_id: 'US-Early', first_year: 1997, last_year: 1999, years: '1997-1999' }),
    makeCatalogRow({ site_id: 'US-Late', first_year: 2022, last_year: 2024, years: '2022-2024' }),
    makeCatalogRow({ site_id: 'US-Unknown', first_year: null, last_year: null, years: '', publish_years: [], available_years: [], surfacedProducts: [] })
  ];
  const bounds = hooks.availableYearRangeBounds(rows);
  const defaultRange = hooks.normalizeYearRangeFilter({}, bounds);

  assert.deepEqual(bounds, { start: 1997, end: 2024, hasBounds: true });
  assert.equal(defaultRange.isDefault, true);
  assert.deepEqual(rows.map((row) => hooks.rowMatchesExplorerFilters(row, {
    yearRange: defaultRange,
    yearRangeBounds: bounds
  })), [true, true, true]);
});

test('Year range filter uses overlap logic for intervals', () => {
  const row = makeCatalogRow({
    site_id: 'US-Span',
    first_year: 2005,
    last_year: 2012,
    years: '2005-2012'
  });
  const bounds = { start: 2000, end: 2024, hasBounds: true };

  assert.equal(hooks.yearRangeFilterMatches(row, { start: 2010, end: 2020 }, bounds), true);
  assert.equal(hooks.yearRangeFilterMatches(row, { start: 2015, end: 2020 }, bounds), false);
});

test('Year range filter passes rows when any surfaced product interval overlaps', () => {
  const row = makeCatalogRow({
    site_id: 'US-Multi',
    first_year: 2005,
    last_year: 2020,
    years: 'FLUXNET: 2005-2012 · BASE: 2018-2020',
    surfacedProducts: [
      { firstYear: 2005, lastYear: 2012, exactYears: [] },
      { coverageLabel: '2018–2020', exactYears: [] }
    ]
  });
  const bounds = { start: 2005, end: 2020, hasBounds: true };

  assert.equal(hooks.yearRangeFilterMatches(row, { start: 2016, end: 2017 }, bounds), false);
  assert.equal(hooks.yearRangeFilterMatches(row, { start: 2017, end: 2018 }, bounds), true);
});

test('Year range filter honors explicit year arrays instead of filling gaps', () => {
  const row = makeCatalogRow({
    site_id: 'US-Gap',
    first_year: 2001,
    last_year: 2005,
    years: '2001, 2003, 2005',
    publish_years: [2001, 2003, 2005],
    available_years: [2001, 2003, 2005]
  });
  const bounds = { start: 2001, end: 2005, hasBounds: true };

  assert.deepEqual(hooks.siteAvailableYearIntervals(row), [
    { start: 2001, end: 2001 },
    { start: 2003, end: 2003 },
    { start: 2005, end: 2005 }
  ]);
  assert.equal(hooks.yearRangeFilterMatches(row, { start: 2002, end: 2002 }, bounds), false);
  assert.equal(hooks.yearRangeFilterMatches(row, { start: 2003, end: 2003 }, bounds), true);
});

test('Year range filter excludes missing-year rows only after the range is narrowed', () => {
  const missing = makeCatalogRow({
    site_id: 'US-MissingYears',
    first_year: null,
    last_year: null,
    years: '',
    publish_years: [],
    available_years: [],
    surfacedProducts: []
  });
  const bounds = { start: 2000, end: 2020, hasBounds: true };

  assert.equal(hooks.yearRangeFilterMatches(missing, { start: 2000, end: 2020 }, bounds), true);
  assert.equal(hooks.yearRangeFilterMatches(missing, { start: 2010, end: 2020 }, bounds), false);
});

test('Year range reset normalization restores the full inferred range', () => {
  const rows = [
    makeCatalogRow({ site_id: 'US-Old', first_year: 1999, last_year: 2001, years: '1999-2001' }),
    makeCatalogRow({ site_id: 'US-New', first_year: 2021, last_year: 2024, years: '2021-2024' })
  ];
  const bounds = hooks.availableYearRangeBounds(rows);
  const narrowed = hooks.normalizeYearRangeFilter({ start: 2010, end: 2020 }, bounds);
  const reset = hooks.normalizeYearRangeFilter({ start: null, end: null }, bounds);

  assert.equal(narrowed.isDefault, false);
  assert.deepEqual(reset, {
    start: 1999,
    end: 2024,
    bounds,
    hasBounds: true,
    isDefault: true
  });
});

test('Year range filter composes with minimum years using AND logic', () => {
  const row = makeCatalogRow({
    site_id: 'US-And',
    first_year: 2001,
    last_year: 2005,
    years: '2001-2005'
  });
  const bounds = { start: 2001, end: 2024, hasBounds: true };

  assert.equal(hooks.rowMatchesExplorerFilters(row, {
    minimumYears: 5,
    yearRange: { start: 2004, end: 2010 },
    yearRangeBounds: bounds
  }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(row, {
    minimumYears: 6,
    yearRange: { start: 2004, end: 2010 },
    yearRangeBounds: bounds
  }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(row, {
    minimumYears: 5,
    yearRange: { start: 2010, end: 2020 },
    yearRangeBounds: bounds
  }), false);
});

test('AmeriFlux bulk identity helper prefers explicit input values and otherwise falls back to defaults', () => {
  assert.deepEqual(
    hooks.resolveAmeriFluxBulkIdentity('', ''),
    {
      enteredUserId: '',
      enteredUserEmail: '',
      user_id: 'FluxnetDataExplorer',
      user_email: 'fluxnet@explorer.edu'
    }
  );
  assert.deepEqual(
    hooks.resolveAmeriFluxBulkIdentity(' custom-user ', ' custom@example.org '),
    {
      enteredUserId: 'custom-user',
      enteredUserEmail: 'custom@example.org',
      user_id: 'custom-user',
      user_email: 'custom@example.org'
    }
  );
});

test('Snapshot updated date helper prefers committed metadata fields and falls back cleanly', () => {
  assert.equal(
    hooks.extractSnapshotUpdatedDate({
      snapshot_updated_date: '2026-03-11',
      snapshot_updated_at: '2026-03-12T08:15:00Z'
    }),
    '2026-03-11'
  );
  assert.equal(
    hooks.extractSnapshotUpdatedDate({
      snapshot_updated_at: '2026-03-12T08:15:00Z'
    }),
    '2026-03-12'
  );
  assert.equal(hooks.extractSnapshotUpdatedDate({}), '');
  assert.equal(hooks.snapshotUpdatedDateDisplayText(''), 'unavailable');
});

test('Snapshot refreshed helper separates workflow refresh date from data freshness date', () => {
  assert.equal(
    hooks.extractSnapshotRefreshedDate({
      snapshot_refreshed_date: '2026-04-28',
      snapshot_refreshed_at: '2026-04-28T05:17:00Z',
      snapshot_updated_date: '2026-04-21'
    }),
    '2026-04-28'
  );
  assert.equal(
    hooks.extractSnapshotRefreshedDate({
      snapshot_updated_date: '2026-04-21'
    }),
    '2026-04-21'
  );
  assert.equal(
    hooks.latestSnapshotRefreshedDateFromResults([
      { meta: { snapshot_refreshed_date: '2026-04-27' } },
      { meta: { snapshot_refreshed_date: '2026-04-28' } },
      { meta: { snapshot_updated_date: '2026-04-21' } }
    ]),
    '2026-04-28'
  );
});

test('Snapshot source-status helper surfaces carried-forward sources as a non-blocking warning', () => {
  assert.equal(
    hooks.buildSnapshotSourceStatusWarning({
      source_statuses: {
        AmeriFlux: {
          status: 'carried_forward',
          last_successful_refresh_date: '2026-04-10',
          reason: 'AmeriFlux candidate retained 54 of 321 previously published sites.'
        },
        ICOS: {
          status: 'fresh',
          last_successful_refresh_date: '2026-04-11'
        }
      }
    }),
    'AmeriFlux (2026-04-10) snapshot data is being carried forward from the last validated refresh. Site browsing remains available, but this source may be temporarily stale.'
  );
  assert.equal(hooks.buildSnapshotSourceStatusWarning({}), '');
});

test('Attribution text includes the metadata sentence and uses the shared snapshot date source', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');

  assert.equal(explorerJs.includes('href=\\"mailto:trevorkeenan@berkeley.edu\\"'), true);
  assert.match(
    hooks.buildAttributionText('2026-03-11', '2026-03-12'),
    /Contact TF Keenan \(trevorkeenan@berkeley\.edu\) with any questions/
  );
  assert.match(
    hooks.buildAttributionText('2026-03-11', '2026-03-12'),
    /Funding for the FLUXNET Data Explorer was generously provided by the NSF AccelNet program\./
  );
  assert.match(
    hooks.buildAttributionText('2026-03-11', '2026-03-12'),
    /Explorer refreshed: 2026-03-12\. New data last added: 2026-03-11\./
  );
  assert.match(
    hooks.buildAttributionText('', ''),
    /Explorer refreshed: unavailable\. New data last added: unavailable\./
  );
  assert.equal(hooks.buildAttributionText('2026-03-11', '2026-03-12').includes('Citation and source'), false);
  assert.equal(hooks.buildAttributionText('2026-03-11', '2026-03-12').includes('We appreciate acknowledgement'), false);
});

test('Bulk partition routes overlap rows to Shuttle and AmeriFlux API rows to the AmeriFlux bulk set', () => {
  const selectedRows = [
    { site_id: 'US-Ton', download_mode: 'direct', source_label: '' },
    { site_id: 'AR-Bal', download_mode: 'direct', source_label: 'AmeriFlux-Shuttle' },
    { site_id: 'BR-New', download_mode: 'ameriflux_api', source_label: 'AmeriFlux', api_data_product: 'FLUXNET' },
    { site_id: 'CL-Old', download_mode: 'ameriflux_api', source_label: 'FLUXNET2015', api_data_product: 'FLUXNET2015' }
  ];

  const partition = hooks.partitionRowsByBulkSource(selectedRows);
  assert.deepEqual(partition.shuttleRows.map((row) => row.site_id), ['US-Ton', 'AR-Bal']);
  assert.deepEqual(partition.ameriFluxRows.map((row) => row.site_id), ['BR-New', 'CL-Old']);
});

test('Bulk section visibility helper reflects selected source mix', () => {
  const mixed = hooks.summarizeBulkSelection([
    { site_id: 'US-Ton', download_mode: 'direct' },
    { site_id: 'BR-New', download_mode: 'ameriflux_api' }
  ]);
  assert.equal(mixed.showAllSelectedActions, true);
  assert.equal(mixed.showShuttleSection, true);
  assert.equal(mixed.showAmeriFluxSection, true);

  const shuttleOnly = hooks.summarizeBulkSelection([
    { site_id: 'US-Ton', download_mode: 'direct' }
  ]);
  assert.equal(shuttleOnly.showAllSelectedActions, true);
  assert.equal(shuttleOnly.showShuttleSection, true);
  assert.equal(shuttleOnly.showAmeriFluxSection, false);

  const ameriOnly = hooks.summarizeBulkSelection([
    { site_id: 'BR-New', download_mode: 'ameriflux_api' }
  ]);
  assert.equal(ameriOnly.showAllSelectedActions, true);
  assert.equal(ameriOnly.showShuttleSection, false);
  assert.equal(ameriOnly.showAmeriFluxSection, true);

  const noneSelected = hooks.summarizeBulkSelection([]);
  assert.equal(noneSelected.showAllSelectedActions, false);
  assert.equal(noneSelected.showShuttleSection, false);
  assert.equal(noneSelected.showAmeriFluxSection, false);
});

test('Source filter options expose the full overlapping source tag list while availability options reflect surfaced products', () => {
  const sourceValues = hooks.uniqueSourceFilterValues([
    { source_filter_tags: ['AmeriFlux'] },
    { source_filter_tags: ['AmeriFlux', 'AmeriFlux-Shuttle', 'FLUXNET-Shuttle'] },
    { source_filter_tags: ['ChinaFlux', 'FLUXNET-2015'] },
    { source_filter_tags: ['EFD'] },
    { source_filter_tags: ['FLUXNET-2015'] },
    { source_filter_tags: ['ICOS'] },
    { source_filter_tags: ['JapanFlux'] },
    { source_filter_tags: ['TERN', 'TERN-Shuttle', 'FLUXNET-Shuttle'] }
  ]);
  const availabilityValues = hooks.uniqueAvailabilityFilterValues([
    {
      surfacedProductClassification: 'fluxnet_processed',
      hasProcessedProduct: true,
      primaryProcessedProduct: { productFamily: 'FLUXNET' }
    },
    { surfacedProductClassification: 'other_processed', hasProcessedProduct: false },
    {
      surfacedProductClassification: 'fluxnet_and_other_processed',
      hasProcessedProduct: true,
      primaryProcessedProduct: { productFamily: 'FLUXNET' }
    }
  ]);

  assert.deepEqual(sourceValues, [
    'AmeriFlux',
    'AmeriFlux-Shuttle',
    'ChinaFlux',
    'EFD',
    'FLUXNET-2015',
    'FLUXNET-Shuttle',
    'ICOS',
    'ICOS-Shuttle',
    'JapanFlux',
    'TERN',
    'TERN-Shuttle'
  ]);
  assert.deepEqual(
    availabilityValues,
    ['FLUXNET processed', 'Other processed', 'Sites with both FLUXNET and additional processed years']
  );
});

test('Rows compute overlapping source filter tags from network membership and Shuttle availability', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Shu',
        site_name: 'AmeriFlux Shuttle',
        country: 'US',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AmeriFlux',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      }),
      makeCatalogRow({
        site_id: 'BE-Shu',
        site_name: 'ICOS Shuttle',
        country: 'BE',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      }),
      makeCatalogRow({
        site_id: 'AU-Ter',
        site_name: 'TERN Shuttle',
        country: 'AU',
        data_hub: 'TERN',
        network: 'TERN',
        source_network: 'TERN',
        network_display: 'TERN',
        network_tokens: ['TERN'],
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [
      makeCatalogRow({
        site_id: 'SE-Ico',
        site_name: 'ICOS Direct',
        country: 'SE',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        source_label: 'ICOS',
        source_reason: '',
        source_origin: 'icos_direct'
      })
    ],
    [
      makeAvailabilitySite('US-Shu', [2010, 2011]),
      makeAvailabilitySite('BR-Amf', [2020], {
        site_name: 'AmeriFlux API',
        country: 'BR'
      })
    ],
    [
      makeAvailabilitySite('CL-Leg', [2001], {
        site_name: 'Legacy Site',
        country: 'CL'
      })
    ]
  );
  const bySite = Object.fromEntries(merged.rows.map((row) => [row.site_id, row]));

  assert.deepEqual(bySite['BR-Amf'].source_filter_tags, ['AmeriFlux']);
  assert.deepEqual(bySite['US-Shu'].source_filter_tags, ['AmeriFlux', 'AmeriFlux-Shuttle', 'FLUXNET-Shuttle']);
  assert.deepEqual(bySite['BE-Shu'].source_filter_tags, ['ICOS', 'ICOS-Shuttle', 'FLUXNET-Shuttle']);
  assert.deepEqual(bySite['SE-Ico'].source_filter_tags, ['ICOS']);
  assert.deepEqual(bySite['AU-Ter'].source_filter_tags, ['TERN', 'TERN-Shuttle', 'FLUXNET-Shuttle']);
  assert.equal(bySite['CL-Leg'].network_display, 'AmeriFlux');
  assert.deepEqual(bySite['CL-Leg'].network_tokens, ['AmeriFlux']);
  assert.deepEqual(bySite['CL-Leg'].source_filter_tags, ['AmeriFlux', 'FLUXNET-2015']);
  assert.equal(bySite['CL-Leg'].source_filter_tags.includes('AmeriFlux'), true);
  assert.equal(bySite['CL-Leg'].source_filter_tags.includes('ICOS'), false);
  assert.equal(bySite['CL-Leg'].source_filter_tags.includes('TERN'), false);
});

test('JapanFlux source tags apply only to JapanFlux-direct rows, not Shuttle rows from the JPF network', () => {
  const shuttleJpf = makeCatalogRow({
    site_id: 'JP-Shu',
    site_name: 'JPF Shuttle',
    country: 'JP',
    data_hub: 'ICOS',
    network: 'JPF',
    source_network: 'JPF',
    network_display: 'JapanFlux',
    network_tokens: ['JapanFlux'],
    source_label: '',
    source_reason: '',
    source_origin: 'shuttle'
  });
  const japanFluxRow = makeJapanFluxRow({
    site_id: 'JP-Jpf',
    download_mode: 'direct',
    download_link: 'https://example.org/japanflux.zip',
    source_reason: 'Available from the JapanFlux2024 ADS archive; direct ZIP URL validated automatically.'
  });

  assert.equal(hooks.computeSourceFilterTags(shuttleJpf).includes('JapanFlux'), false);
  assert.deepEqual(hooks.computeSourceFilterTags(japanFluxRow), ['JapanFlux']);
  assert.equal(hooks.rowMatchesExplorerFilters(japanFluxRow, { selectedSource: 'JapanFlux' }), true);
});

test('JapanFlux rows merge after ICOS precedence and keep JapanFlux provenance fields', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'JP-Shu',
        site_name: 'Shuttle Site',
        country: 'JP',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        download_link: 'https://example.org/shuttle.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [
      makeCatalogRow({
        site_id: 'JP-Ico',
        site_name: 'ICOS Site',
        country: 'JP',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        download_link: 'https://example.org/icos.zip',
        source_label: 'ICOS',
        source_reason: '',
        source_origin: 'icos_direct'
      })
    ],
    [
      makeJapanFluxRow({
        site_id: 'JP-Shu',
        site_name: 'Suppressed by Shuttle',
        download_mode: 'direct',
        download_link: 'https://example.org/japanflux-shuttle.zip'
      }),
      makeJapanFluxRow({
        site_id: 'JP-Ico',
        site_name: 'Suppressed by ICOS',
        download_mode: 'direct',
        download_link: 'https://example.org/japanflux-icos.zip'
      }),
      makeJapanFluxRow({
        site_id: 'JP-New',
        site_name: 'JapanFlux Only',
        download_mode: 'direct',
        download_link: 'https://example.org/japanflux-new.zip'
      })
    ],
    [],
    [],
    []
  );
  const bySite = Object.fromEntries(merged.rows.map((row) => [row.site_id, row]));

  assert.equal(merged.japanFluxOnlySites, 1);
  assert.equal(merged.japanFluxSuppressedByHigherPrecedence, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(bySite, 'JP-New'), true);
  assert.equal(bySite['JP-New'].data_hub, 'JapanFlux');
  assert.equal(bySite['JP-New'].source_origin, 'japanflux_direct');
  assert.equal(bySite['JP-New'].source_filter, 'JapanFlux');
  assert.deepEqual(bySite['JP-New'].source_filter_tags, ['JapanFlux']);
  assert.equal(Object.prototype.hasOwnProperty.call(bySite, 'JP-Shu'), true);
  assert.equal(bySite['JP-Shu'].data_hub, 'ICOS');
});

test('JapanFlux-only rows classify as other processed without changing JapanFlux source provenance', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [
      makeJapanFluxRow({
        site_id: 'JP-Only',
        site_name: 'JapanFlux Only',
        download_mode: 'direct',
        download_link: 'https://example.org/japanflux-only.zip'
      })
    ],
    [],
    [],
    []
  );
  const row = merged.rows[0];

  assert.equal(row.surfacedProductClassification, 'other_processed');
  assert.equal(row.processing_lineage, 'other_processed');
  assert.deepEqual(row.availability_filter_labels, ['Other processed']);
  assert.equal(row.source_filter, 'JapanFlux');
  assert.deepEqual(row.source_filter_tags, ['JapanFlux']);
  assert.equal(row.source_label, 'JapanFlux');
});

test('Explicit processing_lineage wins over legacy source fallback, and missing lineage still falls back for older rows', () => {
  assert.equal(
    hooks.resolveProcessingLineage({
      processing_lineage: 'oneflux',
      source_origin: 'japanflux_direct',
      source_label: 'JapanFlux'
    }),
    'oneflux'
  );
  assert.equal(
    hooks.resolveProcessingLineage({
      source_origin: 'japanflux_direct',
      source_label: 'JapanFlux'
    }),
    'other_processed'
  );
  assert.equal(
    hooks.resolveProcessingLineage({
      source_label: 'BASE',
      api_data_product: 'BASE-BADM'
    }),
    'other_processed'
  );
  assert.equal(
    hooks.resolveProcessingLineage({
      source_label: 'EFD',
      source_origin: 'efd',
      download_mode: 'request_page'
    }),
    ''
  );
});

test('JapanFlux landing-page rows stay out of direct bulk downloads and keep explicit row actions', () => {
  const row = makeJapanFluxRow({
    surfacedProducts: [
      {
        productFamily: 'FLUXNET',
        processingLineage: 'other_processed',
        processing_lineage: 'other_processed',
        siteId: 'JP-Lnd',
        coverageLabel: '2015-2017',
        exactYears: [2015, 2016, 2017],
        downloadMode: 'landing_page',
        download_mode: 'landing_page',
        downloadLink: 'https://ads.nipr.ac.jp/dataset/A20240722-001',
        download_link: 'https://ads.nipr.ac.jp/dataset/A20240722-001',
        sourceLabel: 'JapanFlux',
        source_label: 'JapanFlux',
        sourceOrigin: 'japanflux_direct',
        source_origin: 'japanflux_direct',
        apiDataProduct: 'FLUXNET',
        api_data_product: 'FLUXNET'
      }
    ]
  });
  const partition = hooks.partitionRowsByBulkSource([row]);
  const option = hooks.buildRowDownloadOptions(row, true)[0];

  assert.deepEqual(partition.shuttleRows.map((item) => item.site_id || item.siteId), ['JP-Lnd']);
  assert.deepEqual(partition.shuttleDownloadRows, []);
  assert.deepEqual(partition.manualLandingPageRows.map((item) => item.site_id || item.siteId), ['JP-Lnd']);
  assert.equal(option.displayLabel, 'JapanFlux2024');
  assert.equal(option.actionLabel, 'Open landing page');
});

test('JapanFlux direct ZIP rows participate in direct bulk downloads', () => {
  const row = makeJapanFluxRow({
    download_link: 'https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA',
    download_mode: 'direct',
    direct_download_url: 'https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA',
    source_reason: 'Available from the JapanFlux2024 ADS archive; direct ZIP URL validated automatically.',
    surfacedProducts: [
      {
        productFamily: 'FLUXNET',
        processingLineage: 'other_processed',
        processing_lineage: 'other_processed',
        siteId: 'JP-Dir',
        coverageLabel: '2015-2017',
        exactYears: [2015, 2016, 2017],
        downloadMode: 'direct',
        download_mode: 'direct',
        downloadLink: 'https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA',
        download_link: 'https://ads.nipr.ac.jp/api/v1/metadata/A20240722-001/1.00/data/zip/DATA',
        sourceLabel: 'JapanFlux',
        source_label: 'JapanFlux',
        sourceOrigin: 'japanflux_direct',
        source_origin: 'japanflux_direct',
        apiDataProduct: 'FLUXNET',
        api_data_product: 'FLUXNET'
      }
    ]
  });
  const partition = hooks.partitionRowsByBulkSource([row]);
  const option = hooks.buildRowDownloadOptions(row, true)[0];

  assert.deepEqual(partition.shuttleRows.map((item) => item.site_id || item.siteId), ['JP-Dir']);
  assert.deepEqual(partition.shuttleDownloadRows.map((item) => item.site_id || item.siteId), ['JP-Dir']);
  assert.deepEqual(partition.manualLandingPageRows, []);
  assert.equal(option.displayLabel, 'JapanFlux2024');
  assert.equal(option.actionLabel, 'Download');
});

test('EFD rows are only surfaced when no higher-precedence source already represents the site', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({ site_id: 'DE-Dup', source_origin: 'shuttle', source_label: '', source_reason: '' })
    ],
    [
      makeCatalogRow({
        site_id: 'FR-Dup',
        data_hub: 'ICOS',
        source_label: 'ICOS',
        source_origin: 'icos_direct'
      })
    ],
    [
      makeJapanFluxRow({ site_id: 'JP-Dup' })
    ],
    [
      makeAvailabilitySite('US-Dup', [2019], { site_name: 'Ameri Duplicate', country: 'US' })
    ],
    [
      makeAvailabilitySite('CL-Dup', [2005], { site_name: 'Legacy Duplicate', country: 'CL' })
    ],
    [
      makeAvailabilitySite('FI-Dup', [2010], { site_name: 'BASE Duplicate', country: 'FI' })
    ],
    [
      makeEfdRow({ site_id: 'DE-Dup', site_name: 'Suppressed by Shuttle' }),
      makeEfdRow({ site_id: 'FR-Dup', site_name: 'Suppressed by ICOS' }),
      makeEfdRow({ site_id: 'JP-Dup', site_name: 'Suppressed by JapanFlux' }),
      makeEfdRow({ site_id: 'US-Dup', site_name: 'Suppressed by AmeriFlux' }),
      makeEfdRow({ site_id: 'CL-Dup', site_name: 'Suppressed by FLUXNET2015' }),
      makeEfdRow({ site_id: 'FI-Dup', site_name: 'Suppressed by BASE' }),
      makeEfdRow({ site_id: 'NO-Efd', site_name: 'Norway Request Site', network: 'EuroFlux', source_network: 'EuroFlux', network_display: 'EuroFlux', network_tokens: ['EuroFlux'] })
    ]
  );
  const bySite = Object.fromEntries(merged.rows.map((row) => [row.site_id, row]));

  assert.equal(merged.efdTotalSites, 7);
  assert.equal(merged.efdSuppressedByHigherPrecedence, 6);
  assert.equal(merged.efdOnlySites, 1);
  assert.equal(bySite['NO-Efd'].source_label, 'EFD');
  assert.equal(bySite['NO-Efd'].download_mode, 'request_page');
  assert.equal(bySite['NO-Efd'].download_link, 'https://www.europe-fluxdata.eu/home/data/request-data');
  assert.equal(bySite['NO-Efd'].years, '2001-2002');
  assert.deepEqual(bySite['NO-Efd'].publish_years, [2001, 2002]);
  assert.equal(bySite['NO-Efd'].length_years, 2);
  assert.deepEqual(bySite['NO-Efd'].source_filter_tags, ['EFD']);
  assert.equal(bySite['NO-Efd'].surfacedProductClassification, 'other_processed');
  assert.deepEqual(bySite['NO-Efd'].availability_filter_labels, ['Other processed']);
  assert.equal(bySite['DE-Dup'].source_label, '');
  assert.equal(bySite['FR-Dup'].source_label, 'ICOS');
  assert.equal(bySite['JP-Dup'].source_label, 'JapanFlux');
  assert.equal(bySite['US-Dup'].source_label, 'AmeriFlux');
  assert.equal(bySite['CL-Dup'].source_label, 'FLUXNET2015');
  assert.equal(bySite['FI-Dup'].source_label, 'BASE');
});

test('EFD rows render request-only actions and stay out of direct bulk downloads', () => {
  const row = makeEfdRow();
  const partition = hooks.partitionRowsByBulkSource([row]);
  const summary = hooks.summarizeBulkSelection([row]);
  const option = hooks.buildRowDownloadOptions(row, true)[0];

  assert.deepEqual(partition.shuttleRows, []);
  assert.deepEqual(partition.shuttleDownloadRows, []);
  assert.deepEqual(partition.manualLandingPageRows, []);
  assert.deepEqual(partition.requestOnlyRows.map((item) => item.site_id || item.siteId), ['DE-Efd']);
  assert.deepEqual(partition.ameriFluxRows, []);
  assert.equal(summary.showAllSelectedActions, false);
  assert.equal(summary.showShuttleSection, false);
  assert.equal(summary.showAmeriFluxSection, false);
  assert.equal(summary.requestOnlyCount, 1);
  assert.equal(option.actionLabel, 'Request via EFD');
  assert.equal(option.downloadLink, 'https://www.europe-fluxdata.eu/home/data/request-data');
  assert.match(option.title, /Known EFD data record/);
  assert.match(option.title, /current direct download is not implied/);
});

test('EFD rows classify as other processed without being mislabeled as FLUXNET or BASE', () => {
  const row = hooks.mergeCatalogRows([], [], [], [], [], [], [makeEfdRow({ site_id: 'SE-Efd' })]).rows[0];

  assert.equal(row.source_label, 'EFD');
  assert.equal(row.surfacedProductClassification, 'other_processed');
  assert.equal(row.hasFluxnetAvailable, false);
  assert.deepEqual(row.availability_filter_labels, ['Other processed']);
  assert.deepEqual(hooks.uniqueAvailabilityFilterValues([row]), ['Other processed']);
  assert.deepEqual(hooks.siteAvailableYears(row), [2001, 2002]);
  assert.equal(hooks.rowMatchesExplorerFilters(row, { selectedSource: 'EFD' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(row, { selectedSource: 'ICOS' }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(row, { selectedAvailability: 'FLUXNET processed' }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(row, { selectedAvailability: 'Other processed' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(row, { minimumYears: 2 }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(row, { minimumYears: 3 }), false);
  assert.equal(hooks.getSurfacedProductsForRow(row).length, 0);
  assert.equal(hooks.renderSurfacedCoverageHtml(row), '2001-2002');
  assert.equal(hooks.renderSurfacedCoverageHtml(row).includes('BASE'), false);
  assert.equal(hooks.renderSurfacedCoverageHtml(row).includes('FLUXNET'), false);
});

test('FLUXNET2015 supplemental rows infer regional networks from country while retaining FLUXNET-2015 source tags', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [],
    [
      makeAvailabilitySite('BR-Leg', [2001], { site_name: 'Brazil Legacy', country: 'Brazil' }),
      makeAvailabilitySite('DE-Leg', [2002], { site_name: 'Germany Legacy', country: 'Germany' }),
      makeAvailabilitySite('RU-Leg', [2003], { site_name: 'Russia Legacy', country: 'Russia' }),
      makeAvailabilitySite('ZA-Leg', [2004], { site_name: 'South Africa Legacy', country: 'South Africa' }),
      makeAvailabilitySite('AU-Leg', [2005], { site_name: 'Australia Legacy', country: 'Australia' }),
      makeAvailabilitySite('NZ-Leg', [2006], { site_name: 'New Zealand Legacy', country: 'New Zealand' }),
      makeAvailabilitySite('CN-Leg', [2007], { site_name: 'China Legacy', country: 'China' }),
      makeAvailabilitySite('XX-Leg', [2008], { site_name: 'Unknown Legacy', country: 'Unknownland' })
    ]
  );
  const bySite = Object.fromEntries(merged.rows.map((row) => [row.site_id, row]));

  assert.equal(bySite['BR-Leg'].network_display, 'AmeriFlux');
  assert.deepEqual(bySite['BR-Leg'].source_filter_tags, ['AmeriFlux', 'FLUXNET-2015']);
  assert.equal(bySite['BR-Leg'].processing_lineage, 'oneflux');
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['BR-Leg'], { selectedSource: 'AmeriFlux' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['BR-Leg'], { selectedSource: 'FLUXNET-2015' }), true);

  assert.equal(bySite['DE-Leg'].network_display, 'ICOS');
  assert.deepEqual(bySite['DE-Leg'].source_filter_tags, ['ICOS', 'FLUXNET-2015']);
  assert.equal(bySite['DE-Leg'].is_icos, false);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['DE-Leg'], { selectedSource: 'ICOS' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['DE-Leg'], { selectedSource: 'FLUXNET-2015' }), true);

  assert.equal(bySite['RU-Leg'].network_display, 'ICOS');
  assert.deepEqual(bySite['RU-Leg'].source_filter_tags, ['ICOS', 'FLUXNET-2015']);

  assert.equal(bySite['ZA-Leg'].network_display, 'ICOS');
  assert.deepEqual(bySite['ZA-Leg'].source_filter_tags, ['ICOS', 'FLUXNET-2015']);

  assert.equal(bySite['AU-Leg'].network_display, 'TERN');
  assert.deepEqual(bySite['AU-Leg'].source_filter_tags, ['TERN', 'FLUXNET-2015']);

  assert.equal(bySite['NZ-Leg'].network_display, 'TERN');
  assert.deepEqual(bySite['NZ-Leg'].source_filter_tags, ['TERN', 'FLUXNET-2015']);

  assert.equal(bySite['CN-Leg'].network_display, 'ChinaFlux');
  assert.deepEqual(bySite['CN-Leg'].network_tokens, ['ChinaFlux']);
  assert.deepEqual(bySite['CN-Leg'].source_filter_tags, ['ChinaFlux', 'FLUXNET-2015']);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['CN-Leg'], { selectedSource: 'ChinaFlux' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['CN-Leg'], { selectedSource: 'FLUXNET-2015' }), true);

  assert.equal(bySite['XX-Leg'].network_display, '');
  assert.deepEqual(bySite['XX-Leg'].network_tokens, []);
  assert.deepEqual(bySite['XX-Leg'].source_filter_tags, ['FLUXNET-2015']);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['XX-Leg'], { selectedSource: 'AmeriFlux' }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['XX-Leg'], { selectedSource: 'ICOS' }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['XX-Leg'], { selectedSource: 'ChinaFlux' }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['XX-Leg'], { selectedSource: 'FLUXNET-2015' }), true);
});

test('Filter controls use compact multiselects and a shared years row in the explorer markup', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.css'), 'utf8');
  const sourceIndex = explorerJs.indexOf('role: "source-filter"');
  const availabilityIndex = explorerJs.indexOf('role: "availability-filter"');
  const vegetationIndex = explorerJs.indexOf('role: "vegetation-filter"');
  const yearsRowIndex = explorerJs.indexOf('shuttle-explorer__years-row');
  const yearRangeIndex = explorerJs.indexOf('label for=\\"shuttle-year-range-start\\">Years:');
  const minimumYearsIndex = explorerJs.indexOf('label for=\\"shuttle-minimum-years\\">Min length:');

  assert.notEqual(sourceIndex, -1);
  assert.equal(explorerJs.includes('filterKey: "selectedSources"'), true);
  assert.notEqual(availabilityIndex, -1);
  assert.equal(explorerJs.includes('filterKey: "selectedAvailabilities"'), true);
  assert.equal(explorerJs.includes('data-role=\\"multi-toggle\\"'), true);
  assert.equal(explorerJs.includes('data-role=\\"multi-all\\"'), true);
  assert.equal(explorerJs.includes('data-role=\\"multi-options\\"'), true);
  assert.equal(explorerJs.includes('shuttle-explorer__multi-option-label'), true);
  assert.equal(explorerJs.includes('label.appendChild(document.createTextNode(" "))'), false);
  assert.equal(explorerJs.includes('allLabel: "All Veg types"'), true);
  assert.equal(explorerJs.includes('shuttle-explorer__years-row'), true);
  assert.equal(explorerCss.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);'), true);
  assert.equal(explorerCss.includes('align-items: center;'), true);
  assert.equal(explorerCss.includes('overflow-x: hidden;'), true);
  assert.equal(explorerCss.includes('.shuttle-explorer__field .shuttle-explorer__multi-option input[type="checkbox"]'), true);
  assert.equal(explorerCss.includes('gap: 0.4rem;'), true);
  assert.equal(explorerCss.includes('overflow-wrap: anywhere;'), true);
  assert.equal(explorerJs.includes('type=\\"range\\" min=\\"1\\" max=\\"1\\" step=\\"1\\" value=\\"1\\" data-role=\\"minimum-years-filter\\"'), true);
  assert.equal(explorerJs.includes('label for=\\"shuttle-year-range-start\\">Years:'), true);
  assert.equal(explorerJs.includes('data-role=\\"year-range-start-filter\\" aria-label=\\"Start year\\"'), true);
  assert.equal(explorerJs.includes('data-role=\\"year-range-end-filter\\" aria-label=\\"End year\\"'), true);
  assert.equal(availabilityIndex < sourceIndex, true);
  assert.equal(minimumYearsIndex > vegetationIndex, true);
  assert.equal(yearsRowIndex < minimumYearsIndex, true);
  assert.equal(minimumYearsIndex < yearRangeIndex, true);
  assert.equal(explorerJs.includes('data-role=\\"hub-filters\\"'), false);
});

test('Known-sites toggle and legend render inside the map control panel', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.css'), 'utf8');
  const mapShellIndex = explorerJs.indexOf('shuttle-explorer__map-shell');
  const panelIndex = explorerJs.indexOf('shuttle-explorer__map-control-panel');
  const toggleIndex = explorerJs.indexOf('data-role=\\"known-sites-toggle\\"', panelIndex);
  const legendIndex = explorerJs.indexOf('buildKnownSitesLegendHtml()', panelIndex);

  assert.notEqual(mapShellIndex, -1);
  assert.notEqual(panelIndex, -1);
  assert.equal(mapShellIndex < panelIndex, true);
  assert.equal(panelIndex < toggleIndex, true);
  assert.equal(toggleIndex < legendIndex, true);
  assert.equal(explorerJs.includes('shuttle-explorer__map-controls'), false);
  assert.equal(explorerCss.includes('.shuttle-explorer__map-control-panel {'), true);
  assert.equal(explorerCss.includes('bottom: 10px;'), true);
  assert.equal(explorerCss.includes('.shuttle-explorer__map-controls {'), false);
});

test('Reset filters button renders inside the map action group beside reset map view', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.css'), 'utf8');
  const mapActionsIndex = explorerJs.indexOf('shuttle-explorer__map-actions');
  const resetGroupIndex = explorerJs.indexOf('shuttle-explorer__map-reset-actions', mapActionsIndex);
  const resetFiltersIndex = explorerJs.indexOf('data-role=\\"reset\\"', resetGroupIndex);
  const resetMapIndex = explorerJs.indexOf('data-role=\\"reset-map-view\\"', resetGroupIndex);
  const downloadCsvIndex = explorerJs.indexOf('data-role=\\"download-known-sites-csv\\"', resetGroupIndex);

  assert.notEqual(mapActionsIndex, -1);
  assert.notEqual(resetGroupIndex, -1);
  assert.notEqual(resetFiltersIndex, -1);
  assert.notEqual(resetMapIndex, -1);
  assert.equal(mapActionsIndex < resetGroupIndex, true);
  assert.equal(resetGroupIndex < resetFiltersIndex, true);
  assert.equal(resetFiltersIndex < resetMapIndex, true);
  assert.equal(resetMapIndex < downloadCsvIndex, true);
  assert.equal((explorerJs.match(/data-role=\\"reset\\"/g) || []).length, 1);
  assert.equal(explorerJs.includes('data-role=\\"empty-reset\\"'), false);
  assert.equal(explorerJs.includes('No matching sites. <button'), false);
  assert.equal(explorerJs.includes('data-role=\\"summary-row\\"'), false);
  assert.equal(explorerJs.includes('shuttle-explorer__filter-actions'), false);
  assert.equal(explorerCss.includes('.shuttle-explorer__map-reset-actions {'), true);
  assert.equal(explorerCss.includes('flex-wrap: nowrap;'), true);
  assert.equal(explorerCss.includes('width: max-content;'), true);
  assert.equal(explorerCss.includes('.shuttle-explorer__filter-actions'), false);
});

test('Reset filters synchronizes visible multiselect state without resetting the map view', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const syncStart = explorerJs.indexOf('Explorer.prototype.syncMultiSelectFilterControl');
  const applyStart = explorerJs.indexOf('Explorer.prototype.applyMultiSelectFilter');
  const applyEnd = explorerJs.indexOf('Explorer.prototype.bindMultiSelectFilter', applyStart);
  const resetStart = explorerJs.indexOf('Explorer.prototype.resetFilters');
  const resetEnd = explorerJs.indexOf('Explorer.prototype.getSelectedRows', resetStart);
  const mapResetStart = explorerJs.indexOf('Explorer.prototype.resetMapView');
  const mapResetEnd = explorerJs.indexOf('Explorer.prototype.buildMapPopupHtml', mapResetStart);
  const syncSegment = explorerJs.slice(syncStart, applyStart);
  const applySegment = explorerJs.slice(applyStart, applyEnd);
  const resetSegment = explorerJs.slice(resetStart, resetEnd);
  const mapResetSegment = explorerJs.slice(mapResetStart, mapResetEnd);

  assert.notEqual(syncStart, -1);
  assert.notEqual(applyStart, -1);
  assert.notEqual(resetStart, -1);
  assert.notEqual(mapResetStart, -1);
  assert.equal(syncSegment.includes('input.checked = !!selectedLookup[String(input.value || "")];'), true);
  assert.equal(syncSegment.includes('allInput.checked = selected.length === 0;'), true);
  assert.equal(syncSegment.includes('summary.textContent = filterSelectionLabel(selected, optionList, allLabel, pluralLabel);'), true);
  assert.equal(syncSegment.includes('summary.title = summary.textContent;'), true);
  assert.equal(applySegment.includes('this.syncMultiSelectFilterControl(container);'), true);
  assert.equal(resetSegment.includes('this.state.selectedSources = [];'), true);
  assert.equal(resetSegment.includes('this.state.selectedVegetations = [];'), true);
  assert.equal(resetSegment.includes('this.syncMultiSelectFilterControls();'), true);
  assert.equal(resetSegment.includes('this.syncMinimumYearsFilterControl();'), true);
  assert.equal(resetSegment.includes('this.syncYearRangeFilterControl(false);'), true);
  assert.equal(mapResetSegment.includes('this.resetFilters()'), false);
  assert.equal(mapResetSegment.includes('syncMultiSelectFilterControls'), false);
});

test('Duplicated external Showing X of Y site summary copy is no longer rendered', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');

  assert.equal(explorerJs.includes('Showing " + filtered + " of " + total + " sites.'), false);
  assert.equal(explorerJs.includes('Showing " + filtered + " of " + total + " records.'), false);
  assert.equal(explorerJs.includes('data-role=\\"summary\\"'), false);
});

test('FLUXNET processed includes both ONEFlux-only and hybrid rows, while other availability labels stay specific', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [
      makeCatalogRow({
        site_id: 'BE-Ico',
        site_name: 'ICOS Site',
        country: 'BE',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        first_year: 2001,
        last_year: 2002,
        years: '2001-2002',
        download_link: 'https://example.org/be-ico.zip',
        source_label: 'ICOS',
        source_reason: '',
        source_origin: 'icos_direct'
      })
    ],
    [
      makeAvailabilitySite('US-Pro', [2010, 2011]),
      makeAvailabilitySite('US-Add', [2015, 2016])
    ],
    [],
    [
      makeAvailabilitySite('US-Add', [2015, 2016, 2017]),
      makeAvailabilitySite('US-Base', [2020, 2021])
    ]
  );
  const bySite = Object.fromEntries(merged.rows.map((row) => [row.site_id, row]));

  assert.equal(hooks.rowMatchesExplorerFilters(bySite['US-Pro'], { selectedAvailability: 'FLUXNET processed' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['US-Add'], { selectedAvailability: 'FLUXNET processed' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['US-Base'], { selectedAvailability: 'FLUXNET processed' }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['US-Add'], { selectedAvailability: 'Sites with both FLUXNET and additional processed years' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['US-Pro'], { selectedAvailability: 'Sites with both FLUXNET and additional processed years' }), false);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['US-Base'], { selectedAvailability: 'Other processed' }), true);
  assert.equal(hooks.rowMatchesExplorerFilters(bySite['US-Add'], { selectedAvailability: 'Other processed' }), false);
  assert.equal(bySite['US-Pro'].surfacedProductClassification, 'fluxnet_processed');
  assert.equal(bySite['US-Add'].surfacedProductClassification, 'fluxnet_and_other_processed');
  assert.equal(bySite['US-Base'].surfacedProductClassification, 'other_processed');
  assert.equal(bySite['US-Pro'].processing_lineage, 'oneflux');
  assert.equal(bySite['US-Base'].processing_lineage, 'other_processed');
});

test('Source and Availability filters compose for AmeriFlux provenance with FLUXNET-processed availability', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [
      makeCatalogRow({
        site_id: 'BE-Ico',
        site_name: 'ICOS Site',
        country: 'BE',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        first_year: 2001,
        last_year: 2002,
        years: '2001-2002',
        download_link: 'https://example.org/be-ico.zip',
        source_label: 'ICOS',
        source_reason: '',
        source_origin: 'icos_direct'
      })
    ],
    [
      makeAvailabilitySite('US-Pro', [2010, 2011]),
      makeAvailabilitySite('US-Add', [2015, 2016])
    ],
    [],
    [
      makeAvailabilitySite('US-Add', [2015, 2016, 2017]),
      makeAvailabilitySite('US-Base', [2020, 2021])
    ]
  );

  const matchingSiteIds = merged.rows
    .filter((row) => hooks.rowMatchesExplorerFilters(row, {
      selectedSource: 'AmeriFlux',
      selectedAvailability: 'FLUXNET processed'
    }))
    .map((row) => row.site_id)
    .sort();

  assert.deepEqual(matchingSiteIds, ['US-Add', 'US-Pro']);
});

test('Categorical multiselect filters use OR within a category and AND across categories', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [
      makeCatalogRow({
        site_id: 'BE-Ico',
        site_name: 'ICOS Site',
        country: 'BE',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        vegetation_type: 'ENF',
        first_year: 2001,
        last_year: 2005,
        years: '2001-2005',
        download_link: 'https://example.org/be-ico.zip',
        source_label: 'ICOS',
        source_reason: '',
        source_origin: 'icos_direct'
      })
    ],
    [
      makeCatalogRow({
        site_id: 'US-Ami',
        site_name: 'AmeriFlux Site',
        country: 'US',
        data_hub: 'AmeriFlux',
        network: 'AMF',
        source_network: 'AMF',
        network_display: 'AmeriFlux',
        network_tokens: ['AMF', 'AmeriFlux'],
        vegetation_type: 'GRA',
        first_year: 2010,
        last_year: 2012,
        years: '2010-2012',
        download_link: 'https://example.org/us-ami.zip',
        source_label: 'AmeriFlux',
        source_reason: '',
        source_origin: 'ameriflux'
      })
    ],
    [],
    [],
    []
  );
  const rows = merged.rows;
  const beCountry = rows.find((row) => row.site_id === 'BE-Ico').country;
  const matchingSources = rows
    .filter((row) => hooks.rowMatchesExplorerFilters(row, {
      selectedSources: ['AmeriFlux', 'ICOS']
    }))
    .map((row) => row.site_id)
    .sort();
  const sourceAndCountry = rows
    .filter((row) => hooks.rowMatchesExplorerFilters(row, {
      selectedSources: ['AmeriFlux', 'ICOS'],
      selectedCountries: [beCountry]
    }))
    .map((row) => row.site_id);
  const sourceAndVegetation = rows
    .filter((row) => hooks.rowMatchesExplorerFilters(row, {
      selectedSources: ['AmeriFlux', 'ICOS'],
      selectedVegetations: ['ENF', 'DBF']
    }))
    .map((row) => row.site_id);

  assert.deepEqual(matchingSources, ['BE-Ico', 'US-Ami']);
  assert.deepEqual(sourceAndCountry, ['BE-Ico']);
  assert.deepEqual(sourceAndVegetation, ['BE-Ico']);
  assert.equal(
    hooks.rowMatchesExplorerFilters(rows[0], {
      selectedSources: ['AmeriFlux'],
      selectedCountries: ['BE', 'US']
    }),
    false
  );
});

test('Hub checkbox state is ignored after the hub UI removal', () => {
  const row = makeCatalogRow({
    site_id: 'US-Hub',
    data_hub: 'AmeriFlux',
    source_label: 'AmeriFlux',
    source_origin: 'ameriflux',
    network_tokens: ['AMF'],
    country: 'US',
    vegetation_type: 'GRA',
    first_year: 2010,
    last_year: 2011,
    years: '2010-2011'
  });

  assert.equal(hooks.rowMatchesExplorerFilters(row, { selectedHubs: { AmeriFlux: false } }), true);
});

test('Multiselect labels summarize all, short, and long selections compactly', () => {
  const options = [
    { value: 'AmeriFlux', label: 'AmeriFlux' },
    { value: 'ICOS', label: 'ICOS' },
    { value: 'JapanFlux', label: 'JapanFlux' }
  ];

  assert.equal(hooks.filterSelectionLabel([], options, 'All sources', 'sources'), 'All sources');
  assert.equal(hooks.filterSelectionLabel(['AmeriFlux', 'ICOS'], options, 'All sources', 'sources'), 'AmeriFlux, ICOS');
  assert.equal(hooks.filterSelectionLabel(['AmeriFlux', 'ICOS', 'JapanFlux'], options, 'All sources', 'sources'), '3 sources');
});

test('Minimum years filter composes with existing source and availability filters', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [
      makeCatalogRow({
        site_id: 'BE-Ico',
        site_name: 'ICOS Site',
        country: 'BE',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        first_year: 2001,
        last_year: 2005,
        years: '2001-2005',
        download_link: 'https://example.org/be-ico.zip',
        source_label: 'ICOS',
        source_reason: '',
        source_origin: 'icos_direct'
      })
    ],
    [],
    [],
    []
  );
  const row = merged.rows[0];

  assert.equal(
    hooks.rowMatchesExplorerFilters(row, {
      selectedSource: 'ICOS',
      selectedAvailability: 'FLUXNET processed',
      minimumYears: 5
    }),
    true
  );
  assert.equal(
    hooks.rowMatchesExplorerFilters(row, {
      selectedSource: 'ICOS',
      selectedAvailability: 'FLUXNET processed',
      minimumYears: 6
    }),
    false
  );
});

test('Hybrid availability filter isolates sites with FLUXNET and additional processed years', () => {
  const merged = hooks.mergeCatalogRows(
    [],
    [],
    [
      makeAvailabilitySite('US-Pro', [2010, 2011]),
      makeAvailabilitySite('US-Add', [2015, 2016])
    ],
    [],
    [
      makeAvailabilitySite('US-Add', [2015, 2016, 2017]),
      makeAvailabilitySite('US-Base', [2020, 2021])
    ]
  );

  const matchingSiteIds = merged.rows
    .filter((row) => hooks.rowMatchesExplorerFilters(row, {
      selectedAvailability: 'Sites with both FLUXNET and additional processed years'
    }))
    .map((row) => row.site_id)
    .sort();

  assert.deepEqual(matchingSiteIds, ['US-Add']);
});

test('FLUXNET-Shuttle source filtering includes Shuttle-available AmeriFlux, ICOS, and TERN rows', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Shu',
        site_name: 'AmeriFlux Shuttle',
        country: 'US',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AmeriFlux',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      }),
      makeCatalogRow({
        site_id: 'BE-Shu',
        site_name: 'ICOS Shuttle',
        country: 'BE',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      }),
      makeCatalogRow({
        site_id: 'AU-Ter',
        site_name: 'TERN Shuttle',
        country: 'AU',
        data_hub: 'TERN',
        network: 'TERN',
        source_network: 'TERN',
        network_display: 'TERN',
        network_tokens: ['TERN'],
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [
      makeCatalogRow({
        site_id: 'SE-Ico',
        site_name: 'ICOS Direct',
        country: 'SE',
        data_hub: 'ICOS',
        network: 'FLX',
        source_network: 'FLX',
        network_display: 'FLX',
        network_tokens: ['FLX'],
        source_label: 'ICOS',
        source_reason: '',
        source_origin: 'icos_direct'
      })
    ],
    [
      makeAvailabilitySite('US-Shu', [2010, 2011])
    ],
    [
      makeAvailabilitySite('CL-Leg', [2001], {
        site_name: 'Legacy Site',
        country: 'CL'
      })
    ]
  );

  const matchingSiteIds = merged.rows
    .filter((row) => hooks.rowMatchesExplorerFilters(row, {
      selectedSource: 'FLUXNET-Shuttle',
      selectedAvailability: ''
    }))
    .map((row) => row.site_id)
    .sort();

  assert.deepEqual(matchingSiteIds, ['AU-Ter', 'BE-Shu', 'US-Shu']);
});

test('Vegetation filter values include only canonical codes after mixed-source normalization', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-GRA',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AMF',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        vegetation_type: 'GRA',
        download_link: 'https://example.org/us-gra.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [
      makeCatalogRow({
        site_id: 'AT-Gra',
        vegetation_type: 'Grasslands',
        download_link: 'https://example.org/at-gra.zip'
      }),
      makeCatalogRow({
        site_id: 'US-Urb',
        vegetation_type: 'Urban and Built-up lands',
        download_link: 'https://example.org/us-urb.zip'
      }),
      makeCatalogRow({
        site_id: 'US-Urb-2',
        vegetation_type: 'urban and built up lands',
        download_link: 'https://example.org/us-urb-2.zip'
      })
    ],
    [],
    []
  );

  assert.deepEqual(hooks.uniqueVegetationFilterValues(merged.rows), ['GRA', 'URB']);
});

test('Vegetation display labels map canonical codes to full IGBP names for dropdown use', () => {
  assert.equal(hooks.vegetationDisplayLabel('GRA'), 'Grasslands');
  assert.equal(hooks.vegetationDisplayLabel('ENF'), 'Evergreen Needleleaf Forests');
  assert.equal(hooks.vegetationDisplayLabel('CVM'), 'Cropland/Natural Vegetation Mosaics');
  assert.equal(hooks.vegetationDisplayLabel('unknown-code'), 'unknown-code');
});

test('Vegetation filter options use full names, preserve canonical values, and avoid duplicates across sources', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Shu',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AMF',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        vegetation_type: 'GRA',
        download_link: 'https://example.org/us-shu.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      }),
      makeCatalogRow({
        site_id: 'AU-Ter',
        data_hub: 'TERN',
        network: 'TERN',
        source_network: 'TERN',
        network_display: 'TERN',
        network_tokens: ['TERN'],
        vegetation_type: 'Grasslands',
        download_link: 'https://example.org/au-ter.zip',
        source_label: '',
        source_reason: '',
        source_origin: 'shuttle'
      })
    ],
    [
      makeCatalogRow({
        site_id: 'AT-Ico',
        data_hub: 'ICOS',
        vegetation_type: 'grasslands',
        download_link: 'https://example.org/at-ico.zip'
      }),
      makeCatalogRow({
        site_id: 'SE-Enf',
        data_hub: 'ICOS',
        vegetation_type: 'ENF',
        download_link: 'https://example.org/se-enf.zip'
      })
    ],
    [
      {
        site_id: 'BR-Amf',
        publish_years: [2021],
        first_year: 2021,
        last_year: 2021,
        country: 'BR',
        vegetation_type: 'Grasslands'
      }
    ],
    []
  );

  const options = hooks.buildVegetationFilterOptions(merged.rows);
  const grasslandsOption = options.find((option) => option.label === 'Grasslands');

  assert.deepEqual(options, [
    { value: 'ENF', label: 'Evergreen Needleleaf Forests' },
    { value: 'GRA', label: 'Grasslands' }
  ]);
  assert.deepEqual(grasslandsOption, { value: 'GRA', label: 'Grasslands' });
  assert.deepEqual(
    merged.rows
      .filter((row) => row.vegetation_type === grasslandsOption.value)
      .map((row) => row.site_id)
      .sort(),
    ['AT-Ico', 'AU-Ter', 'BR-Amf', 'US-Shu']
  );
});

test('Table-style output keeps canonical vegetation codes rather than dropdown display labels', () => {
  const text = hooks.buildTableClipboardText([
    {
      site_id: 'US-Gra',
      site_name: 'Grass Site',
      country: 'USA',
      data_hub: 'AmeriFlux',
      vegetation_type: 'GRA',
      years: '2012-2013',
      length_years: 2
    }
  ]);

  assert.match(text, /\tGRA\t2012-2013\t2/);
  assert.equal(text.includes('Grasslands'), false);
});

test('Coordinate lookup enriches JSON rows from the CSV snapshot without duplicating metadata', () => {
  const csvRows = [
    {
      data_hub: 'AmeriFlux',
      site_id: 'AR-CCg',
      download_link: 'https://example.org/ar-ccg.zip',
      location_lat: '-35.9244',
      location_long: '-61.1855'
    }
  ];
  const jsonRows = [
    {
      data_hub: 'AmeriFlux',
      site_id: 'AR-CCg',
      site_name: 'Carlos Casares grassland',
      download_link: 'https://example.org/ar-ccg.zip'
    },
    {
      data_hub: 'AmeriFlux',
      site_id: 'BR-NoCoord',
      site_name: 'No Coordinates',
      download_link: 'https://example.org/br-nocoord.zip'
    }
  ];

  const lookup = hooks.buildCoordinateLookup(csvRows);
  const enriched = hooks.enrichRowsWithCoordinateLookup(jsonRows, lookup);

  assert.deepEqual(lookup, {
    'AmeriFlux|AR-CCg|https://example.org/ar-ccg.zip': {
      location_lat: -35.9244,
      location_long: -61.1855
    }
  });
  assert.equal(enriched[0].location_lat, -35.9244);
  assert.equal(enriched[0].location_long, -61.1855);
  assert.equal(enriched[1].location_lat, undefined);
  assert.equal(enriched[1].location_long, undefined);
});

test('AmeriFlux site info lookup enriches API availability rows by normalized SITE_ID', () => {
  const rawSiteInfoRows = [
    {
      site_id: 'AR-BAL',
      site_name: 'Balcarce BA',
      country: 'Argentina',
      location_lat: '-37.7596',
      location_long: '-58.3024'
    }
  ];
  const availabilitySites = [
    {
      site_id: 'AR-Bal',
      publish_years: [2012, 2013],
      first_year: 2012,
      last_year: 2013,
      country: 'AR'
    },
    {
      site_id: 'BR-NoMeta',
      publish_years: [2020],
      first_year: 2020,
      last_year: 2020,
      country: 'BR'
    }
  ];
  const vegetationLookup = {
    'AR-BAL': 'Grasslands'
  };

  const lookup = hooks.buildAmeriFluxSiteInfoLookup(rawSiteInfoRows);
  const enriched = hooks.enrichAmeriFluxSitesWithMetadata(availabilitySites, lookup, vegetationLookup);

  assert.deepEqual(lookup['AR-BAL'], {
    site_id: 'AR-BAL',
    site_name: 'Balcarce BA',
    country: 'Argentina',
    latitude: -37.7596,
    longitude: -58.3024
  });
  assert.equal(enriched[0].site_name, 'Balcarce BA');
  assert.equal(enriched[0].country, 'Argentina');
  assert.equal(enriched[0].latitude, -37.7596);
  assert.equal(enriched[0].longitude, -58.3024);
  assert.equal(enriched[0].vegetation_type, 'Grasslands');
  assert.equal(enriched[1].site_name, undefined);
  assert.equal(enriched[1].country, 'Brazil');
  assert.equal(enriched[1].latitude, undefined);
  assert.equal(enriched[1].longitude, undefined);
  assert.equal(enriched[1].vegetation_type, undefined);
});

test('FLUXNET2015 site info lookup accepts mysitename/lon/lat columns and enriches FLUXNET2015 rows separately', () => {
  const rawSiteInfoRows = [
    {
      mysitename: 'AR-SLu',
      lon: '-66.4598',
      lat: '-33.4648'
    }
  ];
  const availabilitySites = [
    {
      site_id: 'AR-SLu',
      publish_years: [2002, 2003],
      first_year: 2002,
      last_year: 2003,
      country: 'AR'
    },
    {
      site_id: 'ZZ-NoMeta',
      publish_years: [2004],
      first_year: 2004,
      last_year: 2004,
      country: 'ZZ'
    }
  ];
  const vegetationLookup = {
    'AR-SLU': 'Evergreen Needleleaf Forests'
  };

  const lookup = hooks.buildFluxnet2015SiteLookup(rawSiteInfoRows);
  const enriched = hooks.enrichFluxnet2015SitesWithMetadata(availabilitySites, lookup, vegetationLookup);

  assert.deepEqual(lookup['AR-SLU'], {
    site_id: 'AR-SLU',
    site_name: '',
    country: '',
    latitude: -33.4648,
    longitude: -66.4598
  });
  assert.equal(enriched[0].latitude, -33.4648);
  assert.equal(enriched[0].longitude, -66.4598);
  assert.equal(enriched[0].country, 'Argentina');
  assert.equal(enriched[0].vegetation_type, 'Evergreen Needleleaf Forests');
  assert.equal(enriched[1].latitude, undefined);
  assert.equal(enriched[1].longitude, undefined);
  assert.equal(enriched[1].country, 'ZZ');
  assert.equal(enriched[1].vegetation_type, undefined);
});

test('Merged site rows preserve full-precision coordinates for map behavior while table display stays rounded', () => {
  const merged = hooks.mergeCatalogRows(
    [
      makeCatalogRow({
        site_id: 'US-Precise',
        data_hub: 'AmeriFlux',
        network: 'AmeriFlux',
        source_network: 'AmeriFlux',
        network_display: 'AmeriFlux',
        network_tokens: ['AmeriFlux'],
        source_origin: 'shuttle',
        source_label: '',
        latitude: 37.87654321,
        longitude: -122.26487654,
        download_link: 'https://example.org/us-precise.zip'
      })
    ],
    [],
    [],
    [],
    [],
    [],
    []
  );
  const row = merged.rows[0];

  assert.equal(row.latitude, 37.87654321);
  assert.equal(row.longitude, -122.26487654);
  assert.equal(row.has_coordinates, true);
  assert.equal(hooks.formatCoordinate(row.latitude, -90, 90), '37.88');
  assert.equal(hooks.formatCoordinate(row.longitude, -180, 180), '-122.26');
});

test('Site-name metadata fills blank names and refreshes search text', () => {
  const [enriched] = hooks.enrichRowsWithSiteNameLookup(
    [makeCatalogRow({ site_id: 'AR-Bal', site_name: '   ' })],
    { 'AR-BAL': 'Balcarce BA' }
  );

  assert.equal(enriched.site_name, 'Balcarce BA');
  assert.equal(hooks.rowMatchesExplorerFilters(enriched, { search: 'balcarce' }), true);
});

test('Site-name metadata fills names when the current value is only the site code', () => {
  const [enriched] = hooks.enrichRowsWithSiteNameLookup(
    [makeCatalogRow({ site_id: 'BE-Bra', site_name: ' BE-Bra ' })],
    { 'BE-BRA': 'Brasschaat' }
  );

  assert.equal(enriched.site_name, 'Brasschaat');
});

test('Site-name metadata preserves existing descriptive names even when metadata differs', () => {
  const [enriched] = hooks.enrichRowsWithSiteNameLookup(
    [makeCatalogRow({ site_id: 'AR-Bal', site_name: 'Existing Explorer Name' })],
    { 'AR-BAL': 'Balcarce BA' }
  );

  assert.equal(enriched.site_name, 'Existing Explorer Name');
});

test('Site-name metadata safely leaves rows unchanged when no metadata match exists', () => {
  const [enriched] = hooks.enrichRowsWithSiteNameLookup(
    [makeCatalogRow({ site_id: 'ZZ-NoMatch', site_name: '' })],
    { 'AR-BAL': 'Balcarce BA' }
  );

  assert.equal(enriched.site_name, '');
  assert.equal(hooks.rowMatchesExplorerFilters(enriched, { search: 'balcarce' }), false);
});

test('Site-name metadata lookup keeps the first non-empty duplicate deterministically', () => {
  const lookup = hooks.buildSiteNameMetadataLookup([
    { site_id: 'CN-Cha', site_name: '   ' },
    { site_id: ' CN-Cha ', site_name: 'Changsha(Paddy Rice)' },
    { site_id: 'CN-CHA', site_name: 'Changwu(Wheat)' },
    { site_id: '', site_name: 'Ignored Missing Site ID' }
  ]);

  assert.deepEqual(lookup, {
    'CN-CHA': 'Changsha(Paddy Rice)'
  });
});

test('Vegetation metadata lookup builds canonical site-id keys from CSV-like rows', () => {
  const lookup = hooks.buildVegetationMetadataLookup([
    { site_id: ' us-new ', vegetation_type: 'Grasslands' },
    { mysitename: 'AR-SLu', igbp: 'MF' }
  ]);

  assert.deepEqual(lookup, {
    'US-NEW': 'Grasslands',
    'AR-SLU': 'MF'
  });
});

test('API-only coordinate coverage summary reports AmeriFlux and FLUXNET2015 counts separately', () => {
  const summary = hooks.summarizeApiOnlyRowCoordinateCoverage([
    { source_label: 'AmeriFlux', site_id: 'AMF-1', latitude: 10, longitude: 20 },
    { source_label: 'AmeriFlux', site_id: 'AMF-2', latitude: null, longitude: null },
    { source_label: 'FLUXNET2015', site_id: 'FLX-1', latitude: 30, longitude: 40 },
    { source_label: 'FLUXNET2015', site_id: 'FLX-2', latitude: null, longitude: null }
  ]);

  assert.deepEqual(summary, {
    amerifluxWithCoordinates: 1,
    amerifluxWithoutCoordinates: 1,
    fluxnet2015WithCoordinates: 1,
    fluxnet2015WithoutCoordinates: 1,
    fluxnet2015MissingSiteIds: ['FLX-2']
  });
});

test('Filename helper strips URL query strings', () => {
  const url = 'https://amfcdn.lbl.gov/path/AMF_AR-Bal_FLUXNET_FULLSET_2012-2013_3-7.zip?=username';
  assert.equal(hooks.stripUrlQueryForFilename(url), 'https://amfcdn.lbl.gov/path/AMF_AR-Bal_FLUXNET_FULLSET_2012-2013_3-7.zip');
  assert.equal(hooks.filenameFromUrl(url), 'AMF_AR-Bal_FLUXNET_FULLSET_2012-2013_3-7.zip');
});

test('AmeriFlux download logger payload uses Explorer identity and derives ZIP filenames from URLs', () => {
  const payload = hooks.buildAmeriFluxDownloadLogPayload([
    { url: 'https://amfcdn.lbl.gov/path/AMF_US-MtB_FLUXNET_2009-2024_v1.3_r1.zip?user=custom-user' },
    { filename: 'AMF_US-MtB_BASE-BADM_2009-2024_v1-5.zip' },
    { url: 'https://amfcdn.lbl.gov/path/not-a-zip.txt?ignored=1' }
  ]);

  assert.equal(hooks.amerifluxDownloadLoggerUrl, 'https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request');
  assert.deepEqual(payload, {
    user_id: 'FluxnetDataExplorer',
    zip_filenames: [
      'AMF_US-MtB_FLUXNET_2009-2024_v1.3_r1.zip',
      'AMF_US-MtB_BASE-BADM_2009-2024_v1-5.zip'
    ],
    user_email: 'fluxnet@explorer.edu',
    user_name: 'Fluxnet Data Explorer',
    intended_use: 'other_research',
    description: 'Download requested through the FLUXNET Data Explorer'
  });
});

test('AmeriFlux download logger is best-effort and does not reject when logging fails', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const calls = [];
  const warnings = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: false, status: 503 };
  };
  console.warn = (...args) => {
    warnings.push(args);
  };

  try {
    const result = await hooks.logAmeriFluxDownloadEntries([
      { url: 'https://amfcdn.lbl.gov/path/AMF_US-MtB_FLUXNET_2009-2024_v1.3_r1.zip?token=1' }
    ]);

    assert.equal(result.logged, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request');
    assert.equal(JSON.parse(calls[0].options.body).user_id, 'FluxnetDataExplorer');
    assert.deepEqual(JSON.parse(calls[0].options.body).zip_filenames, ['AMF_US-MtB_FLUXNET_2009-2024_v1.3_r1.zip']);
    assert.equal(warnings.length, 1);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('AmeriFlux API download returns manual fallback when trusted credentials are unavailable', async () => {
  const source = hooks.createAmeriFluxSource({
    trustedRuntime: false,
    userId: '',
    userEmail: '',
    dataProduct: 'FLUXNET2015',
    sourceLabel: 'FLUXNET2015'
  });

  const result = await source.get_download_urls('AR-Bal', 'FULLSET', 'CCBY4.0');

  assert.equal(result.mode, 'manual');
  assert.equal(result.manual_download_required, true);
  assert.equal(result.site_id, 'AR-Bal');
  assert.equal(result.payload_template.data_product, 'FLUXNET2015');
  assert.equal(result.payload_template.intended_use, 'QED Lab FLUXNET Data Explorer');
  assert.equal(result.payload_template.agree_policy, true);
  assert.equal(source.downloadUrl, 'https://amfcdn.lbl.gov/api/v1/data_download');
  assert.equal(Array.isArray(result.data_urls), true);
  assert.equal(result.data_urls.length, 0);
});

test('AmeriFlux row download stays manual without trusted runtime even with fallback identity override', async () => {
  const source = hooks.createAmeriFluxSource({
    trustedRuntime: false,
    userId: '',
    userEmail: '',
    dataProduct: 'FLUXNET',
    sourceLabel: 'AmeriFlux'
  });
  const identity = hooks.resolveAmeriFluxBulkIdentity('', '');
  const originalFetch = global.fetch;
  let fetchCalled = false;

  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for manual AmeriFlux row actions');
  };

  try {
    const result = await source.get_download_urls('AR-Bal', 'FULLSET', 'CCBY4.0', identity);

    assert.equal(result.mode, 'manual');
    assert.equal(result.manual_download_required, true);
    assert.equal(result.payload_template.user_id, 'FluxnetDataExplorer');
    assert.equal(result.payload_template.user_email, 'fluxnet@explorer.edu');
    assert.equal(String(result.curl_command || '').includes('YOUR_AMERIFLUX_USERNAME'), false);
    assert.equal(String(result.curl_command || '').includes('YOUR_EMAIL'), false);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('AmeriFlux row manual content uses custom effective identity override values', async () => {
  const source = hooks.createAmeriFluxSource({
    trustedRuntime: false,
    userId: '',
    userEmail: '',
    dataProduct: 'FLUXNET2015',
    sourceLabel: 'FLUXNET2015'
  });
  const identity = hooks.resolveAmeriFluxBulkIdentity('custom-user', 'custom@example.org');
  const originalFetch = global.fetch;
  let fetchCalled = false;

  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for manual AmeriFlux row actions');
  };

  try {
    const result = await source.get_download_urls('AR-Bal', 'FULLSET', 'CCBY4.0', identity);

    assert.equal(result.mode, 'manual');
    assert.equal(result.manual_download_required, true);
    assert.equal(result.payload_template.user_id, 'custom-user');
    assert.equal(result.payload_template.user_email, 'custom@example.org');
    assert.equal(result.payload_template.data_product, 'FLUXNET2015');
    assert.equal(String(result.curl_command || '').includes('YOUR_AMERIFLUX_USERNAME'), false);
    assert.equal(String(result.curl_command || '').includes('YOUR_EMAIL'), false);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('AmeriFlux curl command generator keeps visible v2 endpoints for FLUXNET and BASE while obscuring the FLUXNET2015 request URL', () => {
  const fluxnetCommand = hooks.buildAmeriFluxCurlCommand('AR-Bal', 'FULLSET', 'CCBY4.0', undefined, 'FLUXNET');
  const baseCommand = hooks.buildAmeriFluxCurlCommand('AR-Bal', 'FULLSET', 'CCBY4.0', undefined, 'BASE-BADM');
  const fluxnet2015Command = hooks.buildAmeriFluxCurlCommand('AR-Bal', 'FULLSET', 'CCBY4.0', undefined, 'FLUXNET2015');

  assert.match(fluxnetCommand, /https:\/\/amfcdn\.lbl\.gov\/api\/v2\/data_download/);
  assert.match(fluxnetCommand, /"site_ids": \[\s*"AR-Bal"\s*\]/);
  assert.match(fluxnetCommand, /"user_id": "FluxnetDataExplorer"/);
  assert.match(fluxnetCommand, /"user_email": "fluxnet@explorer\.edu"/);
  assert.match(fluxnetCommand, /"intended_use": "other_research"/);
  assert.match(fluxnetCommand, /Q\.E\.D\. Lab FLUXNET Data Explorer/);
  assert.equal(fluxnetCommand.includes('"agree_policy"'), false);
  assert.equal(fluxnetCommand.includes('"is_test"'), false);
  assert.equal(fluxnetCommand.includes('AMERIFLUX_LOGGER_URL="https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request"'), true);
  assert.equal(fluxnetCommand.includes('AMERIFLUX_LOGGER_USER_ID="FluxnetDataExplorer"'), true);
  assert.equal(fluxnetCommand.includes('extract_error_message() {'), true);
  assert.equal(fluxnetCommand.includes('response_mentions_account_problem() {'), true);
  assert.equal(fluxnetCommand.includes('print_download_request_error() {'), true);
  assert.equal(fluxnetCommand.includes('HTTP_STATUS="$(curl -sS -w "%{http_code}" -o "$RESPONSE_FILE" -X POST "$REQUEST_URL" \\'), true);
  assert.equal(fluxnetCommand.includes('log_ameriflux_download "$filename"'), true);

  assert.match(baseCommand, /https:\/\/amfcdn\.lbl\.gov\/api\/v2\/data_download/);
  assert.match(baseCommand, /"user_id": "FluxnetDataExplorer"/);
  assert.match(baseCommand, /"user_email": "fluxnet@explorer\.edu"/);
  assert.match(baseCommand, /"data_product": "BASE-BADM"/);
  assert.match(baseCommand, /"intended_use": "other_research"/);
  assert.equal(baseCommand.includes('AMERIFLUX_LOGGER_URL="https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request"'), true);
  assert.equal(baseCommand.includes('AMERIFLUX_LOGGER_USER_ID="FluxnetDataExplorer"'), true);
  assert.equal(baseCommand.includes('log_ameriflux_download "$filename"'), true);

  assert.equal(fluxnet2015Command.includes('https://amfcdn.lbl.gov/api/v1/data_download'), false);
  assert.equal(fluxnet2015Command.includes('AMERIFLUX_LOGGER_URL="https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request"'), true);
  assert.equal(fluxnet2015Command.includes('AMERIFLUX_LOGGER_USER_ID="FluxnetDataExplorer"'), true);
  assert.equal(fluxnet2015Command.includes('decode_base64() {'), true);
  assert.match(fluxnet2015Command, /REQUEST_URL_B64="[A-Za-z0-9+/=]+"/);
  assert.equal(fluxnet2015Command.includes('REQUEST_URL="$(decode_base64 "$REQUEST_URL_B64" 2>/dev/null || true)"'), true);
  assert.equal(fluxnet2015Command.includes('HTTP_STATUS="$(curl -sS -w "%{http_code}" -o "$RESPONSE_FILE" -X POST "$REQUEST_URL" \\'), true);
  assert.match(fluxnet2015Command, /"user_id": "FluxnetDataExplorer"/);
  assert.match(fluxnet2015Command, /"user_email": "fluxnet@explorer\.edu"/);
  assert.match(fluxnet2015Command, /"description": "Download FLUXNET2015 for AR-Bal"/);
  assert.match(fluxnet2015Command, /"data_product": "FLUXNET2015"/);
  assert.match(fluxnet2015Command, /"intended_use": "QED Lab FLUXNET Data Explorer"/);
  assert.equal(fluxnet2015Command.includes('"is_test"'), false);
  assert.equal(fluxnet2015Command.includes('clean_url="${url%%\\?*}"'), true);
  assert.equal(fluxnet2015Command.includes('filename="$(basename "$clean_url")"'), true);
  assert.equal(fluxnet2015Command.includes('log_ameriflux_download "$filename"'), true);
  assert.equal(fluxnet2015Command.includes('curl -L "$url" -o "$filename"'), true);
});

test('AmeriFlux curl command generator uses effective identity override when provided', () => {
  const fallbackCommand = hooks.buildAmeriFluxCurlCommand(
    'AR-Bal',
    'FULLSET',
    'CCBY4.0',
    undefined,
    'FLUXNET',
    hooks.resolveAmeriFluxBulkIdentity('', '')
  );
  const customCommand = hooks.buildAmeriFluxCurlCommand(
    'AR-Bal',
    'FULLSET',
    'CCBY4.0',
    undefined,
    'FLUXNET2015',
    hooks.resolveAmeriFluxBulkIdentity('custom-user', 'custom@example.org')
  );

  assert.equal(fallbackCommand.includes('YOUR_AMERIFLUX_USERNAME'), false);
  assert.equal(fallbackCommand.includes('YOUR_EMAIL'), false);
  assert.match(fallbackCommand, /"user_id": "FluxnetDataExplorer"/);
  assert.match(fallbackCommand, /"user_email": "fluxnet@explorer\.edu"/);

  assert.equal(customCommand.includes('YOUR_AMERIFLUX_USERNAME'), false);
  assert.equal(customCommand.includes('YOUR_EMAIL'), false);
  assert.match(customCommand, /"user_id": "custom-user"/);
  assert.match(customCommand, /"user_email": "custom@example\.org"/);
  assert.equal(customCommand.includes('AMERIFLUX_LOGGER_USER_ID="FluxnetDataExplorer"'), true);
  assert.equal(customCommand.includes('AMERIFLUX_LOGGER_USER_ID="custom-user"'), false);
});

test('AmeriFlux row-level FLUXNET2015 curl command decodes and uses the request URL at runtime without exposing the raw v1 URL', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-row-command-'));
  const scriptPath = path.join(tempDir, 'run_row_command.sh');
  const postUrlLogFile = path.join(tempDir, 'posted_urls.log');
  const postBodyLogFile = path.join(tempDir, 'posted_bodies.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    includeJq: true,
    postUrlLogFile: postUrlLogFile,
    postBodyLogFile: postBodyLogFile
  });
  const commandText = hooks.buildAmeriFluxCurlCommand('CL-Old', 'FULLSET', 'CCBY4.0', undefined, 'FLUXNET2015');

  writeExecutable(
    scriptPath,
    [
      '#!' + BASH_PATH,
      'set -euo pipefail',
      '',
      commandText
    ].join('\n')
  );

  const result = childProcess.spawnSync(BASH_PATH, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(result.status, 0);
  assert.equal(commandText.includes('https://amfcdn.lbl.gov/api/v1/data_download'), false);
  assert.deepEqual(fs.readFileSync(postUrlLogFile, 'utf8').trim().split('\n'), [
    'https://amfcdn.lbl.gov/api/v1/data_download',
    'https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request'
  ]);
  const postedBodies = fs.readFileSync(postBodyLogFile, 'utf8').split('\n---END---\n').filter(Boolean);
  assert.equal(JSON.parse(postedBodies[1]).user_id, 'FluxnetDataExplorer');
  assert.deepEqual(JSON.parse(postedBodies[1]).zip_filenames, ['mock.zip']);
  assert.equal(fs.existsSync(path.join(tempDir, 'mock.zip')), true);
  assert.match(fs.readFileSync(path.join(tempDir, 'mock.zip'), 'utf8'), /downloaded:https:\/\/example\.org\/mock\.zip\?download=1/);
  assert.equal(String(result.stdout || '').includes('https://amfcdn.lbl.gov/api/v1/data_download'), false);
  assert.equal(String(result.stderr || '').includes('https://amfcdn.lbl.gov/api/v1/data_download'), false);
});

test('AmeriFlux row-level curl command still downloads when the logger request fails', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-row-command-'));
  const scriptPath = path.join(tempDir, 'run_row_command.sh');
  const postUrlLogFile = path.join(tempDir, 'posted_urls.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    includeJq: true,
    postUrlLogFile: postUrlLogFile,
    failLogger: true
  });
  const commandText = hooks.buildAmeriFluxCurlCommand('AR-Bal', 'FULLSET', 'CCBY4.0', undefined, 'FLUXNET');

  writeExecutable(
    scriptPath,
    [
      '#!' + BASH_PATH,
      'set -euo pipefail',
      '',
      commandText
    ].join('\n')
  );

  const result = childProcess.spawnSync(BASH_PATH, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(result.status, 0);
  assert.deepEqual(fs.readFileSync(postUrlLogFile, 'utf8').trim().split('\n'), [
    'https://amfcdn.lbl.gov/api/v2/data_download',
    'https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request'
  ]);
  assert.equal(fs.existsSync(path.join(tempDir, 'mock.zip')), true);
  assert.match(String(result.stderr || ''), /Warning: AmeriFlux download logging failed for mock\.zip\./);
});

test('AmeriFlux row-level curl command reports API account errors clearly without downloading', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-row-command-'));
  const scriptPath = path.join(tempDir, 'run_row_command.sh');
  const postUrlLogFile = path.join(tempDir, 'posted_urls.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    postUrlLogFile: postUrlLogFile,
    apiStatus: '400',
    responsePayload: JSON.stringify({ message: 'Invalid user_id bad-user is not registered with AmeriFlux' })
  });
  const commandText = hooks.buildAmeriFluxCurlCommand(
    'AR-Bal',
    'FULLSET',
    'CCBY4.0',
    undefined,
    'FLUXNET',
    hooks.resolveAmeriFluxBulkIdentity('bad-user', 'bad@example.org')
  );

  writeExecutable(
    scriptPath,
    [
      '#!' + BASH_PATH,
      'set -euo pipefail',
      '',
      commandText
    ].join('\n')
  );

  const result = childProcess.spawnSync(BASH_PATH, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(postUrlLogFile, 'utf8').trim(), 'https://amfcdn.lbl.gov/api/v2/data_download');
  assert.equal(fs.existsSync(path.join(tempDir, 'mock.zip')), false);
  assert.match(String(result.stderr || ''), /AmeriFlux API request failed for AR-Bal \(FLUXNET\) with HTTP 400\./);
  assert.match(String(result.stderr || ''), /AmeriFlux API message: Invalid user_id bad-user is not registered with AmeriFlux/);
  assert.match(String(result.stderr || ''), /This looks like an AmeriFlux account, username, email, permission, or registration issue\./);
  assert.match(String(result.stderr || ''), /Active AmeriFlux identity: USER_ID=bad-user USER_EMAIL=bad@example\.org/);
  assert.match(String(result.stderr || ''), /unset them to use the Explorer defaults/);
});

test('AmeriFlux selected-sites export includes policy and keeps multiple products for one site', () => {
  const text = hooks.buildAmeriFluxSelectedSitesText([
    { site_id: 'AR-Bal', data_product: 'FLUXNET', source_label: 'AmeriFlux' },
    { site_id: 'AR-Bal', data_product: 'BASE-BADM', source_label: 'BASE' },
    { site_id: 'AR-Bal', data_product: 'BASE-BADM', source_label: 'BASE' },
    { site_id: 'AR-Bal', data_product: 'BASE-BADM', data_policy: 'LEGACY', source_label: 'AmeriFlux BASE (Legacy)' },
    { site_id: 'CL-Old', data_product: 'FLUXNET2015', source_label: 'FLUXNET2015' }
  ]);

  assert.match(text, /^# site_id\tdata_product\tdata_policy\tsource_label/m);
  assert.match(text, /^AR-Bal\tFLUXNET\tCCBY4\.0\tAmeriFlux$/m);
  assert.match(text, /^AR-Bal\tBASE-BADM\tCCBY4\.0\tBASE$/m);
  assert.match(text, /^AR-Bal\tBASE-BADM\tLEGACY\tAmeriFlux BASE \(Legacy\)$/m);
  assert.match(text, /^CL-Old\tFLUXNET2015\tCCBY4\.0\tFLUXNET2015$/m);
  assert.equal((text.match(/^AR-Bal\tBASE-BADM\tCCBY4\.0\tBASE$/gm) || []).length, 1);
});

test('AmeriFlux bulk script generator supports mixed FLUXNET and FLUXNET2015 products and filename cleanup', () => {
  const fluxnet2015RequestUrlB64 = Buffer.from('https://amfcdn.lbl.gov/api/v1/data_download', 'utf8').toString('base64');
  const script = hooks.buildAmeriFluxBulkScriptText([
    { site_id: 'AR-Bal', data_product: 'FLUXNET', source_label: 'AmeriFlux' },
    { site_id: 'AR-Bal', data_product: 'BASE-BADM', source_label: 'BASE' },
    { site_id: 'CL-Old', data_product: 'FLUXNET2015', source_label: 'FLUXNET2015' }
  ], {
    defaultUserId: 'custom-user',
    defaultUserEmail: 'custom@example.org'
  });

  assert.equal(script.includes('# site_id\tdata_product\tdata_policy\tsource_label'), true);
  assert.equal(script.includes('AR-Bal\tFLUXNET\tCCBY4.0\tAmeriFlux'), true);
  assert.equal(script.includes('AR-Bal\tBASE-BADM\tCCBY4.0\tBASE'), true);
  assert.equal(script.includes('CL-Old\tFLUXNET2015\tCCBY4.0\tFLUXNET2015'), true);
  assert.equal(script.includes('USER_ID="${AMERIFLUX_USER_ID:-custom-user}"'), true);
  assert.equal(script.includes('USER_EMAIL="${AMERIFLUX_USER_EMAIL:-custom@example.org}"'), true);
  assert.equal(script.includes('V2_DOWNLOAD_URL="${AMERIFLUX_V2_DOWNLOAD_URL:-https://amfcdn.lbl.gov/api/v2/data_download}"'), true);
  assert.equal(script.includes('FLUXNET2015_REQUEST_URL_B64="${AMERIFLUX_FLUXNET2015_REQUEST_URL_B64:-' + fluxnet2015RequestUrlB64 + '}"'), true);
  assert.equal(script.includes('https://amfcdn.lbl.gov/api/v1/data_download'), false);
  assert.equal(script.includes('AMERIFLUX_LOGGER_URL="https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request"'), true);
  assert.equal(script.includes('AMERIFLUX_LOGGER_USER_ID="FluxnetDataExplorer"'), true);
  assert.equal(script.includes('AMERIFLUX_LOGGER_USER_EMAIL="fluxnet@explorer.edu"'), true);
  assert.equal(script.includes('\\"zip_filenames\\": [\\"${log_filename}\\"],'), true);
  assert.equal(script.includes('log_ameriflux_download "$filename"'), true);
  assert.equal(script.includes('extract_urls() {'), true);
  assert.equal(script.includes('extract_error_message() {'), true);
  assert.equal(script.includes('response_mentions_account_problem() {'), true);
  assert.equal(script.includes('print_download_request_error() {'), true);
  assert.equal(script.includes('HTTP_STATUS=$(curl -sS -w "%{http_code}" -o "$RESPONSE_FILE" -X POST "$REQUEST_URL"'), true);
  assert.equal(script.includes('No data_urls returned for ${SITE_ID} (${DATA_PRODUCT}); continuing.'), false);
  assert.equal(script.includes('decode_base64() {'), true);
  assert.equal(script.includes('resolve_request_url() {'), true);
  assert.equal(script.includes("printf '%s' \"$1\" | jq -r '.data_urls[]?.url // empty'"), true);
  assert.equal(script.includes("printf '%s' \"$1\" | python3 -c '"), true);
  assert.equal(script.includes("python3 -c 'import base64, sys; sys.stdout.write(base64.b64decode(sys.argv[1]).decode(\"utf-8\"))' \"$1\""), true);
  assert.equal(script.includes('if ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then'), true);
  assert.equal(script.includes('This script requires jq or python3 to parse the AmeriFlux API response.'), true);
  assert.equal(script.includes('macOS: brew install jq'), true);
  assert.equal(script.includes('Debian/Ubuntu: sudo apt-get install jq'), true);
  assert.equal(script.includes('Fedora/RHEL: sudo dnf install jq'), true);
  assert.equal(script.includes('Arch: sudo pacman -S jq'), true);
  assert.equal(script.includes('Windows shells:'), true);
  assert.equal(script.includes('choco install jq'), true);
  assert.equal(script.includes('scoop install jq'), true);
  assert.equal(script.includes('winget install jqlang.jq'), true);
  assert.equal(script.includes('See https://jqlang.github.io/jq/download/'), true);
  assert.equal(script.includes('if [ "$DATA_PRODUCT" = "FLUXNET2015" ]; then'), true);
  assert.equal(script.includes('REQUEST_URL="$(resolve_request_url "$DATA_PRODUCT")" || {'), true);
  assert.equal(script.includes('\\"data_product\\": \\"${DATA_PRODUCT}\\"'), true);
  assert.equal(script.includes('\\"data_variant\\": \\"FULLSET\\"'), true);
  assert.equal(script.includes('\\"data_policy\\": \\"${DATA_POLICY}\\"'), true);
  assert.equal(script.includes('\\"intended_use\\": \\"other_research\\"'), true);
  assert.equal(script.includes('\\"intended_use\\": \\"QED Lab FLUXNET Data Explorer\\"'), true);
  assert.equal(script.includes('\\"is_test\\": false'), false);
  assert.equal(script.includes('while IFS=$\'\\t\' read -r SITE_ID DATA_PRODUCT DATA_POLICY SOURCE_LABEL; do'), true);
  assert.equal(script.includes('URLS=$(extract_urls "$RESPONSE" 2>/dev/null || true)'), true);
  assert.equal(script.includes('clean_url="${url%%\\?*}"'), true);
  assert.equal(script.includes('filename="$(basename "$clean_url")"'), true);
  assert.equal(script.includes('jq is required but was not found in PATH.'), false);
});

test('AmeriFlux bulk script generator uses internal fallback contact values when no input is provided', () => {
  const script = hooks.buildAmeriFluxBulkScriptText([
    { site_id: 'AR-Bal', data_product: 'FLUXNET', source_label: 'AmeriFlux' }
  ]);

  assert.equal(script.includes('USER_ID="${AMERIFLUX_USER_ID:-FluxnetDataExplorer}"'), true);
  assert.equal(script.includes('USER_EMAIL="${AMERIFLUX_USER_EMAIL:-fluxnet@explorer.edu}"'), true);
});

test('Generated AmeriFlux bulk script falls back to python3 when jq is unavailable', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-bulk-script-'));
  const scriptPath = path.join(tempDir, 'download_ameriflux_selected.sh');
  const outDir = path.join(tempDir, 'downloads');
  const sitesFile = path.join(tempDir, 'ameriflux_selected_sites.txt');
  const logFile = path.join(tempDir, 'ameriflux_bulk_download.log');
  const binDir = buildScriptRuntimeBin(tempDir, { includePython3: true });

  writeExecutable(
    scriptPath,
    hooks.buildAmeriFluxBulkScriptText([
      { site_id: 'AR-Bal', data_product: 'FLUXNET', source_label: 'AmeriFlux' }
    ])
  );

  childProcess.execFileSync(BASH_PATH, [scriptPath, outDir, sitesFile, logFile], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(fs.existsSync(path.join(outDir, 'mock.zip')), true);
  assert.match(fs.readFileSync(path.join(outDir, 'mock.zip'), 'utf8'), /downloaded:https:\/\/example\.org\/mock\.zip\?download=1/);
  assert.match(fs.readFileSync(logFile, 'utf8'), /Downloading mock\.zip \(AR-Bal, FLUXNET\)/);
  assert.match(fs.readFileSync(sitesFile, 'utf8'), /^# site_id\tdata_product\tdata_policy\tsource_label/m);
});

test('Generated AmeriFlux bulk script posts CC-BY and Legacy BASE requests separately through V2', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-bulk-script-'));
  const scriptPath = path.join(tempDir, 'download_ameriflux_selected.sh');
  const outDir = path.join(tempDir, 'downloads');
  const sitesFile = path.join(tempDir, 'ameriflux_selected_sites.txt');
  const logFile = path.join(tempDir, 'ameriflux_bulk_download.log');
  const postUrlLogFile = path.join(tempDir, 'posted_urls.log');
  const postBodyLogFile = path.join(tempDir, 'posted_bodies.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    postUrlLogFile: postUrlLogFile,
    postBodyLogFile: postBodyLogFile
  });
  const scriptText = hooks.buildAmeriFluxBulkScriptText([
    { site_id: 'US-Policy', data_product: 'BASE-BADM', data_policy: 'CCBY4.0', source_label: 'BASE' },
    { site_id: 'US-Policy', data_product: 'BASE-BADM', data_policy: 'LEGACY', source_label: 'AmeriFlux BASE (Legacy)' }
  ]);

  writeExecutable(scriptPath, scriptText);

  childProcess.execFileSync(BASH_PATH, [scriptPath, outDir, sitesFile, logFile], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(scriptText.includes('# WARNING: This selection includes AmeriFlux data shared under the AmeriFlux Legacy Data Policy.'), true);
  assert.deepEqual(fs.readFileSync(postUrlLogFile, 'utf8').trim().split('\n'), [
    'https://amfcdn.lbl.gov/api/v2/data_download',
    'https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request',
    'https://amfcdn.lbl.gov/api/v2/data_download',
    'https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request'
  ]);
  const postedBodies = fs.readFileSync(postBodyLogFile, 'utf8').split('\n---END---\n').filter(Boolean);
  assert.equal(JSON.parse(postedBodies[0]).data_policy, 'CCBY4.0');
  assert.equal(JSON.parse(postedBodies[2]).data_policy, 'LEGACY');
  assert.equal((fs.readFileSync(logFile, 'utf8').match(/This selection includes AmeriFlux data shared under the AmeriFlux Legacy Data Policy\./g) || []).length, 1);
});

test('Generated AmeriFlux bulk script decodes and uses the FLUXNET2015 request URL at runtime without exposing the raw v1 URL', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-bulk-script-'));
  const scriptPath = path.join(tempDir, 'download_ameriflux_selected.sh');
  const outDir = path.join(tempDir, 'downloads');
  const sitesFile = path.join(tempDir, 'ameriflux_selected_sites.txt');
  const logFile = path.join(tempDir, 'ameriflux_bulk_download.log');
  const postUrlLogFile = path.join(tempDir, 'posted_urls.log');
  const postBodyLogFile = path.join(tempDir, 'posted_bodies.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    postUrlLogFile: postUrlLogFile,
    postBodyLogFile: postBodyLogFile
  });
  const scriptText = hooks.buildAmeriFluxBulkScriptText([
    { site_id: 'CL-Old', data_product: 'FLUXNET2015', source_label: 'FLUXNET2015' }
  ]);

  writeExecutable(scriptPath, scriptText);

  childProcess.execFileSync(BASH_PATH, [scriptPath, outDir, sitesFile, logFile], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(scriptText.includes('https://amfcdn.lbl.gov/api/v1/data_download'), false);
  assert.equal(fs.existsSync(path.join(outDir, 'mock.zip')), true);
  assert.match(fs.readFileSync(logFile, 'utf8'), /Requesting FLUXNET2015 URLs for CL-Old/);
  assert.deepEqual(fs.readFileSync(postUrlLogFile, 'utf8').trim().split('\n'), [
    'https://amfcdn.lbl.gov/api/v1/data_download',
    'https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request'
  ]);
  const postedBodies = fs.readFileSync(postBodyLogFile, 'utf8').split('\n---END---\n').filter(Boolean);
  assert.equal(JSON.parse(postedBodies[1]).user_id, 'FluxnetDataExplorer');
  assert.deepEqual(JSON.parse(postedBodies[1]).zip_filenames, ['mock.zip']);
  assert.equal(fs.readFileSync(logFile, 'utf8').includes('https://amfcdn.lbl.gov/api/v1/data_download'), false);
});

test('Generated AmeriFlux bulk script reports API messages when no download URLs are returned', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-bulk-script-'));
  const scriptPath = path.join(tempDir, 'download_ameriflux_selected.sh');
  const outDir = path.join(tempDir, 'downloads');
  const sitesFile = path.join(tempDir, 'ameriflux_selected_sites.txt');
  const logFile = path.join(tempDir, 'ameriflux_bulk_download.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    responsePayload: JSON.stringify({ message: 'No files are currently available for this site and product' })
  });

  writeExecutable(
    scriptPath,
    hooks.buildAmeriFluxBulkScriptText([
      { site_id: 'AR-Bal', data_product: 'FLUXNET', source_label: 'AmeriFlux' }
    ])
  );

  const result = childProcess.spawnSync(BASH_PATH, [scriptPath, outDir, sitesFile, logFile], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(outDir, 'mock.zip')), false);
  const logText = fs.readFileSync(logFile, 'utf8');
  assert.match(logText, /No download URLs returned for AR-Bal \(FLUXNET\)\./);
  assert.match(logText, /AmeriFlux API message: No files are currently available for this site and product/);
  assert.equal(logText.includes('No data_urls returned for AR-Bal (FLUXNET); continuing.'), false);
});

test('Generated AmeriFlux bulk script fails fast with account diagnostics for invalid AmeriFlux identity', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-bulk-script-'));
  const scriptPath = path.join(tempDir, 'download_ameriflux_selected.sh');
  const outDir = path.join(tempDir, 'downloads');
  const sitesFile = path.join(tempDir, 'ameriflux_selected_sites.txt');
  const logFile = path.join(tempDir, 'ameriflux_bulk_download.log');
  const postUrlLogFile = path.join(tempDir, 'posted_urls.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    postUrlLogFile: postUrlLogFile,
    apiStatus: '400',
    responsePayload: JSON.stringify({ message: 'Invalid user_id bad-user is not registered with AmeriFlux' })
  });

  writeExecutable(
    scriptPath,
    hooks.buildAmeriFluxBulkScriptText([
      { site_id: 'AR-Bal', data_product: 'FLUXNET', source_label: 'AmeriFlux' },
      { site_id: 'US-Next', data_product: 'BASE-BADM', source_label: 'BASE' }
    ], {
      defaultUserId: 'bad-user',
      defaultUserEmail: 'bad@example.org'
    })
  );

  const result = childProcess.spawnSync(BASH_PATH, [scriptPath, outDir, sitesFile, logFile], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(result.status, 1);
  assert.deepEqual(fs.readFileSync(postUrlLogFile, 'utf8').trim().split('\n'), [
    'https://amfcdn.lbl.gov/api/v2/data_download'
  ]);
  const logText = fs.readFileSync(logFile, 'utf8');
  assert.match(logText, /AmeriFlux API request failed for AR-Bal \(FLUXNET\) with HTTP 400\./);
  assert.match(logText, /AmeriFlux API message: Invalid user_id bad-user is not registered with AmeriFlux/);
  assert.match(logText, /This looks like an AmeriFlux account, username, email, permission, or registration issue\./);
  assert.match(logText, /Active AmeriFlux identity: USER_ID=bad-user USER_EMAIL=bad@example\.org/);
  assert.match(logText, /Check AMERIFLUX_USER_ID and AMERIFLUX_USER_EMAIL, or unset them to use the Explorer defaults\./);
  assert.equal(logText.includes('Requesting BASE-BADM URLs for US-Next'), false);
  assert.equal(fs.existsSync(path.join(outDir, 'mock.zip')), false);
});

test('Generated AmeriFlux bulk script reports connectivity hints for curl request failures', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-bulk-script-'));
  const scriptPath = path.join(tempDir, 'download_ameriflux_selected.sh');
  const outDir = path.join(tempDir, 'downloads');
  const sitesFile = path.join(tempDir, 'ameriflux_selected_sites.txt');
  const logFile = path.join(tempDir, 'ameriflux_bulk_download.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    failDownloadRequest: true
  });

  writeExecutable(
    scriptPath,
    hooks.buildAmeriFluxBulkScriptText([
      { site_id: 'AR-Bal', data_product: 'FLUXNET', source_label: 'AmeriFlux' }
    ])
  );

  const result = childProcess.spawnSync(BASH_PATH, [scriptPath, outDir, sitesFile, logFile], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(result.status, 0);
  assert.match(fs.readFileSync(logFile, 'utf8'), /Request failed for AR-Bal \(FLUXNET\); check connectivity and the AmeriFlux API endpoint\./);
  assert.equal(fs.existsSync(path.join(outDir, 'mock.zip')), false);
});

test('Generated AmeriFlux bulk script continues downloads when logger requests fail', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-bulk-script-'));
  const scriptPath = path.join(tempDir, 'download_ameriflux_selected.sh');
  const outDir = path.join(tempDir, 'downloads');
  const sitesFile = path.join(tempDir, 'ameriflux_selected_sites.txt');
  const logFile = path.join(tempDir, 'ameriflux_bulk_download.log');
  const postUrlLogFile = path.join(tempDir, 'posted_urls.log');
  const binDir = buildScriptRuntimeBin(tempDir, {
    includePython3: true,
    postUrlLogFile: postUrlLogFile,
    failLogger: true
  });

  writeExecutable(
    scriptPath,
    hooks.buildAmeriFluxBulkScriptText([
      { site_id: 'AR-Bal', data_product: 'BASE-BADM', source_label: 'BASE' }
    ])
  );

  const result = childProcess.spawnSync(BASH_PATH, [scriptPath, outDir, sitesFile, logFile], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(result.status, 0);
  assert.deepEqual(fs.readFileSync(postUrlLogFile, 'utf8').trim().split('\n'), [
    'https://amfcdn.lbl.gov/api/v2/data_download',
    'https://amfcdn.lbl.gov/api/v2/log_shuttle_data_request'
  ]);
  assert.equal(fs.existsSync(path.join(outDir, 'mock.zip')), true);
  assert.match(fs.readFileSync(logFile, 'utf8'), /Warning: AmeriFlux download logging failed for mock\.zip\./);
  assert.match(fs.readFileSync(logFile, 'utf8'), /Downloading mock\.zip \(AR-Bal, BASE-BADM\)/);
});

test('Generated AmeriFlux bulk script exits with jq install guidance when neither jq nor python3 is available', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ameriflux-bulk-script-'));
  const scriptPath = path.join(tempDir, 'download_ameriflux_selected.sh');
  const outDir = path.join(tempDir, 'downloads');
  const sitesFile = path.join(tempDir, 'ameriflux_selected_sites.txt');
  const logFile = path.join(tempDir, 'ameriflux_bulk_download.log');
  const binDir = buildScriptRuntimeBin(tempDir, { includePython3: false });

  writeExecutable(
    scriptPath,
    hooks.buildAmeriFluxBulkScriptText([
      { site_id: 'AR-Bal', data_product: 'FLUXNET', source_label: 'AmeriFlux' }
    ])
  );

  const result = childProcess.spawnSync(BASH_PATH, [scriptPath, outDir, sitesFile, logFile], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: binDir
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /This script requires jq or python3 to parse the AmeriFlux API response\./);
  assert.match(result.stderr, expectedJqGuidancePattern());
  assert.equal(fs.existsSync(sitesFile), false);
});

test('Download-all wrapper script delegates to both child scripts when both source partitions exist', () => {
  const script = hooks.buildDownloadAllSelectedScriptText({
    includeShuttle: true,
    includeAmeriFlux: true
  });

  assert.equal(script.includes('# Validated direct links are handled by download_shuttle_selected.sh.'), true);
  assert.equal(script.includes('# AmeriFlux API-backed surfaced products (FLUXNET, BASE, and FLUXNET2015) are downloaded via the AmeriFlux API.'), true);
  assert.equal(script.includes('if [ -f "./download_shuttle_selected.sh" ]; then'), true);
  assert.equal(script.includes('bash "./download_shuttle_selected.sh" || {'), true);
  assert.equal(script.includes('if [ -f "./download_ameriflux_selected.sh" ]; then'), true);
  assert.equal(script.includes('bash "./download_ameriflux_selected.sh" || {'), true);
  assert.equal(script.includes('echo "Bulk download complete."'), true);
});

test('Download-all wrapper script can be generated for Shuttle-only selections', () => {
  const script = hooks.buildDownloadAllSelectedScriptText({
    includeShuttle: true,
    includeAmeriFlux: false
  });

  assert.equal(script.includes('bash "./download_shuttle_selected.sh" || {'), true);
  assert.equal(script.includes('echo "No AmeriFlux API-backed selected sites to download."'), true);
  assert.equal(script.includes('bash "./download_ameriflux_selected.sh" || {'), false);
});

test('Download-all wrapper script can be generated for AmeriFlux API-only selections', () => {
  const script = hooks.buildDownloadAllSelectedScriptText({
    includeShuttle: false,
    includeAmeriFlux: true
  });

  assert.equal(script.includes('echo "No Shuttle-backed selected sites to download."'), true);
  assert.equal(script.includes('bash "./download_shuttle_selected.sh" || {'), false);
  assert.equal(script.includes('bash "./download_ameriflux_selected.sh" || {'), true);
});

test('Download-all bundle helper returns the wrapper and both child scripts', () => {
  const files = hooks.buildDownloadAllSelectedFileBundle({
    wrapperText: 'wrapper-script',
    ameriFluxText: 'ameriflux-script',
    shuttleText: 'shuttle-script'
  });

  assert.deepEqual(
    files.map((file) => file.filename),
    [
      'download_all_selected.sh',
      'download_ameriflux_selected.sh',
      'download_shuttle_selected.sh'
    ]
  );
  assert.deepEqual(
    files.map((file) => file.mimeType),
    [
      'text/x-shellscript;charset=utf-8',
      'text/x-shellscript;charset=utf-8',
      'text/x-shellscript;charset=utf-8'
    ]
  );
  assert.equal(files[0].text, 'wrapper-script');
  assert.equal(files[1].text, 'ameriflux-script');
  assert.equal(files[2].text, 'shuttle-script');
});

test('Browser-facing explorer markup does not include hardcoded AmeriFlux identity attributes', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.equal(explorerJs.includes('data-ameriflux-user-id='), false);
  assert.equal(explorerJs.includes('data-ameriflux-user-email='), false);
  assert.equal(explorerHtml.includes('mailto:trevorkeenan@berkeley.edu'), true);
  assert.equal(explorerHtml.includes('data-ameriflux-user-id='), false);
  assert.equal(explorerHtml.includes('data-ameriflux-user-email='), false);
  assert.equal(explorerJs.includes('value="trevorkeenan"'), false);
  assert.equal(explorerJs.includes('value="trevorkeenan@berkeley.edu"'), false);
});

test('Explorer GA4 tag is single-use and preserves custom event hooks', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.equal((explorerHtml.match(/googletagmanager\.com\/gtag\/js\?id=G-DXJ7N8LZEX/g) || []).length, 1);
  assert.equal((explorerHtml.match(/gtag\('config', 'G-DXJ7N8LZEX'/g) || []).length, 1);
  assert.equal(explorerHtml.includes("page_path: '/fluxnet-data-explorer/'"), true);
  assert.equal(explorerJs.includes('window.gtag("event", name, params || {})'), true);
  assert.equal(explorerJs.includes('"fx_row_download_click"'), true);
  assert.equal(explorerJs.includes('"fx_request_page_click"'), true);
  assert.equal(explorerJs.includes('"fx_landing_page_click"'), true);
  assert.equal(explorerJs.includes('gaEvent("fx_explorer_loaded"'), true);
});

test('Data Notes box appears between the map and attribution sections with shared box styling', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.css'), 'utf8');
  const mapIndex = explorerJs.indexOf('data-role=\\"map-panel\\"');
  const selectionActionsIndex = explorerJs.indexOf('data-role=\\"selection-actions\\"');
  const tableIndex = explorerJs.indexOf('data-role=\\"table-wrap\\"');
  const notesIndex = explorerJs.indexOf('<h3>Data Notes</h3>');
  const attributionIndex = explorerJs.indexOf('<h3>Data Use and Attribution</h3>');
  const citationIndex = explorerJs.indexOf('<h3>Citation and source</h3>');

  assert.equal(mapIndex < selectionActionsIndex, true);
  assert.equal(selectionActionsIndex < tableIndex, true);
  assert.equal(notesIndex > mapIndex, true);
  assert.equal(attributionIndex > notesIndex, true);
  assert.equal(citationIndex > attributionIndex, true);
  assert.equal(explorerJs.includes('These notes highlight how the explorer labels datasets and how the bulk tools behave.'), true);
  assert.equal(explorerJs.includes('Use the Availability filter options [FLUXNET processed], [Other processed], and [Sites with both FLUXNET and additional processed years]'), true);
  assert.equal(explorerJs.includes('Choose the Source filter option [FLUXNET-Shuttle]'), true);
  assert.equal(explorerJs.includes('EFD rows indicate known data records from the public EFD site and policy pages.'), true);
  assert.equal(explorerJs.includes('The explorer includes both gap-filled and partitioned data [FLUXNET] and non-gap-filled, non-partitioned observations [e.g., AmeriFlux-BASE].'), true);
  assert.equal(explorerJs.includes('The bulk-download scripts may require users to install a jq package if neither jq nor python3 are already installed.'), true);
  assert.equal(explorerJs.includes('data-role=\\"citation-source\\"'), true);
  assert.equal(explorerJs.includes('Keenan TF, 2026. FLUXNET Data Explorer (v1.0.0). Zenodo.'), true);
  assert.equal(explorerJs.includes('Live ' + 'app:'), false);
  assert.equal(explorerCss.includes('.shuttle-explorer__attribution ul {'), true);
  assert.equal(explorerCss.includes('.shuttle-explorer__attribution li + li {'), true);
});

test('Vegetation filter markup includes an IGBP info tooltip and external reference link', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.css'), 'utf8');

  assert.equal(explorerJs.includes('label id=\\"shuttle-vegetation-label\\">Veg. type</label>'), true);
  assert.equal(explorerJs.includes('data-role=\\"vegetation-info-wrap\\"'), true);
  assert.equal(explorerJs.includes('data-role=\\"vegetation-info-toggle\\"'), true);
  assert.equal(explorerJs.includes('aria-label=\\"About IGBP vegetation codes\\"'), true);
  assert.equal(explorerJs.includes('aria-expanded=\\"false\\"'), true);
  assert.equal(
    explorerJs.includes(
      'Vegetation codes follow IGBP classifications as outlined <a href=\\"https://fluxnet.org/data/badm-data-templates/igbp-classification/\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\">here</a>'
    ),
    true
  );
  assert.equal(explorerCss.includes('.shuttle-explorer__tooltip-wrap.is-open .shuttle-explorer__tooltip'), true);
  assert.equal(explorerCss.includes('.shuttle-explorer__tooltip {'), true);
});

test('Bulk tools layout keeps Shuttle and AmeriFlux action buttons in the intended order', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const shuttleRowStart = explorerJs.indexOf('data-role=\\"show-cli-command\\">Show Shuttle CLI command</button>"');
  const shuttleCopyCommand = explorerJs.indexOf('data-role=\\"copy-command\\">Copy Shuttle CLI command</button>"');
  const shuttleCopyLinks = explorerJs.indexOf('data-role=\\"copy-links\\">Copy Shuttle links</button>"');
  const ameriDownloadScript = explorerJs.indexOf('data-role=\\"download-ameriflux-script\\">Download download_ameriflux_selected.sh</button>"');
  const ameriSecondRowStart = explorerJs.indexOf('"    <div class=\\"shuttle-explorer__bulk-actions\\">",', ameriDownloadScript);
  const ameriCopyScript = explorerJs.indexOf('data-role=\\"copy-ameriflux-script\\">Copy AmeriFlux API shell script</button>"');
  const ameriSitesFile = explorerJs.indexOf('data-role=\\"download-ameriflux-sites-file\\">Download ameriflux_selected_sites.txt</button>"');

  assert.equal(shuttleRowStart > -1, true);
  assert.equal(shuttleCopyCommand > shuttleRowStart, true);
  assert.equal(shuttleCopyLinks > shuttleCopyCommand, true);

  assert.equal(ameriDownloadScript > -1, true);
  assert.equal(ameriSecondRowStart > ameriDownloadScript, true);
  assert.equal(ameriCopyScript > ameriSecondRowStart, true);
  assert.equal(ameriSitesFile > ameriCopyScript, true);
});

test('Data Policy Tools dropdown renders immediately after Bulk download tools with all export actions', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const bulkPanel = explorerJs.indexOf('data-role=\\"bulk-panel\\"');
  const policyPanel = explorerJs.indexOf('data-role=\\"policy-panel\\"');
  const tableWrap = explorerJs.indexOf('data-role=\\"table-wrap\\"');

  assert.equal(bulkPanel > -1, true);
  assert.equal(policyPanel > bulkPanel, true);
  assert.equal(tableWrap > policyPanel, true);
  assert.equal(explorerJs.includes('Data Policy Tools (citation table and acknowledgements)'), true);
  assert.equal(explorerJs.includes('data-role=\\"download-acknowledgement-doc\\"'), true);
  assert.equal(explorerJs.includes('data-role=\\"download-citation-table-doc\\"'), true);
  assert.equal(explorerJs.includes('data-role=\\"download-citation-bibtex\\"'), true);
  assert.equal(explorerJs.includes('data-role=\\"download-citation-latex\\"'), true);
  assert.equal(explorerJs.includes('data-role=\\"download-citation-csv\\"'), true);
});

test('Explorer page and runtime do not hardcode stale last-updated dates', () => {
  const explorerJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shuttle-explorer.js'), 'utf8');
  const explorerHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.equal(/last updated:\s*202\d-\d{2}-\d{2}/.test(explorerJs), false);
  assert.equal(/last updated:\s*202\d-\d{2}-\d{2}/.test(explorerHtml), false);
  assert.equal(/Available data is updated as of:\s*202\d-\d{2}-\d{2}/.test(explorerJs), false);
  assert.equal(/Explorer refreshed:\s*202\d-\d{2}-\d{2}/.test(explorerJs), false);
  assert.equal(/New data last added:\s*202\d-\d{2}-\d{2}/.test(explorerJs), false);
});

test('Committed snapshot layers normalize without dropped rows under the current schema assumptions', () => {
  [
    'assets/shuttle_snapshot.json',
    'assets/icos_direct_fluxnet.json',
    'assets/japanflux_direct_snapshot.json',
    'assets/efd_curated_sites_snapshot.json'
  ].forEach((relativePath) => {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    const normalized = hooks.normalizeRows(hooks.payloadJsonToObjects(payload));

    assert.equal(normalized.dropped, 0, relativePath + ' should not drop rows during normalization');
    assert.equal(normalized.rows.length, payload.rows.length, relativePath + ' should keep every committed row');
  });
});

test('Data policy tools use the exact selected row set and map Shuttle manifest citation metadata into every export', () => {
  const shuttleRow = makeCatalogRow({
    _selection_key: 'AmeriFlux|US-Ha1|download',
    site_id: 'US-Ha1',
    site_name: 'Harvard Forest',
    data_hub: 'AmeriFlux',
    network: 'AmeriFlux',
    source_network: 'AMF',
    network_display: 'AmeriFlux',
    source_origin: 'shuttle',
    product_id: '10.17190/AMF/1234567',
    product_citation: 'Example Team (2026), AmeriFlux FLUXNET-1F US-Ha1 Harvard Forest, (Dataset). https://doi.org/10.17190/AMF/1234567'
  });
  const unselectedRow = makeCatalogRow({
    _selection_key: 'ICOS|DE-Test|download',
    site_id: 'DE-Test'
  });
  const selected = hooks.getSelectedSitesForPolicyTools(
    [shuttleRow, unselectedRow],
    { 'AmeriFlux|US-Ha1|download': true }
  );
  const citationRows = hooks.buildCitationRows(selected);
  const acknowledgement = hooks.buildAcknowledgementHtml(selected, citationRows, new Date(2026, 5, 11));
  const citationDoc = hooks.buildCitationTableHtml(selected, citationRows);
  const bibtex = hooks.buildBibtex(selected, citationRows);
  const latex = hooks.buildLatexTable(selected, citationRows);
  const csv = hooks.buildCitationTableCsv(citationRows);

  assert.deepEqual(selected.map((row) => row.site_id), ['US-Ha1']);
  assert.equal(citationRows[0].productIdentifier, '10.17190/AMF/1234567');
  assert.match(citationRows[0].requiredCitation, /Example Team \(2026\)/);
  assert.match(citationRows[0].citationMetadataStatus, /authoritative Shuttle manifest/);
  assert.match(acknowledgement, /Funding for the AmeriFlux data service/);
  assert.match(acknowledgement, /June 11, 2026/);
  assert.match(citationDoc, /10\.17190\/AMF\/1234567/);
  assert.match(citationDoc, /Pastorello, G\. et al\. \(2020\)/);
  assert.equal((citationDoc.match(/10\.1038\/s41597-020-0534-3/g) || []).length, 1);
  assert.match(bibtex, /@dataset\{FLUXNET_USHa1_2026/);
  assert.match(bibtex, /doi = \{10\.17190\/AMF\/1234567\}/);
  assert.match(latex, /\\begin\{longtable\}/);
  assert.match(csv, /Site code,Site name,Product\/source network/);
});

test('Data policy exports deduplicate citations and add network-specific acknowledgements and references', () => {
  const sharedCitation = 'Shared dataset citation (2026). https://doi.org/10.1234/shared';
  const selected = [
    makeCatalogRow({ site_id: 'US-AMF', source_network: 'AMF', network: 'AmeriFlux', source_origin: 'shuttle', product_id: '10.1234/shared', product_citation: sharedCitation }),
    makeCatalogRow({ site_id: 'CN-CNF', source_network: 'CNF', network: 'ChinaFlux', source_origin: 'shuttle', product_id: '10.1234/shared', product_citation: sharedCitation }),
    makeCatalogRow({ site_id: 'JP-JPF', source_network: 'JPF', network: 'JapanFlux', source_origin: 'shuttle', product_id: '10.1234/jpf', product_citation: 'Japan citation (2026). https://doi.org/10.1234/jpf' }),
    makeCatalogRow({ site_id: 'AU-OZF', source_network: 'TERN', network: 'OzFlux', source_origin: 'shuttle', product_id: '10.1234/ozf', product_citation: 'OzFlux citation (2026). https://doi.org/10.1234/ozf' }),
    makeCatalogRow({ site_id: 'AU-TERN', source_network: 'TERN', network: 'TERN', source_origin: 'shuttle', product_id: '10.1234/tern', product_citation: 'TERN citation (2026). https://doi.org/10.1234/tern' })
  ];
  const citationRows = hooks.buildCitationRows(selected);
  const acknowledgement = hooks.buildAcknowledgementHtml(selected, citationRows, new Date(2026, 5, 11));
  const citationDoc = hooks.buildCitationTableHtml(selected, citationRows);
  const bibtex = hooks.buildBibtex(selected, citationRows);

  assert.deepEqual(hooks.detectNetworks(selected), ['AMF', 'CNF', 'JPF', 'OZF', 'TERN']);
  assert.match(acknowledgement, /National ecosystem science data center/);
  assert.match(acknowledgement, /OzFlux Data Portal/);
  assert.match(acknowledgement, /TERN Data Discovery Portal/);
  assert.match(citationDoc, /10\.1016\/j\.agrformet\.2006\.02\.011/);
  assert.match(citationDoc, /10\.5194\/essd-17-3807-2025/);
  assert.match(citationDoc, /10\.5194\/bg-13-5895-2016/);
  assert.match(citationDoc, /10\.5194\/bg-14-2903-2017/);
  assert.equal((bibtex.match(/@dataset/g) || []).length, 4);
  assert.equal((bibtex.match(/@article\{Beringer2016OzFlux/g) || []).length, 1);
  assert.equal((bibtex.match(/@article\{Isaac2017OzFlux/g) || []).length, 1);
});

test('Data policy tools represent missing non-Shuttle citation metadata without failing exports', () => {
  const selected = [
    makeCatalogRow({
      site_id: 'JP-Missing',
      source_origin: 'japanflux_direct',
      source_network: 'JapanFlux',
      network: 'JapanFlux',
      metadata_id: 'A20240722-001',
      citation: ''
    })
  ];
  const citationRows = hooks.buildCitationRows(selected);
  const warning = hooks.buildPolicyMissingWarning(citationRows);
  const citationDoc = hooks.buildCitationTableHtml(selected, citationRows);
  const bibtex = hooks.buildBibtex(selected, citationRows);
  const latex = hooks.buildLatexTable(selected, citationRows);

  assert.equal(citationRows[0].productIdentifier, 'A20240722-001');
  assert.match(citationRows[0].requiredCitation, /Citation\/DOI not available in Explorer metadata/);
  assert.match(citationRows[0].citationMetadataStatus, /Partial/);
  assert.match(warning, /JP-Missing/);
  assert.match(citationDoc, /JP-Missing/);
  assert.match(bibtex, /% Missing citation metadata for: JP-Missing/);
  assert.match(latex, /% WARNING: Citation\/DOI metadata are incomplete/);
  assert.deepEqual(hooks.getSelectedSitesForPolicyTools(selected, {}), []);
});

test('AmeriFlux V2 product citation metadata enriches FLUXNET and BASE records', () => {
  const lookup = hooks.buildSourceCitationMetadataLookup([
    {
      site_id: 'AR-Bal',
      data_product: 'FLUXNET',
      data_policy: 'CCBY4.0',
      citation_doi: '10.17190/AMF/2571144',
      citation_url: 'https://doi.org/10.17190/AMF/2571144',
      citation_text: 'Example Team (2026), AmeriFlux FLUXNET-1F AR-Bal, (Dataset). https://doi.org/10.17190/AMF/2571144',
      citation_source: 'AmeriFlux FLUXNET data-citation page'
    },
    {
      site_id: 'AR-Bal',
      data_product: 'BASE-BADM',
      data_policy: 'CCBY4.0',
      citation_doi: '10.17190/AMF/2315764',
      citation_url: 'https://doi.org/10.17190/AMF/2315764',
      citation_text: 'Example Team (2024), AmeriFlux BASE AR-Bal, (Dataset). https://doi.org/10.17190/AMF/2315764',
      citation_source: 'AmeriFlux BASE data-citation page'
    }
  ]);
  const fluxnetSites = hooks.enrichSitesWithCitationMetadata(
    [makeAvailabilitySite('AR-Bal', [2012, 2013])],
    lookup,
    'FLUXNET',
    'CCBY4.0'
  );
  const baseSites = hooks.enrichSitesWithCitationMetadata(
    [makeAvailabilitySite('AR-Bal', [2012, 2013])],
    lookup,
    'BASE-BADM',
    'CCBY4.0'
  );
  const fluxnetRow = hooks.mergeCatalogRows([], [], [], fluxnetSites, [], [], []).rows[0];
  const baseRow = hooks.mergeCatalogRows([], [], [], [], [], baseSites, []).rows[0];

  assert.equal(hooks.buildCitationRows([fluxnetRow])[0].productIdentifier, '10.17190/AMF/2571144');
  assert.match(hooks.buildCitationRows([fluxnetRow])[0].requiredCitation, /FLUXNET-1F AR-Bal/);
  assert.equal(hooks.buildCitationRows([baseRow])[0].productIdentifier, '10.17190/AMF/2315764');
  assert.match(hooks.buildCitationRows([baseRow])[0].requiredCitation, /AmeriFlux BASE AR-Bal/);
});

test('Data policy citation rows follow the same surfaced products used by bulk downloads', () => {
  const lookup = hooks.buildSourceCitationMetadataLookup([
    {
      site_id: 'US-Dual',
      data_product: 'FLUXNET',
      data_policy: 'CCBY4.0',
      citation_doi: '10.1234/fluxnet',
      citation_text: 'FLUXNET citation https://doi.org/10.1234/fluxnet'
    },
    {
      site_id: 'US-Dual',
      data_product: 'BASE-BADM',
      data_policy: 'CCBY4.0',
      citation_doi: '10.1234/base',
      citation_text: 'BASE citation https://doi.org/10.1234/base'
    }
  ]);
  const fluxnetSites = hooks.enrichSitesWithCitationMetadata(
    [makeAvailabilitySite('US-Dual', [2020, 2021])],
    lookup,
    'FLUXNET',
    'CCBY4.0'
  );
  const baseSites = hooks.enrichSitesWithCitationMetadata(
    [makeAvailabilitySite('US-Dual', [2020, 2021, 2022])],
    lookup,
    'BASE-BADM',
    'CCBY4.0'
  );
  const row = hooks.mergeCatalogRows([], [], [], fluxnetSites, [], baseSites, []).rows[0];
  const bulkProducts = hooks.partitionRowsByBulkSource([row]).ameriFluxRows;
  const citationRows = hooks.buildCitationRows([row]);

  assert.equal(bulkProducts.length, 2);
  assert.equal(citationRows.length, 2);
  assert.deepEqual(
    citationRows.map((citationRow) => citationRow.productIdentifier).sort(),
    ['10.1234/base', '10.1234/fluxnet']
  );
});

test('FLUXNET2015 DOI-only metadata produces explicit status and valid BibTeX', () => {
  const lookup = hooks.buildSourceCitationMetadataLookup([
    {
      site_id: 'AR-SLu',
      data_product: 'FLUXNET2015',
      data_policy: 'CCBY4.0',
      citation_doi: '10.18140/FLX/1440191',
      citation_url: 'https://doi.org/10.18140/FLX/1440191',
      citation_text: '',
      citation_source: 'FLUXNET2015 data-citation page'
    }
  ]);
  const sites = hooks.enrichSitesWithCitationMetadata(
    [makeAvailabilitySite('AR-SLu', [2009, 2010, 2011])],
    lookup,
    'FLUXNET2015',
    'CCBY4.0'
  );
  const row = hooks.mergeCatalogRows([], [], [], [], sites, [], []).rows[0];
  const citationRows = hooks.buildCitationRows([row]);
  const bibtex = hooks.buildBibtex([row], citationRows);

  assert.equal(citationRows[0].productIdentifier, '10.18140/FLX/1440191');
  assert.match(citationRows[0].citationMetadataStatus, /DOI available; full citation text not available/);
  assert.match(citationRows[0].requiredCitation, /Citation\/DOI not available in Explorer metadata/);
  assert.equal(hooks.buildPolicyMissingWarning(citationRows), '');
  assert.match(bibtex, /@dataset\{FLUXNET2015_ARSLu_Data/);
  assert.match(bibtex, /doi = \{10\.18140\/FLX\/1440191\}/);
});

test('Shuttle row normalization preserves manifest product citation and product ID fields', () => {
  const normalized = hooks.normalizeRows([
    {
      data_hub: 'AmeriFlux',
      site_id: 'US-Test',
      site_name: 'Test Site',
      network: 'AmeriFlux',
      product_source_network: 'AMF',
      first_year: '2001',
      last_year: '2003',
      download_link: 'https://example.org/test.zip',
      fluxnet_product_name: 'AMF_US-Test_FLUXNET_2001-2003.zip',
      product_citation: 'Test citation',
      product_id: '10.1234/test'
    }
  ]);

  assert.equal(normalized.rows[0].product_citation, 'Test citation');
  assert.equal(normalized.rows[0].product_id, '10.1234/test');
  assert.equal(normalized.rows[0].fluxnet_product_name, 'AMF_US-Test_FLUXNET_2001-2003.zip');
});

test('Explorer can build a snapshot-only merged state from committed artifacts when AmeriFlux live availability is unavailable', () => {
  const shuttleResult = loadSnapshotResult('assets/shuttle_snapshot.json');
  const icosResult = loadSnapshotResult('assets/icos_direct_fluxnet.json');
  const japanFluxResult = loadSnapshotResult('assets/japanflux_direct_snapshot.json');
  const efdResult = loadSnapshotResult('assets/efd_curated_sites_snapshot.json');
  const emptyAvailability = {
    totalSites: 0,
    sitesWithYears: 0,
    sites: [],
    warning: '',
    downloadWarning: '',
    freshnessKey: 'unavailable'
  };
  const merged = hooks.buildMergedSnapshotStateForRoot(
    'assets/shuttle_snapshot.json',
    shuttleResult,
    icosResult,
    japanFluxResult,
    efdResult,
    emptyAvailability,
    emptyAvailability,
    emptyAvailability,
    emptyLookupResult(),
    emptyLookupResult(),
    emptyLookupResult(),
    emptyLookupResult()
  );

  assert.equal(merged.rows.length > 0, true);
  assert.equal(merged.warning, '');
  assert.equal(merged.downloadWarning, '');
  assert.equal(merged.rows.some((row) => row.source_label === 'EFD'), true);
  assert.equal(merged.rows.some((row) => row.source_label === 'ICOS'), true);
  assert.equal(merged.rows.some((row) => row.source_label === 'JapanFlux'), true);
  assert.equal(merged.rows.some((row) => Array.isArray(row.source_filter_tags) && row.source_filter_tags.includes('AmeriFlux-Shuttle')), true);
  assert.equal(merged.rows.some((row) => row.latitude != null && row.longitude != null), true);
});

test('Merged snapshot state keeps explorer refresh date separate from carried-forward source freshness', () => {
  const shuttleResult = {
    rows: [makeCatalogRow({
      site_id: 'US-Carry',
      data_hub: 'AmeriFlux',
      source_label: 'AmeriFlux-Shuttle',
      source_origin: 'shuttle'
    })],
    droppedRows: 0,
    source: 'json',
    sourceUrl: 'assets/shuttle_snapshot.json',
    warning: hooks.buildSnapshotSourceStatusWarning({
      source_statuses: {
        AmeriFlux: {
          status: 'carried_forward',
          last_successful_refresh_date: '2026-04-21',
          reason: 'AmeriFlux candidate refresh returned no rows.'
        }
      }
    }),
    meta: {
      snapshot_refreshed_date: '2026-04-28',
      snapshot_updated_date: '2026-04-21',
      source_statuses: {
        AmeriFlux: {
          status: 'carried_forward',
          last_successful_refresh_date: '2026-04-21'
        }
      }
    }
  };
  const emptySnapshot = { rows: [], droppedRows: 0, warning: '', meta: {} };
  const emptyAvailability = {
    totalSites: 0,
    sitesWithYears: 0,
    sites: [],
    warning: '',
    downloadWarning: '',
    freshnessKey: 'unavailable'
  };
  const merged = hooks.buildMergedSnapshotStateForRoot(
    'assets/shuttle_snapshot.json',
    shuttleResult,
    emptySnapshot,
    emptySnapshot,
    emptySnapshot,
    emptyAvailability,
    emptyAvailability,
    emptyAvailability,
    emptyLookupResult(),
    emptyLookupResult(),
    emptyLookupResult(),
    emptyLookupResult()
  );

  assert.equal(merged.snapshotRefreshedDate, '2026-04-28');
  assert.equal(merged.snapshotUpdatedDate, '2026-04-21');
  assert.match(merged.warning, /AmeriFlux \(2026-04-21\) snapshot data is being carried forward/);
});

test('AmeriFlux availability failures degrade to snapshot-only mode for HTTP, network, and timeout failures', async () => {
  const originalFetch = global.fetch;
  const scenarios = [
    {
      name: 'http-503',
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        text: async () => 'service unavailable',
        headers: mockHeaders()
      })
    },
    {
      name: 'network-failure',
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      }
    },
    {
      name: 'timeout',
      fetchImpl: async (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
      maxDurationMs: 400
    }
  ];

  try {
    for (const scenario of scenarios) {
      global.fetch = scenario.fetchImpl;
      const source = hooks.createAmeriFluxSource({
        availabilityUrl: 'https://example.test/' + scenario.name,
        sourceLabel: 'AmeriFlux',
        freshnessNamespace: 'ameriflux-test',
        retryCount: 0,
        requestTimeoutMs: 25
      });
      const startedAt = Date.now();
      const result = await source.list_sites();

      assert.equal(result.totalSites, 0, scenario.name + ' should not surface stale live rows');
      assert.equal(result.sitesWithYears, 0, scenario.name + ' should not surface stale live rows');
      assert.deepEqual(result.sites, [], scenario.name + ' should fall back to local snapshot-only mode');
      assert.equal(
        result.warning,
        'AmeriFlux live availability is temporarily unavailable; showing committed snapshot data. Some live download actions may be temporarily unavailable.'
      );
      assert.equal(result.downloadWarning, result.warning);
      assert.match(result.freshnessKey, /^ameriflux-test:unavailable$/);
      if (scenario.maxDurationMs) {
        assert.equal(Date.now() - startedAt < scenario.maxDurationMs, true, scenario.name + ' should resolve promptly');
      }
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('Supplemental metadata loaders return warnings instead of rejecting when a supplemental CSV is malformed', async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async () => ({
      ok: true,
      text: async () => 'site_id,\"broken',
      headers: mockHeaders()
    });

    const siteNameResult = await hooks.loadSiteNameMetadata('https://example.test/site_name_metadata.csv');
    const vegetationResult = await hooks.loadVegetationMetadata('https://example.test/site_vegetation_metadata.csv');

    assert.deepEqual(siteNameResult.lookup, {});
    assert.match(siteNameResult.warning, /Site-name metadata unavailable/);
    assert.deepEqual(vegetationResult.lookup, {});
    assert.match(vegetationResult.warning, /Vegetation metadata unavailable/);
  } finally {
    global.fetch = originalFetch;
  }
});
