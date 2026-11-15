import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar } from "@/components/calendar";
import { dictionaries } from "@/components/messages";
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "es" && locale !== "en") notFound();
  const t = dictionaries[locale];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="intro">{t.intro}</p>
          <div className="actions">
            <Link className="button primary" href={`/${locale}/mapa`}>
              {t.explore}
              <span aria-hidden="true">↗</span>
            </Link>
            <Link
              className="button secondary"
              href={`/${locale}/mapa?caso=demo`}
            >
              {t.tryCase}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <Link className="method-link" href={`/${locale}/mapa#method`}>
            {t.methodLink}
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="contour c1" />
          <div className="contour c2" />
          <div className="contour c3" />
          <div className="contour c4" />
          <div className="sun" />
          <span className="art-cross">+</span>
        </div>
      </section>
      <Calendar locale={locale} />
      <section className="steps">
        {[
          { label: t.step1, title: t.step1Title, text: t.step1Text },
          { label: t.step2, title: t.step2Title, text: t.step2Text },
          { label: t.step3, title: t.step3Title, text: t.step3Text },
        ].map((step) => (
          <article key={step.label}>
            <p className="eyebrow">{step.label}</p>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </section>
    </>
  );
}
