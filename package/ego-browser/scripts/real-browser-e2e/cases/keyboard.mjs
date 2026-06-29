export function keyboardCase() {
  return `
    await useOrCreateTaskSpace(taskName);
    await resetHome();

    await fill("#text-input", "filled", { timeout: 3000 });
    let value = await evaluate("return document.querySelector('#text-input').value");
    assertEqual(value, "filled", "fill writes text");

    await fill("loc=css:#text-area", "area text", { timeout: 3000 });
    const areaValue = await evaluate("return document.querySelector('#text-area').value");
    assertEqual(areaValue, "area text", "fill supports textarea through loc=css");

    await evaluate("const el = document.querySelector('#append-input'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); return el.value");
    await fill("#append-input", "-suffix", { clearFirst: false, timeout: 3000 });
    const appended = await evaluate("return document.querySelector('#append-input').value");
    assertEqual(appended, "base-suffix", "fill clearFirst:false preserves existing input value");

    await evaluate("return document.querySelector('#text-input').focus()");
    await insertText(" text");
    value = await evaluate("return document.querySelector('#text-input').value");
    assertEqual(value, "filled text", "insertText appends focused text");

    await fill("#text-input", "abc", { timeout: 3000 });
    await evaluate("const el = document.querySelector('#text-input'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); return el.value");
    await press("Backspace");
    await waitForJsValue(
      "document.querySelector('#text-input').value",
      "ab",
      "press Backspace edits the focused input",
      "window.__fixtureState.keyEvents"
    );
    const activeAfterPress = await evaluate("return document.activeElement?.id || ''");
    assertEqual(activeAfterPress, "text-input", "press keeps the focused input active");

    await dispatchKey("#text-input", "Escape", "keydown");
    let keys = await evaluate("return window.__fixtureState.keys.join(',')");
    assertIncludes(keys, "Escape", "dispatchKey dispatches synthetic keyboard input");

    await fill("#text-input", "select me", { timeout: 3000 });
    await press("ControlOrMeta+a");
    await insertText("selected");
    await waitForJsValue(
      "document.querySelector('#text-input').value",
      "selected",
      "press supports platform select-all modifiers"
    );

    await setInputFiles("#file-input", uploadPath);
    let fileName = await evaluate("return Array.from(document.querySelector('#file-input').files).map((file) => file.name).join(',')");
    assertEqual(fileName, "fixture-upload.txt", "setInputFiles attaches a single file");

    await setInputFiles("#file-input", [uploadPath, uploadPathTwo]);
    fileName = await evaluate("return Array.from(document.querySelector('#file-input').files).map((file) => file.name).join(',')");
    assertEqual(fileName, "fixture-upload.txt,fixture-upload-two.txt", "setInputFiles attaches multiple files");

    await assertRejects(
      () => fill("#missing-input", "nope", { timeout: 200 }),
      "element not found",
      "fill reports missing elements"
    );
    await assertRejects(
      () => setInputFiles("#missing-file-input", uploadPath),
      "Element not found",
      "setInputFiles reports missing file inputs"
    );
    await assertRejects(
      () => dispatchKey("#missing-input", "Enter"),
      "Element not found",
      "dispatchKey reports missing targets"
    );

    /* contentEditable typing */
    console.log(JSON.stringify({ keyboardStep: "contentEditable" }));
    await click("#rich-editor");
    await evaluate("document.querySelector('#rich-editor').focus(); document.querySelector('#rich-editor').textContent = ''; return true;");
    await insertText("hello world");
    const editorText = await evaluate("return document.querySelector('#rich-editor').textContent");
    assertIncludes(editorText, "hello world", "insertText inserts text into contentEditable element");

    /* rapid Backspace sequence */
    console.log(JSON.stringify({ keyboardStep: "rapid backspace" }));
    await fill("#text-input", "test", { timeout: 3000 });
    await evaluate("const el = document.querySelector('#text-input'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); return el.value");
    await press("Backspace");
    await press("Backspace");
    await press("Backspace");
    await waitForJsValue(
      "document.querySelector('#text-input').value",
      "t",
      "three rapid Backspaces delete three characters",
      "window.__fixtureState.keyEvents"
    );
  `;
}
