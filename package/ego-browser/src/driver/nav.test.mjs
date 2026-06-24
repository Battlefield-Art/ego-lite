import test from "node:test";
import assert from "node:assert/strict";

import {
  browserCdp,
  invalidateSession,
  pendingDialog,
} from "../../dist/src/browser-runtime.js";
import {
  gotoAndWait,
  listTabs,
  newTab,
  openOrReuseTab,
  pageInfo,
  closeTab,
} from "../../dist/src/driver/nav.js";
import { setOverrides, state } from "../../dist/src/state.js";

function pageInfoPayload(overrides = {}) {
  return JSON.stringify({
    url: "https://example.com/",
    title: "Example",
    w: 800,
    h: 600,
    sx: 0,
    sy: 0,
    pw: 800,
    ph: 1200,
    ...overrides,
  });
}

function runtimeValue(value) {
  return { result: { value } };
}

function withEgo(ego, fn) {
  const previous = globalThis.ego;
  globalThis.ego = ego;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) {
        delete globalThis.ego;
      } else {
        globalThis.ego = previous;
      }
    });
}

function withCdpRuntime(fn) {
  const previous = globalThis.ego;
  const sent = [];
  const runtime = {
    async listTabs() {
      return {
        tabs: [
          {
            targetId: "target-1",
            active: true,
            title: "Example",
            url: "https://example.com/",
          },
        ],
      };
    },
    sendCDPMessage(payload) {
      const request = JSON.parse(payload);
      sent.push(request);
      let result = {};
      if (request.method === "Target.attachToTarget") {
        result = { sessionId: "session-1" };
      } else if (request.method === "Runtime.evaluate") {
        result = {
          result: {
            value: JSON.stringify({
              url: "https://example.com/",
              title: "Example",
              w: 800,
              h: 600,
              sx: 0,
              sy: 0,
              pw: 800,
              ph: 1200,
            }),
          },
        };
      }
      queueMicrotask(() =>
        runtime.onCDPMessage(JSON.stringify({ id: request.id, result })),
      );
    },
    emit(method, params) {
      runtime.onCDPMessage(
        JSON.stringify({ sessionId: "session-1", method, params }),
      );
    },
  };
  globalThis.ego = runtime;
  invalidateSession();
  return Promise.resolve()
    .then(() => fn({ runtime, sent }))
    .finally(() => {
      invalidateSession();
      if (previous === undefined) {
        delete globalThis.ego;
      } else {
        globalThis.ego = previous;
      }
    });
}

test("listTabs throws on ego binding error objects", async () => {
  await withEgo(
    {
      async listTabs() {
        return { error: "The task is under user control" };
      },
    },
    async () => {
      await assert.rejects(
        () => listTabs(),
        /listTabs: The task is under user control/,
      );
    },
  );
});

test("newTab throws on ego binding error objects", async () => {
  await withEgo(
    {
      async createTab() {
        return { error: "The task is under user control" };
      },
    },
    async () => {
      await assert.rejects(
        () => newTab("https://example.com/"),
        /newTab: The task is under user control/,
      );
    },
  );
});

test("newTab throws when the binding returns no targetId", async () => {
  await withEgo(
    {
      async createTab() {
        return {};
      },
    },
    async () => {
      await assert.rejects(
        () => newTab("https://example.com/"),
        /newTab returned no targetId/,
      );
    },
  );
});

test("openOrReuseTab activates newly created tabs and waits for a non-zero viewport", async () => {
  const calls = [];
  const sleeps = [];
  let now = 0;
  const viewportResponses = [
    pageInfoPayload({ w: 0, h: 0, pw: 320, ph: 180 }),
    pageInfoPayload({ w: 640, h: 480, pw: 640, ph: 900 }),
  ];

  await withEgo(
    {
      async listTabs() {
        return { tabs: [] };
      },
      async createTab(url) {
        calls.push({ method: "createTab", url });
        return { targetId: "target-2" };
      },
    },
    async () => {
      const restore = setOverrides({
        now: () => now,
        async sleep(ms) {
          sleeps.push(ms);
          now += ms;
        },
        cdpOverride(method, params, sessionId) {
          calls.push({ method, params, sessionId });
          if (method === "Runtime.evaluate") {
            return runtimeValue(
              viewportResponses.shift() ??
                pageInfoPayload({ w: 640, h: 480, pw: 640, ph: 900 }),
            );
          }
          return {};
        },
      });
      try {
        assert.deepEqual(
          await openOrReuseTab("https://example.com/new", { wait: false }),
          {
            targetId: "target-2",
            url: "https://example.com/new",
            title: "",
            active: true,
            reused: false,
          },
        );
      } finally {
        restore();
      }
    },
  );

  assert.deepEqual(calls[0], {
    method: "createTab",
    url: "https://example.com/new",
  });
  assert.deepEqual(calls[1], {
    method: "Target.activateTarget",
    params: { targetId: "target-2" },
    sessionId: undefined,
  });
  assert.deepEqual(sleeps, [100]);
  assert.equal(
    calls.filter((call) => call.method === "Runtime.evaluate").length,
    2,
  );
});

test("openOrReuseTab calls native ensureTabReady when the bridge provides it", async () => {
  const calls = [];
  await withEgo(
    {
      async listTabs() {
        return {
          tabs: [
            {
              targetId: "target-1",
              active: false,
              title: "Example",
              url: "https://example.com/",
            },
          ],
        };
      },
      async ensureTabReady(targetId) {
        calls.push({ method: "ensureTabReady", targetId });
        return { ok: true };
      },
    },
    async () => {
      const restore = setOverrides({
        cdpOverride(method, params, sessionId) {
          calls.push({ method, params, sessionId });
          if (method === "Runtime.evaluate") {
            return runtimeValue(pageInfoPayload());
          }
          return {};
        },
      });
      try {
        const tab = await openOrReuseTab("https://example.com/", {
          wait: false,
        });
        assert.equal(tab.reused, true);
      } finally {
        restore();
      }
    },
  );

  assert.deepEqual(
    calls.map((call) => call.method),
    ["Target.activateTarget", "ensureTabReady", "Runtime.evaluate"],
  );
});

test("openOrReuseTab falls back to native ensureViewport when ensureTabReady is absent", async () => {
  const calls = [];
  await withEgo(
    {
      async listTabs() {
        return {
          tabs: [
            {
              targetId: "target-1",
              active: false,
              title: "Example",
              url: "https://example.com/",
            },
          ],
        };
      },
      async ensureViewport(targetId) {
        calls.push({ method: "ensureViewport", targetId });
        return { ok: true };
      },
    },
    async () => {
      const restore = setOverrides({
        cdpOverride(method, params, sessionId) {
          calls.push({ method, params, sessionId });
          if (method === "Runtime.evaluate") {
            return runtimeValue(pageInfoPayload());
          }
          return {};
        },
      });
      try {
        const tab = await openOrReuseTab("https://example.com/", {
          wait: false,
        });
        assert.equal(tab.reused, true);
      } finally {
        restore();
      }
    },
  );

  assert.deepEqual(
    calls.map((call) => call.method),
    ["Target.activateTarget", "ensureViewport", "Runtime.evaluate"],
  );
});

test("openOrReuseTab surfaces native ensureTabReady errors", async () => {
  let caught;
  await withEgo(
    {
      async listTabs() {
        return {
          tabs: [
            {
              targetId: "target-1",
              active: false,
              title: "Example",
              url: "https://example.com/",
            },
          ],
        };
      },
      async ensureTabReady() {
        return {
          error: "native viewport repair failed",
          error_code: "EGO_INVALID_VIEWPORT",
        };
      },
    },
    async () => {
      const restore = setOverrides({
        cdpOverride() {
          return {};
        },
      });
      try {
        await openOrReuseTab("https://example.com/", { wait: false });
      } catch (error) {
        caught = error;
      } finally {
        restore();
      }
    },
  );

  assert.match(
    caught?.message || "",
    /ensureTabReady: native viewport repair failed/,
  );
  assert.equal(caught?.error_code, "EGO_INVALID_VIEWPORT");
});

test("openOrReuseTab rejects zero-viewport tabs with a structured error", async () => {
  let now = 0;
  let caught;

  await withEgo(
    {
      async listTabs() {
        return { tabs: [] };
      },
      async createTab() {
        return { targetId: "target-2" };
      },
    },
    async () => {
      const restore = setOverrides({
        now: () => now,
        async sleep(ms) {
          now += ms;
        },
        cdpOverride(method) {
          if (method === "Runtime.evaluate") {
            return runtimeValue(
              pageInfoPayload({
                url: "https://example.com/zero",
                w: 0,
                h: 0,
                pw: 320,
                ph: 180,
              }),
            );
          }
          return {};
        },
      });
      try {
        await openOrReuseTab("https://example.com/zero", { wait: false });
      } catch (error) {
        caught = error;
      } finally {
        restore();
      }
    },
  );

  assert.equal(caught?.code, "EGO_INVALID_VIEWPORT");
  assert.match(caught?.message || "", /viewport=0x0/);
  assert.match(caught?.message || "", /https:\/\/example\.com\/zero/);
});

test("gotoAndWait rejects when navigation finishes with an invalid viewport", async () => {
  let now = 0;
  let caught;
  const calls = [];
  const restore = setOverrides({
    now: () => now,
    async sleep(ms) {
      now += ms;
    },
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      if (method === "Page.navigate") {
        return { frameId: "frame-1" };
      }
      if (method === "Page.getFrameTree") {
        return { frameTree: { frame: { url: "https://example.com/zero" } } };
      }
      if (method === "Runtime.evaluate") {
        if (params.expression === "document.readyState") {
          return runtimeValue("complete");
        }
        return runtimeValue(
          pageInfoPayload({
            url: "https://example.com/zero",
            w: 0,
            h: 0,
            pw: 320,
            ph: 180,
          }),
        );
      }
      return {};
    },
  });
  try {
    await gotoAndWait("https://example.com/zero", { timeout: 1 });
  } catch (error) {
    caught = error;
  } finally {
    restore();
  }

  assert.equal(caught?.code, "EGO_INVALID_VIEWPORT");
  assert.match(caught?.message || "", /gotoAndWait/);
  assert.equal(calls[0].method, "Page.navigate");
});

test("closeTab closes an explicit target and returns its id", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return { success: true };
    },
  });
  try {
    assert.equal(await closeTab("target-2"), "target-2");
  } finally {
    restore();
  }

  assert.deepEqual(calls, [
    {
      method: "Target.closeTarget",
      params: { targetId: "target-2" },
      sessionId: undefined,
    },
  ]);
});

test("closeTab closes the current tab and invalidates matching session state", async () => {
  const calls = [];
  await withEgo(
    {
      async listTabs() {
        return {
          tabs: [
            {
              targetId: "target-1",
              active: true,
              title: "Example",
              url: "https://example.com/",
            },
          ],
        };
      },
    },
    async () => {
      const restore = setOverrides({
        cdpOverride(method, params, sessionId) {
          calls.push({ method, params, sessionId });
          return { success: true };
        },
        sessionId: "session-1",
        sessionTargetId: "target-1",
        sessionAt: Date.now(),
        preferredTargetId: "target-1",
      });
      try {
        assert.equal(await closeTab(), "target-1");
        assert.equal(state.sessionId, null);
        assert.equal(state.sessionTargetId, null);
        assert.equal(state.preferredTargetId, null);
      } finally {
        restore();
      }
    },
  );

  assert.deepEqual(calls, [
    {
      method: "Target.closeTarget",
      params: { targetId: "target-1" },
      sessionId: undefined,
    },
  ]);
});

test("browser runtime enables Page events and tracks pending native dialogs", async () => {
  await withCdpRuntime(async ({ runtime, sent }) => {
    await browserCdp("Runtime.evaluate", { expression: "document.title" });

    assert.deepEqual(
      sent.map((request) => request.method),
      ["Target.attachToTarget", "Page.enable", "Runtime.evaluate"],
    );
    assert.equal(sent[1].sessionId, "session-1");

    runtime.emit("Page.javascriptDialogOpening", {
      type: "alert",
      message: "Confirm action",
      url: "https://example.com/",
    });
    assert.deepEqual(pendingDialog(), {
      type: "alert",
      message: "Confirm action",
      url: "https://example.com/",
    });

    runtime.emit("Page.javascriptDialogClosed", { result: true });
    assert.equal(pendingDialog(), null);
  });
});

test("pageInfo returns pending dialog without evaluating frozen page JavaScript", async () => {
  await withCdpRuntime(async ({ runtime, sent }) => {
    await browserCdp("Runtime.evaluate", { expression: "document.title" });
    sent.length = 0;

    runtime.emit("Page.javascriptDialogOpening", {
      type: "confirm",
      message: "Leave page?",
      url: "https://example.com/",
    });

    assert.deepEqual(await pageInfo(), {
      dialog: {
        type: "confirm",
        message: "Leave page?",
        url: "https://example.com/",
      },
    });
    assert.equal(
      sent.some((request) => request.method === "Runtime.evaluate"),
      false,
    );
  });
});
