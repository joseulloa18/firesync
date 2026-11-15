import { test, expect } from "@playwright/test";
test("default locale, example detail and language preservation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/es$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.getByRole("link", { name: "Probar un caso", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/mapa\?caso=demo$/);
  await expect(
    page.getByRole("heading", { name: /Detalle de demostración/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/mapa\?caso=demo$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: /Demonstration detail/ }),
  ).toBeVisible();
  const cell = page.getByRole("button", {
    name: "Jan 2025: High illustrative level",
  });
  await cell.focus();
  await page.keyboard.press("Enter");
  await expect(cell).toHaveAttribute("aria-pressed", "true");
});
test("all navigation destinations and health are available", async ({
  page,
  request,
}) => {
  for (const locale of ["es", "en"]) {
    for (const section of [
      "",
      "/mapa",
      "/actualidad",
      "/prevencion",
      "/laboratorio",
      "/zonas",
      "/respuesta",
    ]) {
      const response = await page.goto(`/${locale}${section}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("nav a")).toHaveCount(7);
    }
  }
  const response = await request.get("/api/health");
  expect(await response.json()).toMatchObject({
    mode: "demo",
    database: "not_connected",
    email: "disabled",
  });
});
