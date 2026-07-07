import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveElementCenter,
  ElementResolutionError,
} from "../dist/src/element-resolver.js";
import { RefMap } from "../dist/src/ref-map.js";

class FakeCDP {
  constructor(handler) {
    this.calls = [];
    this.handler = handler;
  }

  async sendRaw(method, params = {}, sessionId = undefined) {
    this.calls.push([method, params, sessionId]);
    return this.handler(method, params, sessionId);
  }
}

const AX_TREE = {
  nodes: [
    { role: { value: "button" }, name: { value: "ok" }, backendDOMNodeId: 100 },
  ],
};

test("resolveElementCenter computes the center from a valid box model", async () => {
  const refMap = new RefMap();
  refMap.add("5", 100, "button", "ok");
  const cdp = new FakeCDP(async (method) => {
    if (method === "DOM.getBoxModel") {
      return { model: { content: [10, 20, 30, 20, 30, 60, 10, 60] } };
    }
    return {};
  });
  const point = await resolveElementCenter(cdp, undefined, refMap, "@5");
  assert.equal(point.x, 20);
  assert.equal(point.y, 40);
});

test("degenerate box model throws transient instead of returning (0,0)", async () => {
  // Regression: boxModelCenter used to return {x:0,y:0} for a missing content
  // quad, which made callers click the top-left viewport corner.
  const refMap = new RefMap();
  refMap.add("5", 100, "button", "ok");
  const cdp = new FakeCDP(async (method) => {
    if (method === "DOM.getBoxModel") {
      return { model: { content: [] } };
    }
    if (method === "Accessibility.getFullAXTree") {
      return AX_TREE;
    }
    return {};
  });
  await assert.rejects(
    () => resolveElementCenter(cdp, undefined, refMap, "@5"),
    (error) => {
      assert.ok(error instanceof ElementResolutionError);
      assert.equal(error.kind, "transient");
      assert.match(error.message, /no box model/);
      return true;
    },
  );
  assert.ok(
    !cdp.calls.some(([method]) => method === "Accessibility.getFullAXTree"),
    "must not fall back to role/name lookup — it could match a different node with the same label",
  );
});

test("stale backend node still falls back to role/name lookup", async () => {
  const refMap = new RefMap();
  refMap.add("5", 100, "button", "ok");
  let boxModelCalls = 0;
  const cdp = new FakeCDP(async (method) => {
    if (method === "DOM.getBoxModel") {
      boxModelCalls += 1;
      if (boxModelCalls === 1) {
        throw new Error("No node with given id found");
      }
      return { model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } };
    }
    if (method === "Accessibility.getFullAXTree") {
      return AX_TREE;
    }
    return {};
  });
  const point = await resolveElementCenter(cdp, undefined, refMap, "@5");
  assert.equal(point.x, 5);
  assert.equal(point.y, 5);
  assert.ok(
    cdp.calls.some(([method]) => method === "Accessibility.getFullAXTree"),
    "a stale node must trigger the role/name fallback",
  );
});

test("role locator with degenerate box model throws transient", async () => {
  const cdp = new FakeCDP(async (method) => {
    if (method === "Accessibility.getFullAXTree") {
      return AX_TREE;
    }
    if (method === "DOM.getBoxModel") {
      return { model: {} };
    }
    return {};
  });
  await assert.rejects(
    () =>
      resolveElementCenter(
        cdp,
        undefined,
        new RefMap(),
        'loc=role:button[name="ok"]',
      ),
    (error) => {
      assert.ok(error instanceof ElementResolutionError);
      assert.equal(error.kind, "transient");
      return true;
    },
  );
});

test("css locator matched 0 elements is transient", async () => {
  const cdp = new FakeCDP(async (method) => {
    if (method === "Runtime.evaluate") {
      return {
        result: {
          value: { error: "Locator css:.missing matched 0 elements" },
        },
      };
    }
    return {};
  });
  await assert.rejects(
    () =>
      resolveElementCenter(cdp, undefined, new RefMap(), "loc=css:.missing"),
    (error) => {
      assert.ok(error instanceof ElementResolutionError);
      assert.equal(error.kind, "transient");
      return true;
    },
  );
});

test("css locator matched multiple elements is permanent", async () => {
  const cdp = new FakeCDP(async (method) => {
    if (method === "Runtime.evaluate") {
      return {
        result: {
          value: { error: "Locator css:.duplicate matched 2 elements" },
        },
      };
    }
    return {};
  });
  await assert.rejects(
    () =>
      resolveElementCenter(cdp, undefined, new RefMap(), "loc=css:.duplicate"),
    (error) => {
      assert.ok(error instanceof ElementResolutionError);
      assert.equal(error.kind, "permanent");
      return true;
    },
  );
});

test("role locator matches numeric AX names", async () => {
  const cdp = new FakeCDP(async (method) => {
    if (method === "Accessibility.getFullAXTree") {
      return {
        nodes: [
          {
            role: { value: "button" },
            name: { value: 7 },
            backendDOMNodeId: 100,
          },
        ],
      };
    }
    if (method === "DOM.getBoxModel") {
      return { model: { content: [10, 20, 30, 20, 30, 60, 10, 60] } };
    }
    return {};
  });
  const point = await resolveElementCenter(
    cdp,
    undefined,
    new RefMap(),
    "loc=role:button[name=7]",
  );
  assert.deepEqual(point, { x: 20, y: 40, sessionId: undefined });
});

test("role locator matches boolean AX names", async () => {
  const cdp = new FakeCDP(async (method) => {
    if (method === "Accessibility.getFullAXTree") {
      return {
        nodes: [
          {
            role: { value: "button" },
            name: { value: true },
            backendDOMNodeId: 100,
          },
        ],
      };
    }
    if (method === "DOM.getBoxModel") {
      return { model: { content: [10, 20, 30, 20, 30, 60, 10, 60] } };
    }
    return {};
  });
  const point = await resolveElementCenter(
    cdp,
    undefined,
    new RefMap(),
    "loc=role:button[name=true]",
  );
  assert.deepEqual(point, { x: 20, y: 40, sessionId: undefined });
});
