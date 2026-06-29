import { cdp } from "../cdp-eval.js";
import { browserCdp } from "../browser-runtime.js";
import { withHandle, resolveAndCall } from "./element-ops.js";
import { waitForSelector } from "./waits.js";

type FillOptions = {
  clearFirst?: boolean;
  timeout?: number;
};

const KEYS = {
  Enter: { vk: 13, key: "Enter", code: "Enter", text: "\r" },
  Tab: { vk: 9, key: "Tab", code: "Tab", text: "\t" },
  Backspace: { vk: 8, key: "Backspace", code: "Backspace", text: "" },
  Escape: { vk: 27, key: "Escape", code: "Escape", text: "" },
  Delete: { vk: 46, key: "Delete", code: "Delete", text: "" },
  " ": { vk: 32, key: " ", code: "Space", text: " " },
  ArrowLeft: { vk: 37, key: "ArrowLeft", code: "ArrowLeft", text: "" },
  ArrowUp: { vk: 38, key: "ArrowUp", code: "ArrowUp", text: "" },
  ArrowRight: { vk: 39, key: "ArrowRight", code: "ArrowRight", text: "" },
  ArrowDown: { vk: 40, key: "ArrowDown", code: "ArrowDown", text: "" },
  Home: { vk: 36, key: "Home", code: "Home", text: "" },
  End: { vk: 35, key: "End", code: "End", text: "" },
  PageUp: { vk: 33, key: "PageUp", code: "PageUp", text: "" },
  PageDown: { vk: 34, key: "PageDown", code: "PageDown", text: "" },
};

const PRINTABLE_CODE_RE = /^[A-Za-z0-9]$/;
const CTRL_MODIFIER = 2;
const META_MODIFIER = 4;
const INPUT_EVENT_DELAY_MS = 25;
const INPUT_DISPATCH_TIMEOUT_MS = 1000;

function keyDefinition(key) {
  const special = KEYS[key];
  if (special) {
    return special;
  }
  if (key.length !== 1) {
    return { vk: 0, key, code: key, text: "" };
  }
  const vk = key.toUpperCase().codePointAt(0);
  const code = PRINTABLE_CODE_RE.test(key)
    ? `${/[0-9]/.test(key) ? "Digit" : "Key"}${key.toUpperCase()}`
    : key;
  return { vk, key, code, text: key };
}

function editingCommandsForKey(key, modifiers) {
  if (
    (modifiers === CTRL_MODIFIER || modifiers === META_MODIFIER) &&
    key.toLowerCase() === "a"
  ) {
    return ["selectAll"];
  }
  if (modifiers === 0 && key === "Backspace") {
    return ["deleteBackward"];
  }
  if (modifiers === 0 && key === "Delete") {
    return ["deleteForward"];
  }
  return undefined;
}

const MODIFIER_BITS: Record<string, number> = {
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8,
};

/**
 * Parse a Playwright-style key combo ("Control+a", "Shift+Tab") into a base key
 * and a CDP modifier bitfield. Modifiers: Control, Shift, Alt, Meta, ControlOrMeta.
 */
function parseKeyCombo(combo: string) {
  const parts = combo.split("+");
  let key = parts.pop() ?? combo;
  if (key === "" && parts.length > 0) {
    // A trailing "+" denotes the literal plus key, e.g. "+", "Shift++". split()
    // turns that "+" into two empty segments; the pop above consumed one, so
    // drop the remaining empty slot too instead of reading it as a modifier.
    key = "+";
    if (parts[parts.length - 1] === "") {
      parts.pop();
    }
  }
  let modifiers = 0;
  for (const name of parts) {
    if (name === "ControlOrMeta") {
      modifiers |=
        process.platform === "darwin" ? META_MODIFIER : CTRL_MODIFIER;
      continue;
    }
    const bit = MODIFIER_BITS[name];
    if (bit === undefined) {
      throw new Error(`press: unknown key modifier ${JSON.stringify(name)}`);
    }
    modifiers |= bit;
  }
  return { key, modifiers };
}

/**
 * Dispatch a key press through CDP. Combine modifiers with "+".
 * @param {string} keyCombo Key or modifier+key combo: "Enter", "a", "Control+a", "Shift+Tab". Modifiers: Control, Shift, Alt, Meta, ControlOrMeta.
 * @returns {Promise<void>}
 */
export async function press(keyCombo) {
  const { key, modifiers } = parseKeyCombo(keyCombo);
  const { vk, code, text } = keyDefinition(key);
  const base = {
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  };
  const commands = editingCommandsForKey(key, modifiers);
  const probeId = await installKeyProbe(key);
  let dispatchError: unknown = null;
  try {
    await dispatchKeyEvent({
      type: "keyDown",
      ...base,
      ...(text ? { text, unmodifiedText: text } : {}),
      ...(commands ? { commands } : {}),
    });
    await inputEventDelay();
    await dispatchKeyEvent({ type: "keyUp", ...base });
  } catch (error) {
    if (!isKeyDispatchTimeout(error)) throw error;
    dispatchError = error;
  }
  const completed = await finishKeyProbe(probeId, {
    key,
    code,
    text,
    commands,
  });
  if (dispatchError && !completed) throw dispatchError;
}

/**
 * Insert text at the focused input using CDP Input.insertText.
 * @param {string} text Text to insert.
 * @returns {Promise<void>}
 */
export async function insertText(text) {
  await cdp("Input.insertText", { text });
}

/**
 * Focus an input, optionally clear it, write a value, and fire input/change events.
 * @param {string} selector CSS selector / @ref / loc= / xpath= for the input-like element.
 * @param {string} value Text to write.
 * @param {{clearFirst?: boolean, timeout?: number}} [options] clearFirst defaults to true (Playwright fill always clears); clearFirst:false appends (ego-browser extension). timeout in milliseconds.
 * @returns {Promise<void>}
 */
export async function fill(selector, value, options: FillOptions = {}) {
  const clearFirst = options.clearFirst ?? true;
  const timeout = options.timeout ?? 0;
  if (timeout > 0 && !(await waitForSelector(selector, { timeout }))) {
    throw new Error(`fill: element not found: ${JSON.stringify(selector)}`);
  }
  await withHandle(selector, async ({ objectId, sessionId }) => {
    const focusSource = clearFirst
      ? "function(){this.focus(); if(typeof this.select==='function') this.select();}"
      : "function(){this.focus();}";
    await cdp(
      "Runtime.callFunctionOn",
      {
        functionDeclaration: focusSource,
        objectId,
        returnByValue: true,
        awaitPromise: false,
      },
      sessionId,
    );
    if (clearFirst) {
      await cdp(
        "Runtime.callFunctionOn",
        {
          functionDeclaration:
            "function(){this.value=''; this.dispatchEvent(new Event('input',{bubbles:true}));}",
          objectId,
          returnByValue: true,
          awaitPromise: false,
        },
        sessionId,
      );
    }
    await cdp("Input.insertText", { text: value }, sessionId);
    await cdp(
      "Runtime.callFunctionOn",
      {
        functionDeclaration:
          "function(){this.dispatchEvent(new Event('input',{bubbles:true})); this.dispatchEvent(new Event('change',{bubbles:true}));}",
        objectId,
        returnByValue: true,
        awaitPromise: false,
      },
      sessionId,
    );
  });
}

/**
 * Focus an element and dispatch a DOM KeyboardEvent in page JavaScript.
 * Note: dispatched event has isTrusted=false; some frameworks ignore it (see docs/issues/dispatchKey-synthetic-keyboard-event.md).
 * @param {string} selector CSS selector / @ref / loc= / xpath= for the target element.
 * @param {string} [key="Enter"] Event key.
 * @param {"keydown"|"keypress"|"keyup"|string} [event="keypress"] Event type.
 * @returns {Promise<void>}
 */
export async function dispatchKey(selector, key = "Enter", event = "keypress") {
  const { vk, code } = keyDefinition(key);
  await resolveAndCall(
    selector,
    "function(keyCode, key, code, event){this.focus(); this.dispatchEvent(new KeyboardEvent(event,{key,code,keyCode,which:keyCode,bubbles:true}));}",
    [vk, key, code, event],
  );
}

function inputEventDelay() {
  return new Promise((resolve) => setTimeout(resolve, INPUT_EVENT_DELAY_MS));
}

async function dispatchKeyEvent(params: Record<string, unknown>) {
  await browserCdp(
    "Input.dispatchKeyEvent",
    params,
    undefined,
    INPUT_DISPATCH_TIMEOUT_MS,
  );
}

async function installKeyProbe(key: string) {
  if (!canProbeInputFallback()) return null;
  const id = `key_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  try {
    const result = await cdp("Runtime.evaluate", {
      expression: `(() => {
      window.__egoBrowserInputProbes ||= {};
      const probe = { seen: false };
      probe.handler = (event) => {
        if (event.isTrusted && event.key === ${JSON.stringify(key)}) probe.seen = true;
      };
      document.addEventListener("keydown", probe.handler, true);
      window.__egoBrowserInputProbes[${JSON.stringify(id)}] = probe;
      return true;
    })()`,
      returnByValue: true,
      awaitPromise: false,
    });
    return result.result?.value ? id : null;
  } catch {
    return null;
  }
}

async function finishKeyProbe(
  id: string | null,
  definition: { key: string; code: string; text: string; commands?: string[] },
) {
  if (!id) return false;
  await inputEventDelay();
  try {
    const result = await cdp("Runtime.evaluate", {
      expression: `(() => {
      const probes = window.__egoBrowserInputProbes || {};
      const probe = probes[${JSON.stringify(id)}];
      if (!probe) return { seen: false, fallback: false };
      document.removeEventListener("keydown", probe.handler, true);
      delete probes[${JSON.stringify(id)}];
      if (probe.seen) return { seen: true, fallback: false };

      const target = document.activeElement || document.body;
      const key = ${JSON.stringify(definition.key)};
      const code = ${JSON.stringify(definition.code)};
      const text = ${JSON.stringify(definition.text)};
      const commands = ${JSON.stringify(definition.commands || [])};
      const keyboardInit = {
        key,
        code,
        bubbles: true,
        cancelable: true,
        keyCode: ${JSON.stringify(keyDefinition(definition.key).vk)},
        which: ${JSON.stringify(keyDefinition(definition.key).vk)},
      };
      target.dispatchEvent(new KeyboardEvent("keydown", keyboardInit));

      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;
      if (isEditable) {
        if (commands.includes("selectAll") && typeof target.select === "function") {
          target.select();
        } else if (commands.includes("deleteBackward")) {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const from = start === end ? Math.max(0, start - 1) : start;
          const before = target.value;
          target.dispatchEvent(new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteContentBackward",
          }));
          target.value = before.slice(0, from) + before.slice(end);
          target.setSelectionRange(from, from);
          target.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "deleteContentBackward",
          }));
        } else if (commands.includes("deleteForward")) {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const to = start === end ? Math.min(target.value.length, end + 1) : end;
          const before = target.value;
          target.dispatchEvent(new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteContentForward",
          }));
          target.value = before.slice(0, start) + before.slice(to);
          target.setSelectionRange(start, start);
          target.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "deleteContentForward",
          }));
        } else if (text) {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const before = target.value;
          target.dispatchEvent(new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            data: text,
            inputType: "insertText",
          }));
          target.value = before.slice(0, start) + text + before.slice(end);
          const next = start + text.length;
          target.setSelectionRange(next, next);
          target.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            data: text,
            inputType: "insertText",
          }));
        }
      }

      target.dispatchEvent(new KeyboardEvent("keyup", keyboardInit));
      return { seen: false, fallback: true };
    })()`,
      returnByValue: true,
      awaitPromise: false,
    });
    const value = result.result?.value;
    return Boolean(value?.seen || value?.fallback);
  } catch {
    return false;
  }
}

function canProbeInputFallback() {
  return Boolean((globalThis as any).ego?.sendCDPMessage);
}

function isKeyDispatchTimeout(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /CDP request timed out: Input\.dispatchKeyEvent/.test(message);
}
