/*
 * Responsibility:
 * - week5 v3 runtime의 핵심 동작을 통합 수준에서 검증한다.
 */

import { createApp, h, useEffect, useMemo, useState } from "../index.js";
import { resolveComponentTree } from "../core/runtime/resolveComponentTree.js";

function runCase(name, fn) {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error.message };
  }
}

async function runAsyncCase(name, fn) {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error.message };
  }
}

export async function runRuntimeTests() {
  if (typeof document === "undefined") {
    return [{ name: "runtime tests", passed: true, skipped: true }];
  }

  const cases = [
    runCase("createApp mounts root state and stateless child components", () => {
      const root = document.createElement("div");
      let setCount = null;

      function CounterLabel(props) {
        return h("strong", null, props.label);
      }

      function App() {
        const [count, updateCount] = useState(0);
        setCount = updateCount;

        const doubled = useMemo(() => count * 2, [count]);

        return h("section", null,
          h(CounterLabel, { label: `count:${count}` }),
          h("span", null, ` doubled:${doubled}`)
        );
      }

      const app = createApp({ root, component: App });
      app.mount();

      if (root.textContent !== "count:0 doubled:0") {
        throw new Error("Expected initial mount output to match the root state.");
      }

      setCount(2);

      if (root.textContent !== "count:2 doubled:4") {
        throw new Error("Expected state updates to re-render the resolved child tree.");
      }
    }),
    runCase("stateless child components receive function props without losing them to DOM event extraction", () => {
      const root = document.createElement("div");

      function Child(props) {
        return h("button", { onClick: props.onPress }, props.label);
      }

      function App() {
        const [count, setCount] = useState(0);

        return h("section", null,
          h(Child, {
            label: `count:${count}`,
            onPress: () => setCount((previousValue) => previousValue + 1),
          })
        );
      }

      createApp({ root, component: App }).mount();

      const button = root.querySelector("button");
      button.dispatchEvent(new Event("click", { bubbles: true }));

      if (root.textContent !== "count:1") {
        throw new Error("Expected function props to reach stateless child components unchanged.");
      }
    }),
    runCase("updateProps replaces external props instead of merging them", () => {
      const root = document.createElement("div");

      function App(props) {
        return h("div", null, `${props.first ?? "missing"}|${props.second ?? "missing"}`);
      }

      const app = createApp({
        root,
        component: App,
        props: { first: "A", second: "B" },
      });

      app.mount();
      app.updateProps({ second: "C" });

      if (root.textContent !== "missing|C") {
        throw new Error("Expected updateProps to replace the props object.");
      }
    }),
    runCase("useEffect cleanup runs on update and unmount, setters become no-op after unmount", () => {
      const root = document.createElement("div");
      const lifecycle = [];
      let setValue = null;

      function App() {
        const [value, updateValue] = useState("A");
        setValue = updateValue;

        useEffect(() => {
          lifecycle.push(`effect:${value}`);
          return () => {
            lifecycle.push(`cleanup:${value}`);
          };
        }, [value]);

        return h("div", null, value);
      }

      const app = createApp({ root, component: App });
      app.mount();
      setValue("B");
      app.unmount();
      setValue("C");

      const joined = lifecycle.join(",");

      if (joined !== "effect:A,cleanup:A,effect:B,cleanup:B") {
        throw new Error(`Unexpected effect lifecycle: ${joined}`);
      }

      if (root.childNodes.length !== 0) {
        throw new Error("Expected unmount to clear the root DOM.");
      }
    }),
    runCase("form controls keep DOM properties and event-driven state in sync", () => {
      const root = document.createElement("div");

      function App() {
        const [text, setText] = useState("hello");
        const [done, setDone] = useState(false);

        return h("form", null,
          h("input", {
            value: text,
            onInput: (event) => setText(event.target.value),
          }),
          h("input", {
            type: "checkbox",
            checked: done,
            onChange: (event) => setDone(event.target.checked),
          }),
          h("p", null, `${text}|${done ? "done" : "pending"}`)
        );
      }

      createApp({ root, component: App }).mount();

      const [textInput, checkboxInput] = root.querySelectorAll("input");
      const summary = root.querySelector("p");

      if (textInput.value !== "hello") {
        throw new Error("Expected the text input value to reflect state.");
      }

      if (checkboxInput.checked !== false) {
        throw new Error("Expected the checkbox checked state to reflect state.");
      }

      textInput.value = "world";
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
      checkboxInput.checked = true;
      checkboxInput.dispatchEvent(new Event("change", { bubbles: true }));

      if (summary.textContent !== "world|done") {
        throw new Error("Expected form events to update root state.");
      }
    }),
    runCase("textarea and select keep value semantics in sync", () => {
      const root = document.createElement("div");

      function App() {
        const [note, setNote] = useState("memo");
        const [sort, setSort] = useState("name");

        return h("section", null,
          h("textarea", {
            value: note,
            onInput: (event) => setNote(event.target.value),
          }),
          h("select", {
            value: sort,
            onChange: (event) => setSort(event.target.value),
          },
            h("option", { value: "name" }, "Name"),
            h("option", { value: "date" }, "Date")
          ),
          h("p", null, `${note}|${sort}`)
        );
      }

      createApp({ root, component: App }).mount();

      const textarea = root.querySelector("textarea");
      const select = root.querySelector("select");
      const summary = root.querySelector("p");

      if (textarea.value !== "memo" || select.value !== "name") {
        throw new Error("Expected textarea/select initial values to reflect state.");
      }

      textarea.value = "updated";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      select.value = "date";
      select.dispatchEvent(new Event("change", { bubbles: true }));

      if (summary.textContent !== "updated|date") {
        throw new Error("Expected textarea/select events to update state.");
      }
    }),
    runCase("hooks outside a mounted component dispatcher are rejected", () => {
      let error = null;
      try { useState(0); } catch (caught) { error = caught; }
      if (!error) throw new Error("Hook call outside render was accepted.");
    }),
    runCase("hook count changes between renders throw an explicit error", () => {
      const root = document.createElement("div");

      function App(props) {
        useState(0);

        if (props.extra) {
          useMemo(() => 1, []);
        }

        return h("div", null, "ok");
      }

      const app = createApp({
        root,
        component: App,
        props: { extra: false },
      });

      app.mount();

      let errorMessage = "";

      try {
        app.updateProps({ extra: true });
      } catch (error) {
        errorMessage = error.message;
      }

      if (!errorMessage.includes("Hook count changed between renders")) {
        throw new Error("Expected hook count drift to throw an explicit error.");
      }
    }),
    runCase("createApp validates root and component inputs", () => {
      let rootError = "";
      let componentError = "";

      try {
        createApp({ root: null, component: () => h("div", null, "x") });
      } catch (error) {
        rootError = error.message;
      }

      try {
        createApp({ root: document.createElement("div"), component: null });
      } catch (error) {
        componentError = error.message;
      }

      if (!rootError.includes("valid root Element")) {
        throw new Error("Expected invalid root to throw an explicit error.");
      }

      if (!componentError.includes("root component function")) {
        throw new Error("Expected invalid component to throw an explicit error.");
      }
    }),
    runCase("createApp inspect exposes runtime and engine snapshots", () => {
      const root = document.createElement("div");

      function App() {
        const [count] = useState(1);
        return h("div", null, String(count));
      }

      const app = createApp({ root, component: App });
      app.mount();
      const snapshot = app.inspect();

      if (!Array.isArray(snapshot.hooks)) {
        throw new Error("Expected inspect to expose hook slots.");
      }

      if (snapshot.renderCount !== 1) {
        throw new Error("Expected inspect to expose render count.");
      }

      if (!snapshot.engine || snapshot.engine.currentVNode !== snapshot.currentVNode) {
        throw new Error("Expected inspect to expose engine snapshot.");
      }
    }),
    runCase("a component instance cannot be mounted again after unmount", () => {
      const root = document.createElement("div");

      function App() {
        return h("div", null, "once");
      }

      const app = createApp({ root, component: App });
      app.mount();
      app.unmount();

      let errorMessage = "";

      try {
        app.mount();
      } catch (error) {
        errorMessage = error.message;
      }

      if (!errorMessage.includes("cannot be mounted again")) {
        throw new Error("Expected remount after unmount to be rejected.");
      }
    }),
    runCase("useEffect without deps runs on every update and empty deps run once", () => {
      const root = document.createElement("div");
      const lifecycle = [];
      let setCount = null;

      function App() {
        const [count, updateCount] = useState(0);
        setCount = updateCount;

        useEffect(() => {
          lifecycle.push(`always:${count}`);
        });

        useEffect(() => {
          lifecycle.push(`once:${count}`);
        }, []);

        return h("div", null, String(count));
      }

      createApp({ root, component: App }).mount();
      setCount(1);
      setCount(2);

      const joined = lifecycle.join(",");

      if (joined !== "always:0,once:0,always:1,always:2") {
        throw new Error(`Unexpected effect dependency behavior: ${joined}`);
      }
    }),
    runCase("click, submit, focus and blur events are wired through the renderer", () => {
      const root = document.createElement("div");

      function App() {
        const [count, setCount] = useState(0);
        const [focused, setFocused] = useState(false);

        return h("section", null,
          h("form", {
            onSubmit: (event) => {
              event.preventDefault();
              setCount((prev) => prev + 1);
            },
          },
            h("input", {
              value: focused ? "focused" : "blurred",
              onFocus: () => setFocused(true),
              onBlur: () => setFocused(false),
            }),
            h("button", {
              onClick: () => setCount((prev) => prev + 1),
            }, "plus")
          ),
          h("p", null, `${count}|${focused ? "focus" : "blur"}`)
        );
      }

      createApp({ root, component: App }).mount();

      const input = root.querySelector("input");
      const button = root.querySelector("button");
      const form = root.querySelector("form");
      const summary = root.querySelector("p");

      input.dispatchEvent(new Event("focus", { bubbles: true }));
      button.dispatchEvent(new Event("click", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));

      if (summary.textContent !== "2|blur") {
        throw new Error("Expected click/submit/focus/blur events to update state.");
      }
    }),
    runCase("keydown events are wired through the renderer", () => {
      const root = document.createElement("div");

      function App() {
        const [count, setCount] = useState(0);

        return h("section", null,
          h("input", {
            value: String(count),
            onKeydown: () => setCount((prev) => prev + 1),
          }),
          h("p", null, String(count))
        );
      }

      createApp({ root, component: App }).mount();

      const input = root.querySelector("input");
      const summary = root.querySelector("p");
      input.dispatchEvent(new Event("keydown", { bubbles: true }));
      input.dispatchEvent(new Event("keydown", { bubbles: true }));

      if (summary.textContent !== "2") {
        throw new Error("Expected keydown events to update state.");
      }
    }),
    runCase("multiple effects keep cleanup and commit order stable", () => {
      const root = document.createElement("div");
      const lifecycle = [];
      let setStep = null;

      function App() {
        const [step, updateStep] = useState(0);
        setStep = updateStep;

        useEffect(() => {
          lifecycle.push(`effect:A:${step}`);
          return () => {
            lifecycle.push(`cleanup:A:${step}`);
          };
        }, [step]);

        useEffect(() => {
          lifecycle.push(`effect:B:${step}`);
          return () => {
            lifecycle.push(`cleanup:B:${step}`);
          };
        }, [step]);

        return h("div", null, String(step));
      }

      const app = createApp({ root, component: App });
      app.mount();
      setStep(1);
      app.unmount();

      const joined = lifecycle.join(",");

      if (
        joined !==
        "effect:A:0,effect:B:0,cleanup:A:0,effect:A:1,cleanup:B:0,effect:B:1,cleanup:A:1,cleanup:B:1"
      ) {
        throw new Error(`Unexpected multiple effect ordering: ${joined}`);
      }
    }),
    runCase("keyed list reorder updates DOM order", () => {
      const root = document.createElement("div");

      function App(props) {
        return h("ul", null,
          ...props.items.map((item) => h("li", { key: item.id }, item.label))
        );
      }

      const app = createApp({
        root,
        component: App,
        props: {
          items: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
            { id: "c", label: "C" },
          ],
        },
      });

      app.mount();
      app.updateProps({
        items: [
          { id: "c", label: "C" },
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      });

      const labels = root.querySelectorAll("li").map((node) => node.textContent).join(",");

      if (labels !== "C,A,B") {
        throw new Error(`Expected keyed reorder to update DOM order, received ${labels}.`);
      }
    }),
    runCase("stateless child component keys survive resolution so keyed diff can stay stable", () => {
      function TypeTile(props) {
        return h("article", null, props.label);
      }

      const resolved = resolveComponentTree(
        h(TypeTile, {
          key: "card-203",
          label: "Girafarig",
        })
      );

      if (resolved.key !== "card-203") {
        throw new Error(`Expected resolved stateless child vnode to keep its key, received ${resolved.key}.`);
      }
    }),
  ];

  cases.push(
    await runAsyncCase("microtask batching coalesces multiple state updates", async () => {
      const root = document.createElement("div");
      let setCount = null;
      let renderCount = 0;

      function App() {
        renderCount += 1;
        const [count, updateCount] = useState(0);
        setCount = updateCount;
        return h("div", null, String(count));
      }

      const app = createApp({
        root,
        component: App,
        batching: "microtask",
      });

      app.mount();
      setCount(1);
      setCount(2);
      await Promise.resolve();

      if (root.textContent !== "2") {
        throw new Error("Expected the microtask batch to flush the latest state.");
      }

      if (renderCount !== 2) {
        throw new Error(`Expected one batched re-render, received ${renderCount}.`);
      }
    }),
    await runAsyncCase("unmount cancels a pending microtask update", async () => {
      const root = document.createElement("div");
      let setCount = null;

      function App() {
        const [count, updateCount] = useState(0);
        setCount = updateCount;
        return h("div", null, String(count));
      }

      const app = createApp({
        root,
        component: App,
        batching: "microtask",
      });

      app.mount();
      setCount(1);
      app.unmount();
      await Promise.resolve();

      if (root.childNodes.length !== 0) {
        throw new Error("Expected unmount to clear the root even with a queued update.");
      }
    })
  );

  return cases;
}
