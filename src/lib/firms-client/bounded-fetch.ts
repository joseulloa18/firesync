import { abortedError, FirmsClientError } from "./errors";
import type { FetchLike } from "./types";

const DEFAULT_MAX_BYTES = 1_048_576;

function networkError(tooLarge = false): FirmsClientError {
  return new FirmsClientError(
    "network_error",
    tooLarge
      ? "FIRMS response exceeded the configured byte limit."
      : "FIRMS response could not be downloaded safely.",
  );
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  if (body !== null) void body.cancel().catch(() => {});
}

/**
 * Adds a byte budget before the existing FIRMS client calls response.text().
 * Error responses remain unread so the caller can handle status and retries.
 */
export function createBoundedFirmsFetch(
  fetchImpl: FetchLike,
  maxBytes = DEFAULT_MAX_BYTES,
): FetchLike {
  if (
    typeof fetchImpl !== "function" ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    throw new FirmsClientError(
      "invalid_options",
      "A fetch function and positive safe integer byte limit are required.",
    );
  }

  return async (input, init) => {
    const signal =
      init?.signal === undefined && input instanceof Request
        ? input.signal
        : init?.signal;
    if (signal?.aborted) throw abortedError();

    let response: Response;
    try {
      response = await fetchImpl(input, {
        ...init,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      if (signal?.aborted) throw abortedError();
      // Never retain a fetch error, which may embed the key-bearing URL.
      throw networkError();
    }

    if (signal?.aborted) {
      cancelBody(response.body);
      throw abortedError();
    }
    if (response.status !== 200) return response;

    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength !== null &&
      /^\d+$/.test(declaredLength.trim()) &&
      Number(declaredLength) > maxBytes
    ) {
      cancelBody(response.body);
      throw networkError(true);
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      reader = response.body?.getReader();
    } catch {
      throw networkError();
    }
    let bytes = new Uint8Array(Math.min(maxBytes, 65_536));
    let length = 0;
    let tooLarge = false;
    let onAbort: (() => void) | undefined;

    // A custom stream need not observe the fetch signal. Race every read and
    // cancel the reader so timeout/cancellation also interrupts a stalled body.
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => {
        if (reader !== undefined) void reader.cancel().catch(() => {});
        reject(abortedError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });

    try {
      if (signal?.aborted) throw abortedError();
      if (reader !== undefined) {
        while (true) {
          const result = await Promise.race([reader.read(), cancelled]);
          if (signal?.aborted) throw abortedError();
          if (result.done) break;
          if (!(result.value instanceof Uint8Array)) throw networkError();
          const nextLength = length + result.value.byteLength;
          if (nextLength > maxBytes) {
            tooLarge = true;
            throw networkError(true);
          }
          if (nextLength > bytes.length) {
            const grown = new Uint8Array(
              Math.min(maxBytes, Math.max(nextLength, bytes.length * 2)),
            );
            grown.set(bytes);
            bytes = grown;
          }
          bytes.set(result.value, length);
          length = nextLength;
        }
      }

      const headers = new Headers(response.headers);
      // Native fetch exposes decompressed bytes; encoding/length from the
      // original wire response must not describe the reconstructed body.
      headers.delete("content-encoding");
      headers.set("content-length", String(length));
      return new Response(bytes.slice(0, length), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      if (reader !== undefined) void reader.cancel().catch(() => {});
      if (signal?.aborted) throw abortedError();
      throw networkError(tooLarge);
    } finally {
      if (onAbort !== undefined) signal?.removeEventListener("abort", onAbort);
      try {
        reader?.releaseLock();
      } catch {
        // A custom stream can retain a pending read while cancellation settles.
      }
    }
  };
}
