import Link from "next/link";
import { notFound } from "next/navigation";
import { HomeDashboard } from "@/components/dashboard";
import { Icon } from "@/components/icon";
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
              <Icon name="calendar" size={17} />
              {t.explore}
              <Icon name="arrowUpRight" size={16} />
            </Link>
            <Link
              className="button secondary"
              href={`/${locale}/mapa?caso=demo`}
            >
              <Icon name="map" size={17} />
              {t.tryCase}
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <Link className="method-link" href={`/${locale}/mapa#method`}>
            {t.methodLink}
            <Icon name="arrowRight" size={14} />
          </Link>
        </div>
        <div className="hero-photo" aria-hidden="true" />
      </section>
      <svg
        className="hero-wave"
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0,50 C150,86 320,10 500,36 C690,64 810,92 1000,60 C1160,32 1300,18 1440,46 L1440,90 L0,90 Z"
          fill="currentColor"
        />
      </svg>
      <HomeDashboard locale={locale} />
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
