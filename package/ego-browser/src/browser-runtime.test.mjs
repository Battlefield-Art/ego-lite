import test from "node:test";
import assert from "node:assert/strict";

import { browserCdp } from "../dist/src/browser-runtime.js";

// Gap A: ensureSession() calls the raw listTabs binding to attach a session.
// When the task is blocked it returns { error, error_code }; the result must
// surface the ego-browser-owned wording for the code (not the live text) and
// carry error_code, instead of throwing bare live text.
test("browserCdp surfaces the owned message and error_code when ensureSession is blocked", async () => {
  globalThis.ego = {
    async listTabs() {
      return {
        error: "The task is under user control: 7",
        error_code: "EGO_TASK_SPACE_USER_IN_CONTROL",
      };
    },
  };
  try {
    await assert.rejects(
      () => browserCdp("Runtime.evaluate", {}, undefined, 1000),
      (err) => {
        assert.equal(err.error_code, "EGO_TASK_SPACE_USER_IN_CONTROL");
        assert.equal(err.message, "The task is under user control.");
        return true;
      },
    );
  } finally {
    delete globalThis.ego;
  }
});

// Gap B: a raw CDP send that fails locally is reported through
// ego.onSendCDPMessageError, not as a CDP response. Without wiring the request
// would hang until the 15s timeout; wired, it rejects immediately with the
// owned message and error_code.
test("browserCdp rejects the in-flight request via onSendCDPMessageError", async () => {
  globalThis.ego = {
    sendCDPMessage() {
      // The binding delivers the failure asynchronously through the event loop.
      queueMicrotask(() =>
        globalThis.ego.onSendCDPMessageError(
          "native reconstructed text",
          "EGO_TASK_SPACE_USER_IN_CONTROL",
        ),
      );
    },
  };
  try {
    await assert.rejects(
      // Browser-level method skips ensureSession; short timeout bounds a regression.
      () => browserCdp("Browser.getVersion", {}, undefined, 1000),
      (err) => {
        assert.equal(err.error_code, "EGO_TASK_SPACE_USER_IN_CONTROL");
        assert.equal(err.message, "The task is under user control.");
        return true;
      },
    );
  } finally {
    delete globalThis.ego;
  }
});
