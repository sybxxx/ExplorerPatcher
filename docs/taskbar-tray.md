# Taskbar tray compatibility

## Problem

The Windows 10 (ExplorerPatcher) taskbar on recent Windows 11 builds can keep a correctly registered notification icon in a hidden tray state after the taskbar is rebuilt. This is different from a missing application registration or an invalid icon image.

The separate `ep_taskbar` payload contains the system tray implementation. Release `v1.0.3.0` includes the upstream system tray reimplementation fixes relevant to this failure. The ExplorerPatcher source repository does not contain that payload's implementation, so the fix must keep the loader and the payload ABI in sync.

## Loader integration

The loader supports both taskbar payload interfaces:

| Payload ABI | Version result | Required setup |
| --- | ---: | --- |
| Legacy | 2 | Existing exports are sufficient |
| Initialized | 3 | Call `EP_Taskbar_Initialize()` before `EP_TrayUI_CreateInstance()` |

An unsupported version, a missing ABI 3 initialization export, or a failed initialization releases the candidate module instead of leaving a partially initialized taskbar payload active. The build workflow is pinned to `v1.0.3.0` so a future release does not silently change this contract.

## Verification

From the repository root, after the Release x64 payload has been prepared:

```powershell
powershell -ExecutionPolicy Bypass -File .\verify_taskbar_abi.ps1
```

The check verifies the source contract, the workflow pin, the required exports, and the payload's `GetVersion()` result. It deliberately does not call `EP_Taskbar_Initialize()` outside `explorer.exe`; that function resolves Explorer-private taskbar symbols and is only meaningful in the injected Explorer process.

The local candidate must still be tested separately from the installed runtime. The practical acceptance check is to use the Windows 10 (ExplorerPatcher) taskbar, restart Explorer, and confirm that a standard notification icon remains visible or appears in the configured overflow area after the tray is rebuilt. Switching to the Windows 11 taskbar remains a useful rollback comparison.
