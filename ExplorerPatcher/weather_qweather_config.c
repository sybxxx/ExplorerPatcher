#include "weather_qweather_config.h"

#include <Wincrypt.h>
#include <wctype.h>

#pragma comment(lib, "Crypt32.lib")

#define EP_QWEATHER_REGISTRY_PATH L"Software\\ExplorerPatcher"

static const BYTE ep_qweather_entropy[] = {
    0x45, 0x78, 0x70, 0x6c, 0x6f, 0x72, 0x65, 0x72,
    0x50, 0x61, 0x74, 0x63, 0x68, 0x65, 0x72, 0x2d,
    0x51, 0x57, 0x65, 0x61, 0x74, 0x68, 0x65, 0x72
};

static BOOL EPQWeather_HostHasAllowedSuffix(LPCWSTR host)
{
    static const WCHAR suffix[] = L".qweatherapi.com";
    size_t hostLength = wcslen(host);
    size_t suffixLength = ARRAYSIZE(suffix) - 1;
    return hostLength > suffixLength &&
        !_wcsicmp(host + hostLength - suffixLength, suffix);
}

static BOOL EPQWeather_HostLabelsAreValid(LPCWSTR host)
{
    size_t labelLength = 0;
    WCHAR previous = 0;
    for (LPCWSTR cursor = host; *cursor; ++cursor)
    {
        WCHAR ch = *cursor;
        if (ch == L'.')
        {
            if (!labelLength || labelLength > 63 || previous == L'-')
            {
                return FALSE;
            }
            labelLength = 0;
        }
        else
        {
            if (!(ch >= L'a' && ch <= L'z') &&
                !(ch >= L'0' && ch <= L'9') &&
                ch != L'-')
            {
                return FALSE;
            }
            if (!labelLength && ch == L'-')
            {
                return FALSE;
            }
            ++labelLength;
        }
        previous = ch;
    }
    return labelLength > 0 && labelLength <= 63 && previous != L'-';
}

HRESULT EPQWeather_NormalizeApiHost(
    LPCWSTR input,
    LPWSTR normalizedHost,
    DWORD normalizedHostCount
)
{
    if (!input || !normalizedHost || normalizedHostCount < 2)
    {
        return E_INVALIDARG;
    }

    normalizedHost[0] = 0;
    while (iswspace(*input))
    {
        ++input;
    }

    if (!_wcsnicmp(input, L"https://", 8))
    {
        input += 8;
    }
    else if (!_wcsnicmp(input, L"http://", 7))
    {
        return HRESULT_FROM_WIN32(ERROR_INVALID_NAME);
    }

    size_t length = wcslen(input);
    while (length && iswspace(input[length - 1]))
    {
        --length;
    }
    if (length && input[length - 1] == L'/')
    {
        --length;
    }
    while (length && iswspace(input[length - 1]))
    {
        --length;
    }

    if (!length || length >= normalizedHostCount || length > 253)
    {
        return HRESULT_FROM_WIN32(ERROR_INVALID_NAME);
    }

    for (size_t index = 0; index < length; ++index)
    {
        WCHAR ch = input[index];
        if (ch == L'/' || ch == L'\\' || ch == L':' || ch == L'@' ||
            ch == L'?' || ch == L'#' || iswspace(ch))
        {
            normalizedHost[0] = 0;
            return HRESULT_FROM_WIN32(ERROR_INVALID_NAME);
        }
        normalizedHost[index] = towlower(ch);
    }
    normalizedHost[length] = 0;

    if (!EPQWeather_HostLabelsAreValid(normalizedHost) ||
        !EPQWeather_HostHasAllowedSuffix(normalizedHost))
    {
        normalizedHost[0] = 0;
        return HRESULT_FROM_WIN32(ERROR_INVALID_NAME);
    }
    return S_OK;
}

HRESULT EPQWeather_ReadApiHost(LPWSTR apiHost, DWORD apiHostCount)
{
    if (!apiHost || apiHostCount < 2)
    {
        return E_INVALIDARG;
    }

    WCHAR storedHost[EP_QWEATHER_MAX_HOST];
    DWORD type = 0;
    DWORD size = sizeof(storedHost);
    LSTATUS status = RegGetValueW(
        HKEY_CURRENT_USER,
        EP_QWEATHER_REGISTRY_PATH,
        EP_QWEATHER_API_HOST_VALUE,
        RRF_RT_REG_SZ,
        &type,
        storedHost,
        &size
    );
    if (status != ERROR_SUCCESS)
    {
        apiHost[0] = 0;
        return status == ERROR_FILE_NOT_FOUND ? S_FALSE : HRESULT_FROM_WIN32(status);
    }
    storedHost[ARRAYSIZE(storedHost) - 1] = 0;
    return EPQWeather_NormalizeApiHost(storedHost, apiHost, apiHostCount);
}

HRESULT EPQWeather_StoreApiHost(LPCWSTR apiHost)
{
    WCHAR normalizedHost[EP_QWEATHER_MAX_HOST];
    HRESULT hr = EPQWeather_NormalizeApiHost(
        apiHost,
        normalizedHost,
        ARRAYSIZE(normalizedHost)
    );
    if (FAILED(hr))
    {
        return hr;
    }

    HKEY key = NULL;
    LSTATUS status = RegCreateKeyExW(
        HKEY_CURRENT_USER,
        EP_QWEATHER_REGISTRY_PATH,
        0,
        NULL,
        REG_OPTION_NON_VOLATILE,
        KEY_SET_VALUE | KEY_WOW64_64KEY,
        NULL,
        &key,
        NULL
    );
    if (status == ERROR_SUCCESS)
    {
        status = RegSetValueExW(
            key,
            EP_QWEATHER_API_HOST_VALUE,
            0,
            REG_SZ,
            (const BYTE*)normalizedHost,
            (DWORD)((wcslen(normalizedHost) + 1) * sizeof(WCHAR))
        );
        RegCloseKey(key);
    }
    SecureZeroMemory(normalizedHost, sizeof(normalizedHost));
    return status == ERROR_SUCCESS ? S_OK : HRESULT_FROM_WIN32(status);
}

HRESULT EPQWeather_StoreApiKey(LPCWSTR apiKey)
{
    if (!apiKey)
    {
        return E_INVALIDARG;
    }
    size_t keyLength = wcslen(apiKey);
    if (!keyLength || keyLength >= EP_QWEATHER_MAX_API_KEY)
    {
        return HRESULT_FROM_WIN32(ERROR_INVALID_DATA);
    }

    DATA_BLOB input = {
        .cbData = (DWORD)((keyLength + 1) * sizeof(WCHAR)),
        .pbData = (BYTE*)apiKey
    };
    DATA_BLOB entropy = {
        .cbData = sizeof(ep_qweather_entropy),
        .pbData = (BYTE*)ep_qweather_entropy
    };
    DATA_BLOB protectedData = { 0 };
    if (!CryptProtectData(
            &input,
            L"ExplorerPatcher QWeather API key",
            &entropy,
            NULL,
            NULL,
            CRYPTPROTECT_UI_FORBIDDEN,
            &protectedData))
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    HKEY key = NULL;
    LSTATUS status = RegCreateKeyExW(
        HKEY_CURRENT_USER,
        EP_QWEATHER_REGISTRY_PATH,
        0,
        NULL,
        REG_OPTION_NON_VOLATILE,
        KEY_SET_VALUE | KEY_WOW64_64KEY,
        NULL,
        &key,
        NULL
    );
    if (status == ERROR_SUCCESS)
    {
        status = RegSetValueExW(
            key,
            EP_QWEATHER_API_KEY_VALUE,
            0,
            REG_BINARY,
            protectedData.pbData,
            protectedData.cbData
        );
        RegCloseKey(key);
    }

    SecureZeroMemory(protectedData.pbData, protectedData.cbData);
    LocalFree(protectedData.pbData);
    return status == ERROR_SUCCESS ? S_OK : HRESULT_FROM_WIN32(status);
}

HRESULT EPQWeather_ReadApiKey(LPWSTR apiKey, DWORD apiKeyCount)
{
    if (!apiKey || apiKeyCount < 2)
    {
        return E_INVALIDARG;
    }
    apiKey[0] = 0;

    HKEY key = NULL;
    LSTATUS status = RegOpenKeyExW(
        HKEY_CURRENT_USER,
        EP_QWEATHER_REGISTRY_PATH,
        0,
        KEY_QUERY_VALUE | KEY_WOW64_64KEY,
        &key
    );
    if (status != ERROR_SUCCESS)
    {
        return status == ERROR_FILE_NOT_FOUND ? S_FALSE : HRESULT_FROM_WIN32(status);
    }

    DWORD type = 0;
    DWORD size = 0;
    status = RegQueryValueExW(
        key,
        EP_QWEATHER_API_KEY_VALUE,
        NULL,
        &type,
        NULL,
        &size
    );
    if (status != ERROR_SUCCESS || type != REG_BINARY || !size || size > 8192)
    {
        RegCloseKey(key);
        return status == ERROR_FILE_NOT_FOUND ? S_FALSE :
            HRESULT_FROM_WIN32(status == ERROR_SUCCESS ? ERROR_INVALID_DATA : status);
    }

    BYTE* buffer = (BYTE*)LocalAlloc(LPTR, size);
    if (!buffer)
    {
        RegCloseKey(key);
        return E_OUTOFMEMORY;
    }
    status = RegQueryValueExW(
        key,
        EP_QWEATHER_API_KEY_VALUE,
        NULL,
        &type,
        buffer,
        &size
    );
    RegCloseKey(key);
    if (status != ERROR_SUCCESS)
    {
        SecureZeroMemory(buffer, size);
        LocalFree(buffer);
        return HRESULT_FROM_WIN32(status);
    }

    DATA_BLOB input = { .cbData = size, .pbData = buffer };
    DATA_BLOB entropy = {
        .cbData = sizeof(ep_qweather_entropy),
        .pbData = (BYTE*)ep_qweather_entropy
    };
    DATA_BLOB clearData = { 0 };
    BOOL decrypted = CryptUnprotectData(
        &input,
        NULL,
        &entropy,
        NULL,
        NULL,
        CRYPTPROTECT_UI_FORBIDDEN,
        &clearData
    );
    SecureZeroMemory(buffer, size);
    LocalFree(buffer);
    if (!decrypted)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    HRESULT hr = HRESULT_FROM_WIN32(ERROR_INVALID_DATA);
    if (!(clearData.cbData % sizeof(WCHAR)) &&
        clearData.cbData >= sizeof(WCHAR) &&
        clearData.cbData <= apiKeyCount * sizeof(WCHAR))
    {
        DWORD characterCount = clearData.cbData / sizeof(WCHAR);
        WCHAR* clearText = (WCHAR*)clearData.pbData;
        if (clearText[characterCount - 1] == 0 && clearText[0])
        {
            memcpy(apiKey, clearText, clearData.cbData);
            hr = S_OK;
        }
    }
    SecureZeroMemory(clearData.pbData, clearData.cbData);
    LocalFree(clearData.pbData);
    return hr;
}

HRESULT EPQWeather_ClearConfig(void)
{
    LSTATUS hostStatus = RegDeleteKeyValueW(
        HKEY_CURRENT_USER,
        EP_QWEATHER_REGISTRY_PATH,
        EP_QWEATHER_API_HOST_VALUE
    );
    LSTATUS keyStatus = RegDeleteKeyValueW(
        HKEY_CURRENT_USER,
        EP_QWEATHER_REGISTRY_PATH,
        EP_QWEATHER_API_KEY_VALUE
    );
    if (hostStatus != ERROR_SUCCESS && hostStatus != ERROR_FILE_NOT_FOUND)
    {
        return HRESULT_FROM_WIN32(hostStatus);
    }
    if (keyStatus != ERROR_SUCCESS && keyStatus != ERROR_FILE_NOT_FOUND)
    {
        return HRESULT_FROM_WIN32(keyStatus);
    }
    return S_OK;
}

BOOL EPQWeather_IsConfigured(LPWSTR apiHost, DWORD apiHostCount)
{
    WCHAR localHost[EP_QWEATHER_MAX_HOST];
    WCHAR apiKey[EP_QWEATHER_MAX_API_KEY];
    LPWSTR targetHost = apiHost ? apiHost : localHost;
    DWORD targetHostCount = apiHost ? apiHostCount : ARRAYSIZE(localHost);
    BOOL configured = SUCCEEDED(EPQWeather_ReadApiHost(targetHost, targetHostCount)) &&
        targetHost[0] &&
        SUCCEEDED(EPQWeather_ReadApiKey(apiKey, ARRAYSIZE(apiKey))) &&
        apiKey[0];
    SecureZeroMemory(apiKey, sizeof(apiKey));
    if (!configured && apiHost && apiHostCount)
    {
        apiHost[0] = 0;
    }
    return configured;
}

BOOL EPQWeather_IsRequestUriForHost(LPCWSTR uri, LPCWSTR apiHost)
{
    if (!uri || !apiHost || !apiHost[0])
    {
        return FALSE;
    }
    static const WCHAR scheme[] = L"https://";
    size_t schemeLength = ARRAYSIZE(scheme) - 1;
    size_t hostLength = wcslen(apiHost);
    size_t uriLength = wcslen(uri);
    return uriLength > schemeLength + hostLength &&
        !_wcsnicmp(uri, scheme, schemeLength) &&
        !_wcsnicmp(uri + schemeLength, apiHost, hostLength) &&
        uri[schemeLength + hostLength] == L'/';
}
