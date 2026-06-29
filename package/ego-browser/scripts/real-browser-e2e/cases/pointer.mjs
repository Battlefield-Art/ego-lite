export function pointerClickCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();
    console.log(JSON.stringify({ pointerStep: "click ready" }));

    assertEqual(await evaluate("return window.__fixtureState.clicks"), 0, "click fixture starts at zero");
    await click("#click-button", { label: "click helper e2e" });
    await waitForJsValue(
      "window.__fixtureState.clicks",
      1,
      "click css fires a page click",
      "window.__fixtureState.pointerEvents"
    );
    await click({ selector: "#click-button", x: 12, y: 12 });
    await waitForJsValue("window.__fixtureState.clicks", 2, "click selector offset fires a page click");
    await click("loc=css:#click-button");
    await waitForJsValue("window.__fixtureState.clicks", 3, "click loc css fires a page click");
    await click("loc=role:button[name='Increment counter']");
    await waitForJsValue("window.__fixtureState.clicks", 4, "click role locator fires a page click");
    await click("xpath=//*[@id='click-button']");
    await waitForJsValue("window.__fixtureState.clicks", 5, "click xpath fires a page click");
    const buttonCenter = await elementCenter("#click-button");
    const hitElement = await evaluate(
      "return document.elementFromPoint(" +
        JSON.stringify(buttonCenter.x) +
        "," +
        JSON.stringify(buttonCenter.y) +
        ")?.id || document.elementFromPoint(" +
        JSON.stringify(buttonCenter.x) +
        "," +
        JSON.stringify(buttonCenter.y) +
        ")?.className || ''"
    );
    assertEqual(hitElement, "click-button", "pointer coordinates resolve to the intended button");
    await click([buttonCenter.x, buttonCenter.y]);
    await waitForJsValue("window.__fixtureState.clicks", 6, "click tuple coordinates fires a page click");
    await click({ x: buttonCenter.x, y: buttonCenter.y });
    await waitForJsValue("window.__fixtureState.clicks", 7, "click object coordinates fires a page click");
    await click("#click-button", { clickCount: 2 });
    await waitForJsValue("window.__fixtureState.clicks", 8, "click count option fires a page click");
    await waitForJsValue("window.__fixtureState.lastClickDetail", 2, "click count option sets DOM click detail");
    const doubleClicksBefore = await evaluate("return window.__fixtureState.doubleClicks");
    await dblclick("#click-button");
    await waitForJsValue("window.__fixtureState.clicks", 9, "dblclick fires a page click");
    await waitForJsValue("window.__fixtureState.lastClickDetail", 2, "dblclick sets DOM click detail");
    await waitForJsCondition(
      "window.__fixtureState.doubleClicks > " + JSON.stringify(doubleClicksBefore),
      "dblclick fires a DOM dblclick"
    );
  `;
}

export function pointerHoverDragCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();
    console.log(JSON.stringify({ pointerStep: "hover drag ready" }));

    await evaluate("window.__fixtureState.hovered = false; return true;");
    await hover("#hover-zone");
    await waitForJsValue("window.__fixtureState.hovered", true, "hover css fires mouseover");
    await evaluate("window.__fixtureState.hovered = false; return true;");
    await hover({ selector: "#hover-zone" });
    await waitForJsValue("window.__fixtureState.hovered", true, "hover selector object fires mouseover");

    await evaluate("window.__fixtureState.dragged = false; return true;");
    await drag(["#drag-source", "#drag-target"], { delay: 10 });
    await waitForJsValue("window.__fixtureState.dragged", true, "drag fires drag source and target events");
  `;
}

export function scrollHelpersCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();
    console.log(JSON.stringify({ pointerStep: "scroll ready" }));

    // wheel() routes through CDP only while the tab is visible AND focused; an
    // unfocused tab falls back to a synthetic WheelEvent that does not move native
    // scrollbars, so gate the native-scroll assertions on the CDP path.
    const wheelUsesCdp = await evaluate(
      "return document.visibilityState === 'visible' && document.hasFocus();"
    );

    await evaluate(
      "const inner = document.querySelector('#inner-scroll');" +
        "inner.scrollTop = 0;" +
        "inner.scrollIntoView({ block: 'center', inline: 'nearest' });" +
        "return true;"
    );
    await waitForTimeout(100);
    const innerCenter = await elementCenter("#inner-scroll");
    const innerHit = await evaluate(
      "const el = document.elementFromPoint(" +
        JSON.stringify(innerCenter.x) +
        "," +
        JSON.stringify(innerCenter.y) +
        ");" +
        "return el?.closest?.('#inner-scroll')?.id || el?.id || '';"
    );
    assertEqual(innerHit, "inner-scroll", "nested scroll container is under the wheel target");
    const innerWheelDispatched = await allowWheelDispatch(
      "wheel nested container",
      () => wheel(0, 350, { x: innerCenter.x, y: innerCenter.y })
    );
    if (wheelUsesCdp && innerWheelDispatched) {
      await waitForJsCondition(
        "document.querySelector('#inner-scroll').scrollTop > 0",
        "wheel targets nested scroll containers"
      );
    }

    await resetHome();
    const wheelPoint = await evaluate(
      "const rect = document.querySelector('#scroll-area').getBoundingClientRect();" +
        "return { x: Math.min(Math.max(rect.left + 20, 10), innerWidth - 10), y: Math.min(Math.max(rect.top + 20, 10), innerHeight - 10) };"
    );
    const beforeWheel = await pageInfo();
    const wheelDispatched = await allowWheelDispatch("wheel page", () =>
      wheel(0, 300, { x: wheelPoint.x, y: wheelPoint.y })
    );
    if (wheelUsesCdp && wheelDispatched) {
      await waitForJsCondition(
        "scrollY > " + JSON.stringify(beforeWheel.sy),
        "wheel moves the page down"
      );
      const afterWheel = await pageInfo();
      assert(afterWheel.sy > beforeWheel.sy, "wheel moves the page down");
    }

    // scrollIntoViewIfNeeded scrolls through the DOM, so it reveals an element
    // regardless of tab focus.
    await resetHome();
    const markerBefore = await evaluate(
      "return document.querySelector('#bottom-marker').getBoundingClientRect().top >= innerHeight;"
    );
    assert(markerBefore, "bottom marker starts below the viewport");
    await scrollIntoViewIfNeeded("#bottom-marker");
    await waitForJsCondition(
      "document.querySelector('#bottom-marker').getBoundingClientRect().top < innerHeight",
      "scrollIntoViewIfNeeded reveals an off-screen element"
    );
  `;
}

export function pointerValidationCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();

    await assertRejects(
      () => drag(["#drag-source"]),
      "at least two points",
      "drag validates minimum path length"
    );
    await assertRejects(
      () => click({ x: "bad", y: 1 }),
      "invalid mouse target",
      "click validates coordinate targets"
    );
    await assertRejects(
      () => click("#click-button", { button: "sideways" }),
      "unsupported mouse button",
      "click validates mouse buttons"
    );
    await assertRejects(
      () => drag(["#drag-source", "#drag-target"], { button: "sideways" }),
      "unsupported mouse button",
      "drag validates mouse buttons"
    );
    await assertRejects(
      () => wheel(0, 0, { x: "bad" }),
      "invalid mouse offset",
      "wheel validates numeric viewport coordinates"
    );
  `;
}

export function pointerInteractionRegressionCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();
    console.log(JSON.stringify({ pointerStep: "interaction regression ready" }));

    const rightClickBefore = await evaluate("return window.__fixtureState.pointerEvents.length");
    await click("#context-menu-zone", { button: "right" });
    const rightClickAfter = await evaluate("return window.__fixtureState.pointerEvents.length");
    assert(rightClickAfter > rightClickBefore, "click with button:right dispatches mouse events on the target");
    const rightMouseDown = await evaluate(
      "return window.__fixtureState.pointerEvents.some(function(e) { return e.type === 'mousedown' && e.target === 'context-menu-zone'; })"
    );
    assert(rightMouseDown, "right-click produces a mousedown event on the context-menu-zone");

    await resetHome();
    const clicksBefore = await evaluate("return window.__fixtureState.clicks");
    await click("#click-button");
    await click("#click-button");
    await click("#click-button");
    await click("#click-button");
    await click("#click-button");
    await waitForJsValue(
      "window.__fixtureState.clicks",
      clicksBefore + 5,
      "five rapid clicks increment counter correctly (probe cleanup between actions)",
      "window.__fixtureState.pointerEvents"
    );

    await evaluate("document.querySelector('#checkbox').checked = false; window.__fixtureState.checkboxChecked = false; return true;");
    await click("#checkbox");
    await waitForJsValue("window.__fixtureState.checkboxChecked", true, "first click checks the checkbox");
    await click("#checkbox");
    await waitForJsValue("window.__fixtureState.checkboxChecked", false, "second click unchecks the checkbox");
  `;
}
