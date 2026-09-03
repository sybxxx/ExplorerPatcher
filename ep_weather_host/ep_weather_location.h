#ifndef _H_EP_WEATHER_LOCATION_H_
#define _H_EP_WEATHER_LOCATION_H_

#include <Windows.h>

#define EP_WEATHER_WM_AUTO_LOCATION_RESULT (WM_USER + 19)
#define EP_WEATHER_AUTO_LOCATION_REQUEST_ID_MAX 64
#define EP_WEATHER_AUTO_LOCATION_TEXT_MAX 128

typedef struct _EPWeatherDirectLocationResult
{
    BOOL success;
    HRESULT status;
    LONG64 browserGeneration;
    WCHAR requestId[EP_WEATHER_AUTO_LOCATION_REQUEST_ID_MAX];
    double latitude;
    double longitude;
    WCHAR city[EP_WEATHER_AUTO_LOCATION_TEXT_MAX];
    WCHAR region[EP_WEATHER_AUTO_LOCATION_TEXT_MAX];
    WCHAR country[EP_WEATHER_AUTO_LOCATION_TEXT_MAX];
} EPWeatherDirectLocationResult;

#ifdef __cplusplus
extern "C" {
#endif

HRESULT EPWeather_BeginDirectIpLocation(
    HWND notifyWindow,
    LONG64 browserGeneration,
    LPCWSTR requestId
);

#ifdef __cplusplus
}
#endif

#endif
