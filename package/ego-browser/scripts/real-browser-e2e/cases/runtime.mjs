export function waitHelpersCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();

    const waitedAt = Date.now();
    await waitForTimeout(100);
    assert(Date.now() - waitedAt >= 50, "waitForTimeout pauses for a measurable duration");
    assert(
      await waitForSelector("#delayed", { timeout: 3000, state: "visible" }),
      "waitForSelector observes delayed visible element"
    );
    assertEqual(
      await waitForSelector("#does-not-exist", { timeout: 200 }),
      false,
      "waitForSelector returns false for missing elements"
    );
    assertEqual(
      await waitForSelector("#never-visible", { timeout: 400, state: "visible" }),
      false,
      "waitForSelector state:visible rejects hidden elements"
    );
  `;
}

export function fetchHelpersCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();

    const serverText = await serverFetch(baseUrl + "/api/text", { timeout: 5 });
    assertEqual(serverText, "server text fixture", "serverFetch reads fixture API");

    const serverEcho = await serverFetch(baseUrl + "/api/echo", {
      method: "POST",
      body: "payload",
      timeout: 5,
    });
    assertEqual(serverEcho, "echo:POST:payload", "serverFetch sends method and body");

    const serverHeader = await serverFetch(baseUrl + "/api/header", {
      headers: { "x-e2e": "server-header" },
      timeout: 5,
    });
    assertEqual(serverHeader, "server-header", "serverFetch sends custom headers");

    const serverRedirect = await serverFetch(baseUrl + "/api/redirect", { timeout: 5 });
    assertEqual(serverRedirect, "server text fixture", "serverFetch follows redirects");

    await assertRejectsAny(
      () => serverFetch(baseUrl + "/api/slow?ms=1200&case=server-timeout-" + Date.now(), { timeout: 0.05 }),
      "serverFetch honors timeout"
    );

    await assertRejects(
      () => serverFetch(baseUrl + "/api/error", { timeout: 5 }),
      "HTTP 500",
      "serverFetch reports HTTP errors"
    );

    const browserText = await browserFetch("/api/text", { timeout: 5 });
    assertEqual(browserText, "server text fixture", "browserFetch reads fixture API");

    const browserEcho = await browserFetch("/api/echo", {
      method: "POST",
      body: "browser-payload",
      timeout: 5,
    });
    assertEqual(browserEcho, "echo:POST:browser-payload", "browserFetch sends method and body");

    const browserHeader = await browserFetch("/api/header", {
      headers: { "x-e2e": "browser-header" },
      timeout: 5,
    });
    assertEqual(browserHeader, "browser-header", "browserFetch sends custom headers");

    const browserRedirect = await browserFetch("/api/redirect", { timeout: 5 });
    assertEqual(browserRedirect, "server text fixture", "browserFetch follows redirects");

    const browserAbsolute = await browserFetch(baseUrl + "/api/text", { timeout: 5 });
    assertEqual(browserAbsolute, "server text fixture", "browserFetch accepts absolute URLs");

    await assertRejectsAny(
      () => browserFetch("/api/slow?ms=1200&case=browser-timeout-" + Date.now(), { timeout: 0.05 }),
      "browserFetch honors timeout"
    );

    await assertRejects(
      () => browserFetch("/api/error", { timeout: 5 }),
      "HTTP 500",
      "browserFetch reports HTTP errors"
    );
  `;
}

export function cdpJsHelpCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();

    await cdp("Network.enable");
    await evaluate(
      "window.__slowText = '';" +
        "fetch('/api/slow?ms=300&case=network-idle-' + Date.now())" +
        ".then((response) => response.text())" +
        ".then((text) => { window.__slowText = text; });" +
        "return true;"
    );
    assert(
      await waitForLoadState("networkidle", { timeout: 5000, idleMs: 100 }),
      "waitForLoadState networkidle waits for an in-flight slow fetch"
    );
    assertEqual(await evaluate("return window.__slowText"), "slow fixture", "waitForLoadState networkidle leaves the slow fetch complete");

    const evalResult = await cdp("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true,
    });
    assertEqual(evalResult.result.value, "ego-lite helper e2e", "cdp evaluates in page");

    await assertRejects(
      () => cdp("EgoBrowser.MissingMethodForE2E"),
      "EgoBrowser.MissingMethodForE2E",
      "cdp reports unsupported methods"
    );

    const title = await evaluate("return document.title");
    assertEqual(title, "ego-lite helper e2e", "js returns evaluated value");

    const wrappedReturn = await evaluate("const title = document.title; return title;");
    assertEqual(wrappedReturn, "ego-lite helper e2e", "js wraps top-level return statements");

    const arithmetic = await evaluate("1 + 2");
    assertEqual(arithmetic, 3, "js evaluates expression values");

    const titleFromFunction = await evaluate(() => document.title);
    assertEqual(titleFromFunction, "ego-lite helper e2e", "js supports function input");

    await assertRejects(
      () => evaluate("throw new Error('js boom')"),
      "js boom",
      "js reports page exceptions"
    );

    const helpText = help("click", "fill");
    assertIncludes(helpText, "click", "help returns helper documentation");
    assertIncludes(helpText, "fill", "help returns multiple helper docs");

    const unknownHelp = help("missingHelperForE2E");
    assertIncludes(unknownHelp, "Unknown helper", "help reports unknown helpers");
  `;
}
