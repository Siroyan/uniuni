import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

type ExportedProject = {
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
  await page.goto("/");
  await expect(page.getByText(/Core:/)).toBeVisible();
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
    indexedDB.deleteDatabase("uniuni-db");
  });
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
