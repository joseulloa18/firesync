import type { FirmsDetection } from '../../src/lib/firms/types';

export function makeDetection(
  overrides: Partial<FirmsDetection> = {},
): FirmsDetection {
  return {
    source: 'MODIS_SP',
    sensor: 'MODIS',
    satellite: 'Terra',
    instrument: 'synthetic',
    acqAt: '2024-03-01T00:00:00.000Z',
    acqDate: '2024-03-01',
    acqTime: '0000',
    latitude: 18.47,
    longitude: -69.91,
    confidenceRaw: '85',
    confidence: 'high',
    frp: 10,
    brightness: 330,
    brightness2: 290,
    scan: 1,
    track: 1,
    daynight: 'D',
    version: 'synthetic',
    type: '0',
    isNrt: false,
    ...overrides,
  };
}
