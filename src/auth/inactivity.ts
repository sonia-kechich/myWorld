export interface InactivityTimer {
  /** Restarts the countdown. */
  arm(): void;
  /** Records user activity and restarts the countdown. */
  touch(): void;
  /** Stops the timer. */
  dispose(): void;
  /** Timestamp of the last recorded interaction. */
  readonly lastActivity: number;
}

export interface InactivityTimerOptions {
  timeoutMs: number;
  onTimeout: () => void;
  now?: () => number;
}

/**
 * Calls `onTimeout` once no interaction happened for `timeoutMs`. The
 * countdown is restarted on every touch, and `now` can be injected so the
 * behaviour can be tested without waiting in real time.
 */
export function createInactivityTimer({
  timeoutMs,
  onTimeout,
  now = () => Date.now(),
}: InactivityTimerOptions): InactivityTimer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastActivity = now();

  const arm = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(onTimeout, timeoutMs);
  };

  const touch = () => {
    lastActivity = now();
    arm();
  };

  arm();

  return {
    arm,
    touch,
    dispose: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    get lastActivity() {
      return lastActivity;
    },
  };
}
