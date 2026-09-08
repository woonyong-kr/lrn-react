import { createApp, h, useState, useEffect, useMemo } from "../index.js";
function check(condition, message) {
  if (!condition) throw Error(message);
}
export async function runComponentStateTests() {
  const results = [];
  async function run(name, test) {
    try {
      await test();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
    }
  }
  await run(
    "keyed child state and DOM identity survive reorder, removed effects clean up",
    () => {
      const root = document.createElement("div"),
        setters = {},
        events = [];
      let reorder;
      function Child({ id }) {
        const [value, set] = useState(0);
        setters[id] = set;
        const doubled = useMemo(() => value * 2, [value]);
        useEffect(() => {
          events.push("mount:" + id);
          return () => events.push("clean:" + id);
        }, []);
        return h("button", { "data-id": id }, `${id}:${doubled}`);
      }
      function App() {
        const [ids, set] = useState(["a", "b"]);
        reorder = set;
        return h(
          "section",
          null,
          ids.map((id) => h(Child, { key: id, id })),
        );
      }
      const app = createApp({ root, component: App });
      app.mount();
      const a = root.querySelector('[data-id="a"]');
      setters.a(2);
      check(root.textContent === "a:4b:0", "child state leaked");
      reorder(["b", "a"]);
      check(root.textContent === "b:0a:4", "state did not follow key");
      check(root.querySelector('[data-id="a"]') === a, "keyed DOM recreated");
      reorder(["a"]);
      check(
        events.join(",") === "mount:a,mount:b,clean:b",
        "removed child effect not cleaned",
      );
      const removed = setters.b;
      removed(9);
      check(root.textContent === "a:4", "removed setter changed app");
      app.unmount();
      check(
        events.join(",") === "mount:a,mount:b,clean:b,clean:a",
        "unmount cleanup incorrect",
      );
    },
  );
  await run(
    "same child function has independent state under different parents",
    () => {
      const root = document.createElement("div"),
        setters = {};
      function Child({ id }) {
        const [n, set] = useState(0);
        setters[id] = set;
        return h("span", null, `${id}:${n}`);
      }
      function App() {
        return h(
          "main",
          null,
          h("div", null, h(Child, { key: "same", id: "left" })),
          h("div", null, h(Child, { key: "same", id: "right" })),
        );
      }
      const app = createApp({ root, component: App });
      app.mount();
      setters.left(3);
      check(root.textContent === "left:3right:0", "parent boundary missing");
      app.unmount();
    },
  );
  await run(
    "child microtask updates batch once and effect sees committed DOM",
    async () => {
      const root = document.createElement("div");
      let set;
      const seen = [];
      function Child() {
        const [n, s] = useState(0);
        set = s;
        useEffect(() => {
          seen.push(root.textContent);
        }, [n]);
        return h("span", null, n);
      }
      const app = createApp({
        root,
        component: () => h(Child),
        batching: "microtask",
      });
      app.mount();
      set((n) => n + 1);
      set((n) => n + 1);
      await Promise.resolve();
      check(root.textContent === "2", "batch lost update");
      check(app.inspect().renderCount === 2, "child batching failed");
      check(seen.join(",") === "0,2", "effect before DOM commit");
      app.unmount();
    },
  );
  await run("changing component type resets state at same key", () => {
    const root = document.createElement("div");
    let flip, set;
    function A() {
      const [v, s] = useState("A");
      set = s;
      return h("p", null, v);
    }
    function B() {
      const [v] = useState("B");
      return h("p", null, v);
    }
    function App() {
      const [b, s] = useState(false);
      flip = s;
      return h("section", null, h(b ? B : A, { key: "same" }));
    }
    const app = createApp({ root, component: App });
    app.mount();
    set("changed");
    flip(true);
    check(root.textContent === "B", "component type retained foreign hooks");
    app.unmount();
  });
  await run("removing multiple unkeyed siblings removes DOM and cleans every effect", () => {
    const root = document.createElement("div");
    const cleaned = [];
    let resize;
    function Child({ id }) {
      useEffect(() => () => cleaned.push(id), []);
      return h("span", null, id);
    }
    function App() {
      const [count, set] = useState(3);
      resize = set;
      return h("section", null, Array.from({length: count}, (_, id) => h(Child, {id})));
    }
    const app = createApp({root, component: App});
    app.mount();
    resize(1);
    check(root.textContent === "0", "removed unkeyed DOM was left behind");
    check(cleaned.sort().join(",") === "1,2", "removed effects not cleaned");
    resize(0);
    check(root.textContent === "", "last child remained");
    app.unmount();
    check(cleaned.sort().join(",") === "0,1,2", "cleanup duplicated or missed");
  });
  return results;
}
