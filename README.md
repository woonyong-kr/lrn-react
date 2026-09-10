# ⚛️ lrn-react

컴포넌트 상태 변경을 실제 DOM에 반영하는 작은 JavaScript UI 런타임입니다. Hook·VDOM·keyed diff·patch를 직접 연결하고 카드 검색·정렬·즐겨찾기 앱으로 실행합니다.

[컴포넌트 렌더링 Wiki](https://docs.woonyong.com/wiki/frontend-topic-556b062c7529/) · [카드 앱](src/app/App.js)

## 실행

Node.js 18 이상, npm, Python 3가 필요합니다. 확인한 실행 환경은 Node 22이며 외부 React 패키지에 의존하지 않습니다.

```sh
make setup
make demo
# 브라우저: http://127.0.0.1:8766
make test
```

기본 모드는 로컬 카드와 SVG를 사용해 외부 API 없이 동작합니다. 검색·정렬·즐겨찾기·화면 전환을 해 보고 Inspector의 render·patch 기록을 확인합니다. 서버는 Ctrl-C로 종료합니다. 기존 PokeAPI 데이터는 `?data=remote`를 명시할 때만 사용합니다.

## 구현과 설계

컴포넌트·상태 변경 → Hook record → VDOM → keyed diff → DOM patch → effect/cleanup으로 이어집니다.

- [resolveComponentTree.js](src/core/runtime/resolveComponentTree.js): `h`, 함수형 컴포넌트, `useState`·`useEffect`·`useMemo`. 부모 경로·key·함수 type으로 인스턴스를 구분합니다.
- [diffChildren.js](src/core/reconciler/diffChildren.js): 삭제 후 남은 목록을 기준으로 이동·삽입 위치를 계산해 재정렬 시 항목의 정체성을 유지합니다.
- [patch.js](src/core/renderer-dom/patch.js): DOM 속성·이벤트 추가·교체·제거. effect는 DOM 반영 후 실행하고 unmount에서 cleanup을 호출합니다.

카드 앱은 `createApp({root, component, batching: "microtask"})`로 같은 tick의 상태 변경을 묶습니다. API 기본값은 sync입니다. commit 중 상태 변경은 다음 microtask로 예약하며 제거된 인스턴스의 setter는 no-op입니다.

`make test`는 Node에서 상태 분리·key/type 교체·batching·cleanup을 검사하고 모듈을 빌드합니다. 서버 실행 후 [브라우저 검사 화면](http://127.0.0.1:8766/runtime-tests.html)에서 실제 DOM 결과도 확인할 수 있습니다.

## 현재 범위

컴포넌트는 단일 VNode를 반환하고 Hook 순서·개수를 고정해야 합니다. key는 형제 사이에서 유일해야 하며 render 중 setState는 지원하지 않습니다. root 전체를 다시 계산하는 런타임으로 React 전체 호환·동시 렌더링·SSR·JSX compiler는 제공하지 않습니다. W04 Fiber 구현은 비교 자료로 보존하며 이 런타임에 합치지 않았습니다.

## 출처와 기여

[Jungle-12-303/week5-team1-react2](https://github.com/Jungle-12-303/week5-team1-react2)(이전 이름 `virtual-dom-engine-demo`)에서 이어 받은 학습용 파생본이다. 기준 원본 revision은 `6f3c48c198ca7c81cab4e72544747fde0d8192b0`이다. 원본 과제·팀 코드와 이후 개인 확장은 Git author와 diff로 구분하며, 기존 저작권 표시는 소스에 유지한다.

기존 VDOM 엔진과 카드 앱에 컴포넌트별 Hook 수명 관리와 오프라인 데이터를 더했다. W04·W05 단계의 설계와 실험은 [정리 전 이력](https://github.com/woonyong-kr/lrn-react/tree/5e9a60f126cc1a2f6ad8df31c7db0f5a59fb929e)에서 확인할 수 있다.
