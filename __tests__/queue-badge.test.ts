import { describe, it, expect } from 'vitest';
import { getQueueBadge } from '@/lib/queue-badge';

describe('getQueueBadge', () => {
  it('new jobs, not on queue page → green with newCount', () => {
    expect(getQueueBadge(3, 10, false)).toEqual({ kind: 'green', count: 3 });
  });

  it('new jobs, on queue page → red with queueCount', () => {
    expect(getQueueBadge(3, 10, true)).toEqual({ kind: 'red', count: 10 });
  });

  it('no new jobs, queue has items → red with queueCount', () => {
    expect(getQueueBadge(0, 7, false)).toEqual({ kind: 'red', count: 7 });
  });

  it('no new jobs, empty queue → none', () => {
    expect(getQueueBadge(0, 0, false)).toEqual({ kind: 'none' });
  });

  it('newCount > 0 but queueCount 0, not on page → green', () => {
    expect(getQueueBadge(2, 0, false)).toEqual({ kind: 'green', count: 2 });
  });

  it('on queue page, empty queue → none', () => {
    expect(getQueueBadge(0, 0, true)).toEqual({ kind: 'none' });
  });

  it('count passes through raw (capping is UI concern)', () => {
    expect(getQueueBadge(15, 20, false)).toEqual({ kind: 'green', count: 15 });
  });

  it('exactly 1 new job → green count 1', () => {
    expect(getQueueBadge(1, 5, false)).toEqual({ kind: 'green', count: 1 });
  });
});
