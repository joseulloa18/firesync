import { abortedError, FirmsClientError } from "./errors";
import {
  FIRMS_AREA_CSV_BASE_URL,
  type FetchLike,
  type FirmsAreaRequest,
  type FirmsClientOptions,
  type FirmsDownloadOptions,
  type FirmsSleep,
} from "./types";
import {
  assertValidMapKey,
  buildAreaCsvUrl,
  isRetryableStatus,
  normalizeFirmsRequest,
  parseRetryAfterMs,
  type NormalizedFirmsRequest,
} from "./validation";

export const FIRMS_CLIENT_DEFAULTS = Object.freeze({
  timeoutMs: 30_000,
  minIntervalMs: 1_000,
  maxRetries: 2,
  retryBaseDelayMs: 500,
  maxRetryDelayMs: 10_000,
});

const MAX_CONFIGURED_RETRIES = 5;

type AttemptOutcome =
  | { readonly kind: "success"; readonly csv: string }
  | {
      readonly kind: "http";
      readonly status: number;
      readonly retryAfterMs: number | null;
    };

function invalidOptions(message: string): never {
  throw new FirmsClientError("invalid_options", message);
}

function requiredPositive(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    invalidOptions(`${name} must be a positive finite number.`);
  }
  return value;
}

function requiredNonNegative(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalidOptions(`${name} must be a non-negative finite number.`);
  }
  return value;
}

const defaultSleep: FirmsSleep = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

function waitForAbortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(abortedError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortedError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export class FirmsClient {
  private readonly mapKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: FirmsSleep;

  // Requests share one queue so a single client instance keeps a serial pace.
  private queueTail: Promise<void> = Promise.resolve();
  private lastRequestStartedAt: number | null = null;

  constructor(options: FirmsClientOptions) {
    if (typeof options !== "object" || options === null) {
      invalidOptions("options must be an object.");
    }

    assertValidMapKey(options.mapKey);
    if (typeof options.fetch !== "function") {
      invalidOptions("fetch must be a function.");
    }
    if (options.now !== undefined && typeof options.now !== "function") {
      invalidOptions("now must be a function.");
    }
    if (options.sleep !== undefined && typeof options.sleep !== "function") {
      invalidOptions("sleep must be a function.");
    }

    const maxRetries =
      options.maxRetries === undefined
        ? FIRMS_CLIENT_DEFAULTS.maxRetries
        : options.maxRetries;
    if (
      !Number.isInteger(maxRetries) ||
      maxRetries < 0 ||
      maxRetries > MAX_CONFIGURED_RETRIES
    ) {
      invalidOptions(
        `maxRetries must be an integer between 0 and ${MAX_CONFIGURED_RETRIES}.`,
      );
    }

    this.mapKey = options.mapKey;
    this.fetchImpl = options.fetch;
    this.timeoutMs = requiredPositive(
      options.timeoutMs,
      FIRMS_CLIENT_DEFAULTS.timeoutMs,
      "timeoutMs",
    );
    this.minIntervalMs = requiredNonNegative(
      options.minIntervalMs,
      FIRMS_CLIENT_DEFAULTS.minIntervalMs,
      "minIntervalMs",
    );
    this.maxRetries = maxRetries;
    this.maxAttempts = maxRetries + 1;
    this.retryBaseDelayMs = requiredNonNegative(
      options.retryBaseDelayMs,
      FIRMS_CLIENT_DEFAULTS.retryBaseDelayMs,
      "retryBaseDelayMs",
    );
    this.maxRetryDelayMs = requiredNonNegative(
      options.maxRetryDelayMs,
      FIRMS_CLIENT_DEFAULTS.maxRetryDelayMs,
      "maxRetryDelayMs",
    );
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * Downloads one area CSV response and returns its body as text.
   * The CSV is not parsed or validated here.
   */
  async download(
    request: FirmsAreaRequest,
    options: FirmsDownloadOptions = {},
  ): Promise<string> {
    this.throwIfAborted(options.signal);
    const normalized = normalizeFirmsRequest(request);
    return this.enqueue(options.signal, () =>
      this.run(normalized, options.signal),
    );
  }

  private enqueue<T>(
    signal: AbortSignal | undefined,
    task: () => Promise<T>,
  ): Promise<T> {
    let releaseQueue!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    const previous = this.queueTail;
    this.queueTail = previous.then(() => gate);

    return (async () => {
      try {
        await waitForAbortable(previous, signal);
        this.throwIfAborted(signal);
        return await task();
      } finally {
        releaseQueue();
      }
    })();
  }

  private async run(
    request: NormalizedFirmsRequest,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const url = buildAreaCsvUrl(this.mapKey, request, FIRMS_AREA_CSV_BASE_URL);

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      this.throwIfAborted(signal);
      await this.waitForThrottle(signal);
      this.throwIfAborted(signal);

      const outcome = await this.performAttempt(url, signal);
      if (outcome.kind === "success") return outcome.csv;

      if (!isRetryableStatus(outcome.status) || attempt >= this.maxAttempts) {
        throw new FirmsClientError(
          "http_status",
          `FIRMS request failed with HTTP status ${outcome.status} after ${attempt} attempt${attempt === 1 ? "" : "s"}.`,
          { status: outcome.status, attempts: attempt },
        );
      }

      const exponentialBackoff = this.retryBaseDelayMs * 2 ** (attempt - 1);
      const requestedDelay = outcome.retryAfterMs ?? exponentialBackoff;
      const delay = Math.min(Math.max(0, requestedDelay), this.maxRetryDelayMs);
      await this.sleepFor(delay, signal);
    }

    // The loop always returns or throws; this keeps TypeScript exhaustive.
    throw new FirmsClientError(
      "http_status",
      "FIRMS request failed after the configured attempts.",
      { attempts: this.maxAttempts },
    );
  }

  private async performAttempt(
    url: string,
    signal: AbortSignal | undefined,
  ): Promise<AttemptOutcome> {
    this.throwIfAborted(signal);

    const controller = new AbortController();
    let timedOut = false;
    const timeoutError = () =>
      new FirmsClientError(
        "timeout",
        `FIRMS request timed out after ${this.timeoutMs} ms.`,
      );
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      this.lastRequestStartedAt = this.now();
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "text/csv" },
        signal: controller.signal,
      });
      if (timedOut) throw timeoutError();
      if (signal?.aborted) throw abortedError();

      if (response.status === 200) {
        const csv = await response.text();
        if (timedOut) throw timeoutError();
        if (signal?.aborted) throw abortedError();
        return { kind: "success", csv };
      }

      return {
        kind: "http",
        status: response.status,
        retryAfterMs: isRetryableStatus(response.status)
          ? parseRetryAfterMs(response.headers.get("retry-after"), this.now())
          : null,
      };
    } catch (error: unknown) {
      if (error instanceof FirmsClientError) throw error;
      if (signal?.aborted) throw abortedError();
      if (timedOut) throw timeoutError();
      throw new FirmsClientError(
        "network_error",
        "FIRMS request failed due to a network error.",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private async waitForThrottle(
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (this.minIntervalMs === 0 || this.lastRequestStartedAt === null) {
      return;
    }
    const elapsed = this.now() - this.lastRequestStartedAt;
    if (elapsed < this.minIntervalMs) {
      await this.sleepFor(this.minIntervalMs - elapsed, signal);
    }
  }

  private async sleepFor(
    milliseconds: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    this.throwIfAborted(signal);
    if (milliseconds <= 0) return;

    const sleepPromise = Promise.resolve().then(() =>
      this.sleep(milliseconds, signal),
    );
    await waitForAbortable(sleepPromise, signal);
    this.throwIfAborted(signal);
  }

  private throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw abortedError();
  }
}

export function createFirmsClient(options: FirmsClientOptions): FirmsClient {
  return new FirmsClient(options);
}
