import assert from "node:assert/strict";
import { asArray, safeOptionId } from "./contract-form-load";

function run(): void {
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray(undefined), []);
  assert.deepEqual(asArray("x"), []);
  assert.deepEqual(asArray([1, 2]), [1, 2]);
  assert.deepEqual(asArray({ data: [{ id: "a" }] }), [{ id: "a" }]);
  assert.deepEqual(asArray({ items: [{ id: "b" }] }), [{ id: "b" }]);
  assert.deepEqual(asArray({ results: [{ id: "c" }] }), [{ id: "c" }]);
  assert.deepEqual(asArray({ rows: [{ id: "d" }] }), [{ id: "d" }]);
  assert.deepEqual(asArray({ other: true }), []);

  assert.equal(safeOptionId(""), null);
  assert.equal(safeOptionId("   "), null);
  assert.equal(safeOptionId(null), null);
  assert.equal(safeOptionId(12), null);
  assert.equal(safeOptionId(" org-1 "), "org-1");

  console.log("contract-form-load.spec.ts: ok");
}

run();
