import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInactivityTimer } from '../inactivity';

afterEach(() => {
  vi.useRealTimers();
});

describe('inactivity timer', () => {
  it('locks when nothing happens for the whole timeout', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    createInactivityTimer({ timeoutMs: 60_000, onTimeout });

    vi.advanceTimersByTime(59_000);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('restarts the countdown on every interaction', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const timer = createInactivityTimer({ timeoutMs: 60_000, onTimeout });

    vi.advanceTimersByTime(50_000);
    timer.touch();
    vi.advanceTimersByTime(50_000);

    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('remembers when the last interaction happened', () => {
    let clock = 1_000;
    const timer = createInactivityTimer({
      timeoutMs: 60_000,
      onTimeout: () => undefined,
      now: () => clock,
    });

    expect(timer.lastActivity).toBe(1_000);

    clock = 5_000;
    timer.touch();

    expect(timer.lastActivity).toBe(5_000);
  });

  it('stops counting after it is disposed', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const timer = createInactivityTimer({ timeoutMs: 60_000, onTimeout });

    timer.dispose();
    vi.advanceTimersByTime(120_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
