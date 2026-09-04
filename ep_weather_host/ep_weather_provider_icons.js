/*__EP_QWEATHER_ICON_MAP__*/

let weatherIconFontLoaded = false;

function isDaytime(item, provider) {
  if (item && item.isDay !== null && item.isDay !== undefined) return Number(item.isDay) === 1;
  const code = Number(item && item.code);
  if (provider === 'qweather' && code >= 150 && code < 200) return false;
  return true;
}

function openMeteoIconCode(item) {
  const value = Number(item && item.code);
  const day = isDaytime(item, 'open-meteo');
  if (value === 0) return day ? '100' : '150';
  if (value === 1 || value === 2) return day ? '101' : '151';
  if (value === 3) return '104';
  if (value === 45) return '501';
  if (value === 48) return '502';
  if (value === 51 || value === 53) return '309';
  if (value === 55 || value === 63) return '306';
  if (value === 56 || value === 57 || value === 66 || value === 67) return '404';
  if (value === 61) return '305';
  if (value === 65) return '307';
  if (value === 71) return '400';
  if (value === 73) return '401';
  if (value === 75) return '402';
  if (value === 77) return '499';
  if (value === 80) return day ? '300' : '350';
  if (value === 81 || value === 82) return day ? '301' : '351';
  if (value === 85) return '407';
  if (value === 86) return '408';
  if (value === 95) return '302';
  if (value === 96 || value === 99) return '304';
  return '999';
}

function weatherIconCode(item, provider) {
  const code = textValue(item && item.code, '999');
  if (provider === 'qweather' && Number.isInteger(QWEATHER_ICON_GLYPHS[code])) return code;
  return provider === 'open-meteo' ? openMeteoIconCode(item) : '999';
}

function weatherIconGlyph(item, provider, filled = false) {
  const code = weatherIconCode(item, provider);
  const key = filled && Number.isInteger(QWEATHER_ICON_GLYPHS[`${code}-fill`]) ? `${code}-fill` : code;
  const codePoint = QWEATHER_ICON_GLYPHS[key] || QWEATHER_ICON_GLYPHS['999'];
  return String.fromCodePoint(codePoint);
}

function setWeatherGlyph(element, item, provider) {
  element.textContent = weatherIconGlyph(item, provider);
  element.dataset.iconCode = weatherIconCode(item, provider);
}

function drawWeatherIcon(canvas, item, provider) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const glyph = weatherIconGlyph(item, provider, true);
  const size = Math.round(Math.min(canvas.width, canvas.height) * 0.88);
  const dark = weatherThemeIsDark();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.font = `${size}px "QWeather Icons"`;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = dark ? '#7dd3fc' : '#087db9';
  const metrics = context.measureText(glyph);
  const ascent = metrics.actualBoundingBoxAscent || size * 0.78;
  const descent = metrics.actualBoundingBoxDescent || size * 0.22;
  context.fillText(glyph, canvas.width / 2, (canvas.height - ascent - descent) / 2 + ascent);
  context.restore();
}

function initializeWeatherIconFont() {
  if (!document.fonts || typeof document.fonts.load !== 'function') return;
  document.fonts.load('96px "QWeather Icons"').then((faces) => {
    weatherIconFontLoaded = faces.length > 0 && document.fonts.check('16px "QWeather Icons"');
    if (weatherIconFontLoaded && typeof scheduleRenderAndCapture === 'function') scheduleRenderAndCapture(true);
  }).catch(() => {});
  if (window.matchMedia) {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const redraw = () => {
      if (typeof scheduleRenderAndCapture === 'function') scheduleRenderAndCapture(true);
    };
    if (typeof colorScheme.addEventListener === 'function') colorScheme.addEventListener('change', redraw);
    else if (typeof colorScheme.addListener === 'function') colorScheme.addListener(redraw);
  }
}
