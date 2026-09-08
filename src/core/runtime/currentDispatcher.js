/*
 * Responsibility:
 * - 현재 렌더 중인 컴포넌트와 Hook 호출 허용 상태를 추적한다.
 * - 루트 렌더와 자식 resolver 사이에서 Hook 사용 가능 여부를 제어한다.
 *
 * Easy explanation:
 * - Hook은 아무 곳에서나 호출되면 안 된다.
 * - 지금 "루트 App 렌더 중인지", 아니면 "자식 컴포넌트 전개 중인지"를 기록하는 전역 상태가 필요하다.
 * - 이 파일이 그 역할을 한다.
 */

const dispatcherState = {
  component: null,
  allowHooks: false,
};

export function setCurrentComponent(component, options = {}) {
  // Hook 함수들은 인자로 component를 직접 받지 않으므로,
  // "지금은 어느 루트의 hooks 배열을 써야 하는가?"를 전역 dispatcher에 기록해 둔다.
  dispatcherState.component = component;
  dispatcherState.allowHooks = options.allowHooks ?? true;
}

export function getCurrentComponent() {
  return dispatcherState.component;
}

export function areHooksAllowed() {
  return dispatcherState.allowHooks;
}

export function clearCurrentComponent() {
  // 렌더가 끝난 뒤에도 이전 루트가 남아 있으면
  // 이벤트 핸들러 등 렌더 바깥 코드가 잘못 Hook을 호출했을 때 구분할 수 없어진다.
  dispatcherState.component = null;
  dispatcherState.allowHooks = false;
}

export function runWithHooksAllowed(callback) {
  const previous = { ...dispatcherState };
  dispatcherState.allowHooks = true;

  try {
    return callback();
  } finally {
    dispatcherState.component = previous.component;
    dispatcherState.allowHooks = previous.allowHooks;
  }
}

export function runWithHooksDisabled(callback) {
  const previous = { ...dispatcherState };
  // 자식 함수형 컴포넌트는 "렌더 함수 해석기"처럼만 쓰고,
  // 루트처럼 독립 Hook 상태를 갖지는 않으므로 이 구간에서는 Hook 호출을 금지한다.
  dispatcherState.allowHooks = false;

  try {
    return callback();
  } finally {
    dispatcherState.component = previous.component;
    dispatcherState.allowHooks = previous.allowHooks;
  }
}

export function withComponent(component, callback) {
  const previous = { ...dispatcherState };
  setCurrentComponent(component, { allowHooks: true });
  try {
    return callback();
  } finally {
    Object.assign(dispatcherState, previous);
  }
}
