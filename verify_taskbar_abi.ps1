$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$source = Join-Path $repoRoot 'ExplorerPatcher\dllmain.c'
$workflow = Join-Path $repoRoot '.github\workflows\build.yml'
$taskbarDll = Join-Path $repoRoot 'build\Release\x64\ep_taskbar.ge.dll'

function Assert-Contains([string]$text, [string]$needle, [string]$description) {
    if (-not $text.Contains($needle)) {
        throw "Taskbar ABI check failed: $description"
    }
}

$sourceText = Get-Content -LiteralPath $source -Raw
$workflowText = Get-Content -LiteralPath $workflow -Raw

Assert-Contains $sourceText 'EP_TASKBAR_ABI_LEGACY = 2' 'legacy ABI 2 support is missing'
Assert-Contains $sourceText 'EP_TASKBAR_ABI_INITIALIZED = 3' 'initialized ABI 3 support is missing'
Assert-Contains $sourceText 'if (version != EP_TASKBAR_ABI_LEGACY && version != EP_TASKBAR_ABI_INITIALIZED)' 'unsupported versions are not rejected'
Assert-Contains $sourceText 'GetProcAddress(hMyTaskbar, "EP_Taskbar_Initialize")' 'ABI 3 initialization lookup is missing'
Assert-Contains $sourceText 'HRESULT hr = EP_Taskbar_Initialize();' 'ABI 3 initialization call is missing'
Assert-Contains $workflowText 'tag: v1.0.3.0' 'the build is not pinned to the tray-fixed release'

if (-not (Test-Path -LiteralPath $taskbarDll)) {
    throw "Taskbar ABI check failed: payload was not found at $taskbarDll"
}

$dumpbinCommand = Get-Command dumpbin.exe -ErrorAction SilentlyContinue
$dumpbinPath = if ($dumpbinCommand) { $dumpbinCommand.Path } else { $null }
if (-not $dumpbinPath) {
    $vswherePath = @(
        (Get-Command vswhere.exe -ErrorAction SilentlyContinue).Path,
        'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe',
        'C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe'
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if ($vswherePath) {
        $installationPath = & $vswherePath -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1
        if ($installationPath) {
            $dumpbin = Get-ChildItem -LiteralPath (Join-Path $installationPath 'VC\Tools\MSVC') -Recurse -Filter dumpbin.exe -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match '\\bin\\Hostx64\\x64\\dumpbin\.exe$' } |
                Sort-Object FullName -Descending |
                Select-Object -First 1
            if ($dumpbin) {
                $dumpbinPath = $dumpbin.FullName
            }
        }
    }
}
if (-not $dumpbinPath) {
    throw 'Taskbar ABI check failed: dumpbin.exe was not found'
}

$exports = (& $dumpbinPath /exports $taskbarDll) -join "`n"
Assert-Contains $exports 'EP_Taskbar_Initialize' 'ABI 3 initialization export is missing'
Assert-Contains $exports 'EP_TrayUI_CreateInstance' 'TrayUI factory export is missing'
Assert-Contains $exports 'GetVersion' 'taskbar ABI version export is missing'

$nativeSource = @'
using System;
using System.Runtime.InteropServices;

public static class TaskbarAbiProbe {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr LoadLibraryW(string name);

  [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern IntPtr GetProcAddress(IntPtr module, string name);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool FreeLibrary(IntPtr module);

  [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
  public delegate uint VersionFunction();
}
'@
Add-Type -TypeDefinition $nativeSource

$module = [TaskbarAbiProbe]::LoadLibraryW((Resolve-Path -LiteralPath $taskbarDll).Path)
if ($module -eq [IntPtr]::Zero) {
    throw "Taskbar ABI check failed: LoadLibraryW returned $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}
try {
    $versionAddress = [TaskbarAbiProbe]::GetProcAddress($module, 'GetVersion')
    if ($versionAddress -eq [IntPtr]::Zero) {
        throw 'Taskbar ABI check failed: GetVersion address was not found'
    }
    $versionFunction = [Runtime.InteropServices.Marshal]::GetDelegateForFunctionPointer(
        $versionAddress,
        [TaskbarAbiProbe+VersionFunction]
    )
    $version = $versionFunction.Invoke()
    if ($version -ne 3) {
        throw "Taskbar ABI check failed: expected ABI 3, got $version"
    }
}
finally {
    [TaskbarAbiProbe]::FreeLibrary($module) | Out-Null
}

Write-Output "Taskbar ABI verification passed (payload ABI $version)."
