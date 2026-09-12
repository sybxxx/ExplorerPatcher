#ifndef _H_TASKBAR_NOTIFICATION_RECOVERY_H_
#define _H_TASKBAR_NOTIFICATION_RECOVERY_H_

#include <Windows.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EP_TNR_INITIAL_DELAY_MS 1000
#define EP_TNR_POLL_INTERVAL_MS 250
#define EP_TNR_MAX_POLLS 20
#define EP_TNR_READY_SAMPLES 3

typedef enum _EP_TNR_ACTION
{
    EP_TNR_ACTION_WAIT,
    EP_TNR_ACTION_BROADCAST,
    EP_TNR_ACTION_STOP,
} EP_TNR_ACTION;

typedef struct _EP_TNR_STATE
{
    DWORD pollCount;
    DWORD consecutiveReadySamples;
    BOOL finished;
} EP_TNR_STATE;

EP_TNR_ACTION TaskbarNotificationRecovery_Observe(
    EP_TNR_STATE* state,
    BOOL notificationAreaReady
);

void ScheduleTaskbarNotificationIconRecovery(void);

#ifdef __cplusplus
}
#endif

#endif
