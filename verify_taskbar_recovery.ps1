$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$projectDirectory = Join-Path $repoRoot 'ExplorerPatcher'
$source = Join-Path $projectDirectory 'TaskbarNotificationRecovery.c'
$testSource = Join-Path $projectDirectory 'tests\taskbar_notification_recovery_test.c'
$taskbarSource = Join-Path $projectDirectory 'Taskbar10.cpp'
$outputDirectory = Join-Path $repoRoot 'build\tests\taskbar-notification-recovery'
$executable = Join-Path $outputDirectory 'taskbar_notification_recovery_test.exe'
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'

if (-not (Test-Path -LiteralPath $vsDevCmd)) {
    throw "Visual Studio Build Tools were not found at $vsDevCmd"
}

$sourceText = Get-Content -LiteralPath $source -Raw
$taskbarText = Get-Content -LiteralPath $taskbarSource -Raw
foreach ($required in @(
    'InterlockedCompareExchange(&s_recoveryWorkerActive, TRUE, FALSE)',
    'EP_TNR_MAX_POLLS',
    'EP_TNR_READY_SAMPLES',
    'SendNotifyMessageW(HWND_BROADCAST, taskbarCreated, 0, 0)'
)) {
    if (-not $sourceText.Contains($required)) {
        throw "Taskbar recovery verification failed: missing $required"
    }
}
if (-not $taskbarText.Contains('ScheduleTaskbarNotificationIconRecovery();')) {
    throw 'Taskbar recovery verification failed: taskbar initialization does not schedule recovery'
}
$dllMainText = Get-Content -LiteralPath (Join-Path $projectDirectory 'dllmain.c') -Raw
if (-not $dllMainText.Contains('uMsg == s_uTaskbarRestart && bOldTaskbar >= 2')) {
    throw 'Taskbar recovery verification failed: TaskbarCreated handler does not schedule recovery'
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$compile = 'call "{0}" -arch=x64 -host_arch=x64 >nul && cl.exe /nologo /W4 /WX /TC /DUNICODE /D_UNICODE /Fe:"{1}" "{2}" "{3}" /link user32.lib' -f `
    $vsDevCmd, $executable, $testSource, $source

& $env:ComSpec /d /s /c $compile
if ($LASTEXITCODE -ne 0) {
    throw "Taskbar recovery test compilation failed with exit code $LASTEXITCODE"
}

& $executable
if ($LASTEXITCODE -ne 0) {
    throw "Taskbar recovery verification failed with exit code $LASTEXITCODE"
}
