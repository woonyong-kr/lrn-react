/*
 * Responsibility:
 * - 자식 노드 배열의 차이를 계산한다.
 * - auto/index/keyed 모드에 따라 child 매칭 전략을 분기한다.
 *
 * Relationships:
 * - diff.js가 노드 단위 비교 후 children 세부 계산을 위임한다.
 */

import { DIFF_MODES, PATCH_TYPES } from "../shared/constants.js";
import { getNodeIdentity } from "../vnode/index.js";

function appendIndexPatch(patches, indexPatch) {
  if (indexPatch && indexPatch.length > 0) {
    patches.push(...indexPatch);
  }
}

function createInsertPatch(parentPath, index, node) {
  return {
    type: PATCH_TYPES.INSERT_CHILD,
    path: parentPath,
    index,
    node,
  };
}

function createRemovePatch(parentPath, index) {
  return {
    type: PATCH_TYPES.REMOVE_CHILD,
    path: parentPath,
    index,
  };
}

function createMovePatch(parentPath, fromIndex, toIndex, key) {
  return {
    type: PATCH_TYPES.MOVE_CHILD,
    path: parentPath,
    fromIndex,
    toIndex,
    key,
  };
}

function diffChildrenByIndex(oldChildren, newChildren, parentPath, walk) {
  const patches = [];
  const maxLength = Math.max(oldChildren.length, newChildren.length);

  for (let index = 0; index < maxLength; index += 1) {
    // index 모드는 "같은 위치의 child끼리 비교"하는 가장 단순한 전략이다.
    const oldChild = oldChildren[index];
    const newChild = newChildren[index];
    const childPath = [...parentPath, index];

    if (!oldChild && newChild) {
      patches.push(createInsertPatch(parentPath, index, newChild));
      continue;
    }

    if (oldChild && !newChild) {
      patches.push(createRemovePatch(parentPath, index));
      continue;
    }

    appendIndexPatch(patches, walk(oldChild, newChild, childPath));
  }

  return patches;
}

function hasAnyKey(children) {
  return children.some(
    (child) => child?.key !== null && child?.key !== undefined,
  );
}

function buildKeyedMap(children) {
  const map = new Map();

  children.forEach((child, index) => {
    map.set(getNodeIdentity(child, index), { child, index });
  });

  return map;
}

function diffChildrenByKey(oldChildren, newChildren, parentPath, walk, mode) {
  if (
    mode === DIFF_MODES.AUTO &&
    !hasAnyKey(newChildren) &&
    !hasAnyKey(oldChildren)
  ) {
    return diffChildrenByIndex(oldChildren, newChildren, parentPath, walk);
  }
  const patches = [];
  const oldMap = buildKeyedMap(oldChildren);
  const nextIds = newChildren.map(getNodeIdentity);
  const nextSet = new Set(nextIds);
  if (nextSet.size !== nextIds.length)
    throw new Error("Duplicate sibling key.");
  const working = oldChildren.map(getNodeIdentity);
  // Remove against old positions, then simulate every move/insert so all later
  // indices refer to the DOM that the preceding patch actually produced.
  for (let i = working.length - 1; i >= 0; i -= 1) {
    if (!nextSet.has(working[i])) {
      patches.push(createRemovePatch(parentPath, i));
      working.splice(i, 1);
    }
  }
  newChildren.forEach((child, index) => {
    const id = nextIds[index];
    const position = working.indexOf(id);
    if (position < 0) {
      patches.push(createInsertPatch(parentPath, index, child));
      working.splice(index, 0, id);
    } else {
      if (position !== index) {
        patches.push(createMovePatch(parentPath, position, index, child.key));
        working.splice(position, 1);
        working.splice(index, 0, id);
      }
      appendIndexPatch(
        patches,
        walk(oldMap.get(id).child, child, [...parentPath, index]),
      );
    }
  });
  return patches;
}

/**
 * 목적:
 * - child 배열 차이를 diff 모드에 따라 계산한다.
 *
 * 입력:
 * - oldChildren, newChildren: 비교 대상 child 배열
 * - parentPath: 부모 노드 path
 * - options.mode: auto | index | keyed
 * - walk: 노드 단위 재귀 diff 함수
 */
export function diffChildren(
  oldChildren = [],
  newChildren = [],
  parentPath = [],
  options = {},
  walk,
) {
  const mode = options.mode ?? DIFF_MODES.AUTO;

  if (mode === DIFF_MODES.INDEX) {
    return diffChildrenByIndex(oldChildren, newChildren, parentPath, walk);
  }

  if (mode === DIFF_MODES.KEYED) {
    return diffChildrenByKey(oldChildren, newChildren, parentPath, walk, mode);
  }

  if (hasAnyKey(oldChildren) || hasAnyKey(newChildren)) {
    // auto 모드에서는 key가 하나라도 보이면 keyed 전략을 택한다.
    return diffChildrenByKey(
      oldChildren,
      newChildren,
      parentPath,
      walk,
      DIFF_MODES.AUTO,
    );
  }

  return diffChildrenByIndex(oldChildren, newChildren, parentPath, walk);
}
