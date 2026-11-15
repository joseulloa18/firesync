import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar } from "@/components/calendar";
import { dictionaries, sections } from "@/components/messages";
export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; section: string }>;
  searchParams: Promise<{ caso?: string }>;
}) {
  const { locale, section } = await params;
  if (
    (locale !== "es" && locale !== "en") ||
    !sections.some((value) => value === section)
  )
    notFound();
  const t = dictionaries[locale];
  const title = t.nav[section as (typeof sections)[number]];
  const { caso } = await searchParams;
  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{t.demo}</p>
        <h1>{title}</h1>
        <p>{t.demoNotice}</p>
      </section>
      {section === "mapa" ? (
        <>
          <Calendar key={caso} locale={locale} example={caso === "demo"} />
          <section id="method" className="empty-card">
            <h2>{t.methodTitle}</h2>
            <p>{t.methodText}</p>
          </section>
        </>
      ) : (
        <section className="empty-card">
          <p className="eyebrow">{t.pending}</p>
          <h2>{t.empty}</h2>
          <p>{t.placeholder}</p>
          {section === "zonas" && <p>{t.private}</p>}
          {section === "respuesta" && <p>{t.restricted}</p>}
          {(section === "prevencion" || section === "respuesta") && (
            <p>{t.emergency}</p>
          )}
          <Link className="button secondary" href={`/${locale}/mapa?caso=demo`}>
            {t.tryCase} →
          </Link>
        </section>
      )}
    </>
  );
}
