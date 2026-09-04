const elements = {
  weather: document.getElementById('weather'),
  location: document.getElementById('location'),
  resolved: document.getElementById('resolved'),
  providerState: document.getElementById('provider-state'),
  updateStatus: document.getElementById('update-status'),
  themeButton: document.getElementById('theme-button'),
  refreshButton: document.getElementById('refresh-button'),
  alerts: document.getElementById('alerts'),
  currentGlyph: document.getElementById('current-glyph'),
  currentIcon: document.getElementById('current-icon'),
  temperature: document.getElementById('temperature'),
  unit: document.getElementById('unit'),
  condition: document.getElementById('condition'),
  updated: document.getElementById('updated'),
  heroRange: document.getElementById('hero-range'),
  heroSummary: document.getElementById('hero-summary'),
  heroContext: document.getElementById('hero-context'),
  feels: document.getElementById('feels'),
  feelsSub: document.getElementById('feels-sub'),
  humidity: document.getElementById('humidity'),
  humidityMeter: document.getElementById('humidity-meter'),
  humiditySub: document.getElementById('humidity-sub'),
  wind: document.getElementById('wind'),
  windSub: document.getElementById('wind-sub'),
  precip: document.getElementById('precip'),
  precipSub: document.getElementById('precip-sub'),
  visibility: document.getElementById('visibility'),
  visibilitySub: document.getElementById('visibility-sub'),
  minuteSection: document.getElementById('minute-section'),
  minuteLead: document.getElementById('minute-lead'),
  minuteUpdated: document.getElementById('minute-updated'),
  minuteSummary: document.getElementById('minute-summary'),
  minuteDot: document.getElementById('minute-dot'),
  minuteThresholdHeavy: document.getElementById('minute-threshold-heavy'),
  minuteThresholdLight: document.getElementById('minute-threshold-light'),
  minuteChart: document.getElementById('minute-chart'),
  minuteAxis: document.getElementById('minute-axis'),
  hourly: document.getElementById('hourly'),
  hourlyNote: document.getElementById('hourly-note'),
  hourlyLead: document.getElementById('hourly-lead'),
  airSection: document.getElementById('air-section'),
  airNote: document.getElementById('air-note'),
  airLead: document.getElementById('air-lead'),
  aqiValue: document.getElementById('aqi-value'),
  aqiCategory: document.getElementById('aqi-category'),
  aqiScaleDot: document.getElementById('aqi-scale-dot'),
  pollutants: document.getElementById('pollutants'),
  airAdvice: document.getElementById('air-advice'),
  forecast: document.getElementById('forecast'),
  dailyNote: document.getElementById('daily-note'),
  dailyLead: document.getElementById('daily-lead'),
  poweredBy: document.getElementById('powered-by'),
  sourceList: document.getElementById('source-list')
};

let renderTimer = null;
let alertsRenderSignature = '';
let manualRefreshInFlight = false;
let manualRefreshCooldownUntil = 0;
let manualRefreshCooldownTimer = null;
let refreshNotice = '';
let refreshNoticeUntil = 0;
let refreshNoticeTimer = null;
const MANUAL_REFRESH_COOLDOWN = 15 * 1000;

function isChinese() {
  return /^zh/i.test(state.language || '');
}

function labels() {
  return isChinese() ? {
    loading: '\u52a0\u8f7d\u4e2d...',
    error: '\u65e0\u6cd5\u83b7\u53d6\u5929\u6c14',
    windowsLocation: '\u6b63\u5728\u4f7f\u7528 Windows \u5b9a\u4f4d...',
    windowsLocationError: 'Windows \u65e0\u6cd5\u63d0\u4f9b\u53ef\u9760\u4f4d\u7f6e\uff0c\u8bf7\u8f93\u5165\u5730\u70b9',
    directIpLocation: '\u6b63\u5728\u4f7f\u7528\u76f4\u8fde IP \u8fd1\u4f3c\u5b9a\u4f4d...',
    directIpError: '\u76f4\u8fde IP \u8fd1\u4f3c\u5b9a\u4f4d\u5931\u8d25\uff0c\u8bf7\u8f93\u5165\u5730\u70b9',
    manualLocationError: '\u8bf7\u8f93\u5165\u5730\u70b9',
    windowsLocationSource: 'Windows \u5b9a\u4f4d',
    directIpSource: '\u76f4\u8fde IP \u8fd1\u4f3c',
    feels: '\u4f53\u611f\u6e29\u5ea6',
    humidity: '\u76f8\u5bf9\u6e7f\u5ea6',
    wind: '\u98ce\u5411\u98ce\u901f',
    precip: '\u5f53\u524d\u964d\u6c34',
    visibility: '\u80fd\u89c1\u5ea6',
    updated: '\u66f4\u65b0',
    next2h: '\u672a\u6765 2 \u5c0f\u65f6\u964d\u6c34',
    hourly24: '\u672a\u6765 24 \u5c0f\u65f6',
    rainChance: '\u964d\u96e8\u6982\u7387',
    air: '\u7a7a\u6c14\u8d28\u91cf',
    daily5: '\u672a\u6765 5 \u5929',
    today: '\u4eca\u5929',
    tomorrow: '\u660e\u5929',
    now: '\u73b0\u5728',
    unavailable: '\u6570\u636e\u6682\u4e0d\u53ef\u7528',
    fallback: 'Open-Meteo \u56de\u9000',
    authFailed: '\u548c\u98ce\u5929\u6c14\u8ba4\u8bc1\u5931\u8d25',
    lastData: '\u663e\u793a\u6700\u8fd1\u6570\u636e',
    partial: '\u90e8\u5206\u6570\u636e\u6682\u4e0d\u53ef\u7528',
    powered: '\u5929\u6c14\u670d\u52a1\u7531\u548c\u98ce\u5929\u6c14\u9a71\u52a8',
    sources: '\u6570\u636e\u6e90',
    publisher: '\u53d1\u5e03\u673a\u6784',
    validUntil: '\u6709\u6548\u671f',
    standard: '\u9884\u8b66\u6807\u51c6',
    details: '\u9884\u8b66\u6b63\u6587',
    instruction: '\u9632\u5fa1\u6307\u5357',
    officialAlert: '\u5b98\u65b9\u9884\u8b66',
    noRain: '\u672a\u6765 2 \u5c0f\u65f6\u6682\u65e0\u660e\u663e\u964d\u6c34',
    minutePoints: '\u6bcf 5 \u5206\u949f',
    qweather: '\u548c\u98ce\u5929\u6c14',
    primary: '\u9996\u8981\u6c61\u67d3\u7269',
    level: '\u7b49\u7ea7',
    rain: '\u964d\u96e8',
    lightRain: '\u5c0f\u96e8',
    moderateRain: '\u4e2d\u96e8',
    hourlyHint: '\u9010\u5c0f\u65f6\u5929\u6c14 \u00b7 \u964d\u96e8\u6982\u7387',
    dailyHint: '\u6e29\u5ea6\u8303\u56f4\u4e0e\u964d\u96e8\u6982\u7387',
    minuteHint: '\u9010 5 \u5206\u949f\u9884\u6d4b',
    refresh: '\u5237\u65b0\u5929\u6c14',
    refreshing: '\u5237\u65b0\u4e2d...',
    refreshDone: '\u5df2\u66f4\u65b0',
    refreshDeferred: '\u8bf7\u7a0d\u540e\u91cd\u8bd5',
    refreshFailed: '\u5237\u65b0\u5931\u8d25',
    monitoring: '\u5b9e\u65f6\u76d1\u6d4b',
    switchToDark: '\u5207\u6362\u5230\u6df1\u8272\u6a21\u5f0f',
    switchToLight: '\u5207\u6362\u5230\u6d45\u8272\u6a21\u5f0f',
    feelsClose: '\u4f53\u611f\u63a5\u8fd1',
    feelsWarm: '\u4f53\u611f\u504f\u6696',
    feelsCool: '\u4f53\u611f\u504f\u51c9',
    humidityDry: '\u7a7a\u6c14\u504f\u5e72',
    humidityComfort: '\u6e7f\u5ea6\u9002\u4e2d',
    humidityHigh: '\u6e7f\u5ea6\u8f83\u9ad8',
    visibilityGood: '\u89c6\u91ce\u826f\u597d',
    visibilityFair: '\u89c6\u91ce\u4e00\u822c',
    visibilityLow: '\u80fd\u89c1\u5ea6\u8f83\u4f4e',
    observed: '\u5f53\u524d\u89c2\u6d4b'
  } : {
    loading: 'Loading...',
    error: 'Unable to load weather',
    windowsLocation: 'Locating with Windows location services...',
    windowsLocationError: 'Windows could not provide a reliable location; enter one manually',
    directIpLocation: 'Locating through a direct IP connection...',
    directIpError: 'Direct IP location failed; enter a location manually',
    manualLocationError: 'Enter a location',
    windowsLocationSource: 'Windows location',
    directIpSource: 'Direct IP approximate',
    feels: 'Feels like',
    humidity: 'Humidity',
    wind: 'Wind',
    precip: 'Precipitation',
    visibility: 'Visibility',
    updated: 'Updated',
    next2h: 'Precipitation in the next 2 hours',
    hourly24: 'Next 24 hours',
    rainChance: 'Rain chance',
    air: 'Air quality',
    daily5: 'Next 5 days',
    today: 'Today',
    tomorrow: 'Tomorrow',
    now: 'Now',
    unavailable: 'Data temporarily unavailable',
    fallback: 'Open-Meteo fallback',
    authFailed: 'QWeather authentication failed',
    lastData: 'Showing last data',
    partial: 'Some data is temporarily unavailable',
    powered: 'Weather data powered by QWeather',
    sources: 'Sources',
    publisher: 'Publisher',
    validUntil: 'Valid period',
    standard: 'Alert standard',
    details: 'Alert details',
    instruction: 'Safety guidance',
    officialAlert: 'Official alert',
    noRain: 'No significant precipitation in the next 2 hours',
    minutePoints: 'Every 5 minutes',
    qweather: 'QWeather',
    primary: 'Primary',
    level: 'Level',
    rain: 'Rain',
    lightRain: 'Light rain',
    moderateRain: 'Moderate rain',
    hourlyHint: 'Hourly weather \u00b7 rain chance',
    dailyHint: 'Temperature range and rain chance',
    minuteHint: 'Every 5 minutes',
    refresh: 'Refresh weather',
    refreshing: 'Refreshing...',
    refreshDone: 'Updated',
    refreshDeferred: 'Try again later',
    refreshFailed: 'Refresh failed',
    monitoring: 'Live monitoring',
    switchToDark: 'Switch to dark mode',
    switchToLight: 'Switch to light mode',
    feelsClose: 'Feels close to current',
    feelsWarm: 'Feels warmer',
    feelsCool: 'Feels cooler',
    humidityDry: 'Air feels dry',
    humidityComfort: 'Moderate humidity',
    humidityHigh: 'High humidity',
    visibilityGood: 'Good visibility',
    visibilityFair: 'Fair visibility',
    visibilityLow: 'Low visibility',
    observed: 'Current observation'
  };
}

function setStaticLabels() {
  const value = labels();
  document.getElementById('feels-label').textContent = value.feels;
  document.getElementById('humidity-label').textContent = value.humidity;
  document.getElementById('wind-label').textContent = value.wind;
  document.getElementById('precip-label').textContent = value.precip;
  document.getElementById('visibility-label').textContent = value.visibility;
  document.getElementById('minute-title').textContent = value.next2h;
  document.getElementById('hourly-title').textContent = value.hourly24;
  document.getElementById('air-title').textContent = value.air;
  document.getElementById('daily-title').textContent = value.daily5;
  elements.minuteLead.textContent = value.minuteHint;
  elements.hourlyLead.textContent = value.hourlyHint;
  elements.dailyLead.textContent = value.dailyHint;
  updateThemeControl();
  updateRefreshControl();
}

function openMeteoCondition(code) {
  const zh = isChinese();
  const map = zh ? {
    0: '\u6674', 1: '\u5927\u90e8\u6674\u6717', 2: '\u591a\u4e91', 3: '\u9634',
    45: '\u96fe', 48: '\u51bb\u96fe', 51: '\u5c0f\u96e8', 53: '\u5c0f\u96e8', 55: '\u4e2d\u96e8',
    56: '\u51bb\u96e8', 57: '\u51bb\u96e8', 61: '\u5c0f\u96e8', 63: '\u4e2d\u96e8',
    65: '\u5927\u96e8', 66: '\u51bb\u96e8', 67: '\u51bb\u96e8', 71: '\u5c0f\u96ea',
    73: '\u4e2d\u96ea', 75: '\u5927\u96ea', 77: '\u96ea\u7c92', 80: '\u9635\u96e8',
    81: '\u9635\u96e8', 82: '\u5f3a\u9635\u96e8', 85: '\u9635\u96ea', 86: '\u5f3a\u9635\u96ea',
    95: '\u96f7\u96e8', 96: '\u96f7\u96e8\u4f34\u51b0\u96f9', 99: '\u96f7\u96e8\u4f34\u51b0\u96f9'
  } : {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog',
    48: 'Freezing fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Rain', 56: 'Freezing drizzle',
    57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain',
    67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy rain showers', 85: 'Snow showers',
    86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail'
  };
  return map[Number(code)] || (zh ? '\u672a\u77e5\u5929\u6c14' : 'Unknown weather');
}

function weatherText(item, provider) {
  return textValue(item && item.text) || (provider === 'qweather'
    ? (isChinese() ? '\u672a\u77e5\u5929\u6c14' : 'Unknown weather')
    : openMeteoCondition(item && item.code));
}

function formatTime(value, withDate = false) {
  if (!value) return '';
  try {
    const options = withDate
      ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };
    return new Intl.DateTimeFormat(state.language || 'en-US', options).format(new Date(value));
  } catch (error) {
    const match = textValue(value).match(/(?:T|\s)([0-9]{2}:[0-9]{2})/);
    return match ? match[1] : textValue(value);
  }
}

function tempUnit() {
  return `${String.fromCharCode(176)}${state.unit ? 'F' : 'C'}`;
}

function displayTemperatureValue(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const celsius = Number(value);
  return state.unit ? celsius * 9 / 5 + 32 : celsius;
}

function formatTemperature(value) {
  const display = displayTemperatureValue(value);
  return display === null ? '--' : `${Math.round(display)}${tempUnit()}`;
}

function formatTemperatureShort(value) {
  const display = displayTemperatureValue(value);
  return display === null ? '--' : `${Math.round(display)}${String.fromCharCode(176)}`;
}

function formatNumber(value, suffix, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '--';
  return `${Number(value).toFixed(digits)}${suffix || ''}`;
}

function formatMeasurementUnit(value) {
  const unit = textValue(value);
  if (/^(?:u|\u03bc|\u00b5)g\/m(?:3|\u00b3)$/i.test(unit)) return '\u00b5g/m\u00b3';
  if (/^mg\/m(?:3|\u00b3)$/i.test(unit)) return 'mg/m\u00b3';
  return unit;
}

function formatWindDirection(value) {
  const direction = textValue(value);
  if (!isChinese()) return direction.toUpperCase();
  const names = {
    n: '\u5317\u98ce', nne: '\u5317\u4e1c\u5317\u98ce', ne: '\u4e1c\u5317\u98ce', ene: '\u4e1c\u4e1c\u5317\u98ce',
    e: '\u4e1c\u98ce', ese: '\u4e1c\u4e1c\u5357\u98ce', se: '\u4e1c\u5357\u98ce', sse: '\u5357\u4e1c\u5357\u98ce',
    s: '\u5357\u98ce', ssw: '\u5357\u897f\u5357\u98ce', sw: '\u897f\u5357\u98ce', wsw: '\u897f\u897f\u5357\u98ce',
    w: '\u897f\u98ce', wnw: '\u897f\u897f\u5317\u98ce', nw: '\u897f\u5317\u98ce', nnw: '\u5317\u897f\u5317\u98ce',
    none: '\u65e0\u6301\u7eed\u98ce\u5411', vrb: '\u98ce\u5411\u4e0d\u5b9a'
  };
  return names[direction.toLowerCase()] || direction;
}

function currentSource() {
  const qDataset = state.datasets.current;
  const qCurrent = qDataset && qDataset.data;
  if (qCurrent && qCurrent.temp !== null) {
    return { item: qCurrent, provider: 'qweather', fetchedAt: qDataset.fetchedAt };
  }
  const fallback = state.fallback && state.fallback.data && state.fallback.data.current;
  return fallback && fallback.temp !== null
    ? { item: fallback, provider: 'open-meteo', fetchedAt: state.fallback.fetchedAt }
    : null;
}

function hourlySource() {
  if (state.mode === 'qweather') {
    return { rows: state.datasets.hourly && state.datasets.hourly.data || [], provider: 'qweather' };
  }
  return { rows: state.fallback && state.fallback.data.hourly || [], provider: 'open-meteo' };
}

function dailySource() {
  if (state.mode === 'qweather') {
    return { rows: state.datasets.daily && state.datasets.daily.data || [], provider: 'qweather' };
  }
  return { rows: state.fallback && state.fallback.data.daily || [], provider: 'open-meteo' };
}

function hasCurrentData() {
  return currentSource() !== null;
}

function automaticLocationLabel() {
  const value = labels();
  if (state.locationMode === LOCATION_MODE_DIRECT_IP) return value.directIpLocation;
  if (state.locationMode === LOCATION_MODE_MANUAL) return value.manualLocationError;
  return value.windowsLocation;
}

function automaticLocationErrorLabel() {
  const value = labels();
  if (state.locationMode === LOCATION_MODE_DIRECT_IP) return value.directIpError;
  if (state.locationMode === LOCATION_MODE_MANUAL) return value.manualLocationError;
  return value.windowsLocationError;
}

function setLoading() {
  const value = labels();
  setStaticLabels();
  document.documentElement.lang = state.language || 'en';
  elements.location.textContent = state.location || automaticLocationLabel();
  elements.resolved.textContent = '';
  elements.providerState.textContent = '';
  elements.providerState.classList.remove('warning');
  elements.updateStatus.textContent = '';
  elements.condition.textContent = value.loading;
  elements.temperature.textContent = '--';
  elements.unit.textContent = tempUnit();
  elements.updated.textContent = '';
  elements.heroRange.textContent = '';
  elements.heroRange.hidden = true;
  elements.heroSummary.textContent = '';
  elements.heroSummary.hidden = true;
  elements.heroContext.textContent = '';
  elements.heroContext.hidden = true;
  elements.feels.textContent = '--';
  elements.feelsSub.textContent = '';
  elements.humidity.textContent = '--';
  elements.humidityMeter.style.width = '0%';
  elements.humiditySub.textContent = '';
  elements.wind.textContent = '--';
  elements.windSub.textContent = '';
  elements.precip.textContent = '--';
  elements.precipSub.textContent = '';
  elements.visibility.textContent = '--';
  elements.visibilitySub.textContent = '';
  elements.alerts.hidden = true;
  elements.alerts.replaceChildren();
  elements.minuteSection.hidden = true;
  elements.minuteDot.classList.remove('is-raining');
  elements.minuteThresholdHeavy.textContent = '';
  elements.minuteThresholdLight.textContent = '';
  elements.airSection.hidden = true;
  elements.airLead.textContent = '';
  elements.aqiScaleDot.style.left = '0%';
  elements.airAdvice.textContent = '';
  elements.airAdvice.hidden = true;
  elements.hourly.replaceChildren();
  elements.hourlyLead.textContent = value.hourlyHint;
  elements.forecast.replaceChildren();
  alertsRenderSignature = '';
  setWeatherGlyph(elements.currentGlyph, { code: '999', isDay: 1 }, 'qweather');
  elements.currentGlyph.setAttribute('aria-label', value.loading);
  drawWeatherIcon(elements.currentIcon, { code: '999', isDay: 1 }, 'qweather');
  updateRefreshControl();
}

function setError() {
  setLoading();
  const value = labels();
  elements.condition.textContent = state.location ? value.error : automaticLocationErrorLabel();
  elements.providerState.textContent = state.apiHost ? labels().fallback : 'Open-Meteo';
  elements.providerState.classList.add('warning');
}

function renderProviderState() {
  const value = labels();
  elements.providerState.classList.remove('warning');
  if (state.qAuthFailed) {
    elements.providerState.textContent = state.mode === 'qweather'
      ? `${value.authFailed} | ${value.lastData}`
      : `${value.authFailed} | ${value.fallback}`;
    elements.providerState.classList.add('warning');
  } else if (state.mode === 'qweather') {
    const hasErrors = Object.keys(state.errors).some((name) => name !== 'fallback');
    elements.providerState.textContent = hasErrors ? `${value.qweather} | ${value.partial}` : value.qweather;
    elements.providerState.classList.toggle('warning', hasErrors);
  } else if (state.apiHost) {
    elements.providerState.textContent = value.fallback;
    elements.providerState.classList.add('warning');
  } else {
    elements.providerState.textContent = 'Open-Meteo';
  }
}

function effectiveTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (error) {
    return 'light';
  }
}

function updateThemeControl() {
  if (!elements.themeButton) return;
  const dark = effectiveTheme() === 'dark';
  const value = labels();
  const label = dark ? value.switchToLight : value.switchToDark;
  const icon = elements.themeButton.querySelector('.control-icon');
  if (icon) icon.textContent = dark ? '\u2600' : '\u263e';
  elements.themeButton.dataset.themeMode = dark ? 'dark' : 'light';
  elements.themeButton.title = label;
  elements.themeButton.setAttribute('aria-label', label);
  elements.themeButton.setAttribute('aria-pressed', dark ? 'true' : 'false');
}

function updateRefreshControl() {
  if (!elements.refreshButton) return;
  const value = labels();
  const icon = elements.refreshButton.querySelector('.control-icon');
  if (icon) icon.textContent = '\u21bb';
  const remaining = Math.max(0, manualRefreshCooldownUntil - Date.now());
  const disabled = manualRefreshInFlight || !state.coords || state.status !== 'ready' || remaining > 0;
  elements.refreshButton.disabled = disabled;
  elements.refreshButton.classList.toggle('is-busy', manualRefreshInFlight);
  elements.refreshButton.setAttribute('aria-busy', manualRefreshInFlight ? 'true' : 'false');
  const label = manualRefreshInFlight
    ? value.refreshing
    : remaining > 0 ? value.refreshDeferred : value.refresh;
  elements.refreshButton.title = label;
  elements.refreshButton.setAttribute('aria-label', label);
  if (manualRefreshCooldownTimer) {
    clearTimeout(manualRefreshCooldownTimer);
    manualRefreshCooldownTimer = null;
  }
  if (!manualRefreshInFlight && remaining > 0) {
    manualRefreshCooldownTimer = setTimeout(() => {
      manualRefreshCooldownTimer = null;
      updateRefreshControl();
    }, remaining + 10);
  }
}

function setRefreshNotice(message) {
  refreshNotice = textValue(message);
  refreshNoticeUntil = Date.now() + 1800;
  if (refreshNoticeTimer) clearTimeout(refreshNoticeTimer);
  refreshNoticeTimer = setTimeout(() => {
    refreshNoticeTimer = null;
    refreshNotice = '';
    refreshNoticeUntil = 0;
    renderUpdateStatus(currentSource());
  }, 1800);
  renderUpdateStatus(currentSource());
}

function renderUpdateStatus(current) {
  if (!elements.updateStatus) return;
  const value = labels();
  if (manualRefreshInFlight) {
    elements.updateStatus.textContent = value.refreshing;
    return;
  }
  if (refreshNotice && Date.now() < refreshNoticeUntil) {
    elements.updateStatus.textContent = refreshNotice;
    return;
  }
  const item = current && current.item;
  const updateTime = item && item.time || current && current.fetchedAt;
  elements.updateStatus.textContent = updateTime ? value.updated + ' ' + formatTime(updateTime) : '';
}

function notifyNativeTheme(theme) {
  try {
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage(theme === 'dark'
        ? 'ep_weather_theme_dark'
        : 'ep_weather_theme_light');
    }
  } catch (error) {
    // Standalone previews do not provide the native WebView host.
  }
}

function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  updateThemeControl();
  notifyNativeTheme(next);
}

async function refreshWeatherNow() {
  const value = labels();
  const now = Date.now();
  if (manualRefreshInFlight || !state.coords || now < manualRefreshCooldownUntil) return false;
  manualRefreshInFlight = true;
  manualRefreshCooldownUntil = now + MANUAL_REFRESH_COOLDOWN;
  updateRefreshControl();
  renderUpdateStatus(currentSource());
  try {
    const changed = await refreshDue(true);
    setRefreshNotice(changed ? value.refreshDone : value.refreshDeferred);
    return Boolean(changed);
  } catch (error) {
    setRefreshNotice(value.refreshFailed);
    return false;
  } finally {
    manualRefreshInFlight = false;
    updateRefreshControl();
    renderUpdateStatus(currentSource());
  }
}

function alertColor(alert) {
  const rawColor = alert.color && typeof alert.color === 'object'
    ? textValue(pick(alert.color, ['code', 'name']))
    : textValue(alert.color);
  const value = `${alert.severity} ${alert.title} ${rawColor}`.toLowerCase();
  if (/red|extreme|severe|\u7ea2|\u7279\u522b\u4e25\u91cd/.test(value)) return '#b3261e';
  if (/orange|moderate|\u6a59|\u4e25\u91cd/.test(value)) return '#c55318';
  if (/yellow|minor|\u9ec4|\u8f83\u91cd/.test(value)) return '#9a6500';
  if (/blue|\u84dd|\u4e00\u822c/.test(value)) return '#286fa8';
  return '#b3261e';
}

function alertLevelText(alert) {
  const rawColor = alert.color && typeof alert.color === 'object'
    ? textValue(pick(alert.color, ['code', 'name'])).toLowerCase()
    : textValue(alert.color).toLowerCase();
  if (isChinese()) {
    const colorNames = { red: '\u7ea2\u8272', orange: '\u6a59\u8272', yellow: '\u9ec4\u8272', blue: '\u84dd\u8272', white: '\u767d\u8272' };
    if (colorNames[rawColor]) return colorNames[rawColor];
  }
  return textValue(alert.severity) || rawColor || labels().officialAlert;
}

function alertBlock(label, content) {
  if (!content) return null;
  const block = document.createElement('div');
  block.className = 'alert-block';
  const heading = document.createElement('strong');
  heading.textContent = label;
  const text = document.createElement('div');
  text.textContent = content;
  block.append(heading, text);
  return block;
}

function alertIdentity(alert, index) {
  const id = textValue(alert && alert.id);
  if (id) return `id:${id}`;
  const fallback = [
    alert && alert.type,
    alert && alert.title,
    alert && alert.published,
    alert && alert.start,
    alert && alert.end
  ].map((value) => textValue(value)).join('|');
  return fallback || `index:${index}`;
}

function renderAlerts() {
  const value = labels();
  const data = state.mode === 'qweather' && state.datasets.alerts && state.datasets.alerts.data;
  const alerts = data && Array.isArray(data.items) ? data.items : [];
  const entries = alerts.map((alert, index) => ({ alert, key: alertIdentity(alert, index) }));
  const signature = JSON.stringify([
    state.generation,
    state.language,
    entries.map(({ alert, key }) => [
      key,
      alertColor(alert),
      alertLevelText(alert),
      alert.title,
      alert.type,
      alert.sender,
      alert.published,
      alert.start,
      alert.end,
      alert.description,
      alert.standard,
      alert.instruction
    ].map((field) => textValue(field)))
  ]);
  if (signature === alertsRenderSignature && elements.alerts.childElementCount === entries.length) return;
  alertsRenderSignature = signature;
  const previousState = new Map(state.alertOpenStates);
  for (const details of elements.alerts.querySelectorAll('details.alert[data-alert-key]')) {
    previousState.set(details.dataset.alertKey, details.open);
  }
  const activeKeys = new Set(entries.map(({ key }) => key));
  for (const key of state.alertOpenStates.keys()) {
    if (!activeKeys.has(key)) state.alertOpenStates.delete(key);
  }
  elements.alerts.replaceChildren();
  elements.alerts.hidden = alerts.length === 0;
  for (const { alert, key } of entries) {
    const details = document.createElement('details');
    const color = alertColor(alert);
    const open = previousState.has(key)
      ? previousState.get(key)
      : color === '#b3261e' || color === '#c55318';
    details.className = 'alert';
    details.dataset.alertKey = key;
    details.style.setProperty('--alert-color', color);
    details.open = open;
    state.alertOpenStates.set(key, open);
    const summary = document.createElement('summary');
    const level = document.createElement('span');
    level.className = 'alert-level';
    level.textContent = alertLevelText(alert);
    const title = document.createElement('span');
    title.className = 'alert-title';
    title.textContent = alert.title || alert.type || value.officialAlert;
    const time = document.createElement('span');
    time.className = 'alert-time';
    time.textContent = formatTime(alert.published, true);
    summary.append(level, title, time);
    const body = document.createElement('div');
    body.className = 'alert-body';
    const meta = document.createElement('div');
    meta.className = 'alert-meta';
    const metaParts = [];
    if (alert.sender) metaParts.push(`${value.publisher}: ${alert.sender}`);
    const period = [formatTime(alert.start, true), formatTime(alert.end, true)].filter(Boolean).join(' - ');
    if (period) metaParts.push(`${value.validUntil}: ${period}`);
    meta.textContent = metaParts.join(' | ');
    if (meta.textContent) body.append(meta);
    for (const block of [
      alertBlock(value.details, alert.description),
      alertBlock(value.standard, alert.standard),
      alertBlock(value.instruction, alert.instruction)
    ]) if (block) body.append(block);
    details.append(summary, body);
    // Capture the intended state before the native details click action completes.
    summary.addEventListener('click', () => {
      state.alertOpenStates.set(key, !details.open);
    });
    details.addEventListener('toggle', () => {
      if (elements.alerts.contains(details)) state.alertOpenStates.set(key, details.open);
    });
    elements.alerts.append(details);
  }
}

function renderMinuteForecast() {
  const value = labels();
  const minute = state.mode === 'qweather' && state.datasets.minutely && state.datasets.minutely.data;
  if (!minute) {
    elements.minuteSection.hidden = true;
    return;
  }
  elements.minuteSection.hidden = false;
  elements.minuteLead.textContent = value.minuteHint;
  if (minute.available === false) {
    elements.minuteUpdated.textContent = '';
    elements.minuteSummary.textContent = value.unavailable;
    elements.minuteSummary.classList.remove('is-raining');
    elements.minuteDot.classList.remove('is-raining');
    elements.minuteThresholdHeavy.textContent = '';
    elements.minuteThresholdLight.textContent = '';
    elements.minuteChart.replaceChildren();
    elements.minuteAxis.replaceChildren();
    return;
  }
  elements.minuteUpdated.textContent = [value.minutePoints, formatTime(minute.updated)].filter(Boolean).join(' | ');
  const points = Array.isArray(minute.points) ? minute.points.slice(0, 24) : [];
  const raining = points.some((point) => Number(point.precip) > 0);
  elements.minuteSummary.textContent = minute.summary || (raining ? value.next2h : value.noRain);
  elements.minuteSummary.classList.toggle('is-raining', raining);
  elements.minuteDot.classList.toggle('is-raining', raining);
  elements.minuteThresholdHeavy.textContent = value.moderateRain + ' >= 0.15 mm';
  elements.minuteThresholdLight.textContent = value.lightRain + ' >= 0.05 mm';
  elements.minuteChart.replaceChildren();
  const max = Math.max(0.1, ...points.map((point) => Number(point.precip) || 0));
  for (let index = 0; index < 24; ++index) {
    const point = points[index] || { precip: 0 };
    const bar = document.createElement('span');
    const precipitation = Number(point.precip) || 0;
    const intensity = precipitation >= 0.15 ? 'heavy'
      : precipitation >= 0.05 ? 'rain' : precipitation > 0 ? 'drizzle' : 'none';
    bar.className = 'minute-bar minute-bar-' + intensity;
    bar.style.height = Math.max(2, Math.round(precipitation / max * 46)) + 'px';
    bar.title = formatTime(point.time) + ' ' + formatNumber(point.precip, ' mm', 1);
    bar.setAttribute('aria-label', bar.title);
    elements.minuteChart.append(bar);
  }
  elements.minuteAxis.replaceChildren();
  const axisLabels = isChinese()
    ? ['\u73b0\u5728', '30 \u5206\u949f', '60 \u5206\u949f', '90 \u5206\u949f', '120 \u5206\u949f']
    : ['Now', '30 min', '60 min', '90 min', '120 min'];
  for (const label of axisLabels) {
    const span = document.createElement('span');
    span.textContent = label;
    elements.minuteAxis.append(span);
  }
}

function renderHourly() {
  const value = labels();
  const source = hourlySource();
  let rows = Array.isArray(source.rows) ? source.rows : [];
  if (source.provider === 'open-meteo') {
    const current = currentSource();
    const currentTime = current && current.item.time || '';
    let start = rows.findIndex((row) => textValue(row.time) >= textValue(currentTime));
    if (start < 0) start = 0;
    rows = rows.slice(start, start + 24);
  } else {
    rows = rows.slice(0, 24);
  }
  elements.hourly.replaceChildren();
  elements.hourlyLead.textContent = value.hourlyHint;
  elements.hourlyNote.textContent = rows.length ? `${value.rainChance} | ${rows.length}h` : value.unavailable;
  for (let index = 0; index < rows.length; ++index) {
    const row = rows[index];
    const hour = document.createElement('div');
    hour.className = index === 0 ? 'hour current' : 'hour';
    if (index === 0) hour.setAttribute('aria-current', 'true');
    const time = document.createElement('div');
    time.className = 'hour-time';
    time.textContent = index === 0 && source.provider === 'open-meteo' ? value.now : formatTime(row.time);
    const descriptionText = weatherText(row, source.provider);
    const icon = document.createElement('i');
    icon.className = 'weather-glyph';
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', descriptionText);
    setWeatherGlyph(icon, row, source.provider);
    const temperature = document.createElement('div');
    temperature.className = 'hour-temp';
    temperature.textContent = formatTemperature(row.temp);
    const description = document.createElement('div');
    description.className = 'hour-text';
    description.textContent = descriptionText;
    const probability = document.createElement('div');
    probability.className = 'hour-prob';
    const probabilityValue = Number(row.pop);
    probability.classList.toggle('hour-prob-medium', Number.isFinite(probabilityValue) && probabilityValue >= 30 && probabilityValue < 60);
    probability.classList.toggle('hour-prob-high', Number.isFinite(probabilityValue) && probabilityValue >= 60);
    probability.textContent = row.pop === null || row.pop === undefined ? '--' : `${row.pop}%`;
    probability.title = `${value.rainChance}: ${probability.textContent}`;
    hour.append(time, icon, temperature, description, probability);
    elements.hourly.append(hour);
  }
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = value.unavailable;
    elements.hourly.append(empty);
  }
}

function aqiColor(aqi) {
  const value = Number(aqi);
  if (value <= 50) return 'var(--green)';
  if (value <= 100) return 'var(--amber)';
  if (value <= 150) return 'var(--orange)';
  return 'var(--red)';
}

function renderAirQuality() {
  const value = labels();
  const dataset = state.mode === 'qweather' && state.datasets.air;
  const air = dataset && dataset.data;
  if (!air) {
    elements.airSection.hidden = state.mode !== 'qweather';
    elements.airNote.textContent = value.unavailable;
    elements.airLead.textContent = value.unavailable;
    elements.aqiValue.textContent = '--';
    elements.aqiCategory.textContent = '';
    elements.aqiScaleDot.style.left = '0%';
    elements.pollutants.replaceChildren();
    elements.airAdvice.textContent = '';
    elements.airAdvice.hidden = true;
    return;
  }
  elements.airSection.hidden = false;
  elements.airNote.textContent = air.primary ? `${value.primary}: ${air.primary}` : '';
  elements.airLead.textContent = value.monitoring;
  elements.aqiValue.textContent = air.aqi === null ? '--' : Math.round(air.aqi);
  elements.aqiValue.style.color = aqiColor(air.aqi);
  elements.aqiCategory.textContent = [air.category, air.level ? `${value.level} ${air.level}` : ''].filter(Boolean).join(' | ');
  const aqiPosition = air.aqi === null ? 0 : Math.max(0, Math.min(100, Number(air.aqi) / 300 * 100));
  elements.aqiScaleDot.style.left = `${aqiPosition}%`;
  elements.pollutants.replaceChildren();
  const primary = textValue(air.primary).toLowerCase();
  for (const pollutant of (air.pollutants || []).slice(0, 6)) {
    const item = document.createElement('div');
    const pollutantCode = textValue(pollutant.code).toLowerCase();
    const pollutantName = textValue(pollutant.name).toLowerCase();
    const isPrimary = primary && (
      primary === pollutantCode ||
      primary === pollutantName ||
      primary.includes(pollutantCode) ||
      pollutantName.includes(primary)
    );
    item.className = isPrimary ? 'pollutant pollutant-primary' : 'pollutant';
    const name = document.createElement('span');
    name.className = 'pollutant-name';
    name.textContent = pollutant.name || pollutant.code.toUpperCase();
    const number = document.createElement('span');
    number.className = 'pollutant-value';
    number.textContent = formatNumber(pollutant.value, '', pollutant.code === 'co' ? 1 : 0);
    const unit = document.createElement('span');
    unit.className = 'pollutant-unit';
    unit.textContent = formatMeasurementUnit(pollutant.unit);
    item.append(name, number, unit);
    elements.pollutants.append(item);
  }
  elements.airAdvice.textContent = air.advice || '';
  elements.airAdvice.hidden = !elements.airAdvice.textContent;
}

function renderDaily() {
  const value = labels();
  const source = dailySource();
  const rows = Array.isArray(source.rows) ? source.rows.slice(0, 5) : [];
  elements.forecast.replaceChildren();
  elements.dailyLead.textContent = value.dailyHint;
  elements.dailyNote.textContent = rows.length ? '' : value.unavailable;
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = value.unavailable;
    elements.forecast.append(empty);
    return;
  }
  const weekdayFormatter = new Intl.DateTimeFormat(state.language || 'en-US', { weekday: 'short' });
  const dateFormatter = new Intl.DateTimeFormat(state.language || 'en-US', { month: 'numeric', day: 'numeric' });
  const temperatures = rows.flatMap((row) => [row.tempMin, row.tempMax]).map(Number).filter(Number.isFinite);
  const overallMin = temperatures.length ? Math.min(...temperatures) : 0;
  const overallMax = temperatures.length ? Math.max(...temperatures) : 1;
  const temperatureSpan = Math.max(1, overallMax - overallMin);
  for (let index = 0; index < rows.length; ++index) {
    const row = rows[index];
    const day = document.createElement('div');
    day.className = 'day';
    const date = document.createElement('div');
    date.className = 'day-date';
    const name = document.createElement('div');
    name.className = 'day-name';
    const subdate = document.createElement('span');
    subdate.className = 'day-subdate';
    try {
      const parsedDate = new Date(`${row.date}T12:00:00`);
      name.textContent = index === 0 ? value.today : index === 1 ? value.tomorrow : weekdayFormatter.format(parsedDate);
      subdate.textContent = dateFormatter.format(parsedDate);
    } catch (error) {
      name.textContent = row.date;
      subdate.textContent = '';
    }
    date.append(name, subdate);
    const weather = document.createElement('div');
    weather.className = 'day-weather';
    const descriptionText = weatherText(row, source.provider);
    const icon = document.createElement('i');
    icon.className = 'weather-glyph';
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', descriptionText);
    setWeatherGlyph(icon, row, source.provider);
    const text = document.createElement('div');
    text.className = 'day-text';
    text.textContent = descriptionText;
    const probability = document.createElement('div');
    probability.className = 'day-pop';
    probability.textContent = row.pop === null || row.pop === undefined ? `${value.rain} --` : `${value.rain} ${row.pop}%`;
    probability.setAttribute('aria-label', probability.textContent);
    weather.append(icon, text);
    const range = document.createElement('div');
    range.className = 'day-range';
    const low = document.createElement('span');
    low.className = 'day-low';
    low.textContent = formatTemperatureShort(row.tempMin);
    const track = document.createElement('div');
    track.className = 'day-track';
    const fill = document.createElement('span');
    fill.className = 'day-range-fill';
    const min = Number(row.tempMin);
    const max = Number(row.tempMax);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      let left = Math.max(0, Math.min(100, (min - overallMin) / temperatureSpan * 100));
      const width = Math.max(8, Math.min(100, (max - min) / temperatureSpan * 100));
      left = Math.min(left, 100 - width);
      fill.style.left = `${left}%`;
      fill.style.width = `${width}%`;
    } else {
      fill.hidden = true;
    }
    track.append(fill);
    const high = document.createElement('span');
    high.className = 'day-high';
    high.textContent = formatTemperatureShort(row.tempMax);
    range.append(low, track, high);
    day.append(date, weather, probability, range);
    elements.forecast.append(day);
  }
}

function collectSources() {
  const sources = [];
  function append(values) {
    for (const value of values || []) {
      const clean = textValue(value);
      if (clean && !sources.some((existing) => existing.toLowerCase() === clean.toLowerCase())) sources.push(clean);
    }
  }
  if (state.mode === 'qweather') {
    append(['QWeather']);
    for (const name of DATASET_NAMES) {
      const dataset = state.datasets[name];
      append(dataset && dataset.refer && dataset.refer.sources);
      append(dataset && dataset.data && dataset.data.refer && dataset.data.refer.sources);
    }
  } else {
    append(['Open-Meteo', state.place && state.place.source]);
  }
  if (state.mode === 'qweather') append([state.place && state.place.source]);
  if (state.place && /^Direct IP/i.test(textValue(state.place.source))) append(['ipwho.is']);
  return sources;
}

function qweatherAttributionUrl() {
  for (const name of DATASET_NAMES) {
    const links = state.datasets[name] && state.datasets[name].refer && state.datasets[name].refer.attributions;
    for (const link of links || []) {
      if (/^https:\/\/developer\.qweather\.com\/attribution\.html(?:[?#].*)?$/i.test(link)) return link;
    }
  }
  return 'https://developer.qweather.com/attribution.html';
}

function renderSources() {
  const value = labels();
  elements.poweredBy.replaceChildren();
  const attribution = document.createElement('span');
  attribution.textContent = 'QWeather Icons';
  if (state.mode === 'qweather') {
    const link = document.createElement('a');
    link.href = qweatherAttributionUrl();
    link.textContent = value.powered;
    elements.poweredBy.append(link, document.createTextNode(' · '), attribution);
  } else {
    const link = document.createElement('a');
    link.href = 'https://open-meteo.com/';
    link.textContent = 'Open-Meteo';
    elements.poweredBy.append(link, document.createTextNode(' · '), attribution);
  }
  const sources = collectSources();
  elements.sourceList.textContent = sources.length ? `${value.sources}: ${sources.join(', ')}` : '';
}

function displayWindSpeed(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return state.unit ? Number(value) / 1.609344 : Number(value);
}

function renderHero(item) {
  const value = labels();
  const daily = dailySource().rows[0];
  const dailyRange = daily && daily.tempMin !== null && daily.tempMax !== null
    ? value.today + ' ' + formatTemperatureShort(daily.tempMin) + ' - ' + formatTemperatureShort(daily.tempMax)
    : '';
  elements.heroRange.textContent = dailyRange;
  elements.heroRange.hidden = !dailyRange;

  const minute = state.mode === 'qweather' && state.datasets.minutely && state.datasets.minutely.data;
  const summary = minute && minute.available !== false ? textValue(minute.summary) : '';
  elements.heroSummary.textContent = summary;
  elements.heroSummary.hidden = !summary;

  const context = [];
  if (item.feels !== null && item.feels !== undefined) {
    context.push(value.feels + ' ' + formatTemperature(item.feels));
  }
  if (item.humidity !== null && item.humidity !== undefined) {
    context.push(value.humidity + ' ' + formatNumber(item.humidity, '%'));
  }
  const windSpeed = displayWindSpeed(item.windSpeed);
  if (windSpeed !== null) {
    context.push((item.windDir ? formatWindDirection(item.windDir) + ' ' : '') +
      formatNumber(windSpeed, state.unit ? ' mph' : ' km/h'));
  }
  elements.heroContext.textContent = context.join(' \u00b7 ');
  elements.heroContext.hidden = !elements.heroContext.textContent;
}

function renderMetrics(item) {
  const value = labels();
  elements.feels.textContent = formatTemperature(item.feels);
  elements.humidity.textContent = formatNumber(item.humidity, '%');
  elements.wind.textContent = (item.windDir ? formatWindDirection(item.windDir) + ' ' : '') +
    formatNumber(displayWindSpeed(item.windSpeed), state.unit ? ' mph' : ' km/h');
  const precipitation = item.precip === null || item.precip === undefined
    ? null
    : state.unit ? Number(item.precip) / 25.4 : Number(item.precip);
  const visibility = item.visibility === null || item.visibility === undefined
    ? null
    : state.unit ? Number(item.visibility) / 1.609344 : Number(item.visibility);
  elements.precip.textContent = formatNumber(precipitation, state.unit ? ' in' : ' mm', state.unit ? 2 : 1);
  elements.visibility.textContent = formatNumber(visibility, state.unit ? ' mi' : ' km', 0);

  const temp = displayTemperatureValue(item.temp);
  const feels = displayTemperatureValue(item.feels);
  if (temp === null || feels === null) {
    elements.feelsSub.textContent = '';
  } else {
    const delta = Math.round((feels - temp) * 10) / 10;
    elements.feelsSub.textContent = Math.abs(delta) < 1
      ? value.feelsClose
      : delta > 0 ? value.feelsWarm + ' +' + delta + String.fromCharCode(176)
        : value.feelsCool + ' ' + delta + String.fromCharCode(176);
  }

  const humidity = item.humidity === null || item.humidity === undefined ? null : Number(item.humidity);
  elements.humidityMeter.style.width = humidity === null ? '0%' : Math.max(0, Math.min(100, humidity)) + '%';
  elements.humiditySub.textContent = humidity === null
    ? ''
    : humidity < 35 ? value.humidityDry : humidity >= 75 ? value.humidityHigh : value.humidityComfort;

  elements.windSub.textContent = item.windDir ? value.observed + ': ' + formatWindDirection(item.windDir) : '';
  elements.precipSub.textContent = precipitation === null ? '' : value.observed;
  elements.visibilitySub.textContent = visibility === null
    ? ''
    : visibility >= 10 ? value.visibilityGood : visibility >= 5 ? value.visibilityFair : value.visibilityLow;
}

function renderWeather() {
  const current = currentSource();
  if (!current) {
    if (state.status === 'error') setError();
    return;
  }
  const value = labels();
  const item = current.item;
  document.documentElement.lang = state.language || 'en';
  setStaticLabels();
  elements.location.textContent = state.place && state.place.name || state.location;
  const resolvedParts = [state.place && state.place.city, state.place && (state.place.province || state.place.country)]
    .map((part) => textValue(part))
    .filter((part, index, array) => part && array.indexOf(part) === index && part !== elements.location.textContent);
  const locationSource = textValue(state.place && state.place.source);
  if (/^Windows Location/i.test(locationSource)) {
    resolvedParts.push(value.windowsLocationSource);
  } else if (/^Direct IP/i.test(locationSource)) {
    resolvedParts.push(value.directIpSource);
  }
  elements.resolved.textContent = resolvedParts.join(' \u00b7 ');
  renderProviderState();
  elements.temperature.textContent = Math.round(displayTemperatureValue(item.temp));
  elements.unit.textContent = tempUnit();
  elements.condition.textContent = weatherText(item, current.provider);
  const updateTime = item.time || current.fetchedAt;
  elements.updated.textContent = updateTime ? `${value.updated} ${formatTime(updateTime)}` : '';
  renderUpdateStatus(current);
  renderHero(item);
  renderMetrics(item);
  setWeatherGlyph(elements.currentGlyph, item, current.provider);
  elements.currentGlyph.setAttribute('aria-label', weatherText(item, current.provider));
  drawWeatherIcon(elements.currentIcon, item, current.provider);
  renderAlerts();
  renderMinuteForecast();
  renderHourly();
  renderAirQuality();
  renderDaily();
  renderSources();
}

function scheduleRenderAndCapture(captureTaskbar) {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderWeather();
    if (captureTaskbar || hasCurrentData()) notifyHost();
  }, 0);
}

function notifyHost() {
  if (state.notifyTimer) clearTimeout(state.notifyTimer);
  state.notifyTimer = setTimeout(() => {
    state.notifyTimer = null;
    try {
      if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage('ep_weather_updated');
    } catch (error) {
      // The standalone verifier and visual tests do not provide a WebView host.
    }
  }, 300);
}

function imageHex(width, height) {
  const outputWidth = Math.max(1, Math.min(64, Number(width) || 32));
  const outputHeight = Math.max(1, Math.min(64, Number(height) || outputWidth));
  const source = elements.currentIcon;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  let left = source.width, top = source.height, right = -1, bottom = -1;
  for (let y = 0; y < source.height; ++y) {
    for (let x = 0; x < source.width; ++x) {
      if (pixels[(y * source.width + x) * 4 + 3] > 8) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth; canvas.height = outputHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (right >= left && bottom >= top) {
    const padding = 2;
    left = Math.max(0, left - padding); top = Math.max(0, top - padding);
    right = Math.min(source.width - 1, right + padding); bottom = Math.min(source.height - 1, bottom + padding);
    const sourceWidth = right - left + 1;
    const sourceHeight = bottom - top + 1;
    const scale = Math.min((outputWidth - 2) / sourceWidth, (outputHeight - 2) / sourceHeight);
    const destinationWidth = Math.max(1, Math.round(sourceWidth * scale));
    const destinationHeight = Math.max(1, Math.round(sourceHeight * scale));
    context.drawImage(source, left, top, sourceWidth, sourceHeight,
      Math.floor((outputWidth - destinationWidth) / 2), Math.floor((outputHeight - destinationHeight) / 2),
      destinationWidth, destinationHeight);
  }
  const output = context.getImageData(0, 0, outputWidth, outputHeight).data;
  const digits = '0123456789abcdef';
  let result = '';
  for (let index = 0; index < output.length; index += 4) {
    const alpha = output[index + 3];
    const values = [
      Math.round(output[index + 2] * alpha / 255),
      Math.round(output[index + 1] * alpha / 255),
      Math.round(output[index] * alpha / 255),
      alpha
    ];
    for (const value of values) result += digits[(value >> 4) & 15] + digits[value & 15];
  }
  return result;
}

// Keep the private response field stable; the native host owns the viewport size.
const NATIVE_VIEWPORT_HEIGHT = 367;

function safeField(value) {
  return textValue(value).replace(/[#"]/g, ' ');
}

window.epWeatherGetData = function(location, language, unit, width, height, apiHost, locationMode) {
  const cleanLocation = textValue(location);
  const cleanLanguage = textValue(language, 'en-US') || 'en-US';
  const selectedUnit = Number(unit) ? 1 : 0;
  const cleanHost = validQWeatherHost(apiHost) ? textValue(apiHost).toLowerCase() : '';
  const numericLocationMode = Number(locationMode);
  const selectedLocationMode = [LOCATION_MODE_WINDOWS, LOCATION_MODE_LEGACY_PRECISE,
    LOCATION_MODE_DIRECT_IP, LOCATION_MODE_MANUAL].includes(numericLocationMode)
    ? numericLocationMode : LOCATION_MODE_WINDOWS;
  const key = `${cleanLocation}\n${cleanLanguage}\n${selectedUnit}\n${cleanHost}\n${selectedLocationMode}`;
  state.iconWidth = width;
  state.iconHeight = height;
  if (state.key !== key) {
    state.key = key;
    state.location = cleanLocation;
    state.language = cleanLanguage;
    state.unit = selectedUnit;
    state.apiHost = cleanHost;
    state.locationMode = selectedLocationMode;
    resetState();
    initializeWeather(state.generation);
    return 'ep_pending';
  }
  refreshDue(false).catch(() => {});
  if (state.status === 'loading' || state.status === 'idle') return 'ep_pending';
  const current = currentSource();
  if (state.status !== 'ready' || !current) return 'ep_error';
  const item = current.item;
  return `${document.documentElement.getAttribute('dir') || 'ltr'}#${NATIVE_VIEWPORT_HEIGHT}#${Math.round(displayTemperatureValue(item.temp))}#${tempUnit()}#${safeField(weatherText(item, current.provider))}#${safeField(state.place && state.place.name || state.location)}#${imageHex(width, height)}`;
};

window.epWeatherRefresh = refreshWeatherNow;

if (elements.themeButton) elements.themeButton.addEventListener('click', toggleTheme);
if (elements.refreshButton) {
  elements.refreshButton.addEventListener('click', () => {
    refreshWeatherNow().catch(() => setRefreshNotice(labels().refreshFailed));
  });
}

if (window.__epWeatherTestMode) {
  window.__epWeatherTest = Object.freeze({
    state,
    normalizeQCurrent,
    normalizeQHourly,
    normalizeQDaily,
    normalizeQMinutely,
    normalizeQAlerts,
    normalizeQAir,
    normalizeOpenMeteo,
    normalizeDirectIpLocation,
    normalizeWindowsLocation,
    validQWeatherHost,
    refreshDue,
    DATASET_TTL,
    weatherIconCode,
    weatherIconGlyph,
    weatherIconFontReady: () => weatherIconFontLoaded,
    renderWeather,
    refreshWeatherNow,
    toggleTheme
  });
}

setLoading();
initializeWeatherIconFont();
