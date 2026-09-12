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

## Restart recovery

Some notification clients keep running while Explorer is restarted. `H.NotifyIcon 2.4.1`, used by v2rayN 7.24.9, responds to `TaskbarCreated` by deleting and adding its icon once. If that add runs before the ExplorerPatcher notification toolbar is ready, the library catches the failure and does not retry. The process and its notification window remain alive, but the current shell has no icon.

ExplorerPatcher schedules one recovery when its taskbar factory succeeds, when the service window observes a new `TaskbarCreated` event, and when that service window starts for the ExplorerPatcher taskbar. A coalesced worker waits one second, then requires the `Shell_TrayWnd > TrayNotifyWnd > SysPager > ToolbarWindow32` path to exist for three consecutive 250 ms observations. It gives up after 20 observations. Once stable, it broadcasts the standard `TaskbarCreated` message once so existing clients can perform their normal re-registration. No application name, executable path, icon GUID, or proxy setting is special-cased.

The bounded wait prevents an unready taskbar from causing an immediate retry failure, and the single-worker guard prevents repeated taskbar initialization calls from creating concurrent recovery loops. A later, genuinely new taskbar construction can schedule a new recovery after the previous worker has finished.

## Verification

From the repository root, after the Release x64 payload has been prepared:

```powershell
powershell -ExecutionPolicy Bypass -File .\verify_taskbar_abi.ps1
powershell -ExecutionPolicy Bypass -File .\verify_taskbar_recovery.ps1
```

The ABI check verifies the source contract, workflow pin, required exports, and payload `GetVersion()` result. It deliberately does not call `EP_Taskbar_Initialize()` outside `explorer.exe`; that function resolves Explorer-private taskbar symbols and is only meaningful in the injected Explorer process. The recovery check compiles and runs the bounded readiness state machine, including timeout, unstable readiness, one-shot broadcast, and completed-state behavior. It does not broadcast a live shell message.

The local candidate must still be tested separately from the installed runtime. The practical acceptance check is to use the Windows 10 (ExplorerPatcher) taskbar, restart Explorer, and confirm that a standard notification icon remains visible or appears in the configured overflow area after the tray is rebuilt. Switching to the Windows 11 taskbar remains a useful rollback comparison.
