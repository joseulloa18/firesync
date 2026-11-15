"use client";
import { useState } from "react";
import { FireMap } from "./fire-map";
import { dictionaries, type Locale } from "./messages";
import es from "../../messages/observed.es.json";
import en from "../../messages/observed.en.json";
import type { ObservedSnapshot } from "@/lib/firms/observed-schema";
import type { DemoSensorFilter } from "@/content/map-demo";

export function ObservedRecent({
  locale,
  snapshot,
}: {
  locale: Locale;
  snapshot: ObservedSnapshot;
}) {
  const t = dictionaries[locale];
  const c = locale === "es" ? es : en;
  const [sensor, setSensor] = useState<DemoSensorFilter>("all");
  const [hours, setHours] = useState("available");
  const [selected, setSelected] = useState<string | null>(null);
  const available = snapshot.products.filter((p) => p.status === "ok");
  const partial = available.length < snapshot.products.length;
  const visible = snapshot.records.filter(
    (r) =>
      (sensor === "all" || r.sensor === sensor) &&
      (hours === "available" ||
        Date.parse(r.acquiredAt) >=
          Date.parse(snapshot.downloadedAt) - Number(hours) * 3600000),
  );
  const active = visible.find((r) => r.id === selected) ?? visible[0];
  const format = (iso: string, zone = "UTC") =>
    new Intl.DateTimeFormat(locale === "es" ? "es-DO" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    }).format(new Date(iso));
  return (
    <>
      <section className="card filter-bar" aria-label={t.filters}>
        <div className="filter-grid">
          <label className="field">
            <span>{t.filterZone}</span>
            <select aria-label={t.filterZone} value="DO" onChange={() => {}}>
              <option value="DO">{c.area}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.filterPeriod}</span>
            <select
              value={hours}
              onChange={(e) => {
                setHours(e.target.value);
                setSelected(null);
              }}
            >
              <option value="available">{c.available}</option>
              <option value="24">{t.period24}</option>
              <option value="72">{t.period72}</option>
              <option value="168">{t.period7}</option>
            </select>
          </label>
          <label className="field">
            <span>{t.filterSensor}</span>
            <select
              value={sensor}
              onChange={(e) => {
                setSensor(e.target.value as DemoSensorFilter);
                setSelected(null);
              }}
            >
              <option value="all">{t.allSensors}</option>
              <option value="MODIS">MODIS</option>
              <option value="VIIRS">VIIRS</option>
            </select>
          </label>
        </div>
      </section>
      <section className="card" aria-label={c.provenance}>
        <h2>{c.provenance}</h2>
        <p>
          <a
            href="https://firms.modaps.eosdis.nasa.gov/"
            target="_blank"
            rel="noopener noreferrer"
          >
            NASA FIRMS
          </a>{" "}
          · {c.observed}
        </p>
        <p>
          {c.downloaded}:{" "}
          <time dateTime={snapshot.downloadedAt}>
            {format(snapshot.downloadedAt)} UTC
          </time>
        </p>
        <ul>
          {snapshot.products.map((p) => (
            <li key={p.source}>
              {p.source}:{" "}
              {p.status === "ok"
                ? `${p.from} — ${p.through} · ${p.records} ${c.records}`
                : c.unavailable}
            </li>
          ))}
        </ul>
        {partial && (
          <p className="warning-box" role="status">
            {c.partial}
          </p>
        )}
        <p>{c.limits}</p>
        <p>{c.emptyWarning}</p>
      </section>
      <section className="activity-grid" aria-label={c.map}>
        <article className="card map-card">
          <h2>{c.map}</h2>
          <FireMap
            detections={visible}
            mode="recent"
            sensor={sensor}
            onSensorChange={(s) => {
              setSensor(s);
              setSelected(null);
            }}
            onSelect={(d) => setSelected(d.id)}
            activity
            labels={{
              ...t.mapLabels,
              demo: c.observed,
              list: c.list,
              attribution: c.attribution,
              activityUnit: c.unit,
              noData: c.empty,
            }}
          />
        </article>
        <aside className="card detail-card">
          <h2>{t.detailTitle}</h2>
          {active ? (
            <dl className="detail-list">
              <div>
                <dt>{t.satellite}</dt>
                <dd>{active.satellite}</dd>
              </div>
              <div>
                <dt>{t.filterSensor}</dt>
                <dd>
                  {active.sensor} · {active.source}
                </dd>
              </div>
              <div>
                <dt>{t.acquiredAt}</dt>
                <dd>{format(active.acquiredAt)} UTC</dd>
              </div>
              <div>
                <dt>{t.localTime}</dt>
                <dd>{format(active.acquiredAt, "America/Santo_Domingo")}</dd>
              </div>
              <div>
                <dt>{t.coordinates}</dt>
                <dd>[{active.coordinates.join(", ")}]</dd>
              </div>
              <div>
                <dt>{t.confidence}</dt>
                <dd>
                  {active.confidence}
                  {active.sensor === "MODIS" ? "%" : ""}
                </dd>
              </div>
              <div>
                <dt>{t.frp}</dt>
                <dd>
                  {active.frpMw === null ? c.unavailable : `${active.frpMw} MW`}
                </dd>
              </div>
            </dl>
          ) : (
            <p role="status">{available.length ? c.empty : c.failed}</p>
          )}
          <p className="warning-box">{t.notConfirmed}</p>
          <p>
            {c.list}: {visible.length}
          </p>
          <p>{c.displayLimit}</p>
          <div className="detection-list">
            {visible.slice(0, 200).map((r) => (
              <button
                key={r.id}
                type="button"
                className="detection-row"
                aria-pressed={active?.id === r.id}
                onClick={() => setSelected(r.id)}
              >
                {r.sensor} · {format(r.acquiredAt)} UTC
              </button>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
