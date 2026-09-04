#include "ep_weather_location.h"

#include <windows.devices.geolocation.h>
#include <windows.foundation.h>
#include <windows.data.json.h>
#include <roapi.h>
#include <strsafe.h>
#include <wininet.h>
#include <wrl.h>
#include <wrl/wrappers/corewrappers.h>

#include <cmath>
#include <new>
#include <string>

#pragma comment(lib, "runtimeobject.lib")
#pragma comment(lib, "Wininet.lib")

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Wrappers::HStringReference;
using namespace ABI::Windows::Data::Json;
using namespace ABI::Windows::Devices::Geolocation;
using namespace ABI::Windows::Foundation;

namespace
{
    constexpr LPCWSTR kDirectLocationUrl = L"https://ipwho.is/";
    constexpr DWORD kDirectLocationTimeout = 6000;
    constexpr DWORD kWindowsLocationTimeout = 10000;
    constexpr LONGLONG kWindowsLocationTimeoutTicks =
        static_cast<LONGLONG>(kWindowsLocationTimeout) * 10000;
    constexpr size_t kResponseLimit = 32 * 1024;

    struct LocationRequest
    {
        HWND notifyWindow;
        LONG64 browserGeneration;
        BOOL directIp;
        WCHAR requestId[EP_WEATHER_AUTO_LOCATION_REQUEST_ID_MAX];
    };

    void CopyJsonString(
        IJsonObject* object,
        LPCWSTR name,
        WCHAR* destination,
        size_t destinationCount
    )
    {
        if (!object || !destination || !destinationCount)
        {
            return;
        }

        HSTRING value = nullptr;
        if (SUCCEEDED(object->GetNamedString(HStringReference(name).Get(), &value)) && value)
        {
            UINT32 length = 0;
            const WCHAR* source = WindowsGetStringRawBuffer(value, &length);
            size_t count = source
                ? (length < destinationCount - 1 ? length : destinationCount - 1)
                : 0;
            if (count)
            {
                wmemcpy(destination, source, count);
            }
            destination[count] = L'\0';
            WindowsDeleteString(value);
        }
    }

    HRESULT ReadDirectLocationResponse(std::string* response)
    {
        if (!response)
        {
            return E_INVALIDARG;
        }

        response->clear();
        HINTERNET internet = InternetOpenW(
            L"ExplorerPatcher Weather",
            INTERNET_OPEN_TYPE_DIRECT,
            nullptr,
            nullptr,
            0
        );
        if (!internet)
        {
            return HRESULT_FROM_WIN32(GetLastError());
        }

        DWORD timeout = kDirectLocationTimeout;
        InternetSetOptionW(internet, INTERNET_OPTION_CONNECT_TIMEOUT, &timeout, sizeof(timeout));
        InternetSetOptionW(internet, INTERNET_OPTION_SEND_TIMEOUT, &timeout, sizeof(timeout));
        InternetSetOptionW(internet, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeout, sizeof(timeout));

        HINTERNET request = InternetOpenUrlW(
            internet,
            kDirectLocationUrl,
            nullptr,
            0,
            INTERNET_FLAG_SECURE |
            INTERNET_FLAG_RELOAD |
            INTERNET_FLAG_NO_CACHE_WRITE |
            INTERNET_FLAG_NO_COOKIES |
            INTERNET_FLAG_NO_UI,
            0
        );
        if (!request)
        {
            HRESULT hr = HRESULT_FROM_WIN32(GetLastError());
            InternetCloseHandle(internet);
            return hr;
        }

        DWORD statusCode = 0;
        DWORD statusSize = sizeof(statusCode);
        if (!HttpQueryInfoW(
            request,
            HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER,
            &statusCode,
            &statusSize,
            nullptr
        ) || statusCode < 200 || statusCode >= 300)
        {
            HRESULT hr = statusCode
                ? HRESULT_FROM_WIN32(statusCode)
                : HRESULT_FROM_WIN32(GetLastError());
            InternetCloseHandle(request);
            InternetCloseHandle(internet);
            return hr;
        }

        char buffer[4096];
        DWORD bytesRead = 0;
        BOOL readOk = TRUE;
        while (TRUE)
        {
            bytesRead = 0;
            if (!InternetReadFile(request, buffer, sizeof(buffer), &bytesRead))
            {
                readOk = FALSE;
                break;
            }
            if (!bytesRead)
            {
                break;
            }
            if (response->size() + bytesRead > kResponseLimit)
            {
                readOk = FALSE;
                break;
            }
            response->append(buffer, bytesRead);
        }

        InternetCloseHandle(request);
        InternetCloseHandle(internet);
        if (!readOk || response->empty())
        {
            return HRESULT_FROM_WIN32(ERROR_BAD_NET_RESP);
        }
        return S_OK;
    }

    HRESULT ParseDirectLocationResponse(
        const std::string& response,
        EPWeatherLocationResult* result
    )
    {
        if (!result)
        {
            return E_INVALIDARG;
        }

        int characterCount = MultiByteToWideChar(
            CP_UTF8,
            MB_ERR_INVALID_CHARS,
            response.data(),
            static_cast<int>(response.size()),
            nullptr,
            0
        );
        if (characterCount <= 0)
        {
            return HRESULT_FROM_WIN32(GetLastError());
        }

        std::wstring json(static_cast<size_t>(characterCount), L'\0');
        if (!MultiByteToWideChar(
            CP_UTF8,
            MB_ERR_INVALID_CHARS,
            response.data(),
            static_cast<int>(response.size()),
            &json[0],
            characterCount
        ))
        {
            return HRESULT_FROM_WIN32(GetLastError());
        }

        Microsoft::WRL::Wrappers::RoInitializeWrapper roInitialize(RO_INIT_MULTITHREADED);
        if (FAILED(roInitialize))
        {
            return roInitialize;
        }

        ComPtr<IJsonObjectStatics> jsonStatics;
        HRESULT hr = RoGetActivationFactory(
            HStringReference(RuntimeClass_Windows_Data_Json_JsonObject).Get(),
            IID_PPV_ARGS(&jsonStatics)
        );
        if (FAILED(hr))
        {
            return hr;
        }

        ComPtr<IJsonObject> object;
        hr = jsonStatics->Parse(HStringReference(json.c_str()).Get(), &object);
        if (FAILED(hr) || !object)
        {
            return FAILED(hr) ? hr : HRESULT_FROM_WIN32(ERROR_INVALID_DATA);
        }

        boolean success = false;
        hr = object->GetNamedBoolean(HStringReference(L"success").Get(), &success);
        if (FAILED(hr) || !success)
        {
            return FAILED(hr) ? hr : E_ACCESSDENIED;
        }

        double latitude = 0;
        double longitude = 0;
        if (FAILED(object->GetNamedNumber(HStringReference(L"latitude").Get(), &latitude)) ||
            FAILED(object->GetNamedNumber(HStringReference(L"longitude").Get(), &longitude)) ||
            !std::isfinite(latitude) || !std::isfinite(longitude) ||
            latitude < -90.0 || latitude > 90.0 ||
            longitude < -180.0 || longitude > 180.0)
        {
            return HRESULT_FROM_WIN32(ERROR_INVALID_DATA);
        }

        result->success = TRUE;
        result->status = S_OK;
        result->latitude = latitude;
        result->longitude = longitude;
        result->accuracyMeters = 0;
        result->positionSource = EP_WEATHER_LOCATION_SOURCE_IP;
        CopyJsonString(object.Get(), L"city", result->city, ARRAYSIZE(result->city));
        CopyJsonString(object.Get(), L"region", result->region, ARRAYSIZE(result->region));
        CopyJsonString(object.Get(), L"country", result->country, ARRAYSIZE(result->country));
        return S_OK;
    }

    HRESULT ReadWindowsLocation(EPWeatherLocationResult* result)
    {
        if (!result)
        {
            return E_INVALIDARG;
        }

        Microsoft::WRL::Wrappers::RoInitializeWrapper roInitialize(RO_INIT_MULTITHREADED);
        if (FAILED(roInitialize))
        {
            return roInitialize;
        }

        ComPtr<IInspectable> inspectable;
        HRESULT hr = RoActivateInstance(
            HStringReference(RuntimeClass_Windows_Devices_Geolocation_Geolocator).Get(),
            &inspectable
        );
        if (FAILED(hr) || !inspectable)
        {
            return FAILED(hr) ? hr : E_FAIL;
        }

        ComPtr<IGeolocator> locator;
        hr = inspectable.As(&locator);
        if (FAILED(hr) || !locator)
        {
            return FAILED(hr) ? hr : E_FAIL;
        }

        hr = locator->put_DesiredAccuracy(PositionAccuracy_High);
        if (FAILED(hr))
        {
            return hr;
        }
        hr = locator->put_ReportInterval(1000);
        if (FAILED(hr))
        {
            return hr;
        }

        __FIAsyncOperation_1_Windows__CDevices__CGeolocation__CGeoposition* operationRaw = nullptr;
        hr = locator->GetGeopositionAsyncWithAgeAndTimeout(
            TimeSpan{ 0 },
            TimeSpan{ kWindowsLocationTimeoutTicks },
            &operationRaw
        );
        if (FAILED(hr) || !operationRaw)
        {
            return FAILED(hr) ? hr : E_FAIL;
        }

        ComPtr<__FIAsyncOperation_1_Windows__CDevices__CGeolocation__CGeoposition> operation;
        operation.Attach(operationRaw);
        ComPtr<IAsyncInfo> asyncInfo;
        hr = operation.As(&asyncInfo);
        if (FAILED(hr) || !asyncInfo)
        {
            return FAILED(hr) ? hr : E_FAIL;
        }

        AsyncStatus status = Started;
        const DWORD start = GetTickCount();
        while (GetTickCount() - start < kWindowsLocationTimeout)
        {
            hr = asyncInfo->get_Status(&status);
            if (FAILED(hr))
            {
                return hr;
            }
            if (status != Started)
            {
                break;
            }
            Sleep(100);
        }
        if (status == Started)
        {
            asyncInfo->Cancel();
            return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
        }
        if (status != Completed)
        {
            HRESULT error = E_FAIL;
            if (SUCCEEDED(asyncInfo->get_ErrorCode(&error)) && FAILED(error))
            {
                return error;
            }
            return HRESULT_FROM_WIN32(ERROR_NOT_SUPPORTED);
        }

        ComPtr<IGeoposition> position;
        hr = operation->GetResults(&position);
        if (FAILED(hr) || !position)
        {
            return FAILED(hr) ? hr : E_FAIL;
        }

        ComPtr<IGeocoordinate> coordinate;
        hr = position->get_Coordinate(&coordinate);
        if (FAILED(hr) || !coordinate)
        {
            return FAILED(hr) ? hr : E_FAIL;
        }

        ComPtr<IGeocoordinateWithPositionData> positionData;
        PositionSource positionSource = static_cast<PositionSource>(-1);
        if (FAILED(coordinate.As(&positionData)) || !positionData ||
            FAILED(positionData->get_PositionSource(&positionSource)))
        {
            return HRESULT_FROM_WIN32(ERROR_INVALID_DATA);
        }
        result->positionSource = static_cast<LONG>(positionSource);

        // PositionSource_IPAddress is intentionally rejected. It is still an
        // IP approximation, even when the result came through Windows APIs.
        if (positionSource != PositionSource_Cellular &&
            positionSource != PositionSource_Satellite &&
            positionSource != PositionSource_WiFi)
        {
            return HRESULT_FROM_WIN32(ERROR_NOT_SUPPORTED);
        }

        ComPtr<IGeocoordinateWithPoint> coordinateWithPoint;
        ComPtr<IGeopoint> point;
        BasicGeoposition basicPosition = {};
        double accuracy = 0;
        if (FAILED(coordinate.As(&coordinateWithPoint)) || !coordinateWithPoint ||
            FAILED(coordinateWithPoint->get_Point(&point)) || !point ||
            FAILED(point->get_Position(&basicPosition)) ||
            FAILED(coordinate->get_Accuracy(&accuracy)))
        {
            return HRESULT_FROM_WIN32(ERROR_INVALID_DATA);
        }

        if (!std::isfinite(basicPosition.Latitude) ||
            !std::isfinite(basicPosition.Longitude) ||
            !std::isfinite(accuracy) || accuracy <= 0 ||
            accuracy > EP_WEATHER_LOCATION_MAX_ACCURACY_METERS ||
            basicPosition.Latitude < -90.0 || basicPosition.Latitude > 90.0 ||
            basicPosition.Longitude < -180.0 || basicPosition.Longitude > 180.0)
        {
            return HRESULT_FROM_WIN32(ERROR_INVALID_DATA);
        }

        result->success = TRUE;
        result->status = S_OK;
        result->latitude = basicPosition.Latitude;
        result->longitude = basicPosition.Longitude;
        result->accuracyMeters = accuracy;
        return S_OK;
    }

    DWORD WINAPI LocationWorker(void* parameter)
    {
        LocationRequest* request = static_cast<LocationRequest*>(parameter);
        if (!request)
        {
            return 0;
        }

        EPWeatherLocationResult* result = static_cast<EPWeatherLocationResult*>(
            CoTaskMemAlloc(sizeof(EPWeatherLocationResult))
        );
        if (result)
        {
            ZeroMemory(result, sizeof(*result));
            result->browserGeneration = request->browserGeneration;
            result->positionSource = -1;
            StringCchCopyW(result->requestId, ARRAYSIZE(result->requestId), request->requestId);

            HRESULT hr = E_FAIL;
            if (request->directIp)
            {
                std::string response;
                hr = ReadDirectLocationResponse(&response);
                if (SUCCEEDED(hr))
                {
                    hr = ParseDirectLocationResponse(response, result);
                }
            }
            else
            {
                hr = ReadWindowsLocation(result);
            }
            result->status = hr;
            if (FAILED(hr))
            {
                result->success = FALSE;
            }

            if (PostMessageW(
                request->notifyWindow,
                EP_WEATHER_WM_AUTO_LOCATION_RESULT,
                0,
                reinterpret_cast<LPARAM>(result)
            ))
            {
                result = nullptr;
            }
        }

        if (result)
        {
            CoTaskMemFree(result);
        }
        CoTaskMemFree(request);
        return 0;
    }
}

static HRESULT EPWeather_BeginLocation(
    HWND notifyWindow,
    LONG64 browserGeneration,
    LPCWSTR requestId,
    BOOL directIp
)
{
    if (!notifyWindow || !IsWindow(notifyWindow) || !requestId || !requestId[0] ||
        wcsnlen_s(requestId, EP_WEATHER_AUTO_LOCATION_REQUEST_ID_MAX) >= EP_WEATHER_AUTO_LOCATION_REQUEST_ID_MAX)
    {
        return E_INVALIDARG;
    }

    LocationRequest* request = static_cast<LocationRequest*>(
        CoTaskMemAlloc(sizeof(LocationRequest))
    );
    if (!request)
    {
        return E_OUTOFMEMORY;
    }

    ZeroMemory(request, sizeof(*request));
    request->notifyWindow = notifyWindow;
    request->browserGeneration = browserGeneration;
    request->directIp = directIp;
    HRESULT hr = StringCchCopyW(request->requestId, ARRAYSIZE(request->requestId), requestId);
    if (FAILED(hr))
    {
        CoTaskMemFree(request);
        return hr;
    }

    HANDLE worker = CreateThread(nullptr, 0, LocationWorker, request, 0, nullptr);
    if (!worker)
    {
        hr = HRESULT_FROM_WIN32(GetLastError());
        CoTaskMemFree(request);
        return hr;
    }
    CloseHandle(worker);
    return S_OK;
}

extern "C" HRESULT EPWeather_BeginWindowsLocation(
    HWND notifyWindow,
    LONG64 browserGeneration,
    LPCWSTR requestId
)
{
    return EPWeather_BeginLocation(notifyWindow, browserGeneration, requestId, FALSE);
}

extern "C" HRESULT EPWeather_BeginDirectIpLocation(
    HWND notifyWindow,
    LONG64 browserGeneration,
    LPCWSTR requestId
)
{
    return EPWeather_BeginLocation(notifyWindow, browserGeneration, requestId, TRUE);
}
