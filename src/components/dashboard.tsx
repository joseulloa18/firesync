"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FireMap } from "./fire-map";
import type { DemoDetection, DemoSensorFilter } from "@/content/map-demo";
import { Calendar } from "./calendar";
import { DataProvenance } from "./data-provenance";
import { Icon } from "./icon";
import { dictionaries, type Locale } from "./messages";
import { createSyntheticProvenance } from "@/lib/provenance";
import {
  HISTORY_START_YEAR,
  countBySensor,
  createMonthRecords,
  createMonthSummary,
  createPeriodRecords,
  createRangeSummaries,
  filterHistoryRecords,
  historyYearOptions,
  utcDayOf,
  type HistoryMonthSelection,
  type HistoryMonthSummary,
} from "@/lib/history/demo-history";
import "./history-detail.css";

type Dict = (typeof dictionaries)[Locale];
type Period = 24 | 72 | 168;

/** Años del calendario de la portada; el historial usa 2000–año actual. */
const HOME_YEARS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

const zoneIds = ["north", "south", "valley"] as const;

function initialZoneIndex(value?: string) {
  const index = zoneIds.findIndex((zone) => zone === value);
  return index >= 0 ? index : 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function csvCell(value: string | number | boolean) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function csvLine(values: (string | number | boolean)[]) {
  return values.map(csvCell).join(",");
}

function downloadCsv(filename: string, lines: string[]) {
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}\r\n`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sensorLabel(t: Dict, sensor: DemoSensorFilter): string {
  if (sensor === "all") return t.mapLabels.all;
  return sensor === "MODIS" ? t.mapLabels.modis : t.mapLabels.viirs;
}

/**
 * CSV del mismo subconjunto que el calendario, las cifras y el mapa. Incluye
 * filas mensuales para todo el rango y, si hay un mes abierto, filas diarias.
 */
function historyCsv(
  t: Dict,
  zone: string,
  fromYear: number,
  toYear: number,
  sensor: DemoSensorFilter,
  summaries: readonly HistoryMonthSummary[],
  selected: HistoryMonthSummary | null,
) {
  const lines = [
    `# FIRESYNC · ${t.csvDemoNote}`,
    `# ${t.csvZone}: ${zone}`,
    `# ${t.csvRange}: ${fromYear}-${toYear}`,
    `# ${t.filterSensor}: ${sensorLabel(t, sensor)}`,
    "",
    csvLine([
      t.csvYear,
      t.csvMonth,
      t.csvLevel,
      t.csvTotal,
      t.csvSensor,
      t.csvStatus,
      t.csvSource,
    ]),
  ];
  for (const summary of summaries) {
    lines.push(
      csvLine([
        summary.year,
        t.months[summary.month],
        t.levels[summary.level],
        summary.total,
        sensorLabel(t, sensor),
        summary.future
          ? t.csvFuture
          : summary.partial
            ? t.csvPartial
            : t.csvObserved,
        t.csvSynthetic,
      ]),
    );
  }

  if (selected) {
    lines.push(
      "",
      `# ${t.csvMonth}: ${t.months[selected.month]} ${selected.year}`,
      csvLine([t.csvDate, t.csvDay, t.csvTotal, t.csvStatus, t.csvSource]),
    );
    for (let day = 1; day <= selected.days; day += 1) {
      const futureDay = selected.partial && day > selected.observedDays;
      lines.push(
        csvLine([
          `${selected.year}-${pad(selected.month + 1)}-${pad(day)}`,
          day,
          futureDay ? "" : selected.daily[day - 1],
          futureDay ? t.csvFuture : t.csvObserved,
          t.csvSynthetic,
        ]),
      );
    }
  }

  return lines;
}

function MapCard({
  t,
  title,
  subtitle,
  mode,
  sensor,
  day,
  records,
  onSelect,
  onSensorChange,
  activity,
  sampleNote,
}: {
  t: Dict;
  title: string;
  subtitle: string;
  mode: "history" | "recent" | "preview";
  sensor?: DemoSensorFilter;
  day?: number;
  records?: readonly DemoDetection[];
  onSelect?: (detection: DemoDetection) => void;
  onSensorChange?: (sensor: DemoSensorFilter) => void;
  activity?: boolean;
  sampleNote?: string;
}) {
  return (
    <article className="card map-card" aria-labelledby="map-panel-title">
      <div className="card-head">
        <div>
          <p className="eyebrow">{t.demo}</p>
          <h2 id="map-panel-title">{title}</h2>
          <p className="card-subtitle">{subtitle}</p>
        </div>
        <span className="card-icon" aria-hidden="true">
          <Icon name="layers" size={21} />
        </span>
      </div>
      <div className="map-frame">
        <FireMap
          labels={t.mapLabels}
          mode={mode}
          sensor={sensor}
          day={day}
          detections={records}
          onSelect={onSelect}
          onSensorChange={onSensorChange}
          activity={activity}
        />
      </div>
      {sampleNote && <p className="demo-note map-sample-note">{sampleNote}</p>}
    </article>
  );
}

export function HomeDashboard({ locale }: { locale: Locale }) {
  const t = dictionaries[locale];
  const [now] = useState(() => new Date());
  const summaries = useMemo(
    () =>
      createRangeSummaries(HOME_YEARS[0], HOME_YEARS[HOME_YEARS.length - 1], {
        now,
      }),
    [now],
  );
  const [selected, setSelected] = useState<HistoryMonthSelection | null>(null);
  const records = useMemo(
    () =>
      selected
        ? createMonthRecords(selected.year, selected.month, 0, now)
        : undefined,
    [selected, now],
  );
  return (
    <section className="dashboard-grid" aria-label={t.filters}>
      <MapCard
        t={t}
        title={t.homeMapTitle}
        subtitle={t.homeMapSubtitle}
        mode="preview"
        records={records}
      />
      <Calendar
        locale={locale}
        years={HOME_YEARS}
        summaries={summaries}
        selected={selected}
        onSelect={(selection) => setSelected(selection)}
        showDetail
      />
    </section>
  );
}

function MonthSummary({
  t,
  summary,
  day,
  playing,
  onPlay,
  onDayChange,
}: {
  t: Dict;
  summary: HistoryMonthSummary;
  day: number;
  playing: boolean;
  onPlay: () => void;
  onDayChange: (day: number) => void;
}) {
  const dayCount = summary.daily[day - 1] ?? 0;
  const maxDay = Math.max(1, summary.observedDays);
  return (
    <>
      <div className="playback">
        <button
          type="button"
          className="round-button"
          onClick={onPlay}
          aria-label={playing ? t.pause : t.play}
          aria-pressed={playing}
          disabled={summary.observedDays === 0}
        >
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
        <label className="sr-only" htmlFor="day-range">
          {t.dayOfMonth}
        </label>
        <input
          id="day-range"
          className="range"
          type="range"
          min={1}
          max={maxDay}
          step={1}
          value={Math.min(day, maxDay)}
          onChange={(event) => onDayChange(Number(event.target.value))}
        />
        <output htmlFor="day-range" aria-live="polite">
          {t.dayOfMonth} {day} · {dayCount} {t.dailyDetections}
        </output>
      </div>
      <p className="helper">{t.timelineHelp}</p>
    </>
  );
}

function HistoryDetail({
  t,
  locale,
  zoneName,
  fromYear,
  toYear,
  sensor,
  summary,
  day,
  dayRecords,
  sensorCounts,
  playing,
  onClose,
  onPlay,
  onDayChange,
}: {
  t: Dict;
  locale: Locale;
  zoneName: string;
  fromYear: number;
  toYear: number;
  sensor: DemoSensorFilter;
  summary: HistoryMonthSummary;
  day: number;
  dayRecords: readonly DemoDetection[];
  sensorCounts: Record<"MODIS" | "VIIRS", number>;
  playing: boolean;
  onClose: () => void;
  onPlay: () => void;
  onDayChange: (day: number) => void;
}) {
  const selectedDayIsFuture = summary.partial && day > summary.observedDays;

  return (
    <section
      className="card history-detail"
      aria-labelledby="history-detail-title"
    >
      <div className="month-panel-head">
        <div>
          <p className="eyebrow">{t.monthSummary}</p>
          <h2 id="history-detail-title">
            {t.detail} · {t.months[summary.month]} {summary.year}
          </h2>
          <p className="card-subtitle">
            {zoneName} · {fromYear}–{toYear} · {sensorLabel(t, sensor)}
          </p>
        </div>
        <div className="history-detail-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            <Icon name="arrowRight" size={15} className="history-back-icon" />
            {t.closeDetail}
          </button>
        </div>
      </div>

      <div className="month-stat-grid">
        <div className="stat">
          <span>{t.monthTotal}</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="stat">
          <span>{t.sensorTotal}</span>
          <strong>
            {t.mapLabels.modis} {sensorCounts.MODIS} · {t.mapLabels.viirs}{" "}
            {sensorCounts.VIIRS}
          </strong>
        </div>
        <div className="stat">
          <span>{t.csvLevel}</span>
          <strong>{t.levels[summary.level]}</strong>
        </div>
      </div>

      <p className="demo-note">{t.detailNote}</p>
      <p className="helper">{t.historySensorNote}</p>

      <div className="history-days-head">
        <h3>{t.dailyGrid}</h3>
        <span>
          {summary.observedDays} / {summary.days} {t.observedDaysLabel}
        </span>
      </div>
      <ol className="history-day-grid" aria-label={t.dailyGrid}>
        {summary.daily.map((count, index) => {
          const dayNumber = index + 1;
          const futureDay = summary.partial && dayNumber > summary.observedDays;
          return (
            <li key={dayNumber}>
              <button
                type="button"
                className={`history-day${dayNumber === day ? " is-selected" : ""}${
                  count === 0 && !futureDay ? " is-empty" : ""
                }${futureDay ? " is-future" : ""}`}
                aria-pressed={dayNumber === day}
                aria-label={`${t.dayOfMonth} ${dayNumber} ${t.months[summary.month]} ${summary.year}: ${
                  futureDay ? t.dayFuture : `${count} ${t.dailyDetections}`
                }`}
                disabled={futureDay}
                onClick={() => onDayChange(dayNumber)}
              >
                <span className="history-day-number">{dayNumber}</span>
                <span className="history-day-count" aria-hidden="true">
                  {futureDay ? "×" : count}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <MonthSummary
        t={t}
        summary={summary}
        day={day}
        playing={playing}
        onPlay={onPlay}
        onDayChange={onDayChange}
      />

      <h3 className="history-records-title">
        {t.dayRecords} · {day} {t.months[summary.month]} {summary.year}
      </h3>
      {dayRecords.length > 0 ? (
        <div className="history-records-wrap">
          <table className="history-records">
            <caption className="sr-only">
              {t.dayRecords} · {t.demoNotice}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t.acquiredAt}</th>
                <th scope="col">{t.localTime}</th>
                <th scope="col">{t.filterSensor}</th>
                <th scope="col">{t.satellite}</th>
                <th scope="col">{t.confidence}</th>
                <th scope="col">{t.frp}</th>
                <th scope="col">{t.coordinates}</th>
              </tr>
            </thead>
            <tbody>
              {dayRecords.map((record) => (
                <tr key={record.id}>
                  <td>
                    <time dateTime={record.acquiredAt}>
                      {formatUtc(record.acquiredAt, locale, t.utc)}
                    </time>
                  </td>
                  <td>{formatLocal(record.acquiredAt, locale)}</td>
                  <td>
                    <span
                      className={`sensor-tag sensor-${record.sensor.toLowerCase()}`}
                    >
                      {record.sensor === "MODIS"
                        ? t.mapLabels.modis
                        : t.mapLabels.viirs}
                    </span>
                  </td>
                  <td>{record.satellite}</td>
                  <td>{record.confidence}%</td>
                  <td>{record.frpMw.toFixed(1)} MW</td>
                  <td>
                    [{record.coordinates[0].toFixed(3)},{" "}
                    {record.coordinates[1].toFixed(3)}]
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-note">
          {selectedDayIsFuture ? t.dayFuture : t.dayEmpty}
        </p>
      )}

      <p className="warning-box">
        <Icon name="alert" size={17} />
        <span>{t.notConfirmed}</span>
      </p>
    </section>
  );
}

export function HistoryDashboard({
  locale,
  example = false,
  initialZone,
}: {
  locale: Locale;
  example?: boolean;
  initialZone?: string;
}) {
  const t = dictionaries[locale];
  // Una sola fecha de referencia por montaje: los años futuros no aparecen.
  const [now] = useState(() => new Date());
  const yearOptions = useMemo(() => historyYearOptions(now), [now]);
  const currentYear = yearOptions[yearOptions.length - 1];
  const [zone, setZone] = useState(() => initialZoneIndex(initialZone));
  const [fromYear, setFromYear] = useState(HISTORY_START_YEAR);
  const [toYear, setToYear] = useState(currentYear);
  // El calendario solo muestra los años del rango activo. Los selectores de año
  // siguen ofreciendo 2000..año actual para poder ampliar el rango.
  const calendarYears = useMemo(() => {
    const start = Math.min(fromYear, toYear);
    const end = Math.max(fromYear, toYear);
    const years: number[] = [];
    for (let year = start; year <= end; year += 1) years.push(year);
    return years;
  }, [fromYear, toYear]);
  const [sensor, setSensor] = useState<DemoSensorFilter>("all");
  const [selected, setSelected] = useState<HistoryMonthSelection | null>(() =>
    example ? { year: Math.min(2025, currentYear), month: 1 } : null,
  );
  const [day, setDay] = useState<number | null>(() => {
    if (!example) return null;
    const summary = createMonthSummary(Math.min(2025, currentYear), 1, {
      sensor: "all",
      zoneIndex: initialZoneIndex(initialZone),
      now,
    });
    const firstActive = summary.daily.findIndex((count) => count > 0);
    return firstActive >= 0 ? firstActive + 1 : 1;
  });
  const [playing, setPlaying] = useState(false);

  const summaries = useMemo(
    () =>
      createRangeSummaries(fromYear, toYear, {
        sensor,
        zoneIndex: zone,
        now,
      }),
    [fromYear, toYear, sensor, zone, now],
  );
  const selectedSummary = useMemo(
    () =>
      selected
        ? createMonthSummary(selected.year, selected.month, {
            sensor,
            zoneIndex: zone,
            now,
          })
        : null,
    [selected, sensor, zone, now],
  );
  const monthRecords = useMemo(
    () =>
      selected
        ? createMonthRecords(selected.year, selected.month, zone, now)
        : [],
    [selected, zone, now],
  );
  const filteredMonthRecords = useMemo(
    () => filterHistoryRecords(monthRecords, sensor),
    [monthRecords, sensor],
  );
  const selectedCounts = useMemo(
    () => countBySensor(filteredMonthRecords),
    [filteredMonthRecords],
  );
  const periodRecords = useMemo(
    () => createPeriodRecords(fromYear, toYear, zone, now),
    [fromYear, toYear, zone, now],
  );
  const filteredPeriodRecords = useMemo(
    () => filterHistoryRecords(periodRecords, sensor),
    [periodRecords, sensor],
  );
  const mapRecords = selected ? filteredMonthRecords : filteredPeriodRecords;

  const activeDay = day ?? 1;
  const dayRecords = useMemo(
    () =>
      selected
        ? filteredMonthRecords.filter(
            (record) => utcDayOf(record) === activeDay,
          )
        : [],
    [selected, filteredMonthRecords, activeDay],
  );

  useEffect(() => {
    if (!playing || !selectedSummary || selectedSummary.observedDays === 0) {
      return;
    }
    const maxDay = selectedSummary.observedDays;
    const timer = window.setInterval(() => {
      setDay((current) =>
        current === null || current >= maxDay ? 1 : current + 1,
      );
    }, 850);
    return () => window.clearInterval(timer);
  }, [playing, selectedSummary]);

  function closeDetail() {
    setSelected(null);
    setDay(null);
    setPlaying(false);
  }

  function selectMonth(selection: HistoryMonthSelection) {
    const summary = createMonthSummary(selection.year, selection.month, {
      sensor,
      zoneIndex: zone,
      now,
    });
    if (summary.future) return;
    const firstActive = summary.daily.findIndex((count) => count > 0);
    setSelected(selection);
    setDay(firstActive >= 0 ? firstActive + 1 : 1);
    setPlaying(false);
  }

  function changeFrom(value: number) {
    setFromYear(value);
    if (value > toYear) setToYear(value);
    if (selected && selected.year < value) closeDetail();
  }

  function changeTo(value: number) {
    setToYear(value);
    if (value < fromYear) setFromYear(value);
    if (selected && selected.year > value) closeDetail();
  }

  const selectedForCsv = selectedSummary;
  const csvButton = (
    <button
      type="button"
      className="button primary"
      onClick={() =>
        downloadCsv(
          `firesync-historial-${zoneIds[zone]}-${fromYear}-${toYear}-demo.csv`,
          historyCsv(
            t,
            t.zoneOptions[zone],
            fromYear,
            toYear,
            sensor,
            summaries,
            selectedForCsv,
          ),
        )
      }
    >
      <Icon name="download" size={16} />
      {t.downloadCsv}
    </button>
  );

  return (
    <>
      <section className="card filter-bar" aria-label={t.filters}>
        <div className="history-filter-row">
          <div className="filter-grid">
            <label className="field">
              <span>{t.filterZone}</span>
              <select
                value={zoneIds[zone]}
                onChange={(event) => {
                  setZone(initialZoneIndex(event.target.value));
                  setPlaying(false);
                }}
              >
                {zoneIds.map((id, index) => (
                  <option key={id} value={id}>
                    {t.zoneOptions[index]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.filterFrom}</span>
              <select
                value={fromYear}
                onChange={(event) => changeFrom(Number(event.target.value))}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.filterTo}</span>
              <select
                value={toYear}
                onChange={(event) => changeTo(Number(event.target.value))}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="history-csv-action">{csvButton}</div>
        </div>
        <p className="helper">{t.calendarHint}</p>
        <p className="helper">{t.historyRangeNote}</p>
      </section>

      <section className="dashboard-grid" aria-label={t.filters}>
        <MapCard
          t={t}
          title={t.historyMapTitle}
          subtitle={`${t.historyMapSubtitle} · ${sensorLabel(t, sensor)}`}
          mode="history"
          sensor={sensor}
          day={selected && selectedSummary ? activeDay : undefined}
          records={mapRecords}
          onSensorChange={setSensor}
          activity
        />
        <Calendar
          locale={locale}
          years={calendarYears}
          summaries={summaries}
          selected={selected}
          onSelect={selectMonth}
          subtitle={`${t.calendarSubtitle} · ${fromYear}–${toYear} · ${sensorLabel(t, sensor)}`}
        />
      </section>

      {selectedSummary && day !== null ? (
        <HistoryDetail
          t={t}
          locale={locale}
          zoneName={t.zoneOptions[zone]}
          fromYear={fromYear}
          toYear={toYear}
          sensor={sensor}
          summary={selectedSummary}
          day={day}
          dayRecords={dayRecords}
          sensorCounts={selectedCounts}
          playing={playing}
          onClose={closeDetail}
          onPlay={() => setPlaying((value) => !value)}
          onDayChange={(value) => {
            setPlaying(false);
            setDay(value);
          }}
        />
      ) : (
        <p className="empty-note history-overview-note">{t.select}</p>
      )}
    </>
  );
}

const recentDetections: DemoDetection[] = [
  {
    id: "demo-modis-001",
    sensor: "MODIS",
    satellite: "Terra · demo",
    acquiredAt: "2026-11-15T17:42:00Z",
    coordinates: [-69.931, 18.471],
    confidence: 74,
    frpMw: 18.4,
    is_demo: true,
  },
  {
    id: "demo-viirs-002",
    sensor: "VIIRS",
    satellite: "S-NPP · demo",
    acquiredAt: "2026-11-15T16:18:00Z",
    coordinates: [-70.412, 18.735],
    confidence: 61,
    frpMw: 9.7,
    is_demo: true,
  },
  {
    id: "demo-modis-003",
    sensor: "MODIS",
    satellite: "Aqua · demo",
    acquiredAt: "2026-11-15T09:05:00Z",
    coordinates: [-69.208, 18.902],
    confidence: 52,
    frpMw: 6.2,
    is_demo: true,
  },
  {
    id: "demo-viirs-004",
    sensor: "VIIRS",
    satellite: "S-NPP · demo",
    acquiredAt: "2026-11-14T20:11:00Z",
    coordinates: [-71.031, 19.351],
    confidence: 83,
    frpMw: 24.1,
    is_demo: true,
  },
  {
    id: "demo-modis-005",
    sensor: "MODIS",
    satellite: "Terra · demo",
    acquiredAt: "2026-11-13T15:48:00Z",
    coordinates: [-69.745, 19.018],
    confidence: 45,
    frpMw: 3.8,
    is_demo: true,
  },
  {
    id: "demo-viirs-006",
    sensor: "VIIRS",
    satellite: "S-NPP · demo",
    acquiredAt: "2026-11-11T11:30:00Z",
    coordinates: [-70.677, 18.312],
    confidence: 68,
    frpMw: 14.5,
    is_demo: true,
  },
];

function formatUtc(iso: string, locale: Locale, utcLabel: string) {
  const formatted = new Intl.DateTimeFormat(
    locale === "es" ? "es-DO" : "en-US",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    },
  ).format(new Date(iso));
  return `${formatted} ${utcLabel}`;
}

function formatLocal(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-DO" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santo_Domingo",
  }).format(new Date(iso));
}

function formatShortDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-DO" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function RecentDashboard({
  locale,
  initialZone,
}: {
  locale: Locale;
  initialZone?: string;
}) {
  const t = dictionaries[locale];
  const [zone, setZone] = useState(() => initialZoneIndex(initialZone));
  const [period, setPeriod] = useState<Period>(72);
  const [sensor, setSensor] = useState<DemoSensorFilter>("all");
  const [selected, setSelected] = useState<DemoDetection | null>(null);
  const latest = Math.max(
    ...recentDetections.map((item) => new Date(item.acquiredAt).getTime()),
  );
  const visible = recentDetections.filter((item, index) => {
    const withinSensor = sensor === "all" || item.sensor === sensor;
    const withinPeriod =
      new Date(item.acquiredAt).getTime() >= latest - period * 60 * 60 * 1000;
    return (
      withinSensor && withinPeriod && (zone === 0 || index % 2 === zone - 1)
    );
  });
  const active =
    visible.find((item) => item.id === selected?.id) ?? visible[0] ?? null;
  const sensorLabelText =
    active?.sensor === "MODIS" ? t.mapLabels.modis : t.mapLabels.viirs;
  const provenance = createSyntheticProvenance(visible);

  return (
    <>
      <section className="card filter-bar" aria-label={t.filters}>
        <div className="filter-grid">
          <label className="field">
            <span>{t.filterZone}</span>
            <select
              value={zoneIds[zone]}
              onChange={(event) => {
                setZone(initialZoneIndex(event.target.value));
                setSelected(null);
              }}
            >
              {zoneIds.map((id, index) => (
                <option key={id} value={id}>
                  {t.zoneOptions[index]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t.filterPeriod}</span>
            <select
              value={period}
              onChange={(event) => {
                setPeriod(Number(event.target.value) as Period);
                setSelected(null);
              }}
            >
              <option value={24}>{t.period24}</option>
              <option value={72}>{t.period72}</option>
              <option value={168}>{t.period7}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.filterSensor}</span>
            <select
              value={sensor}
              onChange={(event) => {
                setSensor(event.target.value as DemoSensorFilter);
                setSelected(null);
              }}
            >
              <option value="all">{t.allSensors}</option>
              <option value="MODIS">{t.mapLabels.modis}</option>
              <option value="VIIRS">{t.mapLabels.viirs}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="activity-grid" aria-label={t.recentMapTitle}>
        <MapCard
          t={t}
          title={t.recentMapTitle}
          subtitle={t.recentMapSubtitle}
          mode="recent"
          records={visible}
          sensor={sensor}
          onSensorChange={(nextSensor) => {
            setSensor(nextSensor);
            setSelected(null);
          }}
          onSelect={setSelected}
        />

        <aside className="card detail-card" aria-labelledby="detail-title">
          <div className="card-head">
            <div>
              <p className="eyebrow">{t.syntheticTag}</p>
              <h2 id="detail-title">{t.detailTitle}</h2>
              <p className="card-subtitle">{t.demoUpdated}</p>
            </div>
            <span className="card-icon" aria-hidden="true">
              <Icon name="activity" size={21} />
            </span>
          </div>

          {active ? (
            <>
              <p className="detection-id">{active.id}</p>
              <dl className="detail-list">
                <div>
                  <dt>{t.satellite}</dt>
                  <dd>{active.satellite}</dd>
                </div>
                <div>
                  <dt>{t.filterSensor}</dt>
                  <dd>{sensorLabelText}</dd>
                </div>
                <div>
                  <dt>{t.acquiredAt}</dt>
                  <dd>{formatUtc(active.acquiredAt, locale, t.utc)}</dd>
                </div>
                <div>
                  <dt>{t.localTime}</dt>
                  <dd>{formatLocal(active.acquiredAt, locale)}</dd>
                </div>
                <div>
                  <dt>{t.coordinates}</dt>
                  <dd>
                    [{active.coordinates[0].toFixed(3)},{" "}
                    {active.coordinates[1].toFixed(3)}]
                  </dd>
                </div>
                <div>
                  <dt>{t.confidence}</dt>
                  <dd>{active.confidence}%</dd>
                </div>
                <div>
                  <dt>{t.frp}</dt>
                  <dd>{active.frpMw.toFixed(1)} MW</dd>
                </div>
                <div>
                  <dt>{t.detectionId}</dt>
                  <dd>{active.id}</dd>
                </div>
              </dl>
              <p className="warning-box">
                <Icon name="alert" size={17} />
                <span>{t.notConfirmed}</span>
              </p>
              <Link
                className="inline-link"
                href={`/${locale}/prevencion?zona=${zoneIds[zone]}`}
              >
                {t.viewPrevention}
                <Icon name="arrowRight" size={15} />
              </Link>
            </>
          ) : (
            <p className="empty-note">{t.noDetection}</p>
          )}

          <div className="detection-list-block">
            <p className="list-label">
              {t.recentList} · {t.results}: {visible.length}
            </p>
            <div className="detection-list">
              {visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="detection-row"
                  aria-pressed={active?.id === item.id}
                  onClick={() => setSelected(item)}
                >
                  <span className="sensor-dot" aria-hidden="true" />
                  <span>
                    {item.sensor} · {formatShortDate(item.acquiredAt, locale)}
                  </span>
                  <span className="sensor-tag">
                    {item.sensor === "MODIS"
                      ? t.mapLabels.modis
                      : t.mapLabels.viirs}
                  </span>
                </button>
              ))}
            </div>
            {visible.length === 0 && (
              <p className="empty-note">{t.noDetection}</p>
            )}
          </div>
        </aside>
      </section>

      <DataProvenance locale={locale} provenance={provenance} />
    </>
  );
}

export { zoneIds };
