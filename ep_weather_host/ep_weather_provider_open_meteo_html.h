#ifndef _H_EP_WEATHER_PROVIDER_OPEN_METEO_HTML_H_
#define _H_EP_WEATHER_PROVIDER_OPEN_METEO_HTML_H_
#include <Windows.h>

#define EP_WEATHER_PROVIDER_OPEN_METEO_HTML_LEN 30000

LPCWSTR ep_weather_provider_open_meteo_html = L"\
<!DOCTYPE html>\n\
<html lang=\"en\">\n\
<head>\n\
<meta charset=\"utf-8\">\n\
<meta name=\"color-scheme\" content=\"light dark\">\n\
<title>Weather</title>\n\
<style>\n\
:root { font-family: \"Segoe UI\", sans-serif; color-scheme: light dark; }\n\
* { box-sizing: border-box; }\n\
html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }\n\
body { color: #202124; }\n\
@media (prefers-color-scheme: dark) {\n\
  body { color: #f1f3f4; }\n\
  .muted { color: #b8bdc7; }\n\
  .rule { border-color: rgba(255,255,255,.16); }\n\
}\n\
#weather { width: 100%; min-height: 353px; padding: 20px 24px 12px; }\n\
.location { display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\
.location .pin { color: #5f6368; font-size: 17px; }\n\
.muted { color: #5f6368; font-weight: 400; }\n\
.current { padding-bottom: 12px; }\n\
.current-row { display: grid; grid-template-columns: 96px 1fr auto; align-items: center; column-gap: 16px; margin-top: 18px; }\n\
#current-icon { width: 96px; height: 96px; }\n\
.temperature { font-size: 58px; line-height: 1; font-weight: 600; white-space: nowrap; }\n\
.temperature small { font-size: 26px; vertical-align: top; margin-left: 4px; }\n\
.condition { font-size: 20px; font-weight: 500; text-align: right; max-width: 180px; }\n\
.details { margin-top: 12px; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\
.rule { border-top: 1px solid rgba(0,0,0,.12); margin: 2px 0 12px; }\n\
.forecast-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }\n\
.forecast { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }\n\
.day { min-width: 0; text-align: center; padding: 4px 2px; }\n\
.day-name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\
.day canvas { display: block; width: 42px; height: 42px; margin: 3px auto; }\n\
.day-temp { font-size: 13px; white-space: nowrap; }\n\
footer { margin-top: 10px; font-size: 10px; color: #73777e; text-align: right; }\n\
footer a { color: inherit; }\n\
</style>\n\
</head>\n\
<body>\n\
<main id=\"weather\" aria-live=\"polite\">\n\
<section class=\"current\">\n\
<div class=\"location\"><span class=\"pin\">&#9679;</span><span id=\"location\">Weather</span><span class=\"muted\" id=\"resolved\"></span></div>\n\
<div class=\"current-row\"><canvas id=\"current-icon\" width=\"96\" height=\"96\"></canvas><div class=\"temperature\"><span id=\"temperature\">--</span><small id=\"unit\">&#176;C</small></div><div class=\"condition\" id=\"condition\">Loading...</div></div>\n\
<div class=\"details muted\"><span id=\"feels\"></span><span> &#183; </span><span id=\"humidity\"></span><span> &#183; </span><span id=\"wind\"></span><span class=\"muted\" id=\"updated\"></span></div>\n\
</section>\n\
<div class=\"rule\"></div><div class=\"forecast-title\" id=\"forecast-title\">Forecast</div><section class=\"forecast\" id=\"forecast\"></section>\n\
<footer><a href=\"https://open-meteo.com/\" target=\"_blank\">Open-Meteo</a> &#183; <a href=\"https://photon.komoot.io/\" target=\"_blank\">Photon</a> &#183; <a href=\"https://www.esri.com/\" target=\"_blank\">Esri</a></footer>\n\
</main>\n\
<script>\n\
(function() {\n\
'use strict';\n\
const state={key:'',status:'idle',location:'',language:'en-US',unit:0,data:null,place:null,error:null,requestId:0};\n\
const currentIcon=document.getElementById('current-icon');\n"
L"function isChinese(){return /^zh/i.test(state.language||'');}\n\
function labels(){return isChinese()?{loading:'\\u52a0\\u8f7d\\u4e2d...',forecast:'\\u9884\\u62a5',feels:'\\u4f53\\u611f',humidity:'\\u6e7f\\u5ea6',wind:'\\u98ce\\u901f',updated:'\\u66f4\\u65b0',error:'\\u65e0\\u6cd5\\u83b7\\u53d6\\u5929\\u6c14'}:{loading:'Loading...',forecast:'Forecast',feels:'Feels like',humidity:'Humidity',wind:'Wind',updated:'Updated',error:'Unable to load weather'};}\n\
function condition(code){\n\
  const zh=isChinese();\n\
  const map=zh?{0:'\\u6674\\u5929',1:'\\u57fa\\u672c\\u6674\\u6717',2:'\\u5c11\\u4e91',3:'\\u9634\\u5929',45:'\\u96fe',48:'\\u51bb\\u7ed3\\u96fe',51:'\\u6bdb\\u6bdb\\u96e8',53:'\\u6bdb\\u6bdb\\u96e8',55:'\\u6bdb\\u6bdb\\u96e8',56:'\\u51bb\\u96e8',57:'\\u51bb\\u96e8',61:'\\u5c0f\\u96e8',63:'\\u4e2d\\u96e8',65:'\\u5927\\u96e8',66:'\\u51bb\\u96e8',67:'\\u51bb\\u96e8',71:'\\u5c0f\\u96ea',73:'\\u4e2d\\u96ea',75:'\\u5927\\u96ea',77:'\\u96ea\\u7c92',80:'\\u9635\\u96e8',81:'\\u9635\\u96e8',82:'\\u5f3a\\u9635\\u96e8',85:'\\u9635\\u96ea',86:'\\u5f3a\\u9635\\u96ea',95:'\\u96f7\\u96e8',96:'\\u96f7\\u96e8\\u4f34\\u51b0\\u96f9',99:'\\u96f7\\u96e8\\u4f34\\u51b0\\u96f9'}:{0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Freezing fog',51:'Drizzle',53:'Drizzle',55:'Drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Rain showers',82:'Heavy rain showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Thunderstorm with hail'};\n\
  return map[code] || (zh?'\\u672a\\u77e5\\u5929\\u6c14':'Unknown weather');\n\
}\n\
function drawWeatherIcon(canvas,code,isDay){\n\
  const ctx=canvas.getContext('2d'); const s=canvas.width/96; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.save(); ctx.scale(s,s);\n\
  const sunColor=isDay?'#f4b400':'#9aa9d1'; const cloudColor=isDay?'#718096':'#8c98aa'; const rainColor='#4f8fcf';\n\
  const rainy=(code>=51&&code<=67)||code===80||code===81||code===82||code>=95;\n\
  const snowy=(code>=71&&code<=77)||code===85||code===86;\n\
  const storm=code>=95;\n\
  function sun(){ctx.fillStyle=sunColor;ctx.beginPath();ctx.arc(32,30,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle=sunColor;ctx.lineWidth=4;for(let a=0;a<8;a++){const r=a*Math.PI/4;ctx.beginPath();ctx.moveTo(32+21*Math.cos(r),30+21*Math.sin(r));ctx.lineTo(32+28*Math.cos(r),30+28*Math.sin(r));ctx.stroke();}}\n\
  function moon(){ctx.fillStyle=sunColor;ctx.beginPath();ctx.arc(34,30,17,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(0,0,0,.08)';ctx.beginPath();ctx.arc(42,24,17,0,Math.PI*2);ctx.fill();}\n\
  function cloud(){ctx.fillStyle=cloudColor;ctx.beginPath();ctx.arc(38,55,17,0,Math.PI*2);ctx.arc(56,50,22,0,Math.PI*2);ctx.arc(76,58,15,0,Math.PI*2);ctx.rect(28,55,62,22);ctx.fill();}\n\
  function rain(){ctx.strokeStyle=rainColor;ctx.lineWidth=4;ctx.lineCap='round';for(let x=38;x<=78;x+=15){ctx.beginPath();ctx.moveTo(x,78);ctx.lineTo(x-5,91);ctx.stroke();}}\n\
  function snow(){ctx.strokeStyle='#73a8d8';ctx.lineWidth=3;ctx.lineCap='round';for(let x=40;x<=76;x+=18){for(let a=0;a<3;a++){const r=a*Math.PI/3;ctx.beginPath();ctx.moveTo(x-6*Math.cos(r),82-6*Math.sin(r));ctx.lineTo(x+6*Math.cos(r),82+6*Math.sin(r));ctx.stroke();}}}\n\
  function fog(){ctx.strokeStyle='#8492a3';ctx.lineWidth=4;ctx.lineCap='round';for(let y=45;y<=75;y+=15){ctx.beginPath();ctx.moveTo(20+(y%2)*8,y);ctx.lineTo(82,y);ctx.stroke();}}\n\
  if(code===0||code===1){if(isDay)sun();else moon();}\n\
  else if(code===2){if(isDay)sun();else moon();cloud();}\n\
  else if(code===45||code===48){fog();}\n\
  else {cloud();if(snowy)snow();else if(rainy)rain();}\n\
  if(storm){ctx.fillStyle='#f4b400';ctx.beginPath();ctx.moveTo(56,67);ctx.lineTo(45,84);ctx.lineTo(55,84);ctx.lineTo(49,96);ctx.lineTo(70,74);ctx.lineTo(59,74);ctx.closePath();ctx.fill();}\n\
  ctx.restore();\n\
}\n\
function setLoading(){const l=labels();document.getElementById('condition').textContent=l.loading;document.getElementById('forecast-title').textContent=l.forecast;document.getElementById('resolved').textContent='';document.getElementById('forecast').replaceChildren();}\n\
function setError(){const l=labels();document.getElementById('condition').textContent=l.error;document.getElementById('forecast-title').textContent='';document.getElementById('forecast').replaceChildren();document.getElementById('feels').textContent='';document.getElementById('humidity').textContent='';document.getElementById('wind').textContent='';document.getElementById('updated').textContent='';}\n"
L"async function getJson(url){\n\
  let lastError=null;\n\
  for(let attempt=0;attempt<2;attempt++){\n\
    const controller=new AbortController();\n\
    const timer=setTimeout(()=>controller.abort(),4000);\n\
    try{\n\
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});\n\
      if(!response.ok){\n\
        const retryable=response.status===408||response.status===429||response.status>=500;\n\
        const error=new Error('HTTP '+response.status);\n\
        error.retryable=retryable;\n\
        throw error;\n\
      }\n\
      return await response.json();\n\
    }catch(error){\n\
      lastError=error;\n\
      if(error&&error.retryable===false)throw error;\n\
    }finally{clearTimeout(timer);}\n\
    if(attempt<1)await new Promise(resolve=>setTimeout(resolve,500));\n\
  }\n\
  throw lastError||new Error('Network request failed');\n\
}\n\
function formatTime(value){try{return new Intl.DateTimeFormat(state.language,{hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch(e){return '';}}\n\
async function resolveLocation(query){\n\
  let lastError=null;\n\
  try{\n\
    const geo=await getJson('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine='+query+'&f=json&maxLocations=1&outFields=*');\n\
    const candidate=geo&&geo.candidates&&geo.candidates[0];\n\
    const attributes=candidate&&candidate.attributes||{};\n\
    if(candidate&&candidate.location&&Number.isFinite(Number(candidate.location.x))&&Number.isFinite(Number(candidate.location.y)))return {geometry:{coordinates:[Number(candidate.location.x),Number(candidate.location.y)]},properties:{name:attributes.ShortLabel||attributes.PlaceName||'',city:attributes.City||attributes.Subregion||''}};\n\
  }catch(error){lastError=error;}\n\
  try{\n\
    const geo=await getJson('https://photon.komoot.io/api/?q='+query+'&limit=1');\n\
    const feature=geo&&geo.features&&geo.features[0];\n\
    if(feature&&feature.geometry&&feature.geometry.coordinates&&feature.geometry.coordinates.length>=2)return feature;\n\
  }catch(error){lastError=error;}\n\
  throw lastError||new Error('Location not found');\n\
}\n\
async function loadWeather(requestId){\n\
  state.status='loading'; state.error=null; setLoading();\n\
  try {\n\
    const query=encodeURIComponent(state.location.trim());\n\
    const feature=await resolveLocation(query);\n\
    if(state.requestId!==requestId)return;\n\
    const lon=Number(feature.geometry.coordinates[0]); const lat=Number(feature.geometry.coordinates[1]);\n\
    if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Invalid coordinates');\n\
    const unit=state.unit?'&temperature_unit=fahrenheit':'';\n\
    const url='https://api.open-meteo.com/v1/forecast?latitude='+lat.toFixed(5)+'&longitude='+lon.toFixed(5)+'&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5&wind_speed_unit=kmh'+unit;\n\
    const weather=await getJson(url);\n\
    if(state.requestId!==requestId)return;\n\
    if(!weather.current||!weather.daily)throw new Error('Weather data unavailable');\n\
    state.place=feature.properties||{}; state.data=weather; state.status='ready'; renderWeather();\n\
  } catch(error) { if(state.requestId!==requestId)return; state.error=String(error&&error.message||error); state.status='error'; setError(); }\n\
}\n"
L"function renderWeather(){\n\
  const l=labels(); const data=state.data; const current=data.current; const units=data.current_units||{}; const daily=data.daily; const tempUnit=units.temperature_2m||(String.fromCharCode(176)+(state.unit?'F':'C'));\n\
  document.documentElement.lang=state.language||'en'; document.getElementById('location').textContent=state.location; document.getElementById('unit').textContent=tempUnit; document.getElementById('temperature').textContent=Math.round(current.temperature_2m); document.getElementById('condition').textContent=condition(current.weather_code); drawWeatherIcon(currentIcon,current.weather_code,current.is_day===1);\n\
  const placeName=state.place&&state.place.name||''; const cityName=state.place&&state.place.city||''; const separator=' '+String.fromCharCode(183)+' '; document.getElementById('resolved').textContent=placeName&&cityName&&placeName!==cityName?separator+cityName:'';\n\
  document.getElementById('feels').textContent=l.feels+' '+Math.round(current.apparent_temperature)+tempUnit; document.getElementById('humidity').textContent=l.humidity+' '+Math.round(current.relative_humidity_2m)+'%'; document.getElementById('wind').textContent=l.wind+' '+Math.round(current.wind_speed_10m)+' km/h'; document.getElementById('updated').textContent=separator+l.updated+' '+formatTime(current.time);\n\
  document.getElementById('forecast-title').textContent=l.forecast; const forecast=document.getElementById('forecast'); forecast.replaceChildren(); const dateFormat=new Intl.DateTimeFormat(state.language||'en-US',{weekday:'short'});\n\
  for(let i=0;i<Math.min(5,daily.time.length);i++){const day=document.createElement('div');day.className='day';const name=document.createElement('div');name.className='day-name';name.textContent=i===0?(isChinese()?'\\u4eca\\u5929':'Today'):dateFormat.format(new Date(daily.time[i]+'T12:00:00'));const icon=document.createElement('canvas');icon.width=48;icon.height=48;drawWeatherIcon(icon,daily.weather_code[i],true);const value=document.createElement('div');value.className='day-temp';value.textContent=Math.round(daily.temperature_2m_max[i])+tempUnit+' / '+Math.round(daily.temperature_2m_min[i])+tempUnit;day.append(name,icon,value);forecast.append(day);}\n\
}\n\
function imageHex(width,height){const w=Math.max(1,Math.min(64,Number(width)||32));const h=Math.max(1,Math.min(64,Number(height)||w));const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(currentIcon,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h).data;const chars='0123456789abcdef';let result='';for(let i=0;i<pixels.length;i+=4){const alpha=pixels[i+3];const values=[Math.round(pixels[i+2]*alpha/255),Math.round(pixels[i+1]*alpha/255),Math.round(pixels[i]*alpha/255),alpha];for(const value of values){result+=chars[(value>>4)&15]+chars[value&15];}}return result;}\n\
window.epWeatherGetData=function(location,language,unit,width,height){\n\
  const clean=String(location||'').trim(); const lang=String(language||'en-US'); const selectedUnit=Number(unit)?1:0; const key=clean+'\\n'+lang+'\\n'+selectedUnit;\n\
  if(state.key!==key){state.key=key;state.location=clean;state.language=lang;state.unit=selectedUnit;state.data=null;state.place=null;state.status='idle';state.requestId++;loadWeather(state.requestId);return 'ep_pending';}\n\
  if(state.status==='loading'||state.status==='idle')return 'ep_pending';\n\
  if(state.status!=='ready'||!state.data)return 'ep_error';\n\
  const current=state.data.current; const text=condition(current.weather_code).replace(/[#\"]/g,' '); const safeLocation=state.location.replace(/[#\"]/g,' '); const tempUnit=String.fromCharCode(176)+(state.unit?'F':'C'); return (document.documentElement.getAttribute('dir')||'ltr')+'#367#'+Math.round(current.temperature_2m)+'#'+tempUnit+'#'+text+'#'+safeLocation+'#'+imageHex(width,height);\n\
};\n\
setLoading();\n\
})();\n\
</script>\n\
</body>\n\
</html>";
#endif
