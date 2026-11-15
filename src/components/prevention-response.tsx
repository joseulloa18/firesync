"use client";

/**
 * Prevención y orientación pública de Respuesta.
 *
 * La vista es pública: no lee zonas privadas, correos, activos ni contactos.
 * El perfil estacional es sintético y los recursos solo se muestran cuando el
 * catálogo validado los marca como revisados y vigentes.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "./icon";
import { dictionaries, type Locale } from "./messages";
import {
  DEMO_ZONE_IDS,
  buildContextQuery,
  buildPriorityProfile,
  buildZoneSheet,
  loadOfficialResourceCatalog,
  reviewValidUntil,
  selectOfficialResources,
  type CatalogState,
  type DemoZoneId,
  type OfficialResource,
  type ResourceCategory,
  type ResponseContext,
  type ResponseDetectionContext,
} from "@/lib/resources/official-resources";
import "./prevention-response.css";

type Dict = (typeof dictionaries)[Locale];
type ViewMode = "prevencion" | "respuesta";

const categoryIcons: Record<ResourceCategory, IconName> = {
  prevention: "shield",
  reporting: "alert",
  bulletins: "activity",
};

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "es" ? "es-DO" : "en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

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

function formatDate(iso: string, locale: Locale) {
  const date =
    iso.length === 10 ? new Date(`${iso}T12:00:00.000Z`) : new Date(iso);
  return new Intl.DateTimeFormat(locale === "es" ? "es-DO" : "en-GB", {
    dateStyle: "medium",
    timeZone: "America/Santo_Domingo",
  }).format(date);
}

function formatDateTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-DO" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santo_Domingo",
  }).format(new Date(iso));
}

function categoryLabel(t: Dict, category: ResourceCategory) {
  if (category === "prevention") return t.preventionResponse.categoryPrevention;
  if (category === "reporting") return t.preventionResponse.categoryReporting;
  return t.preventionResponse.categoryBulletins;
}

function priorityLabel(t: Dict, index: number) {
  return index === 0
    ? t.priorityHigh
    : index === 1
      ? t.priorityMedium
      : t.priorityLow;
}

function saveTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ResourceCard({
  t,
  locale,
  resource,
}: {
  t: Dict;
  locale: Locale;
  resource: OfficialResource;
}) {
  const p = t.preventionResponse;
  return (
    <li className="pr-resource">
      <div className="pr-resource-top">
        <span className="pr-category">
          <Icon name={categoryIcons[resource.category]} size={14} />
          {categoryLabel(t, resource.category)}
        </span>
        <span className="pr-validity">
          <Icon name="check" size={13} />
          {p.validityCurrent}
        </span>
      </div>
      <h3>{resource.title}</h3>
      <p className="pr-resource-org">{resource.organization}</p>
      <a
        className="pr-resource-link"
        href={resource.url}
        target="_blank"
        rel="noreferrer noopener"
      >
        <span>{resource.url}</span>
        <Icon name="arrowUpRight" size={14} />
        <span className="pr-sr-only">{p.opensNewWindow}</span>
      </a>
      <dl className="pr-meta">
        <div>
          <dt>{p.reviewedAt}</dt>
          <dd>{formatDateTime(resource.checkedAt, locale)}</dd>
        </div>
        <div>
          <dt>{p.validUntil}</dt>
          <dd>{formatDate(reviewValidUntil(resource), locale)}</dd>
        </div>
        <div>
          <dt>{p.coverage}</dt>
          <dd>{p.coverageDo}</dd>
        </div>
        <div>
          <dt>{p.publishedAt}</dt>
          <dd>
            {resource.publishedAt
              ? formatDate(resource.publishedAt, locale)
              : p.publishedUnknown}
          </dd>
        </div>
      </dl>
      <p className="pr-resource-notes">{resource.notes}</p>
    </li>
  );
}

function ResourceSection({
  t,
  locale,
  mode,
  catalog,
  resources,
}: {
  t: Dict;
  locale: Locale;
  mode: ViewMode;
  catalog: CatalogState;
  resources: readonly OfficialResource[];
}) {
  const p = t.preventionResponse;
  const pending =
    catalog.status === "ready"
      ? catalog.excluded.filter((item) => item.reason === "pending").length
      : 0;
  const expired =
    catalog.status === "ready"
      ? catalog.excluded.filter((item) => item.reason === "expired").length
      : 0;
  const other =
    catalog.status === "ready"
      ? catalog.excluded.filter(
          (item) => item.reason === "demo" || item.reason === "region",
        ).length
      : 0;

  const excludedNotes = (
    <div className="pr-excluded" data-testid="excluded-resources">
      {pending > 0 ? (
        <p>{fill(p.excludedPending, { count: pending })}</p>
      ) : null}
      {expired > 0 ? (
        <p>{fill(p.excludedExpired, { count: expired })}</p>
      ) : null}
      {other > 0 ? <p>{fill(p.excludedOther, { count: other })}</p> : null}
      {pending === 0 && expired === 0 && other === 0 ? (
        <p>{p.excludedNone}</p>
      ) : null}
    </div>
  );

  if (catalog.status === "error") {
    return (
      <div className="pr-error" role="alert">
        <h3>{p.errorTitle}</h3>
        <p>{p.errorText}</p>
      </div>
    );
  }

  const categories: ResourceCategory[] =
    mode === "prevencion"
      ? ["prevention", "reporting"]
      : ["reporting", "bulletins"];

  return (
    <>
      {excludedNotes}
      {resources.length === 0 ? (
        <div className="pr-empty">
          <h3>{p.emptyResources}</h3>
          <p>{p.emptyResourcesNote}</p>
        </div>
      ) : (
        categories.map((category) => {
          const items = resources.filter(
            (resource) => resource.category === category,
          );
          if (items.length === 0) return null;
          return (
            <div
              className="pr-resource-group"
              key={category}
              aria-labelledby={`pr-resource-${category}`}
            >
              <h3 id={`pr-resource-${category}`}>
                {categoryLabel(t, category)}
              </h3>
              <ul className="pr-resource-list">
                {items.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    t={t}
                    locale={locale}
                    resource={resource}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </>
  );
}

export function PreventionResponseView({
  locale,
  mode,
  context,
  today,
}: {
  locale: Locale;
  mode: ViewMode;
  context: ResponseContext;
  today: string;
}) {
  const t = dictionaries[locale];
  const p = t.preventionResponse;
  const now = useMemo(() => new Date(today), [today]);
  const [zoneIndex, setZoneIndex] = useState(() => {
    const index = context.zone ? DEMO_ZONE_IDS.indexOf(context.zone) : 0;
    return index >= 0 ? index : 0;
  });
  const [detection, setDetection] = useState<ResponseDetectionContext | null>(
    context.detection,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const zoneId = DEMO_ZONE_IDS[zoneIndex];
  const zoneLabel = t.zoneOptions[zoneIndex];
  const profile = useMemo(
    () => buildPriorityProfile(zoneIndex, { now }),
    [zoneIndex, now],
  );
  const catalog = useMemo<CatalogState>(
    () => loadOfficialResourceCatalog(undefined, now),
    [now],
  );

  const selection = useMemo(() => {
    if (catalog.status !== "ready") return null;
    return selectOfficialResources(catalog.resources, {
      categories:
        mode === "prevencion"
          ? ["prevention", "reporting"]
          : ["reporting", "bulletins"],
      now,
    });
  }, [catalog, mode, now]);

  const visibleResources = selection?.visible ?? [];
  const linkQuery = buildContextQuery({ zone: zoneId, detection });

  function handleZoneChange(value: string) {
    const index = DEMO_ZONE_IDS.indexOf(value as DemoZoneId);
    if (index < 0) return;
    setZoneIndex(index);
    // Al cambiar de zona, el contexto de detección anterior deja de aplicar.
    setDetection(null);
    setStatusMessage(null);
  }

  function zoneSheetText() {
    return buildZoneSheet({
      zoneLabel,
      generatedAt: formatDateTime(now.toISOString(), locale),
      periodLabel: `${profile.fromYear}–${profile.toYear}`,
      monthNames: t.months,
      profile,
      resources: visibleResources,
      labels: {
        title: p.sheetTitle,
        generated: p.sheetGenerated,
        zone: t.filterZone,
        period: p.period,
        synthetic: p.sheetSynthetic,
        priority: p.priorityTitle,
        median: p.median,
        range: p.range,
        resources: p.resourcesTitle,
        reviewed: p.reviewedAt,
        noPrivate: p.sheetNoPrivate,
        emergency: t.emergency,
      },
    });
  }

  function downloadSheet() {
    saveTextFile(`firesync-ficha-${zoneId}-demo.txt`, zoneSheetText());
    setStatusMessage(p.downloadDone);
  }

  async function shareSheet() {
    const text = zoneSheetText();
    const shareUrl = `${window.location.origin}/${locale}/${mode}?${buildContextQuery({ zone: zoneId })}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: p.shareTitle, text, url: shareUrl });
        setStatusMessage(p.shareDone);
        return;
      }
      // Alternativa explícita cuando Web Share no existe en el navegador.
      downloadSheet();
      setStatusMessage(p.shareFallback);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatusMessage(p.shareError);
    }
  }

  const invalidContext =
    context.invalidFields.length > 0 ? (
      <p className="notice pr-invalid" role="status">
        <Icon name="alert" size={16} />
        {p.invalidContext}
      </p>
    ) : null;

  return (
    <div className="pr-view">
      <section className="card filter-bar pr-controls" aria-label={t.filters}>
        <div className="filter-grid">
          <label className="field">
            <span>{t.filterZone}</span>
            <select
              value={zoneId}
              onChange={(event) => handleZoneChange(event.target.value)}
              data-testid="zone-select"
            >
              {DEMO_ZONE_IDS.map((id, index) => (
                <option key={id} value={id}>
                  {t.zoneOptions[index]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="pr-public-note">
          <Icon name="shield" size={15} />
          {p.publicNote}
        </p>
      </section>

      {invalidContext}

      {mode === "prevencion" ? (
        <>
          <section className="pr-grid" aria-labelledby="pr-profile-title">
            <article className="card" data-testid="priority-profile">
              <div className="card-head">
                <div>
                  <p className="eyebrow">{t.demo}</p>
                  <h2 id="pr-profile-title">{p.profileTitle}</h2>
                  <p className="card-subtitle">
                    {fill(p.profileSubtitle, {
                      years: profile.years,
                      from: profile.fromYear,
                      to: profile.toYear,
                    })}
                  </p>
                </div>
                <span className="card-icon" aria-hidden="true">
                  <Icon name="calendar" size={21} />
                </span>
              </div>

              <p className="pr-synthetic">
                <Icon name="flask" size={16} />
                {p.profileSynthetic}
              </p>

              <p className="pr-facts">
                {p.period}: {profile.fromYear}–{profile.toYear} ·{" "}
                {p.sensorsLabel}: {profile.sensors.join(" · ")}
              </p>

              <ol className="pr-season" aria-label={p.profileTitle}>
                {profile.months.map((month) => {
                  const max = Math.max(
                    ...profile.months.map((item) => item.median),
                    1,
                  );
                  return (
                    <li
                      key={month.month}
                      aria-label={fill(p.monthAria, {
                        month: t.months[month.month],
                        median: formatNumber(month.median, locale),
                        min: formatNumber(month.min, locale),
                        max: formatNumber(month.max, locale),
                      })}
                    >
                      <span className="pr-season-month">
                        {t.months[month.month]}
                      </span>
                      <span className="pr-season-track" aria-hidden="true">
                        <span
                          className="pr-season-bar"
                          style={{
                            width: `${Math.max(4, (month.median / max) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="pr-season-value">
                        {formatNumber(month.median, locale)}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <h3 className="pr-subtitle">{p.priorityTitle}</h3>
              <ol className="pr-priority-list">
                {profile.priorityMonths.map((month, index) => (
                  <li key={month.month}>
                    <div>
                      <strong>{t.months[month.month]}</strong>
                      <span>
                        {fill(p.evidenceLine, {
                          median: formatNumber(month.median, locale),
                          min: formatNumber(month.min, locale),
                          max: formatNumber(month.max, locale),
                          years: month.years,
                        })}
                      </span>
                    </div>
                    <span className="priority-pill">
                      {priorityLabel(t, index)}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="helper">{p.priorityNote}</p>
            </article>

            <div className="pr-side">
              <article className="card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">{t.demo}</p>
                    <h2>{p.preparationTitle}</h2>
                  </div>
                  <span className="card-icon" aria-hidden="true">
                    <Icon name="shield" size={21} />
                  </span>
                </div>
                <p>{p.preparationText}</p>
                <a className="inline-link" href="#pr-resources">
                  {p.preparationAction}
                  <Icon name="arrowRight" size={15} />
                </a>
              </article>

              <article className="card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">{t.demo}</p>
                    <h2>{p.reportTitle}</h2>
                  </div>
                  <span className="card-icon" aria-hidden="true">
                    <Icon name="alert" size={21} />
                  </span>
                </div>
                <p>{p.reportText}</p>
                <div className="resource-actions">
                  <a className="button emergency" href="tel:911">
                    <Icon name="alert" size={16} />
                    {t.emergencyCall}
                  </a>
                  <a className="button secondary" href="#pr-resources">
                    {p.reportAction}
                    <Icon name="arrowRight" size={16} />
                  </a>
                </div>
              </article>
            </div>
          </section>

          <section
            className="card pr-resources-card"
            id="pr-resources"
            aria-labelledby="pr-resources-title"
            data-testid="official-resources"
          >
            <div className="card-head">
              <div>
                <p className="eyebrow">{t.demo}</p>
                <h2 id="pr-resources-title">{p.resourcesTitle}</h2>
                <p className="card-subtitle">{p.resourcesSubtitle}</p>
              </div>
              <span className="card-icon" aria-hidden="true">
                <Icon name="shield" size={21} />
              </span>
            </div>
            <ResourceSection
              t={t}
              locale={locale}
              mode={mode}
              catalog={catalog}
              resources={visibleResources}
            />
          </section>

          <section
            className="card pr-share"
            aria-labelledby="pr-share-title"
            data-testid="zone-sheet"
          >
            <div className="card-head">
              <div>
                <p className="eyebrow">{t.demo}</p>
                <h2 id="pr-share-title">{p.shareCardTitle}</h2>
                <p className="card-subtitle">{p.shareCardText}</p>
              </div>
              <span className="card-icon" aria-hidden="true">
                <Icon name="download" size={21} />
              </span>
            </div>
            <div className="resource-actions">
              <button
                className="button primary"
                type="button"
                onClick={() => void shareSheet()}
              >
                <Icon name="arrowUpRight" size={16} />
                {p.share}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={downloadSheet}
              >
                <Icon name="download" size={16} />
                {p.download}
              </button>
              <Link
                className="button secondary"
                href={`/${locale}/respuesta?${linkQuery}`}
              >
                {p.viewResponse}
                <Icon name="arrowRight" size={16} />
              </Link>
            </div>
            <p className="helper">{p.sheetNoPrivate}</p>
            {statusMessage ? (
              <p className="pr-status" role="status">
                {statusMessage}
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <>
          <section className="pr-grid" aria-labelledby="pr-detection-title">
            <article
              className="card pr-detection"
              data-testid="response-detection"
            >
              <div className="card-head">
                <div>
                  <p className="eyebrow">{t.demo}</p>
                  <h2 id="pr-detection-title">{p.detectionTitle}</h2>
                  <p className="card-subtitle">{p.detectionContextNote}</p>
                </div>
                <span className="card-icon" aria-hidden="true">
                  <Icon name="activity" size={21} />
                </span>
              </div>

              {detection ? (
                <>
                  <p className="warning-box">
                    <Icon name="alert" size={17} />
                    <span>{t.notConfirmed}</span>
                  </p>
                  <dl className="detail-list">
                    <div>
                      <dt>{t.detectionId}</dt>
                      <dd>{detection.id}</dd>
                    </div>
                    <div>
                      <dt>{t.filterSensor}</dt>
                      <dd>{detection.sensor}</dd>
                    </div>
                    <div>
                      <dt>{t.satellite}</dt>
                      <dd>{detection.satellite}</dd>
                    </div>
                    <div>
                      <dt>{t.acquiredAt}</dt>
                      <dd>{formatUtc(detection.acquiredAt, locale, t.utc)}</dd>
                    </div>
                    <div>
                      <dt>{t.localTime}</dt>
                      <dd>{formatLocal(detection.acquiredAt, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t.coordinates}</dt>
                      <dd>
                        [{detection.coordinates[0].toFixed(3)},{" "}
                        {detection.coordinates[1].toFixed(3)}]
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="pr-empty">
                  <h3>{p.detectionEmptyTitle}</h3>
                  <p>{p.detectionEmptyText}</p>
                </div>
              )}
            </article>

            <div className="pr-side">
              <article className="card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">{t.demo}</p>
                    <h2>{p.responseCardTitle}</h2>
                  </div>
                  <span className="card-icon" aria-hidden="true">
                    <Icon name="alert" size={21} />
                  </span>
                </div>
                <p>{p.responseSubheading}</p>
                <p className="pr-public-note">
                  <Icon name="shield" size={15} />
                  {p.publicNote}
                </p>
                <p className="helper">{p.operationalNote}</p>
                <div className="resource-actions">
                  <a className="button emergency" href="tel:911">
                    <Icon name="alert" size={16} />
                    {t.emergencyCall}
                  </a>
                  <Link
                    className="button secondary"
                    href={`/${locale}/prevencion?${linkQuery}`}
                  >
                    {t.viewPrevention}
                    <Icon name="arrowRight" size={16} />
                  </Link>
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">{t.demo}</p>
                    <h2>{p.reportTitle}</h2>
                  </div>
                  <span className="card-icon" aria-hidden="true">
                    <Icon name="shield" size={21} />
                  </span>
                </div>
                <p>{p.reportText}</p>
                <a className="inline-link" href="#pr-resources">
                  {p.reportAction}
                  <Icon name="arrowRight" size={15} />
                </a>
              </article>
            </div>
          </section>

          <section
            className="card pr-resources-card"
            id="pr-resources"
            aria-labelledby="pr-resources-title"
            data-testid="official-resources"
          >
            <div className="card-head">
              <div>
                <p className="eyebrow">{t.demo}</p>
                <h2 id="pr-resources-title">{p.resourcesTitle}</h2>
                <p className="card-subtitle">{p.resourcesResponseSubtitle}</p>
              </div>
              <span className="card-icon" aria-hidden="true">
                <Icon name="alert" size={21} />
              </span>
            </div>
            <ResourceSection
              t={t}
              locale={locale}
              mode={mode}
              catalog={catalog}
              resources={visibleResources}
            />
          </section>
        </>
      )}

      <p className="emergency-banner">
        <Icon name="alert" size={18} />
        <span>{t.emergency}</span>
      </p>
    </div>
  );
}
