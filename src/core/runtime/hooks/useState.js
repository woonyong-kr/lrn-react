/*
 * Responsibility:
 * - 컴포넌트별 state Hook을 제공한다.
 *
 * Easy explanation:
 * - useState는 변수처럼 보이지만, 실제로는 hooks 배열 안의 상태 슬롯을 읽고 쓰는 함수다.
 * - 같은 위치에서 다시 호출되면 같은 슬롯을 재사용하기 때문에 상태가 유지된다.
 */

import {isFunction} from '../../shared/utils.js';
import {assertActiveDispatcher} from '../assertActiveDispatcher.js';
import {assertRootOnlyHookUsage} from '../assertRootOnlyHookUsage.js';
import {scheduleUpdate} from '../scheduleUpdate.js';

function resolveInitialState(initialState) {
  // useState(() => expensiveInit()) 형태도 지원하기 위해
  // 함수면 한 번 실행해서 초기값을 꺼내고, 아니면 그대로 쓴다.
  return isFunction(initialState) ? initialState() : initialState;
}

export function useState(initialState) {
  const component = assertActiveDispatcher();
  assertRootOnlyHookUsage();

  // hookCursor는 "이번 렌더에서 지금 몇 번째 Hook 차례인지"를 뜻한다.
  // 즉 첫 useState는 0번 슬롯, 두 번째 Hook은 1번 슬롯을 사용한다.
  const hookIndex = component.hookCursor;

  if (
    component.expectedHookCount !== null &&
    hookIndex >= component.expectedHookCount
  ) {
    throw new Error('Hook count changed between renders.');
  }

  let slot = component.hooks[hookIndex];

  if (!slot) {
    // 첫 렌더에서만 slot 객체를 만든다.
    // 이후 렌더에서는 이 같은 slot을 재사용하기 때문에 상태가 유지된다.
    slot = {
      kind: 'state',
      value: resolveInitialState(initialState),
      setter: null,
    };

    slot.setter = (nextState) => {
      // [업데이트 3] 이벤트 핸들러에서 setState가 호출되면 실제로 들어오는 곳이 바로 이 setter다.
      // 이 함수는 클로저로 slot/component를 기억하고 있어서 자신의 상태 칸을 정확히 수정할 수 있다.
      // setter는 렌더 밖에서 나중에 호출되는 함수다.
      // 하지만 이 함수는 클로저로 slot과 component를 기억하고 있어서
      // 호출 시점에 정확히 자기 상태 칸(slot.value)을 찾아가 수정할 수 있다.
      if (!component.isMounted) {
        return;
      }

      const previousValue = slot.value;
      const resolvedValue = isFunction(nextState)
        ? nextState(previousValue)
        : nextState;

      if (Object.is(previousValue, resolvedValue)) {
        return;
      }

      // [업데이트 4] 여기서 실제 상태 원본(slot.value)이 바뀐다.
      // cards, currentPage 같은 변수는 각 렌더의 읽기 전용 스냅샷이고,
      // 진짜 저장소는 hooks 배열 안의 slot.value다.
      slot.value = resolvedValue;
      // [업데이트 4-1] 값이 바뀌면 곧바로 DOM을 바꾸지 않고,
      // scheduleUpdate가 sync 또는 microtask 전략에 따라 update 시점을 결정한다.
      scheduleUpdate(component);
    };

    component.hooks[hookIndex] = slot;
  }

  if (slot.kind !== 'state') {
    throw new Error(
      `Hook order mismatch at slot ${hookIndex}. Expected useState.`,
    );
  }

  // 다음 Hook이 다음 슬롯을 읽을 수 있게 cursor를 한 칸 넘긴다.
  component.hookCursor += 1;

  // 현재 렌더는 slot.value를 읽고, 나중의 이벤트는 slot.setter를 호출한다.
  return [slot.value, slot.setter];
}
