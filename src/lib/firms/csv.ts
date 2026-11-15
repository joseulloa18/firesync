import { isWithinBbox } from './bbox';
import { normalizeConfidence } from './confidence';
import { canonicalSatelliteName, resolveFirmsProduct } from './products';
import { FirmsCsvError } from './types';
import type {
  CsvParseOptions,
  CsvParseResult,
  CsvRowError,
  CsvRowErrorCode,
  FirmsDetection,
} from './types';

interface CsvRecord {
  fields: string[];
  line: number;
}

const REQUIRED_HEADERS = [
  'latitude',
  'longitude',
  'acq_date',
  'acq_time',
  'satellite',
  'confidence',
] as const;

function parseCsvRecords(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let inComment = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = (): void => {
    if (fields.length === 0 && field.trim() === '') {
      field = '';
      return;
    }
    fields.push(field);
    records.push({ fields, line: recordLine });
    fields = [];
    field = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] as string;

    if (inComment) {
      if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') {
          index += 1;
        }
        inComment = false;
        line += 1;
        recordLine = line;
      }
      continue;
    }

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (character === '\n') {
          line += 1;
        }
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }

    if (character === ',') {
      fields.push(field);
      field = '';
      continue;
    }

    if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      endRecord();
      line += 1;
      recordLine = line;
      continue;
    }

    if (
      character === '#' &&
      fields.length === 0 &&
      field.trim() === ''
    ) {
      inComment = true;
      field = '';
      continue;
    }

    field += character;
  }

  if (inQuotes) {
    throw new FirmsCsvError(
      'unterminated_quote',
      `Unterminated quoted field starting near line ${recordLine}.`,
    );
  }

  endRecord();
  return records;
}

function headerIndex(headers: readonly string[], names: readonly string[]): number {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) {
      return index;
    }
  }
  return -1;
}

function valueAt(fields: readonly string[], index: number): string {
  if (index < 0 || index >= fields.length) {
    return '';
  }
  return (fields[index] as string).trim();
}

function parseUtcDate(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseAcqTime(raw: string): { hhmm: string; hour: number; minute: number } | null {
  if (!/^\d{1,4}$/.test(raw)) {
    return null;
  }
  const padded = raw.padStart(4, '0');
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2, 4));
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hhmm: padded, hour, minute };
}

function parseFiniteNumber(raw: string): number | null {
  if (raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseFirmsCsv(
  csv: string,
  options: CsvParseOptions,
): CsvParseResult {
  const product = resolveFirmsProduct(options.source);
  const records = parseCsvRecords(csv);
  if (records.length === 0) {
    throw new FirmsCsvError('empty_csv', 'CSV contains no header row.');
  }

  const headerRecord = records[0] as CsvRecord;
  const headers = headerRecord.fields.map((header) => header.trim().toLowerCase());
  const missingHeaders = REQUIRED_HEADERS.filter(
    (required) => !headers.includes(required),
  );
  if (missingHeaders.length > 0) {
    throw new FirmsCsvError(
      'missing_header',
      `CSV is missing required headers: ${missingHeaders.join(', ')}.`,
    );
  }

  const columns = {
    latitude: headerIndex(headers, ['latitude']),
    longitude: headerIndex(headers, ['longitude']),
    acqDate: headerIndex(headers, ['acq_date']),
    acqTime: headerIndex(headers, ['acq_time']),
    satellite: headerIndex(headers, ['satellite']),
    instrument: headerIndex(headers, ['instrument']),
    confidence: headerIndex(headers, ['confidence']),
    frp: headerIndex(headers, ['frp']),
    brightness: headerIndex(headers, ['brightness', 'bright_ti4']),
    brightness2: headerIndex(headers, ['bright_t31', 'bright_ti5']),
    scan: headerIndex(headers, ['scan']),
    track: headerIndex(headers, ['track']),
    daynight: headerIndex(headers, ['daynight']),
    version: headerIndex(headers, ['version']),
    type: headerIndex(headers, ['type']),
  };

  const detections: FirmsDetection[] = [];
  const errors: CsvRowError[] = [];
  const dataRecords = records.slice(1);

  const reject = (
    record: CsvRecord,
    code: CsvRowErrorCode,
    message: string,
  ): void => {
    errors.push({ line: record.line, code, message });
  };

  for (const record of dataRecords) {
    const fields = record.fields;
    const latitudeRaw = valueAt(fields, columns.latitude);
    const longitudeRaw = valueAt(fields, columns.longitude);
    const acqDateRaw = valueAt(fields, columns.acqDate);
    const acqTimeRaw = valueAt(fields, columns.acqTime);
    const satelliteRaw = valueAt(fields, columns.satellite);
    const confidenceRaw = valueAt(fields, columns.confidence);

    if (
      latitudeRaw === '' ||
      longitudeRaw === '' ||
      acqDateRaw === '' ||
      acqTimeRaw === '' ||
      satelliteRaw === '' ||
      confidenceRaw === ''
    ) {
      reject(
        record,
        'missing_required_value',
        'Row is missing latitude, longitude, acq_date, acq_time, satellite or confidence.',
      );
      continue;
    }

    const latitude = parseFiniteNumber(latitudeRaw);
    if (latitude === null || latitude < -90 || latitude > 90) {
      reject(record, 'invalid_latitude', `Invalid latitude "${latitudeRaw}".`);
      continue;
    }

    const longitude = parseFiniteNumber(longitudeRaw);
    if (longitude === null || longitude < -180 || longitude > 180) {
      reject(record, 'invalid_longitude', `Invalid longitude "${longitudeRaw}".`);
      continue;
    }

    const acqDate = parseUtcDate(acqDateRaw);
    if (acqDate === null) {
      reject(record, 'invalid_date', `Invalid UTC date "${acqDateRaw}".`);
      continue;
    }

    const acqTime = parseAcqTime(acqTimeRaw);
    if (acqTime === null) {
      reject(record, 'invalid_time', `Invalid UTC time "${acqTimeRaw}".`);
      continue;
    }

    const satellite = canonicalSatelliteName(satelliteRaw);
    if (satellite === null) {
      reject(record, 'unknown_satellite', `Unknown satellite "${satelliteRaw}".`);
      continue;
    }
    if (!product.allowedSatellites.includes(satellite)) {
      reject(
        record,
        'satellite_product_mismatch',
        `Satellite "${satellite}" is not valid for source ${product.source}.`,
      );
      continue;
    }

    const confidence = normalizeConfidence(confidenceRaw, product.sensor);
    if (confidence === null) {
      reject(
        record,
        'invalid_confidence',
        `Invalid confidence "${confidenceRaw}" for ${product.sensor}.`,
      );
      continue;
    }

    const optionalFields: Array<{
      name: string;
      raw: string;
      assign: (value: number | null) => void;
    }> = [];
    let frp: number | null = null;
    let brightness: number | null = null;
    let brightness2: number | null = null;
    let scan: number | null = null;
    let track: number | null = null;

    optionalFields.push(
      { name: 'frp', raw: valueAt(fields, columns.frp), assign: (value) => { frp = value; } },
      {
        name: 'brightness',
        raw: valueAt(fields, columns.brightness),
        assign: (value) => { brightness = value; },
      },
      {
        name: 'brightness2',
        raw: valueAt(fields, columns.brightness2),
        assign: (value) => { brightness2 = value; },
      },
      { name: 'scan', raw: valueAt(fields, columns.scan), assign: (value) => { scan = value; } },
      { name: 'track', raw: valueAt(fields, columns.track), assign: (value) => { track = value; } },
    );

    let invalidOptional: string | null = null;
    for (const optional of optionalFields) {
      if (optional.raw === '') {
        optional.assign(null);
        continue;
      }
      const value = parseFiniteNumber(optional.raw);
      if (value === null) {
        invalidOptional = optional.name;
        break;
      }
      optional.assign(value);
    }
    if (invalidOptional !== null) {
      reject(
        record,
        'invalid_number',
        `Invalid numeric value for ${invalidOptional}.`,
      );
      continue;
    }

    if (options.bbox !== undefined && !isWithinBbox({ latitude, longitude }, options.bbox)) {
      reject(record, 'outside_bbox', 'Detection is outside the configured ingestion bbox.');
      continue;
    }

    const daynightRaw = valueAt(fields, columns.daynight).toUpperCase();
    const daynight = daynightRaw === 'D' || daynightRaw === 'N' ? daynightRaw : null;
    const instrument = valueAt(fields, columns.instrument);
    const version = valueAt(fields, columns.version);
    const type = valueAt(fields, columns.type);

    detections.push({
      source: product.source,
      sensor: product.sensor,
      satellite,
      instrument: instrument === '' ? null : instrument,
      acqAt: `${acqDateRaw}T${String(acqTime.hour).padStart(2, '0')}:${String(acqTime.minute).padStart(2, '0')}:00.000Z`,
      acqDate: acqDateRaw,
      acqTime: acqTime.hhmm,
      latitude,
      longitude,
      confidenceRaw,
      confidence,
      frp,
      brightness,
      brightness2,
      scan,
      track,
      daynight,
      version: version === '' ? null : version,
      type: type === '' ? null : type,
      isNrt: product.isNrt,
    });
  }

  return {
    product,
    detections,
    errors,
    rowsRead: dataRecords.length,
    rowsAccepted: detections.length,
    rowsRejected: errors.length,
  };
}
