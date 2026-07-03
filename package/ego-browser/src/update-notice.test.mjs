import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTICE_PREFIX,
  composeNotice,
  emitUpdateNotice,
  noticeSuppressed,
  probeBrowserVersion,
  updateNoticeLine,
} from "../dist/src/update-notice.js";

// composeNotice -------------------------------------------------------------

test("composeNotice returns null when there is nothing to report", () => {
  assert.equal(composeNotice(null), null);
  assert.equal(composeNotice(undefined), null);
  assert.equal(
    composeNotice({ currentVersion: "0.4.3.0", updateAvailable: false }),
    null,
  );
});

test("composeNotice renders an available update with prefix, versions, and hint", () => {
  const line = composeNotice({
    currentVersion: "0.4.3.0",
    updateAvailable: true,
    latestVersion: "0.4.4.0",
  });
  assert.ok(line.startsWith(NOTICE_PREFIX));
  assert.match(line, /ego lite 0\.4\.4\.0 is available/);
  assert.match(line, /current 0\.4\.3\.0/);
  assert.match(line, /run: ego-browser upgrade in your shell/);
  assert.match(line, /re-read the ego-browser skill/);
});

test("composeNotice marks a mandatory update as required", () => {
  const line = composeNotice({
    currentVersion: "0.4.3.0",
    updateAvailable: true,
    latestVersion: "0.4.4.0",
    mandatory: true,
  });
  assert.match(line, /is required/);
});

test("composeNotice falls back to a generic phrase without a usable latest version", () => {
  assert.match(
    composeNotice({ currentVersion: "0.4.3.0", updateAvailable: true }),
    /an ego lite update is available/,
  );
  // A non-string latestVersion is untrusted bridge input; treat it as absent.
  assert.match(
    composeNotice({
      currentVersion: "0.4.3.0",
      updateAvailable: true,
      latestVersion: 42,
    }),
    /an ego lite update is available/,
  );
});

test("composeNotice rejects input without a usable current version", () => {
  assert.equal(composeNotice({ updateAvailable: true }), null);
});

// noticeSuppressed ----------------------------------------------------------

test("noticeSuppressed is false with a clean env", () => {
  assert.equal(noticeSuppressed({}), false);
});

test("noticeSuppressed honors the opt-out var and CI", () => {
  assert.equal(noticeSuppressed({ EGO_BROWSER_NO_UPDATE_NOTIFIER: "1" }), true);
  assert.equal(noticeSuppressed({ CI: "true" }), true);
});

// probeBrowserVersion (the mock seam) ---------------------------------------

test("probeBrowserVersion returns null until the client injects the method", async () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "ego");
  const prev = globalThis.ego;
  try {
    delete globalThis.ego;
    assert.equal(await probeBrowserVersion(), null);
    globalThis.ego = {}; // present but without getBrowserVersion (old build)
    assert.equal(await probeBrowserVersion(), null);
    globalThis.ego = {
      getBrowserVersion: async () => ({
        currentVersion: "0.4.3.0",
        updateAvailable: false,
      }),
    };
    assert.deepEqual(await probeBrowserVersion(), {
      currentVersion: "0.4.3.0",
      updateAvailable: false,
    });
  } finally {
    if (had) globalThis.ego = prev;
    else delete globalThis.ego;
  }
});

// updateNoticeLine (the composed entry the emit points call) ----------------

test("updateNoticeLine surfaces a line when the source reports an update", async () => {
  const source = async () => ({
    currentVersion: "0.4.3.0",
    updateAvailable: true,
    latestVersion: "0.4.4.0",
  });
  const line = await updateNoticeLine({ source, env: {} });
  assert.ok(line.startsWith(NOTICE_PREFIX));
});

test("updateNoticeLine is null when the source reports no update", async () => {
  assert.equal(
    await updateNoticeLine({ source: async () => null, env: {} }),
    null,
  );
  assert.equal(
    await updateNoticeLine({
      source: async () => ({
        currentVersion: "0.4.3.0",
        updateAvailable: false,
      }),
      env: {},
    }),
    null,
  );
});

test("updateNoticeLine is null and skips the source when suppressed", async () => {
  let called = false;
  const source = async () => {
    called = true;
    return {
      currentVersion: "0.4.3.0",
      updateAvailable: true,
      latestVersion: "0.4.4.0",
    };
  };
  assert.equal(await updateNoticeLine({ source, env: { CI: "true" } }), null);
  assert.equal(called, false);
});

test("updateNoticeLine swallows a throwing source", async () => {
  const source = async () => {
    throw new Error("bridge unavailable");
  };
  assert.equal(await updateNoticeLine({ source, env: {} }), null);
});

// emitUpdateNotice (the installEgoSdk wiring point) --------------------------

function fakeStream() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(String(chunk));
    },
    text() {
      return chunks.join("");
    },
  };
}

// emitUpdateNotice is fire-and-forget: flush pending microtasks before asserting.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("emitUpdateNotice writes the notice line when the bridge reports an update", async () => {
  const ego = {
    getBrowserVersion: async () => ({
      currentVersion: "0.4.3.0",
      updateAvailable: true,
      latestVersion: "0.4.4.0",
    }),
  };
  const stream = fakeStream();
  emitUpdateNotice(ego, stream, {});
  await flushMicrotasks();
  assert.ok(stream.text().startsWith(NOTICE_PREFIX));
  assert.match(stream.text(), /run: ego-browser upgrade in your shell/);
});

test("emitUpdateNotice stays silent when there is no update", async () => {
  const ego = {
    getBrowserVersion: async () => ({
      currentVersion: "0.4.3.0",
      updateAvailable: false,
    }),
  };
  const stream = fakeStream();
  emitUpdateNotice(ego, stream, {});
  await flushMicrotasks();
  assert.equal(stream.text(), "");
});

test("emitUpdateNotice stays silent when the bridge method is missing (older build)", async () => {
  const stream = fakeStream();
  emitUpdateNotice({}, stream, {});
  await flushMicrotasks();
  assert.equal(stream.text(), "");
});

test("emitUpdateNotice stays silent when there is no ego bridge at all", async () => {
  const stream = fakeStream();
  emitUpdateNotice(null, stream, {});
  await flushMicrotasks();
  assert.equal(stream.text(), "");
});

test("emitUpdateNotice is suppressed in CI even when an update is available", async () => {
  const ego = {
    getBrowserVersion: async () => ({
      currentVersion: "0.4.3.0",
      updateAvailable: true,
      latestVersion: "0.4.4.0",
    }),
  };
  const stream = fakeStream();
  emitUpdateNotice(ego, stream, { CI: "true" });
  await flushMicrotasks();
  assert.equal(stream.text(), "");
});
