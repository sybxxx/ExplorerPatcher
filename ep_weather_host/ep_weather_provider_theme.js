const WEATHER_THEME_SYSTEM = 'system';
const WEATHER_THEME_LIGHT = 'light';
const WEATHER_THEME_DARK = 'dark';

function normalizeWeatherThemeMode(value) {
  return value === WEATHER_THEME_LIGHT || value === WEATHER_THEME_DARK
    ? value
    : WEATHER_THEME_SYSTEM;
}

function nextWeatherThemeMode(value) {
  switch (normalizeWeatherThemeMode(value)) {
    case WEATHER_THEME_SYSTEM:
      return WEATHER_THEME_LIGHT;
    case WEATHER_THEME_LIGHT:
      return WEATHER_THEME_DARK;
    default:
      return WEATHER_THEME_SYSTEM;
  }
}

function weatherSystemPrefersDark() {
  try {
    return Boolean(window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (error) {
    return false;
  }
}

function weatherThemeIsDark() {
  const mode = normalizeWeatherThemeMode(document.documentElement.getAttribute('data-theme'));
  return mode === WEATHER_THEME_DARK ||
    (mode === WEATHER_THEME_SYSTEM && weatherSystemPrefersDark());
}
