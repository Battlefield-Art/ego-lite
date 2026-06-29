export function pointerClickCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();
    cliLog(JSON.stringify({ pointerStep: "click ready" }));

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
    cliLog(JSON.stringify({ pointerStep: "hover drag ready" }));

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
    cliLog(JSON.stringify({ pointerStep: "scroll ready" }));

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
      "scroll nested container",
      () => scroll(innerCenter.x, innerCenter.y, { dy: 350 })
    );
    if (innerWheelDispatched) {
      await waitForJsCondition(
        "document.querySelector('#inner-scroll').scrollTop > 0",
        "scroll targets nested scroll containers"
      );
    }

    await resetHome();
    const wheelPoint = await evaluate(
      "const rect = document.querySelector('#scroll-area').getBoundingClientRect();" +
        "return { x: Math.min(Math.max(rect.left + 20, 10), innerWidth - 10), y: Math.min(Math.max(rect.top + 20, 10), innerHeight - 10) };"
    );
    const beforeWheel = await pageInfo();
    const wheelDispatched = await allowWheelDispatch("scroll wheel", () =>
      scroll(wheelPoint.x, wheelPoint.y, { dy: 300 })
    );
    if (wheelDispatched) {
      await waitForJsCondition(
        "scrollY > " + JSON.stringify(beforeWheel.sy),
        "scroll wheel moves the page down"
      );
      const afterWheel = await pageInfo();
      assert(afterWheel.sy > beforeWheel.sy, "scroll wheel moves the page down");
    }

    await resetHome();
    const objectWheelPoint = await evaluate(
      "const rect = document.querySelector('#scroll-area').getBoundingClientRect();" +
        "return { x: Math.min(Math.max(rect.left + 30, 10), innerWidth - 10), y: Math.min(Math.max(rect.top + 30, 10), innerHeight - 10) };"
    );
    const beforeObjectWheel = await pageInfo();
    const objectWheelDispatched = await allowWheelDispatch("scroll object options", () =>
      scroll({ x: objectWheelPoint.x, y: objectWheelPoint.y, dy: 120 })
    );
    if (objectWheelDispatched) {
      await waitForJsCondition(
        "scrollY > " + JSON.stringify(beforeObjectWheel.sy),
        "scroll object options move the page down"
      );
      const afterObjectWheel = await pageInfo();
      assert(afterObjectWheel.sy > beforeObjectWheel.sy, "scroll object options move the page down");
    }

    await resetHome();
    const beforeBy = await pageInfo();
    const by = await scrollBy({ dy: 450 });
    assert(by.y > beforeBy.sy, "scrollBy moves the page down and returns scroll position");
    const byNumber = await scrollBy(120);
    assert(byNumber.y > by.y, "scrollBy accepts numeric amount");
    const byTop = await scrollBy({ top: -60 });
    assert(byTop.y < byNumber.y && byTop.y >= 0, "scrollBy accepts top option");

    const bottom = await scrollToBottomUntil(
      "document.querySelector('#bottom-marker').getBoundingClientRect().top < innerHeight",
      { step: 700, maxSteps: 8, wait: 0.05 }
    );
    assert(bottom.done || bottom.reason === "bottom", "scrollToBottomUntil terminates");

    await resetHome();
    const maxStep = await scrollToBottomUntil("false", {
      step: 100,
      maxSteps: 0,
      wait: 0,
    });
    assertEqual(maxStep.reason, "maxSteps", "scrollToBottomUntil reports maxSteps");

    const nullCondition = await scrollToBottomUntil(null, {
      step: 100,
      maxSteps: 0,
      wait: 0,
    });
    assertEqual(nullCondition.reason, "maxSteps", "scrollToBottomUntil accepts null condition");

    const functionCondition = await scrollToBottomUntil(
      (state) => state.y > 100,
      { step: 200, maxSteps: 5, wait: 0 }
    );
    assertEqual(functionCondition.reason, "condition", "scrollToBottomUntil accepts function condition");

    const immediateCondition = await scrollToBottomUntil("true", {
      step: 100,
      maxSteps: 3,
      wait: 0,
    });
    assertEqual(immediateCondition.reason, "condition", "scrollToBottomUntil accepts immediate string condition");
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
      () => scrollBy({ dy: "bad" }),
      "invalid mouse offset",
      "scrollBy validates numeric offsets"
    );
    await assertRejects(
      () => scrollToBottomUntil(42, { maxSteps: 0 }),
      "function or string",
      "scrollToBottomUntil validates condition type"
    );
  `;
}

export function pointerInteractionRegressionCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();
    cliLog(JSON.stringify({ pointerStep: "interaction regression ready" }));

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
