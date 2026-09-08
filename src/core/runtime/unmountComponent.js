import { disposeComponent } from "./resolveComponentTree.js";
/*
 * Responsibility:
 * - 루트 컴포넌트 종료 시 예약 작업과 effect cleanup, DOM 정리를 수행한다.
 *
 * Easy explanation:
 * - 화면에서 App이 사라질 때는 DOM만 지우면 끝이 아니다.
 * - 예약된 update를 취소하고, 이미 실행된 effect를 정리하고, 내부 참조도 끊어야 한다.
 * - 이 파일이 그 종료 절차 전체를 맡는다.
 */

import { cancelScheduledUpdate } from "./scheduleUpdate.js";
import {
  clearCurrentComponent,
  getCurrentComponent,
} from "./currentDispatcher.js";

function clearRootElement(rootElement) {
  if (!rootElement) {
    return;
  }

  while (rootElement.firstChild) {
    rootElement.removeChild(rootElement.firstChild);
  }
}

export function unmountComponent(component) {
  component.isMounted = false;
  cancelScheduledUpdate(component);
  for (const record of component.components?.values() ?? [])
    disposeComponent(record);
  component.components?.clear();
  component.nextComponents?.clear();
  component.pendingEffects = [];

  for (const slot of component.hooks) {
    if (slot?.kind === "effect" && typeof slot.cleanup === "function") {
      slot.cleanup();
      slot.cleanup = null;
    }
  }

  clearRootElement(component.rootElement);

  if (getCurrentComponent() === component) {
    clearCurrentComponent();
  }

  component.isMounted = false;
  component.currentVNode = null;
  component.rootElement = null;
  component.engine = null;
}
