import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

type ExportedProject = {
  part_defs: Array<{ id: string; name: string; pins: Array<{ name: string; pos: { x: number; y: number } }>; occupied: unknown[] }>;
  part_insts: Array<{ def_id: string; refdes: string; net_assign: Record<string, string> }>;
  wires: Array<{ net_id: string; path: unknown[] }>;
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

test("ネット欄は必要な操作だけを表示し、名前と色を編集できる", async ({ page }) => {
  await openApp(page);
  const netCard = page.locator("section.tool-card").filter({
    has: page.getByRole("heading", { name: "ネット", exact: true })
  });

  await expect(netCard.getByRole("button")).toHaveCount(2);
  await netCard.getByRole("button", { name: "追加" }).click();
  await netCard.getByRole("textbox", { name: "名前" }).fill("Signal");
  await netCard.getByRole("textbox", { name: "名前" }).press("Enter");
  await expect(netCard.locator("#net-select option:checked")).toHaveText("Signal");

  await netCard.locator("summary").click();
  const applyColor = netCard.getByRole("button", { name: "色を適用" });
  await expect(applyColor).toBeDisabled();
  await netCard.locator("#net-color-input").fill("#2357a8");
  await applyColor.click();
  await expect(netCard.locator(".net-color-chip")).toHaveCSS("background-color", "rgb(35, 87, 168)");
  await netCard.getByRole("button", { name: "既定色に戻す" }).click();
  await expect(netCard.getByRole("button", { name: "既定色に戻す" })).toHaveCount(0);

  await page.keyboard.press("r");
  await clickGrid(page, 0, 0);
  await page.keyboard.press("Escape");
  await clickGrid(page, 0, 0);
  await netCard.locator("summary").filter({ hasText: "ピンを手動で割り当てる" }).click();
  await expect(netCard.getByRole("button", { name: "割り当て" })).toBeVisible();
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

test("ピンヘッダーを選んで配置できる", async ({ page }) => {
  await openApp(page);
  const library = await exportProject(page);
  expect(library.part_defs).toHaveLength(19);
  const header = library.part_defs.find((def) => def.name === "Pin Header 2x3");
  expect(header?.pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y])).toEqual([
    ["1", 0, 0], ["2", 1, 0],
    ["3", 0, 1], ["4", 1, 1],
    ["5", 0, 2], ["6", 1, 2]
  ]);

  await page.locator(".part-card").filter({ hasText: "Pin Header 2x3" }).click();
  await clickGrid(page, 0, 0);
  const project = await exportProject(page);
  expect(project.part_insts[0]?.def_id).toBe(header?.id);
  expect(project.part_insts[0]?.refdes).toBe("J1");
});

test("追加した6種類を画像付きで配置できる", async ({ page }) => {
  await openApp(page);
  const newParts = [
    { name: "Diode Axial", refdes: "D1", at: [0, 5] },
    { name: "LED 5mm", refdes: "D2", at: [6, 5] },
    { name: "Transistor TO-92", refdes: "Q1", at: [12, 5] },
    { name: "DIP-8 IC", refdes: "U1", at: [0, 12] },
    { name: "Terminal Block 2P", refdes: "J1", at: [6, 12] },
    { name: "Push Button 2P", refdes: "SW1", at: [12, 12] }
  ] as const;
  for (const part of newParts) {
    const card = page.locator(".part-card").filter({ hasText: part.name });
    await expect(card.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
    await card.click();
    await clickGrid(page, part.at[0], part.at[1]);
    await expect(page.locator(".workspace-hint span").last()).toHaveText(`選択: ${part.refdes}`);
  }

  const project = await exportProject(page);
  expect(project.part_insts).toHaveLength(6);
  const defsById = new Map(project.part_defs.map((def) => [def.id, def]));
  expect(project.part_insts.map((inst) => [defsById.get(inst.def_id)?.name, inst.refdes])).toEqual(
    newParts.map((part) => [part.name, part.refdes])
  );
  const dip = project.part_defs.find((def) => def.name === "DIP-8 IC");
  expect(dip?.pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y])).toEqual([
    ["1", 0, 0], ["2", 0, 1], ["3", 0, 2], ["4", 0, 3],
    ["5", 3, 3], ["6", 3, 2], ["7", 3, 1], ["8", 3, 0]
  ]);
});

test("新しい6種類を画像付きで配置できる", async ({ page }) => {
  await openApp(page);
  const newParts = [
    { name: "Capacitor Electrolytic", refdes: "C1", at: [0, 5] },
    { name: "TO-220 3-pin", refdes: "U1", at: [7, 5] },
    { name: "DIP-14 IC", refdes: "U2", at: [15, 5] },
    { name: "Slide Switch SPDT", refdes: "SW1", at: [0, 14] },
    { name: "Terminal Block 3P", refdes: "J1", at: [7, 14] },
    { name: "Trimmer 3P Inline", refdes: "RV1", at: [15, 14] }
  ] as const;
  for (const part of newParts) {
    const card = page.locator(".part-card").filter({ hasText: part.name });
    await expect(card.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
    await card.click();
    await clickGrid(page, part.at[0], part.at[1]);
    await expect(page.locator(".workspace-hint span").last()).toHaveText(`選択: ${part.refdes}`);
  }

  const project = await exportProject(page);
  expect(project.part_insts).toHaveLength(6);
  const defsById = new Map(project.part_defs.map((def) => [def.id, def]));
  expect(project.part_insts.map((inst) => [defsById.get(inst.def_id)?.name, inst.refdes])).toEqual(
    newParts.map((part) => [part.name, part.refdes])
  );
  const dip = project.part_defs.find((def) => def.name === "DIP-14 IC");
  expect(dip?.pins.map((pin) => [pin.name, pin.pos.x, pin.pos.y])).toEqual([
    ...Array.from({ length: 7 }, (_, y) => [String(y + 1), 0, y]),
    ...Array.from({ length: 7 }, (_, index) => [String(index + 8), 3, 6 - index])
  ]);
});

test("古い部品ライブラリへ一度だけ追加し、後の削除を維持する", async ({ page }) => {
  await openApp(page);
  const oldDefs = (await exportProject(page)).part_defs.slice(0, 3);
  await page.evaluate(async (defs) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("uniuni-db");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("part_library", "readwrite");
      tx.objectStore("part_library").put({ schemaVersion: 2, partDefs: defs }, "default_library");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, oldDefs);

  await page.reload();
  await expect(page.locator(".library-header span")).toHaveText("19 items");
  const migrated = await exportProject(page);
  expect(migrated.part_defs.slice(0, 3).map((def) => def.id)).toEqual(oldDefs.map((def) => def.id));

  await page.locator(".editor-sidebar select.net-select").first()
    .selectOption({ label: "Pin Header 1x2" });
  await page.locator(".editor-sidebar").getByRole("button", { name: "Delete Part" }).click();
  await expect(page.locator(".library-header span")).toHaveText("18 items");
  await page.reload();
  await expect(page.locator(".library-header span")).toHaveText("18 items");
  expect((await exportProject(page)).part_defs.some((def) => def.name === "Pin Header 1x2")).toBe(false);
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

test("線を引いて確定するだけで両端のピンが同じネットになる", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("r");
  await clickGrid(page, 0, 0);
  await clickGrid(page, 5, 0);
  await page.keyboard.press("w");
  for (const x of [2, 3, 4, 5]) await clickGrid(page, x, 0);
  await page.getByRole("button", { name: "配線を確定" }).click();
  await expect(page.getByRole("button", { name: "配線を確定" })).toBeDisabled();

  const project = await exportProject(page);
  const netId = project.wires[0]?.net_id;
  expect(project.wires).toHaveLength(1);
  expect(project.part_insts).toHaveLength(2);
  expect(project.part_insts[0]?.net_assign["2"]).toBe(netId);
  expect(project.part_insts[1]?.net_assign["1"]).toBe(netId);
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
  expect(project.part_defs).toHaveLength(19);
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
