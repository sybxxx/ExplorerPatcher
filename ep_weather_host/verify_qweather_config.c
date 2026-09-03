#include <stdio.h>
#include "../ExplorerPatcher/weather_qweather_config.h"

static int expect_normalized(LPCWSTR input, LPCWSTR expected)
{
    WCHAR output[EP_QWEATHER_MAX_HOST] = { 0 };
    HRESULT hr = EPQWeather_NormalizeApiHost(input, output, ARRAYSIZE(output));
    if (FAILED(hr) || wcscmp(output, expected))
    {
        wprintf(L"Expected '%s' to normalize to '%s', got '%s' (0x%08x).\n",
            input, expected, output, (unsigned int)hr);
        return 1;
    }
    return 0;
}

static int expect_rejected(LPCWSTR input)
{
    WCHAR output[EP_QWEATHER_MAX_HOST] = { 0 };
    HRESULT hr = EPQWeather_NormalizeApiHost(input, output, ARRAYSIZE(output));
    if (SUCCEEDED(hr))
    {
        wprintf(L"Expected '%s' to be rejected, got '%s'.\n", input, output);
        return 1;
    }
    return 0;
}

static int expect_uri(LPCWSTR uri, LPCWSTR host, BOOL expected)
{
    BOOL actual = EPQWeather_IsRequestUriForHost(uri, host);
    if (actual != expected)
    {
        wprintf(L"URI match mismatch for '%s' and '%s'.\n", uri, host);
        return 1;
    }
    return 0;
}

int wmain(void)
{
    int failures = 0;
    failures += expect_normalized(L"abc123.qweatherapi.com", L"abc123.qweatherapi.com");
    failures += expect_normalized(L"  HTTPS://ABC123.QWEATHERAPI.COM/  ", L"abc123.qweatherapi.com");
    failures += expect_rejected(L"http://abc123.qweatherapi.com");
    failures += expect_rejected(L"qweatherapi.com");
    failures += expect_rejected(L"abc123.qweatherapi.com.evil.example");
    failures += expect_rejected(L"abc123.qweatherapi.com/path");
    failures += expect_rejected(L"abc123.qweatherapi.com:443");
    failures += expect_rejected(L"-abc.qweatherapi.com");
    failures += expect_uri(L"https://abc123.qweatherapi.com/weather/v1/current/1/2", L"abc123.qweatherapi.com", TRUE);
    failures += expect_uri(L"https://ABC123.QWEATHERAPI.COM/geo/v2/city/lookup", L"abc123.qweatherapi.com", TRUE);
    failures += expect_uri(L"http://abc123.qweatherapi.com/weather/v1/current/1/2", L"abc123.qweatherapi.com", FALSE);
    failures += expect_uri(L"https://abc123.qweatherapi.com.evil.example/path", L"abc123.qweatherapi.com", FALSE);
    failures += expect_uri(L"https://abc123.qweatherapi.com@evil.example/path", L"abc123.qweatherapi.com", FALSE);

    if (failures)
    {
        printf("QWeather configuration verification failed: %d case(s).\n", failures);
        return 1;
    }
    printf("QWeather configuration verification passed.\n");
    return 0;
}
