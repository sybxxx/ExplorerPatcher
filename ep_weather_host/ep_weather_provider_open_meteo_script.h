#ifndef _H_EP_WEATHER_PROVIDER_OPEN_METEO_SCRIPT_H_
#define _H_EP_WEATHER_PROVIDER_OPEN_METEO_SCRIPT_H_
#include <Windows.h>

#define EP_WEATHER_PROVIDER_OPEN_METEO_SCRIPT_LEN (MAX_PATH * 36)

LPCWSTR ep_weather_provider_open_meteo_script = L"\
window.epWeatherGetData ? window.epWeatherGetData(decodeURIComponent('%s'), decodeURIComponent('%s'), %d, %d, %d, decodeURIComponent('%s'), %d) : 'ep_pending';";
#endif
