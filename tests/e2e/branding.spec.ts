import { test, expect, type Page } from "@playwright/test";

// Archivo exacto aportado por el usuario. No se sustituye por iconos dibujados.
const LOGO_SRC = "/images/firesync-logo.jpeg";
// Proporción intrínseca del archivo entregado: 919 × 887 píxeles.
const LOGO_ASPECT = 919 / 887;
// Tolerancia de 1.5 % para el redondeo de píxeles del navegador.
const ASPECT_TOLERANCE = 0.015;

async function expectNoPageOverflow(page: Page) {
  const fits = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
}

/** Comprueba el logo del encabezado y que el texto es solo «FireSync». */
async function expectBrandHeader(page: Page, locale: "es" | "en") {
  const header = page.locator("header.site-header");
  const brand = header.getByRole("link", { name: "FireSync", exact: true });

  await expect(brand).toBeVisible();
  await expect(brand).toHaveAttribute("href", `/${locale}`);

  // El encabezado muestra el logo aportado, no un SVG decorativo anterior.
  const logo = brand.locator("img.brand-logo");
  await expect(logo).toHaveCount(1);
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", LOGO_SRC);
  await expect(brand.locator("svg")).toHaveCount(0);

  // La imagen real carga; un atributo src correcto no basta.
  await expect
    .poll(() =>
      logo.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(800);

  // Sin distorsión: la caja renderizada respeta la proporción del archivo.
  const box = await logo.boundingBox();
  expect(box).not.toBeNull();
  const renderedAspect = (box?.width ?? 0) / (box?.height ?? 1);
  expect(Math.abs(renderedAspect - LOGO_ASPECT)).toBeLessThan(ASPECT_TOLERANCE);

  // Solo el nombre: sin el subtítulo anterior ni una leyenda que lo sustituya.
  await expect(brand).toHaveText("FireSync");
  await expect(header.locator("small")).toHaveCount(0);
  await expect(
    header.getByText(/calendario de fuego|fire calendar/i),
  ).toHaveCount(0);
}

test("Spanish header shows the supplied logo and only the FireSync name", async ({
  page,
}) => {
  await page.goto("/es");
  await expectBrandHeader(page, "es");

  // Los siete destinos, el idioma y la navegación activa siguen intactos.
  const header = page.locator("header.site-header");
  await expect(header.locator("nav a")).toHaveCount(7);
  await expect(header.locator('nav a[aria-current="page"]')).toHaveText(
    "Inicio",
  );
  await expect(
    header.getByRole("link", { name: "ES", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    header.getByRole("link", { name: "EN", exact: true }),
  ).not.toHaveAttribute("aria-current", "true");

  // La marca del pie también usa el logo en vez del icono de llama anterior.
  const footerLogo = page.locator("footer .footer-brand-logo");
  await expect(footerLogo).toHaveAttribute("src", LOGO_SRC);

  await expectNoPageOverflow(page);
});

test("English header keeps the same logo and the FireSync name", async ({
  page,
}) => {
  await page.goto("/en");
  await expectBrandHeader(page, "en");

  const header = page.locator("header.site-header");
  await expect(header.locator("nav a")).toHaveCount(7);
  await expect(
    header.getByRole("link", { name: "EN", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expectNoPageOverflow(page);
});

test("brand fits a 390 px viewport without overflow or distortion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es");

  await expectBrandHeader(page, "es");
  await expectNoPageOverflow(page);

  const header = page.locator("header.site-header");
  const logo = header.locator("img.brand-logo");
  const logoBox = await logo.boundingBox();
  expect(logoBox).not.toBeNull();
  // El logo completo queda dentro de la pantalla y conserva tamaño legible.
  expect(logoBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((logoBox?.x ?? 0) + (logoBox?.width ?? 0)).toBeLessThanOrEqual(391);
  expect(logoBox?.height ?? 0).toBeGreaterThanOrEqual(32);

  // La navegación y el selector de idioma siguen alcanzables en móvil.
  await expect(header.locator("nav a")).toHaveCount(7);
  await expect(
    header.getByRole("link", { name: "EN", exact: true }),
  ).toBeVisible();
});
