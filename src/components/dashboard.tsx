"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FireMap } from "./fire-map";
import type { DemoDetection } from "@/content/map-demo";
import { createSyntheticMonthDetections } from "@/content/map-demo";
import {
  Calendar,
  createMonthSelection,
  demoYears,
  monthLevel,
  type MonthSelection,
} from "./calendar";
import { Icon, type IconName } from "./icon";
import { dictionaries, type Locale } from "./messages";

type Dict = (typeof dictionaries)[Locale];
type SensorFilter = "all" | "MODIS" | "VIIRS";
type Period = 24 | 72 | 168;

const zoneIds = ["north", "south", "valley"] as const;

function initialZoneIndex(value?: string) {
  const index = zoneIds.findIndex((zone) => zone === value);
  return index >= 0 ? index : 0;
}

function rangeYears(from: number, to: number) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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

function historyCsv(
  t: Dict,
  zone: string,
  from: number,
  to: number,
  selectedDay: number,
) {
  const lines = [
    `# FIRESYNC · ${t.csvDemoNote}`,
    `# ${t.csvZone}: ${zone}`,
    `# ${t.csvRange}: ${from}-${to}`,
    `# ${t.selectedDay}: ${selectedDay}`,
    "",
    csvLine([t.csvYear, t.csvMonth, t.csvLevel, t.csvTotal, t.csvSource]),
  ];
  for (const year of rangeYears(from, to)) {
    for (let month = 0; month < 12; month += 1) {
      const selection = createMonthSelection(year, month);
      lines.push(
        csvLine([
          year,
          t.months[month],
          t.levels[selection.level],
          selection.total,
          t.csvSynthetic,
        ]),
      );
    }
  }
  return lines;
}

function zoneCsv(t: Dict, zone: string) {
  const lines = [
    `# FIRESYNC · ${t.csvDemoNote}`,
    `# ${t.csvZone}: ${zone}`,
    `# ${t.csvRange}: ${demoYears[demoYears.length - 1]}-${demoYears[0]}`,
    "",
    csvLine([t.csvYear, t.csvMonth, t.csvLevel, t.csvTotal, t.csvSource]),
  ];
  for (const year of demoYears) {
    for (let month = 0; month < 12; month += 1) {
      const selection = createMonthSelection(year, month);
      lines.push(
        csvLine([
          year,
          t.months[month],
          t.levels[selection.level],
          selection.total,
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
}: {
  t: Dict;
  title: string;
  subtitle: string;
  mode: "history" | "recent" | "preview";
  sensor?: SensorFilter;
  day?: number;
  records?: readonly DemoDetection[];
  onSelect?: (detection: DemoDetection) => void;
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
        />
      </div>
    </article>
  );
}

export function HomeDashboard({ locale }: { locale: Locale }) {
  const t = dictionaries[locale];
  const [selected, setSelected] = useState<MonthSelection | null>(null);
  const records = useMemo(
    () =>
      selected
        ? createSyntheticMonthDetections(
            selected.year,
            selected.month,
            selected.daily,
          )
        : undefined,
    [selected],
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
        selected={selected}
        onSelect={setSelected}
        showDetail
      />
    </section>
  );
}

export function MonthSummary({
  t,
  selected,
  day,
  playing,
  onPlay,
  onDayChange,
}: {
  t: Dict;
  selected: MonthSelection;
  day: number;
  playing: boolean;
  onPlay: () => void;
  onDayChange: (day: number) => void;
}) {
  const dayCount = selected.daily[day - 1] ?? 0;
  return (
    <>
      <div className="month-stat-grid">
        <div className="stat">
          <span>{t.monthTotal}</span>
          <strong>{selected.total}</strong>
        </div>
        <div className="stat">
          <span>{t.csvLevel}</span>
          <strong>{t.levels[selected.level]}</strong>
        </div>
        <div className="stat">
          <span>{t.selectedDay}</span>
          <strong>
            {day} · {dayCount} {t.dailyDetections}
          </strong>
        </div>
      </div>
      <div className="playback">
        <button
          type="button"
          className="round-button"
          onClick={onPlay}
          aria-label={playing ? t.pause : t.play}
          aria-pressed={playing}
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
          max={selected.days}
          step={1}
          value={day}
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
  const [zone, setZone] = useState(() => initialZoneIndex(initialZone));
  const [fromYear, setFromYear] = useState(2021);
  const [toYear, setToYear] = useState(2025);
  const [selected, setSelected] = useState<MonthSelection | null>(() =>
    example ? createMonthSelection(2025, 2) : null,
  );
  const [day, setDay] = useState(1);
  const [playing, setPlaying] = useState(false);
  const years = useMemo(() => rangeYears(fromYear, toYear), [fromYear, toYear]);
  const records = useMemo(
    () =>
      selected
        ? createSyntheticMonthDetections(
            selected.year,
            selected.month,
            selected.daily,
            zone,
          )
        : [],
    [selected, zone],
  );

  function selectMonth(selection: MonthSelection) {
    setSelected(selection);
    setDay(Math.max(1, selection.daily.findIndex((count) => count > 0) + 1));
    setPlaying(false);
  }

  useEffect(() => {
    if (!playing || !selected) return;
    const timer = window.setInterval(() => {
      setDay((current) => (current >= selected.days ? 1 : current + 1));
    }, 850);
    return () => window.clearInterval(timer);
  }, [playing, selected]);

  function changeFrom(value: number) {
    setFromYear(value);
    if (value > toYear) setToYear(value);
    if (selected && selected.year < value) {
      setSelected(null);
      setPlaying(false);
    }
  }

  function changeTo(value: number) {
    setToYear(value);
    if (value < fromYear) setFromYear(value);
    if (selected && selected.year > value) {
      setSelected(null);
      setPlaying(false);
    }
  }

  return (
    <>
      <section className="card filter-bar" aria-label={t.filters}>
        <div className="filter-grid">
          <label className="field">
            <span>{t.filterZone}</span>
            <select
              value={zoneIds[zone]}
              onChange={(event) =>
                setZone(initialZoneIndex(event.target.value))
              }
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
              {[...demoYears].reverse().map((year) => (
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
              {[...demoYears].reverse().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="helper">{t.calendarHint}</p>
      </section>

      <section className="dashboard-grid" aria-label={t.filters}>
        <MapCard
          t={t}
          title={t.historyMapTitle}
          subtitle={t.historyMapSubtitle}
          mode="history"
          records={records}
          day={selected ? day : undefined}
        />
        <Calendar
          locale={locale}
          years={years}
          selected={selected}
          onSelect={selectMonth}
        />
      </section>

      <section className="card month-panel" aria-labelledby="month-title">
        <div className="month-panel-head">
          <div>
            <p className="eyebrow">{t.monthSummary}</p>
            <h2 id="month-title">
              {selected
                ? `${t.detail} · ${t.months[selected.month]} ${selected.year}`
                : t.select}
            </h2>
          </div>
          <button
            type="button"
            className="button primary"
            onClick={() =>
              downloadCsv(
                `firesync-historial-${zoneIds[zone]}-${fromYear}-${toYear}-demo.csv`,
                historyCsv(t, t.zoneOptions[zone], fromYear, toYear, day),
              )
            }
          >
            <Icon name="download" size={16} />
            {t.downloadCsv}
          </button>
        </div>
        {selected ? (
          <MonthSummary
            t={t}
            selected={selected}
            day={day}
            playing={playing}
            onPlay={() => setPlaying((value) => !value)}
            onDayChange={(value) => {
              setPlaying(false);
              setDay(value);
            }}
          />
        ) : (
          <p className="empty-note">{t.select}</p>
        )}
        <p className="demo-note">{t.detailNote}</p>
      </section>
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
  const [sensor, setSensor] = useState<SensorFilter>("all");
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
  const sensorLabel =
    active?.sensor === "MODIS" ? t.mapLabels.modis : t.mapLabels.viirs;

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
                setSensor(event.target.value as SensorFilter);
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
                  <dd>{sensorLabel}</dd>
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
    </>
  );
}

const resourceIcons: IconName[] = ["shield", "alert", "bell"];
const resourceTitles = [
  "resourcePrevention",
  "resourceResponse",
  "resourceReport",
] as const;

export function PreventionDashboard({
  locale,
  initialZone,
}: {
  locale: Locale;
  initialZone?: string;
}) {
  const t = dictionaries[locale];
  const [zone, setZone] = useState(() => initialZoneIndex(initialZone));
  const plan =
    zone === 0
      ? [
          { month: 2, priority: t.priorityHigh },
          { month: 3, priority: t.priorityMedium },
          { month: 4, priority: t.priorityMedium },
        ]
      : zone === 1
        ? [
            { month: 4, priority: t.priorityHigh },
            { month: 5, priority: t.priorityHigh },
            { month: 6, priority: t.priorityLow },
          ]
        : [
            { month: 1, priority: t.priorityMedium },
            { month: 2, priority: t.priorityHigh },
            { month: 3, priority: t.priorityLow },
          ];

  return (
    <>
      <section className="card filter-bar" aria-label={t.filters}>
        <div className="filter-grid">
          <label className="field">
            <span>{t.filterZone}</span>
            <select
              value={zoneIds[zone]}
              onChange={(event) =>
                setZone(initialZoneIndex(event.target.value))
              }
            >
              {zoneIds.map((id, index) => (
                <option key={id} value={id}>
                  {t.zoneOptions[index]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="prevention-grid" aria-label={t.preventionTitle}>
        <article className="card preparation-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">{t.demo}</p>
              <h2>{t.preventionTitle}</h2>
              <p className="card-subtitle">{t.preventionSubtitle}</p>
            </div>
            <span className="card-icon" aria-hidden="true">
              <Icon name="calendar" size={21} />
            </span>
          </div>
          <div className="preparation-list">
            {plan.map((item) => {
              const level = monthLevel(2025, item.month);
              return (
                <div className="preparation-row" key={item.month}>
                  <div>
                    <strong>{t.months[item.month]}</strong>
                    <span>{t.levels[level]}</span>
                  </div>
                  <span className="priority-pill">{item.priority}</span>
                </div>
              );
            })}
          </div>
          <p className="helper">{t.preparationNote}</p>
        </article>

        <div className="resources-stack">
          <article className="card resources-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">{t.pending}</p>
                <h2>{t.resourcesTitle}</h2>
                <p className="card-subtitle">{t.resourcesEmptyTitle}</p>
              </div>
              <span className="card-icon" aria-hidden="true">
                <Icon name="shield" size={21} />
              </span>
            </div>
            <p className="empty-note">{t.resourcesEmptyText}</p>
            <div className="resource-actions">
              <Link
                className="button secondary"
                href={`/${locale}/mapa?zona=${zoneIds[zone]}`}
              >
                <Icon name="map" size={16} />
                {t.viewHistory}
              </Link>
              <button
                type="button"
                className="button primary"
                onClick={() =>
                  downloadCsv(
                    `firesync-resumen-${zoneIds[zone]}-demo.csv`,
                    zoneCsv(t, t.zoneOptions[zone]),
                  )
                }
              >
                <Icon name="download" size={16} />
                {t.downloadZoneSummary}
              </button>
              <a className="button emergency" href="tel:911">
                <Icon name="alert" size={16} />
                {t.emergencyCall}
              </a>
            </div>
            <p className="helper">{t.demoFileNote}</p>
          </article>

          <div className="resource-grid">
            {resourceTitles.map((key, index) => (
              <article className="resource-card" key={key}>
                <span className="resource-icon" aria-hidden="true">
                  <Icon name={resourceIcons[index]} size={18} />
                </span>
                <h3>{t[key]}</h3>
                <p>{t.resourcesEmptyText}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <p className="emergency-banner">
        <Icon name="alert" size={18} />
        <span>{t.emergency}</span>
      </p>
    </>
  );
}

export { zoneIds };
