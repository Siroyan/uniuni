import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

type ExportedProject = {
  part_defs: Array<{ occupied: unknown[] }>;
  part_insts: unknown[];
  wires: Array<{ path: unknown[] }>;
};

const CELL = 24;
const PAN_X = 120;
const PAN_Y = 80;

function gridPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: PAN_X + x * CELL,
    y: PAN_Y + y * CELL
  };
}

async function clickGrid(page: Page, x: number, y: number): Promise<void> {
  await page.locator("canvas.board-canvas").click({
    position: gridPosition(x, y)
  });
}

async function openApp(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.getByText(/Core: WASM/)).toBeVisible();
}

async function exportProject(page: Page): Promise<ExportedProject> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export ZIP" }).click()
  ]);
  const tempDir = await mkdtemp(path.join(tmpdir(), "uniuni-e2e-"));
  const filePath = path.join(tempDir, "project.zip");
  await download.saveAs(filePath);
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const projectFile = zip.file("project.json");
  expect(projectFile).not.toBeNull();
  const projectJson = await projectFile!.async("string");
  return JSON.parse(projectJson) as ExportedProject;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("uniuni-e2e-initialized")) {
      sessionStorage.setItem("uniuni-e2e-initialized", "1");
      indexedDB.deleteDatabase("uniuni-db");
    }
  });
});

test("狭い画面でも編集領域と設定を操作できる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  const canvas = page.locator("canvas.board-canvas");
  const assertCanvasSize = async (): Promise<void> => {
    await expect.poll(() => canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      return {
        widthGap: Math.abs(element.width - Math.floor(rect.width * scale)),
        heightGap: Math.abs(element.height - Math.floor(rect.height * scale))
      };
    })).toEqual({ widthGap: 0, heightGap: 0 });
  };

  expect((await canvas.boundingBox())?.height).toBeGreaterThan(350);
  await assertCanvasSize();
  await page.getByRole("button", { name: "設定を開く" }).click();
  await expect(page.getByRole("heading", { name: "基板設定" })).toBeVisible();
  await assertCanvasSize();
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await assertCanvasSize();

  await page.getByRole("group", { name: "編集ツール" }).getByRole("button", { name: "配置" }).click();
  await expect(page.getByRole("button", { name: "配置", exact: true })).toHaveAttribute("aria-pressed", "true");
  await clickGrid(page, 0, 0);
  await expect(page.getByRole("button", { name: "元に戻す" })).toBeEnabled();
});

test("部品を連続配置できる", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("r");
  await clickGrid(page, 0, 0);
  await clickGrid(page, 5, 0);
  await page.keyboard.press("Escape");

  const project = await exportProject(page);
  expect(project.part_insts.length).toBe(2);
});

test("手動配線を確定できる", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("r");
  await clickGrid(page, 0, 0);
  await page.keyboard.press("w");
  await clickGrid(page, 0, 0);
  await clickGrid(page, 0, 1);
  await clickGrid(page, 0, 2);
  await page.keyboard.press("Enter");

  const project = await exportProject(page);
  expect(project.wires.length).toBe(1);
  expect(project.wires[0]?.path.length).toBe(3);
});

test("Pin優先選択後にTabで候補を切替えて配線を削除できる", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("r");
  await clickGrid(page, 0, 0);
  await page.keyboard.press("w");
  await clickGrid(page, 0, 0);
  await clickGrid(page, 0, 1);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await clickGrid(page, 0, 0);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Delete");

  const project = await exportProject(page);
  expect(project.part_insts.length).toBe(1);
  expect(project.wires.length).toBe(0);
});

test("衝突する部品定義の編集は保存・ZIP 出力に反映されない", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("r");
  await clickGrid(page, 0, 0);
  await clickGrid(page, 5, 0);
  await page.keyboard.press("Escape");

  const occupiedEditor = page.locator(".editor-block").filter({ has: page.getByRole("heading", { name: "Occupied設定" }) });
  await occupiedEditor.locator('input[type="number"]').first().fill("5");
  await occupiedEditor.getByRole("button", { name: "Add Occ" }).click();
  await expect(page.locator(".editor-notice")).toContainText("part-part occupancy collision");
  await expect(occupiedEditor.locator("tbody tr")).toHaveCount(3);

  const project = await exportProject(page);
  expect(project.part_defs[0].occupied).toHaveLength(3);
});

test("不正な盤面を含む ZIP はインポートされない", async ({ page }) => {
  await openApp(page);
  const zip = new JSZip();
  zip.file("project.json", JSON.stringify({ schema_version: 99, board: { width: -5, height: 0, grid_pitch_mm: 2.54 }, part_defs: [], part_insts: [], nets: [], wires: [] }));
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  await page.locator('input[type="file"][accept="application/zip,.zip"]').setInputFiles({ name: "invalid.zip", mimeType: "application/zip", buffer: bytes });
  await expect(page.getByText(/unsupported project schema_version/)).toBeVisible();
  const project = await exportProject(page);
  expect(project.part_defs).toHaveLength(3);
});

test("設計データはブラウザーに保存され、外部へ送信されない", async ({ page }) => {
  const appOrigin = new URL(test.info().project.use.baseURL!).origin;
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== appOrigin) {
      externalRequests.push(request.url());
    }
  });

  await openApp(page);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]'))
    .toHaveAttribute("content", /connect-src 'self'/);
  await page.keyboard.press("r");
  await clickGrid(page, 0, 0);
  await page.keyboard.press("Escape");

  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("uniuni-db");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!db.objectStoreNames.contains("project_snapshots")) {
      db.close();
      return 0;
    }
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction("project_snapshots", "readonly")
        .objectStore("project_snapshots").get("active_project");
      request.onsuccess = () => resolve(request.result?.coreStateJson
        ? JSON.parse(request.result.coreStateJson).part_insts.length : 0);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  })).toBe(1);

  await page.reload();
  await expect(page.getByText(/Core: WASM/)).toBeVisible();
  const project = await exportProject(page);
  expect(project.part_insts).toHaveLength(1);
  expect(externalRequests).toEqual([]);
});
