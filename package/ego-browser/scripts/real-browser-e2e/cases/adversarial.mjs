import { homeCase, buttonRefSetup } from "./shared.mjs";

export const adversarialCases = [
  {
    name: "adversarial stale ref falls back after replacement",
    body: homeCase(`
      ${buttonRefSetup()}
      await evaluate(\`
        const oldButton = document.querySelector('#click-button');
        const replacement = oldButton.cloneNode(true);
        replacement.addEventListener('click', (event) => {
          window.__fixtureState.clicks += 11;
          window.__fixtureState.lastClickDetail = event.detail;
          document.querySelector('#click-count').textContent = String(window.__fixtureState.clicks);
        });
        oldButton.replaceWith(replacement);
        return true;
      \`);
      await click("@" + buttonRef);
      await waitForJsValue(
        "window.__fixtureState.clicks",
        11,
        "stale backend ref falls back to the replacement with the same role/name"
      );
    `),
  },
  {
    name: "adversarial js serialization boundaries",
    body: homeCase(`
      assert(Number.isNaN(await evaluate("NaN")), "js decodes NaN unserializable value");
      assertEqual(await evaluate("Infinity"), Infinity, "js decodes positive Infinity");
      assertEqual(await evaluate("-Infinity"), -Infinity, "js decodes negative Infinity");
      assert(Object.is(await evaluate("-0"), -0), "js preserves negative zero");
      assert(
        (await evaluate("12345678901234567890n")) === 12345678901234567890n,
        "js decodes BigInt unserializable value"
      );
    `),
  },
  {
    name: "adversarial js wrapping boundaries",
    body: homeCase(`
      assertEqual(await evaluate("Promise.resolve(42)"), 42, "js awaits promise values");
      assertEqual(await evaluate("'return is inside a string'"), "return is inside a string", "js does not wrap return inside strings");
      assertEqual(await evaluate("// return is inside a comment\\n1 + 4"), 5, "js does not wrap return inside comments");
      assertEqual(await evaluate("const returned = 1; returned + 1"), 2, "js does not treat returned as return keyword");
      await assertRejects(
        () => evaluate("throw 'primitive boom'"),
        "primitive boom",
        "js reports thrown primitive values"
      );
    `),
  },
  {
    name: "adversarial fetch origin follows current page",
    body: homeCase(`
      await goto(baseUrl + "/nav-target", { timeout: 10000 });
      assertEqual(await browserFetch("/api/text", { timeout: 5 }), "server text fixture", "browserFetch resolves relative URLs against current page origin after navigation");
      await goto(baseUrl + "/", { timeout: 10000 });
      assertEqual(await browserFetch("/api/text", { timeout: 5 }), "server text fixture", "browserFetch still resolves after navigating back home");
    `),
  },
];
