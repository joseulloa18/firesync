"use client";
import { Icon } from "./icon";
import { dictionaries, type Locale } from "./messages";
import type { Provenance } from "@/lib/provenance";

function formatUtc(iso: string, locale: Locale, utcLabel: string) {
  const formatted = new Intl.DateTimeFormat(
    locale === "es" ? "es-DO" : "en-US",
    { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" },
  ).format(new Date(iso));
  return `${formatted} ${utcLabel}`;
}

export function DataProvenance({
  locale,
  provenance,
}: {
  locale: Locale;
  provenance: Provenance;
}) {
  const t = dictionaries[locale];
  const copy = t.provenance;
  const newest =
    provenance.status === "ready" ? provenance.newestAcquiredAt : null;

  return (
    <section
      className="card data-provenance"
      aria-labelledby="provenance-title"
      data-provenance-block
    >
      <div className="card-head">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="provenance-title">{copy.title}</h2>
          <p className="card-subtitle">{copy.subtitle}</p>
        </div>
        <span className="card-icon" aria-hidden="true">
          <Icon name="activity" size={21} />
        </span>
      </div>

      <dl className="detail-list">
        <div>
          <dt>{copy.sourceLabel}</dt>
          <dd>{copy.sourceSynthetic}</dd>
        </div>
        <div>
          <dt>{copy.providerLabel}</dt>
          <dd>{copy.providerValue}</dd>
        </div>
        <div>
          <dt>{copy.newestLabel}</dt>
          <dd data-provenance-newest>
            {newest ? (
              <>
                <time dateTime={newest}>
                  {formatUtc(newest, locale, t.utc)}
                </time>{" "}
                · {copy.syntheticAcquisition}
              </>
            ) : (
              copy.noData
            )}
          </dd>
        </div>
        <div>
          <dt>{copy.ingestionLabel}</dt>
          <dd>{copy.ingestionUnavailable}</dd>
        </div>
        <div>
          <dt>{copy.recordsLabel}</dt>
          <dd>{provenance.visibleRecords}</dd>
        </div>
      </dl>

      <p className="demo-note">{copy.note}</p>
    </section>
  );
}
