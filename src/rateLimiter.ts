/**
 * Sliding-window rate limiter.
 *
 * data.gov.sg rejects bursts with `429 TOO_MANY_REQUESTS` and asks clients to
 * "try again in 10 seconds". Each provider gets a default budget of 5 requests
 * per 10-second window; a tool call that exceeds it waits for the next slot
 * (at most 10 s) instead of hitting the API. Anything that still slips through
 * is handled by the single retry in `http.ts`.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  /** Resolves once a request slot is available, recording the request. */
  async waitIfNeeded(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 1;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

const WINDOW_MS = 10_000;
const MAX_REQUESTS_PER_WINDOW = 5;

/** One budget per upstream provider; they are rate limited independently. */
export const dataGovSgRateLimiter = new RateLimiter(
  MAX_REQUESTS_PER_WINDOW,
  WINDOW_MS
);
export const singStatRateLimiter = new RateLimiter(
  MAX_REQUESTS_PER_WINDOW,
  WINDOW_MS
);
