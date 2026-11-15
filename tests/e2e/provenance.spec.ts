import { test, expect } from "@playwright/test";

test("Actualidad shows a readable provenance block and follows sensor filters", async ({
  page,
}) => {
  await page.goto("/es/actualidad");

  const block = page.getByRole("region", {
    name: "Procedencia de los datos",
  });
  await expect(block).toBeVisible();
  await expect(block).toContainText("Fixture sintético de demostración");
  await expect(block).toContainText("NASA FIRMS · no conectado");
  await expect(block).toContainText("No disponible");
  await expect(block).toContainText("adquisición sintética");

  const newest = block.locator("[data-provenance-newest]");
  const allSensors = await newest.textContent();

  await page.getByLabel("Sensor").selectOption("VIIRS");
  await expect(newest).not.toHaveText(allSensors ?? "");
  await expect(block).toContainText("adquisición sintética");

  await page.getByRole("button", { name: "MODIS", exact: true }).click();
  await expect(page.getByLabel("Sensor")).toHaveValue("MODIS");
  await expect(newest).toHaveText(allSensors ?? "");
});
