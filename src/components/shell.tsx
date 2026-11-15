"use client";
/* El logo se sirve como el archivo exacto aportado por el usuario, sin pasar por
   el optimizador de next/image; por eso se usa <img> y se silencia la sugerencia. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { dictionaries, sections, type Locale } from "./messages";
// Estilos propios de la marca. globals.css sigue siendo el archivo compartido y
// no se modifica desde aquí: brand.css solo cubre el logo del encabezado.
import "./brand.css";

// Logo exacto aportado por el usuario, sin recortes ni recoloreado.
const BRAND_LOGO = "/images/firesync-logo.jpeg";
// Dimensiones intrínsecas del archivo (919×887). Se declaran para reservar el
// espacio y conservar la proporción cuando el CSS fija solo la altura.
const BRAND_LOGO_WIDTH = 919;
const BRAND_LOGO_HEIGHT = 887;

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
      <header className="site-header">
        <div className="topbar">
          <Link className="brand" href={`/${locale}`}>
            {/* La imagen es decorativa (alt vacío): el nombre accesible del
                enlace lo aporta el texto visible «FireSync». */}
            <img
              className="brand-logo"
              src={BRAND_LOGO}
              alt=""
              width={BRAND_LOGO_WIDTH}
              height={BRAND_LOGO_HEIGHT}
              decoding="async"
            />
            <span className="brand-name">{t.brand}</span>
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
        <div>
          <p className="footer-brand">
            <img
              className="footer-brand-logo"
              src={BRAND_LOGO}
              alt=""
              width={BRAND_LOGO_WIDTH}
              height={BRAND_LOGO_HEIGHT}
              decoding="async"
            />
            {t.brand}
          </p>
          <p>{t.footer}</p>
        </div>
        <div>
          <p>{t.warning}</p>
          <p>{t.attribution}</p>
        </div>
        <div>
          <p>{t.emergency}</p>
          <p>{t.demoNotice}</p>
        </div>
      </footer>
    </>
  );
}
