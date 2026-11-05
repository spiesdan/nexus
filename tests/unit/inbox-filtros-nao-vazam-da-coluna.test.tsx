/**
 * O FILTRO DO INBOX NÃO PODE VAZAR DA COLUNA.
 *
 * Medido em produção (2026-11-05, org Bill Higiene, `2xl`): a coluna da lista
 * tem 299px, mas o bloco de filtros desenhava 316px — 17px para fora do cartão.
 * O interruptor "Apenas não lidos" nascia FORA do painel, meio escondido sob a
 * coluna da conversa, e o contador da última aba ("Automático 417") era
 * cortado. Em `xl` a sobra era pior: 45px (271px de coluna para 316px de
 * conteúdo).
 *
 * Duas causas, duas travas:
 *
 *   1. a grade do filtro não declarava coluna, então a trilha implícita `auto`
 *      era dimensionada pelo min-content do maior filho — a faixa de abas —
 *      em vez da largura da coluna. `grid-cols-1` força `minmax(0,1fr)`;
 *   2. as cinco abas com contador medem 316px e não cabem nos 267px de
 *      conteúdo nem em `2xl`. `flex-wrap` quebra a faixa em duas linhas em vez
 *      de empurrar o cartão para fora.
 *
 * Não é teste de gosto: é o par de classes que segura o defeito medido. Se
 * alguém removê-las, o vazamento volta — e o jsdom não sabe medir layout para
 * pegar isso sozinho.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    activeOrg: { orgId: "org-1", name: "Org", role: "admin", visibility_mode: "all" },
  }),
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  channelLabel: (c: { display_name: string }) => c.display_name,
  useChannelSessions: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: { unassigned: 418, mine: 3, all: 428, automatico: 417 } }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

const VALUE: InboxFiltersValue = { tab: "unassigned", search: "", onlyUnread: false };

describe("filtros do inbox cabem na coluna da lista", () => {
  it("a grade declara uma coluna que encolhe com o painel", () => {
    const { container } = render(<InboxFilters value={VALUE} onChange={() => {}} />);
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.className).toContain("grid-cols-1");
  });

  it("a faixa de abas quebra em vez de transbordar o cartão", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    const abas = screen.getByRole("tablist");
    expect(abas.className).toContain("flex-wrap");
  });
});
