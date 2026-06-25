import test from "node:test";
import assert from "node:assert/strict";

import { setOverrides } from "../../dist/src/state.js";
import { pressKey } from "../../dist/src/driver/keyboard.js";

test("pressKey maps Command+A to the selectAll editing command", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("a", 4);
  } finally {
    restore();
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    method: "Input.dispatchKeyEvent",
    sessionId: undefined,
    params: {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      modifiers: 4,
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      text: "a",
      unmodifiedText: "a",
      commands: ["selectAll"],
    },
  });
  assert.deepEqual(calls[1].params, {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 4,
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
  });
});

test("pressKey maps Control+A to the selectAll editing command", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("a", 2);
  } finally {
    restore();
  }

  assert.deepEqual(calls[0].params.commands, ["selectAll"]);
});

test("pressKey does not map modified Command+A variants to selectAll", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("a", 12);
  } finally {
    restore();
  }

  assert.equal(calls[0].params.commands, undefined);
});

test("pressKey leaves ordinary printable keys unchanged", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("x");
  } finally {
    restore();
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params, {
    type: "keyDown",
    key: "x",
    code: "KeyX",
    modifiers: 0,
    windowsVirtualKeyCode: 88,
    nativeVirtualKeyCode: 88,
    text: "x",
    unmodifiedText: "x",
  });
  assert.deepEqual(calls[1].params, {
    type: "keyUp",
    key: "x",
    code: "KeyX",
    modifiers: 0,
    windowsVirtualKeyCode: 88,
    nativeVirtualKeyCode: 88,
  });
});

test("pressKey maps Backspace and Delete to editing commands", async () => {
  const calls = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return {};
    },
  });
  try {
    await pressKey("Backspace");
    await pressKey("Delete");
  } finally {
    restore();
  }

  assert.deepEqual(calls[0].params.commands, ["deleteBackward"]);
  assert.deepEqual(calls[2].params.commands, ["deleteForward"]);
});

test("pressKey triggers probe fallback when CDP dispatch is not trusted", async () => {
  // Enable canProbeInputFallback() by providing ego runtime
  const originalEgo = globalThis.ego;
  globalThis.ego = { sendCDPMessage: () => {} };
  let evaluateCallCount = 0;
  const evaluateExpressions = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      if (method === "Runtime.evaluate") {
        evaluateCallCount++;
        evaluateExpressions.push(params.expression);
        // First call: installKeyProbe — return truthy to indicate probe installed
        if (evaluateCallCount === 1) {
          return { result: { value: true } };
        }
        // Second call: finishKeyProbe — simulate CDP dispatch was NOT seen
        // (the CDP keyDown did not produce a trusted event)
        return { result: { value: { seen: false, fallback: true } } };
      }
      // Input.dispatchKeyEvent calls proceed normally
      return {};
    },
  });
  try {
    await pressKey("a");
  } finally {
    restore();
    if (originalEgo === undefined) delete globalThis.ego;
    else globalThis.ego = originalEgo;
  }

  // Verify probe install and finish were called
  assert.equal(
    evaluateCallCount,
    2,
    "Runtime.evaluate called for install and finish",
  );
  // Install expression should reference __egoBrowserInputProbes
  assert.match(
    evaluateExpressions[0],
    /__egoBrowserInputProbes/,
    "install expression sets up probe",
  );
  // Finish expression should contain the fallback dispatch logic
  assert.match(
    evaluateExpressions[1],
    /dispatchEvent/,
    "finish expression contains fallback dispatch",
  );
  assert.match(
    evaluateExpressions[1],
    /KeyboardEvent/,
    "finish expression dispatches KeyboardEvent in fallback",
  );
});

test("pressKey skips probe fallback when CDP dispatch is trusted", async () => {
  const originalEgo = globalThis.ego;
  globalThis.ego = { sendCDPMessage: () => {} };
  let evaluateCallCount = 0;
  const evaluateExpressions = [];
  const restore = setOverrides({
    cdpOverride(method, params, sessionId) {
      if (method === "Runtime.evaluate") {
        evaluateCallCount++;
        evaluateExpressions.push(params.expression);
        if (evaluateCallCount === 1) {
          return { result: { value: true } };
        }
        // Simulate CDP dispatch WAS seen (trusted event arrived)
        return { result: { value: { seen: true, fallback: false } } };
      }
      return {};
    },
  });
  try {
    await pressKey("x");
  } finally {
    restore();
    if (originalEgo === undefined) delete globalThis.ego;
    else globalThis.ego = originalEgo;
  }

  assert.equal(
    evaluateCallCount,
    2,
    "Runtime.evaluate called for install and finish",
  );
  // When seen=true, finish should return early without dispatching fallback events
  // The expression still contains the fallback code but it returns early via the seen check
  assert.match(
    evaluateExpressions[1],
    /probe\.seen/,
    "finish expression checks probe.seen flag",
  );
});
