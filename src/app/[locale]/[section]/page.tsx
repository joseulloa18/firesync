import { notFound } from "next/navigation";
import Link from "next/link";
import {
  HistoryDashboard,
  PreventionDashboard,
  RecentDashboard,
} from "@/components/dashboard";
import { Icon, type IconName } from "@/components/icon";
import { dictionaries, sections } from "@/components/messages";

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; section: string }>;
  searchParams: Promise<{ caso?: string; zona?: string }>;
}) {
  const { locale, section } = await params;
  if (
    (locale !== "es" && locale !== "en") ||
    !sections.some((value) => value === section)
  )
    notFound();
  const t = dictionaries[locale];
  const key = section as (typeof sections)[number];
  const title = t.nav[key];
  const intro = t.sectionIntros[key];
  const { caso, zona } = await searchParams;
  const emptyIcon: IconName =
    section === "laboratorio"
      ? "flask"
      : section === "zonas"
        ? "pin"
        : "shield";

  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{t.demo}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </section>
      {section === "mapa" ? (
        <>
          <HistoryDashboard
            key={caso}
            locale={locale}
            example={caso === "demo"}
            initialZone={zona}
          />
          <section id="method" className="empty-card method-card">
            <span className="resource-icon" aria-hidden="true">
              <Icon name="flask" size={20} />
            </span>
            <p className="eyebrow">{t.demo}</p>
            <h2>{t.methodTitle}</h2>
            <p>{t.methodText}</p>
          </section>
        </>
      ) : section === "actualidad" ? (
        <RecentDashboard locale={locale} initialZone={zona} />
      ) : section === "prevencion" ? (
        <PreventionDashboard locale={locale} initialZone={zona} />
      ) : (
        <section className="empty-card">
          <span className="resource-icon" aria-hidden="true">
            <Icon name={emptyIcon} size={20} />
          </span>
          <p className="eyebrow">{t.pending}</p>
          <h2>{t.empty}</h2>
          <p>{t.placeholder}</p>
          {section === "zonas" && <p>{t.private}</p>}
          {section === "respuesta" && <p>{t.restricted}</p>}
          {(section === "prevencion" || section === "respuesta") && (
            <p>{t.emergency}</p>
          )}
          <Link className="button secondary" href={`/${locale}/mapa?caso=demo`}>
            {t.tryCase}
            <Icon name="arrowRight" size={16} />
          </Link>
        </section>
      )}
    </>
  );
}
