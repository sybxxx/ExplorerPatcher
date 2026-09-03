$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $repoRoot 'build\tests\qweather-config'
$testSource = Join-Path $PSScriptRoot 'verify_qweather_config.c'
$configSource = Join-Path $repoRoot 'ExplorerPatcher\weather_qweather_config.c'
$executable = Join-Path $outputDirectory 'verify_qweather_config.exe'
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'

if (-not (Test-Path -LiteralPath $vsDevCmd)) {
    throw "Visual Studio Build Tools were not found at $vsDevCmd"
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$compile = 'call "{0}" -arch=x64 -host_arch=x64 >nul && cl.exe /nologo /W4 /TC /DUNICODE /D_UNICODE /Fe:"{1}" "{2}" "{3}" /link advapi32.lib crypt32.lib' -f `
    $vsDevCmd, $executable, $testSource, $configSource

& $env:ComSpec /d /s /c $compile
if ($LASTEXITCODE -ne 0) {
    throw "QWeather configuration test compilation failed with exit code $LASTEXITCODE"
}

& $executable
if ($LASTEXITCODE -ne 0) {
    throw "QWeather configuration verification failed with exit code $LASTEXITCODE"
}
