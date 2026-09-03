#include "ep_weather_host.h"
#include "ep_weather_provider_open_meteo_html.h"
#include "ep_weather_provider_open_meteo_script.h"
#include "ep_weather_error_html.h"

#include <stdio.h>
#include <tlhelp32.h>

RTL_OSVERSIONINFOW global_rovi;
DWORD32 global_ubr;
SYSTEMTIME stLastUpdate;

#define EP_WEATHER_WEBVIEW_PRIVATE_LIMIT ((SIZE_T)768 * 1024 * 1024)
#define EP_WEATHER_WEBVIEW_WORKING_SET_LIMIT ((SIZE_T)640 * 1024 * 1024)
#define EP_WEATHER_BROWSER_RETRY_LIMIT 6

static HRESULT epw_Weather_CreateBrowserEnvironment(EPWeather* _this);
static HRESULT epw_Weather_CreateBrowserController(EPWeather* _this);
static HRESULT epw_Weather_RestartBrowser(EPWeather* _this);
static void epw_Weather_ReleaseBrowser(EPWeather* _this, BOOL releaseEnvironment);
static void epw_Weather_ScheduleBrowserRetry(EPWeather* _this);
static BOOL epw_Weather_IsCurrentBrowserCallback(GenericObjectWithThis* _this);
static BOOL epw_Weather_GetWebViewMemory(SIZE_T* privateBytes, SIZE_T* workingSetBytes, DWORD* processCount);
static void epw_Weather_RequestBrowserRestart(EPWeather* _this);
static HRESULT epw_Weather_NavigateToString(EPWeather* _this, LPCWSTR htmlContent);

static HRESULT epw_Weather_NavigateToString(EPWeather* _this, LPCWSTR htmlContent)
{
    if (!_this || !_this->pCoreWebView2 || !htmlContent)
    {
        return E_INVALIDARG;
    }

    InterlockedExchange64(&_this->bAllowEmbeddedNavigation, TRUE);
    HRESULT hr = _this->pCoreWebView2->lpVtbl->NavigateToString(
        _this->pCoreWebView2,
        htmlContent
    );
    if (FAILED(hr))
    {
        InterlockedExchange64(&_this->bAllowEmbeddedNavigation, FALSE);
    }
    return hr;
}

HRESULT STDMETHODCALLTYPE epw_Weather_static_Stub(void* _this)
{
    return S_OK;
}

ULONG STDMETHODCALLTYPE epw_Weather_static_AddRefRelease(void* _this)
{
    return 1;
}

static DWORD epw_Weather_ReleaseBecauseClientDiedThread(EPWeather* _this)
{
    Sleep(5000);
    while (_this->lpVtbl->Release(_this));
    return 0;
}

static void epw_Weather_SetTextScaleFactorFromRegistry(EPWeather* _this, HKEY hKey, BOOL bRefresh)
{
    DWORD dwTextScaleFactor = 100, dwSize = sizeof(DWORD);
    if (_this->SHRegGetValueFromHKCUHKLMFunc && _this->SHRegGetValueFromHKCUHKLMFunc(L"SOFTWARE\\Microsoft\\Accessibility", L"TextScaleFactor", SRRF_RT_REG_DWORD, NULL, &dwTextScaleFactor, (LPDWORD)(&dwSize)) != ERROR_SUCCESS)
    {
        dwTextScaleFactor = 100;
    }
    if (InterlockedExchange64(&_this->dwTextScaleFactor, dwTextScaleFactor) == dwTextScaleFactor)
    {
        bRefresh = FALSE;
    }
    if (hKey == HKEY_CURRENT_USER)
    {
        if (RegCreateKeyExW(HKEY_CURRENT_USER, L"SOFTWARE\\Microsoft\\Accessibility", 0, NULL, REG_OPTION_NON_VOLATILE, KEY_READ | KEY_WOW64_64KEY | KEY_WRITE, NULL, &_this->hKCUAccessibility, NULL) == ERROR_SUCCESS)
        {
            RegNotifyChangeKeyValue(_this->hKCUAccessibility, FALSE, REG_NOTIFY_CHANGE_LAST_SET, _this->hSignalOnAccessibilitySettingsChangedFromHKCU, TRUE);
        }
    }
    else if (hKey == HKEY_LOCAL_MACHINE)
    {
        if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Accessibility", REG_OPTION_NON_VOLATILE, KEY_READ | KEY_WOW64_64KEY | KEY_WRITE, &_this->hKLMAccessibility))
        {
            RegNotifyChangeKeyValue(_this->hKLMAccessibility, FALSE, REG_NOTIFY_CHANGE_LAST_SET, _this->hSignalOnAccessibilitySettingsChangedFromHKLM, TRUE);
        }
    }
    if (bRefresh)
    {
        _ep_Weather_StartResize(_this);
    }
}

HRESULT STDMETHODCALLTYPE INetworkListManagerEvents_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_INetworkListManagerEvents) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE INetworkListManagerEvents_ConnectivityChanged(GenericObjectWithThis* _this2, NLM_CONNECTIVITY newConnectivity)
{
    EPWeather* _this = _this2->_this; // GetWindowLongPtrW(FindWindowW(_T(EPW_WEATHER_CLASSNAME), NULL), GWLP_USERDATA);
    if (_this)
    {
        if ((newConnectivity & (NLM_CONNECTIVITY_IPV4_INTERNET | NLM_CONNECTIVITY_IPV6_INTERNET)) != 0)
        {
            printf("[Network Events for 0x%p] Internet connection status is: Available.\n", _this);
            LONG64 dwUpdateSchedule = InterlockedAdd64(&_this->dwUpdateSchedule, 0);
            SetTimer(_this->hWnd, EP_WEATHER_TIMER_REQUEST_REFRESH, EP_WEATHER_TIMER_REQUEST_REFRESH_DELAY, NULL);
            //PostMessageW(_this->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0);
            SetTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH, dwUpdateSchedule, NULL);
            printf("[Network Events for 0x%p] Reinstalled refresh timer.\n", _this);
        }
        else
        {
            printf("[Network Events for 0x%p] Internet connection status is: Offline.\n", _this);
            KillTimer(_this->hWnd, EP_WEATHER_TIMER_REQUEST_REFRESH);
            KillTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH);
            printf("[Network Events for 0x%p] Killed refresh timer.\n", _this);
        }
    }
    return S_OK;
}

GenericObjectWithThis* GenericObjectWithThis_MakeAndInitialize(IUnknownVtbl* vtbl, EPWeather* _this, const LPWSTR pName)
{
    GenericObjectWithThis* pObj = malloc(sizeof(GenericObjectWithThis));
    if (pObj)
    {
        ULONG cnt = InterlockedIncrement64(&(_this->cbGenericObject));
        pObj->lpVtbl = vtbl;
        pObj->cbCount = 1;
        pObj->pInstance = pObj;
        pObj->_this = _this;
        pObj->pName = pName;
        pObj->browserGeneration = InterlockedAdd64(&(_this->dwBrowserGeneration), 0);
        wprintf(L"[] {%d} Making object { name: \"%s\", _this: 0x%p }\n", cnt, pName, _this);
        return pObj;
    }
    return NULL;
}

ULONG STDMETHODCALLTYPE GenericObjectWithThis_AddRef(GenericObjectWithThis* _this)
{
    ULONG cnt = InterlockedIncrement64(&(_this->_this->cbGenericObject));
    ULONG value = InterlockedIncrement64(&(_this->cbCount));
    wprintf(L"[] {%d} AddRef, new value = %d on { name: \"%s\", _this: 0x%p }\n", cnt, value, _this->pName, _this->_this);
    return value;
}

ULONG STDMETHODCALLTYPE GenericObjectWithThis_Release(GenericObjectWithThis* _this)
{
    ULONG cnt = InterlockedDecrement64(&(_this->_this->cbGenericObject));
    ULONG value = InterlockedDecrement64(&(_this->cbCount));
    if (value == 0)
    {
        wprintf(L"[] {%d} Release with free, new value = %d on { name: \"%s\", _this: 0x%p }\n", cnt, value, _this->pName, _this->_this);
        free(_this->pInstance);
        return 0;
    }
    wprintf(L"[] {%d} Release, new value = %d on { name: \"%s\", _this: 0x%p }\n", cnt, value, _this->pName, _this->_this);
    return value;
}

static BOOL epw_Weather_IsCurrentBrowserCallback(GenericObjectWithThis* _this)
{
    return _this &&
        _this->_this &&
        _this->browserGeneration == InterlockedAdd64(&(_this->_this->dwBrowserGeneration), 0);
}

static HRESULT epw_Weather_CreateBrowserEnvironment(EPWeather* _this)
{
    GenericObjectWithThis* pCompletedHandler =
        GenericObjectWithThis_MakeAndInitialize(
            &EPWeather_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandlerVtbl,
            _this,
            L"pCoreWebView2CreateCoreWebView2EnvironmentCompletedHandler"
        );
    if (!pCompletedHandler)
    {
        return E_OUTOFMEMORY;
    }

    HRESULT hr = E_NOTIMPL;
#if !defined(_M_ARM64EC)
    hr = CreateCoreWebView2EnvironmentWithOptions(
        NULL,
        _this->wszUserDataFolder,
        &EPWeather_ICoreWebView2EnvironmentOptions,
        pCompletedHandler
    );
#endif
    pCompletedHandler->lpVtbl->Release(pCompletedHandler);
    return hr;
}

static HRESULT epw_Weather_CreateBrowserController(EPWeather* _this)
{
    if (!_this->pCoreWebView2Environment || !_this->hWnd)
    {
        return E_UNEXPECTED;
    }

    GenericObjectWithThis* pCompletedHandler =
        GenericObjectWithThis_MakeAndInitialize(
            &EPWeather_ICoreWebView2CreateCoreWebView2ControllerCompletedHandlerVtbl,
            _this,
            L"pCoreWebView2CreateCoreWebView2ControllerCompletedHandler"
        );
    if (!pCompletedHandler)
    {
        return E_OUTOFMEMORY;
    }

    HRESULT hr = _this->pCoreWebView2Environment->lpVtbl->CreateCoreWebView2Controller(
        _this->pCoreWebView2Environment,
        _this->hWnd,
        pCompletedHandler
    );
    pCompletedHandler->lpVtbl->Release(pCompletedHandler);
    return hr;
}

static void epw_Weather_ReleaseBrowser(EPWeather* _this, BOOL releaseEnvironment)
{
    if (!_this)
    {
        return;
    }

    InterlockedExchange64(&_this->bAllowEmbeddedNavigation, FALSE);

    if (_this->hWnd)
    {
        if (releaseEnvironment)
        {
            KillTimer(_this->hWnd, EP_WEATHER_TIMER_MEMORY_GUARD);
        }
        KillTimer(_this->hWnd, EP_WEATHER_TIMER_BROWSER_RETRY);
        KillTimer(_this->hWnd, EP_WEATHER_TIMER_EXECUTEDATASCRIPT);
        KillTimer(_this->hWnd, EP_WEATHER_TIMER_RESIZE_WINDOW);
    }

    if (_this->pCoreWebView2)
    {
        if (_this->tkOnNavigationStarting.value)
        {
            _this->pCoreWebView2->lpVtbl->remove_NavigationStarting(
                _this->pCoreWebView2,
                _this->tkOnNavigationStarting
            );
            _this->tkOnNavigationStarting.value = 0;
        }
        if (_this->tkOnNavigationCompleted.value)
        {
            _this->pCoreWebView2->lpVtbl->remove_NavigationCompleted(
                _this->pCoreWebView2,
                _this->tkOnNavigationCompleted
            );
            _this->tkOnNavigationCompleted.value = 0;
        }
        if (_this->tkOnPermissionRequested.value)
        {
            _this->pCoreWebView2->lpVtbl->remove_PermissionRequested(
                _this->pCoreWebView2,
                _this->tkOnPermissionRequested
            );
            _this->tkOnPermissionRequested.value = 0;
        }
        if (_this->tkOnWebResourceRequested.value)
        {
            _this->pCoreWebView2->lpVtbl->remove_WebResourceRequested(
                _this->pCoreWebView2,
                _this->tkOnWebResourceRequested
            );
            _this->tkOnWebResourceRequested.value = 0;
        }
        if (_this->tkOnWebMessageReceived.value)
        {
            _this->pCoreWebView2->lpVtbl->remove_WebMessageReceived(
                _this->pCoreWebView2,
                _this->tkOnWebMessageReceived
            );
            _this->tkOnWebMessageReceived.value = 0;
        }
    }

    if (_this->pCoreWebView2NavigationStartingEventHandler)
    {
        _this->pCoreWebView2NavigationStartingEventHandler->lpVtbl->Release(
            _this->pCoreWebView2NavigationStartingEventHandler
        );
        _this->pCoreWebView2NavigationStartingEventHandler = NULL;
    }
    if (_this->pCoreWebView2NavigationCompletedEventHandler)
    {
        _this->pCoreWebView2NavigationCompletedEventHandler->lpVtbl->Release(
            _this->pCoreWebView2NavigationCompletedEventHandler
        );
        _this->pCoreWebView2NavigationCompletedEventHandler = NULL;
    }
    if (_this->pCoreWebView2PermissionRequestedEventHandler)
    {
        _this->pCoreWebView2PermissionRequestedEventHandler->lpVtbl->Release(
            _this->pCoreWebView2PermissionRequestedEventHandler
        );
        _this->pCoreWebView2PermissionRequestedEventHandler = NULL;
    }
    if (_this->pCoreWebView2WebResourceRequestedEventHandler)
    {
        _this->pCoreWebView2WebResourceRequestedEventHandler->lpVtbl->Release(
            _this->pCoreWebView2WebResourceRequestedEventHandler
        );
        _this->pCoreWebView2WebResourceRequestedEventHandler = NULL;
    }
    if (_this->pCoreWebView2WebMessageReceivedEventHandler)
    {
        _this->pCoreWebView2WebMessageReceivedEventHandler->lpVtbl->Release(
            _this->pCoreWebView2WebMessageReceivedEventHandler
        );
        _this->pCoreWebView2WebMessageReceivedEventHandler = NULL;
    }
    InterlockedExchange64(&_this->bDataCapturePending, FALSE);

    if (_this->pCoreWebView2Controller)
    {
        _this->pCoreWebView2Controller->lpVtbl->Close(_this->pCoreWebView2Controller);
    }
    if (_this->pCoreWebView2)
    {
        _this->pCoreWebView2->lpVtbl->Release(_this->pCoreWebView2);
        _this->pCoreWebView2 = NULL;
    }
    if (_this->pCoreWebView2Controller)
    {
        _this->pCoreWebView2Controller->lpVtbl->Release(_this->pCoreWebView2Controller);
        _this->pCoreWebView2Controller = NULL;
    }
    if (releaseEnvironment && _this->pCoreWebView2Environment)
    {
        _this->pCoreWebView2Environment->lpVtbl->Release(_this->pCoreWebView2Environment);
        _this->pCoreWebView2Environment = NULL;
    }
}

static void epw_Weather_ScheduleBrowserRetry(EPWeather* _this)
{
    if (!_this || !_this->hWnd)
    {
        return;
    }

    DWORD failures = ++_this->dwBrowserRestartFailures;
    if (failures <= EP_WEATHER_BROWSER_RETRY_LIMIT)
    {
        DWORD delay = EP_WEATHER_TIMER_BROWSER_RETRY_DELAY * failures;
        SetTimer(_this->hWnd, EP_WEATHER_TIMER_BROWSER_RETRY, delay, NULL);
        printf("[Browser] Retry %u scheduled in %u ms.\n", failures, delay);
    }
    else
    {
        printf("[Browser] Retry limit reached; waiting for the next user request.\n");
    }
}

static void epw_Weather_BrowserFailed(EPWeather* _this, HRESULT hr)
{
    if (!_this)
    {
        return;
    }

    _this->hrLastError = FAILED(hr) ? hr : E_FAIL;
    InterlockedExchange64(&_this->bBrowserBusy, FALSE);
    InterlockedExchange64(&_this->bBrowserRestarting, FALSE);
    epw_Weather_ScheduleBrowserRetry(_this);
}

typedef struct _EPWeatherProcessEntry
{
    DWORD processId;
    DWORD parentProcessId;
    WCHAR name[MAX_PATH];
} EPWeatherProcessEntry;

static BOOL epw_Weather_IsProcessDescendant(
    DWORD processId,
    DWORD ancestorProcessId,
    const EPWeatherProcessEntry* entries,
    DWORD entryCount
)
{
    for (DWORD depth = 0; depth < 64 && processId; ++depth)
    {
        if (processId == ancestorProcessId)
        {
            return TRUE;
        }

        DWORD parentProcessId = 0;
        for (DWORD i = 0; i < entryCount; ++i)
        {
            if (entries[i].processId == processId)
            {
                parentProcessId = entries[i].parentProcessId;
                break;
            }
        }
        if (!parentProcessId || parentProcessId == processId)
        {
            break;
        }
        processId = parentProcessId;
    }
    return FALSE;
}

static BOOL epw_Weather_GetWebViewMemory(
    SIZE_T* privateBytes,
    SIZE_T* workingSetBytes,
    DWORD* processCount
)
{
    if (!privateBytes || !workingSetBytes || !processCount)
    {
        return FALSE;
    }

    *privateBytes = 0;
    *workingSetBytes = 0;
    *processCount = 0;

    const DWORD maxEntries = 2048;
    EPWeatherProcessEntry* entries = calloc(maxEntries, sizeof(EPWeatherProcessEntry));
    if (!entries)
    {
        return FALSE;
    }

    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE)
    {
        free(entries);
        return FALSE;
    }

    PROCESSENTRY32W processEntry;
    ZeroMemory(&processEntry, sizeof(processEntry));
    processEntry.dwSize = sizeof(processEntry);
    DWORD entryCount = 0;
    if (Process32FirstW(snapshot, &processEntry))
    {
        do
        {
            if (entryCount >= maxEntries)
            {
                break;
            }
            entries[entryCount].processId = processEntry.th32ProcessID;
            entries[entryCount].parentProcessId = processEntry.th32ParentProcessID;
            wcscpy_s(entries[entryCount].name, ARRAYSIZE(entries[entryCount].name), processEntry.szExeFile);
            entryCount++;
        }
        while (Process32NextW(snapshot, &processEntry));
    }
    CloseHandle(snapshot);

    DWORD currentProcessId = GetCurrentProcessId();
    for (DWORD i = 0; i < entryCount; ++i)
    {
        if (_wcsicmp(entries[i].name, L"msedgewebview2.exe") ||
            !epw_Weather_IsProcessDescendant(
                entries[i].processId,
                currentProcessId,
                entries,
                entryCount
            ))
        {
            continue;
        }

        HANDLE process = OpenProcess(PROCESS_QUERY_INFORMATION, FALSE, entries[i].processId);
        if (!process)
        {
            process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, entries[i].processId);
        }
        if (process)
        {
            PROCESS_MEMORY_COUNTERS_EX counters;
            ZeroMemory(&counters, sizeof(counters));
            counters.cb = sizeof(counters);
            if (GetProcessMemoryInfo(
                    process,
                    (PPROCESS_MEMORY_COUNTERS)&counters,
                    sizeof(counters)
                ))
            {
                *privateBytes += counters.PrivateUsage;
                *workingSetBytes += counters.WorkingSetSize;
                (*processCount)++;
            }
            CloseHandle(process);
        }
    }

    free(entries);
    return *processCount != 0;
}

static void epw_Weather_RequestBrowserRestart(EPWeather* _this)
{
    if (!_this ||
        !_this->hWnd ||
        InterlockedAdd64(&_this->bBrowserRestarting, 0))
    {
        return;
    }
    if (InterlockedCompareExchange64(&_this->bBrowserRestartPending, TRUE, FALSE) == FALSE)
    {
        if (!PostMessageW(_this->hWnd, EP_WEATHER_WM_RESTART_BROWSER, 0, 0))
        {
            InterlockedExchange64(&_this->bBrowserRestartPending, FALSE);
        }
    }
}

static void epw_Weather_CheckMemoryGuard(EPWeather* _this)
{
    if (!_this ||
        InterlockedAdd64(&_this->bBrowserRestarting, 0) ||
        InterlockedAdd64(&_this->bBrowserRestartPending, 0))
    {
        return;
    }

    SIZE_T privateBytes = 0;
    SIZE_T workingSetBytes = 0;
    DWORD processCount = 0;
    if (epw_Weather_GetWebViewMemory(&privateBytes, &workingSetBytes, &processCount) &&
        (privateBytes >= EP_WEATHER_WEBVIEW_PRIVATE_LIMIT ||
         workingSetBytes >= EP_WEATHER_WEBVIEW_WORKING_SET_LIMIT))
    {
        printf(
            "[MemoryGuard] WebView2 processes: %u, private: %llu MB, working set: %llu MB. Restarting browser.\n",
            processCount,
            (unsigned long long)(privateBytes / (1024 * 1024)),
            (unsigned long long)(workingSetBytes / (1024 * 1024))
        );
        epw_Weather_RequestBrowserRestart(_this);
    }
}

static HRESULT epw_Weather_RestartBrowser(EPWeather* _this)
{
    if (!_this || !_this->hWnd)
    {
        return E_HANDLE;
    }
    if (InterlockedCompareExchange64(&_this->bBrowserRestarting, TRUE, FALSE) != FALSE)
    {
        return S_FALSE;
    }

    InterlockedExchange64(&_this->bBrowserRestartPending, FALSE);
    InterlockedIncrement64(&_this->dwBrowserGeneration);
    InterlockedExchange64(&_this->bBrowserBusy, TRUE);
    InterlockedExchange64(&_this->bIsNavigatingToError, FALSE);
    epw_Weather_ReleaseBrowser(_this, FALSE);

    HRESULT hr = _this->pCoreWebView2Environment
        ? epw_Weather_CreateBrowserController(_this)
        : epw_Weather_CreateBrowserEnvironment(_this);
    if (FAILED(hr))
    {
        printf("[Browser] Restart failed to start: 0x%08x.\n", (unsigned int)hr);
        epw_Weather_BrowserFailed(_this, hr);
    }
    else
    {
        printf("[Browser] Restart requested.\n");
    }
    return hr;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2EnvironmentOptions_QueryInterface(IUnknown* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2EnvironmentOptions) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE ICoreWebView2CreateCoreWebView2ControllerCompletedHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE ICoreWebView2NavigationStartingEventHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2NavigationStartingEventHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE ICoreWebView2NavigationCompletedEventHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2NavigationCompletedEventHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE ICoreWebView2PermissionRequestedEventHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2PermissionRequestedEventHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE ICoreWebView2WebResourceRequestedEventHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2WebResourceRequestedEventHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return E_NOINTERFACE;
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return NOERROR;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2WebMessageReceivedEventHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2WebMessageReceivedEventHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return E_NOINTERFACE;
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return NOERROR;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2CallDevToolsProtocolMethodCompletedHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2CallDevToolsProtocolMethodCompletedHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}


HRESULT STDMETHODCALLTYPE ICoreWebView2ExecuteScriptCompletedHandler_QueryInterface(GenericObjectWithThis* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_ICoreWebView2ExecuteScriptCompletedHandler) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_get_AdditionalBrowserArguments(ICoreWebView2EnvironmentOptions* _this, LPWSTR* value)
{
    static const WCHAR arguments[] = L"--disable-site-isolation-trials --disable-web-security --allow-insecure-localhost";
    *value = CoTaskMemAlloc(sizeof(arguments));
    if (*value)
    {
        wcscpy_s(*value, ARRAYSIZE(arguments), arguments);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_get_Language(ICoreWebView2EnvironmentOptions* _this, LPWSTR* value)
{
    *value = CoTaskMemAlloc(6 * sizeof(WCHAR));
    if (*value)
    {
        wcscpy_s(*value, 6, L"en-US");
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_get_TargetCompatibleBrowserVersion(ICoreWebView2EnvironmentOptions* _this, LPWSTR* value)
{
    *value = CoTaskMemAlloc(13 * sizeof(WCHAR));
    if (*value)
    {
        wcscpy_s(*value, 13, L"97.0.1072.69");
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_get_AllowSingleSignOnUsingOSPrimaryAccount(ICoreWebView2EnvironmentOptions* _this, BOOL* allow)
{
    *allow = TRUE;
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_CreateCoreWebView2EnvironmentCompleted(GenericObjectWithThis* _this, HRESULT hr, ICoreWebView2Environment* pCoreWebView2Environemnt)
{
    EPWeather* instance = _this ? _this->_this : NULL;
    if (!instance || !epw_Weather_IsCurrentBrowserCallback(_this))
    {
        return S_OK;
    }
    if (FAILED(hr) || !pCoreWebView2Environemnt)
    {
        printf("[Browser] Environment creation failed: 0x%08x.\n", (unsigned int)hr);
        epw_Weather_BrowserFailed(instance, FAILED(hr) ? hr : E_FAIL);
        return FAILED(hr) ? hr : E_FAIL;
    }

    if (instance->pCoreWebView2Environment)
    {
        instance->pCoreWebView2Environment->lpVtbl->Release(instance->pCoreWebView2Environment);
    }
    instance->pCoreWebView2Environment = pCoreWebView2Environemnt;
    instance->pCoreWebView2Environment->lpVtbl->AddRef(instance->pCoreWebView2Environment);

    HRESULT controllerHr = epw_Weather_CreateBrowserController(instance);
    if (FAILED(controllerHr))
    {
        printf("[Browser] Controller creation failed: 0x%08x.\n", (unsigned int)controllerHr);
        epw_Weather_BrowserFailed(instance, controllerHr);
    }
    return controllerHr;
}

HRESULT STDMETHODCALLTYPE _epw_Weather_NavigateToError(EPWeather* _this)
{
    _ep_Weather_ReboundBrowser(_this, TRUE);
    InterlockedExchange64(&_this->bIsNavigatingToError, TRUE);
    UINT dpi = GetDpiForWindow(_this->hWnd);
    DWORD dwTextScaleFactor = epw_Weather_GetTextScaleFactor(_this);
    DWORD dwZoomFactor = epw_Weather_GetZoomFactor(_this);
    int ch = MulDiv(MulDiv(MulDiv(EP_WEATHER_HEIGHT_ERROR, dpi, 96), dwTextScaleFactor, 100), dwZoomFactor, 100);
    RECT rc;
    GetClientRect(_this->hWnd, &rc);
    int w = MulDiv(MulDiv(MulDiv(EP_WEATHER_WIDTH, GetDpiForWindow(_this->hWnd), 96), dwTextScaleFactor, 100), dwZoomFactor, 100);
    if ((rc.bottom - rc.top != ch) || (rc.right - rc.left != w))
    {
        RECT rcAdj;
        SetRect(&rcAdj, 0, 0, w, ch);
        AdjustWindowRectExForDpi(&rcAdj, epw_Weather_GetStyle(_this) & ~WS_OVERLAPPED, epw_Weather_HasMenuBar(_this), epw_Weather_GetExtendedStyle(_this), dpi);
        SetWindowPos(_this->hWnd, NULL, 0, 0, rcAdj.right - rcAdj.left, rcAdj.bottom - rcAdj.top, SWP_NOMOVE | SWP_NOSENDCHANGING);
        HWND hNotifyWnd = InterlockedAdd64(&_this->hNotifyWnd, 0);
        if (hNotifyWnd)
        {
            InvalidateRect(hNotifyWnd, NULL, TRUE);
        }
    }
    if (_this->pCoreWebView2)
    {
        LPWSTR wszPageTitle = NULL;
        if (SUCCEEDED(_this->pCoreWebView2->lpVtbl->get_DocumentTitle(_this->pCoreWebView2, &wszPageTitle)))
        {
            BOOL bIsOnErrorPage = !_wcsicmp(wszPageTitle, _T(CLSID_EPWeather_TEXT) L"_ErrorPage");
            CoTaskMemFree(wszPageTitle);
            if (!bIsOnErrorPage) return epw_Weather_NavigateToString(_this, ep_weather_error_html);
            else
            {
                printf("[Browser] Already on the error page.\n");
                return S_OK;
            }
        }
    }
    return E_FAIL;
}

HRESULT STDMETHODCALLTYPE _epw_Weather_NavigateToProvider(EPWeather* _this)
{
    _ep_Weather_ReboundBrowser(_this, FALSE);
    HRESULT hr = S_OK;
    LONG64 dwProvider = InterlockedAdd64(&_this->dwProvider, 0);
    if (dwProvider == EP_WEATHER_PROVIDER_TEST)
    {
    }
    else if (dwProvider == EP_WEATHER_PROVIDER_OPEN_METEO)
    {
        InterlockedExchange64(&_this->bIsNavigatingToError, FALSE);
        _this->cntDataFetchAttempts = 0;
        if (_this->pCoreWebView2)
        {
            hr = epw_Weather_NavigateToString(_this, ep_weather_provider_open_meteo_html);
        }
        else
        {
            hr = E_FAIL;
        }
        if (FAILED(hr))
        {
            InterlockedExchange64(&_this->bBrowserBusy, FALSE);
        }
    }
    return hr;
}

HRESULT STDMETHODCALLTYPE _epw_Weather_ExecuteDataScript(EPWeather* _this)
{
    HRESULT hr = S_OK;
    LONG64 dwProvider = InterlockedAdd64(&_this->dwProvider, 0);
    if (dwProvider == EP_WEATHER_PROVIDER_TEST)
    {
    }
    else if (dwProvider == EP_WEATHER_PROVIDER_OPEN_METEO)
    {
        LPWSTR wszScriptData = malloc(sizeof(WCHAR) * EP_WEATHER_PROVIDER_OPEN_METEO_SCRIPT_LEN);
        if (wszScriptData)
        {
            WCHAR wszEscapedTerm[MAX_PATH * 12];
            WCHAR wszEscapedLanguage[MAX_PATH * 12];
            WCHAR wszApiHost[EP_QWEATHER_MAX_HOST] = { 0 };
            WCHAR wszEscapedApiHost[EP_QWEATHER_MAX_HOST * 3] = { 0 };
            DWORD cchEscapedTerm = ARRAYSIZE(wszEscapedTerm);
            DWORD cchEscapedLanguage = ARRAYSIZE(wszEscapedLanguage);
            DWORD cchEscapedApiHost = ARRAYSIZE(wszEscapedApiHost);
            HRESULT escapeHr = UrlEscapeW(
                _this->wszTerm,
                wszEscapedTerm,
                &cchEscapedTerm,
                URL_ESCAPE_URI_COMPONENT
            );
            if (SUCCEEDED(escapeHr))
            {
                escapeHr = UrlEscapeW(
                    _this->wszLanguage,
                    wszEscapedLanguage,
                    &cchEscapedLanguage,
                    URL_ESCAPE_URI_COMPONENT
                );
            }
            if (SUCCEEDED(escapeHr))
            {
                EPQWeather_IsConfigured(wszApiHost, ARRAYSIZE(wszApiHost));
                escapeHr = UrlEscapeW(
                    wszApiHost,
                    wszEscapedApiHost,
                    &cchEscapedApiHost,
                    URL_ESCAPE_URI_COMPONENT
                );
            }
            if (SUCCEEDED(escapeHr))
            {
                swprintf_s(
                    wszScriptData,
                    EP_WEATHER_PROVIDER_OPEN_METEO_SCRIPT_LEN,
                    ep_weather_provider_open_meteo_script,
                    wszEscapedTerm,
                    wszEscapedLanguage,
                    (int)InterlockedAdd64(&_this->dwTemperatureUnit, 0),
                    (int)InterlockedAdd64(&_this->cbx, 0),
                    (int)InterlockedAdd64(&_this->cby, 0),
                    wszEscapedApiHost
                );
            }
            else
            {
                wszScriptData[0] = 0;
                hr = escapeHr;
            }
            SecureZeroMemory(wszApiHost, sizeof(wszApiHost));
            if (_this->pCoreWebView2)
            {
                GenericObjectWithThis* pCoreWebView2ExecuteScriptCompletedHandler =
                    GenericObjectWithThis_MakeAndInitialize(&EPWeather_ICoreWebView2ExecuteScriptCompletedHandlerVtbl, _this, L"pCoreWebView2ExecuteScriptCompletedHandler");
                if (!pCoreWebView2ExecuteScriptCompletedHandler)
                {
                    hr = E_FAIL;
                }
                else if (SUCCEEDED(hr))
                {
                    hr = _this->pCoreWebView2->lpVtbl->ExecuteScript(_this->pCoreWebView2, wszScriptData, pCoreWebView2ExecuteScriptCompletedHandler);
                }
                else
                {
                    pCoreWebView2ExecuteScriptCompletedHandler->lpVtbl->Release(pCoreWebView2ExecuteScriptCompletedHandler);
                }
            }
            else
            {
                hr = E_FAIL;
            }
            if (FAILED(hr))
            {
                InterlockedExchange64(&_this->bBrowserBusy, FALSE);
            }
            free(wszScriptData);
        }
        else
        {
            hr = E_OUTOFMEMORY;
        }
    }
    return hr;
}

HRESULT STDMETHODCALLTYPE _ep_Weather_StartResize(EPWeather* _this)
{
    _this->cntResizeWindow = 0;
    SetTimer(_this->hWnd, EP_WEATHER_TIMER_RESIZE_WINDOW, EP_WEATHER_TIMER_RESIZE_WINDOW_DELAY, NULL);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE _ep_Weather_ReboundBrowser(EPWeather* _this, LONG64 dwType)
{
    UINT dpi = GetDpiForWindow(_this->hWnd);
    RECT bounds;
    DWORD dwDevMode = InterlockedAdd64(&_this->dwDevMode, 0);
    LONG64 dwProvider = InterlockedAdd64(&_this->dwProvider, 0);
    if (dwType || dwDevMode || dwProvider == EP_WEATHER_PROVIDER_OPEN_METEO)
    {
        GetClientRect(_this->hWnd, &bounds);
    }
    else
    {
        DWORD dwTextScaleFactor = epw_Weather_GetTextScaleFactor(_this);
        DWORD dwZoomFactor = epw_Weather_GetZoomFactor(_this);
        bounds.left = 0 - MulDiv(MulDiv(MulDiv(181, dpi, 96), dwTextScaleFactor, 100), dwZoomFactor, 100);
        bounds.top = 0 - MulDiv(MulDiv(MulDiv(152, dpi, 96), dwTextScaleFactor, 100), dwZoomFactor, 100);
        bounds.right = MulDiv(MulDiv(MulDiv((!InterlockedAdd64(&_this->dwTextDir, 0) ? 1333 : 705), dpi, 96), dwTextScaleFactor, 100), dwZoomFactor, 100);// 5560;
        bounds.bottom = MulDiv(MulDiv(MulDiv(600, dpi, 96), dwTextScaleFactor, 100), dwZoomFactor, 100);// 15600;
    }
    if (_this->pCoreWebView2Controller)
    {
        _this->pCoreWebView2Controller->lpVtbl->put_Bounds(_this->pCoreWebView2Controller, bounds);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_CreateCoreWebView2ControllerCompleted(GenericObjectWithThis* _this2, HRESULT hr, ICoreWebView2Controller* pCoreWebView2Controller)
{
    EPWeather* _this = _this2 ? _this2->_this : NULL; // GetWindowLongPtrW(FindWindowW(_T(EPW_WEATHER_CLASSNAME), NULL), GWLP_USERDATA);
    if (!_this || !epw_Weather_IsCurrentBrowserCallback(_this2))
    {
        return S_OK;
    }
    if (FAILED(hr) || !pCoreWebView2Controller)
    {
        printf("[Browser] Controller creation callback failed: 0x%08x.\n", (unsigned int)hr);
        epw_Weather_BrowserFailed(_this, FAILED(hr) ? hr : E_FAIL);
        return FAILED(hr) ? hr : E_FAIL;
    }
    if (!_this->pCoreWebView2Controller)
    {
        _this->pCoreWebView2Controller = pCoreWebView2Controller;
        _this->pCoreWebView2Controller->lpVtbl->AddRef(_this->pCoreWebView2Controller);
        hr = _this->pCoreWebView2Controller->lpVtbl->get_CoreWebView2(_this->pCoreWebView2Controller, &_this->pCoreWebView2);
        if (FAILED(hr) || !_this->pCoreWebView2)
        {
            printf("[Browser] Failed to get CoreWebView2: 0x%08x.\n", (unsigned int)hr);
            _this->pCoreWebView2Controller->lpVtbl->Close(_this->pCoreWebView2Controller);
            _this->pCoreWebView2Controller->lpVtbl->Release(_this->pCoreWebView2Controller);
            _this->pCoreWebView2Controller = NULL;
            epw_Weather_BrowserFailed(_this, FAILED(hr) ? hr : E_FAIL);
            return hr;
        }
        _this->pCoreWebView2Controller->lpVtbl->put_ZoomFactor(_this->pCoreWebView2Controller, InterlockedAdd64(&_this->dwZoomFactor, 0) / 100.0);
    }

    _ep_Weather_ReboundBrowser(_this, FALSE);

    ICoreWebView2Controller2* pCoreWebView2Controller2 = NULL;
    _this->pCoreWebView2Controller->lpVtbl->QueryInterface(_this->pCoreWebView2Controller, &IID_ICoreWebView2Controller2, &pCoreWebView2Controller2);
    if (pCoreWebView2Controller2)
    {
        COREWEBVIEW2_COLOR transparent;
        transparent.A = 0;
        transparent.R = 0;
        transparent.G = 0;
        transparent.B = 0;
        pCoreWebView2Controller2->lpVtbl->put_DefaultBackgroundColor(pCoreWebView2Controller2, transparent);
        pCoreWebView2Controller2->lpVtbl->Release(pCoreWebView2Controller2);
    }

    ICoreWebView2Settings* pCoreWebView2Settings = NULL;
    _this->pCoreWebView2->lpVtbl->get_Settings(_this->pCoreWebView2, &pCoreWebView2Settings);
    if (pCoreWebView2Settings)
    {
        pCoreWebView2Settings->lpVtbl->put_IsWebMessageEnabled(pCoreWebView2Settings, TRUE);
        ICoreWebView2Settings6* pCoreWebView2Settings6 = NULL;
        pCoreWebView2Settings->lpVtbl->QueryInterface(pCoreWebView2Settings, &IID_ICoreWebView2Settings6, &pCoreWebView2Settings6);
        if (pCoreWebView2Settings6)
        {
            DWORD dwDevMode = InterlockedAdd64(&_this->dwDevMode, 0);
            pCoreWebView2Settings6->lpVtbl->put_AreDevToolsEnabled(pCoreWebView2Settings6, dwDevMode);
            pCoreWebView2Settings6->lpVtbl->put_AreDefaultContextMenusEnabled(pCoreWebView2Settings6, dwDevMode);
            pCoreWebView2Settings6->lpVtbl->put_IsStatusBarEnabled(pCoreWebView2Settings6, FALSE);
            pCoreWebView2Settings6->lpVtbl->put_IsZoomControlEnabled(pCoreWebView2Settings6, FALSE);
            pCoreWebView2Settings6->lpVtbl->put_IsGeneralAutofillEnabled(pCoreWebView2Settings6, FALSE);
            pCoreWebView2Settings6->lpVtbl->put_IsPasswordAutosaveEnabled(pCoreWebView2Settings6, FALSE);
            pCoreWebView2Settings6->lpVtbl->put_IsPinchZoomEnabled(pCoreWebView2Settings6, FALSE);
            pCoreWebView2Settings6->lpVtbl->put_IsSwipeNavigationEnabled(pCoreWebView2Settings6, FALSE);
            pCoreWebView2Settings6->lpVtbl->put_AreBrowserAcceleratorKeysEnabled(pCoreWebView2Settings6, dwDevMode);
            pCoreWebView2Settings6->lpVtbl->put_AreDefaultScriptDialogsEnabled(pCoreWebView2Settings6, dwDevMode);
            pCoreWebView2Settings6->lpVtbl->Release(pCoreWebView2Settings6);
        }
        pCoreWebView2Settings->lpVtbl->Release(pCoreWebView2Settings);
    }

    LONG64 dwDarkMode = InterlockedAdd64(&_this->g_darkModeEnabled, 0);
    epw_Weather_SetDarkMode(_this, dwDarkMode, FALSE);

    _this->pCoreWebView2NavigationStartingEventHandler =
        GenericObjectWithThis_MakeAndInitialize(&EPWeather_ICoreWebView2NavigationStartingEventHandlerVtbl, _this, L"pCoreWebView2NavigationStartingEventHandler");
    if (_this->pCoreWebView2NavigationStartingEventHandler)
        _this->pCoreWebView2->lpVtbl->add_NavigationStarting(_this->pCoreWebView2, _this->pCoreWebView2NavigationStartingEventHandler, &_this->tkOnNavigationStarting);

    _this->pCoreWebView2NavigationCompletedEventHandler =
        GenericObjectWithThis_MakeAndInitialize(&EPWeather_ICoreWebView2NavigationCompletedEventHandlerVtbl, _this, L"pCoreWebView2NavigationCompletedEventHandler");
    if (_this->pCoreWebView2NavigationCompletedEventHandler)
        _this->pCoreWebView2->lpVtbl->add_NavigationCompleted(_this->pCoreWebView2, _this->pCoreWebView2NavigationCompletedEventHandler, &_this->tkOnNavigationCompleted);

    _this->pCoreWebView2PermissionRequestedEventHandler =
        GenericObjectWithThis_MakeAndInitialize(&EPWeather_ICoreWebView2PermissionRequestedEventHandlerVtbl, _this, L"pCoreWebView2PermissionRequestedEventHandler");
    if (_this->pCoreWebView2PermissionRequestedEventHandler)
        _this->pCoreWebView2->lpVtbl->add_PermissionRequested(_this->pCoreWebView2, _this->pCoreWebView2PermissionRequestedEventHandler, &_this->tkOnPermissionRequested);

    WCHAR qweatherHost[EP_QWEATHER_MAX_HOST] = { 0 };
    BOOL qweatherConfigured = EPQWeather_IsConfigured(
        qweatherHost,
        ARRAYSIZE(qweatherHost)
    );
    if (qweatherConfigured)
    {
        HRESULT fetchFilterHr = _this->pCoreWebView2->lpVtbl->AddWebResourceRequestedFilter(
            _this->pCoreWebView2,
            L"https://*/*",
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH
        );
        HRESULT xhrFilterHr = _this->pCoreWebView2->lpVtbl->AddWebResourceRequestedFilter(
            _this->pCoreWebView2,
            L"https://*/*",
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST
        );
        if (SUCCEEDED(fetchFilterHr) || SUCCEEDED(xhrFilterHr))
        {
            _this->pCoreWebView2WebResourceRequestedEventHandler =
                GenericObjectWithThis_MakeAndInitialize(
                    &EPWeather_ICoreWebView2WebResourceRequestedEventHandlerVtbl,
                    _this,
                    L"pCoreWebView2WebResourceRequestedEventHandler"
                );
            if (_this->pCoreWebView2WebResourceRequestedEventHandler)
            {
                _this->pCoreWebView2->lpVtbl->add_WebResourceRequested(
                    _this->pCoreWebView2,
                    _this->pCoreWebView2WebResourceRequestedEventHandler,
                    &_this->tkOnWebResourceRequested
                );
            }
        }
        else
        {
            printf("[QWeather] Web request filtering is unavailable; authenticated requests will use the fallback provider.\n");
        }
    }
    else
    {
        printf("[QWeather] Credentials are not configured; WebView2 request filtering is disabled.\n");
    }
    SecureZeroMemory(qweatherHost, sizeof(qweatherHost));

    _this->pCoreWebView2WebMessageReceivedEventHandler =
        GenericObjectWithThis_MakeAndInitialize(
            &EPWeather_ICoreWebView2WebMessageReceivedEventHandlerVtbl,
            _this,
            L"pCoreWebView2WebMessageReceivedEventHandler"
        );
    if (_this->pCoreWebView2WebMessageReceivedEventHandler)
    {
        _this->pCoreWebView2->lpVtbl->add_WebMessageReceived(
            _this->pCoreWebView2,
            _this->pCoreWebView2WebMessageReceivedEventHandler,
            &_this->tkOnWebMessageReceived
        );
    }

    _this->pCoreWebView2Controller->lpVtbl->put_IsVisible(
        _this->pCoreWebView2Controller,
        IsWindowVisible(_this->hWnd)
    );
    InterlockedExchange64(&_this->bBrowserRestarting, FALSE);
    _this->dwBrowserRestartFailures = 0;
    _epw_Weather_NavigateToProvider(_this);

    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_CallDevToolsProtocolMethodCompleted(GenericObjectWithThis* _this, HRESULT errorCode, LPCWSTR returnObjectAsJson)
{
    EPWeather* EPWeather_Instance = _this->_this;
    if (EPWeather_Instance &&
        epw_Weather_IsCurrentBrowserCallback(_this) &&
        !wcscmp(_this->pName, L"pCoreWebView2CallDevToolsProtocolMethodCompletedHandler_WithRefresh"))
    {
        wprintf(L"[CallDevToolsProtocolMethodCompleted] 0x%x [[ %s ]]\n", errorCode, returnObjectAsJson);
        PostMessageW(EPWeather_Instance->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0);
        LPWSTR uri = NULL;
        if (EPWeather_Instance->pCoreWebView2)
        {
            if (SUCCEEDED(EPWeather_Instance->pCoreWebView2->lpVtbl->get_Source(EPWeather_Instance->pCoreWebView2, &uri)))
            {
                if (wcscmp(L"about:blank", uri ? uri : L""))
                {
                    SetTimer(EPWeather_Instance->hWnd, EP_WEATHER_TIMER_REQUEST_REFRESH, EP_WEATHER_TIMER_REQUEST_REFRESH_DELAY, NULL);
                }
                CoTaskMemFree(uri);
            }
        }
    }
    _this->lpVtbl->Release(_this);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_WebResourceRequested(
    GenericObjectWithThis* _this2,
    ICoreWebView2* sender,
    ICoreWebView2WebResourceRequestedEventArgs* args
)
{
    EPWeather* _this = _this2 ? _this2->_this : NULL;
    if (!_this || !args || !epw_Weather_IsCurrentBrowserCallback(_this2) ||
        sender != _this->pCoreWebView2)
    {
        return S_OK;
    }

    ICoreWebView2WebResourceRequest* request = NULL;
    LPWSTR uri = NULL;
    LPWSTR method = NULL;
    ICoreWebView2HttpRequestHeaders* headers = NULL;
    WCHAR apiHost[EP_QWEATHER_MAX_HOST] = { 0 };
    WCHAR apiKey[EP_QWEATHER_MAX_API_KEY] = { 0 };

    if (SUCCEEDED(args->lpVtbl->get_Request(args, &request)) && request &&
        SUCCEEDED(request->lpVtbl->get_Uri(request, &uri)) && uri &&
        SUCCEEDED(request->lpVtbl->get_Method(request, &method)) && method &&
        !_wcsicmp(method, L"GET") &&
        SUCCEEDED(EPQWeather_ReadApiHost(apiHost, ARRAYSIZE(apiHost))) && apiHost[0] &&
        EPQWeather_IsRequestUriForHost(uri, apiHost) &&
        SUCCEEDED(EPQWeather_ReadApiKey(apiKey, ARRAYSIZE(apiKey))) && apiKey[0] &&
        SUCCEEDED(request->lpVtbl->get_Headers(request, &headers)) && headers)
    {
        HRESULT headerHr = headers->lpVtbl->SetHeader(headers, L"X-QW-Api-Key", apiKey);
        if (FAILED(headerHr))
        {
            printf("[QWeather] Failed to attach the API authentication header: 0x%08x.\n", (unsigned int)headerHr);
        }
    }

    SecureZeroMemory(apiKey, sizeof(apiKey));
    SecureZeroMemory(apiHost, sizeof(apiHost));
    if (headers) headers->lpVtbl->Release(headers);
    if (method) CoTaskMemFree(method);
    if (uri) CoTaskMemFree(uri);
    if (request) request->lpVtbl->Release(request);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_WebMessageReceived(
    GenericObjectWithThis* _this2,
    ICoreWebView2* sender,
    ICoreWebView2WebMessageReceivedEventArgs* args
)
{
    EPWeather* _this = _this2 ? _this2->_this : NULL;
    if (!_this || !args || !epw_Weather_IsCurrentBrowserCallback(_this2) ||
        sender != _this->pCoreWebView2)
    {
        return S_OK;
    }

    LPWSTR message = NULL;
    if (SUCCEEDED(args->lpVtbl->TryGetWebMessageAsString(args, &message)) && message)
    {
        if (!_wcsicmp(message, L"ep_weather_updated") &&
            InterlockedCompareExchange64(&_this->bDataCapturePending, TRUE, FALSE) == FALSE)
        {
            PostMessageW(_this->hWnd, EP_WEATHER_WM_CAPTURE_DATA, 0, 0);
        }
        CoTaskMemFree(message);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_NavigationStarting(GenericObjectWithThis* _this2, ICoreWebView2* pCoreWebView2, ICoreWebView2NavigationStartingEventArgs* pCoreWebView2NavigationStartingEventArgs)
{
    EPWeather* _this = _this2 ? _this2->_this : NULL; // GetWindowLongPtrW(FindWindowW(_T(EPW_WEATHER_CLASSNAME), NULL), GWLP_USERDATA);
    if (!_this ||
        !epw_Weather_IsCurrentBrowserCallback(_this2) ||
        pCoreWebView2 != _this->pCoreWebView2)
    {
        return S_OK;
    }
    LPWSTR wszUri = NULL;
    pCoreWebView2NavigationStartingEventArgs->lpVtbl->get_Uri(pCoreWebView2NavigationStartingEventArgs, &wszUri);
    if (wszUri)
    {
        BOOL bIsEmbeddedNavigation =
            !_wcsnicmp(wszUri, L"data:text/html", 14) &&
            InterlockedCompareExchange64(&_this->bAllowEmbeddedNavigation, FALSE, TRUE) == TRUE;
        if (!_wcsicmp(wszUri, L"epweather://refresh"))
        {
            pCoreWebView2NavigationStartingEventArgs->lpVtbl->put_Cancel(pCoreWebView2NavigationStartingEventArgs, TRUE);
            PostMessageW(_this->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0);
        }
        else if (!bIsEmbeddedNavigation && _wcsicmp(wszUri, L"about:blank"))
        {
            static const LPCWSTR allowedExternalUrls[] = {
                L"https://www.qweather.com/",
                L"https://developer.qweather.com/",
                L"https://open-meteo.com/",
                L"https://www.esri.com/",
                L"https://photon.komoot.io/"
            };
            pCoreWebView2NavigationStartingEventArgs->lpVtbl->put_Cancel(
                pCoreWebView2NavigationStartingEventArgs,
                TRUE
            );
            for (DWORD index = 0; index < ARRAYSIZE(allowedExternalUrls); ++index)
            {
                size_t prefixLength = wcslen(allowedExternalUrls[index]);
                if (!_wcsnicmp(wszUri, allowedExternalUrls[index], prefixLength))
                {
                    ShellExecuteW(NULL, L"open", wszUri, NULL, NULL, SW_SHOWNORMAL);
                    break;
                }
            }
        }
        CoTaskMemFree(wszUri);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_NavigationCompleted(GenericObjectWithThis* _this2, ICoreWebView2* pCoreWebView2, ICoreWebView2NavigationCompletedEventArgs* pCoreWebView2NavigationCompletedEventArgs)
{
    EPWeather* _this = _this2 ? _this2->_this : NULL; // GetWindowLongPtrW(FindWindowW(_T(EPW_WEATHER_CLASSNAME), NULL), GWLP_USERDATA);
    if (!_this ||
        !epw_Weather_IsCurrentBrowserCallback(_this2) ||
        pCoreWebView2 != _this->pCoreWebView2)
    {
        return S_OK;
    }
    COREWEBVIEW2_WEB_ERROR_STATUS dwStatus = COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN;
    pCoreWebView2NavigationCompletedEventArgs->lpVtbl->get_WebErrorStatus(pCoreWebView2NavigationCompletedEventArgs, &dwStatus);
    if (dwStatus == COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED) return S_OK;
    BOOL bIsSuccess = FALSE;
    pCoreWebView2NavigationCompletedEventArgs->lpVtbl->get_IsSuccess(pCoreWebView2NavigationCompletedEventArgs, &bIsSuccess);
    if (bIsSuccess)
    {
        BOOL bIsNavigatingToError = InterlockedAdd64(&_this->bIsNavigatingToError, 0);
        if (bIsNavigatingToError)
        {
            InterlockedExchange64(&_this->bIsNavigatingToError, FALSE);
            InterlockedExchange64(&_this->bBrowserBusy, FALSE);
        }
        else
        {
            //_epw_Weather_ExecuteDataScript(_this);
            SetTimer(_this->hWnd, EP_WEATHER_TIMER_EXECUTEDATASCRIPT, EP_WEATHER_TIMER_EXECUTEDATASCRIPT_DELAY, NULL);
        }
    }
    else
    {
        printf("[Browser] Navigation completed with error, showing error page.\n");
        _epw_Weather_NavigateToError(_this);
    }
    _this->pCoreWebView2Controller->lpVtbl->put_IsVisible(_this->pCoreWebView2Controller, FALSE);
    _this->pCoreWebView2Controller->lpVtbl->put_IsVisible(
        _this->pCoreWebView2Controller,
        IsWindowVisible(_this->hWnd)
    );
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_ExecuteScriptCompleted(GenericObjectWithThis* _this2, HRESULT hr, LPCWSTR pResultObjectAsJson)
{
    EPWeather* _this = _this2 ? _this2->_this : NULL; // GetWindowLongPtrW(FindWindowW(_T(EPW_WEATHER_CLASSNAME), NULL), GWLP_USERDATA);
    if (!_this || !epw_Weather_IsCurrentBrowserCallback(_this2))
    {
        if (_this2)
        {
            _this2->lpVtbl->Release(_this2);
        }
        return S_OK;
    }
    if (FAILED(hr) || !pResultObjectAsJson)
    {
        printf("[Browser] Weather script failed: 0x%08x.\n", (unsigned int)hr);
        _epw_Weather_NavigateToError(_this);
        _this2->lpVtbl->Release(_this2);
        return S_OK;
    }
    if (_this)
    {
        BOOL bOk = FALSE;
        LONG64 dwProvider = InterlockedAdd64(&_this->dwProvider, 0);
        if (dwProvider == EP_WEATHER_PROVIDER_OPEN_METEO)
        {
            if (!_wcsicmp(pResultObjectAsJson, L"\"ep_pending\""))
            {
                DWORD attempts = ++_this->cntDataFetchAttempts;
                if (attempts <= EP_WEATHER_OPEN_METEO_ATTEMPT_LIMIT)
                {
                    SetTimer(_this->hWnd, EP_WEATHER_TIMER_EXECUTEDATASCRIPT, EP_WEATHER_TIMER_OPEN_METEO_RETRY_DELAY, NULL);
                    _this2->lpVtbl->Release(_this2);
                    return S_OK;
                }
                printf("[Weather] Open-Meteo request timed out after %u attempts.\n", attempts);
                _epw_Weather_NavigateToError(_this);
                _this2->lpVtbl->Release(_this2);
                return S_OK;
            }
            else if (!_wcsicmp(pResultObjectAsJson, L"\"ep_error\""))
            {
                printf("[Weather] Open-Meteo request failed.\n");
                _epw_Weather_NavigateToError(_this);
                _this2->lpVtbl->Release(_this2);
                return S_OK;
            }
            else
            {
                //wprintf(L"%s\n", pResultObjectAsJson);

                epw_Weather_LockData(_this);

                WCHAR* wszTextDir = pResultObjectAsJson + 1;
                if (wszTextDir)
                {
                    WCHAR* wszLegacyHeight = wcschr(wszTextDir, L'#');
                    if (wszLegacyHeight)
                    {
                        wszLegacyHeight[0] = 0;
                        wszLegacyHeight++;
                        InterlockedExchange64(&_this->dwTextDir, wcsstr(wszTextDir, L"rtl"));
                        WCHAR* wszTemperature = wcschr(wszLegacyHeight, L'#');
                        if (wszTemperature)
                        {
                            wszTemperature[0] = 0;
                            wszTemperature++;
                            WCHAR* wszUnit = wcschr(wszTemperature, L'#');
                            if (wszUnit)
                            {
                                wszUnit[0] = 0;
                                wszUnit++;
                                WCHAR* wszCondition = wcschr(wszUnit, L'#');
                                if (wszCondition)
                                {
                                    wszCondition[0] = 0;
                                    wszCondition++;
                                    WCHAR* wszLocation = wcschr(wszCondition, L'#');
                                    if (wszLocation)
                                    {
                                        wszLocation[0] = 0;
                                        wszLocation++;
                                        WCHAR* pImage = wcschr(wszLocation, L'#');
                                        if (pImage)
                                        {
                                            pImage[0] = 0;
                                            pImage++;
                                            WCHAR* pTerm = wcschr(pImage, L'"');
                                            if (pTerm)
                                            {
                                                pTerm[0] = 0;
                                                if (_this->wszTemperature)
                                                {
                                                    free(_this->wszTemperature);
                                                }
                                                if (_this->wszUnit)
                                                {
                                                    free(_this->wszUnit);
                                                }
                                                if (_this->wszCondition)
                                                {
                                                    free(_this->wszCondition);
                                                }
                                                if (_this->pImage)
                                                {
                                                    free(_this->pImage);
                                                }
                                                if (_this->wszLocation)
                                                {
                                                    free(_this->wszLocation);
                                                }
                                                _this->cbTemperature = (wcslen(wszTemperature) + 1) * sizeof(WCHAR);
                                                _this->wszTemperature = malloc(_this->cbTemperature);
                                                _this->cbUnit = (wcslen(wszUnit) + 1) * sizeof(WCHAR);
                                                _this->wszUnit = malloc(_this->cbUnit);
                                                _this->cbCondition = (wcslen(wszCondition) + 1) * sizeof(WCHAR);
                                                _this->wszCondition = malloc(_this->cbCondition);
                                                _this->cbImage = wcslen(pImage) / 2;
                                                _this->pImage = malloc(_this->cbImage);
                                                _this->cbLocation = (wcslen(wszLocation) + 1) * sizeof(WCHAR);
                                                _this->wszLocation = malloc(_this->cbLocation);
                                                if (_this->wszTemperature && _this->wszUnit && _this->wszCondition && _this->pImage && _this->wszLocation)
                                                {
                                                    wcscpy_s(_this->wszTemperature, _this->cbTemperature / 2, wszTemperature);
                                                    wcscpy_s(_this->wszUnit, _this->cbUnit / 2, wszUnit);
                                                    wcscpy_s(_this->wszCondition, _this->cbCondition / 2, wszCondition);
                                                    wcscpy_s(_this->wszLocation, _this->cbLocation / 2, wszLocation);

                                                    for (unsigned int i = 0; i < _this->cbImage * 2; i = i + 2)
                                                    {
                                                        WCHAR tmp[3];
                                                        tmp[0] = pImage[i];
                                                        tmp[1] = pImage[i + 1];
                                                        tmp[2] = 0;
                                                        _this->pImage[i / 2] = wcstol(tmp, NULL, 16);
                                                    }

                                                    bOk = TRUE;
                                                }
                                                UINT dpi = GetDpiForWindow(_this->hWnd);
                                                DWORD dwTextScaleFactor = epw_Weather_GetTextScaleFactor(_this);
                                                DWORD dwZoomFactor = epw_Weather_GetZoomFactor(_this);
                                                // The HTML page owns scrolling. Keep the native flyout at a fixed viewport size;
                                                // the legacy height field is retained only for response-format compatibility.
                                                int ch = MulDiv(MulDiv(MulDiv(EP_WEATHER_HEIGHT, dpi, 96), dwTextScaleFactor, 100), dwZoomFactor, 100);
                                                RECT rc;
                                                GetClientRect(_this->hWnd, &rc);
                                                int w = MulDiv(MulDiv(MulDiv(EP_WEATHER_WIDTH, GetDpiForWindow(_this->hWnd), 96), dwTextScaleFactor, 100), dwZoomFactor, 100);
                                                if ((rc.bottom - rc.top != ch) || (rc.right - rc.left != w))
                                                {
                                                    RECT rcAdj;
                                                    SetRect(&rcAdj, 0, 0, w, ch);
                                                    AdjustWindowRectExForDpi(&rcAdj, epw_Weather_GetStyle(_this) & ~WS_OVERLAPPED, epw_Weather_HasMenuBar(_this), epw_Weather_GetExtendedStyle(_this), dpi);
                                                    SetWindowPos(_this->hWnd, NULL, 0, 0, rcAdj.right - rcAdj.left, rcAdj.bottom - rcAdj.top, SWP_NOMOVE | SWP_NOSENDCHANGING);
                                                    _ep_Weather_ReboundBrowser(_this, FALSE);
                                                    HWND hNotifyWnd = InterlockedAdd64(&_this->hNotifyWnd, 0);
                                                    if (hNotifyWnd)
                                                    {
                                                        InvalidateRect(hNotifyWnd, NULL, TRUE);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                epw_Weather_UnlockData(_this);
            }
        }

        if (!bOk)
        {
            printf("[General] Navigating to error page.\n");
            _epw_Weather_NavigateToError(_this);
        }
        else
        {
            GetLocalTime(&stLastUpdate);
            _this->cntDataFetchAttempts = 0;
            HWND hGUI = FindWindowW(L"ExplorerPatcher_GUI_" _T(EP_CLSID), NULL);
            if (hGUI) InvalidateRect(hGUI, NULL, TRUE);
            InterlockedExchange64(&_this->bBrowserBusy, FALSE);
            printf("[General] Fetched data, requesting redraw.\n");
            SetTimer(_this->hWnd, EP_WEATHER_TIMER_REQUEST_REPAINT, EP_WEATHER_TIMER_REQUEST_REPAINT_DELAY, NULL);
        }
    }
    _this2->lpVtbl->Release(_this2);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE ICoreWebView2_PermissionRequested(GenericObjectWithThis* _this2, ICoreWebView2* pCoreWebView2, ICoreWebView2PermissionRequestedEventArgs* pCoreWebView2PermissionRequestedEventArgs)
{
    if (!_this2 ||
        !_this2->_this ||
        !epw_Weather_IsCurrentBrowserCallback(_this2) ||
        pCoreWebView2 != _this2->_this->pCoreWebView2)
    {
        return S_OK;
    }
    COREWEBVIEW2_PERMISSION_KIND kind;
    pCoreWebView2PermissionRequestedEventArgs->lpVtbl->get_PermissionKind(pCoreWebView2PermissionRequestedEventArgs, &kind);
    if (kind == COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION)
    {
        DWORD r = InterlockedAdd64(&_this2->_this->dwGeolocationMode, 0);
        printf("[Permissions] Geolocation permission request: %d\n", r);
        pCoreWebView2PermissionRequestedEventArgs->lpVtbl->put_State(pCoreWebView2PermissionRequestedEventArgs, r ? COREWEBVIEW2_PERMISSION_STATE_ALLOW : COREWEBVIEW2_PERMISSION_STATE_DENY);
    }
    return S_OK;
}

ULONG STDMETHODCALLTYPE epw_Weather_AddRef(EPWeather* _this)
{
    ULONG value = InterlockedIncrement64(&(_this->cbCount));
    printf("[General] AddRef: %d\n", value);
    return value;
}

ULONG STDMETHODCALLTYPE epw_Weather_Release(EPWeather* _this)
{
    ULONG value = InterlockedDecrement64(&(_this->cbCount));
    printf("[General] Release: %d\n", value);

    if (value == 0)
    {
        if (_this->hMainThread)
        {
            if (_this->hSignalExitMainThread)
            {
                SetEvent(_this->hSignalExitMainThread);
                printf("[General] Waiting for main thread to exit.\n");
                WaitForSingleObject(_this->hMainThread, INFINITE);
            }
            CloseHandle(_this->hMainThread);
            if (_this->hSignalExitMainThread)
            {
                CloseHandle(_this->hSignalExitMainThread);
            }
        }
        if (_this->hInitializeEvent)
        {
            CloseHandle(_this->hInitializeEvent);
        }

        if (_this->hMutexData)
        {
            CloseHandle(_this->hMutexData);
        }

        if (_this->hUxtheme)
        {
            FreeLibrary(_this->hUxtheme);
        }
        if (_this->hShlwapi)
        {
            FreeLibrary(_this->hShlwapi);
        }
        if (_this->hKCUAccessibility)
        {
            RegCloseKey(_this->hKCUAccessibility);
        }
        if (_this->hKLMAccessibility)
        {
            RegCloseKey(_this->hKLMAccessibility);
        }
        if (_this->hSignalOnAccessibilitySettingsChangedFromHKCU)
        {
            CloseHandle(_this->hSignalOnAccessibilitySettingsChangedFromHKCU);
        }
        if (_this->hSignalOnAccessibilitySettingsChangedFromHKLM)
        {
            CloseHandle(_this->hSignalOnAccessibilitySettingsChangedFromHKLM);
        }
        if (_this->hSignalKillSwitch)
        {
            CloseHandle(_this->hSignalKillSwitch);
        }

        FREE(_this);
        LONG dwOutstandingObjects = InterlockedDecrement(&epw_OutstandingObjects);
        LONG dwOutstandingLocks = InterlockedAdd(&epw_LockCount, 0);
        if (!dwOutstandingObjects && !dwOutstandingLocks)
        {
        }
        printf("[General] Outstanding objects: %d, outstanding locks: %d\n", dwOutstandingObjects, dwOutstandingLocks);

#if defined(DEBUG) | defined(_DEBUG)
        printf("\nDumping memory leaks:\n");
        _CrtSetReportMode(_CRT_WARN, _CRTDBG_MODE_FILE);
        _CrtSetReportFile(_CRT_WARN, _CRTDBG_FILE_STDOUT);
        _CrtSetReportMode(_CRT_ERROR, _CRTDBG_MODE_FILE);
        _CrtSetReportFile(_CRT_ERROR, _CRTDBG_FILE_STDOUT);
        _CrtSetReportMode(_CRT_ASSERT, _CRTDBG_MODE_FILE);
        _CrtSetReportFile(_CRT_ASSERT, _CRTDBG_FILE_STDOUT);
        _CrtDumpMemoryLeaks();
        printf("Memory dump complete.\n\n");
#endif

        //TerminateProcess(GetCurrentProcess(), 0);

        return(0);
    }
    return value;
}

HRESULT STDMETHODCALLTYPE epw_Weather_QueryInterface(EPWeather* _this, REFIID riid, void** ppv)
{
    if (!IsEqualIID(riid, &IID_IEPWeather) &&
        !IsEqualIID(riid, &IID_IUnknown))
    {
        *ppv = 0;
        return(E_NOINTERFACE);
    }
    *ppv = _this;
    _this->lpVtbl->AddRef(_this);
    return(NOERROR);
}

HRESULT STDMETHODCALLTYPE epw_Weather_About(EPWeather* _this, HWND hWnd)
{
    HRESULT hr = NOERROR;

    if (SUCCEEDED(hr))
    {
        hr = !_this ? (E_NOINTERFACE) : hr;
    }
    if (SUCCEEDED(hr))
    {
        wchar_t text[MAX_PATH];

        DWORD dwLeftMost = 0;
        DWORD dwSecondLeft = 0;
        DWORD dwSecondRight = 0;
        DWORD dwRightMost = 0;

        QueryVersionInfo(epw_hModule, VS_VERSION_INFO, &dwLeftMost, &dwSecondLeft, &dwSecondRight, &dwRightMost);

        swprintf_s(text, MAX_PATH, L"ExplorerPatcher Weather Host\r\n\r\nVersion %d.%d.%d.%d", dwLeftMost, dwSecondLeft, dwSecondRight, dwRightMost);

        MessageBoxW(hWnd, text, _T("ExplorerPatcher Weather Host"), MB_ICONINFORMATION);
    }

    return hr;
}

LRESULT CALLBACK epw_Weather_WindowProc(_In_ HWND hWnd, _In_ UINT uMsg, _In_ WPARAM wParam, _In_ LPARAM lParam)
{
    EPWeather* _this = NULL;
    if (uMsg == WM_CREATE)
    {
        CREATESTRUCT* pCreate = (CREATESTRUCT*)(lParam);
        _this = (int*)(pCreate->lpCreateParams);
        SetWindowLongPtrW(hWnd, GWLP_USERDATA, (LONG_PTR)_this);
    }
    else
    {
        LONG_PTR ptr = GetWindowLongPtrW(hWnd, GWLP_USERDATA);
        _this = (EPWeather*)(ptr);
    }
    if (!_this)
    {
        return DefWindowProcW(hWnd, uMsg, wParam, lParam);
    }

    if (uMsg == WM_TIMER && wParam == EP_WEATHER_TIMER_MEMORY_GUARD)
    {
        epw_Weather_CheckMemoryGuard(_this);
        return 0;
    }
    else if (uMsg == WM_TIMER && wParam == EP_WEATHER_TIMER_BROWSER_RETRY)
    {
        KillTimer(_this->hWnd, EP_WEATHER_TIMER_BROWSER_RETRY);
        if (!_this->pCoreWebView2Controller &&
            !InterlockedAdd64(&_this->bBrowserRestarting, 0))
        {
            epw_Weather_RestartBrowser(_this);
        }
        return 0;
    }
    else if (uMsg == EP_WEATHER_WM_RESTART_BROWSER)
    {
        InterlockedExchange64(&_this->bBrowserRestartPending, FALSE);
        epw_Weather_RestartBrowser(_this);
        return 0;
    }
    else if (uMsg == EP_WEATHER_WM_SET_BROWSER_VISIBILITY)
    {
        if (_this->pCoreWebView2Controller)
        {
            _this->pCoreWebView2Controller->lpVtbl->put_IsVisible(
                _this->pCoreWebView2Controller,
                (BOOL)wParam
            );
        }
        return 0;
    }
    else if (uMsg == EP_WEATHER_WM_CAPTURE_DATA)
    {
        InterlockedExchange64(&_this->bDataCapturePending, FALSE);
        if (_this->pCoreWebView2 &&
            !InterlockedAdd64(&_this->bIsNavigatingToError, 0))
        {
            _epw_Weather_ExecuteDataScript(_this);
        }
        return 0;
    }
    else if (uMsg == WM_TIMER && wParam == EP_WEATHER_TIMER_REQUEST_REPAINT)
    {
        HWND hNotifyWnd = InterlockedAdd64(&_this->hNotifyWnd, 0);
        printf("[Timer Repaint] Request posted to window %x.\n", hNotifyWnd);
        if (hNotifyWnd)
        {
            InvalidateRect(hNotifyWnd, NULL, TRUE);
            //Sleep(100);
            //InvalidateRect(hNotifyWnd, NULL, TRUE);
        }
        KillTimer(_this->hWnd, EP_WEATHER_TIMER_REQUEST_REPAINT);
        return 0;
    }
    else if (uMsg == WM_TIMER && wParam == EP_WEATHER_TIMER_REQUEST_REFRESH)
    {
        KillTimer(_this->hWnd, EP_WEATHER_TIMER_REQUEST_REFRESH);
        return SendMessageW(_this->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0);
    }
    else if (uMsg == WM_TIMER && wParam == EP_WEATHER_TIMER_SCHEDULE_REFRESH)
    {
        WCHAR apiHost[EP_QWEATHER_MAX_HOST] = { 0 };
        if (EPQWeather_IsConfigured(apiHost, ARRAYSIZE(apiHost)))
        {
            _epw_Weather_ExecuteDataScript(_this);
            KillTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH);
            LONG64 dwUpdateSchedule = InterlockedAdd64(&_this->dwUpdateSchedule, 0);
            SetTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH, dwUpdateSchedule, NULL);
        }
        else if (SendMessageW(_this->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0))
        {
            printf("[Timer Scheduled Refresh] Browser is busy, waiting a minute and retrying...\n");
            KillTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH);
            SetTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH, 1000 * 60, NULL);
        }
        else
        {
            KillTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH);
            LONG64 dwUpdateSchedule = InterlockedAdd64(&_this->dwUpdateSchedule, 0);
            printf("[Timer Scheduled Refresh] Fetching data, sleeping for %lld more ms.\n", dwUpdateSchedule);
            SetTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH, dwUpdateSchedule, NULL);
        }
        SecureZeroMemory(apiHost, sizeof(apiHost));
        return 0;
    }
    else if (uMsg == WM_TIMER && wParam == EP_WEATHER_TIMER_RESIZE_WINDOW)
    {
        DWORD dwTextScaleFactor = epw_Weather_GetTextScaleFactor(_this);
        DWORD dwZoomFactor = epw_Weather_GetZoomFactor(_this);
        UINT dpi = GetDpiForWindow(_this->hWnd);
        RECT rcAdj;
        LONG64 bIsErrorPage = InterlockedAdd64(&_this->bIsNavigatingToError, 0);
        SetRect(&rcAdj, 0, 0, MulDiv(MulDiv(MulDiv(EP_WEATHER_WIDTH, dpi, 96), dwTextScaleFactor, 100), dwZoomFactor, 100), MulDiv(MulDiv(MulDiv((bIsErrorPage ? EP_WEATHER_HEIGHT_ERROR : EP_WEATHER_HEIGHT), dpi, 96), dwTextScaleFactor, 100), dwZoomFactor, 100));
        AdjustWindowRectExForDpi(&rcAdj, epw_Weather_GetStyle(_this) & ~WS_OVERLAPPED, epw_Weather_HasMenuBar(_this), epw_Weather_GetExtendedStyle(_this), dpi);
        SetWindowPos(_this->hWnd, NULL, 0, 0, rcAdj.right - rcAdj.left, rcAdj.bottom - rcAdj.top, SWP_NOMOVE | SWP_NOSENDCHANGING);
        if (_this->cntResizeWindow == 7)
        {
            _this->cntResizeWindow = 0;
            KillTimer(_this->hWnd, EP_WEATHER_TIMER_RESIZE_WINDOW);
        }
        else
        {
            _this->cntResizeWindow++;
        }
        _ep_Weather_ReboundBrowser(_this, bIsErrorPage);
        return 0;
    }
    else if (uMsg == WM_TIMER && wParam == EP_WEATHER_TIMER_EXECUTEDATASCRIPT)
    {
        _epw_Weather_ExecuteDataScript(_this);
        KillTimer(_this->hWnd, EP_WEATHER_TIMER_EXECUTEDATASCRIPT);
        return 0;
    }
    else if (uMsg == EP_WEATHER_WM_REBOUND_BROWSER)
    {
        _ep_Weather_ReboundBrowser(
            _this,
            InterlockedAdd64(&_this->bIsNavigatingToError, 0)
        );
        return 0;
    }
    else if (uMsg == EP_WEATHER_WM_FETCH_DATA)
    {
        INT64 bWasBrowserBusy = InterlockedCompareExchange64(&_this->bBrowserBusy, TRUE, FALSE);
        if (!bWasBrowserBusy)
        {
            return _epw_Weather_NavigateToProvider(_this);
        }
        return HRESULT_FROM_WIN32(ERROR_BUSY);
    }
    else if (uMsg == EP_WEATHER_WM_SET_BROWSER_THEME)
    {
        if (_this->pCoreWebView2)
        {
            GenericObjectWithThis* pCoreWebView2CallDevToolsProtocolMethodCompletedHandler = NULL;
            if (lParam)
            {
                pCoreWebView2CallDevToolsProtocolMethodCompletedHandler =
                    GenericObjectWithThis_MakeAndInitialize(&EPWeather_ICoreWebView2CallDevToolsProtocolMethodCompletedHandlerVtbl, _this, L"pCoreWebView2CallDevToolsProtocolMethodCompletedHandler_WithRefresh");
            }
            else
            {
                pCoreWebView2CallDevToolsProtocolMethodCompletedHandler =
                    GenericObjectWithThis_MakeAndInitialize(&EPWeather_ICoreWebView2CallDevToolsProtocolMethodCompletedHandlerVtbl, _this, L"pCoreWebView2CallDevToolsProtocolMethodCompletedHandler");
            }
            if (wParam)
            {
                printf("[SetDarkMode] 1\n");
                _this->pCoreWebView2->lpVtbl->CallDevToolsProtocolMethod(_this->pCoreWebView2, L"Emulation.setEmulatedMedia", L"{\"features\": [ { \"name\": \"prefers-color-scheme\", \"value\": \"dark\" }]}", pCoreWebView2CallDevToolsProtocolMethodCompletedHandler);
                //_this->pCoreWebView2->lpVtbl->CallDevToolsProtocolMethod(_this->pCoreWebView2, L"Emulation.setAutoDarkModeOverride", L"{\"enabled\": true}", &EPWeather_ICoreWebView2CallDevToolsProtocolMethodCompletedHandler);
            }
            else
            {
                printf("[SetDarkMode] 0\n");
                _this->pCoreWebView2->lpVtbl->CallDevToolsProtocolMethod(_this->pCoreWebView2, L"Emulation.setEmulatedMedia", L"{\"features\": [ { \"name\": \"prefers-color-scheme\", \"value\": \"light\" }]}", pCoreWebView2CallDevToolsProtocolMethodCompletedHandler);
                //_this->pCoreWebView2->lpVtbl->CallDevToolsProtocolMethod(_this->pCoreWebView2, L"Emulation.setAutoDarkModeOverride", L"{\"enabled\": false}", &EPWeather_ICoreWebView2CallDevToolsProtocolMethodCompletedHandler);
            }
            return S_OK;
        }
    }
    else if (uMsg == EP_WEATHER_WM_SETDEVMODE)
    {
        if (_this->pCoreWebView2)
        {
            ICoreWebView2Settings* pCoreWebView2Settings = NULL;
            _this->pCoreWebView2->lpVtbl->get_Settings(_this->pCoreWebView2, &pCoreWebView2Settings);
            if (pCoreWebView2Settings)
            {
                ICoreWebView2Settings6* pCoreWebView2Settings6 = NULL;
                pCoreWebView2Settings->lpVtbl->QueryInterface(pCoreWebView2Settings, &IID_ICoreWebView2Settings6, &pCoreWebView2Settings6);
                if (pCoreWebView2Settings6)
                {
                    pCoreWebView2Settings6->lpVtbl->put_AreDevToolsEnabled(pCoreWebView2Settings6, wParam);
                    pCoreWebView2Settings6->lpVtbl->put_AreDefaultContextMenusEnabled(pCoreWebView2Settings6, wParam);
                    pCoreWebView2Settings6->lpVtbl->put_AreBrowserAcceleratorKeysEnabled(pCoreWebView2Settings6, wParam);
                    pCoreWebView2Settings6->lpVtbl->put_AreDefaultScriptDialogsEnabled(pCoreWebView2Settings6, wParam);
                    pCoreWebView2Settings6->lpVtbl->Release(pCoreWebView2Settings6);
                    LONG dwStyle = epw_Weather_GetStyle(_this);
                    if (!GetLastError())
                    {
                        if (wParam) dwStyle |= WS_SIZEBOX;
                        else dwStyle &= ~WS_SIZEBOX;
                        SetWindowLongW(_this->hWnd, GWL_STYLE, dwStyle);
                    }
                    PostMessageW(_this->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0);
                }
                pCoreWebView2Settings->lpVtbl->Release(pCoreWebView2Settings);
            }
        }
    }
    else if (uMsg == EP_WEATHER_WM_SETZOOMFACTOR)
    {
        if (_this->pCoreWebView2Controller)
        {
            _this->pCoreWebView2Controller->lpVtbl->put_ZoomFactor(_this->pCoreWebView2Controller, wParam / 100.0);
            _ep_Weather_StartResize(_this);
        }
    }
    else if (uMsg == WM_CLOSE || (uMsg == WM_KEYUP && wParam == VK_ESCAPE) || (uMsg == WM_ACTIVATEAPP && wParam == FALSE && GetAncestor(GetForegroundWindow(), GA_ROOT) != _this->hWnd))
    {
        epw_Weather_Hide(_this);
        return 0;
    }
    else if (uMsg == WM_WINDOWPOSCHANGING)
    {
        if (IsWindowVisible(hWnd))
        {
            LONG64 dwDevMode = InterlockedAdd64(&_this->dwDevMode, 0);
            WINDOWPOS* pwp = (WINDOWPOS*)lParam;
            pwp->flags |= (!dwDevMode ? (SWP_NOMOVE | SWP_NOSIZE) : 0);
            if (dwDevMode)
            {
                _ep_Weather_ReboundBrowser(_this, TRUE);
            }
        }
        return 0;
    }
    else if (uMsg == WM_SETTINGCHANGE)
    {
        if (IsColorSchemeChangeMessage(lParam))
        {
            MARGINS marGlassInset;
            if (!IsHighContrast())
            {
                marGlassInset.cxLeftWidth = -1; // -1 means the whole window
                marGlassInset.cxRightWidth = -1;
                marGlassInset.cyBottomHeight = -1;
                marGlassInset.cyTopHeight = -1;
            }
            else
            {
                marGlassInset.cxLeftWidth = 0;
                marGlassInset.cxRightWidth = 0;
                marGlassInset.cyBottomHeight = 0;
                marGlassInset.cyTopHeight = 0;
            }
            LONG64 dwDarkMode = InterlockedAdd64(&_this->g_darkModeEnabled, 0);
            if (IsWindows11())
            {
                if (!IsDwmExtendFrameIntoClientAreaBrokenInThisBuild())
                {
                    DwmExtendFrameIntoClientArea(_this->hWnd, &marGlassInset);
                }
                BOOL value = (IsThemeActive() && !IsHighContrast()) ? 1 : 0;
                SetMicaMaterialForThisWindow(_this->hWnd, value);
            }
            else
            {
                int s = 0;
                if (global_rovi.dwBuildNumber < 18985)
                {
                    s = -1;
                }
                DwmSetWindowAttribute(_this->hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE + s, &dwDarkMode, sizeof(LONG64));
            }
            if (!dwDarkMode)
            {
                epw_Weather_SetDarkMode(_this, dwDarkMode, TRUE);
            }
            return 0;
        }
    }
    else if (uMsg == WM_DPICHANGED)
    {
        UINT dpiX = LOWORD(wParam);
        UINT dpiY = HIWORD(wParam);
        if (!dpiX) dpiX = GetDpiForWindow(_this->hWnd);
        if (!dpiY) dpiY = dpiX;
        DWORD dwTextScaleFactor = epw_Weather_GetTextScaleFactor(_this);
        DWORD dwZoomFactor = epw_Weather_GetZoomFactor(_this);
        if (!dwZoomFactor) dwZoomFactor = 100;
        LONG64 bIsErrorPage = InterlockedAdd64(&_this->bIsNavigatingToError, 0);
        RECT rcAdj;
        SetRect(
            &rcAdj,
            0,
            0,
            MulDiv(MulDiv(MulDiv(EP_WEATHER_WIDTH, dpiX, 96), dwTextScaleFactor, 100), dwZoomFactor, 100),
            MulDiv(MulDiv(MulDiv((bIsErrorPage ? EP_WEATHER_HEIGHT_ERROR : EP_WEATHER_HEIGHT), dpiY, 96), dwTextScaleFactor, 100), dwZoomFactor, 100)
        );
        AdjustWindowRectExForDpi(&rcAdj, epw_Weather_GetStyle(_this) & ~WS_OVERLAPPED, epw_Weather_HasMenuBar(_this), epw_Weather_GetExtendedStyle(_this), dpiX);
        RECT* rcSuggested = (RECT*)lParam;
        RECT rcCurrent;
        if (!rcSuggested)
        {
            GetWindowRect(_this->hWnd, &rcCurrent);
            rcSuggested = &rcCurrent;
        }
        SetWindowPos(_this->hWnd, NULL, rcSuggested->left, rcSuggested->top, rcAdj.right - rcAdj.left, rcAdj.bottom - rcAdj.top, SWP_NOSENDCHANGING);
        _ep_Weather_ReboundBrowser(_this, bIsErrorPage);
        return 0;
    }
    else if (uMsg == WM_PAINT && !IsWindows11())
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hWnd, &ps);
        if (ps.fErase)
        {
            LONG64 bEnabled, dwDarkMode;
            dwDarkMode = InterlockedAdd64(&_this->g_darkModeEnabled, 0);
            epw_Weather_IsDarkMode(_this, dwDarkMode, &bEnabled);
            COLORREF oldcr = SetBkColor(hdc, bEnabled ? RGB(0, 0, 0) : RGB(255, 255, 255));
            ExtTextOutW(hdc, 0, 0, ETO_OPAQUE, &ps.rcPaint, L"", 0, 0);
            SetBkColor(hdc, oldcr);
        }
        EndPaint(hWnd, &ps);
        return 0;
    }
    /*BOOL bIsRunningWithoutVisualStyle = !IsThemeActive() || IsHighContrast();
    if (uMsg == WM_CREATE)
    {
        if (bIsRunningWithoutVisualStyle)
        {
            SetRectEmpty(&_this->rcBorderThickness);
            if (GetWindowLongPtrW(hWnd, GWL_STYLE) & WS_THICKFRAME)
            {
                AdjustWindowRectEx(&_this->rcBorderThickness, GetWindowLongPtr(hWnd, GWL_STYLE) & ~WS_CAPTION, FALSE, NULL);
                _this->rcBorderThickness.left *= -1;
                _this->rcBorderThickness.top *= -1;
            }
            else if (GetWindowLongPtrW(hWnd, GWL_STYLE) & WS_BORDER)
            {
                SetRect(&_this->rcBorderThickness, 1, 1, 1, 1);
            }
            SetWindowPos(hWnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED);
        }
    }
    else if (uMsg == WM_NCCALCSIZE)
    {
        if (bIsRunningWithoutVisualStyle)
        {
            if (lParam)
            {
                NCCALCSIZE_PARAMS* sz = (NCCALCSIZE_PARAMS*)lParam;
                sz->rgrc[0].left += _this->rcBorderThickness.left;
                sz->rgrc[0].right -= _this->rcBorderThickness.right;
                sz->rgrc[0].bottom -= _this->rcBorderThickness.bottom;
                return 0;
            }
        }
    }
    else if (uMsg == WM_NCHITTEST)
    {
        if (bIsRunningWithoutVisualStyle)
        {
            LRESULT lRes = DefWindowProcW(hWnd, uMsg, wParam, lParam);
            if (lRes == HTCLIENT)
            {
                POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
                ScreenToClient(hWnd, &pt);
                if (pt.y < _this->rcBorderThickness.top)
                {
                    return HTTOP;
                }
                else
                {
                    return HTCAPTION;
                }
            }
            else
            {
                return lRes;
            }
        }
    }
    else if (uMsg == WM_NCACTIVATE)
    {
        if (bIsRunningWithoutVisualStyle)
        {
            return 0;
        }
    }*/
    return DefWindowProcW(hWnd, uMsg, wParam, lParam);
}

HRESULT STDMETHODCALLTYPE epw_Weather_IsDarkMode(EPWeather* _this, LONG64 dwDarkMode, LONG64* bEnabled)
{
    BOOL bIsCompositionEnabled = TRUE;
    DwmIsCompositionEnabled(&bIsCompositionEnabled);
    if (!dwDarkMode)
    {
        RTL_OSVERSIONINFOW rovi;
        *bEnabled = bIsCompositionEnabled && ((global_rovi.dwBuildNumber < 18985) ? TRUE : (ShouldSystemUseDarkMode ? ShouldSystemUseDarkMode() : FALSE)) && !IsHighContrast();
    }
    else
    {
        *bEnabled = dwDarkMode - 1;
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetDarkMode(EPWeather* _this, LONG64 dwDarkMode, LONG64 bRefresh)
{
    LONG64 bEnabled;
    epw_Weather_IsDarkMode(_this, dwDarkMode, &bEnabled);
    InterlockedExchange64(&_this->g_darkModeEnabled, dwDarkMode);
    if ((dwDarkMode == 2 && bEnabled) || (dwDarkMode == 1 && !bEnabled) || !dwDarkMode)
    {
        RefreshImmersiveColorPolicyState();
        if (_this->hWnd)
        {
            AllowDarkModeForWindow(_this->hWnd, bEnabled);
            int s = 0;
            if (global_rovi.dwBuildNumber < 18985)
            {
                s = -1;
            }
            DwmSetWindowAttribute(_this->hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE + s, &bEnabled, sizeof(BOOL));
            //InvalidateRect(_this->hWnd, NULL, FALSE);
            PostMessageW(_this->hWnd, EP_WEATHER_WM_SET_BROWSER_THEME, bEnabled, bRefresh);
        }
        return S_OK;
    }
    return E_FAIL;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetGeolocationMode(EPWeather* _this, LONG64 dwGeolocationMode)
{
    InterlockedExchange64(&_this->dwGeolocationMode, dwGeolocationMode);
    PostMessageW(_this->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetWindowCornerPreference(EPWeather* _this, LONG64 dwWindowCornerPreference)
{
    InterlockedExchange64(&_this->dwWindowCornerPreference, dwWindowCornerPreference);
    INT preference = dwWindowCornerPreference;
    if (_this->hWnd)
    {
        DwmSetWindowAttribute(_this->hWnd, DWMWA_WINDOW_CORNER_PREFERENCE, &preference, sizeof(preference));
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetDevMode(EPWeather* _this, LONG64 dwDevMode, LONG64 bRefresh)
{
    InterlockedExchange64(&_this->dwDevMode, dwDevMode);
    if (bRefresh)
    {
        PostMessageW(_this->hWnd, EP_WEATHER_WM_SETDEVMODE, dwDevMode, 0);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetIconPack(EPWeather* _this, LONG64 dwIconPack, LONG64 bRefresh)
{
    InterlockedExchange64(&_this->dwIconPack, dwIconPack);
    if (bRefresh)
    {
        PostMessageW(_this->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetZoomFactor(EPWeather* _this, LONG64 dwZoomFactor)
{
    InterlockedExchange64(&_this->dwZoomFactor, dwZoomFactor);
    PostMessageW(_this->hWnd, EP_WEATHER_WM_SETZOOMFACTOR, dwZoomFactor, 0);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_GetLastUpdateTime(EPWeather* _this, LPSYSTEMTIME lpLastUpdateTime)
{
    *lpLastUpdateTime = stLastUpdate;
    return S_OK;
}

DWORD WINAPI epw_Weather_MainThread(EPWeather* _this)
{
    HRESULT hr = S_OK;
    BOOL bShouldReleaseBecauseClientDied = FALSE;

    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    _this->hrLastError = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(_this->hrLastError))
    {
        goto cleanup;
    }

    _this->hrLastError = CoCreateInstance(
        &CLSID_TaskbarList,
        NULL,
        CLSCTX_INPROC,
        &IID_ITaskbarList,
        (LPVOID*)&_this->pTaskList
    );
    if (FAILED(_this->hrLastError))
    {
        goto cleanup;
    }

    WNDCLASSW wc;
    ZeroMemory(&wc, sizeof(WNDCLASSW));
    wc.style = CS_DBLCLKS;
    wc.lpfnWndProc = epw_Weather_WindowProc;
    wc.hInstance = epw_hModule;
    wc.hbrBackground = IsWindows11() ? (HBRUSH)GetStockObject(BLACK_BRUSH) : NULL;
    wc.lpszClassName = _T(EPW_WEATHER_CLASSNAME);
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    if (!RegisterClassW(&wc))
    {
        //_this->hrLastError = HRESULT_FROM_WIN32(GetLastError());
        //goto cleanup;
    }

    DWORD dwDevMode = InterlockedAdd64(&_this->dwDevMode, 0);
    DWORD dwStyle = WS_CAPTION | (dwDevMode ? WS_SIZEBOX : 0);
    DWORD dwExStyle = 0;
    RECT rc = _this->rc;
    AdjustWindowRectExForDpi(&rc, dwStyle, FALSE, dwExStyle, _this->dpiXInitial);
    _this->hWnd = CreateWindowExW(dwExStyle, _T(EPW_WEATHER_CLASSNAME), L"", WS_OVERLAPPED | dwStyle, rc.left, rc.top, rc.right - rc.left, rc.bottom - rc.top, NULL, NULL, epw_hModule, _this); // 1030, 630
    if (!_this->hWnd)
    {
        _this->hrLastError = HRESULT_FROM_WIN32(GetLastError());
        goto cleanup;
    }

    SetPropW(_this->hWnd, L"valinet.ExplorerPatcher.ShellManagedWindow", TRUE);

    _this->hrLastError = _this->pTaskList->lpVtbl->DeleteTab(_this->pTaskList, _this->hWnd);
    if (FAILED(_this->hrLastError))
    {
        goto cleanup;
    }

    ZeroMemory(_this->wszUserDataFolder, sizeof(_this->wszUserDataFolder));
    SHGetFolderPathW(NULL, CSIDL_APPDATA, NULL, SHGFP_TYPE_CURRENT, _this->wszUserDataFolder);
    wcscat_s(_this->wszUserDataFolder, MAX_PATH, L"\\ExplorerPatcher\\ep_weather_host");
    BOOL bRet = CreateDirectoryW(_this->wszUserDataFolder, NULL);
    if (!(bRet || (!bRet && GetLastError() == ERROR_ALREADY_EXISTS)))
    {
        _this->hrLastError = HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS);
        goto cleanup;
    }

    LONG64 dwDarkMode = InterlockedAdd64(&_this->g_darkModeEnabled, 0);
    if (IsWindows11())
    {
        if (!IsHighContrast())
        {
            if (!IsDwmExtendFrameIntoClientAreaBrokenInThisBuild())
            {
                MARGINS marGlassInset = { -1, -1, -1, -1 }; // -1 means the whole window
                DwmExtendFrameIntoClientArea(_this->hWnd, &marGlassInset);
            }
            BOOL value = 1;
            SetMicaMaterialForThisWindow(_this->hWnd, TRUE);
        }
    }
    else
    {
        int s = 0;
        if (global_rovi.dwBuildNumber < 18985)
        {
            s = -1;
        }
        DwmSetWindowAttribute(_this->hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE + s, &dwDarkMode, sizeof(LONG64));
    }
    epw_Weather_SetDarkMode(_this, dwDarkMode, FALSE);

    InterlockedExchange64(&_this->bBrowserBusy, TRUE);

    _this->hrLastError = epw_Weather_CreateBrowserEnvironment(_this);
    if (FAILED(_this->hrLastError)) goto cleanup;

    INetworkListManager* spManager = NULL;
    IConnectionPointContainer* spConnectionPoints = NULL;
    IConnectionPoint* spConnectionPoint = NULL;
    IUnknown* spSink = NULL;
    DWORD dwCookie = 0;
    GenericObjectWithThis* pNetworkListManager = 
        GenericObjectWithThis_MakeAndInitialize(&INetworkListManagerEvents_Vtbl, _this, L"pNetworkListManager");

    if (pNetworkListManager)
    {
        if (SUCCEEDED(hr = CoCreateInstance(&CLSID_NetworkListManager, NULL, CLSCTX_ALL, &IID_INetworkListManager, &spManager) && spManager))
        {
            if (SUCCEEDED(hr = spManager->lpVtbl->QueryInterface(spManager, &IID_IConnectionPointContainer, &spConnectionPoints)))
            {
                if (SUCCEEDED(hr = spConnectionPoints->lpVtbl->FindConnectionPoint(spConnectionPoints, &IID_INetworkListManagerEvents, &spConnectionPoint)))
                {
                    if (SUCCEEDED(hr = pNetworkListManager->lpVtbl->QueryInterface(pNetworkListManager, &IID_IUnknown, &spSink)))
                    {
                        if (SUCCEEDED(hr = spConnectionPoint->lpVtbl->Advise(spConnectionPoint, spSink, &dwCookie)))
                        {
                        }
                    }
                }
            }
        }
    }

    LONG64 dwUpdateSchedule = InterlockedAdd64(&_this->dwUpdateSchedule, 0);
    SetTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH, dwUpdateSchedule, NULL);
    SetTimer(_this->hWnd, EP_WEATHER_TIMER_MEMORY_GUARD, EP_WEATHER_TIMER_MEMORY_GUARD_INTERVAL, NULL);

    SetEvent(_this->hInitializeEvent);

    MSG msg;
    while (TRUE)
    {
        DWORD dwRes = MsgWaitForMultipleObjects(EP_WEATHER_NUM_SIGNALS, &_this->hSignalExitMainThread, FALSE, INFINITE, QS_ALLINPUT);
        if (dwRes == WAIT_OBJECT_0 || dwRes == WAIT_ABANDONED_0 + 1)
        {
            if (dwRes == WAIT_ABANDONED_0 + 1)
            {
                printf("[General] Client has died.\n");

                if (OpenEventW(READ_CONTROL, FALSE, _T(EP_SETUP_EVENTNAME)))
                {
                    printf("[General] Servicing is in progress, terminating...\n");
                    TerminateProcess(GetCurrentProcess(), 0);
                }

                bShouldReleaseBecauseClientDied = TRUE;
            }
            PostQuitMessage(0);
        }
        else if (dwRes == WAIT_OBJECT_0 + EP_WEATHER_NUM_SIGNALS)
        {
            BOOL bRet = 0, bQuit = FALSE;
            while (bRet = PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
                if (msg.message == WM_QUIT)
                {
                    bQuit = TRUE;
                    break;
                }
                else
                {
                    TranslateMessage(&msg);
                    DispatchMessage(&msg);
                }
            }
            if (bQuit)
            {
                _this->pCoreWebView2Controller->lpVtbl->Close(_this->pCoreWebView2Controller);
                break;
            }
        }
        else if (dwRes == WAIT_OBJECT_0 + 2)
        {
            epw_Weather_SetTextScaleFactorFromRegistry(_this, HKEY_CURRENT_USER, TRUE);
        }
        else if (dwRes == WAIT_OBJECT_0 + 3)
        {
            epw_Weather_SetTextScaleFactorFromRegistry(_this, HKEY_LOCAL_MACHINE, TRUE);
        }
    }

    if (SUCCEEDED(hr))
    {
        spConnectionPoint->lpVtbl->Unadvise(spConnectionPoint, dwCookie);
    }
    if (spSink)
    {
        spSink->lpVtbl->Release(spSink);
    }
    if (spConnectionPoint)
    {
        spConnectionPoint->lpVtbl->Release(spConnectionPoint);
    }
    if (spConnectionPoints)
    {
        spConnectionPoints->lpVtbl->Release(spConnectionPoints);
    }
    if (spManager)
    {
        spManager->lpVtbl->Release(spManager);
    }
    if (pNetworkListManager)
    {
        pNetworkListManager->lpVtbl->Release(pNetworkListManager);
    }

cleanup:

    epw_Weather_ReleaseBrowser(_this, TRUE);
    if (_this->wszTemperature)
    {
        free(_this->wszTemperature);
    }
    if (_this->wszUnit)
    {
        free(_this->wszUnit);
    }
    if (_this->wszCondition)
    {
        free(_this->wszCondition);
    }
    if (_this->pImage)
    {
        free(_this->pImage);
    }
    if (_this->wszLocation)
    {
        free(_this->wszLocation);
    }
    if (_this->hWnd)
    {
        DestroyWindow(_this->hWnd);
    }
    if (_this->pTaskList)
    {
        _this->pTaskList->lpVtbl->Release(_this->pTaskList);
    }
    CoUninitialize();
    SetEvent(_this->hInitializeEvent);
    if (bShouldReleaseBecauseClientDied)
    {
        SHCreateThread(epw_Weather_ReleaseBecauseClientDiedThread, _this, CTF_NOADDREFLIB, NULL);
    }
    printf("[General] Exiting main thread.\n");
    return 0;
}

HRESULT STDMETHODCALLTYPE epw_Weather_Initialize(EPWeather* _this, WCHAR wszName[MAX_PATH], BOOL bAllocConsole, LONG64 dwProvider, LONG64 cbx, LONG64 cby, LONG64 dwTemperatureUnit, LONG64 dwUpdateSchedule, RECT rc, LONG64 dwDarkMode, LONG64 dwGeolocationMode, HWND* hWnd, LONG64 dwZoomFactor, LONG64 dpiXInitial, LONG64 dpiYInitial)
{
    InitializeGlobalVersionAndUBR();

    if (bAllocConsole)
    {
        FILE* conout;
        AllocConsole();
        freopen_s(
            &conout,
            "CONOUT$",
            "w",
            stdout
        );
    }

    if (dwUpdateSchedule < 0)
    {
        return E_INVALIDARG;
    }
    InterlockedExchange64(&_this->dwUpdateSchedule, dwUpdateSchedule);

    if (dwTemperatureUnit < 0 || dwTemperatureUnit > EP_WEATHER_NUM_TUNITS)
    {
        return E_INVALIDARG;
    }
    InterlockedExchange64(&_this->dwTemperatureUnit, dwTemperatureUnit);

    if (dwProvider < 0 || dwProvider > EP_WEATHER_NUM_PROVIDERS)
    {
        return E_INVALIDARG;
    }
    InterlockedExchange64(&_this->dwProvider, dwProvider);

    if (!cbx || !cby)
    {
        return E_INVALIDARG;
    }
    InterlockedExchange64(&_this->cbx, cbx);
    InterlockedExchange64(&_this->cby, cby);

    _this->hSignalKillSwitch = CreateMutexW(NULL, FALSE, wszName);
    if (!_this->hSignalKillSwitch || GetLastError() != ERROR_ALREADY_EXISTS)
    {
        return E_INVALIDARG;
    }

    InterlockedExchange64(&_this->dwGeolocationMode, dwGeolocationMode);
    InterlockedExchange64(&_this->dwZoomFactor, dwZoomFactor);
    _this->dpiXInitial = dpiXInitial;
    _this->dpiYInitial = dpiYInitial;

    _this->hUxtheme = LoadLibraryW(L"uxtheme.dll");
    if (_this->hUxtheme)
    {
        RefreshImmersiveColorPolicyState = GetProcAddress(_this->hUxtheme, (LPCSTR)104);
        SetPreferredAppMode = GetProcAddress(_this->hUxtheme, (LPCSTR)135);
        AllowDarkModeForWindow = GetProcAddress(_this->hUxtheme, (LPCSTR)133);
        ShouldAppsUseDarkMode = GetProcAddress(_this->hUxtheme, (LPCSTR)132);
        ShouldSystemUseDarkMode = GetProcAddress(_this->hUxtheme, (LPCSTR)138);
        if (ShouldAppsUseDarkMode &&
            ShouldSystemUseDarkMode &&
            SetPreferredAppMode &&
            AllowDarkModeForWindow &&
            RefreshImmersiveColorPolicyState
            )
        {
            SetPreferredAppMode(TRUE);
            epw_Weather_SetDarkMode(_this, dwDarkMode, FALSE);
        }
    }

    _this->hShlwapi = LoadLibraryW(L"Shlwapi.dll");
    if (_this->hShlwapi)
    {
        _this->SHRegGetValueFromHKCUHKLMFunc = GetProcAddress(_this->hShlwapi, "SHRegGetValueFromHKCUHKLM");
    }

    _this->hMutexData = CreateMutexW(NULL, FALSE, NULL);
    if (!_this->hMutexData)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    _this->hInitializeEvent = CreateEventW(NULL, FALSE, FALSE, NULL);
    if (!_this->hInitializeEvent)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    _this->hSignalExitMainThread = CreateEventW(NULL, FALSE, FALSE, NULL);
    if (!_this->hSignalExitMainThread)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    _this->hSignalOnAccessibilitySettingsChangedFromHKCU = CreateEventW(NULL, FALSE, FALSE, NULL);
    if (!_this->hSignalOnAccessibilitySettingsChangedFromHKCU)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }
    _this->hSignalOnAccessibilitySettingsChangedFromHKLM = CreateEventW(NULL, FALSE, FALSE, NULL);
    if (!_this->hSignalOnAccessibilitySettingsChangedFromHKLM)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }
    epw_Weather_SetTextScaleFactorFromRegistry(_this, HKEY_CURRENT_USER, FALSE);
    epw_Weather_SetTextScaleFactorFromRegistry(_this, HKEY_LOCAL_MACHINE, FALSE);

    _this->rc = rc;

    _this->hMainThread = CreateThread(NULL, 0, epw_Weather_MainThread, _this, 0, NULL);
    if (!_this->hMainThread)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    WaitForSingleObject(_this->hInitializeEvent, INFINITE);
    if (FAILED(_this->hrLastError))
    {
        return _this->hrLastError;
    }

    *hWnd = _this->hWnd;

    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_Show(EPWeather* _this)
{
    if (!_this->pCoreWebView2Controller)
    {
        _this->dwBrowserRestartFailures = 0;
        epw_Weather_RequestBrowserRestart(_this);
    }
    SetLastError(0);
    LONG_PTR dwExStyle = GetWindowLongPtrW(_this->hWnd, GWL_EXSTYLE);
    if (!GetLastError())
    {
        SetWindowLongPtrW(_this->hWnd, GWL_EXSTYLE, WS_EX_TOOLWINDOW | dwExStyle);
    }
    INT preference = InterlockedAdd64(&_this->dwWindowCornerPreference, 0);
    DwmSetWindowAttribute(_this->hWnd, DWMWA_WINDOW_CORNER_PREFERENCE, &preference, sizeof(preference));
    PostMessageW(_this->hWnd, EP_WEATHER_WM_REBOUND_BROWSER, 0, 0);
    ShowWindow(_this->hWnd, SW_SHOW);
    PostMessageW(_this->hWnd, EP_WEATHER_WM_SET_BROWSER_VISIBILITY, TRUE, 0);
    _this->pTaskList->lpVtbl->DeleteTab(_this->pTaskList, _this->hWnd);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_Hide(EPWeather* _this)
{
    SetLastError(0);
    LONG_PTR dwExStyle = GetWindowLongPtrW(_this->hWnd, GWL_EXSTYLE);
    if (!GetLastError())
    {
        SetWindowLongPtrW(_this->hWnd, GWL_EXSTYLE, ~WS_EX_TOOLWINDOW & dwExStyle);
    }
    ShowWindow(_this->hWnd, SW_HIDE);
    PostMessageW(_this->hWnd, EP_WEATHER_WM_SET_BROWSER_VISIBILITY, FALSE, 0);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_GetWindowHandle(EPWeather* _this, HWND* phWnd)
{
    *phWnd = _this->hWnd;
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_LockData(EPWeather* _this)
{
    DWORD dwRes = WaitForSingleObject(_this->hMutexData, INFINITE);
    if (dwRes == WAIT_ABANDONED)
    {
        return HRESULT_FROM_WIN32(ERROR_ABANDONED_WAIT_0);
    }
    else if (dwRes == WAIT_FAILED)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_GetDataSizes(EPWeather* _this, LPDWORD pcbTemperature, LPDWORD pcbUnit, LPDWORD pcbCondition, LPDWORD pcbImage)
{
    *pcbTemperature = _this->cbTemperature;
    *pcbUnit = _this->cbUnit;
    *pcbCondition = _this->cbCondition;
    *pcbImage = _this->cbImage;
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_GetData(EPWeather* _this, DWORD cbTemperature, LPCWSTR wszTemperature, DWORD cbUnit, LPCWSTR wszUnit, DWORD cbCondition, LPCWSTR wszCondition, DWORD cbImage, char* pImage)
{
    if (cbTemperature)
    {
        memcpy_s(wszTemperature, cbTemperature, _this->wszTemperature, _this->cbTemperature);
    }
    if (cbUnit)
    {
        memcpy_s(wszUnit, cbUnit, _this->wszUnit, _this->cbUnit);
    }
    if (cbCondition)
    {
        memcpy_s(wszCondition, cbCondition, _this->wszCondition, _this->cbCondition);
    }
    if (cbImage)
    {
        memcpy_s(pImage, cbImage, _this->pImage, _this->cbImage);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_GetTitle(EPWeather* _this, DWORD cbTitle, LPCWSTR wszTitle, DWORD dwType)
{
    WCHAR wszBuffer[MAX_PATH];
    ZeroMemory(wszBuffer, MAX_PATH * sizeof(WCHAR));
    if (cbTitle)
    {
        switch (dwType)
        {
        case EP_WEATHER_VIEW_ICONTEXT:
        case EP_WEATHER_VIEW_TEXTONLY:
            swprintf_s(wszBuffer, MAX_PATH, L"%s", _this->wszLocation);
            break;
        case EP_WEATHER_VIEW_ICONTEMP:
        case EP_WEATHER_VIEW_TEMPONLY:
            swprintf_s(wszBuffer, MAX_PATH, L"%s - %s", _this->wszLocation, _this->wszCondition);
            break;
        case EP_WEATHER_VIEW_ICONONLY:
            swprintf_s(wszBuffer, MAX_PATH, L"%s %s | %s - %s", _this->wszTemperature, _this->wszUnit, _this->wszLocation, _this->wszCondition);
            break;
        }
        memcpy_s(wszTitle, cbTitle, wszBuffer, MAX_PATH);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_UnlockData(EPWeather* _this)
{
    if (!ReleaseMutex(_this->hMutexData))
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_IsInitialized(EPWeather* _this, BOOL* bIsInitialized)
{
    *bIsInitialized = _this->hInitializeEvent;
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetNotifyWindow(EPWeather* _this, HWND hWndNotify)
{
    InterlockedExchange64(&_this->hNotifyWnd, hWndNotify);
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetTemperatureUnit(EPWeather* _this, LONG64 dwTemperatureUnit)
{
    if (dwTemperatureUnit < 0 || dwTemperatureUnit > EP_WEATHER_NUM_TUNITS)
    {
        return E_INVALIDARG;
    }
    InterlockedExchange64(&_this->dwTemperatureUnit, dwTemperatureUnit);
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetUpdateSchedule(EPWeather* _this, LONG64 dwUpdateSchedule)
{
    if (dwUpdateSchedule < 0)
    {
        return E_INVALIDARG;
    }
    LONG64 dwOldUpdateSchedule = InterlockedExchange64(&_this->dwUpdateSchedule, dwUpdateSchedule);
    if (dwOldUpdateSchedule != dwUpdateSchedule)
    {
        KillTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH);
        SetTimer(_this->hWnd, EP_WEATHER_TIMER_SCHEDULE_REFRESH, dwUpdateSchedule, NULL);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetTerm(EPWeather* _this, DWORD cbTerm, LPCWSTR wszTerm)
{
    if (cbTerm)
    {
        memcpy_s(_this->wszTerm, sizeof(WCHAR) * MAX_PATH, wszTerm, cbTerm);
    }
    else
    {
        ZeroMemory(&_this->wszTerm, sizeof(WCHAR) * MAX_PATH);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetLanguage(EPWeather* _this, DWORD cbLanguage, LPCWSTR wszLanguage)
{
    if (cbLanguage)
    {
        memcpy_s(_this->wszLanguage, sizeof(WCHAR) * MAX_PATH, wszLanguage, cbLanguage);
    }
    else
    {
        ZeroMemory(&_this->wszLanguage, sizeof(WCHAR) * MAX_PATH);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_SetIconSize(EPWeather* _this, LONG64 cbx, LONG64 cby)
{
    DWORD dwOldX = InterlockedAdd64(&_this->cbx, 0);
    DWORD dwOldY = InterlockedAdd64(&_this->cby, 0);
    if (dwOldX != cbx || dwOldY != cby)
    {
        InterlockedExchange64(&_this->cbx, cbx);
        InterlockedExchange64(&_this->cby, cby);
        PostMessageW(_this->hWnd, EP_WEATHER_WM_FETCH_DATA, 0, 0);
    }
    return S_OK;
}

HRESULT STDMETHODCALLTYPE epw_Weather_GetIconSize(EPWeather* _this, LONG64* cbx, LONG64* cby)
{
    if (cbx) *cbx = InterlockedAdd64(&_this->cbx, 0);
    if (cby) *cby = InterlockedAdd64(&_this->cby, 0);
    return S_OK;
}
