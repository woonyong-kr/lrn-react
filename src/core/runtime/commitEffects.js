/*
 * Responsibility:
 * - 렌더 단계에서 수집된 effect를 DOM 반영 이후 commit 한다.
 *
 * Easy explanation:
 * - useEffect는 렌더 도중 바로 실행되면 안 된다.
 * - 먼저 화면이 바뀌고, 그 뒤에 부수 효과를 실행해야 한다.
 * - 이 파일은 그 후반 작업만 담당한다.
 */

function resolveCleanup(result) {
  return typeof result === "function" ? result : null;
}

export function commitEffects(component) {
  // [커밋 1] render 중 useEffect가 모아 둔 "실행 대기 effect 인덱스"를 꺼낸다.
  // render 중 useEffect가 모아 둔 인덱스 목록을 복사해 안전하게 소비한다.
  const pendingIndexes = component.pendingEffects.slice();
  component.pendingEffects = [];

  for (const hookIndex of pendingIndexes) {
    const slot = component.hooks[hookIndex];

    if (!slot || slot.kind !== "effect") {
      continue;
    }

    if (typeof slot.cleanup === "function") {
      // [커밋 2] 이전 렌더의 effect가 등록한 cleanup이 있으면 먼저 실행한다.
      // 이전 effect가 남긴 정리 함수(cleanup)가 있으면 먼저 실행한다.
      slot.cleanup();
    }

    // [커밋 3] 이제 실제 effect 본문을 실행한다.
    // DOM patch가 끝난 뒤에야 effect 본문을 실행한다.
    slot.deps = slot.nextDeps;
    const nextCleanup = slot.create();
    slot.cleanup = resolveCleanup(nextCleanup);
    // [커밋 4] effect가 사용한 deps를 현재 기준값으로 확정한다.
    // 이번에 실행한 deps를 "이제 화면에 반영된 기준 deps"로 확정한다.
    slot.deps = slot.nextDeps;
  }
}
