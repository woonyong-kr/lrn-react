/*
 * Responsibility:
 * - 카드 컬렉션 쇼케이스 서비스의 루트 상태, 데이터 로딩, 페이지 전환을 관리한다.
 */

import { h, useEffect, useMemo, useState } from "../index.js";
import { CARD_LIBRARY, DEFAULT_SETTINGS, PAGE_META } from "./data/cardLibrary.js";
import {
  createPokemonShellCatalog,
  fetchPokemonCatalog,
  fetchPokemonCardsByNumbers,
  fetchPokemonDetail,
  fetchPokemonLocalizedNames,
} from "./data/pokeApiClient.js";
import { getLocalPokemonName } from "./data/pokemon-names/index.js";
import { getLocaleMessages, LANGUAGE_OPTIONS, resolveSupportedLocale } from "./i18n/messages.js";
import { AppShell } from "./components/AppShell.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { CollectionPage } from "./pages/CollectionPage.js";
import { DetailPage } from "./pages/DetailPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

const CATALOG_CACHE_KEY = "card-showcase-catalog-cache";
const MAX_NATIONAL_DEX = 1025;
const COLLECTION_ROW_HEIGHT = 430;
const COLLECTION_ROW_GAP = 18;
const COLLECTION_PAGE_SIZE = 24;
const COLLECTION_FALLBACK_VIEWPORT_HEIGHT = 720;
const COLLECTION_FALLBACK_VIEWPORT_WIDTH = 880;

function canUseLocalStorage() {
  // 브라우저가 localStorage를 제공하지 않는 환경(예: 일부 테스트 환경)에서도
  // 앱이 죽지 않도록 먼저 기능 존재 여부를 확인한다.
  return typeof localStorage !== "undefined";
}

function getDataMode() {
  // 테스트에서는 네트워크 없이도 안정적으로 동작해야 하므로,
  // 전역 플래그로 "local" 모드를 강제할 수 있게 해 둔다.
  return globalThis.__CARD_SHOWCASE_DATA_MODE__ === "local" ? "local" : "remote";
}


function localCardArtwork(card, thumbnail = false) {
  const colors = {fire: '#ef724c', water: '#4a9fce', electric: '#e9bb38', grass: '#74b068', ghost: '#8a72b0'};
  const color = colors[card.types[0]] ?? '#808fa9';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${thumbnail ? 80 : 320}" height="${thumbnail ? 80 : 320}" viewBox="0 0 320 320"><rect width="320" height="320" rx="36" fill="${color}"/><circle cx="160" cy="135" r="78" fill="white" opacity=".2"/><text x="160" y="162" text-anchor="middle" font-size="68" fill="white" font-family="system-ui">${Number(card.number)}</text><text x="160" y="256" text-anchor="middle" font-size="24" fill="white" font-family="system-ui">${card.name}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function cloneDefaultCards() {
  // 샘플 카드 배열을 그대로 재사용하면 즐겨찾기 변경 같은 상태가 원본 상수까지
  // 오염될 수 있다. 그래서 렌더에 쓸 때는 항상 복사본을 만든다.
  return CARD_LIBRARY.map((card) => ({
    ...card,
    imageUrl: localCardArtwork(card),
    thumbUrl: localCardArtwork(card, true),
    types: card.types.slice(),
    baseStats: card.baseStats ? { ...card.baseStats } : null,
    isHydrated: true,
  }));
}

function resolveBrowserLocale() {
  if (typeof globalThis.__CARD_SHOWCASE_LOCALE__ === "string") {
    return resolveSupportedLocale(globalThis.__CARD_SHOWCASE_LOCALE__);
  }

  if (typeof navigator === "undefined") {
    return DEFAULT_SETTINGS.locale;
  }

  return resolveSupportedLocale([navigator.language, ...(navigator.languages ?? [])]);
}

function readStoredJson(key) {
  // localStorage 파싱 실패는 사용자 데이터 손상이나 브라우저 정책으로 쉽게
  // 생길 수 있다. 여기서는 예외를 밖으로 던지지 않고 "없음"으로 취급한다.
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function parseStoredSettings() {
  // 저장된 설정은 일부 필드만 있을 수 있으므로, 문서에 정의된 기본 설정과
  // 병합해 항상 완전한 settings 객체를 만든다.
  const parsed = readStoredJson("card-showcase-settings");

  if (!parsed || typeof parsed !== "object") {
    return {
      ...DEFAULT_SETTINGS,
      locale: resolveBrowserLocale(),
    };
  }

  return {
    defaultPage: parsed.defaultPage ?? DEFAULT_SETTINGS.defaultPage,
    defaultSortMode: parsed.defaultSortMode ?? DEFAULT_SETTINGS.defaultSortMode,
    locale: resolveSupportedLocale(parsed.locale ?? resolveBrowserLocale()),
    tiltEnabled: parsed.tiltEnabled ?? DEFAULT_SETTINGS.tiltEnabled,
    glareEnabled: parsed.glareEnabled ?? DEFAULT_SETTINGS.glareEnabled,
    highResImage: parsed.highResImage ?? DEFAULT_SETTINGS.highResImage,
  };
}

function readStoredFavoriteIds() {
  // 현재 버전은 favorite id 목록만 저장하지만,
  // 예전 버전과의 호환을 위해 legacy 카드 배열도 읽을 수 있게 유지한다.
  const explicitIds = readStoredJson("card-showcase-favorites");

  if (Array.isArray(explicitIds)) {
    return explicitIds;
  }

  const legacyCards = readStoredJson("card-showcase-cards");

  if (!Array.isArray(legacyCards)) {
    return [];
  }

  return legacyCards.filter((card) => card && card.isFavorite).map((card) => card.id);
}

function readCatalogCache() {
  // 원격 카탈로그를 다시 불러오기 전에 이전 성공 결과를 보여주기 위한 캐시다.
  // 단, 문서 기준으로 정규 전국도감 1025번까지만 허용하므로 그 범위를 넘는 카드는 버린다.
  const parsed = readStoredJson(CATALOG_CACHE_KEY);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }

  return parsed.map((card) => ({
    ...card,
    types: Array.isArray(card.types) ? card.types.slice() : [],
    baseStats: card.baseStats ? { ...card.baseStats } : null,
    isFavorite: false,
    isHydrated: card.isHydrated ?? true,
  })).filter((card) => Number(card.number) <= MAX_NATIONAL_DEX);
}

function writeCatalogCache(cards) {
  // 캐시는 "목록을 빠르게 다시 보여주기 위한 최소 데이터"라는 성격이므로
  // 세션성 상태인 isFavorite은 저장하지 않는다.
  if (!canUseLocalStorage() || !Array.isArray(cards) || cards.length === 0) {
    return;
  }

  const cachePayload = cards.map((card) => ({
    ...card,
    isFavorite: false,
  }));

  localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(cachePayload));
}

function mergeFavoriteFlags(cards, favoriteIds) {
  // 원격 데이터와 로컬 즐겨찾기 상태를 합치는 단계다.
  // 외부 API 응답은 "카드 자체 정보"만 담고 있고,
  // 사용자의 즐겨찾기 여부는 앱이 따로 덧씌운다.
  const favoriteSet = new Set(favoriteIds);

  return cards.map((card) => ({
    ...card,
    types: Array.isArray(card.types) ? card.types.slice() : [],
    baseStats: card.baseStats ? { ...card.baseStats } : null,
    isFavorite: favoriteSet.has(card.id),
    isHydrated: card.isHydrated ?? true,
  }));
}

function createPageItems(pages, localizedPages) {
  // AppShell과 네비게이션은 전체 PAGE_META가 아니라,
  // label만 있는 단순 구조면 충분하므로 표시용 데이터만 추린다.
  return Object.keys(pages).reduce((result, page) => {
    result[page] = {
      label: localizedPages?.[page]?.label ?? pages[page].label,
      title: localizedPages?.[page]?.title ?? pages[page].title,
    };
    return result;
  }, {});
}

function createCatalogStatusMessage(copy, loadedCount) {
  return copy.actions.catalogLoaded(loadedCount);
}

function resolveCollectionColumnCount(width) {
  if (width <= 560) {
    return 1;
  }

  if (width <= 820) {
    return 2;
  }

  if (width <= 1180) {
    return 3;
  }

  return 4;
}

function resolveCollectionRowsPerPage(columnCount) {
  return Math.max(1, Math.ceil(COLLECTION_PAGE_SIZE / columnCount));
}

function resolveCollectionPageHeight(columnCount) {
  const rowsPerPage = resolveCollectionRowsPerPage(columnCount);
  return rowsPerPage * COLLECTION_ROW_HEIGHT + Math.max(0, rowsPerPage - 1) * COLLECTION_ROW_GAP;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resetCollectionPage(previousValue) {
  if (previousValue.pageIndex === 0) {
    return previousValue;
  }

  return {
    ...previousValue,
    pageIndex: 0,
  };
}

function sortCards(cards, sortMode, locale) {
  // 정렬은 원본 배열을 직접 바꾸지 않도록 항상 복사본에서 수행한다.
  // 그래야 useMemo와 상태 비교가 더 예측 가능해진다.
  const nextCards = cards.slice();

  nextCards.sort((left, right) => {
    if (sortMode === "name") {
      return (left.displayName ?? left.name).localeCompare((right.displayName ?? right.name), locale);
    }

    if (sortMode === "favorites") {
      const favoriteDelta = Number(right.isFavorite) - Number(left.isFavorite);

      if (favoriteDelta !== 0) {
        return favoriteDelta;
      }
    }

    return Number(left.number) - Number(right.number);
  });

  return nextCards;
}

function filterCards(cards, filters) {
  // 검색, 타입 필터, 즐겨찾기 필터를 한 곳에 모아 두면
  // 컬렉션 페이지가 "어떤 카드가 보여야 하는지"를 읽기 쉬워진다.
  const normalizedKeyword = filters.searchKeyword.trim().toLowerCase();

  return cards.filter((card) => {
    if (filters.typeFilter !== "all" && !card.types.includes(filters.typeFilter)) {
      return false;
    }

    if (filters.favoritesOnly && !card.isFavorite) {
      return false;
    }

    if (!normalizedKeyword) {
      return true;
    }

    return `${card.displayName ?? card.name} ${card.name} ${card.number}`.toLowerCase().includes(normalizedKeyword);
  });
}

function buildTypeSummary(cards, typeLabels) {
  // 대시보드 요약 패널은 cards 전체가 아니라 "현재 보이는 카드"를 기준으로
  // 계산해야 사용자가 필터 결과와 요약 수치를 함께 이해할 수 있다.
  return Object.entries(typeLabels)
    .map(([type, label]) => ({
      type,
      label,
      count: cards.filter((card) => card.types.includes(type)).length,
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count);
}

function resolveTopTypeMessage(typeSummary) {
  // 대시보드 설명 문구도 파생 데이터다.
  // 미리 문자열로 만들어 두면 페이지 컴포넌트는 렌더링 역할에만 집중할 수 있다.
  if (typeSummary.length === 0) {
    return null;
  }

  return typeSummary[0];
}

function getCardIndex(cards, selectedCardId) {
  // 상세 페이지의 "Next Card" 버튼은 현재 선택 카드가 목록에서 몇 번째인지 알아야 한다.
  return cards.findIndex((card) => card.id === selectedCardId);
}

function applyInteractiveStyle(element, options) {
  // 카드 기울기/광택은 초당 매우 자주 바뀌는 고빈도 인터랙션이다.
  // 이것을 useState로 처리하면 루트 앱 전체가 매번 다시 렌더될 수 있으므로,
  // 카드 DOM 요소에 CSS 변수를 직접 써서 시각 효과만 국소적으로 갱신한다.
  if (!element) {
    return;
  }

  const tilt = options.tiltEnabled
    ? `transform: perspective(960px) rotateX(${options.rotateX}deg) rotateY(${options.rotateY}deg) scale3d(1.02, 1.02, 1.02);`
    : "transform: perspective(960px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1);";
  const glare = options.glareEnabled
    ? `--glare-opacity: ${options.glareOpacity ?? 0.84}; --glare-strength: ${options.glareStrength ?? 1.06}; --edge-glow-opacity: ${options.edgeGlowOpacity ?? 0.42}; --glare-rotation: ${options.glareRotation}deg; --surface-shift: ${options.surfaceShift}%; --shine-shift-x: ${options.shineShiftX}%; --shine-shift-y: ${options.shineShiftY}%; --wave-skew: ${options.waveSkew}deg; --holo-x: ${options.holoX ?? 50}%; --holo-y: ${options.holoY ?? 50}%; --sparkle-opacity: ${options.sparkleOpacity};`
    : "--glare-opacity: 0.3; --glare-strength: 0.42; --edge-glow-opacity: 0.18; --glare-rotation: -6deg; --surface-shift: 0%; --shine-shift-x: 0%; --shine-shift-y: 0%; --wave-skew: 0deg; --holo-x: 50%; --holo-y: 50%; --sparkle-opacity: 0.22;";

  element.setAttribute("style", `${tilt} ${glare}`);
}

function mergeCardWithDetail(card, detail) {
  // 목록 페이지용 간단 데이터(card)와 상세 페이지용 추가 데이터(detail)를 합친다.
  // 이렇게 분리하면 초기 목록 로딩은 가볍게 유지하고,
  // 상세 페이지에 들어갔을 때만 더 많은 정보를 덧붙일 수 있다.
  if (!card) {
    return null;
  }

  if (!detail) {
    return card;
  }

  return {
    ...card,
    types: detail.types?.length ? detail.types : card.types,
    height: detail.height ?? card.height,
    weight: detail.weight ?? card.weight,
    baseStats: detail.baseStats ?? card.baseStats,
    flavor: detail.flavor ?? card.flavor,
    evolutionDexNumbers: detail.evolutionDexNumbers?.length ? detail.evolutionDexNumbers.slice() : [],
  };
}

function createLocalDetail(card) {
  // 원격 상세 로딩이 없거나 실패했을 때도 Detail 페이지가 완전히 비지 않도록
  // 기본 카드 데이터만으로 만들 수 있는 최소 상세 정보를 준비한다.
  return {
    types: card.types.slice(),
    height: card.height,
    weight: card.weight,
    baseStats: card.baseStats ? { ...card.baseStats } : null,
    flavor: card.flavor,
    evolutionDexNumbers: [],
  };
}

function countSharedTypes(leftTypes, rightTypes) {
  if (!Array.isArray(leftTypes) || !Array.isArray(rightTypes)) {
    return 0;
  }

  const rightSet = new Set(rightTypes);
  return leftTypes.reduce((count, type) => count + (rightSet.has(type) ? 1 : 0), 0);
}

function getBaseStatTotal(card) {
  if (!card?.baseStats) {
    return 0;
  }

  return Object.values(card.baseStats).reduce((sum, value) => sum + Number(value || 0), 0);
}

function scoreRelatedCard(selectedCard, candidate) {
  if (!selectedCard || !candidate || selectedCard.id === candidate.id) {
    return Number.NEGATIVE_INFINITY;
  }

  const sharedTypeCount = countSharedTypes(selectedCard.types, candidate.types);
  const statDistance = Math.abs(getBaseStatTotal(selectedCard) - getBaseStatTotal(candidate));
  const dexDistance = Math.abs(Number(selectedCard.number) - Number(candidate.number));

  return sharedTypeCount * 100 - statDistance - dexDistance * 0.25;
}

function buildRelatedCards(selectedCardBase, selectedCardDetail, allCards) {
  const pool = Array.isArray(allCards) ? allCards : [];

  if (!selectedCardBase) {
    return [];
  }

  const selectedCard = mergeCardWithDetail(selectedCardBase, selectedCardDetail);
  const dedupedCards = new Map();

  pool.forEach((card) => {
    if (!card || card.id === selectedCard.id) {
      return;
    }

    if (!dedupedCards.has(card.number)) {
      dedupedCards.set(card.number, card);
    }
  });

  const evolutionDexNumbers = Array.isArray(selectedCardDetail?.evolutionDexNumbers)
    ? selectedCardDetail.evolutionDexNumbers
    : [];
  const evolutionSet = new Set(evolutionDexNumbers.filter((number) => number !== selectedCard.number));
  const evolutionCards = Array.from(dedupedCards.values())
    .filter((card) => evolutionSet.has(card.number))
    .sort(
      (left, right) => evolutionDexNumbers.indexOf(left.number) - evolutionDexNumbers.indexOf(right.number)
    );

  const fallbackCards = Array.from(dedupedCards.values())
    .filter((card) => countSharedTypes(selectedCard.types, card.types) > 0)
    .sort((left, right) => {
      const scoreDelta = scoreRelatedCard(selectedCard, right) - scoreRelatedCard(selectedCard, left);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return Math.abs(Number(selectedCard.number) - Number(left.number))
        - Math.abs(Number(selectedCard.number) - Number(right.number));
    })
    .slice(0, 3);

  if (evolutionCards.length === 0) {
    return fallbackCards;
  }

  const relatedCards = evolutionCards.slice();

  fallbackCards.forEach((card) => {
    if (relatedCards.length >= 3) {
      return;
    }

    if (!relatedCards.some((existingCard) => existingCard.number === card.number)) {
      relatedCards.push(card);
    }
  });

  return relatedCards;
}

function readCardIdFromEvent(event) {
  return event?.currentTarget?.getAttribute?.("data-card-id") ?? null;
}

function readCardNameFromEvent(event) {
  return event?.currentTarget?.getAttribute?.("data-card-name") ?? null;
}

function resolveCardDisplayName(card, locale, localizedNamesByLocale) {
  if (!card) {
    return "";
  }

  return (
    getLocalPokemonName(locale, card.number)
    ?? localizedNamesByLocale?.[locale]?.[card.number]
    ?? card.name
  );
}

function withDisplayName(card, locale, localizedNamesByLocale) {
  return {
    ...card,
    displayName: resolveCardDisplayName(card, locale, localizedNamesByLocale),
  };
}

function mergeCardsByNumber(previousCards, nextCards) {
  const nextCardMap = new Map(nextCards.map((card) => [card.number, card]));

  return previousCards.map((card) => {
    const replacement = nextCardMap.get(card.number);

    if (!replacement) {
      return card;
    }

    return {
      ...card,
      ...replacement,
      isFavorite: card.isFavorite,
    };
  });
}

export function App(props = {}) {
  // App은 문서에서 정의한 "단일 루트 상태 저장소" 역할을 그대로 수행한다.
  // 여기 있는 상태가 대시보드, 컬렉션, 상세, 설정 페이지 전체를 움직인다.
  const initialSettings = parseStoredSettings();
  const [settings, setSettings] = useState(() => initialSettings);
  const [currentPage, setCurrentPage] = useState(() => initialSettings.defaultPage ?? "dashboard");
  const [cards, setCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortMode, setSortMode] = useState(() => initialSettings.defaultSortMode ?? "number");
  const [lastAction, setLastAction] = useState(() => getLocaleMessages(initialSettings.locale).actions.loadingLibrary);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [detailById, setDetailById] = useState({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [catalogNotice, setCatalogNotice] = useState(null);
  const [isStreamingCatalog, setIsStreamingCatalog] = useState(false);
  const [hasLoadedFullCatalog, setHasLoadedFullCatalog] = useState(getDataMode() === "local");
  const [hydratingCardNumbers, setHydratingCardNumbers] = useState({});
  const [localizedNamesByLocale, setLocalizedNamesByLocale] = useState({});
  const [collectionViewport, setCollectionViewport] = useState({
    pageIndex: 0,
    viewportHeight: COLLECTION_FALLBACK_VIEWPORT_HEIGHT,
    viewportWidth: COLLECTION_FALLBACK_VIEWPORT_WIDTH,
  });

  const copy = useMemo(() => getLocaleMessages(settings.locale), [settings.locale]);
  const pageItems = useMemo(() => createPageItems(PAGE_META, copy.pages), [copy.pages]);
  const typeLabels = useMemo(() => copy.typeLabels, [copy.typeLabels]);
  const localizedCards = useMemo(
    () => cards.map((card) => withDisplayName(card, settings.locale, localizedNamesByLocale)),
    [cards, localizedNamesByLocale, settings.locale]
  );
  // visibleCards는 카드 앱의 핵심 파생 데이터다.
  // 검색/필터/정렬 결과를 매 렌더마다 즉석 계산하지 않고 useMemo로 캐싱한다.
  const visibleCards = useMemo(() => sortCards(filterCards(localizedCards, {
    searchKeyword,
    typeFilter,
    favoritesOnly,
  }), sortMode, settings.locale), [favoritesOnly, localizedCards, searchKeyword, settings.locale, sortMode, typeFilter]);
  const favoriteCount = useMemo(() => cards.filter((card) => card.isFavorite).length, [cards]);
  const selectedCardBase = useMemo(
    () => localizedCards.find((card) => card.id === selectedCardId) ?? null,
    [localizedCards, selectedCardId]
  );
  const selectedCardDetail = useMemo(
    () => (selectedCardBase ? detailById[selectedCardBase.id] ?? null : null),
    [detailById, selectedCardBase]
  );
  const selectedCardNumber = selectedCardBase?.number ?? null;
  const selectedCard = useMemo(() => mergeCardWithDetail(selectedCardBase, selectedCardDetail), [selectedCardBase, selectedCardDetail]);
  const typeSummary = useMemo(() => buildTypeSummary(visibleCards, typeLabels), [typeLabels, visibleCards]);
  const spotlightCard = useMemo(
    () => selectedCard ?? visibleCards[0] ?? localizedCards[0] ?? null,
    [localizedCards, selectedCard, visibleCards]
  );
  const spotlightCardNumber = spotlightCard?.number ?? null;
  const topTypeLeader = useMemo(() => resolveTopTypeMessage(typeSummary), [typeSummary]);
  const topTypeMessage = useMemo(() => (
    topTypeLeader
      ? copy.dashboard.topTypeMessage(topTypeLeader.label, topTypeLeader.count)
      : copy.dashboard.topTypeEmpty
  ), [copy.dashboard, topTypeLeader]);
  const relatedCards = useMemo(() => {
    if (!selectedCardBase) {
      return [];
    }

    if (getDataMode() === "remote" && !selectedCardDetail) {
      return [];
    }

    return buildRelatedCards(selectedCardBase, selectedCardDetail, localizedCards);
  }, [localizedCards, selectedCardBase, selectedCardDetail]);
  const collectionColumnCount = useMemo(() => resolveCollectionColumnCount(collectionViewport.viewportWidth), [collectionViewport.viewportWidth]);
  const collectionPageHeight = useMemo(
    () => resolveCollectionPageHeight(collectionColumnCount),
    [collectionColumnCount]
  );
  const collectionTotalPageCount = useMemo(
    () => Math.max(1, Math.ceil(visibleCards.length / COLLECTION_PAGE_SIZE)),
    [visibleCards.length]
  );
  const collectionCurrentPage = useMemo(
    () => clamp(collectionViewport.pageIndex, 0, Math.max(0, collectionTotalPageCount - 1)),
    [collectionTotalPageCount, collectionViewport.pageIndex]
  );
  const collectionStartPage = useMemo(
    () => Math.max(0, collectionCurrentPage - 1),
    [collectionCurrentPage]
  );
  const collectionEndPage = useMemo(
    () => Math.min(collectionTotalPageCount, collectionCurrentPage + 2),
    [collectionCurrentPage, collectionTotalPageCount]
  );
  const collectionStartIndex = useMemo(() => collectionStartPage * COLLECTION_PAGE_SIZE, [collectionStartPage]);
  const collectionEndIndex = useMemo(
    () => Math.min(visibleCards.length, collectionEndPage * COLLECTION_PAGE_SIZE),
    [collectionEndPage, visibleCards.length]
  );
  const collectionVisibleSlice = useMemo(
    () => visibleCards.slice(collectionStartIndex, collectionEndIndex),
    [collectionEndIndex, collectionStartIndex, visibleCards]
  );
  const collectionVisibleNumbers = useMemo(
    () => collectionVisibleSlice.map((card) => card.number),
    [collectionVisibleSlice]
  );
  const collectionWindowKey = useMemo(
    () => `${visibleCards.length}:${collectionStartIndex}:${collectionVisibleSlice.map((card) => card.id).join("|")}`,
    [collectionStartIndex, collectionVisibleSlice, visibleCards.length]
  );
  const collectionWindowOffset = useMemo(
    () => collectionStartPage * collectionPageHeight,
    [collectionPageHeight, collectionStartPage]
  );
  const collectionContentHeight = useMemo(
    () => Math.max(collectionViewport.viewportHeight, collectionTotalPageCount * collectionPageHeight),
    [collectionPageHeight, collectionTotalPageCount, collectionViewport.viewportHeight]
  );
  const collectionHandlers = useMemo(() => ({
    onSearchInput(event) {
      const nextKeyword = event.target.value;

      setSearchKeyword(nextKeyword);
      setCollectionViewport(resetCollectionPage);
      setLastAction(copy.actions.searching(nextKeyword));
    },

    onTypeFilterChange(event) {
      const nextType = event.target.value;

      setTypeFilter(nextType);
      setCollectionViewport(resetCollectionPage);
      setLastAction(copy.actions.typeFilterChanged(
        nextType === "all"
          ? copy.toolbar.allTypes
          : typeLabels[nextType] ?? nextType
      ));
    },

    onFavoritesToggle(event) {
      const nextFavoritesOnly = Boolean(event.target.checked);

      setFavoritesOnly(nextFavoritesOnly);
      setCollectionViewport(resetCollectionPage);
      setLastAction(nextFavoritesOnly ? copy.actions.favoritesOnlyOn : copy.actions.favoritesOnlyOff);
    },

    onSortChange(event) {
      const nextSortMode = event.target.value;

      setSortMode(nextSortMode);
      setCollectionViewport(resetCollectionPage);
      setLastAction(copy.actions.sortChanged(copy.sortOptions[nextSortMode] ?? nextSortMode));
    },

    onViewportScroll(event) {
      const target = event.currentTarget;

      setCollectionViewport((previousValue) => {
        const nextViewportWidth = target.clientWidth || previousValue.viewportWidth;
        const nextViewportHeight = target.clientHeight || previousValue.viewportHeight;
        const nextColumnCount = resolveCollectionColumnCount(nextViewportWidth);
        const nextPageHeight = resolveCollectionPageHeight(nextColumnCount);
        const nextValue = {
          pageIndex: Math.max(0, Math.floor(target.scrollTop / nextPageHeight)),
          viewportHeight: nextViewportHeight,
          viewportWidth: nextViewportWidth,
        };

        if (
          previousValue.pageIndex === nextValue.pageIndex
          && previousValue.viewportHeight === nextValue.viewportHeight
          && previousValue.viewportWidth === nextValue.viewportWidth
        ) {
          return previousValue;
        }

        return nextValue;
      });
    },

    onOpenCardClick(event) {
      const cardId = readCardIdFromEvent(event);

      if (!cardId) {
        return;
      }

      setSelectedCardId(cardId);
      setCurrentPage("detail");
      setLastAction(copy.actions.selectedCard(readCardNameFromEvent(event) ?? cardId));
    },

    onFavoriteCardClick(event) {
      const cardId = readCardIdFromEvent(event);

      if (!cardId) {
        return;
      }

      let nextAction = "Updated a saved card state.";

      setCards((previousCards) =>
        previousCards.map((card) => {
          if (card.id !== cardId) {
            return card;
          }

          const nextFavorite = !card.isFavorite;
          nextAction = nextFavorite
            ? copy.actions.savedCard(card.displayName ?? card.name)
            : copy.actions.removedSavedCard(card.displayName ?? card.name);

          return {
            ...card,
            isFavorite: nextFavorite,
          };
        })
      );

      setLastAction(nextAction);
    },
  }), [copy, typeLabels]);
  const collectionPointerHandlers = useMemo(() => ({
    onPointerMove(event) {
      const element = event.currentTarget;

      if (!element || typeof element.getBoundingClientRect !== "function") {
        return;
      }

      const rect = element.getBoundingClientRect();
      const relativeX = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
      const relativeY = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
      const rotateY = (relativeX - 0.5) * 18;
      const rotateX = (0.5 - relativeY) * 16;

      applyInteractiveStyle(element, {
        tiltEnabled: settings.tiltEnabled,
        glareEnabled: settings.glareEnabled,
        rotateX,
        rotateY,
        glareRotation: Math.round((relativeX - 0.5) * 22),
        surfaceShift: Math.round((relativeY - 0.5) * 12),
        shineShiftX: Math.round((relativeX - 0.5) * 28),
        shineShiftY: Math.round((relativeY - 0.5) * 12),
        waveSkew: Math.round((relativeX - 0.5) * 10),
        holoX: Math.round(relativeX * 100),
        holoY: Math.round(relativeY * 100),
        sparkleOpacity: (0.34 + Math.abs(relativeX - 0.5) * 0.42 + Math.abs(relativeY - 0.5) * 0.22).toFixed(3),
      });
    },

    onPointerLeave(event) {
      const element = event.currentTarget;

      applyInteractiveStyle(element, {
        tiltEnabled: false,
        glareEnabled: settings.glareEnabled,
        rotateX: 0,
        rotateY: 0,
        glareRotation: -4,
        surfaceShift: 0,
        shineShiftX: 0,
        shineShiftY: 0,
        waveSkew: 0,
        holoX: 50,
        holoY: 50,
        glareOpacity: 0.34,
        glareStrength: 0.48,
        edgeGlowOpacity: 0.2,
        sparkleOpacity: 0.2,
      });
    },
  }), [settings.glareEnabled, settings.tiltEnabled]);

  useEffect(() => {
    // 페이지 전환이 실제로 반영되고 있음을 브라우저 탭 제목에서도 보여준다.
    // 발표 때 "상태 기반 다중 페이지"를 설명하기 좋은 작은 효과다.
    document.title = `${pageItems[currentPage]?.title ?? "Showcase"} · Prism Dex`;

    return () => {
      document.title = "Week5 React-like Runtime";
    };
  }, [currentPage, pageItems]);

  useEffect(() => {
    if (currentPage !== "collection") {
      return undefined;
    }

    const viewport = document.getElementById("collection-scroll-area");

    if (!viewport) {
      return undefined;
    }

    function syncViewport() {
      setCollectionViewport((previousValue) => {
        const nextViewportWidth = viewport.clientWidth || previousValue.viewportWidth;
        const nextViewportHeight = viewport.clientHeight || previousValue.viewportHeight;
        const nextColumnCount = resolveCollectionColumnCount(nextViewportWidth);
        const nextPageHeight = resolveCollectionPageHeight(nextColumnCount);
        const nextValue = {
          pageIndex: Math.max(0, Math.floor(viewport.scrollTop / nextPageHeight)),
          viewportHeight: nextViewportHeight,
          viewportWidth: nextViewportWidth,
        };

        if (
          previousValue.pageIndex === nextValue.pageIndex
          && previousValue.viewportHeight === nextValue.viewportHeight
          && previousValue.viewportWidth === nextValue.viewportWidth
        ) {
          return previousValue;
        }

        return nextValue;
      });
    }

    syncViewport();

    let resizeObserver = null;

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(syncViewport);
      resizeObserver.observe(viewport);
    }

    window.addEventListener("resize", syncViewport);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      window.removeEventListener("resize", syncViewport);
    };
  }, [currentPage]);

  useEffect(() => {
    // 최초 데이터 로드와 "다시 불러오기"를 담당하는 effect다.
    // 캐시 -> 원격 새로고침 -> 실패 시 fallback 순서로 동작해
    // 시연 중 네트워크가 불안정해도 앱이 완전히 깨지지 않게 한다.
    let isActive = true;

    async function loadCatalog() {
      const favoriteIds = readStoredFavoriteIds();
      const dataMode = getDataMode();
      const cachedCatalog = dataMode === "local" ? [] : readCatalogCache();

      setIsLoading(true);
      setLoadError(null);
      setCatalogNotice(null);

      if (cachedCatalog.length > 0) {
        const cachedCards = mergeFavoriteFlags(cachedCatalog, favoriteIds);

        if (isActive) {
          setCards(cachedCards);
          setSelectedCardId((previousValue) =>
            cachedCards.some((card) => card.id === previousValue) ? previousValue : cachedCards[0]?.id ?? null
          );
          setIsLoading(false);
          setIsStreamingCatalog(false);
          setHasLoadedFullCatalog(true);
          setLastAction(copy.actions.cachedCatalogLoaded(cachedCards.length));
        }
        return;
      }

      try {
        const remoteCards = dataMode === "local"
          ? cloneDefaultCards()
          : createPokemonShellCatalog();
        const nextCards = mergeFavoriteFlags(remoteCards, favoriteIds);

        if (!isActive) {
          return;
        }

        setCards(nextCards);
        setSelectedCardId((previousValue) =>
          nextCards.some((card) => card.id === previousValue) ? previousValue : nextCards[0]?.id ?? null
        );
        setIsLoading(false);
        setIsStreamingCatalog(false);
        setHasLoadedFullCatalog(dataMode === "local");
        setCatalogNotice(null);
        setLastAction(createCatalogStatusMessage(copy, nextCards.length));
      } catch (error) {
        const fallbackCards = mergeFavoriteFlags(cloneDefaultCards(), favoriteIds);

        if (!isActive) {
          return;
        }

        const nextCards = cachedCatalog.length > 0 ? mergeFavoriteFlags(cachedCatalog, favoriteIds) : fallbackCards;

        setCards(nextCards);
        setSelectedCardId((previousValue) =>
          nextCards.some((card) => card.id === previousValue) ? previousValue : nextCards[0]?.id ?? null
        );
        setIsLoading(false);
        setIsStreamingCatalog(false);
        setHasLoadedFullCatalog(true);
        setLoadError(null);
        setCatalogNotice(
          cachedCatalog.length > 0
            ? copy.notices.cachedCatalog
            : copy.notices.fallbackCatalog
        );
        setLastAction(`${copy.errors.loadingCardsTitle}. ${error.message}`);
      }
    }

    loadCatalog();

    return () => {
      isActive = false;
    };
  }, [catalogVersion]);

  useEffect(() => {
    let isActive = true;

    if (getDataMode() !== "remote" || hasLoadedFullCatalog || typeFilter === "all") {
      return () => {
        isActive = false;
      };
    }

    async function loadFullCatalogForTypeFilter() {
      const favoriteIds = cards.filter((card) => card.isFavorite).map((card) => card.id);

      setIsLoading(true);
      setCatalogNotice(null);
      setLastAction(copy.actions.typeFilterChanged(typeLabels[typeFilter] ?? typeFilter));

      try {
        const remoteCards = await fetchPokemonCatalog();

        if (!isActive) {
          return;
        }

        const nextCards = mergeFavoriteFlags(remoteCards, favoriteIds);

        setCards(nextCards);
        setHasLoadedFullCatalog(true);
        setIsLoading(false);
        setIsStreamingCatalog(false);
        setCatalogNotice(null);
        setLastAction(createCatalogStatusMessage(copy, nextCards.length));
        writeCatalogCache(remoteCards);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setIsLoading(false);
        setTypeFilter("all");
        setCatalogNotice(copy.notices.fallbackCatalog);
        setLastAction(`${copy.errors.loadingCardsTitle}. ${error.message}`);
      }
    }

    loadFullCatalogForTypeFilter();

    return () => {
      isActive = false;
    };
  }, [cards, copy, hasLoadedFullCatalog, typeFilter, typeLabels]);

  useEffect(() => {
    let isActive = true;

    if (getDataMode() !== "remote" || hasLoadedFullCatalog || typeFilter !== "all") {
      return () => {
        isActive = false;
      };
    }

    const targetNumbers = Array.from(new Set([
      ...(currentPage === "collection" ? collectionVisibleNumbers : []),
      ...(currentPage === "detail" && selectedCardNumber ? [selectedCardNumber] : []),
      ...(currentPage === "dashboard" && spotlightCardNumber ? [spotlightCardNumber] : []),
    ])).filter(Boolean);

    const missingNumbers = targetNumbers.filter((number) => {
      const targetCard = cards.find((card) => card.number === number);
      return targetCard && !targetCard.isHydrated && !hydratingCardNumbers[number];
    });

    if (missingNumbers.length === 0) {
      return () => {
        isActive = false;
      };
    }

    setHydratingCardNumbers((previousValue) => {
      const nextValue = { ...previousValue };
      missingNumbers.forEach((number) => {
        nextValue[number] = true;
      });
      return nextValue;
    });

    async function hydrateVisibleCards() {
      try {
        const hydratedCards = await fetchPokemonCardsByNumbers(missingNumbers);

        if (!isActive || hydratedCards.length === 0) {
          return;
        }

        setCards((previousCards) => mergeCardsByNumber(previousCards, hydratedCards));
      } catch {
        // Collection shell hydration is a progressive enhancement. If a batch fails,
        // the shell cards can remain visible and try again on a later pass.
        if (isActive) {
          setCatalogNotice(copy.notices.fallbackCatalog);
        }
      } finally {
        if (!isActive) {
          return;
        }

        setHydratingCardNumbers((previousValue) => {
          const nextValue = { ...previousValue };
          missingNumbers.forEach((number) => {
            delete nextValue[number];
          });
          return nextValue;
        });
      }
    }

    hydrateVisibleCards();

    return () => {
      isActive = false;
    };
  }, [
    cards,
    collectionVisibleNumbers,
    copy,
    currentPage,
    hasLoadedFullCatalog,
    selectedCardNumber,
    spotlightCardNumber,
    typeFilter,
  ]);

  useEffect(() => {
    // 즐겨찾기는 사용자의 개인 상태이므로 카드 배열이 바뀔 때마다 따로 저장한다.
    if (!canUseLocalStorage()) {
      return;
    }

    const favoriteIds = cards.filter((card) => card.isFavorite).map((card) => card.id);
    localStorage.setItem("card-showcase-favorites", JSON.stringify(favoriteIds));
  }, [cards]);

  useEffect(() => {
    // 설정도 앱 전역 상태이기 때문에 새로고침 후 복원할 수 있도록 저장한다.
    if (!canUseLocalStorage()) {
      return;
    }

    localStorage.setItem("card-showcase-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let isActive = true;

    if (getDataMode() !== "remote" || settings.locale === "en") {
      return () => {
        isActive = false;
      };
    }

    const targetNumbers = Array.from(new Set([
      ...(currentPage === "collection" ? collectionVisibleSlice.map((card) => card.number) : []),
      ...(currentPage === "detail" && selectedCardBase ? [selectedCardBase.number] : []),
      ...(currentPage === "dashboard" && spotlightCard ? [spotlightCard.number] : []),
    ])).filter(Boolean);
    const missingNumbers = targetNumbers.filter((number) => (
      !getLocalPokemonName(settings.locale, number)
      && !localizedNamesByLocale?.[settings.locale]?.[number]
    ));

    if (missingNumbers.length === 0) {
      return () => {
        isActive = false;
      };
    }

    async function loadLocalizedNames() {
      try {
        const nextNames = await fetchPokemonLocalizedNames(missingNumbers, settings.locale);

        if (!isActive || Object.keys(nextNames).length === 0) {
          return;
        }

        setLocalizedNamesByLocale((previousValue) => ({
          ...previousValue,
          [settings.locale]: {
            ...(previousValue[settings.locale] ?? {}),
            ...nextNames,
          },
        }));
      } catch {
        // Species name localization is optional UI enrichment. If this request fails,
        // the card browser can safely continue showing the English fallback names.
      }
    }

    loadLocalizedNames();

    return () => {
      isActive = false;
    };
  }, [
    collectionVisibleSlice,
    currentPage,
    localizedNamesByLocale,
    selectedCardBase,
    settings.locale,
    spotlightCard,
  ]);

  useEffect(() => {
    // 목록은 가볍게, 상세는 풍부하게 가져오기 위한 2단계 로딩 effect다.
    // selectedCardBase가 바뀔 때만 해당 카드의 상세 데이터를 추가로 요청한다.
    let isActive = true;

    if (!selectedCardBase) {
      setIsDetailLoading(false);
      setDetailError(null);
      return () => {
        isActive = false;
      };
    }

    if (detailById[selectedCardBase.id]) {
      setIsDetailLoading(false);
      setDetailError(null);
      return () => {
        isActive = false;
      };
    }

    if (getDataMode() === "local") {
      setDetailById((previousValue) => ({
        ...previousValue,
        [selectedCardBase.id]: createLocalDetail(selectedCardBase),
      }));
      setIsDetailLoading(false);
      setDetailError(null);
      return () => {
        isActive = false;
      };
    }

    async function loadDetail() {
      setIsDetailLoading(true);
      setDetailError(null);

      try {
        const nextDetail = await fetchPokemonDetail(selectedCardBase);

        if (!isActive) {
          return;
        }

        setDetailById((previousValue) => ({
          ...previousValue,
          [selectedCardBase.id]: nextDetail,
        }));
        setIsDetailLoading(false);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setIsDetailLoading(false);
        setDetailError(copy.errors.detailUnavailable(selectedCardBase.displayName ?? selectedCardBase.name));
        setDetailById((previousValue) => ({
          ...previousValue,
          [selectedCardBase.id]: createLocalDetail(selectedCardBase),
        }));
        setLastAction(`${copy.actions.detailFallback(selectedCardBase.displayName ?? selectedCardBase.name)} ${error.message}`);
      }
    }

    loadDetail();

    return () => {
      isActive = false;
    };
  }, [detailById, selectedCardBase]);

  function handleNavigate(page) {
    // 상세 페이지는 선택 카드가 없으면 의미가 없으므로,
    // 직접 들어오려 하면 컬렉션으로 돌려보낸다.
    if (page === "detail" && !selectedCardId) {
      setCurrentPage("collection");
      return;
    }

    setCurrentPage(page);
  }

  function handleSelectCard(cardId) {
    const target = cards.find((card) => card.id === cardId);

    if (!target) {
      return;
    }

    setSelectedCardId(cardId);
    setLastAction(copy.actions.selectedCard(target.displayName ?? target.name));
  }

  function handleSelectAndOpen(cardId) {
    handleSelectCard(cardId);
    setCurrentPage("detail");
  }

  function handleToggleFavorite(cardId) {
    // 즐겨찾기 변경은 카드 데이터 자체에 기록되지만,
    // 실제로는 대시보드 KPI, 컬렉션 필터, 상세 버튼 상태까지 연쇄적으로 영향을 준다.
    let nextAction = "Updated a saved card state.";

    setCards((previousCards) =>
      previousCards.map((card) => {
        if (card.id !== cardId) {
          return card;
        }

        const nextFavorite = !card.isFavorite;
        nextAction = nextFavorite
          ? copy.actions.savedCard(resolveCardDisplayName(card, settings.locale, localizedNamesByLocale))
          : copy.actions.removedSavedCard(resolveCardDisplayName(card, settings.locale, localizedNamesByLocale));

        return {
          ...card,
          isFavorite: nextFavorite,
        };
      })
    );

    setLastAction(nextAction);
  }

  function handleDefaultPageChange(event) {
    const nextPage = event.target.value;

    setSettings((previousValue) => ({
      ...previousValue,
      defaultPage: nextPage,
    }));
    setCurrentPage(nextPage);
    setLastAction(copy.actions.defaultPageChanged(pageItems[nextPage]?.label ?? nextPage));
  }

  function handleDefaultSortChange(event) {
    const nextSortMode = event.target.value;

    setSettings((previousValue) => ({
      ...previousValue,
      defaultSortMode: nextSortMode,
    }));
    setSortMode(nextSortMode);
    setLastAction(copy.actions.defaultSortChanged(copy.sortOptions[nextSortMode] ?? nextSortMode));
  }

  function handleTiltToggle(event) {
    const nextValue = Boolean(event.target.checked);

    setSettings((previousValue) => ({
      ...previousValue,
      tiltEnabled: nextValue,
    }));
    setLastAction(nextValue ? copy.actions.tiltEnabled : copy.actions.tiltDisabled);
  }

  function handleGlareToggle(event) {
    const nextValue = Boolean(event.target.checked);

    setSettings((previousValue) => ({
      ...previousValue,
      glareEnabled: nextValue,
    }));
    setLastAction(nextValue ? copy.actions.glareEnabled : copy.actions.glareDisabled);
  }

  function handleHighResToggle(event) {
    const nextValue = Boolean(event.target.checked);

    setSettings((previousValue) => ({
      ...previousValue,
      highResImage: nextValue,
    }));
    setLastAction(nextValue ? copy.actions.highResEnabled : copy.actions.highResDisabled);
  }

  function handleLocaleChange(event) {
    const nextLocale = resolveSupportedLocale(event.target.value);
    const nextCopy = getLocaleMessages(nextLocale);

    setSettings((previousValue) => ({
      ...previousValue,
      locale: nextLocale,
    }));
    setLastAction(nextCopy.actions.languageChanged(
      LANGUAGE_OPTIONS.find((option) => option.value === nextLocale)?.label ?? nextLocale
    ));
  }

  function handleResetDemo() {
    // 설정, 필터, 선택 상태를 모두 초기화해 발표 중 언제든 기본 시연 상태로 돌아갈 수 있게 한다.
    const nextSettings = { ...DEFAULT_SETTINGS, locale: settings.locale };
    const nextCards = cards.map((card) => ({
      ...card,
      isFavorite: false,
    }));

    setCards(nextCards);
    setCurrentPage(nextSettings.defaultPage);
    setSearchKeyword("");
    setTypeFilter("all");
    setFavoritesOnly(false);
    setSortMode(nextSettings.defaultSortMode);
    setCollectionViewport(resetCollectionPage);
    setSettings(nextSettings);
    setLoadError(null);
    setDetailError(null);
    setCatalogNotice(null);
    setHasLoadedFullCatalog(getDataMode() === "local");
    setHydratingCardNumbers({});
    setLastAction(copy.actions.resetShowcase);
  }

  function handleRetryLoad() {
    // 다시 불러오기는 catalogVersion만 증가시켜
    // 카탈로그 로드 effect를 다시 실행시키는 단순한 방식으로 구현한다.
    setDetailById({});
    setHasLoadedFullCatalog(getDataMode() === "local");
    setHydratingCardNumbers({});
    setCatalogVersion((previousValue) => previousValue + 1);
    setLastAction(copy.actions.reloadingDataset);
  }

  function handleSelectNext() {
    if (visibleCards.length === 0) {
      return;
    }

    const currentIndex = getCardIndex(visibleCards, selectedCardId);
    const nextIndex = currentIndex === -1 || currentIndex === visibleCards.length - 1 ? 0 : currentIndex + 1;
    handleSelectCard(visibleCards[nextIndex].id);
  }

  function handlePointerMove(event) {
    // 포인터 위치를 0~1 범위로 정규화한 뒤,
    // 카드 기울기와 광택 위치를 계산한다.
    // 이 값들은 React-like 상태가 아니라 CSS 변수로만 전달된다.
    const element = event.currentTarget;

    if (!element || typeof element.getBoundingClientRect !== "function") {
      return;
    }

    const rect = element.getBoundingClientRect();
    const relativeX = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const relativeY = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
    const rotateY = (relativeX - 0.5) * 18;
    const rotateX = (0.5 - relativeY) * 16;

    applyInteractiveStyle(element, {
      tiltEnabled: settings.tiltEnabled,
      glareEnabled: settings.glareEnabled,
      rotateX,
      rotateY,
      glareRotation: Math.round((relativeX - 0.5) * 22),
      surfaceShift: Math.round((relativeY - 0.5) * 12),
      shineShiftX: Math.round((relativeX - 0.5) * 28),
      shineShiftY: Math.round((relativeY - 0.5) * 12),
      waveSkew: Math.round((relativeX - 0.5) * 10),
      holoX: Math.round(relativeX * 100),
      holoY: Math.round(relativeY * 100),
      sparkleOpacity: (0.34 + Math.abs(relativeX - 0.5) * 0.42 + Math.abs(relativeY - 0.5) * 0.22).toFixed(3),
    });
  }

  function handlePointerLeave(event) {
    // 커서가 카드 밖으로 나가면 시각 효과만 기본값으로 되돌린다.
    // 앱의 데이터 상태(cards, selectedCardId 등)는 건드리지 않는다.
    const element = event.currentTarget;

    applyInteractiveStyle(element, {
      tiltEnabled: false,
      glareEnabled: settings.glareEnabled,
      rotateX: 0,
      rotateY: 0,
      glareRotation: -4,
      surfaceShift: 0,
      shineShiftX: 0,
      shineShiftY: 0,
      waveSkew: 0,
      holoX: 50,
      holoY: 50,
      glareOpacity: 0.34,
      glareStrength: 0.48,
      edgeGlowOpacity: 0.2,
      sparkleOpacity: 0.2,
    });
  }

  function renderCurrentPage() {
    // 이 함수는 상태 기반 다중 페이지 SPA의 핵심이다.
    // 실제로는 앱을 다시 mount하지 않고, currentPage 값에 따라 다른 페이지 VNode만 선택한다.
    if (isLoading) {
      return h("section", { className: "page-stack", id: "page-loading" },
        h("article", { className: "panel-card empty-detail-card" },
          h("h1", null, copy.actions.loadingLibrary),
          h("p", { id: "loading-state" }, copy.collection.description)
        )
      );
    }

    if (loadError) {
      return h("section", { className: "page-stack", id: "page-error" },
        h("article", { className: "panel-card empty-detail-card" },
          h("h1", null, copy.errors.loadingCardsTitle),
          h("p", { id: "error-state" }, loadError),
          h("button", {
            id: "retry-load-button",
            className: "primary-button",
            onClick: handleRetryLoad,
          }, copy.common.retry)
        )
      );
    }

    if (currentPage === "collection") {
      return h(CollectionPage, {
        onNavigate: handleNavigate,
        cards: collectionVisibleSlice,
        visibleCount: visibleCards.length,
        renderedCount: collectionVisibleSlice.length,
        totalCount: cards.length,
        cardsPerRow: collectionColumnCount,
        rowHeight: COLLECTION_ROW_HEIGHT,
        contentHeight: collectionContentHeight,
        windowOffset: collectionWindowOffset,
        windowKey: collectionWindowKey,
        searchKeyword,
        typeFilter,
        favoritesOnly,
        sortMode,
        typeLabels,
        copy,
        settings,
        selectedCardId,
        emptyMessage: copy.collection.emptyMessage,
        onViewportScroll: collectionHandlers.onViewportScroll,
        onSearchInput: collectionHandlers.onSearchInput,
        onTypeFilterChange: collectionHandlers.onTypeFilterChange,
        onFavoritesToggle: collectionHandlers.onFavoritesToggle,
        onSortChange: collectionHandlers.onSortChange,
        onSelectCard: handleSelectAndOpen,
        onToggleFavorite: handleToggleFavorite,
        onOpenCardClick: collectionHandlers.onOpenCardClick,
        onFavoriteCardClick: collectionHandlers.onFavoriteCardClick,
        onPointerMove: collectionPointerHandlers.onPointerMove,
        onPointerLeave: collectionPointerHandlers.onPointerLeave,
      });
    }

    if (currentPage === "detail") {
      return h(DetailPage, {
        card: selectedCard,
        relatedCards,
        typeLabels,
        copy,
        settings,
        isDetailLoading,
        detailError,
        onNavigate: handleNavigate,
        onSelectCard: handleSelectAndOpen,
        onToggleFavorite: handleToggleFavorite,
        onSelectNext: handleSelectNext,
        onPointerMove: handlePointerMove,
        onPointerLeave: handlePointerLeave,
      });
    }

    if (currentPage === "settings") {
      return h(SettingsPage, {
        pages: pageItems,
        copy,
        settings,
        onDefaultPageChange: handleDefaultPageChange,
        onDefaultSortChange: handleDefaultSortChange,
        onLocaleChange: handleLocaleChange,
        onTiltToggle: handleTiltToggle,
        onGlareToggle: handleGlareToggle,
        onHighResToggle: handleHighResToggle,
        onResetDemo: handleResetDemo,
      });
    }

    return h(DashboardPage, {
      totalCount: cards.length,
      favoriteCount,
      visibleCount: visibleCards.length,
      isStreamingCatalog,
      selectedCard,
      spotlightCard,
      lastAction,
      topTypeMessage,
      typeSummary,
      typeLabels,
      copy,
      settings,
      onNavigate: handleNavigate,
      onSelectCard: handleSelectAndOpen,
      onToggleFavorite: handleToggleFavorite,
      onPointerMove: handlePointerMove,
      onPointerLeave: handlePointerLeave,
    });
  }

  return h(AppShell, {
    currentPage,
    pages: pageItems,
    copy,
    onNavigate: handleNavigate,
    lastAction,
    catalogNotice,
    inspectorCard: selectedCard ?? spotlightCard,
    highResImage: settings.highResImage,
  }, renderCurrentPage());
}
