/**
 * Quem manda o quê: a escolha do número de EXPEDIÇÃO contra a do número
 * COMERCIAL.
 *
 * As duas funções moram em `lib/automation/start-conversation.ts` e são o ponto
 * por onde passa todo envio automático — follow-up, campanha, venda automática,
 * aviso de rota. A regra que este teste protege é a separação pedida pelo dono:
 * o número marcado como "avisos de expedição" recebe o aviso de entrega, e o
 * comercial continua sendo o remetente de tudo o mais. Se as duas escolhas
 * voltarem a ser "a sessão mais antiga", a marcação na tela vira decoração.
 */
import { describe, expect, it } from "vitest";

import {
  sessaoParaAvisosDeExpedicao,
  sessaoProntaParaEnvio,
} from "@/lib/automation/start-conversation";

interface Linha {
  id: string;
  organization_id?: string;
  status?: string;
  metadata?: unknown;
  archived_at?: string | null;
}

/**
 * Dublê mínimo do cliente PostgREST: aplica `eq`/`is` de verdade e devolve as
 * linhas na ordem em que foram declaradas (o `order` é a ordem de `created_at`).
 * Um stub que devolvesse a primeira linha sempre mediria o stub, não a escolha.
 */
function fakeDb(linhas: Linha[]) {
  const cliente = {
    from: () => {
      const filtros: Array<[string, unknown]> = [];
      const api = {
        select: () => api,
        eq: (coluna: string, valor: unknown) => {
          filtros.push([coluna, valor]);
          return api;
        },
        is: (coluna: string, valor: unknown) => {
          filtros.push([coluna, valor]);
          return api;
        },
        order: () => api,
        limit: () => api,
        then: <R>(
          onOk?: (v: { data: Linha[]; error: null }) => R | PromiseLike<R>,
        ): PromiseLike<R> => {
          const data = linhas.filter((l) =>
            filtros.every(
              ([coluna, valor]) =>
                ((l as unknown as Record<string, unknown>)[coluna] ?? null) === valor,
            ),
          );
          return Promise.resolve({ data, error: null }).then(onOk);
        },
      };
      return api;
    },
  };
  return cliente as never;
}

const expedicao = (over: Partial<Linha> = {}): Linha => ({
  id: "canal-expedicao",
  organization_id: "org",
  status: "WORKING",
  metadata: { finalidade: "expedicao" },
  archived_at: null,
  ...over,
});

const comercial = (over: Partial<Linha> = {}): Linha => ({
  id: "canal-comercial",
  organization_id: "org",
  status: "WORKING",
  metadata: {},
  archived_at: null,
  ...over,
});

describe("sessaoProntaParaEnvio", () => {
  it("prefere o número comercial mesmo quando o de expedição é mais antigo", async () => {
    const db = fakeDb([expedicao(), comercial()]);
    expect(await sessaoProntaParaEnvio(db, "org")).toBe("canal-comercial");
  });

  it("usa o de expedição quando é o único número vivo — org nenhuma fica muda", async () => {
    const db = fakeDb([expedicao()]);
    expect(await sessaoProntaParaEnvio(db, "org")).toBe("canal-expedicao");
  });

  it("WORKING vence parado, mesmo o parado sendo comercial", async () => {
    const db = fakeDb([
      comercial({ status: "STOPPED" }),
      expedicao({ id: "e", status: "WORKING" }),
    ]);
    expect(await sessaoProntaParaEnvio(db, "org")).toBe("e");
  });

  it("sem nenhum WORKING, cai no não arquivado", async () => {
    const db = fakeDb([comercial({ status: "STOPPED" })]);
    expect(await sessaoProntaParaEnvio(db, "org")).toBe("canal-comercial");
  });

  it("canal arquivado não é escolhido", async () => {
    const db = fakeDb([comercial({ archived_at: "2026-11-04T20:45:00Z" })]);
    expect(await sessaoProntaParaEnvio(db, "org")).toBeNull();
  });
});

describe("sessaoParaAvisosDeExpedicao", () => {
  it("usa o número marcado, mesmo com o comercial vivo e mais antigo", async () => {
    const db = fakeDb([comercial(), expedicao()]);
    expect(await sessaoParaAvisosDeExpedicao(db, "org")).toEqual({
      id: "canal-expedicao",
      dedicado: true,
    });
  });

  it("sem número marcado, avisa pelo comercial e diz que NÃO é dedicado", async () => {
    const db = fakeDb([comercial()]);
    expect(await sessaoParaAvisosDeExpedicao(db, "org")).toEqual({
      id: "canal-comercial",
      dedicado: false,
    });
  });

  /**
   * O aviso de rota não pode ficar esperando o número de expedição voltar: se
   * ele está parado, a mensagem só ficaria enfileirada e a carga já saiu.
   */
  it("número dedicado parado não é usado: cai no comercial", async () => {
    const db = fakeDb([expedicao({ status: "STOPPED" }), comercial()]);
    expect(await sessaoParaAvisosDeExpedicao(db, "org")).toEqual({
      id: "canal-comercial",
      dedicado: false,
    });
  });

  it("dedicado arquivado não conta", async () => {
    const db = fakeDb([expedicao({ archived_at: "2026-11-04T20:45:00Z" }), comercial()]);
    expect(await sessaoParaAvisosDeExpedicao(db, "org")).toEqual({
      id: "canal-comercial",
      dedicado: false,
    });
  });

  it("org sem canal nenhum devolve null — o chamador pula o aviso em vez de estourar", async () => {
    const db = fakeDb([]);
    expect(await sessaoParaAvisosDeExpedicao(db, "org")).toBeNull();
  });
});
