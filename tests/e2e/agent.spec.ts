import { expect, test } from "@playwright/test";

test("assistant streams an explicitly labeled offline turn in Spanish", async ({
  page,
}) => {
  await page.goto("/es/asistente");
  await expect(
    page.getByRole("heading", { level: 1, name: "Asistente FireSync" }),
  ).toBeVisible();
  await page.getByLabel("Tu mensaje").fill("¿Qué es una detección satelital?");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page.getByText("Esta es una demostración guionizada", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Demostración guionizada · sin conexión a Muse", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("assistant switches language and handles server failure", async ({
  page,
}) => {
  await page.goto("/en/asistente");
  await expect(
    page.getByRole("heading", { level: 1, name: "FireSync assistant" }),
  ).toBeVisible();
  await page.route("**/api/agent/chat", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "META_CONFIG_REQUIRED" }),
    }),
  );
  await page.getByLabel("Your message").fill("Explain this alert");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Muse still needs");
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible();
});
