/*
 * Workflow tests: multi-step scenarios that simulate real agent behavior
 * across pages, tabs, and state transitions. These cover paths that isolated
 * per-subsystem tests miss — state leakage, cross-tab consistency, and
 * sequential interaction chains.
 */

import { homeCase } from "./shared.mjs";

export const workflowCases = [
  {
    name: "workflow multi-page navigation",
    body: homeCase(`
      /* Step 1: capture initial home state. */
      const homeInfo = await pageInfo();
      assertEqual(homeInfo.title, "ego-lite helper e2e", "workflow: home title before navigation");

      /* Step 2: click the nav link to navigate within the current tab. */
      await click("#nav-link");
      assert(await waitForLoadState("load", { timeout: 10000 }), "workflow: nav-target page loads");
      const navInfo = await pageInfo();
      assertEqual(navInfo.title, "ego-lite nav target", "workflow: page title changes after navigation");
      assertIncludes(navInfo.url, "/nav-target", "workflow: URL reflects nav-target");

      /* Step 3: open a secondary page in a new tab. */
      const secondary = await openOrReuseTab(baseUrl + "/secondary", {
        wait: true,
        timeout: 10000,
      });
      assertEqual(secondary.reused, false, "workflow: secondary tab is new");
      await switchTab(secondary);
      const secTitle = await evaluate("return document.title");
      assertEqual(secTitle, "ego-lite secondary", "workflow: secondary tab title is correct");

      /* Step 4: switch back to the nav-target tab and verify its state persisted. */
      const tabs = await listTabs({ includeChrome: false });
      const navTab = tabs.find((t) => String(t.url || "").includes("/nav-target"));
      assert(navTab, "workflow: nav-target tab still exists in tab list");
      await switchTab(navTab.targetId);
      const navTitleAfterSwitch = await evaluate("return document.title");
      assertEqual(navTitleAfterSwitch, "ego-lite nav target", "workflow: nav-target title persists across tab switches");

      /* Step 5: navigate back home via goto and verify clean state. */
      await goto(baseUrl + "/", { waitUntil: "commit" });
      assert(await waitForLoadState("load", { timeout: 10000 }), "workflow: home page reloads");
      const backHomeInfo = await pageInfo();
      assertEqual(backHomeInfo.title, "ego-lite helper e2e", "workflow: home title restored after multi-tab navigation");

      /* Step 6: close the secondary tab and verify tab count. */
      const tabsBeforeClose = (await listTabs({ includeChrome: false })).length;
      await closeTab(secondary.targetId);
      // Poll for tab count to decrease (closeTab may resolve before the tab list updates)
      const deadline = Date.now() + 2000;
      let remaining;
      do {
        remaining = await listTabs({ includeChrome: false });
        if (remaining.length < tabsBeforeClose) break;
        await waitForTimeout(100);
      } while (Date.now() < deadline);
      assert(remaining.length < tabsBeforeClose, "workflow: tab count decreased after closing secondary");

      /* Step 7: verify browserFetch still works after all the navigation. */
      const text = await browserFetch("/api/text", { timeout: 5 });
      assertEqual(text, "server text fixture", "workflow: browserFetch works after multi-page navigation");
    `),
  },
  {
    name: "workflow form interaction chain",
    body: homeCase(`
      /* Step 1: fill a text input and verify the value. */
      await fill("#text-input", "hello", { timeout: 3000 });
      assertEqual(
        await evaluate("return document.querySelector('#text-input').value"),
        "hello",
        "workflow: fill sets text value"
      );

      /* Step 2: append more text with insertText. */
      await click("#text-input");
      await insertText(" world");
      assertEqual(
        await evaluate("return document.querySelector('#text-input').value"),
        "hello world",
        "workflow: insertText appends to existing value"
      );

      /* Step 3: select-all then overwrite using fill (which clears first). */
      await fill("#text-input", "replaced", { timeout: 3000 });
      assertEqual(
        await evaluate("return document.querySelector('#text-input').value"),
        "replaced",
        "workflow: fill replaces entire value"
      );

      /* Step 4: fill the textarea and verify independently. */
      await fill("#text-area", "area content", { timeout: 3000 });
      assertEqual(
        await evaluate("return document.querySelector('#text-area').value"),
        "area content",
        "workflow: textarea value set independently"
      );
      /* Text input should not have been affected by textarea fill. */
      assertEqual(
        await evaluate("return document.querySelector('#text-input').value"),
        "replaced",
        "workflow: text input unchanged after textarea fill"
      );

      /* Step 5: toggle checkbox and verify state. */
      assertEqual(
        await evaluate("return window.__fixtureState.checkboxChecked"),
        false,
        "workflow: checkbox starts unchecked"
      );
      await click("#checkbox");
      await waitForJsCondition("window.__fixtureState.checkboxChecked", "workflow: checkbox becomes checked after click");

      /* Step 6: click a second time to uncheck. */
      await click("#checkbox");
      await waitForJsValue(
        "window.__fixtureState.checkboxChecked",
        false,
        "workflow: checkbox toggles back to unchecked"
      );

      /* Step 7: interact with dynamic DOM — add element, verify, remove, verify. */
      await click("#add-element");
      const appeared = await waitForSelector("#dynamic-element", { timeout: 3000, state: "visible" });
      assertEqual(appeared, true, "workflow: dynamically added element becomes visible");
      const dynText = await evaluate("return document.querySelector('#dynamic-element')?.textContent");
      assertIncludes(dynText, "Dynamic", "workflow: dynamic element has expected text");

      await click("#remove-element");
      const gone = await waitForSelector("#dynamic-element", { timeout: 3000 });
      assertEqual(gone, false, "workflow: dynamically removed element disappears");

      /* Step 8: verify the click counter tracked only #click-button clicks (none in this workflow). */
      const totalClicks = await evaluate("return window.__fixtureState.clicks");
      assertEqual(totalClicks, 0, "workflow: click counter only tracks #click-button, not form interactions");
    `),
  },
  {
    name: "workflow observation and recovery",
    body: homeCase(`
      /* Step 1: take a snapshot and capture refs for known elements. */
      const snap1 = await snapshot({
        scope: "full_page",
        includeActionMarks: true,
        includeStableLocator: true,
      });
      const buttonRef = (snap1.refs || []).find(
        (r) => String(r?.role || "") === "button" && String(r?.name || "").includes("Increment")
      )?.backendNodeId;
      assert(buttonRef, "workflow: initial snapshot exposes button ref");

      /* Step 2: click using the ref and verify it works. */
      await click("@" + buttonRef);
      await waitForJsValue("window.__fixtureState.clicks", 1, "workflow: click via ref increments counter");

      /* Step 3: modify the DOM, then verify the snapshot reflects the new element. */
      await click("#add-element");
      await waitForSelector("#dynamic-element", { timeout: 3000, state: "visible" });
      const textAfterAdd = await snapshotText({ scope: "full_page" });
      assertIncludes(String(textAfterAdd), "Dynamic!", "workflow: snapshot text includes dynamic element after mutation");

      /* Step 4: use the old button ref — it should still work because the
         element is still present (not replaced, just a sibling added). */
      await click("@" + buttonRef);
      await waitForJsValue("window.__fixtureState.clicks", 2, "workflow: old ref still valid when element is unchanged");

      /* Step 5: remove the dynamic element and verify the ref becomes stale. */
      await click("#remove-element");
      await waitForSelector("#dynamic-element", { timeout: 3000 });
      // The dynamic element is gone; trying to click its stale ref should
      // either fall back (if another element matches the role/name) or fail.
      // We just verify the element is truly removed.
      const dynExists = await evaluate("return !!document.querySelector('#dynamic-element')");
      assertEqual(dynExists, false, "workflow: dynamic element removed from DOM");

      /* Step 6: take a screenshot and verify the file is created. */
      const screenshotPath = join(artifactDir, "workflow-shot.png");
      await screenshot({ path: screenshotPath });
      const screenshotStat = await stat(screenshotPath);
      assert(screenshotStat.size > 0, "workflow: screenshot file is non-empty");

      /* Step 7: drain events and verify the buffer mechanism. */
      const events = await drainEvents();
      assert(Array.isArray(events), "workflow: drainEvents returns an array");
      const emptyEvents = await drainEvents();
      assertEqual(emptyEvents.length, 0, "workflow: second drain returns empty buffer");

      /* Step 8: take a snapshotText and verify it reflects current DOM state. */
      const text = await snapshotText({ scope: "full_page" });
      assertIncludes(text, "Helper e2e fixture", "workflow: snapshotText includes page heading");
      // Dynamic element was removed, so its text should not appear
      const hasDynamic = String(text).includes("Dynamic!");
      assertEqual(hasDynamic, false, "workflow: snapshotText reflects removal of dynamic element");
    `),
  },
];
