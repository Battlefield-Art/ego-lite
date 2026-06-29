import { state } from "../state.js";
import { cdp } from "../cdp-eval.js";
import { resolveHandle, releaseHandle } from "./element-ops.js";
import { ElementResolutionError } from "../element-resolver.js";
import { waitForDocumentLoad } from "./load.js";
import { drainEvents } from "./observe.js";

type WaitForSelectorOptions = {
  timeout?: number;
  state?: "visible" | "attached";
};

type WaitForLoadStateOptions = {
  timeout?: number;
  idleMs?: number;
};

/**
 * Sleep for a fixed number of milliseconds.
 * @param {number} [ms=1000] Milliseconds to wait.
 * @returns {Promise<void>}
 */
export async function waitForTimeout(ms = 1000) {
  await state.sleep(ms);
}

/**
 * Wait for a page load state. `"networkidle"` waits until network traffic goes
 * idle; `"domcontentloaded"` until the DOM is interactive; otherwise until
 * document.readyState is complete.
 * @param {"load"|"domcontentloaded"|"networkidle"} [loadState="load"] Load state to wait for.
 * @param {{timeout?: number, idleMs?: number}} [options] timeout in milliseconds; idleMs only applies to "networkidle".
 * @returns {Promise<boolean>} True when the state was reached before timeout.
 */
export async function waitForLoadState(
  loadState: "load" | "domcontentloaded" | "networkidle" = "load",
  options: WaitForLoadStateOptions = {},
) {
  if (loadState === "networkidle") {
    return waitForNetworkIdle(options);
  }
  return waitForDocumentLoad({
    timeout: options.timeout,
    until: loadState === "domcontentloaded" ? "domcontentloaded" : "load",
  });
}

/**
 * Wait until an element exists, optionally requiring visibility.
 * @param {string} selector CSS selector / @ref / loc= / xpath= to poll.
 * @param {{timeout?: number, state?: "visible"|"attached"}} [options] timeout in milliseconds; state defaults to "attached".
 * @returns {Promise<boolean>} True when found before timeout.
 */
export async function waitForSelector(
  selector: string,
  options: WaitForSelectorOptions = {},
) {
  const timeout = options.timeout ?? 10000;
  const requireVisible = options.state === "visible";
  const deadline = state.now() + timeout;
  const visibilityFn =
    "function(){if(typeof this.checkVisibility==='function')return this.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});const s=getComputedStyle(this);return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';}";
  while (state.now() < deadline) {
    let handle;
    try {
      handle = await resolveHandle(selector);
    } catch (err) {
      if (err instanceof ElementResolutionError && err.kind === "transient") {
        await state.sleep(300);
        continue; // not found / not ready yet — keep polling.
      }
      throw err; // permanent (bad selector / ambiguous) or unknown error — fail loud.
    }
    try {
      if (!requireVisible) return true;
      const response = await cdp(
        "Runtime.callFunctionOn",
        {
          functionDeclaration: visibilityFn,
          objectId: handle.objectId,
          returnByValue: true,
          awaitPromise: false,
        },
        handle.sessionId,
      );
      if (response.result?.value) return true;
    } catch {
      // visibility check failed (element raced away); treat as not-ready, keep polling.
    } finally {
      await releaseHandle(handle.objectId, handle.sessionId);
    }
    await state.sleep(300);
  }
  return false;
}

/**
 * Wait until network events are idle. Module-private; reachable through
 * waitForLoadState("networkidle").
 * Enables the CDP Network domain for the duration of the wait so that network
 * events are actually delivered (previously nothing enabled the domain, so this
 * could report "idle" without ever observing traffic). If the caller had
 * already enabled the domain, it is left enabled on return. Best-effort: if
 * the runtime does not deliver Network events, an idle window of idleMs still
 * resolves true.
 * @param {{timeout?: number, idleMs?: number}} [options] timeout & idleMs in milliseconds.
 * @returns {Promise<boolean>} True when idle before timeout.
 */
async function waitForNetworkIdle(options: WaitForLoadStateOptions = {}) {
  const timeout = options.timeout ?? 10000;
  const idleMs = options.idleMs ?? 500;
  const deadline = state.now() + timeout;
  let lastActivity = state.now();
  const inflight = new Set();
  const ownsNetworkDomain = !state.networkDomainEnabled;
  await cdp("Network.enable").catch(() => {
    // Domain may be unsupported by the bridge; fall back to passive observation.
  });
  try {
    while (state.now() < deadline) {
      for (const event of await drainEvents()) {
        const method = event.method || "";
        const params = event.params || {};
        if (method === "Network.requestWillBeSent") {
          inflight.add(params.requestId);
          lastActivity = state.now();
        } else if (
          method === "Network.loadingFinished" ||
          method === "Network.loadingFailed"
        ) {
          inflight.delete(params.requestId);
          lastActivity = state.now();
        } else if (method.startsWith("Network.")) {
          lastActivity = state.now();
        }
      }
      if (inflight.size === 0 && state.now() - lastActivity >= idleMs) {
        return true;
      }
      await state.sleep(100);
    }
    return false;
  } finally {
    if (ownsNetworkDomain) {
      await cdp("Network.disable").catch(() => {
        // Best-effort cleanup; keeps the event buffer from accumulating after the wait.
      });
    }
  }
}
