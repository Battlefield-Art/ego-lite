import test from "node:test";
import assert from "node:assert/strict";

import { runMain } from "../dist/src/run.js";

// A minimal native ego whose only method reports a hard stop, the same shape the real
// bindings return when the user holds (or has not handed over) the task space. The
// `listTaskSpaces` helper lifts it through assertNoEgoError -> buildEgoError, which is
// where the sink is told a hard stop occurred.
function hardStopEgo(error_code) {
  return {
    calls: 0,
    async listTaskSpaces() {
      this.calls += 1;
      return {
        error: "native wording that should never reach the agent",
        error_code,
      };
    },
  };
}

function captureStream() {
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

async function runScript(code, ego) {
  const previous = globalThis.ego;
  if (ego === undefined) {
    delete globalThis.ego;
  } else {
    globalThis.ego = ego;
  }
  const stdout = captureStream();
  const stderr = captureStream();
  let exitCode = null;
  let error = null;
  try {
    exitCode = await runMain({
      argv: [],
      stdinText: code,
      stdout,
      stderr,
      services: { printUpdateBanner() {} },
    });
  } catch (err) {
    error = err;
  } finally {
    if (previous === undefined) {
      delete globalThis.ego;
    } else {
      globalThis.ego = previous;
    }
  }
  return { exitCode, error, stdout: stdout.text(), stderr: stderr.text() };
}

test("a clean run flushes buffered cliLog output in order", async () => {
  const result = await runScript(`cliLog("one"); cliLog("two");`);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "one\ntwo\n");
});

test("a swallowed user-control hard stop discards all output and prints the guidance once", async () => {
  const ego = hardStopEgo("EGO_TASK_SPACE_USER_IN_CONTROL");
  const result = await runScript(
    `
      for (const site of ["a", "b", "c"]) {
        cliLog("visiting " + site);
        try {
          await listTaskSpaces();
          cliLog("ok " + site);
        } catch (e) {
          cliLog("failed " + site + ": " + e.message);
        }
      }
      cliLog("summary: done");
    `,
    ego,
  );

  assert.equal(result.exitCode, 0);
  // Only the owned guidance survives — none of the script's own logging.
  assert.match(result.stdout, /taken control of this task space/);
  assert.match(result.stdout, /takeOverTaskSpace\(\)/);
  assert.doesNotMatch(result.stdout, /visiting|failed|ok |summary/);
  // Printed exactly once, even though every loop iteration re-reported the hard stop.
  assert.equal(result.stdout.match(/takeOverTaskSpace\(\)/g).length, 1);
  assert.ok(ego.calls >= 3, "every iteration should have hit the hard stop");
});

test("an inactive / unassigned task space is also a hard stop", async () => {
  const ego = hardStopEgo("EGO_TASK_SPACE_INACTIVE");
  const result = await runScript(
    `
      try {
        await listTaskSpaces();
      } catch (e) {
        cliLog("swallowed: " + e.message);
      }
      cliLog("more business output");
    `,
    ego,
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /no longer assigned to the agent/);
  assert.match(result.stdout, /claimTaskSpace\(id\)/);
  assert.doesNotMatch(result.stdout, /swallowed|business/);
});

test("an uncaught hard stop discards output without double-printing the message", async () => {
  const ego = hardStopEgo("EGO_TASK_SPACE_USER_IN_CONTROL");
  const result = await runScript(
    `
      cliLog("before");
      await listTaskSpaces();
      cliLog("after");
    `,
    ego,
  );

  // The thrown Error already surfaces the message (the host prints it), so the sink
  // discards the buffer and stays silent rather than printing the guidance a second time.
  assert.ok(result.error, "expected runMain to reject");
  assert.match(result.error.message, /taken control of this task space/);
  assert.equal(result.stdout, "");
});

test("an ordinary uncaught error still flushes the output logged before it", async () => {
  const result = await runScript(`
    cliLog("partial result");
    throw new Error("boom");
  `);

  assert.ok(result.error, "expected runMain to reject");
  assert.equal(result.error.message, "boom");
  assert.equal(result.stdout, "partial result\n");
});
