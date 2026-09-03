const elements = {
  weather: document.getElementById('weather'),
  location: document.getElementById('location'),
  resolved: document.getElementById('resolved'),
  providerState: document.getElementById('provider-state'),
  alerts: document.getElementById('alerts'),
  currentIcon: document.getElementById('current-icon'),
  temperature: document.getElementById('temperature'),
  unit: document.getElementById('unit'),
  condition: document.getElementById('condition'),
  updated: document.getElementById('updated'),
  feels: document.getElementById('feels'),
  humidity: document.getElementById('humidity'),
  wind: document.getElementById('wind'),
  precip: document.getElementById('precip'),
  visibility: document.getElementById('visibility'),
  minuteSection: document.getElementById('minute-section'),
  minuteUpdated: document.getElementById('minute-updated'),
  minuteSummary: document.getElementById('minute-summary'),
  minuteChart: document.getElementById('minute-chart'),
  minuteAxis: document.getElementById('minute-axis'),
  hourly: document.getElementById('hourly'),
  hourlyNote: document.getElementById('hourly-note'),
  airSection: document.getElementById('air-section'),
  airNote: document.getElementById('air-note'),
  aqiValue: document.getElementById('aqi-value'),
  aqiCategory: document.getElementById('aqi-category'),
  pollutants: document.getElementById('pollutants'),
  airAdvice: document.getElementById('air-advice'),
  forecast: document.getElementById('forecast'),
  dailyNote: document.getElementById('daily-note'),
  poweredBy: document.getElementById('powered-by'),
  sourceList: document.getElementById('source-list')
};

let renderTimer = null;

function isChinese() {
  return /^zh/i.test(state.language || '');
}

function labels() {
  return isChinese() ? {
    loading: '\u52a0\u8f7d\u4e2d...',
    error: '\u65e0\u6cd5\u83b7\u53d6\u5929\u6c14',
    feels: '\u4f53\u611f',
    humidity: '\u6e7f\u5ea6',
    wind: '\u98ce\u901f',
    precip: '\u964d\u6c34',
    visibility: '\u80fd\u89c1\u5ea6',
    updated: '\u66f4\u65b0',
    next2h: '\u672a\u6765 2 \u5c0f\u65f6\u964d\u6c34',
    hourly24: '\u672a\u6765 24 \u5c0f\u65f6',
    rainChance: '\u964d\u96e8\u6982\u7387',
    air: '\u7a7a\u6c14\u8d28\u91cf',
    daily5: '\u672a\u6765 5 \u5929',
    today: '\u4eca\u5929',
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
    qweather: '\u548c\u98ce\u5929\u6c14'
  } : {
    loading: 'Loading...',
    error: 'Unable to load weather',
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
    qweather: 'QWeather'
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

function weatherKind(code, provider) {
  const value = Number(code);
  if (provider === 'qweather') {
    if ([100, 150].includes(value)) return 'clear';
    if ([101, 102, 151, 152].includes(value)) return 'partly';
    if ([103, 104, 153, 154].includes(value)) return 'cloud';
    if ((value >= 302 && value <= 304) || (value >= 307 && value <= 313)) return 'storm';
    if (value >= 300 && value < 400) return 'rain';
    if (value >= 400 && value < 500) return 'snow';
    if (value >= 500 && value < 600) return 'fog';
    return 'cloud';
  }
  if (value === 0 || value === 1) return 'clear';
  if (value === 2) return 'partly';
  if (value === 45 || value === 48) return 'fog';
  if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'snow';
  if (value >= 95) return 'storm';
  if ((value >= 51 && value <= 67) || (value >= 80 && value <= 82)) return 'rain';
  return 'cloud';
}

function isDaytime(item, provider) {
  if (item && item.isDay !== null && item.isDay !== undefined) return Number(item.isDay) === 1;
  const code = Number(item && item.code);
  if (provider === 'qweather' && code >= 150 && code < 200) return false;
  return true;
}

function drawWeatherIcon(canvas, item, provider) {
  const context = canvas.getContext('2d');
  const scale = canvas.width / 96;
  const kind = weatherKind(item && item.code, provider);
  const day = isDaytime(item, provider);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(scale, scale);
  const sunColor = day ? '#f5b521' : '#9daed5';
  const cloudColor = day ? '#778597' : '#8d99aa';
  const rainColor = '#3f8bc9';
  function sun() {
    context.fillStyle = sunColor;
    context.beginPath(); context.arc(40, 38, 18, 0, Math.PI * 2); context.fill();
    context.strokeStyle = sunColor; context.lineWidth = 4;
    for (let index = 0; index < 8; ++index) {
      const angle = index * Math.PI / 4;
      context.beginPath();
      context.moveTo(40 + 23 * Math.cos(angle), 38 + 23 * Math.sin(angle));
      context.lineTo(40 + 30 * Math.cos(angle), 38 + 30 * Math.sin(angle));
      context.stroke();
    }
  }
  function moon() {
    context.fillStyle = sunColor;
    context.beginPath(); context.arc(46, 43, 28, 0, Math.PI * 2); context.fill();
    context.globalCompositeOperation = 'destination-out';
    context.beginPath(); context.arc(60, 32, 27, 0, Math.PI * 2); context.fill();
    context.globalCompositeOperation = 'source-over';
  }
  function cloud() {
    context.fillStyle = cloudColor;
    context.beginPath();
    context.arc(31, 58, 21, 0, Math.PI * 2);
    context.arc(53, 46, 27, 0, Math.PI * 2);
    context.arc(75, 58, 19, 0, Math.PI * 2);
    context.rect(18, 55, 75, 27);
    context.fill();
  }
  function rain() {
    context.strokeStyle = rainColor; context.lineWidth = 4; context.lineCap = 'round';
    for (let x = 30; x <= 78; x += 16) {
      context.beginPath(); context.moveTo(x, 79); context.lineTo(x - 6, 94); context.stroke();
    }
  }
  function snow() {
    context.strokeStyle = '#74a9d8'; context.lineWidth = 3; context.lineCap = 'round';
    for (let x = 34; x <= 78; x += 22) {
      for (let index = 0; index < 3; ++index) {
        const angle = index * Math.PI / 3;
        context.beginPath();
        context.moveTo(x - 7 * Math.cos(angle), 84 - 7 * Math.sin(angle));
        context.lineTo(x + 7 * Math.cos(angle), 84 + 7 * Math.sin(angle));
        context.stroke();
      }
    }
  }
  function fog() {
    context.strokeStyle = '#8492a3'; context.lineWidth = 4; context.lineCap = 'round';
    for (let y = 39; y <= 81; y += 14) {
      context.beginPath(); context.moveTo(12 + (y % 2) * 7, y); context.lineTo(86, y); context.stroke();
    }
  }
  if (kind === 'clear') day ? sun() : moon();
  else if (kind === 'partly') { day ? sun() : moon(); cloud(); }
  else if (kind === 'fog') fog();
  else {
    cloud();
    if (kind === 'snow') snow();
    else if (kind === 'rain' || kind === 'storm') rain();
  }
  if (kind === 'storm') {
    context.fillStyle = '#f5b521';
    context.beginPath();
    context.moveTo(57, 61); context.lineTo(42, 82); context.lineTo(54, 82);
    context.lineTo(46, 97); context.lineTo(74, 68); context.lineTo(61, 68);
    context.closePath(); context.fill();
  }
  context.restore();
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

function formatNumber(value, suffix, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '--';
  return `${Number(value).toFixed(digits)}${suffix || ''}`;
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

function setLoading() {
  const value = labels();
  setStaticLabels();
  document.documentElement.lang = state.language || 'en';
  elements.location.textContent = state.location || 'Weather';
  elements.resolved.textContent = '';
  elements.providerState.textContent = '';
  elements.condition.textContent = value.loading;
  elements.temperature.textContent = '--';
  elements.unit.textContent = tempUnit();
  elements.updated.textContent = '';
  elements.feels.textContent = '--';
  elements.humidity.textContent = '--';
  elements.wind.textContent = '--';
  elements.precip.textContent = '--';
  elements.visibility.textContent = '--';
  elements.alerts.hidden = true;
  elements.minuteSection.hidden = true;
  elements.airSection.hidden = true;
  elements.hourly.replaceChildren();
  elements.forecast.replaceChildren();
  drawWeatherIcon(elements.currentIcon, { code: '999', isDay: 1 }, 'qweather');
}

function setError() {
  setLoading();
  elements.condition.textContent = labels().error;
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

function renderAlerts() {
  const value = labels();
  const data = state.mode === 'qweather' && state.datasets.alerts && state.datasets.alerts.data;
  const alerts = data && Array.isArray(data.items) ? data.items : [];
  elements.alerts.replaceChildren();
  elements.alerts.hidden = alerts.length === 0;
  for (const alert of alerts) {
    const details = document.createElement('details');
    details.className = 'alert';
    details.style.setProperty('--alert-color', alertColor(alert));
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
    details.addEventListener('toggle', notifyHost);
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
  if (minute.available === false) {
    elements.minuteUpdated.textContent = '';
    elements.minuteSummary.textContent = value.unavailable;
    elements.minuteSummary.style.color = 'var(--muted)';
    elements.minuteChart.replaceChildren();
    elements.minuteAxis.replaceChildren();
    return;
  }
  elements.minuteUpdated.textContent = [value.minutePoints, formatTime(minute.updated)].filter(Boolean).join(' | ');
  const points = Array.isArray(minute.points) ? minute.points.slice(0, 24) : [];
  const raining = points.some((point) => Number(point.precip) > 0);
  elements.minuteSummary.textContent = minute.summary || (raining ? value.next2h : value.noRain);
  elements.minuteSummary.style.color = raining ? 'var(--orange)' : 'var(--text)';
  elements.minuteChart.replaceChildren();
  const max = Math.max(0.1, ...points.map((point) => Number(point.precip) || 0));
  for (let index = 0; index < 24; ++index) {
    const point = points[index] || { precip: 0 };
    const bar = document.createElement('span');
    bar.className = 'minute-bar';
    bar.style.height = `${Math.max(2, Math.round((Number(point.precip) || 0) / max * 42))}px`;
    bar.title = `${formatTime(point.time)} ${formatNumber(point.precip, ' mm', 1)}`;
    elements.minuteChart.append(bar);
  }
  elements.minuteAxis.replaceChildren();
  for (const label of ['0', '30', '60', '90', '120 min']) {
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
  elements.hourlyNote.textContent = rows.length ? `${value.rainChance} | ${rows.length}h` : value.unavailable;
  for (let index = 0; index < rows.length; ++index) {
    const row = rows[index];
    const hour = document.createElement('div');
    hour.className = 'hour';
    const time = document.createElement('div');
    time.className = 'hour-time';
    time.textContent = index === 0 && source.provider === 'open-meteo' ? value.now : formatTime(row.time);
    const icon = document.createElement('canvas');
    icon.width = 48; icon.height = 48;
    drawWeatherIcon(icon, row, source.provider);
    const temperature = document.createElement('div');
    temperature.className = 'hour-temp';
    temperature.textContent = formatTemperature(row.temp);
    const probability = document.createElement('div');
    probability.className = 'hour-prob';
    probability.textContent = row.pop === null || row.pop === undefined ? '--' : `${row.pop}%`;
    probability.title = weatherText(row, source.provider);
    hour.append(time, icon, temperature, probability);
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
  const air = state.mode === 'qweather' && state.datasets.air && state.datasets.air.data;
  if (!air) {
    elements.airSection.hidden = state.mode !== 'qweather';
    elements.airNote.textContent = value.unavailable;
    elements.aqiValue.textContent = '--';
    elements.aqiCategory.textContent = '';
    elements.pollutants.replaceChildren();
    elements.airAdvice.textContent = '';
    return;
  }
  elements.airSection.hidden = false;
  elements.airNote.textContent = air.primary ? `${isChinese() ? '\u9996\u8981\u6c61\u67d3\u7269' : 'Primary'}: ${air.primary}` : '';
  elements.aqiValue.textContent = air.aqi === null ? '--' : Math.round(air.aqi);
  elements.aqiValue.style.color = aqiColor(air.aqi);
  elements.aqiCategory.textContent = [air.category, air.level ? `${isChinese() ? '\u7b49\u7ea7' : 'Level'} ${air.level}` : ''].filter(Boolean).join(' | ');
  elements.pollutants.replaceChildren();
  for (const pollutant of (air.pollutants || []).slice(0, 6)) {
    const item = document.createElement('div');
    item.className = 'pollutant';
    const name = document.createElement('span');
    name.className = 'pollutant-name';
    name.textContent = pollutant.name || pollutant.code.toUpperCase();
    const number = document.createElement('span');
    number.className = 'pollutant-value';
    number.textContent = formatNumber(pollutant.value, '', pollutant.code === 'co' ? 1 : 0);
    number.title = pollutant.unit;
    item.append(name, number);
    elements.pollutants.append(item);
  }
  elements.airAdvice.textContent = air.advice || '';
}

function renderDaily() {
  const value = labels();
  const source = dailySource();
  const rows = Array.isArray(source.rows) ? source.rows.slice(0, 5) : [];
  elements.forecast.replaceChildren();
  elements.dailyNote.textContent = rows.length ? '' : value.unavailable;
  const formatter = new Intl.DateTimeFormat(state.language || 'en-US', { weekday: 'short' });
  for (let index = 0; index < rows.length; ++index) {
    const row = rows[index];
    const day = document.createElement('div');
    day.className = 'day';
    const name = document.createElement('div');
    name.className = 'day-name';
    try {
      name.textContent = index === 0 ? value.today : formatter.format(new Date(`${row.date}T12:00:00`));
    } catch (error) {
      name.textContent = row.date;
    }
    const icon = document.createElement('canvas');
    icon.width = 48; icon.height = 48;
    drawWeatherIcon(icon, row, source.provider);
    const text = document.createElement('div');
    text.className = 'day-text';
    text.textContent = weatherText(row, source.provider);
    const temperature = document.createElement('div');
    temperature.className = 'day-temp';
    temperature.textContent = `${formatTemperature(row.tempMax)} / ${formatTemperature(row.tempMin)}`;
    day.append(name, icon, text, temperature);
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
  if (state.mode === 'qweather') {
    const link = document.createElement('a');
    link.href = qweatherAttributionUrl();
    link.textContent = value.powered;
    elements.poweredBy.append(link);
  } else {
    const link = document.createElement('a');
    link.href = 'https://open-meteo.com/';
    link.textContent = 'Open-Meteo';
    elements.poweredBy.append(link);
  }
  const sources = collectSources();
  elements.sourceList.textContent = sources.length ? `${value.sources}: ${sources.join(', ')}` : '';
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
  const resolvedParts = [state.place && state.place.city, state.place && state.place.country]
    .map((part) => textValue(part))
    .filter((part, index, array) => part && array.indexOf(part) === index && part !== elements.location.textContent);
  elements.resolved.textContent = resolvedParts.length ? ` | ${resolvedParts.join(' | ')}` : '';
  renderProviderState();
  elements.temperature.textContent = Math.round(displayTemperatureValue(item.temp));
  elements.unit.textContent = tempUnit();
  elements.condition.textContent = weatherText(item, current.provider);
  const updateTime = item.time || current.fetchedAt;
  elements.updated.textContent = updateTime ? `${value.updated} ${formatTime(updateTime)}` : '';
  elements.feels.textContent = formatTemperature(item.feels);
  elements.humidity.textContent = formatNumber(item.humidity, '%');
  const windSpeed = item.windSpeed === null || item.windSpeed === undefined
    ? null
    : state.unit ? Number(item.windSpeed) / 1.609344 : Number(item.windSpeed);
  const precipitation = item.precip === null || item.precip === undefined
    ? null
    : state.unit ? Number(item.precip) / 25.4 : Number(item.precip);
  const visibility = item.visibility === null || item.visibility === undefined
    ? null
    : state.unit ? Number(item.visibility) / 1.609344 : Number(item.visibility);
  elements.wind.textContent = `${item.windDir ? `${formatWindDirection(item.windDir)} ` : ''}${formatNumber(windSpeed, state.unit ? ' mph' : ' km/h')}`;
  elements.precip.textContent = formatNumber(precipitation, state.unit ? ' in' : ' mm', state.unit ? 2 : 1);
  elements.visibility.textContent = formatNumber(visibility, state.unit ? ' mi' : ' km', 0);
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
  const sourceContext = source.getContext('2d');
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
  const context = canvas.getContext('2d');
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

function contentHeight() {
  const availableHeight = Number(window.screen && window.screen.availHeight) || 900;
  const maximumHeight = Math.max(480, Math.min(820, availableHeight - 80));
  const height = Math.min(elements.weather.scrollHeight, maximumHeight);
  return Math.max(367, Math.ceil(height * 367 / 353));
}

function safeField(value) {
  return textValue(value).replace(/[#"]/g, ' ');
}

window.epWeatherGetData = function(location, language, unit, width, height, apiHost) {
  const cleanLocation = textValue(location);
  const cleanLanguage = textValue(language, 'en-US') || 'en-US';
  const selectedUnit = Number(unit) ? 1 : 0;
  const cleanHost = validQWeatherHost(apiHost) ? textValue(apiHost).toLowerCase() : '';
  const key = `${cleanLocation}\n${cleanLanguage}\n${selectedUnit}\n${cleanHost}`;
  state.iconWidth = width;
  state.iconHeight = height;
  if (state.key !== key) {
    state.key = key;
    state.location = cleanLocation;
    state.language = cleanLanguage;
    state.unit = selectedUnit;
    state.apiHost = cleanHost;
    resetState();
    initializeWeather(state.generation);
    return 'ep_pending';
  }
  refreshDue(false).catch(() => {});
  if (state.status === 'loading' || state.status === 'idle') return 'ep_pending';
  const current = currentSource();
  if (state.status !== 'ready' || !current) return 'ep_error';
  const item = current.item;
  return `${document.documentElement.getAttribute('dir') || 'ltr'}#${contentHeight()}#${Math.round(displayTemperatureValue(item.temp))}#${tempUnit()}#${safeField(weatherText(item, current.provider))}#${safeField(state.place && state.place.name || state.location)}#${imageHex(width, height)}`;
};

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
    validQWeatherHost,
    refreshDue,
    DATASET_TTL,
    renderWeather,
    contentHeight
  });
}

setLoading();
