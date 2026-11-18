/**
 * MANIFESTAÇÃO CONCORRENTE NÃO TRANSMITE DUAS VEZES (D3).
 *
 * O defeito: a rota chamava `manifestarNaSefaz` antes de qualquer trava. Dois
 * cliques simultâneos transmitiam o mesmo 210210 duas vezes — a SEFAZ recusa o
 * segundo como duplicidade e o app grava a recusa como erro na timeline.
 *
 * O teste fixa a ordem nova:
 *  - evento já manifestado com sucesso → 200 replay, sem transmissão;
 *  - claim livre → transmite uma vez e libera;
 *  - claim perdido (outra chamada em curso) → 409, sem transmissão;
 *  - falha da SEFAZ → 502, linha de erro e claim liberado.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { manifestarNaSefaz } from "@/lib/fiscal/entrada";
import { carregarContextoSped } from "@/lib/fiscal/sped-payload";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/fiscal/entrada", () => ({ manifestarNaSefaz: vi.fn() }));
vi.mock("@/lib/fiscal/sped-payload", () => ({ carregarContextoSped: vi.fn() }));
vi.mock("@/lib/fiscal/provedor", () => ({ resolverProvedor: () => "spednfe" }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ENTRADA_ID = "11111111-1111-4111-8111-111111111111";

type Chamada = { tabela: string; op: string; valores?: Record<string, unknown> };

let chamadas: Chamada[] = [];

function entrada(over: Record<string, unknown> = {}) {
  return {
    id: ENTRADA_ID,
    chave: "35261012345678000199550010000012341000012345",
    nsu: 1,
    emitente_cnpj: "12345678000199",
    emitente_nome: "Fornecedor",
    emitente_ie: null,
    numero: 10,
    serie: "1",
    dh_emi: "2026-11-01",
    valor_total_cents: 1000,
    xml: "<nfe/>",
    itens_json: [],
    cobranca_json: [],
    manifestacao: null,
    manifestada_em: null,
    status: "nova",
    contact_id: null,
    estoque_processado_em: null,
    financeiro_processado_em: null,
    created_at: "2026-11-01T00:00:00.000Z",
    supplier_id: null,
    tipo_documento: "completa",
    situacao_fiscal: "sem_manifestacao",
    protocolo: null,
    ...over,
  };
}

function builder(
  tabela: string,
  responder: (ctx: Chamada) => unknown,
) {
  let op = "select";
  let valores: Record<string, unknown> | undefined;
  const q: Record<string, unknown> = {};
  q.select = () => q;
  for (const nome of ["eq", "is", "lt", "order", "limit", "in"]) q[nome] = () => q;
  q.update = (v: Record<string, unknown>) => {
    op = "update";
    valores = v;
    const chamada = { tabela, op, valores };
    chamadas.push(chamada);
    return q;
  };
  q.insert = (v: Record<string, unknown>) => {
    op = "insert";
    valores = v;
    const chamada = { tabela, op, valores };
    chamadas.push(chamada);
    return q;
  };
  const resposta = () => responder({ tabela, op, valores });
  q.single = () => Promise.resolve(resposta());
  q.maybeSingle = () => Promise.resolve(resposta());
  q.then = (ok: unknown, err: unknown) => Promise.resolve(resposta()).then(ok as never, err as never);
  return q;
}

function montar(over: {
  entrada?: Record<string, unknown>;
  jaManifestada?: { protocolo: string; cstat: string } | null;
  claimGanha?: boolean;
}) {
  chamadas = [];
  vi.mocked(createClient).mockResolvedValue({
    from: (tabela: string) =>
      builder(tabela, ({ op, valores }) => {
        if (tabela === "fiscal_entradas") {
          if (op === "select") return { data: over.entrada ?? entrada(), error: null };
          if (op === "update") {
            if (valores?.manifestacao_em_andamento_em === null) {
              return { data: null, error: null };
            }
            if (valores?.status === "manifestada") return { data: null, error: null };
            return over.claimGanha === false
              ? { data: [], error: null }
              : { data: [{ id: ENTRADA_ID }], error: null };
          }
        }
        if (tabela === "fiscal_settings") return { data: { provedor: "spednfe" }, error: null };
        if (tabela === "fiscal_manifestations") {
          if (op === "select") return { data: over.jaManifestada ?? null, error: null };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
  } as never);
}

async function manifestar() {
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/fiscal-entradas/${ENTRADA_ID}/manifestar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evento: "210210" }),
  });
  return POST(req, { params: Promise.resolve({ id: ENTRADA_ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: "user-1" },
  } as never);
  vi.mocked(carregarContextoSped).mockResolvedValue({
    orgId: ORG_ID,
    emitente: {
      uf: "SP",
      ambiente: "homologacao",
      emitente_documento: "12345678000199",
      ie: "1",
      certificado_path: "cert.pfx",
    },
    senhaCertificado: "senha",
  } as never);
  vi.mocked(manifestarNaSefaz).mockResolvedValue({
    ok: true,
    manifestacao: "ciencia",
    protocolo: "P-1",
    cstat: "135",
    erro: null,
  } as never);
});

describe("manifestar — concorrência", () => {
  it("evento já manifestado é replay: 200, sem transmissão e sem novo evento", async () => {
    montar({ jaManifestada: { protocolo: "P-0", cstat: "135" } });

    const res = await manifestar();
    expect(res.status).toBe(200);
    expect(manifestarNaSefaz).not.toHaveBeenCalled();
    expect(chamadas.some((c) => c.op === "insert")).toBe(false);
    const corpo = (await res.json()) as { data: { ja_existia?: boolean } };
    expect(corpo.data.ja_existia).toBe(true);
  });

  it("claim livre transmite uma vez e grava o evento", async () => {
    montar({ claimGanha: true });

    const res = await manifestar();
    expect(res.status).toBe(200);
    expect(manifestarNaSefaz).toHaveBeenCalledTimes(1);

    const insercoes = chamadas.filter((c) => c.tabela === "fiscal_manifestations" && c.op === "insert");
    expect(insercoes).toHaveLength(1);
    expect(insercoes[0]!.valores).toMatchObject({ resultado: "sucesso", protocolo: "P-1" });

    // Claim liberado (update com NULL).
    const liberacoes = chamadas.filter(
      (c) =>
        c.tabela === "fiscal_entradas" &&
        c.op === "update" &&
        c.valores?.manifestacao_em_andamento_em === null,
    );
    expect(liberacoes).toHaveLength(1);
  });

  it("claim perdido (outra chamada transmitindo) devolve 409 e não chama a SEFAZ", async () => {
    montar({ claimGanha: false });

    const res = await manifestar();
    expect(res.status).toBe(409);
    expect(manifestarNaSefaz).not.toHaveBeenCalled();
    expect(chamadas.some((c) => c.op === "insert")).toBe(false);
  });

  it("falha da SEFAZ grava erro e libera o claim", async () => {
    vi.mocked(manifestarNaSefaz).mockResolvedValue({
      ok: false,
      erro: "Sidecar fiscal inalcançável ou fora do contrato.",
      manifestacao: null,
      cstat: null,
      protocolo: null,
    } as never);
    montar({ claimGanha: true });

    const res = await manifestar();
    expect(res.status).toBe(502);

    const erro = chamadas.find(
      (c) => c.tabela === "fiscal_manifestations" && c.op === "insert",
    );
    expect(erro?.valores).toMatchObject({ resultado: "erro" });
    const liberacoes = chamadas.filter(
      (c) =>
        c.tabela === "fiscal_entradas" &&
        c.op === "update" &&
        c.valores?.manifestacao_em_andamento_em === null,
    );
    expect(liberacoes).toHaveLength(1);
    expect(audit).not.toHaveBeenCalled();
  });
});
