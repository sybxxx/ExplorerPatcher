const fs = require('fs');
const path = require('path');
const { buildHtml } = require('./generate_weather_provider_header');

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'output', 'playwright', 'weather-qweather-preview.html');

const mockBootstrap = String.raw`<script>
(function() {
  const scenario = new URLSearchParams(window.location.search).get('scenario') || 'ok';
  const hour = 60 * 60 * 1000;
  const now = new Date('2026-09-02T14:00:00+08:00');
  const iso = (date) => date.toISOString().replace('.000Z', '+00:00');
  const hourly = Array.from({ length: 24 }, (_, index) => ({
    forecastTime: iso(new Date(now.getTime() + index * hour)),
    temperature: { value: 28 - Math.sin(index / 5) * 4, unit: '\u00b0C' },
    feelsLike: { value: 31 - Math.sin(index / 5) * 4, unit: '\u00b0C' },
    humidity: (72 + index % 8) / 100,
    wind: { direction: { compass: 'se' }, speed: { value: (9 + index % 5) / 3.6, unit: 'm/s' } },
    precipitation: { amount: { value: index >= 3 && index <= 8 ? 0.8 : 0, unit: 'mm' }, probability: (index >= 2 && index <= 9 ? Math.min(92, 18 + index * 9) : 8) / 100, type: 'rain' },
    condition: { code: index >= 3 && index <= 8 ? '305' : index > 10 ? '101' : '104', text: index >= 3 && index <= 8 ? '\u5c0f\u96e8' : index > 10 ? '\u591a\u4e91' : '\u9634' }
  }));
  const minutely = Array.from({ length: 24 }, (_, index) => ({
    fxTime: iso(new Date(now.getTime() + index * 5 * 60 * 1000)),
    precip: index >= 5 && index <= 15 ? ((index - 4) * 0.08).toFixed(2) : '0.00',
    type: 'rain'
  }));
  const payloads = {
    geo: { code: '200', location: [{ name: '\u84b8\u6e58\u533a', adm2: '\u8861\u9633\u5e02', adm1: '\u6e56\u5357\u7701', country: '\u4e2d\u56fd', lat: '26.89', lon: '112.57' }] },
    current: { metadata: { attributions: ['https://developer.qweather.com/attribution.html'] }, condition: { code: '104', text: '\u9634' }, temperature: { value: 29, unit: '\u00b0C' }, feelsLike: { value: 33, unit: '\u00b0C' }, humidity: 0.78, wind: { direction: { compass: 'se' }, speed: { value: 3.06, unit: 'm/s' } }, precipitation: { amount: { value: 0.1, unit: 'mm' }, type: 'rain' }, pressure: { value: 998, unit: 'hPa' }, visibility: { value: 16000, unit: 'm' }, cloudCover: 0.82, dewPoint: { value: 23, unit: '\u00b0C' } },
    hourly: { metadata: { attributions: ['https://developer.qweather.com/attribution.html'] }, hours: hourly },
    daily: { metadata: { attributions: ['https://developer.qweather.com/attribution.html'] }, days: Array.from({ length: 5 }, (_, index) => ({ forecastStartTime: '2026-09-0' + (2 + index) + 'T00:00+08:00', astro: { sunrise: '06:10', sunset: '18:50' }, temperatureMax: { value: 31 - index, unit: '\u00b0C' }, temperatureMin: { value: 24 - index, unit: '\u00b0C' }, daytime: { condition: { code: index === 1 ? '305' : '101', text: index === 1 ? '\u5c0f\u96e8' : '\u591a\u4e91' }, precipitation: { probability: index === 1 ? 0.78 : 0.2 } } })) },
    minutely: { code: '200', updateTime: iso(now), summary: '\u9884\u8ba1 25 \u5206\u949f\u540e\u5f00\u59cb\u964d\u96e8\uff0c\u672a\u6765\u4e24\u5c0f\u65f6\u964d\u96e8\u9010\u6e10\u589e\u5f3a', minutely, refer: { sources: ['\u4e2d\u56fd\u6c14\u8c61\u5c40', 'QWeather'] } },
    alerts: { metadata: { attributions: ['https://developer.qweather.com/attribution.html'] }, alerts: [{ id: 'alert-1', senderName: '\u8861\u9633\u5e02\u6c14\u8c61\u53f0', issuedTime: iso(new Date(now.getTime() - hour)), onsetTime: iso(now), expireTime: iso(new Date(now.getTime() + 6 * hour)), severity: 'severe', color: { code: 'orange', red: 255, green: 128, blue: 0, alpha: 1 }, eventType: { name: '\u66b4\u96e8', code: '1003' }, headline: '\u8861\u9633\u5e02\u53d1\u5e03\u66b4\u96e8\u6a59\u8272\u9884\u8b66', description: '\u9884\u8ba1\u672a\u6765 3 \u5c0f\u65f6\u5c40\u5730\u5c06\u51fa\u73b0\u77ed\u65f6\u5f3a\u964d\u6c34\u3002', criteria: '3 \u5c0f\u65f6\u5185\u964d\u96e8\u91cf\u5c06\u8fbe 50 \u6beb\u7c73\u4ee5\u4e0a\u3002', instruction: '\u51cf\u5c11\u6237\u5916\u6d3b\u52a8\uff0c\u8fdc\u79bb\u4f4e\u6d3c\u8def\u6bb5\uff0c\u9632\u8303\u57ce\u5e02\u5185\u6d9d\u3002' }] },
    air: { metadata: { attributions: ['https://developer.qweather.com/attribution.html'] }, indexes: [{ code: 'cn-mee', aqi: 46, category: '\u4f18', level: '1', primaryPollutant: { name: 'PM2.5' }, health: { advice: { generalPopulation: '\u7a7a\u6c14\u8d28\u91cf\u4ee4\u4eba\u6ee1\u610f\uff0c\u9002\u5b9c\u6b63\u5e38\u6237\u5916\u6d3b\u52a8\u3002' } } }], pollutants: [{ code: 'pm2p5', name: 'PM2.5', concentration: { value: 16, unit: 'ug/m3' } }, { code: 'pm10', name: 'PM10', concentration: { value: 31, unit: 'ug/m3' } }, { code: 'o3', name: 'O3', concentration: { value: 73, unit: 'ug/m3' } }, { code: 'no2', name: 'NO2', concentration: { value: 19, unit: 'ug/m3' } }, { code: 'so2', name: 'SO2', concentration: { value: 6, unit: 'ug/m3' } }, { code: 'co', name: 'CO', concentration: { value: 0.7, unit: 'mg/m3' } }] },
    esri: { candidates: [{ location: { x: 112.57, y: 26.89 }, attributes: { ShortLabel: '\u84b8\u6e58\u533a', City: '\u8861\u9633\u5e02', Country: '\u4e2d\u56fd' } }] },
    openMeteo: { current: { time: '2026-09-02T14:00', temperature_2m: 28, apparent_temperature: 31, relative_humidity_2m: 80, weather_code: 61, is_day: 1, wind_speed_10m: 10, precipitation: 0.4, surface_pressure: 998, visibility: 15000, cloud_cover: 88, dew_point_2m: 23 }, hourly: { time: hourly.map((row) => new Date(new Date(row.forecastTime).getTime() + 8 * hour).toISOString().slice(0, 16)), temperature_2m: hourly.map((row) => row.temperature.value), apparent_temperature: hourly.map((row) => row.feelsLike.value), relative_humidity_2m: hourly.map((row) => row.humidity * 100), precipitation_probability: hourly.map((row) => row.precipitation.probability * 100), precipitation: hourly.map((row) => row.precipitation.amount.value), weather_code: hourly.map(() => 61), is_day: hourly.map(() => 1), wind_speed_10m: hourly.map(() => 10) }, daily: { time: ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'], weather_code: [61, 3, 2, 2, 1], temperature_2m_max: [30, 29, 30, 31, 31], temperature_2m_min: [24, 23, 23, 24, 24], precipitation_probability_max: [78, 40, 20, 20, 10] } }
  };
  const nativeMessageListeners = [];
  window.chrome = { webview: {
    addEventListener: function(type, listener) {
      if (type === 'message') nativeMessageListeners.push(listener);
    },
    postMessage: function(message) {
      const windowsLocationPrefix = 'ep_weather_windows_location|';
      const directIpLocationPrefix = 'ep_weather_auto_location|';
      const isWindowsLocation = message.startsWith(windowsLocationPrefix);
      const isDirectIpLocation = message.startsWith(directIpLocationPrefix);
      if ((scenario !== 'auto' && scenario !== 'windows-auto') ||
          (!isWindowsLocation && !isDirectIpLocation)) return;
      const prefix = isWindowsLocation ? windowsLocationPrefix : directIpLocationPrefix;
      const requestId = message.slice(prefix.length);
      setTimeout(function() {
        const payload = JSON.stringify({ ok: true, latitude: 26.89, longitude: 112.57, accuracyMeters: isWindowsLocation ? 35 : 0, city: '\u8861\u9633\u5e02', region: '\u6e56\u5357\u7701', country: '\u4e2d\u56fd' });
        for (const listener of nativeMessageListeners) listener({ data: 'ep_weather_location_result|' + requestId + '|' + payload });
      }, 10);
    }
  } };
  window.__epWeatherTestMode = true;
  window.__previewRequests = Object.create(null);
  window.__epWeatherFetch = async function(url) {
    window.__previewRequests[url] = (window.__previewRequests[url] || 0) + 1;
    let body;
    const qweatherRequest = url.includes('preview.qweatherapi.com');
    if (scenario === 'auth' && qweatherRequest) {
      return { ok: false, status: 401, headers: { get: function() { return null; } }, json: async function() { return {}; } };
    }
    if (scenario === 'rate-limit' && url.includes('/weather/v1/current/')) {
      return { ok: false, status: 429, headers: { get: function(name) { return name === 'retry-after' ? '120' : null; } }, json: async function() { return {}; } };
    }
    if (scenario === 'partial' && url.includes('/airquality/v1/current/')) {
      return { ok: false, status: 500, headers: { get: function() { return null; } }, json: async function() { return {}; } };
    }
    if (url.includes('/geo/v2/city/lookup')) {
      if (scenario === 'stale' && decodeURIComponent(url).includes('\u5cb3\u9e93\u533a')) {
        body = { code: '200', location: [{ name: '\u5cb3\u9e93\u533a', adm2: '\u957f\u6c99\u5e02', country: '\u4e2d\u56fd', lat: '28.19', lon: '112.94' }] };
      } else body = payloads.geo;
    }
    else if (url.includes('/weather/v1/current/')) {
      if (scenario === 'stale' && url.includes('/26.89/112.57')) {
        await new Promise(function(resolve) { setTimeout(resolve, 700); });
        body = { condition: { code: '100', text: '\u6674' }, temperature: { value: 99, unit: '\u00b0C' }, feelsLike: { value: 99, unit: '\u00b0C' }, humidity: 0.2 };
      } else if (scenario === 'stale' && url.includes('/28.19/112.94')) {
        body = { condition: { code: '101', text: '\u591a\u4e91' }, temperature: { value: 22, unit: '\u00b0C' }, feelsLike: { value: 23, unit: '\u00b0C' }, humidity: 0.6 };
      } else body = payloads.current;
    }
    else if (url.includes('/weather/v1/hourly/')) body = payloads.hourly;
    else if (url.includes('/weather/v1/daily/')) body = payloads.daily;
    else if (url.includes('/v7/minutely/5m')) body = payloads.minutely;
    else if (url.includes('/weatheralert/v1/current/')) body = scenario === 'empty-alerts' ? { metadata: { zeroResult: true }, alerts: [] } : payloads.alerts;
    else if (url.includes('/airquality/v1/current/')) body = payloads.air;
    else if (url.includes('geocode.arcgis.com/')) body = payloads.esri;
    else if (url.includes('api.open-meteo.com/')) body = payloads.openMeteo;
    else throw new Error('Unexpected preview request: ' + url);
    return { ok: true, status: 200, headers: { get: function() { return null; } }, json: async function() { return body; } };
  };
  window.addEventListener('DOMContentLoaded', function() {
    const automatic = scenario === 'auto' || scenario === 'windows-auto';
    const locationMode = scenario === 'auto' ? 2 : 0;
    window.epWeatherGetData(automatic ? '' : '\u84b8\u6e58\u533a', 'zh-CN', 0, 40, 40, 'preview.qweatherapi.com', locationMode);
    if (scenario === 'stale') {
      setTimeout(function() {
        window.epWeatherGetData('\u5cb3\u9e93\u533a', 'zh-CN', 0, 40, 40, 'preview.qweatherapi.com');
      }, 50);
    }
  });
})();
</script>`;

const html = buildHtml().replace('<script>\n(function() {', `${mockBootstrap}\n<script>\n(function() {`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log(outputPath);
