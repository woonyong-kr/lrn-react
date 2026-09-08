/*
 * Responsibility:
 * - canonical VNode shape를 생성하는 기본 팩토리 함수를 제공한다.
 * - text/element 구분, key 정규화, meta 기본값 설정을 담당한다.
 *
 * Inputs/Outputs:
 * - 입력: VNode를 구성하기 위한 최소 정보
 * - 출력: architecture 문서와 일치하는 canonical VNode 객체
 *
 * Relationships:
 * - h(), domToVNode(), diff, renderer가 모두 이 shape를 전제로 동작한다.
 *
 * Easy explanation:
 * - VNode 구조가 프로젝트 전체에서 같아야 diff와 renderer가 제대로 협업할 수 있다.
 * - 이 파일은 "표준 VNode 모양"을 만드는 공장이다.
 */

import { NODE_TYPES } from "../shared/constants.js";

function createBaseMeta(meta = {}) {
  return {
    source: meta.source ?? "declarative",
    isWhitespaceOnly: meta.isWhitespaceOnly ?? false,
    path: meta.path ?? [],
  };
}

/**
 * 목적:
 * - text VNode를 생성한다.
 *
 * 입력:
 * - text: 문자열화 가능한 값
 * - meta: 선택적 메타 정보
 *
 * 반환:
 * - canonical text vnode
 */
export function createTextVNode(text, meta = {}) {
  return {
    type: NODE_TYPES.TEXT,
    tag: null,
    key: null,
    props: {},
    events: {},
    children: [],
    text: String(text),
    meta: createBaseMeta({
      ...meta,
      isWhitespaceOnly: /^\s*$/.test(String(text)),
    }),
  };
}

/**
 * 목적:
 * - element VNode를 생성한다.
 *
 * 입력:
 * - tag: HTML tag 이름
 * - options: key / props / events / children / meta
 *
 * 반환:
 * - canonical element vnode
 */
export function createElementVNode(tag, options = {}) {
  return {
    type: NODE_TYPES.ELEMENT,
    tag,
    key: options.key ?? null,
    props: options.props ?? {},
    events: options.events ?? {},
    children: options.children ?? [],
    text: null,
    meta: createBaseMeta(options.meta),
  };
}

export function isTextVNode(vnode) {
  return vnode?.type === NODE_TYPES.TEXT;
}

export function isElementVNode(vnode) {
  return vnode?.type === NODE_TYPES.ELEMENT;
}

/**
 * 목적:
 * - child diff에서 identity를 판단할 때 사용할 키를 계산한다.
 *
 * 규칙:
 * - key가 있으면 key를 우선 사용한다.
 * - 없으면 fallback index를 사용한다.
 */
export function getNodeIdentity(vnode, fallbackIndex) {
  if (vnode?.key !== null && vnode?.key !== undefined) {
    return `key:${JSON.stringify([typeof vnode.key, vnode.key])}`;
  }

  return `index:${fallbackIndex}`;
}
