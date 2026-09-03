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
  'weather-glyph current-glyph',
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
  normalizeQAlerts, normalizeQAir, normalizeOpenMeteo, validQWeatherHost
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

assert.strictEqual(normalizers.validQWeatherHost('abc123.qweatherapi.com'), true);
assert.strictEqual(normalizers.validQWeatherHost('qweatherapi.com.evil.example'), false);
assert.strictEqual(normalizers.validQWeatherHost('https://abc123.qweatherapi.com'), false);

const hostSource = fs.readFileSync(hostPath, 'utf8');
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
for (const text of [
  'add_WebResourceRequested',
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

const configSource = fs.readFileSync(configPath, 'utf8');
for (const text of ['CryptProtectData', 'CryptUnprotectData', 'REG_BINARY', '.qweatherapi.com']) {
  if (!configSource.includes(text)) throw new Error(`Missing credential protection: ${text}`);
}
for (const settingsPath of settingsPaths) {
  const settings = fs.readFileSync(settingsPath, 'utf8');
  if (settings.includes('WeatherQWeatherApiKeyProtected') || settings.includes('WeatherQWeatherApiHost')) {
    throw new Error('QWeather credentials must not be included in settings export templates.');
  }
}

console.log(JSON.stringify({
  htmlLength: html.length,
  scriptLength: scriptEnd - scriptStart,
  stringLiteralCount: bodies.length,
  iconGlyphs: Object.keys(embeddedIconMap).length,
  hourlyPoints: hourly.length,
  status: 'ok'
}));
