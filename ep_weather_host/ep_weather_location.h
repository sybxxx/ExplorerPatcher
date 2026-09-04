#ifndef _H_EP_WEATHER_LOCATION_H_
#define _H_EP_WEATHER_LOCATION_H_

#include <Windows.h>

#define EP_WEATHER_WM_AUTO_LOCATION_RESULT (WM_USER + 19)
#define EP_WEATHER_AUTO_LOCATION_REQUEST_ID_MAX 64
#define EP_WEATHER_AUTO_LOCATION_TEXT_MAX 128
#define EP_WEATHER_LOCATION_MODE_WINDOWS 0
#define EP_WEATHER_LOCATION_MODE_LEGACY_PRECISE 1
#define EP_WEATHER_LOCATION_MODE_DIRECT_IP 2
#define EP_WEATHER_LOCATION_MODE_MANUAL 3
#define EP_WEATHER_LOCATION_MAX_ACCURACY_METERS 50000.0
#define EP_WEATHER_LOCATION_SOURCE_CELLULAR 0
#define EP_WEATHER_LOCATION_SOURCE_SATELLITE 1
#define EP_WEATHER_LOCATION_SOURCE_WIFI 2
#define EP_WEATHER_LOCATION_SOURCE_IP 3

typedef struct _EPWeatherLocationResult
{
    BOOL success;
    HRESULT status;
    LONG64 browserGeneration;
    WCHAR requestId[EP_WEATHER_AUTO_LOCATION_REQUEST_ID_MAX];
    double latitude;
    double longitude;
    double accuracyMeters;
    LONG positionSource;
    WCHAR city[EP_WEATHER_AUTO_LOCATION_TEXT_MAX];
    WCHAR region[EP_WEATHER_AUTO_LOCATION_TEXT_MAX];
    WCHAR country[EP_WEATHER_AUTO_LOCATION_TEXT_MAX];
} EPWeatherLocationResult;

#ifdef __cplusplus
extern "C" {
#endif

HRESULT EPWeather_BeginWindowsLocation(
    HWND notifyWindow,
    LONG64 browserGeneration,
    LPCWSTR requestId
);

HRESULT EPWeather_BeginDirectIpLocation(
    HWND notifyWindow,
    LONG64 browserGeneration,
    LPCWSTR requestId
);

#ifdef __cplusplus
}
#endif

#endif
