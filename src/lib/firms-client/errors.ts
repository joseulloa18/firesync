export type FirmsClientErrorCode =
  | "invalid_options"
  | "invalid_map_key"
  | "invalid_source"
  | "invalid_bbox"
  | "invalid_day_range"
  | "invalid_date"
  | "http_status"
  | "network_error"
  | "timeout"
  | "aborted";

interface FirmsClientErrorDetails {
  readonly status?: number;
  readonly attempts?: number;
}

// Messages must never contain the map key, the full request URL, or a
// response body. Do not attach a cause from fetch for the same reason.
export class FirmsClientError extends Error {
  readonly code: FirmsClientErrorCode;
  readonly status?: number;
  readonly attempts?: number;

  constructor(
    code: FirmsClientErrorCode,
    message: string,
    details: FirmsClientErrorDetails = {},
  ) {
    super(message);
    this.name = "FirmsClientError";
    this.code = code;
    if (details.status !== undefined) this.status = details.status;
    if (details.attempts !== undefined) this.attempts = details.attempts;
  }
}

export function abortedError(): FirmsClientError {
  return new FirmsClientError("aborted", "FIRMS request was cancelled.");
}
