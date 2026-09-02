const fs = require('fs');
const path = require('path');
const vm = require('vm');

const headerPath = path.join(__dirname, 'ep_weather_provider_open_meteo_html.h');
const source = fs.readFileSync(headerPath, 'utf8')
  .replace(/\r?\n/g, '\n')
  .replace(/\\\n/g, '');
const start = source.indexOf('LPCWSTR ep_weather_provider_open_meteo_html');
const end = source.indexOf('#endif', start);
if (start < 0 || end < 0) {
  throw new Error('Weather HTML declaration was not found.');
}

const region = source.slice(start, end);
const bodies = [...region.matchAll(/L"((?:\\.|[^"\\])*)"/g)].map((match) => match[1]);
if (bodies.length === 0) {
  throw new Error('No C string literals were found.');
}

const html = bodies.map((body) => JSON.parse(`"${body}"`)).join('');
const scriptStart = html.indexOf('<script>') + '<script>'.length;
const scriptEnd = html.indexOf('</script>', scriptStart);
if (scriptStart < '<script>'.length || scriptEnd < 0) {
  throw new Error('Weather HTML does not contain a complete script element.');
}

new vm.Script(html.slice(scriptStart, scriptEnd));

for (const text of [
  'api.open-meteo.com',
  'geocode.arcgis.com',
  'photon.komoot.io/api',
  'ep_pending',
  'ep_error',
  'state.requestId'
]) {
  if (!html.includes(text)) {
    throw new Error(`Missing required provider behavior: ${text}`);
  }
}
if (html.includes('www.google.com/search')) {
  throw new Error('The deprecated Google weather search is still embedded.');
}

console.log(JSON.stringify({
  htmlLength: html.length,
  scriptLength: scriptEnd - scriptStart,
  stringLiteralCount: bodies.length,
  status: 'ok'
}));
