#include "../TaskbarNotificationRecovery.h"

#include <stdio.h>

static int ExpectAction(EP_TNR_ACTION actual, EP_TNR_ACTION expected, int line)
{
    if (actual != expected)
    {
        printf("line %d: expected action %d, got %d\n", line, expected, actual);
        return 1;
    }
    return 0;
}

#define EXPECT_ACTION(actual, expected) \
    do \
    { \
        if (ExpectAction((actual), (expected), __LINE__)) return 1; \
    } while (0)

int main(void)
{
    EP_TNR_STATE timeoutState = { 0 };
    for (DWORD i = 0; i < EP_TNR_MAX_POLLS - 1; ++i)
    {
        EXPECT_ACTION(
            TaskbarNotificationRecovery_Observe(&timeoutState, FALSE),
            EP_TNR_ACTION_WAIT
        );
    }
    EXPECT_ACTION(
        TaskbarNotificationRecovery_Observe(&timeoutState, FALSE),
        EP_TNR_ACTION_STOP
    );
    EXPECT_ACTION(
        TaskbarNotificationRecovery_Observe(&timeoutState, TRUE),
        EP_TNR_ACTION_STOP
    );

    EP_TNR_STATE stableState = { 0 };
    for (DWORD i = 0; i < EP_TNR_READY_SAMPLES - 1; ++i)
    {
        EXPECT_ACTION(
            TaskbarNotificationRecovery_Observe(&stableState, TRUE),
            EP_TNR_ACTION_WAIT
        );
    }
    EXPECT_ACTION(
        TaskbarNotificationRecovery_Observe(&stableState, FALSE),
        EP_TNR_ACTION_WAIT
    );
    for (DWORD i = 0; i < EP_TNR_READY_SAMPLES - 1; ++i)
    {
        EXPECT_ACTION(
            TaskbarNotificationRecovery_Observe(&stableState, TRUE),
            EP_TNR_ACTION_WAIT
        );
    }
    EXPECT_ACTION(
        TaskbarNotificationRecovery_Observe(&stableState, TRUE),
        EP_TNR_ACTION_BROADCAST
    );
    EXPECT_ACTION(
        TaskbarNotificationRecovery_Observe(&stableState, TRUE),
        EP_TNR_ACTION_STOP
    );

    EXPECT_ACTION(
        TaskbarNotificationRecovery_Observe(NULL, TRUE),
        EP_TNR_ACTION_STOP
    );

    printf("Taskbar notification recovery state tests passed.\n");
    return 0;
}
