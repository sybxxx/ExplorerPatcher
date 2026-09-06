const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {}, URL, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'ep_weather_provider_data.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, 'ep_weather_provider_presentation.js'), 'utf8') +
  '\nglobalThis.tests = {finiteNumber, normalizeQMinutely, normalizeQHourly, localizedQWeatherText, minuteForecastView, datasetFailureDetails, qDatasetUrl, state};', sandbox);
const t = sandbox.tests;
for (const value of [null, undefined, '', ' ']) assert.equal(t.finiteNumber(value), null);
assert.equal(t.finiteNumber('0'), 0);
assert.equal(t.localizedQWeatherText({text: 'Sunny', code: '100'}, true), '\u6674');
assert.equal(t.localizedQWeatherText({text: 'Sunny', code: '100'}, false), 'Sunny');
assert.equal(t.localizedQWeatherText({text: '\u6674', code: '100'}, true), '\u6674');
assert.equal(t.localizedQWeatherText({text: 'New condition', code: 'unknown'}, true), '\u672a\u77e5\u5929\u6c14');
t.state.language = 'zh-CN';
t.state.coords = {lat: 26.89, lon: 112.57};
t.state.apiHost = 'preview.qweatherapi.com';
for (const name of ['current', 'hourly', 'daily', 'minutely', 'alerts', 'air']) {
  assert.equal(new URL(t.qDatasetUrl(name)).searchParams.get('lang'), 'zh');
}
const now = Date.parse('2026-09-06T20:00:00+08:00');
const minute = t.normalizeQMinutely({code:'200', minutely: [
  {fxTime: '2026-09-06T19:55:00+08:00', precip:'1'},
  {fxTime: '2026-09-06T20:00:00+08:00', precip:'0.08'},
  {fxTime: '2026-09-06T20:05:00+08:00', precip:'0'}
]});
const dry = [{time:'2026-09-06T20:00:00+08:00', pop:0, precip:0}];
let view = t.minuteForecastView(minute, now);
assert.equal(view.points.length, 2);
assert.equal(view.points[0].precip, .08);
assert.equal(view.total, .08);
assert.equal(view.raining, true);
assert.equal(view.rainStart, '2026-09-06T20:00:00+08:00');
assert.equal(view.rainEnd, '2026-09-06T20:00:00+08:00');
assert.equal(t.minuteForecastView(minute, now + 3 * 3600000).available, false);
assert.equal(t.normalizeQMinutely({code:'200'}).available, false);
assert.equal(t.normalizeQMinutely({code:'204'}).available, false);
assert.equal(t.normalizeQMinutely({minutely:[{fxTime:dry[0].time}]}).points[0].precip, null);
const diagnostic = t.datasetFailureDetails({air:'HTTP 403', alerts:'Fetch https://secret.example/key failed'}, true);
assert.ok(diagnostic.includes('403'));
assert.ok(diagnostic.includes('\u5b98\u65b9\u9884\u8b66'));
assert.ok(!diagnostic.includes('secret'));
console.log('Weather presentation regressions passed.');
