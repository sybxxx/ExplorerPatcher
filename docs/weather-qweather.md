# QWeather weather provider

ExplorerPatcher keeps the weather popup as a local, embedded WebView2 document. When a QWeather API Host and API Key are configured, the local document requests QWeather JSON APIs and renders the result. It does not embed or copy the QWeather or China Weather websites.

## Configuration and credentials

Open **ExplorerPatcher Properties > Weather** and choose **Configure QWeather API**. Enter the account-specific API Host shown in the QWeather console, followed by the API Key.

Only HTTPS hosts ending in `.qweatherapi.com` are accepted. The native weather host injects `X-QW-Api-Key` only into `GET` requests whose host exactly matches the validated configured host. The key is never passed to JavaScript or placed in a URL.

The provider document is loaded with `NavigateToString`, which has an opaque local origin in WebView2. The weather host therefore enables the WebView2 cross-origin compatibility flags required for its HTTPS JSON requests. The QWeather request filter is installed only when both QWeather credentials are present; the Open-Meteo fallback does not install that filter. The host still blocks in-panel navigation to unapproved external pages, and API authentication remains native and host-scoped.

WebView2 exposes a document loaded with `NavigateToString` as a `data:text/html` navigation. The native host marks only the next such navigation that it initiated as internal, so the embedded document can load while page-initiated navigation to an unapproved address remains blocked.

The API Key is protected with Windows DPAPI for the current user and stored as `REG_BINARY` in `HKCU\Software\ExplorerPatcher\WeatherQWeatherApiKeyProtected`. ExplorerPatcher's settings export deliberately excludes both the API Host and protected key. Removing the configuration deletes both values.

## Data and refresh policy

The provider uses these endpoints:

| Dataset | Endpoint | Refresh interval |
| --- | --- | ---: |
| Location | `/geo/v2/city/lookup` | Once per page lifecycle |
| Current conditions | `/weather/v1/current/{lat}/{lon}` | 10 minutes |
| 24 hourly forecasts | `/weather/v1/hourly/{lat}/{lon}` | 60 minutes |
| 5 daily forecasts | `/weather/v1/daily/{lat}/{lon}` | 3 hours |
| 2-hour minutely precipitation | `/v7/minutely/5m` | 5 minutes |
| Official alerts | `/weatheralert/v1/current/{lat}/{lon}` | 5 minutes |
| Air quality | `/airquality/v1/current/{lat}/{lon}` | 60 minutes |

Requests have a seven-second timeout and at most one retry for timeouts, HTTP 408, and server errors. HTTP 401 and 403 stop QWeather retries for the current page lifecycle. HTTP 429 applies a bounded backoff of at least 15 minutes and honors a longer `Retry-After` response.

Each dataset refreshes independently. A failure in alerts or air quality does not discard valid current or hourly weather. Old request generations cannot overwrite data after the location, language, units, or API Host change.

## Fallback and attribution

Without valid QWeather credentials, or when the first QWeather current-conditions request cannot complete, the widget keeps its lightweight Open-Meteo fallback. Esri and Photon remain fallback geocoders. The popup labels fallback mode instead of presenting Open-Meteo data as QWeather data.

QWeather mode displays the required QWeather attribution, uses the official `metadata.attributions` link when supplied, and preserves source names returned in each API response's `refer.sources` field. The local page creates source links without loading remote pages inside the weather WebView.

## UI and official icons

The popup uses the locally vendored QWeather Icons 1.8.0 font. The provider
generator embeds the WOFF2 data directly in the generated weather document, so
icons do not depend on a relative file path or a CDN at runtime. QWeather API
icon codes map directly to official glyphs; Open-Meteo fallback conditions map
to the closest QWeather weather glyph.

The same official filled glyph is rendered to an off-screen canvas for the
native taskbar bitmap. The popup itself uses a single vertically scrollable
container capped by the existing host height policy. The 24-hour strip can be
dragged or scrolled horizontally, but it never intercepts the normal vertical
mouse wheel used to move through the popup.

## Source and verification

The maintainable provider sources are:

- `ep_weather_host/ep_weather_provider_shell.html`
- `ep_weather_host/ep_weather_provider_data.js`
- `ep_weather_host/ep_weather_provider_icons.js`
- `ep_weather_host/ep_weather_provider_ui.js`
- `ep_weather_host/assets/qweather-icons-1.8.0.woff2`
- `ep_weather_host/assets/qweather-icons-1.8.0.json`

Run the following after editing them:

```powershell
node ep_weather_host\generate_weather_provider_header.js
node ep_weather_host\verify_open_meteo_provider.js
pwsh -File ep_weather_host\verify_qweather_config.ps1
```

The generated `ep_weather_provider_open_meteo_html.h` remains the C build input for compatibility with the existing weather provider. The verifiers check source/header synchronization, bounded C string literals, embedded official icon assets, JavaScript syntax, required endpoints and lifecycle limits, current QWeather response normalization, native header injection, strict API Host matching, vertical scrolling behavior, and DPAPI storage.

Real API acceptance still requires an account-specific API Host and API Key. Never add either value to test fixtures, logs, screenshots, commits, or build packages.
