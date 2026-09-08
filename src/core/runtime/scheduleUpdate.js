/*
 * Responsibility:
 * - 루트 컴포넌트의 update 실행 시점을 제어한다.
 * - sync / microtask batching 전략을 모두 지원한다.
 *
 * Easy explanation:
 * - setState가 호출됐다고 항상 즉시 다시 그릴 필요는 없다.
 * - 여러 setState를 한 번의 렌더로 합칠 수도 있고, 바로 처리할 수도 있다.
 * - 이 파일은 "언제 update를 실제로 실행할지"를 결정한다.
 */

function flushScheduledUpdate(component, token) {
  // microtask가 실제로 실행됐을 때,
  // 내가 최신 예약 건이 아니면 오래된 콜백이므로 버린다.
  if (component.scheduledUpdate !== token) {
    return;
  }

  if (token.cancelled || !component.isMounted) {
    component.scheduledUpdate = null;
    return;
  }

  component.scheduledUpdate = null;
  // 여기서부터 실제 update 사이클이 시작된다:
  // performRender -> diff -> patch -> commitEffects
  component.update();
}

export function scheduleUpdate(component) {
  component = component.rootOwner ?? component;
  if (component.isRendering)
    throw new Error("State updates during render are unsupported.");
  if (!component.isMounted) {
    return;
  }

  if (component.batching === "microtask" || component.isCommitting) {
    // [업데이트 4-2] microtask 모드에서는 지금 즉시 update하지 않고 예약만 걸 수 있다.
    // 이미 예약이 있으면 같은 동기 구간의 여러 setState를 한 번의 update로 묶는다.
    if (component.scheduledUpdate && !component.scheduledUpdate.cancelled) {
      return;
    }

    // token은 "이번 예약 건의 신분증"이다.
    // queueMicrotask 콜백도 이 객체를 클로저로 기억하므로,
    // 나중에 실행될 때 지금 최신 예약 건이 맞는지 식별할 수 있다.
    const token = { cancelled: false };
    component.scheduledUpdate = token;

    queueMicrotask(() => {
      flushScheduledUpdate(component, token);
    });

    return;
  }

  // [업데이트 4-3] sync 모드에서는 setter가 호출된 바로 그 흐름에서 update를 즉시 실행한다.
  component.update();
}

export function cancelScheduledUpdate(component) {
  if (!component.scheduledUpdate) {
    return;
  }

  component.scheduledUpdate.cancelled = true;
  component.scheduledUpdate = null;
}
