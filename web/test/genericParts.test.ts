import assert from "node:assert/strict";
import test from "node:test";
import { addMissingGenericParts, genericPartDefs, genericRefdesPrefixes, leadSpacingPartDefs, transistorPackagePartDefs } from "../src/genericParts";
import { defaultPartDefs } from "../src/defaultParts";
import { absolutePins } from "../src/parts";
import { applyCoreCommandJson, commandAddPartInstJson, commandRotatePartInstJson, createInitialCoreStateJson, extractViewStateFromCoreJson } from "../src/coreBridge";

test("generic lead pitch is center-to-center and survives placement and rotation", async () => {
  assert.equal(leadSpacingPartDefs.length, 20);
  for (const family of ["Resistor", "Capacitor", "Inductor", "Diode"]) {
    for (const pitch of [2, 3, 4, 5, 6]) {
      const def = leadSpacingPartDefs.find((d) => d.name === `${family} ${pitch}-grid`)!;
      assert.ok(def);
      const initial = await createInitialCoreStateJson({ width: 30, height: 30, gridPitchMm: 2.54 }, [def]);
      let state = await applyCoreCommandJson(initial, commandAddPartInstJson(def.id, { x: 12, y: 12 }, "Deg0", "X1"));
      for (let i = 0; i < 4; i++) {
        const inst = extractViewStateFromCoreJson(state).parts[0];
        const [a, b] = absolutePins(def, inst);
        assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), pitch);
        assert.equal(a.x === b.x || a.y === b.y, true);
        state = await applyCoreCommandJson(state, commandRotatePartInstJson(inst.id, (["Deg90", "Deg180", "Deg270", "Deg0"] as const)[i]));
      }
      assert.deepEqual(def.pins.map((p) => p.name), family === "Diode" ? ["A", "K"] : ["1", "2"]);
      assert.equal(genericRefdesPrefixes[def.id], { Resistor: "R", Capacitor: "C", Inductor: "L", Diode: "D" }[family]);
    }
  }
});

test("generic catalog appends missing parts without overwriting ID or name matches", () => {
  const old = defaultPartDefs.filter((def) => !genericPartDefs.some((g) => g.id === def.id));
  const edited = { ...genericPartDefs[0], name: "My resistor", imageDataUrl: null };
  const sameName = { ...genericPartDefs[1], id: "11111111-1111-4111-8111-111111111111" };
  const upgraded = addMissingGenericParts([...old, edited, sameName]);
  assert.equal(upgraded.length, old.length + 24);
  assert.equal(upgraded.find((d) => d.id === edited.id), edited);
  assert.equal(upgraded.find((d) => d.name === sameName.name), sameName);
  assert.equal(addMissingGenericParts(upgraded), upgraded);
  assert.equal(new Set(defaultPartDefs.map((d) => d.id)).size, defaultPartDefs.length);
  assert.equal(new Set(defaultPartDefs.map((d) => d.name)).size, defaultPartDefs.length);
});

test("transistor packages use numbered pins and place with valid occupied geometry", async () => {
  assert.deepEqual(transistorPackagePartDefs.map((d) => d.name), [
    "Transistor TO-18", "Transistor TO-39", "Transistor TO-126", "Transistor TO-247"
  ]);
  for (const def of transistorPackagePartDefs) {
    assert.deepEqual(def.pins.map((p) => p.name), ["1", "2", "3"]);
    assert.equal(def.category, "semiconductor");
    assert.equal(genericRefdesPrefixes[def.id], "Q");
    const initial = await createInitialCoreStateJson({ width: 30, height: 30, gridPitchMm: 2.54 }, [def]);
    await applyCoreCommandJson(initial, commandAddPartInstJson(def.id, { x: 10, y: 10 }, "Deg0", "Q1"));
    for (const pin of def.pins) assert.ok(def.occupied.some((p) => p.x === pin.pos.x && p.y === pin.pos.y));
  }
});
