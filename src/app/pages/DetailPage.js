/*
 * Responsibility:
 * - 선택된 카드의 세부 정보를 중심으로 렌더링하는 상세 페이지를 담당한다.
 */

import { h } from "../../index.js";
import { PageHeader } from "../components/PageHeader.js";
import { SummaryCard } from "../components/SummaryCard.js";
import { CardShowcase } from "../components/CardShowcase.js";

function getBaseStatTotal(card) {
  if (!card.baseStats) {
    return null;
  }

  return Object.values(card.baseStats).reduce((sum, value) => sum + Number(value || 0), 0);
}

function renderBaseStatRows(card) {
  if (!card.baseStats) {
    return [];
  }

  return [
    ["HP", card.baseStats.hp],
    ["Attack", card.baseStats.attack],
    ["Defense", card.baseStats.defense],
    ["Sp. Atk", card.baseStats.specialAttack],
    ["Sp. Def", card.baseStats.specialDefense],
    ["Speed", card.baseStats.speed],
  ].map(([label, value]) =>
    h("li", {
      key: label,
      className: "detail-stat-row",
    },
      h("span", { className: "detail-stat-name" }, label),
      h("strong", { className: "detail-stat-value" }, String(value))
    )
  );
}

function renderTypeBadges(types, typeLabels) {
  return types.map((type) =>
    h("span", { key: type, className: `type-chip type-chip-${type}` }, typeLabels[type] ?? type)
  );
}

function renderRelatedCards(cards, onSelect) {
  return cards.map((card) =>
    h("button", {
      key: card.id,
      id: `detail-related-${card.id}`,
      className: "related-card-button",
      onClick: () => onSelect(card.id),
    }, card.displayName ?? card.name)
  );
}

function renderSpritePreview(card, copy) {
  const displayName = card.displayName ?? card.name;

  return h("article", { className: "panel-card sprite-preview-card", id: "detail-sprite-preview" },
    h("div", { className: "panel-heading" },
      h("h2", null, copy.detail.gameSpriteCard),
      h("p", null, copy.detail.gameSpriteDescription)
    ),
    h("div", { className: "sprite-preview-shell" },
      h("div", { className: "sprite-preview-card-frame" },
        h("img", {
          id: "detail-sprite-image",
          className: "detail-sprite-image",
          src: card.thumbUrl,
          alt: `${displayName} thumbnail`,
        }),
        h("div", { className: "sprite-preview-caption" },
          h("strong", { className: "sprite-preview-title" }, displayName),
          h("span", { className: "sprite-preview-meta" }, copy.detail.retroTexture)
        )
      )
    )
  );
}

export function DetailPage(props) {
  const baseStatTotal = props.card ? getBaseStatTotal(props.card) : null;

  if (!props.card) {
    return h("section", { id: "page-detail", className: "page-stack" },
      h(PageHeader, {
        kicker: props.copy.detail.kicker,
        title: props.copy.detail.noCardTitle,
        description: props.copy.detail.noCardDescription,
        actions: [
          {
            id: "detail-go-collection",
            label: props.copy.detail.openCollection,
            onClick: () => props.onNavigate("collection"),
          },
        ],
      }),
      h("article", { className: "panel-card empty-detail-card" },
        h("p", { id: "detail-empty-state", className: "empty-state" }, props.copy.detail.emptyMessage)
      )
    );
  }

  return h("section", { id: "page-detail", className: "page-stack" },
    h(PageHeader, {
      kicker: props.copy.detail.kicker,
      title: props.card.displayName ?? props.card.name,
      description: props.copy.detail.description,
      actions: [
        {
          id: "detail-back-to-collection",
          label: props.copy.detail.backToCollection,
          onClick: () => props.onNavigate("collection"),
          tone: "ghost",
        },
      ],
    }),
    h("section", { className: "detail-layout" },
      h("div", { className: "detail-showcase-stack" },
        h(CardShowcase, {
          card: props.card,
          tiltEnabled: props.settings.tiltEnabled,
          glareEnabled: props.settings.glareEnabled,
          highResImage: props.settings.highResImage,
          onPointerMove: props.onPointerMove,
          onPointerLeave: props.onPointerLeave,
        }),
        renderSpritePreview(props.card, props.copy)
      ),
      h("div", { className: "detail-side-panel" },
        h("section", { className: "detail-kpi-stack" },
          h(SummaryCard, {
            id: "detail-card-rarity",
            label: props.copy.detail.rarity,
            value: props.card.rarity,
            help: props.copy.detail.rarityHelp,
          }),
          h(SummaryCard, {
            id: "detail-card-bst",
            label: props.copy.detail.baseStatTotal,
            value: baseStatTotal !== null ? String(baseStatTotal) : "N/A",
            help: props.copy.detail.baseStatTotalHelp,
            tone: "warm",
          })
        ),
        h("article", { className: "panel-card detail-meta-card" },
          h("div", { className: "panel-heading" },
            h("h2", null, props.copy.detail.metadataTitle),
            h("p", null, props.copy.detail.metadataDescription)
          ),
          props.isDetailLoading
            ? h("p", { id: "detail-loading-state", className: "detail-flavor" }, props.copy.detail.loadingSpeciesStats)
            : null,
          props.detailError
            ? h("p", { id: "detail-error-state", className: "detail-flavor" }, props.detailError)
            : null,
          h("div", { id: "detail-card-types", className: "card-type-row detail-type-row" }, ...renderTypeBadges(props.card.types, props.typeLabels)),
          h("ul", { className: "insight-list detail-stat-list" },
            h("li", { id: "detail-stat-number" }, `${props.copy.detail.number} · ${props.card.number}`),
            h("li", { id: "detail-stat-height" }, `${props.copy.detail.height} · ${props.card.height}m`),
            h("li", { id: "detail-stat-weight" }, `${props.copy.detail.weight} · ${props.card.weight}kg`)
          ),
          props.card.baseStats
            ? h("div", { className: "detail-base-stats-block" },
              h("h3", { className: "detail-subtitle" }, props.copy.detail.speciesBaseStats),
              h("ul", { id: "detail-base-stats", className: "detail-base-stats-list" }, ...renderBaseStatRows(props.card))
            )
            : null,
          h("p", { id: "detail-card-flavor", className: "detail-flavor" }, props.card.flavor),
          h("div", { className: "detail-button-row" },
            h("button", {
              id: `detail-favorite-${props.card.id}`,
              className: props.card.isFavorite ? "primary-button" : "secondary-button",
              onClick: () => props.onToggleFavorite(props.card.id),
            }, props.card.isFavorite ? props.copy.common.removeFromSaved : props.copy.common.saveToFavorites),
            h("button", {
              id: "detail-next-card",
              className: "ghost-button",
              onClick: props.onSelectNext,
            }, props.copy.common.nextCard)
          )
        ),
        h("article", { className: "panel-card" },
          h("div", { className: "panel-heading" },
            h("h2", null, props.copy.detail.relatedCards),
            h("p", null, props.copy.detail.relatedDescription)
          ),
          h("div", { id: "detail-related-list", className: "related-card-row" }, ...renderRelatedCards(props.relatedCards, props.onSelectCard))
        )
      )
    )
  );
}
