import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const fits = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
}

test("home shows the hero, live map card and monthly heatmap", async ({
  page,
}) => {
  await page.goto("/es");
  await expect(
    page.getByRole("heading", {
      name: "¿La actividad de fuego en esta zona se salió de lo habitual?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explorar el calendario", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Probar un caso", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".hero-photo")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mapa de la zona" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Calendario ilustrativo de actividad ficticia",
    }),
  ).toBeVisible();
  await expect(page.locator("nav a")).toHaveCount(7);
  await expectNoPageOverflow(page);
});

test("history selects a month, filters the map by day and downloads CSV", async ({
  page,
}) => {
  await page.goto("/es/mapa");
  await page
    .getByRole("button", { name: "Ene 2025: Nivel ilustrativo bajo" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Detalle de demostración/ }),
  ).toBeVisible();
  const output = page.locator("output");
  const initialDay = await output.textContent();
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect
    .poll(async () => output.textContent(), { timeout: 6000 })
    .not.toBe(initialDay);
  await page.getByRole("button", { name: "Pausar" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar CSV sintético" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("firesync-historial");
  const path = await download.path();
  expect(path).toBeTruthy();
  const text = await readFile(path as string, "utf8");
  expect(text).toContain("Datos sintéticos");
  expect(text).toContain("sintético");
  await expectNoPageOverflow(page);
});

test("latest activity filters detections by period and sensor", async ({
  page,
}) => {
  await page.goto("/es/actualidad");
  await expect(
    page.getByText("Una detección satelital no es un incendio confirmado."),
  ).toBeVisible();
  await expect(page.locator(".detection-list button")).toHaveCount(5);
  await expect(page.locator(".fmap-list li")).toHaveCount(5);
  await page.getByLabel("Período").selectOption("168");
  await expect(page.locator(".detection-list button")).toHaveCount(6);
  await expect(page.locator(".fmap-list li")).toHaveCount(6);
  await page.getByLabel("Sensor").selectOption("MODIS");
  await expect(page.locator(".detection-list button")).toHaveCount(3);
  await expect(page.locator(".fmap-list li")).toHaveCount(3);
  await expect(page.locator(".detection-list button").first()).toContainText(
    "MODIS",
  );
  await expectNoPageOverflow(page);
});

test("prevention shows reviewed resources and downloads a synthetic sheet", async ({
  page,
}) => {
  await page.goto("/es/prevencion");
  await expect(
    page.getByRole("heading", {
      name: "Recursos oficiales verificados",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Llamar al 9-1-1" }),
  ).toHaveAttribute("href", "tel:911");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar ficha (.txt)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("firesync-ficha");
  expect(download.suggestedFilename()).toContain("demo.txt");
  const path = await download.path();
  expect(path).toBeTruthy();
  const text = await readFile(path as string, "utf8");
  expect(text).toContain("sintético");
  await expectNoPageOverflow(page);
});
