#include "TaskbarNotificationRecovery.h"

#include <stdio.h>

static volatile LONG s_recoveryWorkerActive = FALSE;

static BOOL IsTaskbarNotificationAreaReady(void)
{
    HWND tray = FindWindowW(L"Shell_TrayWnd", NULL);
    HWND notify = tray ? FindWindowExW(tray, NULL, L"TrayNotifyWnd", NULL) : NULL;
    HWND pager = notify ? FindWindowExW(notify, NULL, L"SysPager", NULL) : NULL;
    HWND toolbar = pager ? FindWindowExW(pager, NULL, L"ToolbarWindow32", NULL) : NULL;
    if (toolbar && IsWindow(toolbar))
    {
        return TRUE;
    }

    tray = FindWindowW(L"Shell_SecondaryTrayWnd", NULL);
    while (tray)
    {
        notify = FindWindowExW(tray, NULL, L"TrayNotifyWnd", NULL);
        pager = notify ? FindWindowExW(notify, NULL, L"SysPager", NULL) : NULL;
        toolbar = pager ? FindWindowExW(pager, NULL, L"ToolbarWindow32", NULL) : NULL;
        if (toolbar && IsWindow(toolbar))
        {
            return TRUE;
        }
        tray = FindWindowExW(NULL, tray, L"Shell_SecondaryTrayWnd", NULL);
    }

    return FALSE;
}

EP_TNR_ACTION TaskbarNotificationRecovery_Observe(
    EP_TNR_STATE* state,
    BOOL notificationAreaReady
)
{
    if (!state || state->finished)
    {
        return EP_TNR_ACTION_STOP;
    }

    state->pollCount++;
    if (notificationAreaReady)
    {
        state->consecutiveReadySamples++;
    }
    else
    {
        state->consecutiveReadySamples = 0;
    }

    if (state->consecutiveReadySamples >= EP_TNR_READY_SAMPLES)
    {
        state->finished = TRUE;
        return EP_TNR_ACTION_BROADCAST;
    }

    if (state->pollCount >= EP_TNR_MAX_POLLS)
    {
        state->finished = TRUE;
        return EP_TNR_ACTION_STOP;
    }

    return EP_TNR_ACTION_WAIT;
}

static DWORD WINAPI TaskbarNotificationIconRecoveryThread(LPVOID unused)
{
    (void)unused;

    EP_TNR_STATE state = { 0 };
    Sleep(EP_TNR_INITIAL_DELAY_MS);

    for (;;)
    {
        EP_TNR_ACTION action = TaskbarNotificationRecovery_Observe(
            &state,
            IsTaskbarNotificationAreaReady()
        );
        if (action == EP_TNR_ACTION_BROADCAST)
        {
            UINT taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
            if (taskbarCreated && SendNotifyMessageW(HWND_BROADCAST, taskbarCreated, 0, 0))
            {
                printf("[TB] Re-broadcast TaskbarCreated after notification area initialization\n");
            }
            else
            {
                printf("[TB] Failed to re-broadcast TaskbarCreated: %lu\n", GetLastError());
            }
            break;
        }
        if (action == EP_TNR_ACTION_STOP)
        {
            printf("[TB] Notification area did not stabilize before recovery timeout\n");
            break;
        }

        Sleep(EP_TNR_POLL_INTERVAL_MS);
    }

    InterlockedExchange(&s_recoveryWorkerActive, FALSE);
    return 0;
}

void ScheduleTaskbarNotificationIconRecovery(void)
{
    if (InterlockedCompareExchange(&s_recoveryWorkerActive, TRUE, FALSE) != FALSE)
    {
        return;
    }

    HANDLE thread = CreateThread(
        NULL,
        0,
        TaskbarNotificationIconRecoveryThread,
        NULL,
        0,
        NULL
    );
    if (!thread)
    {
        InterlockedExchange(&s_recoveryWorkerActive, FALSE);
        printf("[TB] Failed to schedule notification icon recovery: %lu\n", GetLastError());
        return;
    }

    CloseHandle(thread);
}
