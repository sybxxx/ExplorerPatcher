#ifndef EP_WEATHER_QWEATHER_CONFIG_H
#define EP_WEATHER_QWEATHER_CONFIG_H

#include <Windows.h>

#define EP_QWEATHER_API_HOST_VALUE L"WeatherQWeatherApiHost"
#define EP_QWEATHER_API_KEY_VALUE L"WeatherQWeatherApiKeyProtected"
#define EP_QWEATHER_MAX_HOST 256
#define EP_QWEATHER_MAX_API_KEY 512

HRESULT EPQWeather_NormalizeApiHost(
    LPCWSTR input,
    LPWSTR normalizedHost,
    DWORD normalizedHostCount
);
HRESULT EPQWeather_ReadApiHost(LPWSTR apiHost, DWORD apiHostCount);
HRESULT EPQWeather_StoreApiHost(LPCWSTR apiHost);
HRESULT EPQWeather_ReadApiKey(LPWSTR apiKey, DWORD apiKeyCount);
HRESULT EPQWeather_StoreApiKey(LPCWSTR apiKey);
HRESULT EPQWeather_ClearConfig(void);
BOOL EPQWeather_IsConfigured(LPWSTR apiHost, DWORD apiHostCount);
BOOL EPQWeather_IsRequestUriForHost(LPCWSTR uri, LPCWSTR apiHost);

#endif
