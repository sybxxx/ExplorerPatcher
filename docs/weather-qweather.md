# QWeather weather provider

ExplorerPatcher keeps the weather popup as a local, embedded WebView2 document. When a QWeather API Host and API Key are configured, the local document requests QWeather JSON APIs and renders the result. It does not embed or copy the QWeather or China Weather websites.

## Configuration and credentials

Open **ExplorerPatcher Properties > Weather** and choose **Configure QWeather API**. Enter the account-specific API Host shown in the QWeather console, followed by the API Key.

Only HTTPS hosts ending in `.qweatherapi.com` are accepted. The native weather host injects `X-QW-Api-Key` only into `GET` requests whose host exactly matches the validated configured host. The key is never passed to JavaScript or placed in a URL.

The provider document is loaded with `NavigateToString`, which has an opaque local origin in WebView2. The weather host therefore enables the WebView2 cross-origin compatibility flags required for its HTTPS JSON requests. The QWeather request filter is installed only when both QWeather credentials are present; the Open-Meteo fallback does not install that filter. The host still blocks in-panel navigation to unapproved external pages, and API authentication remains native and host-scoped.

WebView2 exposes a document loaded with `NavigateToString` as a `data:text/html` navigation. The native host marks only the next such navigation that it initiated as internal, so the embedded document can load while page-initiated navigation to an unapproved address remains blocked.

The API Key is protected with Windows DPAPI for the current user and stored as `REG_BINARY` in `HKCU\Software\ExplorerPatcher\WeatherQWeatherApiKeyProtected`. ExplorerPatcher's settings export deliberately excludes both the API Host and protected key. Removing the configuration deletes both values.

## Location selection and proxy safety

The **Location** field remains the most stable override. A non-empty value is
treated as an explicit city, district, or postal-code query and is never
replaced by automatic detection.

When the field is empty, the default **Windows precise location** mode asks the
Windows Location service for a coordinate through the modern native
`Geolocator` API. It requests high accuracy and accepts a report only when
Windows identifies Wi-Fi, satellite, or cellular positioning and supplies a
positive error radius no larger than 50 km. A report identified as
`PositionSource_IPAddress` is rejected even if its reported radius looks small,
because it is still an IP approximation. The accepted coordinate is then
passed to QWeather's city lookup to obtain the displayed city or district. This
request does not use the WebView2 page, Google, or the `127.0.0.1:10808` proxy.

If Windows has no usable Wi-Fi, GPS, cellular, or other precise location
report, the widget stops with a clear request for a manual location. It does
not silently fall back to an IP-derived city, so a wired-only computer will not
suddenly inherit a wrong city from the proxy or a coarse network database. A
Windows location report is still subject to the accuracy reported by the
operating system; it is not a guarantee of street-level accuracy.

The optional **Direct IP approximate location** mode makes one bounded request
to `https://ipwho.is/` with WinInet's `INTERNET_OPEN_TYPE_DIRECT` mode. It is
explicitly opt-in, bypasses the configured system proxy, and labels the result
as approximate. A VPN or transparent/TUN network that changes the direct route
cannot be distinguished from the real network by this check. **Manual location
only** disables both automatic sources.

The optional **Windows network approximate location** mode uses the Windows
`Geolocator` result without rejecting `PositionSource_IPAddress`. It is useful
on an Ethernet-only computer when convenience is preferred over certainty, and
the weather page labels the result as a Windows network approximation. It does
not use the WebView2 proxy, but the result can still point to the wrong city and
must not be treated as precise positioning. The strict Windows mode remains the
default.

## Data and refresh policy

The provider uses these endpoints:

| Dataset | Endpoint | Refresh interval |
| --- | --- | ---: |
| Location | Windows `Geolocator` or an explicitly selected approximate source, then `/geo/v2/city/lookup` when configured | Once per page lifecycle |
| Current conditions | `/weather/v1/current/{lat}/{lon}` | 10 minutes |
| 24 hourly forecasts | `/weather/v1/hourly/{lat}/{lon}` | 60 minutes |
| 5 daily forecasts | `/weather/v1/daily/{lat}/{lon}` | 3 hours |
| 2-hour minutely precipitation | `/v7/minutely/5m` | 5 minutes |
| Official alerts | `/weatheralert/v1/current/{lat}/{lon}` | 5 minutes |
| Air quality | `/airquality/v1/current/{lat}/{lon}` | 60 minutes |

Requests have a seven-second timeout and at most one retry for timeouts, HTTP 408, and server errors. HTTP 401 and 403 stop QWeather retries for the current page lifecycle. HTTP 429 applies a bounded backoff of at least 15 minutes and honors a longer `Retry-After` response.

Each dataset refreshes independently. A failure in alerts or air quality does not discard valid current or hourly weather. Old request generations cannot overwrite data after the location, language, units, or API Host change.

Location and provider failures are rendered inside the embedded weather page.
The native host releases its busy state without replacing that page with the
legacy generic error document, so a failed `Reload` remains a single stable
error state rather than alternating between two pages. Actual WebView2
navigation or script failures still use the legacy error page and its bounded
browser retry policy.

The top-right controls are page-local controls. The refresh button requests the
current six QWeather datasets in place and does not navigate or rebuild the
WebView document. It is disabled while a refresh is running and for 15 seconds
afterwards; the QWeather authentication guard, in-flight protection, and 429
backoff still apply. The theme button cycles through **follow system -> light ->
dark -> follow system**. Follow-system is the initial state, and Windows app
color-scheme changes are reflected without reopening the weather panel. The
weather flyout follows the Windows app preference (`AppsUseLightTheme`) rather
than the separate shell/taskbar preference, so the two can legitimately differ.
The selected mode is not persisted as an ExplorerPatcher setting; the Weather
properties page still provides the persistent system, light, and dark choices.

The page and native weather host exchange the selected mode explicitly. This
keeps the caption, caption text, border, backdrop, WebView media override, and
document colors synchronized instead of leaving a light non-client strip above
a dark document. A setting change or browser recreation also sends the mode
back to the document so a stale page-local override cannot hide the system
choice.

## Fallback and attribution

Without valid QWeather credentials, or when the first QWeather current-conditions request cannot complete, the widget keeps its lightweight Open-Meteo fallback. Esri and Photon remain manual-query fallback geocoders. Windows location failure never falls back to an IP address; the user must enter a manual location or explicitly select the approximate IP mode. The popup labels fallback mode instead of presenting Open-Meteo data as QWeather data.

QWeather mode displays the required QWeather attribution, uses the official `metadata.attributions` link when supplied, and preserves source names returned in each API response's `refer.sources` field. The local page creates source links without loading remote pages inside the weather WebView.

## UI and official icons

The popup uses the locally vendored QWeather Icons 1.8.0 font. The provider
generator embeds the WOFF2 data directly in the generated weather document, so
icons do not depend on a relative file path or a CDN at runtime. QWeather API
icon codes map directly to official glyphs; Open-Meteo fallback conditions map
to the closest QWeather weather glyph.

The same official filled glyph is rendered to an off-screen canvas for the
native taskbar bitmap. The native popup keeps a fixed viewport, while the
single `#weather` container scrolls vertically for content beyond that viewport.
The page no longer reports its document height to resize the native window. The
24-hour strip can be dragged or scrolled horizontally, but it never intercepts
the normal vertical mouse wheel used to move through the popup.

The production layout includes a compact hero summary, temperature range,
humidity meter, two-hour precipitation intensity chart with thresholds, hourly
probability badges, primary-pollutant emphasis, live air-quality context, and a
five-day temperature-range/probability list. These values come from the
normalized provider response; the V2 prototype's sample values are not used.
The wind metric allows the full direction and speed to wrap inside its metric
card rather than hiding the tail behind an ellipsis.

Alert cards retain each alert's expanded or collapsed state across background
data refreshes. A refresh that finds no dataset due does not rebuild the page,
and a render with unchanged alert content reuses the existing alert DOM. The
click handler records the intended state before the native `details` action
completes, covering the short race where a background render is already queued.
Opening or closing an alert does not request a taskbar data recapture because it
does not change the taskbar weather summary.

## Source and verification

The maintainable provider sources are:

- `ep_weather_host/ep_weather_provider_shell.html`
- `ep_weather_host/ep_weather_provider_data.js`
- `ep_weather_host/ep_weather_provider_icons.js`
- `ep_weather_host/ep_weather_provider_theme.js`
- `ep_weather_host/ep_weather_provider_ui.js`
- `ep_weather_host/ep_weather_location.cpp`
- `ep_weather_host/ep_weather_location.h`
- `ep_weather_host/assets/qweather-icons-1.8.0.woff2`
- `ep_weather_host/assets/qweather-icons-1.8.0.json`

Run the following after editing them:

```powershell
node ep_weather_host\generate_weather_provider_header.js
node ep_weather_host\verify_open_meteo_provider.js
pwsh -File ep_weather_host\verify_qweather_config.ps1
```

The generated `ep_weather_provider_open_meteo_html.h` remains the C build input for compatibility with the existing weather provider. The verifiers check source/header synchronization, bounded C string literals, embedded official icon assets, JavaScript syntax, required endpoints and lifecycle limits, current QWeather response normalization, native header injection, strict API Host matching, Windows-native and explicit direct-IP location routing, reported location accuracy, vertical scrolling behavior, and DPAPI storage.

Real API acceptance still requires an account-specific API Host and API Key. Never add either value to test fixtures, logs, screenshots, commits, or build packages.
