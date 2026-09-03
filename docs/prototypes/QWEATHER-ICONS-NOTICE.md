# QWeather Icons notice

The weather UI prototype uses the official QWeather Icons font from
QWeather Icons 1.8.0, upstream commit
`d7d4ef4d8334f9e70a75a088cb77804bf81daea4`.

- Project: https://github.com/qwd/Icons
- Author: QWeather, https://www.qweather.com/
- Code license: MIT
- Icon artwork license: CC BY 4.0,
  https://creativecommons.org/licenses/by/4.0/

The vendored font and code-point map are stored in
`ep_weather_host/assets/qweather-icons-1.8.0.*`. The provider generator embeds
the font in the local weather document, and the prototypes load the same
vendored font. QWeather attribution remains visible in the weather footer.
