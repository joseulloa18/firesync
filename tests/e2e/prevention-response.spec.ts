import { test, expect } from "@playwright/test";

const DETECTION_QUERY =
  "zona=south&deteccion=demo-viirs-01&lat=18.78&lon=-70.53&sensor=VIIRS&satelite=S-NPP&adquirido=2025-03-04T17%3A45%3A00.000Z";

test("Actualidad opens response with the selected known record", async ({
  page,
}) => {
  await page.goto("/es/actualidad");
  await page.getByRole("button", { name: "VIIRS", exact: true }).click();
  await page
    .getByRole("link", { name: "Ver canales de respuesta", exact: true })
    .click();
  const card = page.getByTestId("response-detection");
  await expect(card).toContainText("demo-viirs-002");
  await expect(card).toContainText("[-70.412, 18.735]");
  await expect(card).toContainText(
    "Una detección satelital no es un incendio confirmado.",
  );
  await expect(page).not.toHaveURL(/lat=|lon=|correo=/);
});

test("prevention connects verified resources and excludes pending or private data", async ({
  page,
}) => {
  await page.goto("/es/prevencion");

  await expect(
    page.getByRole("heading", { name: "Perfil histórico de la zona" }),
  ).toBeVisible();
  await expect(page.getByTestId("priority-profile")).toContainText(
    "Origen sintético de demostración",
  );

  const resources = page.getByTestId("official-resources");
  await expect(resources).toBeVisible();
  const nineOneOne = resources.getByRole("link", {
    name: /911\.gob\.do\/como-usarlo/,
  });
  await expect(nineOneOne).toHaveCount(0);

  await expect(resources).toContainText("Ministerio de Medio Ambiente");
  await expect(resources).toContainText("Revisión");
  await expect(resources).toContainText("Vigente hasta");
  await expect(resources).toContainText("Cobertura");
  await expect(resources).toContainText(
    "2 recurso pendiente de revisión no se muestra.",
  );
  await expect(
    resources.getByRole("link", { name: /Estrategia Nacional de Manejo/ }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("main")
      .locator(".pr-controls")
      .getByText(
        "Vista pública: no incluye zonas privadas, correos, activos ni contactos institucionales.",
      ),
  ).toBeVisible();
});

test("zone selector is keyboard accessible and the sheet downloads", async ({
  page,
}) => {
  await page.goto("/es/prevencion?zona=north");
  const select = page.getByTestId("zone-select");
  await expect(select).toHaveValue("north");

  await select.focus();
  await page.keyboard.press("ArrowDown");
  await expect(select).toHaveValue("south");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar ficha (.txt)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("firesync-ficha-south-demo.txt");
  await expect(page.getByText("Ficha descargada.")).toBeVisible();
});

test("share falls back to a downloadable sheet when Web Share is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/es/prevencion");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Compartir ficha" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("firesync-ficha-north-demo.txt");
  await expect(
    page.getByText("Web Share no está disponible en este navegador."),
  ).toBeVisible();
});

test("response preserves a valid detection context with the confirmation warning", async ({
  page,
}) => {
  await page.goto(`/es/respuesta?${DETECTION_QUERY}`);

  await expect(page.getByTestId("zone-select")).toHaveValue("south");
  const card = page.getByTestId("response-detection");
  await expect(card).toContainText("demo-viirs-01");
  await expect(card).toContainText("VIIRS");
  await expect(card).toContainText("S-NPP");
  await expect(card).toContainText("[-70.530, 18.780]");
  await expect(card).toContainText(
    "Una detección satelital no es un incendio confirmado.",
  );
  await expect(card).toContainText("UTC");
  await expect(
    page.getByText("Parte del contexto del enlace no es válido"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Ver prevención para esta zona/ }),
  ).toHaveAttribute("href", /zona=south/);
});

test("response shows an empty state instead of inventing missing context", async ({
  page,
}) => {
  await page.goto("/es/respuesta");
  const card = page.getByTestId("response-detection");
  await expect(card).toContainText("Sin detección seleccionada");
  await expect(card).not.toContainText("Coordenadas");
  await expect(page.getByText("Llamar al 9-1-1")).toBeVisible();

  await page.goto(
    "/es/respuesta?zona=unknown&lat=0&lon=0&sensor=nope&satelite=nope&adquirido=not-a-date",
  );
  await expect(
    page.getByText("Parte del contexto del enlace no es válido"),
  ).toBeVisible();
  await expect(page.getByTestId("response-detection")).toContainText(
    "Sin detección seleccionada",
  );
});

test("private parameters are ignored and never echoed", async ({ page }) => {
  await page.goto(
    "/es/respuesta?zona=north&correo=private%40example.com&email=private%40example.com",
  );
  await expect(page.getByText("private@example.com")).toHaveCount(0);
  await expect(
    page
      .getByRole("main")
      .locator(".pr-controls")
      .getByText(
        "Vista pública: no incluye zonas privadas, correos, activos ni contactos institucionales.",
      ),
  ).toBeVisible();
});

test("prevention and response are available in English", async ({ page }) => {
  await page.goto("/en/prevencion");
  await expect(
    page.getByRole("heading", { name: "Historical area profile" }),
  ).toBeVisible();
  await expect(page.getByTestId("official-resources")).toContainText(
    "Verified official resources",
  );

  await page.goto("/en/respuesta");
  await expect(
    page.getByRole("heading", { name: "Selected detection", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText("In an emergency call 9-1-1 in the Dominican Republic."),
  ).toBeVisible();
});
