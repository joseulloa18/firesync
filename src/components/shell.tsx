"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { dictionaries, sections, type Locale } from "./messages";

export function Shell({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const t = dictionaries[locale];
  const pathname = usePathname();
  const search = useSearchParams();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <>
      <a className="skip" href="#main">
        {t.skip}
      </a>
      <header>
        <div className="topbar">
          <Link className="brand" href={`/${locale}`}>
            <span className="brand-mark" aria-hidden="true">
              ◉
            </span>
            <span>
              {t.brand}
              <small>{t.tagline}</small>
            </span>
          </Link>
          <div className="languages" role="group" aria-label={t.language}>
            {(["es", "en"] as const).map((language) => (
              <Link
                key={language}
                href={`${pathname.replace(/^\/(es|en)(?=\/|$)/, `/${language}`)}${search.size ? `?${search}` : ""}`}
                aria-current={locale === language ? "true" : undefined}
                lang={language}
              >
                {language.toUpperCase()}
              </Link>
            ))}
          </div>
        </div>
        <nav aria-label={t.brand}>
          <Link
            href={`/${locale}`}
            aria-current={pathname === `/${locale}` ? "page" : undefined}
          >
            {t.nav.home}
          </Link>
          {sections.map((section) => (
            <Link
              key={section}
              href={`/${locale}/${section}`}
              aria-current={
                pathname === `/${locale}/${section}` ? "page" : undefined
              }
            >
              {t.nav[section]}
            </Link>
          ))}
        </nav>
      </header>
      {offline && (
        <p className="notice" role="status">
          {t.offline}
        </p>
      )}
      <main id="main">{children}</main>
      <footer>
        <p className="footer-brand">{t.brand}</p>
        <p>{t.footer}</p>
        <p>{t.warning}</p>
        <p>{t.attribution}</p>
        <p>{t.emergency}</p>
      </footer>
    </>
  );
}
