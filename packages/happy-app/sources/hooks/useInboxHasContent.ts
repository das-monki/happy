import { useUpdates } from './useUpdates';
import { useWaitingTasks } from '@/sync/storage';
import { useChangelog } from './useChangelog';

// Hook to check if inbox has content to show
export function useInboxHasContent(): boolean {
    const { updateAvailable } = useUpdates();
    const waitingTasks = useWaitingTasks();
    const changelog = useChangelog();

    // Show dot if there's any actionable content:
    // - App updates available
    // - Tasks waiting for user input
    // - Unread changelog entries
    return updateAvailable || waitingTasks.length > 0 || (changelog.hasUnread === true);
}
