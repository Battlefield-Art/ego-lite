export function navigationCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    const home = await resetHome();

    const info = await pageInfo();
    assertEqual(info.title, "ego-lite helper e2e", "pageInfo reads fixture title");
    assertIncludes(info.url, baseUrl + "/", "pageInfo reads current URL");
    assert(info.w > 0 && info.h > 0, "pageInfo returns viewport size");
    assert(Number.isFinite(info.pw) && Number.isFinite(info.ph), "pageInfo returns page dimensions");

    const tabs = await listTabs({ includeChrome: false });
    assert(tabs.some((tab) => tab.targetId === home.targetId), "listTabs includes home tab");
    const allTabs = await listTabs();
    assert(allTabs.length >= tabs.length, "listTabs defaults to include chrome/internal tabs");

    const current = await currentTab();
    assertEqual(current.targetId, home.targetId, "currentTab follows selected tab");

    const real = await ensureRealTab();
    assert(real && real.targetId, "ensureRealTab returns a real tab");
    const realTabListed = (await listTabs()).some((t) => t.targetId === real.targetId);
    assert(realTabListed, "ensureRealTab target appears in listTabs");

    const reused = await openOrReuseTab(baseUrl + "/", { wait: true, timeout: 10000 });
    assertEqual(reused.reused, true, "openOrReuseTab reuses exact home URL");

    const byOrigin = await openOrReuseTab(baseUrl + "/not-opened", {
      match: "origin",
      wait: false,
    });
    assertEqual(byOrigin.reused, true, "openOrReuseTab reuses by origin");

    const byPath = await openOrReuseTab(baseUrl + "/?query=1", {
      match: "origin+path",
      wait: false,
    });
    assertEqual(byPath.reused, true, "openOrReuseTab reuses by origin and path");

    const unique = await openOrReuseTab(baseUrl + "/secondary?unique=" + Date.now(), {
      wait: false,
    });
    assertEqual(unique.reused, false, "openOrReuseTab opens a unique exact URL");
    await closeTab(unique.targetId);
    await switchTab(home);

    const secondary = await openOrReuseTab(baseUrl + "/secondary", {
      wait: true,
      timeout: 10000,
    });
    await switchTab(secondary);
    assert(await waitForLoadState("load", { timeout: 10000 }), "secondary tab loads before target-id evaluation");
    const secondaryTitleViaTarget = await evaluate("return document.title", secondary.targetId);
    assertEqual(secondaryTitleViaTarget, "ego-lite secondary", "js evaluates against explicit target id");
    const homeTitleViaTarget = await evaluate("return document.title", home.targetId);
    assertEqual(homeTitleViaTarget, "ego-lite helper e2e", "js target id leaves current tab independent");

    const secondaryByIncludes = await openOrReuseTab("/secondary", {
      match: "includes",
      wait: false,
    });
    assertEqual(secondaryByIncludes.reused, true, "openOrReuseTab reuses by URL substring");
    await switchTab(secondary);
    const secondaryInfo = await pageInfo();
    assertEqual(secondaryInfo.title, "ego-lite secondary", "switchTab selects secondary tab");

    const closedId = await closeTab(secondary);
    assertEqual(closedId, secondary.targetId, "closeTab returns closed target id");
    await switchTab(home);

    const closeCurrent = await openOrReuseTab(baseUrl + "/secondary?close=current", {
      wait: true,
      timeout: 10000,
    });
    await switchTab(closeCurrent);
    const currentClosedId = await closeTab();
    assertEqual(currentClosedId, closeCurrent.targetId, "closeTab closes current tab by default");
    await switchTab(home);

    const afterCloseCurrent = await currentTab();
    assertEqual(afterCloseCurrent.targetId, home.targetId, "switchTab restores home after closing current tab");

    await assertRejects(
      () => closeTab(""),
      "closeTab requires a targetId",
      "closeTab validates empty target id"
    );

    await goto(baseUrl + "/nav-target", { waitUntil: "commit" });
    assert(await waitForLoadState("load", { timeout: 10000 }), "waitForLoadState observes goto navigation");
    const navInfo = await pageInfo();
    assertEqual(navInfo.title, "ego-lite nav target", "goto navigates current tab");

    const noWaitNav = await goto(baseUrl + "/nav-target?no-wait=1", {
      waitUntil: "commit",
    });
    assertEqual(noWaitNav.loaded, false, "goto supports waitUntil:commit");
    assert(await waitForLoadState("load", { timeout: 10000 }), "waitForLoadState can follow waitUntil:commit navigation");

    const nav = await goto(baseUrl + "/", { timeout: 10000, settle: 100 });
    assert(nav.loaded, "goto returns loaded true");

    const frame = await iframeTarget("/frame.html");
    assert(frame === null || (typeof frame === "string" && frame.length > 0), "iframeTarget returns a non-empty session id or null");
    const missingFrame = await iframeTarget("/missing-frame-for-e2e");
    assertEqual(missingFrame, null, "iframeTarget returns null for missing frames");
  `;
}
