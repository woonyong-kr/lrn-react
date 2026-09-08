/*
 * Responsibility:
 * - Hook이 등록된 컴포넌트의 렌더 본문에서 사용되는지 확인한다.
 */

import { areHooksAllowed } from "./currentDispatcher.js";

export function assertRootOnlyHookUsage() {
  // 독립적으로 호출한 resolver 등 Hook 저장소가 없는 구간에서는 사용을 금지한다.
  if (!areHooksAllowed()) {
    throw new Error("Hooks are only supported in the root component render.");
  }
}
