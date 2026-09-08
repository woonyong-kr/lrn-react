# lrn-react

상태를 가진 컴포넌트를 렌더링하는 작은 UI 런타임. 핵심 엔진을 실제 입력으로 실행하고 결과와 내부 동작을 확인하는 독립 프로그램이다.

## 실행

Node.js 18 이상·npm·Python 3가 필요하다. 검증 환경은 Node 22다. 런타임은 외부 React 패키지에 의존하지 않는다.

```sh
make setup
make test
make demo
# 브라우저: http://127.0.0.1:8766
# 실제 브라우저에서 반복 가능한 핵심 계약 테스트
# http://127.0.0.1:8766/runtime-tests.html
```

대화형 서버는 해당 터미널에서 Ctrl-C로 종료한다. demo/test의 자식 프로세스는 실행기가 보유한 PID 또는 컨테이너 ID로만 종료한다. 다른 서버를 포트 번호로 찾아 일괄 종료하지 않는다. 준비된 Python 환경이 없으면 먼저 `make setup`을 실행한다.

## 입력에서 출력까지

h/component + 상태 변경 → 컴포넌트별 Hook record → resolved VDOM → keyed diff → 실제 DOM patch → effect/cleanup

W05의 VDOM·diff·patch와 카드 컬렉션을 기반으로 컴포넌트별 useState·useEffect·useMemo를 제공한다. 부모 경로·key·함수 type으로 Hook record를 식별한다. 같은 함수의 여러 인스턴스, keyed 순서 변경, type 교체와 unmount를 구분한다.

`createApp({root, component, batching: "microtask"})`로 같은 tick의 상태 변경을 한 번에 처리한다. 기본 API batching은 기존 sync를 유지하며 실제 카드 앱은 microtask를 사용한다. commit 중 state 변경은 다음 microtask로 예약한다. effect는 DOM 반영 이후 실행하고 제거된 컴포넌트의 cleanup을 한 번 호출한다. 제거된 인스턴스의 setter는 no-op이다.

keyed diff는 제거 후 현재 목록을 모사하면서 이동·삽입 위치를 계산한다. 예전 [b,a] → [a] 전환에서 a를 옮긴 후 잘못 삭제하던 오류를 수정했다. DOM 속성·event 추가/교체/제거와 Inspector를 유지한다.

기본 브라우저 모드는 6개 로컬 카드와 직접 생성한 SVG 도형을 사용해 외부 API·이미지 다운로드 없이 동작한다. 이름과 기존 metadata는 학습용 예제다. `?data=remote`를 명시하면 기존 PokeAPI 경로를 사용한다. 검색·정렬·즐겨찾기·화면 이동을 수행하면서 Inspector에서 patch와 render 횟수를 볼 수 있다.

구현을 읽는 순서: `src/core/runtime/resolveComponentTree.js`, `src/core/reconciler/diffChildren.js`, `src/core/renderer-dom/patch.js`, `src/app/App.js`.

## 검증과 관찰

83개 Node 시나리오와 실제 Chromium DOM에서의 핵심 component-state 테스트를 통과했다. 브라우저 카드 검색·정렬·즐겨찾기·상세 이동, MNIST와 별개인 이 앱의 375px 화면과 가로 넘침을 확인했다.

실행 환경·명령·exit code·원본 백업과 전체 결과는 이번 전환의 별도 작업 폴더에 기록한다. 새 기계에서는 같은 명령으로 직접 재검증한다. 수치가 기록되어 있다는 사실과 현재 실행 성공을 구분한다.

## 지원 범위와 한계

React 전체 호환·Next.js·SSR/hydration·Suspense·Server Components·JSX compiler·Fiber scheduler를 제공하지 않는다. 컴포넌트는 단일 VNode를 반환하며 Hook 순서와 개수는 고정해야 한다. key는 형제 사이에서 유일해야 한다. component render 중 setState는 지원하지 않는다. root render 전체를 다시 계산하므로 React의 선택적 subtree scheduling이나 동시 렌더링 성능을 주장하지 않는다.

W04 Fiber 구현은 기존 원본 저장소와 이력에 비교 자료로 남아 있고 이 런타임에는 합치지 않았다. Node의 작은 테스트 DOM 결과와 실제 브라우저 결과를 구분한다. 원격 PokeAPI 가용성은 오프라인 완료 조건에 포함하지 않는다.

## 원본·학습 문서의 경계

[원본 아카이브와 기여 구분](archive/README.md)을 확인한다. 이 저장소는 실행 코드·테스트·사용법·설계 근거를 소유한다. WIKI는 개념 정본을 소유하며 기존 정본·공통 색인·배포 파일을 이 작업에서 수정하지 않는다. SQL·PintOS와 RepoLM/음성 서비스는 이 프로그램의 실행 의존성이 아니다.
