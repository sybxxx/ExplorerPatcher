const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const headerPath = path.join(root, 'ep_weather_provider_open_meteo_html.h');
const dataPath = path.join(root, 'ep_weather_provider_data.js');
const iconFontPath = path.join(root, 'assets', 'qweather-icons-1.8.0.woff2');
const iconMapPath = path.join(root, 'assets', 'qweather-icons-1.8.0.json');
const hostPath = path.join(root, 'ep_weather_host.c');
const configPath = path.join(root, '..', 'ExplorerPatcher', 'weather_qweather_config.c');
const settingsPaths = [
  path.join(root, '..', 'ep_gui', 'resources', 'settings.reg'),
  path.join(root, '..', 'ep_gui', 'resources', 'settings10.reg')
];

childProcess.execFileSync(process.execPath, [path.join(root, 'generate_weather_provider_header.js'), '--check']);

const source = fs.readFileSync(headerPath, 'utf8').replace(/\r?\n/g, '\n');
const start = source.indexOf('static const WCHAR ep_weather_provider_open_meteo_html[]');
const end = source.indexOf('\n;', start);
if (start < 0 || end < 0) throw new Error('Weather HTML declaration was not found.');
const region = source.slice(start, end);
const bodies = [...region.matchAll(/L"((?:\\.|[^"\\])*)"/g)].map((match) => match[1]);
if (!bodies.length) throw new Error('No C string literals were found.');

const decodedBodies = bodies.map((body) => JSON.parse(`"${body}"`));
assert.ok(decodedBodies.every((body) => body.length <= 8000), 'Generated C string literal exceeds the MSVC-safe limit');
const html = decodedBodies.join('');
const scriptStart = html.indexOf('<script>') + '<script>'.length;
const scriptEnd = html.indexOf('</script>', scriptStart);
if (scriptStart < '<script>'.length || scriptEnd < 0) {
  throw new Error('Weather HTML does not contain a complete script element.');
}
new vm.Script(html.slice(scriptStart, scriptEnd));

for (const text of [
  '/weather/v1/current/',
  '/weather/v1/hourly/',
  'hours: 24',
  '/weather/v1/daily/',
  '/v7/minutely/5m',
  '/weatheralert/v1/current/',
  '/airquality/v1/current/',
  '/geo/v2/city/lookup',
  'ep_weather_auto_location|',
  'ep_weather_windows_location|',
  'ep_weather_windows_network_location|',
  'LOCATION_MODE_WINDOWS_NETWORK',
  'normalizeWindowsLocation',
  'normalizeWindowsNetworkLocation',
  'requestDirectIpLocation',
  'normalizeDirectIpLocation',
  'resolveAutomaticLocation',
  'AUTO_LOCATION_REQUEST_TIMEOUT',
  'Direct IP',
  'Promise.allSettled',
  'AbortController',
  'DATASET_TTL',
  'slice(0, 24)',
  'precipitationProbability',
  'normalizeQAlerts',
  'normalizeQAir',
  'QWEATHER_ICON_GLYPHS',
  'data:font/woff2;base64,',
  'function weatherIconCode',
  'function initializeWeatherIconFont',
  'function alertIdentity',
  'let alertsRenderSignature = \'\'',
  'const previousState = new Map',
  'const activeKeys = new Set',
  'alertOpenStates: new Map()',
  'details.dataset.alertKey',
  'elements.alerts.contains(details)',
  'return results.some((result) => result.status === \'rejected\' || result.value !== null)',
  'let changed = false',
  'window.epWeatherRefresh = refreshWeatherNow',
  'MANUAL_REFRESH_COOLDOWN',
  'refreshWeatherNow',
  'theme-button',
  'refresh-button',
  'hero-range',
  'hero-summary',
  'minute-thresholds',
  'hour-prob-medium',
  'pollutant-primary',
  'air-lead',
  'monitoring',
  'detail-wind .detail-value',
  'state.place.province',
  'renderHero(item)',
  'renderMetrics(item)',
  'weather-glyph current-glyph',
  'theme-button',
  'refresh-button',
  'window.epWeatherRefresh',
  'notifyNativeTheme',
  'ep_weather_theme_dark',
  'ep_weather_theme_light',
  'ep_weather_auto_location_result|',
  'ep_weather_auto_location_error|',
  'ep_weather_location_result|',
  'ep_weather_location_error|',
  'positionSource',
  'Windows location returned IP source',
  'windowsIpLocationError',
  'windowsNetworkLocation',
  'windowsNetworkLocationSource',
  'Windows Network Approximate',
  'MANUAL_REFRESH_COOLDOWN',
  'refreshWeatherNow',
  'hero-range',
  'hero-summary',
  'detail-meter',
  'minute-thresholds',
  'hour-prob-medium',
  'pollutant-primary',
  'air-lead',
  'detail-wind',
  'tomorrow',
  'state.place.province',
  'overflow-y: auto',
  'scrollbar-gutter: stable',
  'QWeather Icons',
  'const NATIVE_VIEWPORT_HEIGHT = 367',
  'ep_weather_updated',
  'function imageHex',
  'ep_pending',
  'ep_error'
]) {
  if (!html.includes(text)) throw new Error(`Missing required provider behavior: ${text}`);
}
assert.ok(!html.includes('function contentHeight'), 'The provider must not report dynamic content height.');
assert.match(html, /#\$\{NATIVE_VIEWPORT_HEIGHT\}#/);
assert.match(html, /postMessage\(theme === 'dark'[\s\S]*?ep_weather_theme_dark/);
assert.match(html, /summary\.addEventListener\('click', \(\) => \{[\s\S]*?state\.alertOpenStates\.set\(key, !details\.open\);[\s\S]*?\}\);/);
assert.match(html, /details\.addEventListener\('toggle', \(\) => \{[\s\S]*?state\.alertOpenStates\.set\(key, details\.open\);[\s\S]*?\}\);/);
assert.ok(!html.includes("details.addEventListener('toggle', notifyHost)"), 'Alert disclosure must not trigger a native taskbar recapture.');
assert.match(html, /const changed = await refreshDue\(true\)/);
assert.match(html, /state\.status !== 'ready'/);
assert.match(html, /const disabled = manualRefreshInFlight \|\| !state\.coords \|\| state\.status !== 'ready' \|\| remaining > 0/);
for (const forbidden of ['www.google.com/search', '<iframe', 'X-QW-Api-Key', './assets/qweather-icons', "addEventListener('wheel'"]) {
  if (html.includes(forbidden)) throw new Error(`Forbidden provider content: ${forbidden}`);
}
assert.ok(!html.includes('drawFallbackWeatherIcon'), 'Weather icons must use the official QWeather font');

const iconFont = fs.readFileSync(iconFontPath);
assert.strictEqual(iconFont.subarray(0, 4).toString('ascii'), 'wOF2');
const embeddedFont = html.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/);
assert.ok(embeddedFont, 'Embedded QWeather icon font was not found');
assert.deepStrictEqual(Buffer.from(embeddedFont[1], 'base64'), iconFont);
const iconMap = JSON.parse(fs.readFileSync(iconMapPath, 'utf8'));
for (const name of ['100', '100-fill', '306', '306-fill', '999']) {
  assert.ok(Number.isInteger(iconMap[name]), `Missing official QWeather icon mapping: ${name}`);
}
const embeddedMapMatch = html.match(/const QWEATHER_ICON_GLYPHS = Object\.freeze\((\{[^;]+\})\);/);
assert.ok(embeddedMapMatch, 'Embedded QWeather weather icon map was not found');
const embeddedIconMap = JSON.parse(embeddedMapMatch[1]);
for (const name of ['100', '100-fill', '306', '306-fill', '999']) {
  assert.strictEqual(embeddedIconMap[name], iconMap[name], `Wrong embedded QWeather icon mapping: ${name}`);
}
assert.ok(!Object.prototype.hasOwnProperty.call(embeddedIconMap, '1001'), 'Non-weather QWeather icon glyphs should not be embedded');

const dataSource = fs.readFileSync(dataPath, 'utf8');
assert.match(dataSource, /if \(!force && now < \(state\.nextDue\[name\] \|\| 0\)\) return null;/);
assert.match(dataSource, /if \(now < state\.qBackoffUntil\) return null;/);
assert.match(dataSource, /province: textValue\(pick\(row, \['adm1', 'province', 'state'\]\)\)/);
assert.match(dataSource, /return changed;\s*}\s*async function initializeWeather/);
const sandbox = {
  AbortController,
  URL,
  clearInterval,
  clearTimeout,
  console,
  setInterval: () => 1,
  setTimeout,
  window: { fetch: async () => { throw new Error('Unexpected network call'); } }
};
vm.createContext(sandbox);
vm.runInContext(`${dataSource}\n;globalThis.weatherTests = {
  normalizeQCurrent, normalizeQHourly, normalizeQDaily, normalizeQMinutely,
  normalizeQAlerts, normalizeQAir, normalizeOpenMeteo, validQWeatherHost,
  normalizeDirectIpLocation, normalizeWindowsLocation, normalizeWindowsNetworkLocation
};`, sandbox);
const normalizers = sandbox.weatherTests;

const current = normalizers.normalizeQCurrent({
  condition: { code: '101', text: '\u591a\u4e91' },
  temperature: { value: 29, unit: '\u00b0C' },
  feelsLike: { value: 33, unit: '\u00b0C' },
  humidity: 0.74,
  wind: { direction: { compass: 'se' }, speed: { value: 3, unit: 'm/s' } },
  precipitation: { amount: { value: 0.2, unit: 'mm' } },
  visibility: { value: 18000, unit: 'm' }
});
assert.strictEqual(current.temp, 29);
assert.strictEqual(current.text, '\u591a\u4e91');
assert.strictEqual(current.visibility, 18);
assert.strictEqual(current.humidity, 74);
assert.strictEqual(Math.round(current.windSpeed * 10) / 10, 10.8);

const hourly = normalizers.normalizeQHourly({ hours: Array.from({ length: 24 }, (_, index) => ({
  forecastTime: `2026-09-02T${String(index).padStart(2, '0')}:00+08:00`,
  temperature: { value: 24 + index / 10, unit: '\u00b0C' },
  precipitation: { probability: index / 100, amount: { value: 0.1, unit: 'mm' } },
  condition: { code: '305', text: '\u5c0f\u96e8' }
})) });
assert.strictEqual(hourly.length, 24);
assert.strictEqual(hourly[23].pop, 23);

const daily = normalizers.normalizeQDaily({ days: [{
  forecastStartTime: '2026-09-02T00:00+08:00',
  temperatureMax: { value: 31, unit: '\u00b0C' },
  temperatureMin: { value: 24, unit: '\u00b0C' },
  daytime: { condition: { code: '305', text: '\u5c0f\u96e8' }, precipitation: { probability: 0.72 } }
}] });
assert.strictEqual(daily[0].date, '2026-09-02');
assert.strictEqual(daily[0].pop, 72);
const utcDaily = normalizers.normalizeQDaily({ days: [{
  forecastStartTime: '2026-09-01T16:00Z',
  forecastEndTime: '2026-09-02T16:00Z',
  temperatureMax: { value: 30, unit: '\u00b0C' },
  temperatureMin: { value: 23, unit: '\u00b0C' },
  daytime: { condition: { code: '101', text: '\u591a\u4e91' } }
}] });
assert.strictEqual(utcDaily[0].date, '2026-09-02');

const minutely = normalizers.normalizeQMinutely({
  summary: '\u672a\u6765\u4e24\u5c0f\u65f6\u6709\u96e8',
  minutely: [{ fxTime: '2026-09-02T12:05+08:00', precip: '0.4', type: 'rain' }],
  refer: { sources: ['QWeather'] }
});
assert.strictEqual(minutely.points[0].precip, 0.4);
assert.deepStrictEqual(Array.from(minutely.refer.sources), ['QWeather']);
assert.strictEqual(normalizers.normalizeQMinutely({ code: '204' }).available, false);

const alerts = normalizers.normalizeQAlerts({ alerts: [{
  id: 'a1', senderName: '\u8861\u9633\u5e02\u6c14\u8c61\u53f0', severity: 'severe',
  headline: '\u66b4\u96e8\u6a59\u8272\u9884\u8b66', eventType: { name: '\u66b4\u96e8' },
  issuedTime: '2026-09-02T12:00+08:00', expireTime: '2026-09-02T18:00+08:00',
  description: 'detail', criteria: 'standard', instruction: 'guide'
}] });
assert.strictEqual(alerts.items[0].standard, 'standard');
assert.strictEqual(alerts.items[0].instruction, 'guide');
assert.strictEqual(alerts.items[0].sender, '\u8861\u9633\u5e02\u6c14\u8c61\u53f0');

const air = normalizers.normalizeQAir({
  indexes: [{ code: 'cn-mee', aqi: 42, category: '\u4f18', health: { advice: { generalPopulation: 'Good' } } }],
  pollutants: [{ code: 'pm2p5', name: 'PM2.5', concentration: { value: 12, unit: 'ug/m3' } }]
});
assert.strictEqual(air.aqi, 42);
assert.strictEqual(air.pollutants[0].value, 12);
assert.strictEqual(air.advice, 'Good');

const directLocation = normalizers.normalizeDirectIpLocation({
  latitude: 26.89,
  longitude: 112.57,
  city: '\u8861\u9633\u5e02',
  region: '\u6e56\u5357\u7701',
  country: '\u4e2d\u56fd'
});
assert.strictEqual(directLocation.lat, 26.89);
assert.strictEqual(directLocation.lon, 112.57);
assert.strictEqual(directLocation.name, '\u8861\u9633\u5e02');
assert.strictEqual(directLocation.city, '\u8861\u9633\u5e02');
assert.strictEqual(directLocation.province, '\u6e56\u5357\u7701');
assert.strictEqual(directLocation.country, '\u4e2d\u56fd');
assert.strictEqual(directLocation.source, 'Direct IP');
assert.strictEqual(directLocation.accuracyMeters, 0);
assert.throws(
  () => normalizers.normalizeDirectIpLocation({ latitude: 91, longitude: 112 }),
  /Invalid direct IP location/
);

const windowsLocation = normalizers.normalizeWindowsLocation({
  latitude: 26.89,
  longitude: 112.57,
  accuracyMeters: 35,
  positionSource: 2
});
assert.strictEqual(windowsLocation.lat, 26.89);
assert.strictEqual(windowsLocation.lon, 112.57);
assert.strictEqual(windowsLocation.accuracyMeters, 35);
assert.strictEqual(windowsLocation.positionSource, 2);
assert.strictEqual(windowsLocation.source, 'Windows Location');
assert.throws(
  () => normalizers.normalizeWindowsLocation({ latitude: 26.89, longitude: 112.57, accuracyMeters: 50001, positionSource: 2 }),
  /Windows location is not accurate enough/
);
assert.throws(
  () => normalizers.normalizeWindowsLocation({ latitude: 26.89, longitude: 112.57, accuracyMeters: 35 }),
  /Windows location is not accurate enough/
);
assert.throws(
  () => normalizers.normalizeWindowsLocation({ latitude: 26.89, longitude: 112.57, accuracyMeters: 35, positionSource: 3 }),
  /Windows location is not accurate enough/
);
const windowsNetworkLocation = normalizers.normalizeWindowsNetworkLocation({
  latitude: 26.89,
  longitude: 112.57,
  accuracyMeters: 4909,
  positionSource: 3
});
assert.strictEqual(windowsNetworkLocation.positionSource, 3);
assert.strictEqual(windowsNetworkLocation.source, 'Windows Network Approximate');

assert.strictEqual(normalizers.validQWeatherHost('abc123.qweatherapi.com'), true);
assert.strictEqual(normalizers.validQWeatherHost('qweatherapi.com.evil.example'), false);
assert.strictEqual(normalizers.validQWeatherHost('https://abc123.qweatherapi.com'), false);

const hostSource = fs.readFileSync(hostPath, 'utf8');
const locationSource = fs.readFileSync(path.join(root, 'ep_weather_location.cpp'), 'utf8');
assert.match(
  hostSource,
  /InterlockedExchange64\(&_this->bAllowEmbeddedNavigation, TRUE\)[\s\S]*?NavigateToString/
);
assert.match(
  hostSource,
  /BOOL bIsEmbeddedNavigation[\s\S]*?_wcsnicmp\(wszUri, L"data:text\/html", 14\)[\s\S]*?InterlockedCompareExchange64\(&_this->bAllowEmbeddedNavigation, FALSE, TRUE\)/
);
assert.match(hostSource, /!bIsEmbeddedNavigation && _wcsicmp\(wszUri, L"about:blank"\)/);
assert.match(
  hostSource,
  /int ch = MulDiv\(MulDiv\(MulDiv\(EP_WEATHER_HEIGHT, dpi, 96\), dwTextScaleFactor, 100\), dwZoomFactor, 100\);/
);
assert.ok(!hostSource.includes('int ch = MulDiv(h, EP_WEATHER_HEIGHT, 367);'), 'The native host must not resize from reported content height.');
assert.ok(hostSource.includes('_ep_Weather_ReboundBrowser(_this, bIsErrorPage);'), 'Fixed viewport changes must rebound WebView2 bounds.');
const providerErrorMarker = 'else if (!_wcsicmp(pResultObjectAsJson, L"\\\"ep_error\\\""))';
const providerErrorStart = hostSource.indexOf(providerErrorMarker);
const providerErrorEnd = hostSource.indexOf('else\n            {', providerErrorStart);
if (providerErrorStart < 0 || providerErrorEnd < 0) throw new Error('Provider error branch was not found.');
const providerErrorBranch = hostSource.slice(providerErrorStart, providerErrorEnd);
assert.ok(providerErrorBranch.includes('Provider rendered an error; keeping its document.'), 'Provider errors must remain in the embedded document.');
assert.ok(providerErrorBranch.includes('InterlockedExchange64(&_this->bBrowserBusy, FALSE)'), 'Provider errors must release the native busy state.');
assert.ok(!providerErrorBranch.includes('_epw_Weather_NavigateToError'), 'Provider errors must not navigate to the legacy error page.');
for (const text of [
  'add_WebResourceRequested',
  'ep_weather_theme_dark',
  'ep_weather_theme_light',
  'PostMessageW(_this->hWnd, EP_WEATHER_WM_SET_NATIVE_THEME',
  'epw_Weather_SetDarkMode(_this, wParam ? 2 : 1, FALSE)',
  'EP_WEATHER_WM_SET_NATIVE_THEME',
  'epw_Weather_ApplyNativeThemeColors',
  'DWMWA_CAPTION_COLOR',
  'DWMWA_TEXT_COLOR',
  'DWMWA_BORDER_COLOR',
  'RGB(23, 27, 33)',
  'SetHeader(headers, L"X-QW-Api-Key", apiKey)',
  'EPQWeather_IsRequestUriForHost',
  'EP_WEATHER_WM_CAPTURE_DATA',
  'add_WebMessageReceived',
  '--disable-site-isolation-trials --disable-web-security --allow-insecure-localhost',
  'qweatherConfigured = EPQWeather_IsConfigured',
  'epw_Weather_NavigateToString',
  'bAllowEmbeddedNavigation',
  'data:text/html',
  'InterlockedCompareExchange64'
]) {
  if (!hostSource.includes(text)) throw new Error(`Missing native host protection: ${text}`);
}
for (const text of [
  'INTERNET_OPEN_TYPE_DIRECT',
  'https://ipwho.is/',
  'INTERNET_OPTION_CONNECT_TIMEOUT',
  'GetNamedNumber',
  'EP_WEATHER_WM_AUTO_LOCATION_RESULT',
  'EPWeather_BeginDirectIpLocation'
]) {
  if (!locationSource.includes(text) && !hostSource.includes(text)) {
    throw new Error(`Missing direct IP location protection: ${text}`);
  }
}
for (const text of [
  'RuntimeClass_Windows_Devices_Geolocation_Geolocator',
  'GetGeopositionAsyncWithAgeAndTimeout',
  'IGeocoordinateWithPositionData',
  'PositionSource_IPAddress',
  'PositionSource_WiFi',
  'EPWeather_BeginWindowsLocation',
  'EPWeather_BeginWindowsNetworkLocation',
  'ep_weather_windows_network_location|',
  'accuracyMeters'
]) {
  if (!locationSource.includes(text) && !hostSource.includes(text)) {
    throw new Error(`Missing Windows native location protection: ${text}`);
  }
}
assert.ok(!locationSource.includes('DirectLocationRequest'), 'The location worker should be shared by both native modes');
assert.ok(!locationSource.includes('CLSID_Location'), 'The deprecated Location API must not be the primary native provider');
assert.ok(!locationSource.includes('INTERNET_OPEN_TYPE_PRECONFIG'), 'Direct IP lookup must not use the system proxy');

async function verifyNativeLocationModes(source) {
  const nativeMessageListeners = [];
  const postedMessages = [];
  let nextWindowsAccuracy = 120;
  const sandbox = {
    AbortController,
    URL,
    clearInterval,
    clearTimeout,
    console,
    setInterval: () => 1,
    setTimeout,
    window: {
      fetch: async () => { throw new Error('Unexpected network call'); }
    }
  };
  sandbox.window.chrome = { webview: {
    addEventListener: (type, listener) => {
      if (type === 'message') nativeMessageListeners.push(listener);
    },
    postMessage: (message) => {
      postedMessages.push(message);
      const windowsNetworkPrefix = 'ep_weather_windows_network_location|';
      const windowsPrefix = 'ep_weather_windows_location|';
      const directPrefix = 'ep_weather_auto_location|';
      const isWindowsNetwork = message.startsWith(windowsNetworkPrefix);
      const isWindows = message.startsWith(windowsPrefix);
      const prefix = isWindowsNetwork ? windowsNetworkPrefix : isWindows ? windowsPrefix : directPrefix;
      if (!isWindowsNetwork && !isWindows && !message.startsWith(directPrefix)) throw new Error(`Unexpected native message: ${message}`);
      const requestId = message.slice(prefix.length);
      const payload = JSON.stringify({
        ok: true,
        latitude: 26.89,
        longitude: 112.57,
        accuracyMeters: isWindowsNetwork ? 4909 : isWindows ? nextWindowsAccuracy : 0,
        positionSource: isWindowsNetwork || !isWindows ? 3 : 2
      });
      for (const listener of nativeMessageListeners) {
        listener({ data: `ep_weather_location_result|${requestId}|${payload}` });
      }
    }
  } };
  vm.createContext(sandbox);
  vm.runInContext(`${source}\n;globalThis.locationTests = { state, resolveAutomaticLocation };`, sandbox);

  const windowsLocation = await sandbox.locationTests.resolveAutomaticLocation(0);
  assert.ok(postedMessages[0].startsWith('ep_weather_windows_location|'), 'Default automatic mode must use Windows location');
  assert.strictEqual(windowsLocation.source, 'Windows Location');
  assert.strictEqual(windowsLocation.accuracyMeters, 120);

  sandbox.locationTests.state.locationMode = 2;
  const directLocation = await sandbox.locationTests.resolveAutomaticLocation(0);
  assert.ok(postedMessages[1].startsWith('ep_weather_auto_location|'), 'Direct IP must remain an explicit mode');
  assert.strictEqual(directLocation.source, 'Direct IP');

  sandbox.locationTests.state.locationMode = 4;
  const windowsNetworkLocation = await sandbox.locationTests.resolveAutomaticLocation(0);
  assert.ok(postedMessages[2].startsWith('ep_weather_windows_network_location|'), 'Windows network approximate mode must use its explicit native message');
  assert.strictEqual(windowsNetworkLocation.source, 'Windows Network Approximate');

  sandbox.locationTests.state.locationMode = 0;
  nextWindowsAccuracy = 50001;
  await assert.rejects(
    sandbox.locationTests.resolveAutomaticLocation(0),
    /Windows location is not accurate enough/
  );
}

const configSource = fs.readFileSync(configPath, 'utf8');
for (const text of ['CryptProtectData', 'CryptUnprotectData', 'REG_BINARY', '.qweatherapi.com']) {
  if (!configSource.includes(text)) throw new Error(`Missing credential protection: ${text}`);
}
for (const settingsPath of settingsPaths) {
  const settings = fs.readFileSync(settingsPath, 'utf8');
  if (settings.includes('WeatherQWeatherApiKeyProtected') || settings.includes('WeatherQWeatherApiHost')) {
    throw new Error('QWeather credentials must not be included in settings export templates.');
  }
  assert.match(settings, /;c 4 %R:1576%/);
  assert.match(settings, /;x 4 %R:1580%/);
}

verifyNativeLocationModes(dataSource).then(() => {
  console.log(JSON.stringify({
    htmlLength: html.length,
    scriptLength: scriptEnd - scriptStart,
    stringLiteralCount: bodies.length,
    iconGlyphs: Object.keys(embeddedIconMap).length,
    hourlyPoints: hourly.length,
    status: 'ok'
  }));
}).catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
