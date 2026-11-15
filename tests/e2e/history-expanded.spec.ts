import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const currentYear = new Date().getUTCFullYear();

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const fits = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
}

test("historial abre en resumen, con 2000 primero y sin detalle diario", async ({
  page,
}) => {
  await page.goto("/es/mapa");

  // Vista inicial: matriz completa, sin mes preseleccionado ni detalle diario.
  await expect(page.locator(".history-detail")).toHaveCount(0);
  await expect(
    page.getByText("Selecciona un mes para explorar el ejemplo.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Calendario ilustrativo de actividad ficticia",
    }),
  ).toBeVisible();

  const from = page.getByLabel("Desde el año");
  const to = page.getByLabel("Hasta el año");
  const fromValues = await from
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
  expect(fromValues[0]).toBe("2000");
  expect(fromValues.at(-1)).toBe(String(currentYear));
  await expect(from).toHaveValue("2000");
  await expect(to).toHaveValue(String(currentYear));

  // Los meses futuros existen, están marcados y no se pueden abrir.
  const futureMonths = page.locator(".heat.is-future");
  expect(await futureMonths.count()).toBeGreaterThan(0);
  await expect(futureMonths.first()).toBeDisabled();

  await expectNoPageOverflow(page);
});

test("abrir un mes muestra todos sus días, febrero bisiesto y ceros; cerrar vuelve", async ({
  page,
}) => {
  await page.goto("/es/mapa");

  await page.locator('button[aria-label^="Feb 2024:"]').click();
  await expect(
    page.getByRole("heading", { name: "Detalle de demostración · Feb 2024" }),
  ).toBeVisible();

  // Febrero de 2024 tiene 29 días; se listan todos, también los ceros.
  await expect(page.locator(".history-day")).toHaveCount(29);
  expect(await page.locator(".history-day.is-empty").count()).toBeGreaterThan(
    0,
  );
  await expect(page.locator(".history-day.is-future")).toHaveCount(0);

  // Elegir el 29 muestra su ficha diaria (aunque no tenga detecciones).
  await page.locator(".history-day").nth(28).click();
  await expect(
    page.getByRole("heading", { name: /Registros del día · 29 Feb 2024/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  await expect(page.locator(".history-detail")).toHaveCount(0);
  await expect(
    page.getByText("Selecciona un mes para explorar el ejemplo.", {
      exact: true,
    }),
  ).toBeVisible();
  await expectNoPageOverflow(page);
});

test("febrero no bisiesto muestra 28 días y el rango cambia el calendario", async ({
  page,
}) => {
  await page.goto("/es/mapa");

  await page.locator('button[aria-label^="Feb 2023:"]').click();
  await expect(page.locator(".history-day")).toHaveCount(28);
  await page.getByRole("button", { name: "Cerrar detalle" }).click();

  await page.getByLabel("Desde el año").selectOption("2020");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(currentYear - 2020 + 1);
  await expect(page.locator('th[scope="row"]').last()).toHaveText("2020");

  // El mes en curso (o el siguiente) se distingue de un mes con cero actividad.
  const partial = page.locator(".heat.is-partial");
  if ((await partial.count()) > 0) {
    await expect(partial.first()).toBeEnabled();
  }
  await expectNoPageOverflow(page);
});

test("el caso demo abre el detalle y el CSV conserva sensor, rango y día", async ({
  page,
}) => {
  await page.goto("/es/mapa?caso=demo");
  await expect(
    page.getByRole("heading", { name: /Detalle de demostración · Feb 2025/ }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar CSV sintético" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("firesync-historial");
  const path = await download.path();
  expect(path).toBeTruthy();
  const text = await readFile(path as string, "utf8");
  expect(text).toContain("Datos sintéticos");
  expect(text).toContain("# Sensor: Ambos sensores");
  expect(text).toContain(`# Rango de años: 2000-${currentYear}`);
  expect(text).toContain("synthetic-demo");
  expect(text).toContain("observado simulado");
  expect(text).toContain("2025-02-01");
  expect(text).toContain("2025-02-28");
  await expectNoPageOverflow(page);
});
