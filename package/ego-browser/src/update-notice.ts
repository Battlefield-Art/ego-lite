/**
 * "ego lite has an update" hint for the agent-facing runtime.
 *
 * Loosely modeled on lark cli's `_notice` — append one tagged line telling the
 * agent a newer ego lite exists — but deliberately WITHOUT lark's cache. lark
 * persists a throttled state file because every check is an HTTP round-trip to
 * npm, an expensive cost worth amortizing. Our source is `ego.getBrowserVersion()`:
 * a cheap local bridge call into the app, whose updater already knows
 * `updateAvailable`. There is no cost to amortize and nothing to persist, so every
 * command just asks directly and the answer is always current. (Don't re-add a
 * cache; it would only reintroduce staleness this version exists to avoid.)
 *
 * The version check is `ego.getBrowserVersion()`, a real bridge method on current app
 * builds; on older builds without it, the default source (`probeBrowserVersion`)
 * degrades to "no update". The remedy is *not* a symmetric `ego.upgradeBrowser()`
 * bridge call — the app exposes that half as the native CLI subcommand
 * `ego-browser upgrade` instead, so the composed line tells the agent to run it as a
 * shell command.
 *
 * The whole module is pure given an injected version source, so it is exercised
 * without a real browser.
 */

/** Raw shape the client `ego.getBrowserVersion()` is expected to return. */
export type BrowserVersionInfo = {
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion?: string;
  mandatory?: boolean;
};

/** The injectable seam for the client version query. */
export type VersionSource = () => Promise<
  BrowserVersionInfo | null | undefined
>;

/** Prefix that marks the appended line as out-of-band, not real command output. */
export const NOTICE_PREFIX = "[ego-browser:notice]";

/**
 * Suppress the hint entirely. Mirrors lark's opt-out (`*_NO_UPDATE_NOTIFIER`) and
 * stays quiet in CI, where a nag line is noise no one acts on.
 */
export function noticeSuppressed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.EGO_BROWSER_NO_UPDATE_NOTIFIER || env.CI);
}

/**
 * Format the version info into one line, or null when there is nothing to say.
 *
 * This is also the single boundary check on the bridge's return: the source crosses
 * a runtime seam (an injected app method), so untrusted fields are pinned down here
 * — a missing/non-string `currentVersion` yields null, a non-string `latestVersion`
 * degrades to the generic phrase.
 */
export function composeNotice(
  info: BrowserVersionInfo | null | undefined,
): string | null {
  if (
    !info ||
    !info.updateAvailable ||
    typeof info.currentVersion !== "string"
  ) {
    return null;
  }
  const target =
    typeof info.latestVersion === "string"
      ? `ego lite ${info.latestVersion}`
      : "an ego lite update";
  const urgency = info.mandatory ? "is required" : "is available";
  return `${NOTICE_PREFIX} ${target} ${urgency} (current ${info.currentVersion}) — run: ego-browser upgrade in your shell, then re-read the ego-browser skill`;
}

/**
 * Default version source. Calls the client method if this app build injected it,
 * otherwise returns null — older builds without the method simply report "no update"
 * instead of erroring.
 */
export async function probeBrowserVersion(): Promise<BrowserVersionInfo | null> {
  const ego = (globalThis as { ego?: { getBrowserVersion?: VersionSource } })
    .ego;
  if (!ego || typeof ego.getBrowserVersion !== "function") {
    return null;
  }
  return (await ego.getBrowserVersion()) ?? null;
}

/**
 * Ask the source, return the line to append, or null. Swallows every failure: an
 * update check must never be what breaks a command.
 */
export async function updateNoticeLine(
  options: { source?: VersionSource; env?: NodeJS.ProcessEnv } = {},
): Promise<string | null> {
  const env = options.env || process.env;
  if (noticeSuppressed(env)) return null;
  const source = options.source || probeBrowserVersion;
  try {
    return composeNotice((await source()) ?? null);
  } catch {
    return null;
  }
}

/** A stream that can receive the notice line. */
export type NoticeWritable = { write(chunk: string): unknown };

/**
 * The one real emit point: given the app's injected `ego` bridge (or none, on older
 * builds), fire the check and write the resulting line straight to `stream` if there
 * is one. Fire-and-forget — `installEgoSdk()` calls this without awaiting it, so the
 * check runs concurrently with the rest of the heredoc rather than delaying it.
 *
 * Writes directly to `stream` rather than through the output-sink buffer: an update
 * hint is unrelated to whether the command's own business logic hard-stopped, so it
 * must not be swallowed by (or dilute) that unrelated discard-on-hard-stop path.
 */
export function emitUpdateNotice(
  ego: { getBrowserVersion?: VersionSource } | null | undefined,
  stream: NoticeWritable,
  env?: NodeJS.ProcessEnv,
): void {
  updateNoticeLine({
    source: () => ego?.getBrowserVersion?.() ?? Promise.resolve(null),
    env,
  }).then((line) => {
    if (line) stream.write(`${line}\n`);
  });
}
