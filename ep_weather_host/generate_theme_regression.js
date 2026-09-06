// Compile the actual native theme functions against a cached Windows-theme stub.
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'ep_weather_host.c'), 'utf8');
const start = source.indexOf('HRESULT STDMETHODCALLTYPE epw_Weather_IsDarkMode(');
const end = source.indexOf('HRESULT STDMETHODCALLTYPE epw_Weather_SetGeolocationMode(', start);
if (start < 0 || end < 0) throw new Error('Native theme functions not found');
const code = String.raw`
#include <Windows.h>
#include <assert.h>
#include <stdio.h>
#include "../../ep_weather_host/ep_weather.h"
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
typedef struct { LONG64 g_darkModeEnabled; HWND hWnd; } EPWeather;
static RTL_OSVERSIONINFOW global_rovi = {0};
static BOOL appDark, cachedDark, captionDark, browserDark;
static int refreshes, navigations;
static BOOL Apps(void) { return cachedDark; }
static BOOL Shell(void) { return !appDark; }
static void Refresh(void) { cachedDark = appDark; ++refreshes; }
static BOOL (*ShouldAppsUseDarkMode)(void) = Apps;
static BOOL (*ShouldSystemUseDarkMode)(void) = Shell;
static void (*RefreshImmersiveColorPolicyState)(void) = Refresh;
static void (*AllowDarkModeForWindow)(HWND, LONG64) = NULL;
static BOOL IsHighContrast(void) { return FALSE; }
static HRESULT TestComposition(BOOL* enabled) { *enabled = TRUE; return S_OK; }
static HRESULT TestAttribute(HWND h, DWORD a, const void* v, DWORD size) { return S_OK; }
static void epw_Weather_ApplyNativeThemeColors(EPWeather* self, BOOL dark) { captionDark = dark; }
static BOOL TestPost(HWND h, UINT message, WPARAM w, LPARAM l) {
    if (message == EP_WEATHER_WM_SET_BROWSER_THEME) { browserDark = (BOOL)w; navigations += !!l; }
    return TRUE;
}
#define DwmIsCompositionEnabled TestComposition
#define DwmSetWindowAttribute TestAttribute
#define PostMessageW TestPost
` + source.slice(start, end) + String.raw`
int main(void) {
    EPWeather weather = {0, (HWND)1};
    global_rovi.dwBuildNumber = 26100;
    for (int i = 0; i < 12; ++i) {
        appDark = i % 2;
        cachedDark = !appDark;
        assert(SUCCEEDED(epw_Weather_SetDarkMode(&weather, 0, FALSE)));
        assert(captionDark == appDark && browserDark == appDark);
        assert(SUCCEEDED(epw_Weather_SetDarkMode(&weather, 1, TRUE)));
        assert(!captionDark && !browserDark);
        assert(SUCCEEDED(epw_Weather_SetDarkMode(&weather, 2, TRUE)));
        assert(captionDark && browserDark);
    }
    assert(navigations == 0);
    assert(refreshes == 36);
    assert(FAILED(epw_Weather_SetDarkMode(&weather, 3, FALSE)));
    puts("Native cached-theme regression passed: 36 transitions, no reload.");
    return 0;
}
`;
const output = path.join(__dirname, '..', 'build', 'theme-regression');
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'theme_test.c'), code);
