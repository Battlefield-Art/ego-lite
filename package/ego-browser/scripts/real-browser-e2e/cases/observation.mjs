export function observationCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();

    const raw = await snapshotRaw({ includeStableLocator: true });
    assertIncludes(raw.content || "", "Helper e2e fixture", "snapshotRaw contains fixture content");

    const compactRaw = await snapshotRaw({
      scope: "only_within_viewport",
      includeActionMarks: false,
      includeStableLocator: false,
    });
    assertIncludes(compactRaw.content || "", "Helper e2e fixture", "snapshotRaw accepts compact options");

    const snap = await snapshotRaw({
      scope: "full_page",
      includeActionMarks: true,
      includeStableLocator: true,
    });
    assertIncludes(snap.content || "", "Click counter", "snapshotRaw contains button text");
    assert(Array.isArray(snap.refs), "snapshotRaw returns refs array");

    const buttonRef = (snap.refs || []).find(
      (ref) =>
        String(ref?.role || "") === "button" &&
        (String(ref?.name || "").includes("Increment counter") ||
          String(ref?.name || "").includes("Click counter"))
    )?.backendNodeId;
    assert(buttonRef, "snapshotRaw exposes a reusable backend ref for the button");
    const atRefCenter = await elementCenter("@" + buttonRef);
    assert(Number.isFinite(atRefCenter.x) && Number.isFinite(atRefCenter.y), "@ref resolves to coordinates");
    const namedRefCenter = await elementCenter("ref=" + buttonRef);
    assert(Number.isFinite(namedRefCenter.x) && Number.isFinite(namedRefCenter.y), "ref= resolves to coordinates");

    const text = await snapshot({ scope: "full_page" });
    assertIncludes(text, "Text input", "snapshot returns text content");

    const viewportText = await snapshot({ scope: "only_within_viewport" });
    assertIncludes(viewportText, "Helper e2e fixture", "snapshot supports viewport scope");

    const center = await elementCenter("#click-button");
    assert(Number.isFinite(center.x) && Number.isFinite(center.y), "elementCenter returns coordinates");

    const locatorCenter = await elementCenter("loc=css:#click-button");
    assert(Number.isFinite(locatorCenter.x) && Number.isFinite(locatorCenter.y), "elementCenter resolves loc=css");

    const hrefCenter = await elementCenter("loc=href:/nav-target");
    assert(Number.isFinite(hrefCenter.x) && Number.isFinite(hrefCenter.y), "elementCenter resolves loc=href");

    const xpathCenter = await elementCenter("xpath=//*[@id='click-button']");
    assert(Number.isFinite(xpathCenter.x) && Number.isFinite(xpathCenter.y), "elementCenter resolves xpath");

    await assertRejects(
      () => elementCenter("loc=css:.duplicate-action"),
      "matched 2",
      "elementCenter reports duplicate css locators"
    );
    await assertRejects(
      () => elementCenter("loc=role:button[name='Duplicate action']"),
      "matched 2",
      "elementCenter reports duplicate role locators"
    );
    await assertRejects(
      () => elementCenter("loc=href:/missing-link"),
      "matched 0",
      "elementCenter reports missing href locators"
    );
    await assertRejects(
      () => elementCenter("@999999"),
      "Unknown ref",
      "elementCenter reports unknown refs"
    );
    await assertRejects(
      () => elementCenter("["),
      "Invalid selector",
      "elementCenter reports invalid selectors"
    );
    await assertRejects(
      () => elementCenter("#does-not-exist"),
      "Element not found",
      "elementCenter reports missing elements"
    );

    const screenshotPath = await screenshot({ path: undefined, fullPage: false });
    const screenshotStat = await stat(screenshotPath);
    assert(screenshotStat.size > 100, "screenshot writes a non-trivial png");
    const screenshotBuf = await readFile(screenshotPath);
    assertEqual(screenshotBuf[0], 137, "screenshot starts with PNG magic byte 137");
    assertEqual(screenshotBuf[1], 80, "screenshot has PNG header byte P (80)");

    const explicitPath = await screenshot({ path: explicitScreenshotPath, fullPage: false });
    assertEqual(explicitPath, explicitScreenshotPath, "screenshot returns explicit path");
    const explicitStat = await stat(explicitPath);
    assert(explicitStat.size > 0, "screenshot writes explicit path");

    const fullScreenshotPath = await screenshot({ path: undefined, fullPage: true });
    const fullScreenshotStat = await stat(fullScreenshotPath);
    assert(fullScreenshotStat.size > 0, "screenshot supports full page");

    const rawScreenshotPath = await screenshot({ path: undefined,
      raw: true,
      clip: { x: 0, y: 0, width: 120, height: 120, scale: 1 },
    });
    const rawScreenshotStat = await stat(rawScreenshotPath);
    assert(rawScreenshotStat.size > 0, "screenshot supports raw clips");

    await cdp("Network.enable");
    await browserFetch("/api/text", { timeout: 5 });
    const events = await drainEvents();
    assert(Array.isArray(events), "drainEvents returns an array");
    const eventsAfterDrain = await drainEvents();
    assertEqual(eventsAfterDrain.length, 0, "drainEvents clears the event buffer");

    /* dynamic DOM — add element, verify snapshot picks it up */
    console.log(JSON.stringify({ observationStep: "dynamic DOM" }));
    await click("#remove-element");
    await waitForTimeout(100);
    const textBefore = await snapshot({ scope: "full_page" });
    assert(!String(textBefore).includes("Dynamic!"), "snapshot text does not contain dynamic element before creation");

    await click("#add-element");
    await waitForSelector("#dynamic-element", { timeout: 3000, state: "visible" });
    await waitForTimeout(200);
    const textAfter = await snapshot({ scope: "full_page" });
    assertIncludes(String(textAfter), "Dynamic!", "snapshot text includes dynamically created element");

    /* iframe interaction — evaluate JS inside the iframe */
    console.log(JSON.stringify({ observationStep: "iframe" }));
    const frameTarget = await iframeTarget("/frame.html");
    if (frameTarget) {
      const iframeMarkerText = await evaluate(
        "return document.querySelector('#iframe-marker')?.textContent",
        frameTarget
      );
      assertEqual(iframeMarkerText, "iframe target", "js evaluates inside iframe using targetId");

      const iframeTitle = await evaluate("return document.title", frameTarget);
      assertEqual(iframeTitle, "ego-lite iframe", "js reads iframe page title via targetId");
    } else {
      console.log(JSON.stringify({ iframeWarning: "iframe target not available, skipping iframe tests" }));
    }
  `;
}
