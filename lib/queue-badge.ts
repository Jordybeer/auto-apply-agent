export type BadgeState =
  | { kind: 'green'; count: number }
  | { kind: 'red';   count: number }
  | { kind: 'none' };

/**
 * Pure function — no side effects, easy to test.
 *
 * @param newCount      Drafts created since the user last opened the queue
 * @param queueCount    Total drafts in queue
 * @param isOnQueuePage Whether the user is currently viewing /queue
 */
export function getQueueBadge(
  newCount: number,
  queueCount: number,
  isOnQueuePage: boolean,
): BadgeState {
  if (!isOnQueuePage && newCount > 0) {
    return { kind: 'green', count: newCount };
  }
  if (queueCount > 0) {
    return { kind: 'red', count: queueCount };
  }
  return { kind: 'none' };
}
