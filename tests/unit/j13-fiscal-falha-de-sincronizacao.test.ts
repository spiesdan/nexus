/**
 * J13 — OPERAÇÕES FISCAIS E TRATAMENTO DE FALHA DE SINCRONIZAÇÃO.
 *
 * `13-jornadas.md` §J13 mede 3 de 4 e nomeia a lacuna: "'Tratamento de falhas de
 * sincronização' é exatamente o que a tela `sincronizacoes` deveria provar, e
 * não há spec que force uma falha de sincronização e verifique a recuperação
 * pela tela."
 *
 * Este arquivo prova a METADE do servidor, sem navegador e sem SEFAZ:
 *
 *   1. o resultado do sincronizador vira o status HTTP certo — e o caso
 *      "SEFAZ inalcançável" é 502, não 200 com zero notas (o modo de falha que
 *      faria o operador achar que sincronizou e não veio nada porque não havia);
 *   2. falha PARCIAL não é descartada: o que entrou é respondido com os erros;
 *   3. o histórico lista a linha que falhou, com a mensagem da próxima
 *      tentativa — é o que a tela de sincronizações mostra.
 *
 * A prova de que o BOTÃO mostra o aviso (656) e o erro é
 * `j13-botao-sincronizar.test.tsx`. Nenhum dos dois emite, cancela ou
 * inutiliza NF-e: `sincronizarEntrada` é dublado, e o que se mede é a tradução
 * do resultado, não a SEFAZ.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { sincronizarEntrada } from "@/lib/fiscal/entrada-sync";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/fiscal/entrada-sync", () => ({ sincronizarEntrada: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OPERADOR = "11111111-1111-4111-8111-111111111111";

/** O resultado canônico do sincronizador; cada teste muda só o que mede. */
const RESULTADO_BASE = {
  ok: true,
  codigo: null as string | null,
  motivo: null as string | null,
  importados: 0,
  atualizados: 0,
  erros: 0,
  nsuFinal: 0,
  maxNsu: 0,
  aviso: null as string | null,
  cstat: null as string | null,
  proximaTentativa: null as string | null,
};

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: OPERADOR, email: "operador@j13.test" },
    org: { orgId: ORG, role: "agent", name: "Org J13" },
  } as never);
  vi.mocked(sincronizarEntrada).mockReset();
  vi.mocked(audit).mockClear();
});

function pedidoSincronizar(): NextRequest {
  return new NextRequest("http://localhost/api/v1/fiscal-entradas", { method: "POST" });
}

describe("POST /api/v1/fiscal-entradas — o resultado da sincronização", () => {
  it("sucesso responde o que veio e audita a execução", async () => {
    vi.mocked(sincronizarEntrada).mockResolvedValue({
      ...RESULTADO_BASE,
      importados: 4,
      atualizados: 2,
      nsuFinal: 120,
      maxNsu: 300,
    } as never);
    const { POST } = await import("@/app/api/v1/fiscal-entradas/route");

    const res = await POST(pedidoSincronizar());
    const json = (await res.json()) as { data: { novas: number; atualizadas: number } };

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ novas: 4, atualizadas: 2 });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "fiscal_entrada.sincronizada", organizationId: ORG }),
    );
  });

  it("duas execuções concorrentes: a perdedora recebe 409, não uma segunda consulta", async () => {
    vi.mocked(sincronizarEntrada).mockResolvedValue({
      ...RESULTADO_BASE,
      ok: false,
      codigo: "lock",
      motivo: "Sincronização em andamento.",
    } as never);
    const { POST } = await import("@/app/api/v1/fiscal-entradas/route");

    const res = await POST(pedidoSincronizar());
    const json = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("state_conflict");
    expect(audit).not.toHaveBeenCalled();
  });

  it("fiscal não configurado é 422 com motivo — a tela sabe o que configurar", async () => {
    vi.mocked(sincronizarEntrada).mockResolvedValue({
      ...RESULTADO_BASE,
      ok: false,
      codigo: "config",
      motivo: "Emitente sem certificado.",
    } as never);
    const { POST } = await import("@/app/api/v1/fiscal-entradas/route");

    const res = await POST(pedidoSincronizar());
    const json = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(422);
    expect(json.error.code).toBe("fiscal_nao_configurado");
    expect(json.error.message).toContain("certificado");
  });

  it("SEFAZ inalcançável é 502 — nunca 200 com zero notas", async () => {
    vi.mocked(sincronizarEntrada).mockResolvedValue({
      ...RESULTADO_BASE,
      ok: false,
      motivo: "Não foi possível falar com a SEFAZ.",
      cstat: "109",
    } as never);
    const { POST } = await import("@/app/api/v1/fiscal-entradas/route");

    const res = await POST(pedidoSincronizar());
    const json = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("upstream_unavailable");
    expect(json.error.message).toContain("SEFAZ");
    // Falhou antes de entrar qualquer nota: não há execução bem-sucedida a auditar.
    expect(audit).not.toHaveBeenCalled();
  });

  it("falha PARCIAL devolve 200 com o que entrou e quantos falharam", async () => {
    // Este é o caso que o modo binário "ok ou erro" apagaria: três notas
    // entraram, uma deu erro. Responder 502 esconderia as três do operador.
    vi.mocked(sincronizarEntrada).mockResolvedValue({
      ...RESULTADO_BASE,
      ok: false,
      importados: 3,
      erros: 1,
      motivo: "1 documento não pôde ser gravado.",
    } as never);
    const { POST } = await import("@/app/api/v1/fiscal-entradas/route");

    const res = await POST(pedidoSincronizar());
    const json = (await res.json()) as { data: { novas: number; erros: number } };

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ novas: 3, erros: 1 });
    expect(audit).toHaveBeenCalled();
  });

  it("bloqueio da SEFAZ (656) chega à tela com hora da próxima tentativa", async () => {
    const proxima = "2026-11-18T15:00:00.000Z";
    vi.mocked(sincronizarEntrada).mockResolvedValue({
      ...RESULTADO_BASE,
      ok: true,
      cstat: "656",
      aviso: "AGUARDAR_1H",
      proximaTentativa: proxima,
    } as never);
    const { POST } = await import("@/app/api/v1/fiscal-entradas/route");

    const res = await POST(pedidoSincronizar());
    const json = (await res.json()) as {
      data: { cstat: string; aviso: string; proximaTentativa: string };
    };

    // 656 é chamada BEM-SUCEDIDA com conselho: a resposta precisa carregar a
    // hora, porque é dela que o botão monta "Próxima tentativa a partir de…".
    // Se isto virasse 502, o operador cairia num erro genérico e clicaria de
    // novo até tomar bloqueio — o defeito que o aviso existe para evitar.
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ cstat: "656", aviso: "AGUARDAR_1H", proximaTentativa: proxima });
  });

  it("permissão negada devolve a resposta do guard e não chama o sincronizador", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "Papel insuficiente.", 403),
    } as never);
    const { POST } = await import("@/app/api/v1/fiscal-entradas/route");

    const res = await POST(pedidoSincronizar());

    expect(res.status).toBe(403);
    expect(sincronizarEntrada).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/fiscal-sincronizacoes — o histórico mostra a falha", () => {
  function duble(linhas: unknown[], erro: unknown = null, contagem = 0) {
    const filtros: Array<[string, unknown]> = [];
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.select = () => q;
    q.eq = (coluna: string, valor: unknown) => {
      filtros.push([coluna, valor]);
      return q;
    };
    q.order = () => q;
    q.range = () =>
      Promise.resolve({ data: erro ? null : linhas, error: erro, count: contagem });
    return { q, filtros };
  }

  it("lista a linha que falhou com resultado, cStat e a mensagem da próxima tentativa", async () => {
    const { q } = duble(
      [
        {
          id: "log-1",
          origem: "cron",
          resultado: "bloqueado",
          cstat: "656",
          mensagem: "Consumo indevido. Próxima tentativa após 15:00.",
          docs_erro: 0,
        },
      ],
      null,
      1,
    );
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);
    const { GET } = await import("@/app/api/v1/fiscal-sincronizacoes/route");

    const res = await GET(new NextRequest("http://localhost/api/v1/fiscal-sincronizacoes"));
    const json = (await res.json()) as {
      data: Array<{ resultado: string; cstat: string; mensagem: string }>;
      meta: { total: number };
    };

    expect(res.status).toBe(200);
    expect(json.data[0]).toMatchObject({ resultado: "bloqueado", cstat: "656" });
    expect(json.data[0]!.mensagem).toContain("Próxima tentativa");
    expect(json.meta.total).toBe(1);
  });

  it("histórico vazio é lista vazia e total 0 — não erro", async () => {
    const { q } = duble([], null, 0);
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);
    const { GET } = await import("@/app/api/v1/fiscal-sincronizacoes/route");

    const res = await GET(new NextRequest("http://localhost/api/v1/fiscal-sincronizacoes"));
    const json = (await res.json()) as { data: unknown[]; meta: { total: number } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.meta.total).toBe(0);
  });

  it("filtro de resultado é aplicado na organização ativa (a tela consegue ver só as falhas)", async () => {
    const { q, filtros } = duble([], null, 0);
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);
    const { GET } = await import("@/app/api/v1/fiscal-sincronizacoes/route");

    await GET(new NextRequest("http://localhost/api/v1/fiscal-sincronizacoes?resultado=erro"));

    expect(filtros).toContainEqual(["organization_id", ORG]);
    expect(filtros).toContainEqual(["resultado", "erro"]);
  });

  it("erro do banco é 500 com código — a tela não desenha histórico vazio como se não houvesse nada", async () => {
    const { q } = duble([], { message: "permission denied for table fiscal_sync_logs" });
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);
    const { GET } = await import("@/app/api/v1/fiscal-sincronizacoes/route");

    const res = await GET(new NextRequest("http://localhost/api/v1/fiscal-sincronizacoes"));
    const json = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("internal_error");
  });

  it("viewer lê o histórico; quem dispara é o botão (agent)", async () => {
    const { q } = duble([], null, 0);
    vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);
    const { GET } = await import("@/app/api/v1/fiscal-sincronizacoes/route");

    await GET(new NextRequest("http://localhost/api/v1/fiscal-sincronizacoes"));

    expect(requireRole).toHaveBeenCalledWith(
      "viewer",
      expect.objectContaining({ resource: "fiscal-sincronizacoes" }),
    );
  });
});
