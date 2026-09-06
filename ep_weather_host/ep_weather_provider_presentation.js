// QWeather condition codes are stable across response languages.
const QWEATHER_ZH_CONDITIONS = Object.freeze({
  100: '\u6674', 101: '\u591a\u4e91', 102: '\u5c11\u4e91', 103: '\u6674\u95f4\u591a\u4e91', 104: '\u9634',
  150: '\u6674', 151: '\u591a\u4e91', 152: '\u5c11\u4e91', 153: '\u6674\u95f4\u591a\u4e91',
  300: '\u9635\u96e8', 301: '\u5f3a\u9635\u96e8', 302: '\u96f7\u9635\u96e8', 303: '\u5f3a\u96f7\u9635\u96e8',
  304: '\u96f7\u9635\u96e8\u4f34\u6709\u51b0\u96f9', 305: '\u5c0f\u96e8', 306: '\u4e2d\u96e8', 307: '\u5927\u96e8',
  308: '\u6781\u7aef\u964d\u96e8', 309: '\u6bdb\u6bdb\u96e8', 310: '\u66b4\u96e8', 311: '\u5927\u66b4\u96e8',
  312: '\u7279\u5927\u66b4\u96e8', 313: '\u51bb\u96e8', 314: '\u5c0f\u5230\u4e2d\u96e8', 315: '\u4e2d\u5230\u5927\u96e8',
  316: '\u5927\u5230\u66b4\u96e8', 317: '\u66b4\u96e8\u5230\u5927\u66b4\u96e8', 318: '\u5927\u66b4\u96e8\u5230\u7279\u5927\u66b4\u96e8',
  350: '\u9635\u96e8', 351: '\u5f3a\u9635\u96e8', 399: '\u96e8',
  400: '\u5c0f\u96ea', 401: '\u4e2d\u96ea', 402: '\u5927\u96ea', 403: '\u66b4\u96ea', 404: '\u96e8\u5939\u96ea',
  405: '\u96e8\u96ea\u5929\u6c14', 406: '\u9635\u96e8\u5939\u96ea', 407: '\u9635\u96ea',
  408: '\u5c0f\u5230\u4e2d\u96ea', 409: '\u4e2d\u5230\u5927\u96ea', 410: '\u5927\u5230\u66b4\u96ea',
  456: '\u9635\u96e8\u5939\u96ea', 457: '\u9635\u96ea', 499: '\u96ea',
  500: '\u8584\u96fe', 501: '\u96fe', 502: '\u973e', 503: '\u626c\u6c99', 504: '\u6d6e\u5c18',
  507: '\u6c99\u5c18\u66b4', 508: '\u5f3a\u6c99\u5c18\u66b4', 509: '\u6d53\u96fe', 510: '\u5f3a\u6d53\u96fe',
  511: '\u4e2d\u5ea6\u973e', 512: '\u91cd\u5ea6\u973e', 513: '\u4e25\u91cd\u973e',
  514: '\u5927\u96fe', 515: '\u7279\u5f3a\u6d53\u96fe', 900: '\u70ed', 901: '\u51b7', 999: '\u672a\u77e5\u5929\u6c14'
});

function localizedQWeatherText(item, chinese) {
  const text = textValue(item && item.text);
  if (chinese && !/[\u3400-\u9fff]/.test(text)) {
    return QWEATHER_ZH_CONDITIONS[textValue(item && item.code)] || '\u672a\u77e5\u5929\u6c14';
  }
  return text;
}

function minuteForecastView(minute, hourly, now = Date.now()) {
  const points = (minute && minute.available !== false && Array.isArray(minute.points) ? minute.points : [])
    .filter((point) => Number.isFinite(Date.parse(point.time)) && Date.parse(point.time) + 300000 > now)
    .slice(0, 24);
  const valid = points.filter((point) => point.precip !== null && Number.isFinite(point.precip) && point.precip >= 0);
  const wet = valid.filter((point) => point.precip > 0);
  // Compare only overlapping hourly periods; never infer dry conditions from missing data.
  const conflict = wet.some((point) => (hourly || []).some((hour) => {
    const time = Date.parse(hour.time);
    const minuteTime = Date.parse(point.time);
    return minuteTime >= time && minuteTime < time + 3600000 && hour.pop === 0 && hour.precip === 0;
  }));
  return { points, available: valid.length > 0, raining: wet.length > 0,
    scale: Math.max(0.1, ...valid.map((point) => point.precip)),
    total: valid.reduce((sum, point) => sum + point.precip, 0), conflict };
}

function datasetFailureDetails(errors, chinese) {
  const names = chinese
    ? { current: '\u5b9e\u65f6\u5929\u6c14', minutely: '\u5206\u949f\u964d\u6c34', hourly: '\u9010\u5c0f\u65f6\u9884\u62a5', daily: '\u9010\u65e5\u9884\u62a5', alerts: '\u5b98\u65b9\u9884\u8b66', air: '\u7a7a\u6c14\u8d28\u91cf' }
    : { current: 'Current weather', minutely: 'Minutely precipitation', hourly: 'Hourly forecast', daily: 'Daily forecast', alerts: 'Official alerts', air: 'Air quality' };
  return Object.keys(names).filter((name) => errors[name]).map((name) => {
    const status = String(errors[name]).match(/(?:HTTP|QWeather) (\d{3})/);
    return names[name] + (status ? ' (' + status[0] + ')' : chinese ? ' (\u8bf7\u6c42\u5931\u8d25)' : ' (request failed)');
  }).join('; ');
}
