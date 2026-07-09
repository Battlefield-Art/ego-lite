import { send, state } from "./state.js";

class TimeoutError extends Error {}

/**
 * Send a raw Chrome DevTools Protocol command.
 * @param {string} method CDP method name, for example Runtime.evaluate.
 * @param {object} [params] CDP command parameters.
 * @param {string} [sessionId] Optional attached target session id.
 * @returns {Promise<object>} CDP result object.
 */
export async function cdp(method, params: any = {}, sessionId = undefined) {
  const result = state.cdpOverride
    ? await state.cdpOverride(method, params, sessionId)
    : (await send({ method, params, session_id: sessionId })).result || {};
  if (
    !sessionId &&
    (method === "Network.enable" || method === "Network.disable")
  ) {
    // Mirror the default session's Network domain state so helpers like
    // waitForNetworkIdle can restore it instead of tearing down a domain
    // the caller still relies on for drainEvents().
    state.networkDomainEnabled = method === "Network.enable";
  }
  return result;
}

/**
 * Evaluate JavaScript in the current page, Playwright-style.
 * @param {string | Function} pageFunction JavaScript expression string or function called with arg.
 * @param {unknown} [arg] Optional serializable argument passed to function pageFunctions.
 * @returns {Promise<any>} Runtime.evaluate return-by-value result.
 */
export async function evaluate(pageFunction, arg = undefined) {
  let expression;
  if (typeof pageFunction === "function") {
    expression = `(${pageFunction.toString()})(${serializedArg(arg)})`;
  } else if (typeof pageFunction === "string") {
    if (arg !== undefined) {
      throw new TypeError(
        "page.evaluate string form does not accept an arg; pass a function pageFunction instead",
      );
    }
    expression = pageFunction;
  } else {
    throw new TypeError(
      `page.evaluate expects a string expression or function pageFunction, got ${pageFunction === null ? "null" : typeof pageFunction}`,
    );
  }
  return runtimeEvaluate(expression, undefined, true);
}

async function runtimeEvaluate(
  expression,
  sessionId = undefined,
  awaitPromise = false,
) {
  try {
    const response = await cdp(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise,
      },
      sessionId,
    );
    return runtimeValue(response, expression);
  } catch (error) {
    if (
      error instanceof TimeoutError ||
      /timed out/i.test(error?.message || "")
    ) {
      throw new Error(
        `Runtime.evaluate timed out; expression: ${jsSnippet(expression)}`,
      );
    }
    throw error;
  }
}

export function runtimeValue(response, expression) {
  const result = response.result || {};
  const details = response.exceptionDetails;
  if (details || result.subtype === "error") {
    const desc = jsExceptionDescription(result, details);
    const loc =
      details?.lineNumber !== undefined && details?.columnNumber !== undefined
        ? ` at line ${details.lineNumber}, column ${details.columnNumber}`
        : "";
    throw new Error(
      `JavaScript evaluation failed${loc}: ${desc}; expression: ${jsSnippet(expression)}`,
    );
  }
  if (Object.hasOwn(result, "value")) {
    return result.value;
  }
  if (Object.hasOwn(result, "unserializableValue")) {
    return decodeUnserializableJsValue(result.unserializableValue);
  }
  return null;
}

function jsExceptionDescription(result, details) {
  let desc = result.description;
  const exception = details?.exception;
  if (!desc && exception && typeof exception === "object") {
    desc = exception.description;
    if (desc === undefined && Object.hasOwn(exception, "value")) {
      desc = String(exception.value);
    }
    if (desc === undefined) {
      desc = exception.className;
    }
  }
  return desc || details?.text || "JavaScript evaluation failed";
}

export function decodeUnserializableJsValue(value) {
  if (value === "NaN") {
    return Number.NaN;
  }
  if (value === "Infinity") {
    return Number.POSITIVE_INFINITY;
  }
  if (value === "-Infinity") {
    return Number.NEGATIVE_INFINITY;
  }
  if (value === "-0") {
    return -0;
  }
  if (value.endsWith("n")) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

function jsSnippet(expression, limit = 160) {
  const snippet = expression.trim().replace(/\n/g, "\\n");
  return snippet.length > limit ? `${snippet.slice(0, limit - 3)}...` : snippet;
}

function serializedArg(arg) {
  return arg === undefined ? "" : JSON.stringify(arg);
}
