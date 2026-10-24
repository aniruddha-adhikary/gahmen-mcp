import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * Retry once on HTTP 429.
 *
 * data.gov.sg answers bursts with `429 TOO_MANY_REQUESTS` and a message such
 * as "Please try again in 10 seconds". We wait for the `Retry-After` header
 * when present, otherwise the number of seconds in the message, otherwise
 * 10 s (capped at 30 s), then retry the request a single time.
 */

type RetryableConfig = InternalAxiosRequestConfig & { __retried?: boolean };

const MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 10_000;

let installed = false;

export function installRetryOn429() {
  if (installed) return;
  installed = true;

  axios.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;
    if (!config || error.response?.status !== 429 || config.__retried) {
      throw error;
    }
    config.__retried = true;
    await new Promise((resolve) =>
      setTimeout(resolve, retryDelayMs(error.response))
    );
    return axios.request(config);
  });
}

function retryDelayMs(response: AxiosError['response']): number {
  const header = response?.headers?.['retry-after'];
  const fromHeader = header ? Number(header) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.min(fromHeader * 1000, MAX_RETRY_DELAY_MS);
  }
  const msg: unknown = (response?.data as { errorMsg?: unknown })?.errorMsg;
  const match = typeof msg === 'string' && msg.match(/in (\d+) seconds?/i);
  if (match) {
    return Math.min(Number(match[1]) * 1000, MAX_RETRY_DELAY_MS);
  }
  return DEFAULT_RETRY_DELAY_MS;
}
