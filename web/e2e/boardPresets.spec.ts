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
  const commit = page.getByRole("button", { name: "配線を確定" });
  await expect(commit).toBeDisabled();
  const bottom = page.locator("canvas.board-canvas-bottom");
  const bottomWidth = (await bottom.boundingBox())!.width;
  const mirroredPosition = (x: number, y: number) => ({ x: bottomWidth - position(x, y).x, y: position(x, y).y });
  await bottom.click({ position: mirroredPosition(5, 2) });
  await expect(commit).toBeDisabled();
  // Valid main-array row; commit through the WASM core.
  await canvas.click({ position: position(5, 5) });
  await bottom.click({ position: mirroredPosition(6, 5) });
  await commit.click();
  await page.keyboard.press("Escape");
  // Wait for the wire itself, not matching coordinates in the built-in part library.
  await expect.poll(async () => page.evaluate(async () => {
    return new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open("uniuni-db");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction("project_snapshots").objectStore("project_snapshots").get("active_project");
        read.onerror = () => { db.close(); reject(read.error); };
        read.onsuccess = () => {
          db.close();
          const state = read.result ? JSON.parse(read.result.coreStateJson) : null;
          resolve(state ? { profile: state.board.profile, paths: state.wires.map((wire: { path: unknown }) => wire.path) } : null);
        };
      };
    });
  })).toEqual({ profile: "arduino-uprotoshield-i", paths: [[{ x: 5, y: 5 }, { x: 6, y: 5 }]] });
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
