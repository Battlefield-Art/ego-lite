import { writeFile } from "node:fs/promises";

import { agentWorkspace, loadEnv } from "./env.js";
import { browserCdp } from "./browser-runtime.js";

loadEnv();

export const NAME = process.env.EGO_BROWSER_NAME || "default";

async function defaultSend(req) {
  if (!req || typeof req !== "object" || !req.method) {
    throw new Error(
      `unsupported browser runtime request: ${JSON.stringify(req)}`,
    );
  }
  const response = await browserCdp(
    req.method,
    req.params || {},
    req.session_id,
  );
  return { result: response.result || {} };
}

export const state = {
  send: defaultSend,
  cdpOverride: null,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  platform: process.platform,
  agentWorkspace: () => agentWorkspace(),
  writeFile,
  sessionId: null,
  sessionTargetId: null,
  sessionAt: 0,
  sessionInflight: null,
  preferredTargetId: null,
  // Synchronous projection used by Playwright-style page.url(). The browser
  // remains authoritative; navigation/tab operations and CDP events refresh it.
  pageUrl: "",
  pageUrlTargetId: null,
  pageMainFrameId: null,
  defaultTimeout: 10000,
  // Last observed Network domain state on the default session (tracked in cdp()).
  networkDomainEnabled: false,
};

export function cachePageUrl(
  url: string,
  targetId = state.sessionTargetId ||
    state.preferredTargetId ||
    state.pageUrlTargetId ||
    null,
) {
  if (typeof url !== "string") return;
  if (targetId && targetId !== state.pageUrlTargetId) {
    state.pageMainFrameId = null;
  }
  state.pageUrl = url;
  state.pageUrlTargetId = targetId;
}

export function clearPageUrl(targetId: string | null = null) {
  if (targetId && targetId !== state.pageUrlTargetId) return;
  state.pageUrl = "";
  state.pageUrlTargetId = null;
  state.pageMainFrameId = null;
}

export async function send(req) {
  return state.send(req);
}

export function cdpAvailable() {
  return Boolean(state.cdpOverride) || state.send !== defaultSend;
}

export function setOverrides(overrides) {
  const previous = { ...state };
  Object.assign(state, overrides);
  return () => {
    Object.assign(state, previous);
  };
}
