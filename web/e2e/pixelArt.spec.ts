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
  await canvas.click({ position: { x: 5, y: 5 } });
  await canvas.click({ position: { x: 15, y: 5 } });
  await editor.getByRole("button", { name: "消しゴム" }).click();
  await canvas.click({ position: { x: 15, y: 5 } });
  await expect(editor.getByText("未登録の変更あり")).toBeVisible();
  await expect(page.locator(".part-card").filter({ hasText: "Resistor Axial" }).locator("img")).toHaveCount(0);

  await editor.getByRole("button", { name: "部品画像に登録" }).click();
  await expect(editor.getByText("未登録の変更あり")).toBeHidden();
  const thumbnail = page.locator(".part-card").filter({ hasText: "Resistor Axial" }).locator("img");
  await expect(thumbnail).toHaveAttribute("src", /^data:image\/png;base64,/);
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
