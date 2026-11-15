import { z } from "zod";
import { FIRMS_SOURCES, type FirmsSource } from "./types";
import { assertValidCalendarDate } from "./validation";

export interface FirmsAvailability {
  readonly source: FirmsSource;
  readonly minDate: string;
  readonly maxDate: string;
}

/** No upstream text, key, request URL or original error is retained. */
export class FirmsAvailabilityError extends Error {
  readonly code = "invalid_availability";

  constructor() {
    super("FIRMS availability response is invalid.");
    this.name = "FirmsAvailabilityError";
  }
}

function invalidAvailability(): never {
  throw new FirmsAvailabilityError();
}

function isCalendarDate(value: string): boolean {
  try {
    assertValidCalendarDate(value);
    return true;
  } catch {
    return false;
  }
}

const availabilitySchema = z
  .object({
    source: z.enum(FIRMS_SOURCES),
    minDate: z.string().refine(isCalendarDate),
    maxDate: z.string().refine(isCalendarDate),
  })
  .refine((value) => value.minDate <= value.maxDate);

/** Small strict CSV reader for the three-column availability response. */
function readRecords(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  let rowHasContent = false;

  const endField = () => {
    row.push(field.trim());
    field = "";
    afterQuote = false;
  };
  const endRow = () => {
    if (rowHasContent) {
      endField();
      rows.push(row);
      // A single-product query must return one header and one data record.
      if (rows.length > 2) invalidAvailability();
    }
    row = [];
    field = "";
    afterQuote = false;
    rowHasContent = false;
  };

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else field += char;
      continue;
    }
    if (char === ",") {
      rowHasContent = true;
      endField();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      endRow();
    } else if (afterQuote) {
      if (char !== " " && char !== "\t") invalidAvailability();
    } else if (char === '"') {
      if (field.trim() !== "") invalidAvailability();
      field = "";
      rowHasContent = true;
      quoted = true;
    } else {
      field += char;
      if (char.trim() !== "") rowHasContent = true;
    }
  }
  if (quoted) invalidAvailability();
  endRow();
  return rows;
}

/**
 * Validates a single-product data_availability CSV; never performs network I/O.
 * Date bounds describe product availability, not complete satellite coverage.
 */
export function parseFirmsAvailabilityCsv(
  csv: string,
  requestedSource: FirmsSource,
): FirmsAvailability {
  // A single-product response is tiny; reject unbounded or malformed payloads.
  if (typeof csv !== "string" || csv.length > 16_384) invalidAvailability();
  const records = readRecords(csv.replace(/^\uFEFF/, ""));
  if (records.length !== 2) invalidAvailability();
  const [headers, values] = records;
  const required = ["data_id", "min_date", "max_date"];
  if (
    headers.length !== 3 ||
    values.length !== 3 ||
    new Set(headers).size !== 3 ||
    required.some((name) => !headers.includes(name))
  ) {
    invalidAvailability();
  }

  const result = availabilitySchema.safeParse({
    source: values[headers.indexOf("data_id")],
    minDate: values[headers.indexOf("min_date")],
    maxDate: values[headers.indexOf("max_date")],
  });
  if (!result.success || result.data.source !== requestedSource) {
    invalidAvailability();
  }
  return result.data;
}
