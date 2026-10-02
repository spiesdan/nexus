/**
 * A tela de atualização não pode ser sequestrada por uma falha que a
 * instalação já deixou para trás.
 *
 * Medido em produção (2026-10-02): o run de rollback de 27/09 (alvo v1.56.0)
 * segurou a tela por dias depois de um update manual — a 1.18.0 publicada
 * ficou sem botão, atrás de uma falha que já não descrevia nada. O que estes
 * casos vigiam:
 *
 *  1. falha ANTIGA (heartbeat já foi para outra versão) não renderiza a tela de
 *     falha — o diagnóstico desce para um aviso e as telas em dia voltam;
 *  2. falha que AINDA descreve o host continua com a tela de saída (comando e
 *     log), sem o botão que se recusaria a trocar imagem nenhuma;
 *  3. falha antiga com versão nova disponível entrega o BOTÃO de volta — era
 *     exatamente o botão que sumia.
 *
 * Os dados são a forma EXATA que `/api/v1/system/version` entrega depois da
 * correção do override: `current_version` é a versão rodando de verdade.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SystemVersion } from "@/hooks/system/useSystemVersion";
import { useSystemVersion } from "@/hooks/system/useSystemVersion";
import { UpdatePanel } from "@/app/app/settings/atualizacao/_components/UpdatePanel";

vi.mock("@/hooks/system/useSystemVersion", () => ({
  useSystemVersion: vi.fn(),
}));

// Identidade: os textos da tela são as próprias chaves, então o que se afirma
// aqui é o que o dono lê em português.
vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => (chave: string) => chave,
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

function pintar(data: SystemVersion) {
  vi.mocked(useSystemVersion).mockReturnValue({ data, isError: false } as never);
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <UpdatePanel />
    </QueryClientProvider>,
  );
}

/** O caso medido em produção: rollback antigo, host já na 1.18.0. */
const FALHA_ANTIGA_EM_DIA: SystemVersion = {
  current_version: "v1.18.0",
  is_owner: true,
  latest_version: "1.18.0",
  update_available: false,
  off_release: false,
  compare_failed: false,
  has_known_release: true,
  agent_online: true,
  notes: null,
  run: {
    id: "run-1",
    status: "failed_rolled_back",
    last_step: "codigo",
    from_version: "d4416bfe4",
    to_version: "v1.56.0",
    log_tail: "fatal: cannot lock ref HEAD",
  },
};

/** Rollback recém-cumprido: o host está exatamente onde a falha deixou. */
const FALHA_VIGENTE: SystemVersion = {
  current_version: "1.0.0",
  is_owner: true,
  latest_version: "1.1.0",
  update_available: true,
  off_release: false,
  compare_failed: false,
  has_known_release: true,
  agent_online: true,
  notes: null,
  run: {
    id: "run-2",
    status: "failed_rolled_back",
    last_step: "codigo",
    from_version: "1.0.0",
    to_version: "1.1.0",
    log_tail: "docker pull falhou",
  },
};

const FALHA_ANTIGA_COM_NOVA: SystemVersion = {
  ...FALHA_ANTIGA_EM_DIA,
  latest_version: "1.19.0",
  update_available: true,
  notes: { requires_attention: [], sections: [], complete: true },
};

describe("UpdatePanel — falha antiga não sequestra a tela", () => {
  it("instalação que já foi adiante vira tela em dia + aviso, sem tela de falha", () => {
    pintar(FALHA_ANTIGA_EM_DIA);

    expect(
      screen.getByRole("heading", { name: /Você está na versão 1\.18\.0/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /não deu certo/i })).toBeNull();
    expect(screen.getByText(/É a mais recente\. Não há nada a fazer\./)).toBeInTheDocument();

    // O diagnóstico não some: desce para o aviso, com o log à mão.
    expect(screen.getByText(/Tentativa antiga/)).toBeInTheDocument();
    expect(screen.getByText(/desde então o sistema foi adiante por conta própria/)).toBeInTheDocument();
    expect(screen.getByText(/fatal: cannot lock ref HEAD/)).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /Atualizar agora/i })).toBeNull();
  });

  it("falha que ainda descreve o host mantém a tela de saída — e sem o botão", () => {
    pintar(FALHA_VIGENTE);

    expect(
      screen.getByRole("heading", { name: /A atualização para a versão 1\.1\.0 não deu certo/i }),
    ).toBeInTheDocument();
    // O botão se recusaria a trocar imagem (o script responderia "já está na
    // versão mais recente") — o que resolve aqui é o comando de volta.
    expect(screen.queryByRole("button", { name: /Atualizar agora/i })).toBeNull();
    expect(screen.getByText(/bash hostgator-setup-kit\/update\.sh --to v1\.0\.0 --force/)).toBeInTheDocument();
    expect(screen.queryByText(/É a mais recente/)).toBeNull();
    expect(screen.queryByText(/Tentativa antiga/)).toBeNull();
  });

  it("falha antiga com versão nova disponível entrega o botão de volta", () => {
    pintar(FALHA_ANTIGA_COM_NOVA);

    expect(
      screen.getByRole("heading", { name: /Versão 1\.19\.0 disponível/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Atualizar agora/i })).toBeInTheDocument();
    expect(screen.getByText(/Tentativa antiga/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /não deu certo/i })).toBeNull();
  });
});
