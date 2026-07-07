import test from "node:test";
import assert from "node:assert/strict";

import { help, formatHelp } from "../dist/src/help-runtime.js";

// Regression test for GitHub issue #84: the runtime used to build its docs map
// by reading its own source, which produced an empty map whenever the SDK was
// not loaded from a real file (the shipped .pak resource). Docs are now
// embedded at build time, so these assertions exercise the injected data.

test("help(name) returns the embedded doc instead of an empty result", () => {
  const doc = help({ click: () => {} }, "click");
  assert.equal(typeof doc, "object");
  assert.equal(doc.name, "click");
  assert.ok(
    doc.description && doc.description.length > 0,
    `expected a non-empty description, got: ${JSON.stringify(doc)}`,
  );
});

test("help() lists the helpers present in the context", () => {
  const list = help({ click: () => {}, waitFor: () => {} });
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0, "expected embedded docs to be non-empty");
  assert.ok(list.some((d) => d.name === "click"));
});

test("help(unknown) reports the unknown helper", () => {
  assert.equal(
    help({}, "definitelyNotAHelper"),
    "Unknown helper: definitelyNotAHelper",
  );
});

test("formatHelp renders the signature for an embedded doc", () => {
  const doc = help({ click: () => {} }, "click");
  const text = formatHelp(doc);
  assert.ok(text.includes("click("), `expected signature in:\n${text}`);
});
