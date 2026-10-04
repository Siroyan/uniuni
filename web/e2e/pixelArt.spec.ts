import { expect, test } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

test("部品サイズのドット絵を描いて登録し、再読込とZIPへ保存できる", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText(/Core: WASM/)).toBeVisible();

  const editor = page.getByRole("complementary", { name: "Part Editor" });
  const selector = editor.locator("select.net-select").first();
  const canvas = editor.getByRole("img", { name: /ドット絵キャンバス/ });
  await expect(canvas).toHaveAttribute("width", "24");
  await expect(canvas).toHaveAttribute("height", "8");

  await selector.selectOption({ label: "Pin Header 2x3" });
  await expect(canvas).toHaveAttribute("width", "16");
  await expect(canvas).toHaveAttribute("height", "24");

  await page.locator(".part-card").filter({ hasText: "Pin Header 2x3" }).click();
  await page.locator("canvas.board-canvas").click({ position: { x: 240, y: 200 } });
  await selector.selectOption({ label: "Resistor Axial" });
  await page.getByRole("group", { name: "編集ツール" }).getByRole("button", { name: "選択" }).click();
  await page.locator("canvas.board-canvas").click({ position: { x: 240, y: 200 } });
  await expect(selector.locator("option:checked")).toHaveText("Pin Header 2x3");
  await expect(canvas).toHaveAttribute("width", "16");

  await selector.selectOption({ label: "Resistor Axial" });
  const thumbnail = page.locator(".part-card").filter({ hasText: "Resistor Axial" }).locator("img");
  await expect(thumbnail).toHaveAttribute("src", /^data:image\/png;base64,/);
  const originalImage = await thumbnail.getAttribute("src");
  await expect(editor.getByRole("button", { name: "部品画像に登録" })).toBeEnabled();
  await canvas.click({ position: { x: 5, y: 5 } });
  await canvas.click({ position: { x: 15, y: 5 } });
  await editor.getByRole("button", { name: "消しゴム" }).click();
  await canvas.click({ position: { x: 15, y: 5 } });
  await expect(editor.getByText("未登録の変更あり")).toBeVisible();
  await expect(thumbnail).toHaveAttribute("src", originalImage!);

  await editor.getByRole("button", { name: "部品画像に登録" }).click();
  await expect(editor.getByText("未登録の変更あり")).toBeHidden();
  await expect(thumbnail).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect.poll(() => thumbnail.getAttribute("src")).not.toBe(originalImage);
  await expect(thumbnail).toHaveCSS("image-rendering", "pixelated");
  const pngPixels = await thumbnail.evaluate(async (img) => {
    const image = img as HTMLImageElement;
    await image.decode();
    const out = document.createElement("canvas");
    out.width = image.naturalWidth;
    out.height = image.naturalHeight;
    const context = out.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return {
      width: out.width,
      height: out.height,
      first: Array.from(context.getImageData(0, 0, 1, 1).data),
      erased: Array.from(context.getImageData(1, 0, 1, 1).data)
    };
  });
  expect(pngPixels).toEqual({ width: 24, height: 8, first: [38, 54, 74, 255], erased: [0, 0, 0, 0] });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export ZIP" }).click()
  ]);
  const directory = await mkdtemp(path.join(tmpdir(), "uniuni-pixel-art-"));
  const downloaded = path.join(directory, "project.zip");
  await download.saveAs(downloaded);
  const zip = await JSZip.loadAsync(await readFile(downloaded));
  const library = JSON.parse(await zip.file("part-library.json")!.async("string")) as {
    partDefs: Array<{ name: string; imageAssetId: string | null; imageAssetMime: string | null; imagePixelated?: boolean }>;
  };
  const resistor = library.partDefs.find((def) => def.name === "Resistor Axial");
  expect(resistor?.imageAssetMime).toBe("image/png");
  expect(resistor?.imagePixelated).toBe(true);
  expect(zip.file(`assets/${resistor?.imageAssetId}`)).not.toBeNull();

  await page.reload();
  await expect(thumbnail).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(thumbnail).toHaveCSS("image-rendering", "pixelated");
  await expect(canvas).toHaveAttribute("width", "24");
  await expect(editor.getByRole("button", { name: "部品画像に登録" })).toBeEnabled();
});

test("旧ライブラリには7種類の絵を一度だけ追加し、利用者の画像削除を維持する", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText(/Core: WASM/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export ZIP" }).click()
  ]);
  const directory = await mkdtemp(path.join(tmpdir(), "uniuni-art-migration-"));
  const downloaded = path.join(directory, "project.zip");
  await download.saveAs(downloaded);
  const zip = await JSZip.loadAsync(await readFile(downloaded));
  const project = JSON.parse(await zip.file("project.json")!.async("string")) as { part_defs: unknown[] };
  await page.evaluate(async (defs) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("uniuni-db");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("part_library", "readwrite");
      tx.objectStore("part_library").put({ schemaVersion: 2, builtInCatalogVersion: 1, partDefs: defs }, "default_library");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, project.part_defs);

  await page.reload();
  await expect(page.locator(".part-card img")).toHaveCount(7);
  const editor = page.getByRole("complementary", { name: "Part Editor" });
  await editor.getByRole("button", { name: "Clear Image" }).click();
  await expect(page.locator(".part-card").filter({ hasText: "Resistor Axial" }).locator("img")).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("uniuni-db");
      request.onsuccess = () => resolve(request.result);
    });
    const snapshot = await new Promise<{ builtInCatalogVersion: number; partDefs: Array<{ imageAssetId: string | null }> }>((resolve) => {
      const request = db.transaction("part_library", "readonly").objectStore("part_library").get("default_library");
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return [snapshot.builtInCatalogVersion, snapshot.partDefs[0].imageAssetId];
  })).toEqual([2, null]);
  await page.reload();
  await expect(page.locator(".part-card img")).toHaveCount(6);
});
