export function helperSurfaceCase() {
  return `
    const expectedHelpers = [
      "listTaskSpaces",
      "switchTaskSpace",
      "newTaskSpace",
      "useOrCreateTaskSpace",
      "claimTaskSpace",
      "completeTaskSpace",
      "handOffTaskSpace",
      "takeOverTaskSpace",
      "waitForAgentControl",
      "pageInfo",
      "listTabs",
      "currentTab",
      "switchTab",
      "openOrReuseTab",
      "closeTab",
      "goto",
      "ensureRealTab",
      "iframeTarget",
      "snapshot",
      "snapshotRaw",
      "screenshot",
      "elementCenter",
      "drainEvents",
      "click",
      "dblclick",
      "hover",
      "drag",
      "wheel",
      "scrollIntoViewIfNeeded",
      "press",
      "insertText",
      "fill",
      "dispatchKey",
      "setInputFiles",
      "waitForTimeout",
      "waitForLoadState",
      "waitForSelector",
      "serverFetch",
      "browserFetch",
      "cdp",
      "evaluate",
      "help",
    ];
    for (const name of expectedHelpers) {
      assertEqual(typeof globalThis[name], "function", "helper is installed: " + name);
    }
    assertEqual(typeof globalThis.newTab, "undefined", "internal newTab is not exposed");
    const helpText = help("missingHelperForE2E");
    assertIncludes(helpText, "Unknown helper", "help reports unknown helper names");
  `;
}
