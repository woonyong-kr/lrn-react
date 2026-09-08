globalThis.__CARD_SHOWCASE_DATA_MODE__ = new URLSearchParams(location.search).get('data') === 'remote' ? 'remote' : 'local';
/*
 * Responsibility:
 * - Bootstraps the browser demo app.
 * - Wires the runtime inspector panel to the mounted app instance.
 */

import { createApp } from "../index.js";
import { App } from "./App.js";

function createRuntimeBridge() {
  let snapshot = {
    reason: "bootstrap",
    renderCount: 0,
    patchCount: 0,
    lastRenderPatchCount: 0,
    totalPatchCount: 0,
    rawLastRenderPatchCount: 0,
    rawTotalPatchCount: 0,
    patchLabels: [],
    diffMode: "auto",
    isMounted: false,
  };
  const listeners = new Set();

  return {
    getSnapshot() {
      return snapshot;
    },

    publish(nextSnapshot) {
      snapshot = nextSnapshot;

      for (const listener of listeners) {
        listener(snapshot);
      }
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function renderInspectorPatchRows(root, patchLabels) {
  const list = root.querySelector("#runtime-inspector-patches");
  const inspector = root.querySelector("#runtime-inspector");
  const emptyLabel = inspector?.getAttribute("data-empty-patch-label") || "No DOM patch was needed for the last render.";

  if (!list) {
    return;
  }

  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  if (!patchLabels || patchLabels.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "inspector-patch-row is-empty";
    emptyItem.textContent = emptyLabel;
    list.appendChild(emptyItem);
    return;
  }

  for (const label of patchLabels.slice(0, 6)) {
    const item = document.createElement("li");
    item.className = "inspector-patch-row";
    item.textContent = label;
    list.appendChild(item);
  }
}

function syncRuntimeInspector(root, snapshot) {
  // syncRuntimeInspector는 런타임 스냅샷 객체를 실제 Inspector DOM에 반영한다.
  // 즉 createApp/App/runtimeBridge가 계산한 숫자와 patch 요약을
  // 오른쪽 패널의 텍스트와 리스트 UI로 옮기는 마지막 연결 지점이다.
  const renderCount = root.querySelector("#inspector-render-count .inspector-stat-value");
  const lastPatchCount = root.querySelector("#inspector-last-patch-count .inspector-stat-value");
  const totalPatchCount = root.querySelector("#inspector-total-patch-count .inspector-stat-value");
  const meta = root.querySelector("#inspector-runtime-meta");

  if (renderCount) {
    renderCount.textContent = String(snapshot.renderCount ?? 0);
  }

  if (lastPatchCount) {
    lastPatchCount.textContent = String(snapshot.lastRenderPatchCount ?? snapshot.patchCount ?? 0);
  }

  if (totalPatchCount) {
    totalPatchCount.textContent = String(snapshot.totalPatchCount ?? 0);
  }

  if (meta) {
    meta.textContent = `Reason: ${snapshot.reason ?? "bootstrap"} · Diff: ${snapshot.diffMode ?? "auto"}`;
  }

  renderInspectorPatchRows(root, snapshot.patchLabels ?? []);
}

function buildInspectorSnapshot(app, runtimeBridge) {
  // 우선 runtimeBridge가 publish한 최신 스냅샷을 믿고,
  // 아직 bridge 값이 비어 있으면 app.inspect()를 읽어 초기 표시값을 만든다.
  const bridgeSnapshot = runtimeBridge.getSnapshot();

  if (
    bridgeSnapshot.renderCount > 0
    || bridgeSnapshot.lastRenderPatchCount > 0
    || bridgeSnapshot.totalPatchCount > 0
    || bridgeSnapshot.patchCount > 0
  ) {
    return bridgeSnapshot;
  }

  const inspection = app.inspect();
  const component = app.getComponent();

  return {
    reason: component.isMounted ? "mount" : "bootstrap",
    renderCount: inspection.renderCount ?? 0,
    patchCount: inspection.engine?.lastRenderPatchCount ?? inspection.lastPatches?.length ?? 0,
    lastRenderPatchCount: inspection.engine?.lastRenderPatchCount ?? inspection.lastPatches?.length ?? 0,
    totalPatchCount: inspection.engine?.totalPatchCount ?? inspection.totalPatchCount ?? 0,
    rawLastRenderPatchCount: inspection.engine?.rawLastRenderPatchCount ?? inspection.lastPatches?.length ?? 0,
    rawTotalPatchCount: inspection.engine?.rawTotalPatchCount ?? inspection.rawTotalPatchCount ?? 0,
    patchLabels: inspection.engine?.patchLabels ?? [],
    diffMode: component.diffMode ?? "auto",
    isMounted: component.isMounted ?? false,
  };
}

function bindRuntimeInspector(root, runtimeBridge) {
  return runtimeBridge.subscribe((snapshot) => {
    syncRuntimeInspector(root, snapshot);
  });
}

function mountApp() {
  // The documented browser contract requires a single #app root.
  const root = document.getElementById("app");

  if (!root) {
    throw new Error('Expected "#app" root element for the card collection showcase app.');
  }

  const runtimeBridge = createRuntimeBridge();
  bindRuntimeInspector(root, runtimeBridge);

  const app = createApp({
    root,
    component: App,
    props: { runtimeBridge },
    // 같은 동기 구간의 여러 setState를 하나의 update tick으로 묶기 위해
    // microtask batching을 기본으로 사용한다.
    batching: "microtask",
  });

  app.mount();
  syncRuntimeInspector(root, buildInspectorSnapshot(app, runtimeBridge));
}

if (document.readyState === "interactive" || document.readyState === "complete") {
  mountApp();
} else {
  document.addEventListener("DOMContentLoaded", mountApp, { once: true });
}
