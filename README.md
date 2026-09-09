# lrn-react

컴포넌트의 상태가 바뀌면 어떤 DOM을 고쳐야 하는지 구현한 작은 JavaScript UI 런타임이다. 함수형 컴포넌트, Hook, VDOM 비교와 DOM patch를 직접 연결했고, 카드 검색·정렬·즐겨찾기 앱을 이 런타임으로 실행한다.

## 실행

Node.js 18 이상·npm·Python 3가 필요하다. 검증 환경은 Node 22다. 런타임은 외부 React 패키지에 의존하지 않는다.

```sh
make setup
make demo
# 브라우저: http://127.0.0.1:8766
# 실제 브라우저에서 반복 가능한 핵심 계약 테스트
# http://127.0.0.1:8766/runtime-tests.html
```

서버는 Ctrl-C로 종료한다. 카드를 정렬하거나 즐겨찾기를 바꾸면 Inspector에서 render와 patch 기록을 함께 볼 수 있다.

## 입력에서 출력까지

h/component + 상태 변경 → 컴포넌트별 Hook record → resolved VDOM → keyed diff → 실제 DOM patch → effect/cleanup

W05의 VDOM·diff·patch와 카드 컬렉션을 기반으로 컴포넌트별 useState·useEffect·useMemo를 제공한다. 부모 경로·key·함수 type으로 Hook record를 식별한다. 같은 함수의 여러 인스턴스, keyed 순서 변경, type 교체와 unmount를 구분한다.

`createApp({root, component, batching: "microtask"})`로 같은 tick의 상태 변경을 한 번에 처리한다. 기본 API batching은 기존 sync를 유지하며 실제 카드 앱은 microtask를 사용한다. commit 중 state 변경은 다음 microtask로 예약한다. effect는 DOM 반영 이후 실행하고 제거된 컴포넌트의 cleanup을 한 번 호출한다. 제거된 인스턴스의 setter는 no-op이다.

keyed diff는 항목을 제거한 뒤 남은 목록을 기준으로 이동·삽입 위치를 계산한다. `[b,a] → [a]`처럼 삭제와 순서 변경이 겹쳐도 남아야 할 항목을 유지하기 위한 순서다. DOM 속성·이벤트의 추가·교체·제거도 patch에서 처리한다.

기본 브라우저 모드는 6개 로컬 카드와 직접 생성한 SVG 도형을 사용해 외부 API·이미지 다운로드 없이 동작한다. 이름과 기존 metadata는 학습용 예제다. `?data=remote`를 명시하면 기존 PokeAPI 경로를 사용한다. 검색·정렬·즐겨찾기·화면 이동을 수행하면서 Inspector에서 patch와 render 횟수를 볼 수 있다.

컴포넌트별 상태의 수명은 [`resolveComponentTree.js`](src/core/runtime/resolveComponentTree.js), 목록 비교는 [`diffChildren.js`](src/core/reconciler/diffChildren.js), DOM 반영은 [`patch.js`](src/core/renderer-dom/patch.js), 실제 사용 예는 [`App.js`](src/app/App.js)에서 볼 수 있다.

## 검증과 관찰

```sh
make test
```

Node에서는 컴포넌트 상태 분리, key와 type에 따른 재사용·교체, batching과 cleanup을 검사하고 배포용 모듈을 빌드한다. 실제 DOM 검사는 서버 실행 후 [runtime-tests.html](runtime-tests.html)을 열어 확인한다. 카드 앱에서는 정렬 후 즐겨찾기가 같은 카드에 남는지, 상세 화면을 오갔다가 돌아와도 화면과 상태가 맞는지 살펴볼 수 있다.

## 지원 범위와 한계

React 전체 호환·Next.js·SSR/hydration·Suspense·Server Components·JSX compiler·Fiber scheduler를 제공하지 않는다. 컴포넌트는 단일 VNode를 반환하며 Hook 순서와 개수는 고정해야 한다. key는 형제 사이에서 유일해야 한다. component render 중 setState는 지원하지 않는다. root render 전체를 다시 계산하므로 React의 선택적 subtree scheduling이나 동시 렌더링 성능을 주장하지 않는다.

W04 Fiber 구현은 기존 원본 저장소와 이력에 비교 자료로 남아 있고 이 런타임에는 합치지 않았다. Node의 작은 테스트 DOM 결과와 실제 브라우저 결과를 구분한다. 원격 PokeAPI 가용성은 오프라인 완료 조건에 포함하지 않는다.

## 출처와 기여

[Jungle-12-303/virtual-dom-engine-demo](https://github.com/Jungle-12-303/virtual-dom-engine-demo)에서 이어 받은 학습용 파생본이다. 기준 원본 revision은 `6f3c48c198ca7c81cab4e72544747fde0d8192b0`이다. 원본 과제·팀 코드와 이후 개인 확장을 구분하며, 개별 기여는 Git author와 diff로 확인한다. 기존 저작권 표시는 소스에 유지한다.

기존 VDOM 엔진과 카드 앱에 컴포넌트별 Hook 수명 관리와 오프라인 데이터를 더했다. W04·W05 단계의 설계와 실험은 [정리 전 이력](https://github.com/woonyong-kr/lrn-react/tree/5e9a60f126cc1a2f6ad8df31c7db0f5a59fb929e)에서 확인할 수 있다.
