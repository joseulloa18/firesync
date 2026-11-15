import { getObservedRecent } from "@/lib/firms/observed-recent";
import { ObservedRecent } from "@/components/observed-recent";
import observedEs from "../../../../messages/observed.es.json";
import observedEn from "../../../../messages/observed.en.json";
import { notFound } from "next/navigation";
import Link from "next/link";
import { HistoryDashboard, RecentDashboard } from "@/components/dashboard";
import { Icon, type IconName } from "@/components/icon";
import { dictionaries, sections } from "@/components/messages";
import { PreventionResponseView } from "@/components/prevention-response";
import { parseResponseContext } from "@/lib/resources/official-resources";

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; section: string }>;
  searchParams: Promise<{
    caso?: string;
    zona?: string;
    [key: string]: string | string[] | undefined;
  }>;
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
  const search = await searchParams;
  const observed = section === "actualidad" ? await getObservedRecent() : null;
  const observedCopy = locale === "es" ? observedEs : observedEn;
  const intro = observed ? observedCopy.intro : t.sectionIntros[key];
  const { caso, zona } = search;
  const initialZone = typeof zona === "string" ? zona : undefined;
  const responseContext = parseResponseContext(search);
  const today = new Date().toISOString();
  const emptyIcon: IconName =
    section === "laboratorio"
      ? "flask"
      : section === "zonas"
        ? "pin"
        : "shield";

  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{observed ? observedCopy.observed : t.demo}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </section>
      {section === "mapa" ? (
        <>
          <HistoryDashboard
            key={caso}
            locale={locale}
            example={caso === "demo"}
            initialZone={initialZone}
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
        observed ? (
          <ObservedRecent locale={locale} snapshot={observed} />
        ) : (
          <RecentDashboard locale={locale} initialZone={initialZone} />
        )
      ) : section === "prevencion" || section === "respuesta" ? (
        <PreventionResponseView
          locale={locale}
          mode={section}
          context={responseContext}
          today={today}
        />
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
