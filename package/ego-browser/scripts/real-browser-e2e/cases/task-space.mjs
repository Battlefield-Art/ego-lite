export function taskSpaceCase() {
  return `
    const task = await useOrCreateTaskSpace(taskName);
    assertEqual(task.name, taskName, "useOrCreateTaskSpace selects named task");

    const reusedTask = await useOrCreateTaskSpace(taskName);
    assertEqual(reusedTask.id, task.id, "useOrCreateTaskSpace reuses an existing named task");

    const spaces = await listTaskSpaces();
    assert(spaces.some((space) => space.name === taskName), "listTaskSpaces includes e2e task");
    const listed = spaces.find((space) => space.name === taskName);
    assertEqual(typeof listed.id, "number", "listTaskSpaces returns numeric ids");
    assertEqual(listed.taskId !== undefined, true, "listTaskSpaces returns taskId");
    assertEqual(typeof listed.ownership, "string", "listTaskSpaces returns ownership");

    const switched = await switchTaskSpace(task.id);
    assertEqual(switched.id, task.id, "switchTaskSpace selects by numeric id");
    const switchedByName = await switchTaskSpace(taskName);
    assertEqual(switchedByName.id, task.id, "switchTaskSpace selects by name");
    const switchedByNumericString = await switchTaskSpace(String(task.id));
    assertEqual(switchedByNumericString.id, task.id, "switchTaskSpace selects by numeric string id");

    await waitForAgentControl(taskName, { interval: 0.1, timeout: 3 });
    await takeOverTaskSpace(taskName);
    await waitForAgentControl(taskName, { interval: 0.1, timeout: 3 });

    const scratch = await newTaskSpace(taskName + " scratch");
    assertEqual(scratch.name, taskName + " scratch", "newTaskSpace creates a scratch space");
    const scratchByName = await switchTaskSpace(scratch.name);
    assertEqual(scratchByName.id, scratch.id, "newTaskSpace output can be selected by name");
    const closed = await completeTaskSpace(scratch.id, { keep: false });
    assertEqual(closed.done, true, "completeTaskSpace closes scratch task");

    await assertRejects(
      () => completeTaskSpace(scratch.id, { keep: false }),
      "task space not found",
      "completeTaskSpace reports already-closed task space"
    );

    await switchTaskSpace(taskName);
    await assertRejects(
      () => switchTaskSpace(taskName + " missing"),
      "task space not found",
      "switchTaskSpace reports missing task space"
    );
    await assertRejects(
      () => useOrCreateTaskSpace(99999999),
      "task space not found",
      "useOrCreateTaskSpace rejects missing numeric id"
    );
    await assertRejects(
      () => completeTaskSpace(taskName, {}),
      "requires { keep: boolean }",
      "completeTaskSpace validates keep option"
    );
    await assertRejects(
      () => completeTaskSpace("", { keep: false }),
      "requires a task space name or id",
      "completeTaskSpace validates empty task id"
    );
    await assertRejects(
      () => waitForAgentControl("", { timeout: 0.1 }),
      "requires a task space name or id",
      "waitForAgentControl validates task space id"
    );
    await assertRejects(
      () => takeOverTaskSpace(taskName + " missing"),
      "task space not found",
      "takeOverTaskSpace reports missing task space"
    );
    await assertRejects(
      () => claimTaskSpace(taskName + " missing"),
      "task space not found",
      "claimTaskSpace reports missing task space"
    );
    await assertRejects(
      () => handOffTaskSpace(taskName + " missing"),
      "task space not found",
      "handOffTaskSpace reports missing task space"
    );

    await handOffTaskSpace();
    await takeOverTaskSpace();
    await waitForAgentControl(taskName, { interval: 0.1, timeout: 5 });
    await handOffTaskSpace(taskName);
    await takeOverTaskSpace(taskName);
    await waitForAgentControl(taskName, { interval: 0.1, timeout: 5 });
  `;
}
