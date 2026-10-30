import { expect, test } from "@playwright/test";

test("Arduino preset persists, preserves custom dimensions, and validates holes in WASM", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("./");
  await expect(page.getByText(/Core: WASM/)).toBeVisible();
  const preset = page.locator("#board-preset-select");
  await preset.selectOption("arduino-uprotoshield-i");
  await page.getByRole("button", { name: "Apply Preset" }).click();
  await expect(page.getByText(/現在: 21x20 grid \(68.0x52.0mm\)/)).toBeVisible();
  await expect(page.getByText(/φ0.90mm・369穴/)).toBeVisible();
  // Missing row 2: wire draft must remain empty.
  await page.keyboard.press("w");
  const canvas = page.locator("canvas.board-canvas");
  const zoomText = await page.locator(".hud").innerText();
  const zoom = Number(zoomText.match(/zoom: ([\d.]+)x/)![1]);
  const position = (x: number, y: number) => ({ x: (170 + x * 24) * zoom, y: (80 + y * 24) * zoom });
  await canvas.click({ position: position(5, 2) });
  await page.getByRole("button", { name: "Commit Wire" }).click();
  // Valid main-array row; commit through the WASM core.
  await canvas.click({ position: position(5, 5) });
  await canvas.click({ position: position(6, 5) });
  await page.getByRole("button", { name: "Commit Wire" }).click();
  await page.keyboard.press("Escape");
  // Allow the existing delayed IndexedDB save to finish.
  await expect.poll(async () => page.evaluate(async () => {
    return new Promise<string | null>((resolve) => {
      const request = indexedDB.open("uniuni-db");
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction("project_snapshots").objectStore("project_snapshots").get("active_project");
        read.onsuccess = () => { db.close(); resolve(read.result?.coreStateJson ?? null); };
      };
    });
  })).toContain('"x":6,"y":5');
  const savedWireCount = await page.evaluate(async () => new Promise<number>((resolve) => {
    const request = indexedDB.open("uniuni-db");
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("project_snapshots").objectStore("project_snapshots").get("active_project");
      read.onsuccess = () => { db.close(); resolve(JSON.parse(read.result.coreStateJson).wires.length); };
    };
  }));
  expect(savedWireCount).toBe(1);
  await page.reload();
  await expect(preset).toHaveValue("arduino-uprotoshield-i");
  await expect(page.getByText(/現在: 21x20 grid \(68.0x52.0mm\)/)).toBeVisible();
  await preset.selectOption("custom");
  await page.getByRole("button", { name: "Apply Size" }).click();
  await expect(page.getByText(/φ0.90mm・369穴/)).toHaveCount(0);
  await expect(preset).toHaveValue("custom");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(preset).toHaveValue("arduino-uprotoshield-i");
  await page.screenshot({ path: test.info().outputPath("arduino-board-preview.png"), fullPage: true });
});
