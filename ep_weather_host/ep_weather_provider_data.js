const QWEATHER_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+qweatherapi\.com$/i;
const DATASET_TTL = Object.freeze({
  current: 10 * 60 * 1000,
  minutely: 5 * 60 * 1000,
  alerts: 5 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  daily: 3 * 60 * 60 * 1000,
  air: 60 * 60 * 1000
});
const DATASET_NAMES = Object.freeze(['current', 'minutely', 'alerts', 'hourly', 'daily', 'air']);
const FALLBACK_TTL = 10 * 60 * 1000;
const FAILURE_RETRY_DELAY = 2 * 60 * 1000;
const RATE_LIMIT_BACKOFF = 15 * 60 * 1000;

const state = {
  key: '',
  status: 'idle',
  mode: 'none',
  location: '',
  language: 'en-US',
  unit: 0,
  apiHost: '',
  generation: 0,
  coords: null,
  place: null,
  datasets: Object.create(null),
  fallback: null,
  nextDue: Object.create(null),
  inFlight: Object.create(null),
  errors: Object.create(null),
  failureCounts: Object.create(null),
  fallbackDue: 0,
  fallbackFailureCount: 0,
  qAuthFailed: false,
  qBackoffUntil: 0,
  refreshTimer: null,
  notifyTimer: null,
  alertOpenStates: new Map(),
  iconWidth: 32,
  iconHeight: 32
};

class HttpError extends Error {
  constructor(status, message, retryAfterMs) {
    super(message || `HTTP ${status}`);
    this.name = 'HttpError';
    this.status = Number(status) || 0;
    this.retryAfterMs = Number(retryAfterMs) || 0;
    this.retryable = this.status === 408 || this.status >= 500;
  }
}

function pick(object, names, fallback = null) {
  if (!object) return fallback;
  for (const name of names) {
    const value = object[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function textValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value).trim();
}

function clampPercent(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.max(0, Math.min(100, Math.round(number)));
}

function ratioPercent(value) {
  const number = finiteNumber(value);
  if (number === null) return null;
  return clampPercent(number >= 0 && number <= 1 ? number * 100 : number);
}

function measurementValue(value) {
  if (value && typeof value === 'object') return finiteNumber(value.value);
  return finiteNumber(value);
}

function temperatureCelsius(value) {
  const number = measurementValue(value);
  if (number === null) return null;
  const unit = textValue(value && typeof value === 'object' ? value.unit : '').toLowerCase();
  return unit.includes('f') ? (number - 32) * 5 / 9 : number;
}

function windKilometersPerHour(value) {
  const number = measurementValue(value);
  if (number === null) return null;
  const unit = textValue(value && typeof value === 'object' ? value.unit : '').toLowerCase();
  if (unit.includes('m/s')) return number * 3.6;
  if (unit.includes('mph')) return number * 1.609344;
  return number;
}

function distanceKilometers(value) {
  const number = measurementValue(value);
  if (number === null) return null;
  const unit = textValue(value && typeof value === 'object' ? value.unit : '').toLowerCase();
  if (unit === 'm' || unit.includes('meter')) return number / 1000;
  if (unit.includes('mi')) return number * 1.609344;
  return number;
}

function precipitationMillimeters(value) {
  const number = measurementValue(value && typeof value === 'object' && value.amount ? value.amount : value);
  if (number === null) return null;
  const measurement = value && typeof value === 'object' && value.amount ? value.amount : value;
  const unit = textValue(measurement && typeof measurement === 'object' ? measurement.unit : '').toLowerCase();
  return unit.includes('in') ? number * 25.4 : number;
}

function validQWeatherHost(host) {
  const value = textValue(host).toLowerCase();
  return QWEATHER_HOST_PATTERN.test(value);
}

function apiLanguage() {
  return /^zh/i.test(state.language) ? 'zh' : 'en';
}

function retryAfterMilliseconds(response) {
  const value = response && response.headers && response.headers.get
    ? response.headers.get('retry-after')
    : null;
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function getJson(url, options = {}) {
  const fetchFunction = window.__epWeatherFetch || window.fetch.bind(window);
  const attempts = Math.max(1, Math.min(2, Number(options.attempts) || 2));
  let lastError = null;
  for (let attempt = 0; attempt < attempts; ++attempt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(options.timeout) || 7000);
    try {
      const response = await fetchFunction(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        throw new HttpError(response.status, `HTTP ${response.status}`, retryAfterMilliseconds(response));
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      const retryable = error && (error.name === 'AbortError' || error.retryable === true);
      if (!retryable || attempt + 1 >= attempts) throw error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }
  throw lastError || new Error('Network request failed');
}

function qweatherResponse(data) {
  const code = finiteNumber(data && data.code, 200);
  if (code === 204) return data || {};
  if (code !== 200) throw new HttpError(code, `QWeather ${code}`);
  return data || {};
}

function qweatherUrl(pathname, params = {}) {
  const url = new URL(`https://${state.apiHost}${pathname}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, value);
  }
  return url.toString();
}

function normalizeRefer(raw) {
  const refer = raw && raw.refer || {};
  const sources = Array.isArray(refer.sources)
    ? refer.sources.map((value) => textValue(value)).filter(Boolean)
    : [];
  return {
    sources,
    license: Array.isArray(refer.license)
      ? refer.license.map((value) => textValue(value)).filter(Boolean)
      : [],
    attributions: Array.isArray(raw && raw.metadata && raw.metadata.attributions)
      ? raw.metadata.attributions.map((value) => textValue(value)).filter(Boolean)
      : []
  };
}

function normalizeQCurrent(raw) {
  const source = raw && (raw.current || raw.now) || raw || {};
  const condition = source.condition || {};
  const wind = source.wind || {};
  const direction = wind.direction || {};
  return {
    time: textValue(pick(source, ['obsTime', 'updateTime', 'fxTime', 'observationTime'])),
    temp: temperatureCelsius(pick(source, ['temperature', 'temp'])),
    feels: temperatureCelsius(pick(source, ['feelsLike', 'apparentTemperature', 'feels'])),
    humidity: ratioPercent(pick(source, ['humidity', 'relativeHumidity'])),
    windSpeed: windKilometersPerHour(pick(wind, ['speed'], pick(source, ['windSpeed', 'windSpeed10m']))),
    windDir: textValue(pick(direction, ['compass'], pick(source, ['windDir', 'windDirection']))),
    precip: precipitationMillimeters(pick(source, ['precipitation', 'precip'])),
    pressure: measurementValue(pick(source, ['pressure'])),
    visibility: distanceKilometers(pick(source, ['visibility', 'vis'])),
    cloud: ratioPercent(pick(source, ['cloudCover', 'cloud'])),
    dew: temperatureCelsius(pick(source, ['dewPoint', 'dew'])),
    code: textValue(pick(condition, ['code'], pick(source, ['icon', 'weatherCode', 'code'], '999'))),
    text: textValue(pick(condition, ['text'], pick(source, ['text', 'weatherText']))),
    isDay: finiteNumber(pick(source, ['isDay']), null)
  };
}

function normalizeQHourly(raw) {
  const rows = Array.isArray(raw && raw.hours)
    ? raw.hours
    : Array.isArray(raw && raw.hourly) ? raw.hourly : [];
  return rows.map((row) => {
    const condition = row.condition || {};
    const wind = row.wind || {};
    const direction = wind.direction || {};
    const precipitation = row.precipitation || {};
    return {
      time: textValue(pick(row, ['forecastTime', 'fxTime', 'time'])),
      temp: temperatureCelsius(pick(row, ['temperature', 'temp'])),
      feels: temperatureCelsius(pick(row, ['feelsLike', 'apparentTemperature'])),
      humidity: ratioPercent(pick(row, ['humidity', 'relativeHumidity'])),
      windSpeed: windKilometersPerHour(pick(wind, ['speed'], pick(row, ['windSpeed']))),
      windDir: textValue(pick(direction, ['compass'], pick(row, ['windDir', 'windDirection']))),
      precip: precipitationMillimeters(pick(row, ['precipitation', 'precip'])),
      pop: ratioPercent(pick(precipitation, ['probability'], pick(row, ['pop', 'precipitationProbability']))),
      code: textValue(pick(condition, ['code'], pick(row, ['icon', 'weatherCode', 'code'], '999'))),
      text: textValue(pick(condition, ['text'], pick(row, ['text', 'weatherText']))),
      isDay: finiteNumber(pick(row, ['isDay']), null)
    };
  });
}

function normalizeQDaily(raw) {
  const rows = Array.isArray(raw && raw.days)
    ? raw.days
    : Array.isArray(raw && raw.daily) ? raw.daily : [];
  return rows.map((row) => {
    const daytime = row.daytime || row;
    const condition = daytime.condition || {};
    const precipitation = daytime.precipitation || row.precipitation || {};
    const astro = row.astro || {};
    const forecastStart = textValue(pick(row, ['forecastStartTime', 'fxDate', 'forecastDate', 'date']));
    const forecastEnd = textValue(pick(row, ['forecastEndTime']));
    const isUtcPeriod = /(?:Z|[+-]00:00)$/i.test(forecastStart);
    const datePeriod = isUtcPeriod ? forecastEnd || forecastStart : forecastStart;
    return {
      date: datePeriod.includes('T') ? datePeriod.split('T')[0] : datePeriod,
      tempMax: temperatureCelsius(pick(row, ['temperatureMax', 'tempMax', 'maxTemp'], daytime.temperatureMax)),
      tempMin: temperatureCelsius(pick(row, ['temperatureMin', 'tempMin', 'minTemp'], daytime.temperatureMin)),
      code: textValue(pick(condition, ['code'], pick(row, ['iconDay', 'icon', 'weatherCodeDay'], '999'))),
      text: textValue(pick(condition, ['text'], pick(row, ['textDay', 'text', 'weatherTextDay']))),
      pop: ratioPercent(pick(precipitation, ['probability'], pick(row, ['pop', 'precipitationProbability']))),
      sunrise: textValue(pick(astro, ['sunrise'], pick(row, ['sunrise']))),
      sunset: textValue(pick(astro, ['sunset'], pick(row, ['sunset'])))
    };
  });
}

function normalizeQMinutely(raw) {
  const rows = Array.isArray(raw && raw.minutely) ? raw.minutely : [];
  return {
    available: finiteNumber(raw && raw.code, 200) !== 204,
    summary: textValue(raw && raw.summary),
    updated: textValue(pick(raw || {}, ['updateTime'])),
    points: rows.map((row) => ({
      time: textValue(pick(row, ['fxTime', 'time'])),
      precip: finiteNumber(pick(row, ['precip', 'precipitation']), 0),
      type: textValue(pick(row, ['type', 'precipitationType']))
    })),
    refer: normalizeRefer(raw)
  };
}

function normalizeQAlerts(raw) {
  const rows = Array.isArray(raw && raw.alerts)
    ? raw.alerts
    : Array.isArray(raw && raw.warning)
      ? raw.warning
      : Array.isArray(raw && raw.alert)
        ? raw.alert
        : [];
  return {
    items: rows.map((row) => ({
      id: textValue(pick(row, ['id', 'warningId'])),
      title: textValue(pick(row, ['title', 'headline', 'typeName'])),
      sender: textValue(pick(row, ['senderName', 'sender', 'source'])),
      published: textValue(pick(row, ['issuedTime', 'pubTime', 'publishTime', 'effectiveTime'])),
      start: textValue(pick(row, ['onsetTime', 'effectiveTime', 'startTime', 'effective'])),
      end: textValue(pick(row, ['expireTime', 'endTime', 'expires'])),
      status: textValue(pick(row, ['status'])),
      severity: textValue(pick(row, ['severity', 'level', 'severityText'])),
      color: pick(row, ['severityColor', 'color']),
      type: textValue(pick(row && row.eventType || {}, ['name', 'code'], pick(row, ['typeName', 'event']))),
      description: textValue(pick(row, ['description', 'text', 'detail'])),
      standard: textValue(pick(row, ['standard', 'criteria', 'eventDescription'])),
      instruction: textValue(pick(row, ['instruction', 'defense', 'recommendedAction']))
    })),
    refer: normalizeRefer(raw)
  };
}

function pollutantFromLegacy(source, code, label) {
  const value = finiteNumber(source && source[code]);
  return value === null ? null : { code, name: label, value, unit: 'ug/m3' };
}

function normalizeQAir(raw) {
  const indexes = Array.isArray(raw && raw.indexes) ? raw.indexes : [];
  const legacy = raw && raw.now || {};
  const index = indexes.find((item) => /^cn-mee/i.test(textValue(item.code))) ||
    indexes.find((item) => textValue(item.code).toLowerCase() === 'qaqi') ||
    indexes[0] || legacy;
  const rows = Array.isArray(raw && raw.pollutants) ? raw.pollutants : [];
  const pollutants = rows.map((row) => {
    const concentration = row && row.concentration || {};
    return {
      code: textValue(pick(row, ['code', 'name'])).toLowerCase(),
      name: textValue(pick(row, ['name', 'fullName', 'code'])),
      value: finiteNumber(pick(concentration, ['value'], pick(row, ['value', 'concentration']))),
      unit: textValue(pick(concentration, ['unit'], pick(row, ['unit'], 'ug/m3')))
    };
  }).filter((item) => item.value !== null);
  if (!pollutants.length && legacy) {
    for (const item of [
      pollutantFromLegacy(legacy, 'pm2p5', 'PM2.5'),
      pollutantFromLegacy(legacy, 'pm10', 'PM10'),
      pollutantFromLegacy(legacy, 'o3', 'O3'),
      pollutantFromLegacy(legacy, 'no2', 'NO2'),
      pollutantFromLegacy(legacy, 'so2', 'SO2'),
      pollutantFromLegacy(legacy, 'co', 'CO')
    ]) if (item) pollutants.push(item);
  }
  const health = index && index.health || {};
  const advice = health && health.advice || {};
  return {
    aqi: finiteNumber(pick(index, ['aqi', 'aqiDisplay'])),
    category: textValue(pick(index, ['category', 'levelName'])),
    level: textValue(pick(index, ['level'])),
    primary: textValue(pick(index && index.primaryPollutant || {}, ['name', 'fullName', 'code'], pick(index, ['primary']))),
    advice: textValue(pick(advice, ['generalPopulation'], pick(health, ['effect'], pick(index, ['healthAdvice'])))),
    pollutants,
    refer: normalizeRefer(raw)
  };
}

const Q_NORMALIZERS = Object.freeze({
  current: normalizeQCurrent,
  minutely: normalizeQMinutely,
  alerts: normalizeQAlerts,
  hourly: normalizeQHourly,
  daily: normalizeQDaily,
  air: normalizeQAir
});

function qDatasetUrl(name) {
  const lat = state.coords.lat.toFixed(2);
  const lon = state.coords.lon.toFixed(2);
  const common = { lang: apiLanguage(), localTime: 'true' };
  switch (name) {
    case 'current':
      return qweatherUrl(`/weather/v1/current/${lat}/${lon}`, common);
    case 'hourly':
      return qweatherUrl(`/weather/v1/hourly/${lat}/${lon}`, { ...common, hours: 24 });
    case 'daily':
      return qweatherUrl(`/weather/v1/daily/${lat}/${lon}`, { ...common, days: 5 });
    case 'minutely':
      return qweatherUrl('/v7/minutely/5m', { lang: apiLanguage(), location: `${lon},${lat}` });
    case 'alerts':
      return qweatherUrl(`/weatheralert/v1/current/${lat}/${lon}`, { lang: apiLanguage() });
    case 'air':
      return qweatherUrl(`/airquality/v1/current/${lat}/${lon}`, { lang: apiLanguage() });
    default:
      throw new Error(`Unknown QWeather dataset: ${name}`);
  }
}

function recordQWeatherFailure(name, error) {
  const now = Date.now();
  const status = Number(error && error.status) || 0;
  const failureCount = Math.min(8, (state.failureCounts[name] || 0) + 1);
  state.failureCounts[name] = failureCount;
  state.errors[name] = error && error.message || String(error);
  if (status === 401 || status === 403) {
    state.qAuthFailed = true;
    for (const datasetName of DATASET_NAMES) state.nextDue[datasetName] = Number.POSITIVE_INFINITY;
  } else if (status === 429) {
    state.qBackoffUntil = now + Math.max(RATE_LIMIT_BACKOFF, Number(error.retryAfterMs) || 0);
    state.nextDue[name] = state.qBackoffUntil;
  } else if (status >= 400 && status < 500 && status !== 408) {
    state.nextDue[name] = now + Math.max(DATASET_TTL[name], 60 * 60 * 1000);
  } else {
    const maximumDelay = Math.max(DATASET_TTL[name], 30 * 60 * 1000);
    state.nextDue[name] = now + Math.min(maximumDelay, FAILURE_RETRY_DELAY * (2 ** (failureCount - 1)));
  }
}

async function fetchQDataset(name, force, generation) {
  const now = Date.now();
  if (generation !== state.generation || state.qAuthFailed || state.inFlight[name]) return null;
  if (!force && now < (state.nextDue[name] || 0)) return null;
  if (now < state.qBackoffUntil) return null;
  state.inFlight[name] = true;
  try {
    const raw = qweatherResponse(await getJson(qDatasetUrl(name)));
    if (generation !== state.generation) return null;
    const normalized = Q_NORMALIZERS[name](raw);
    state.datasets[name] = { data: normalized, fetchedAt: Date.now(), refer: normalizeRefer(raw) };
    state.nextDue[name] = Date.now() + DATASET_TTL[name];
    delete state.failureCounts[name];
    if (finiteNumber(raw && raw.code, 200) === 204 && name !== 'alerts') {
      state.errors[name] = 'QWeather 204';
    } else {
      delete state.errors[name];
    }
    if (name === 'current' && normalized && normalized.temp !== null) {
      state.mode = 'qweather';
      state.status = 'ready';
    }
    scheduleRenderAndCapture(name === 'current');
    return normalized;
  } catch (error) {
    if (generation === state.generation) recordQWeatherFailure(name, error);
    throw error;
  } finally {
    if (generation === state.generation) delete state.inFlight[name];
  }
}

async function refreshQWeather(force, generation) {
  if (!state.apiHost || !state.coords || state.qAuthFailed || generation !== state.generation) return false;
  const results = await Promise.allSettled(DATASET_NAMES.map((name) => fetchQDataset(name, force, generation)));
  return results.some((result) => result.status === 'rejected' || result.value !== null);
}

async function resolveQWeatherLocation(query, generation) {
  const raw = qweatherResponse(await getJson(qweatherUrl('/geo/v2/city/lookup', {
    location: query,
    number: 1,
    lang: apiLanguage()
  })));
  if (generation !== state.generation) throw new Error('Superseded location request');
  const row = Array.isArray(raw.location) ? raw.location[0] : null;
  const lat = finiteNumber(row && row.lat);
  const lon = finiteNumber(row && row.lon);
  if (lat === null || lon === null) throw new Error('QWeather location not found');
  return {
    lat,
    lon,
    name: textValue(row.name),
    city: textValue(pick(row, ['adm2', 'adm1'])),
    province: textValue(pick(row, ['adm1', 'province', 'state'])),
    country: textValue(row.country),
    source: 'QWeather'
  };
}

async function resolveFallbackLocation(query, generation) {
  let lastError = null;
  try {
    const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(query)}&f=json&maxLocations=1&outFields=*`;
    const raw = await getJson(url);
    const candidate = raw && raw.candidates && raw.candidates[0];
    const attributes = candidate && candidate.attributes || {};
    const lat = finiteNumber(candidate && candidate.location && candidate.location.y);
    const lon = finiteNumber(candidate && candidate.location && candidate.location.x);
    if (lat !== null && lon !== null) {
      return {
        lat,
        lon,
        name: textValue(pick(attributes, ['ShortLabel', 'PlaceName'])),
        city: textValue(pick(attributes, ['City', 'Subregion'])),
        province: textValue(pick(attributes, ['Region', 'State', 'Province', 'Adm1'])),
        country: textValue(attributes.Country),
        source: 'Esri'
      };
    }
  } catch (error) {
    lastError = error;
  }
  try {
    const raw = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`);
    const feature = raw && raw.features && raw.features[0];
    const coordinates = feature && feature.geometry && feature.geometry.coordinates || [];
    const properties = feature && feature.properties || {};
    const lat = finiteNumber(coordinates[1]);
    const lon = finiteNumber(coordinates[0]);
    if (generation === state.generation && lat !== null && lon !== null) {
      return {
        lat,
        lon,
        name: textValue(pick(properties, ['name', 'district'])),
        city: textValue(pick(properties, ['city', 'county', 'state'])),
        province: textValue(pick(properties, ['state', 'region'])),
        country: textValue(properties.country),
        source: 'Photon'
      };
    }
  } catch (error) {
    lastError = error;
  }
  throw lastError || new Error('Location not found');
}

async function resolveLocation(generation) {
  if (state.apiHost && !state.qAuthFailed) {
    try {
      return await resolveQWeatherLocation(state.location, generation);
    } catch (error) {
      const status = Number(error && error.status) || 0;
      if (status === 401 || status === 403) state.qAuthFailed = true;
    }
  }
  return resolveFallbackLocation(state.location, generation);
}

function normalizeOpenMeteo(raw) {
  const current = raw && raw.current || {};
  const hourly = raw && raw.hourly || {};
  const daily = raw && raw.daily || {};
  const currentData = {
    time: textValue(current.time),
    temp: finiteNumber(current.temperature_2m),
    feels: finiteNumber(current.apparent_temperature),
    humidity: finiteNumber(current.relative_humidity_2m),
    windSpeed: finiteNumber(current.wind_speed_10m),
    windDir: '',
    precip: finiteNumber(current.precipitation),
    pressure: finiteNumber(current.surface_pressure),
    visibility: finiteNumber(current.visibility) === null ? null : finiteNumber(current.visibility) / 1000,
    cloud: finiteNumber(current.cloud_cover),
    dew: finiteNumber(current.dew_point_2m),
    code: textValue(current.weather_code, '999'),
    text: '',
    isDay: finiteNumber(current.is_day, 1)
  };
  const hourlyRows = Array.isArray(hourly.time) ? hourly.time.map((time, index) => ({
    time: textValue(time),
    temp: finiteNumber(hourly.temperature_2m && hourly.temperature_2m[index]),
    feels: finiteNumber(hourly.apparent_temperature && hourly.apparent_temperature[index]),
    humidity: finiteNumber(hourly.relative_humidity_2m && hourly.relative_humidity_2m[index]),
    windSpeed: finiteNumber(hourly.wind_speed_10m && hourly.wind_speed_10m[index]),
    precip: finiteNumber(hourly.precipitation && hourly.precipitation[index]),
    pop: clampPercent(hourly.precipitation_probability && hourly.precipitation_probability[index]),
    code: textValue(hourly.weather_code && hourly.weather_code[index], '999'),
    text: '',
    isDay: finiteNumber(hourly.is_day && hourly.is_day[index], 1)
  })) : [];
  const dailyRows = Array.isArray(daily.time) ? daily.time.map((date, index) => ({
    date: textValue(date),
    tempMax: finiteNumber(daily.temperature_2m_max && daily.temperature_2m_max[index]),
    tempMin: finiteNumber(daily.temperature_2m_min && daily.temperature_2m_min[index]),
    code: textValue(daily.weather_code && daily.weather_code[index], '999'),
    text: '',
    pop: clampPercent(daily.precipitation_probability_max && daily.precipitation_probability_max[index])
  })) : [];
  return { current: currentData, hourly: hourlyRows, daily: dailyRows };
}

async function refreshFallback(force, generation) {
  const now = Date.now();
  if (!state.coords || generation !== state.generation || state.inFlight.fallback) return false;
  if (!force && now < state.fallbackDue) return false;
  state.inFlight.fallback = true;
  try {
    const lat = state.coords.lat.toFixed(5);
    const lon = state.coords.lon.toFixed(5);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,precipitation,surface_pressure,visibility,cloud_cover,dew_point_2m&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5&wind_speed_unit=kmh`;
    const normalized = normalizeOpenMeteo(await getJson(url));
    if (generation !== state.generation) return false;
    state.fallback = { data: normalized, fetchedAt: Date.now() };
    state.fallbackDue = Date.now() + FALLBACK_TTL;
    state.fallbackFailureCount = 0;
    delete state.errors.fallback;
    if (!state.datasets.current || state.datasets.current.data.temp === null) {
      state.mode = 'open-meteo';
      state.status = 'ready';
    }
    scheduleRenderAndCapture(true);
    return true;
  } catch (error) {
    if (generation === state.generation) {
      state.errors.fallback = error && error.message || String(error);
      state.fallbackFailureCount = Math.min(8, state.fallbackFailureCount + 1);
      state.fallbackDue = Date.now() + Math.min(
        30 * 60 * 1000,
        FAILURE_RETRY_DELAY * (2 ** (state.fallbackFailureCount - 1))
      );
    }
    throw error;
  } finally {
    if (generation === state.generation) delete state.inFlight.fallback;
  }
}

async function refreshDue(force, generation = state.generation) {
  if (generation !== state.generation || !state.coords) return false;
  let changed = false;
  if (state.apiHost && !state.qAuthFailed) {
    changed = await refreshQWeather(force, generation) || changed;
  }
  const hasQCurrent = state.datasets.current && state.datasets.current.data.temp !== null;
  if (!hasQCurrent) {
    try {
      changed = await refreshFallback(force, generation) || changed;
    } catch (error) {
      // Keep the last valid data and the bounded retry schedule.
      changed = true;
    }
  }
  if (generation === state.generation) {
    if (hasCurrentData()) state.status = 'ready';
    if (changed) renderWeather();
  }
  return changed;
}

async function initializeWeather(generation) {
  state.status = 'loading';
  setLoading();
  try {
    const place = await resolveLocation(generation);
    if (generation !== state.generation) return;
    state.coords = { lat: place.lat, lon: place.lon };
    state.place = place;
    await refreshDue(true, generation);
    if (generation === state.generation && !hasCurrentData()) throw new Error('Weather data unavailable');
  } catch (error) {
    if (generation !== state.generation) return;
    state.errors.initialization = error && error.message || String(error);
    state.status = hasCurrentData() ? 'ready' : 'error';
    if (state.status === 'error') setError();
  }
}

function resetState() {
  ++state.generation;
  state.status = 'idle';
  state.mode = 'none';
  state.coords = null;
  state.place = null;
  state.datasets = Object.create(null);
  state.fallback = null;
  state.nextDue = Object.create(null);
  state.inFlight = Object.create(null);
  state.errors = Object.create(null);
  state.failureCounts = Object.create(null);
  state.fallbackDue = 0;
  state.fallbackFailureCount = 0;
  state.qAuthFailed = false;
  state.qBackoffUntil = 0;
  state.alertOpenStates.clear();
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => {
    refreshDue(false).catch(() => {});
  }, 60 * 1000);
}
