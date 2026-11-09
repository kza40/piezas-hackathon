// Field CSV export for handoff (last 14 days of readings + latest advice snapshot).
import { getFarm, getField } from './farms';
import { fieldReadings, listSensors } from './sensors';
import { fieldAdvice } from './advice';
import { RETENTION_DAYS } from './history';
import { READING_TYPES, type ReadingType } from '../readings';

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

function safeFilename(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'field';
  return `${base}-export.csv`;
}

export async function exportFieldCsv(
  ownerId: string,
  fieldId: string,
  now = new Date(),
): Promise<{ csv: string; filename: string }> {
  const field = await getField(ownerId, fieldId);
  const farm = await getFarm(ownerId, field.farmId);
  const sensors = await listSensors(ownerId, fieldId);
  const nameById = new Map(sensors.map((s) => [s.id, s.name]));
  const readings = await fieldReadings(ownerId, fieldId, RETENTION_DAYS, now);

  let adviceLabel = '';
  let adviceReason = '';
  let rainNext48hMm: number | '' = '';
  let overnightLowC: number | '' = '';
  try {
    const advice = await fieldAdvice(ownerId, fieldId, now);
    adviceLabel = advice.watering.label;
    adviceReason = advice.watering.reason;
    rainNext48hMm = advice.weather.rainNext48hMm;
    overnightLowC = advice.weather.overnightLowC;
  } catch {
    // Readings still export when weather/advice cannot run (e.g. missing farm location).
  }

  const crop = field.cropProfile?.name ?? '';
  const exportedAt = now.toISOString();
  const lines: string[] = [
    csvRow([
      'exportedAt',
      'rangeDays',
      'farm',
      'field',
      'crop',
      'sensor',
      'type',
      'value',
      'unit',
      'time',
      'adviceLabel',
      'adviceReason',
      'rainNext48hMm',
      'overnightLowC',
    ]),
  ];

  for (const block of readings.sensors) {
    const sensorName = nameById.get(block.sensorId) ?? block.sensorId;
    for (const type of Object.keys(READING_TYPES) as ReadingType[]) {
      const points = block.series[type] ?? [];
      const unit = READING_TYPES[type].unit;
      for (const p of points) {
        lines.push(
          csvRow([
            exportedAt,
            RETENTION_DAYS,
            farm.name,
            field.name,
            crop,
            sensorName,
            type,
            p.value,
            unit,
            p.time,
            adviceLabel,
            adviceReason,
            rainNext48hMm,
            overnightLowC,
          ]),
        );
      }
    }
  }

  if (lines.length === 1) {
    lines.push(
      csvRow([
        exportedAt,
        RETENTION_DAYS,
        farm.name,
        field.name,
        crop,
        '',
        '',
        '',
        '',
        '',
        adviceLabel,
        adviceReason,
        rainNext48hMm,
        overnightLowC,
      ]),
    );
  }

  return { csv: lines.join('\n') + '\n', filename: safeFilename(field.name) };
}
