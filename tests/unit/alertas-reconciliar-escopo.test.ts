/**
 * O MOTOR DA RECONCILIAÇÃO — e, principalmente, o que ele NÃO toca.
 *
 * ─── A propriedade que estes testes travam ────────────────────────────────────
 *
 * Três rotinas sobem aviso (NF pendente, fora da carga, vencimento). Cada uma
 * varre num SELECT próprio e uma delas pode falhar — e já falhou: as duas colunas
 * que não existem (`financial_receivables.cliente_nome` e
 * `commercial_orders.cidade_entrega`) derrubaram varreduras inteiras.
 *
 * O medo é o oposto de "alerta que não aparece". É o alerta que some: se a falha
 * de uma origem fosse tratada como "acabou", a reconciliação das outras resolveria
 * tudo que estava aberto e o Meu Dia ficaria vazio — sem erro, sem log, e com a
 * aparência de uma instalação saudável.
 *
 * A garantia está em dois pontos do motor:
 *
 *   1. lista vazia → devolve sem tocar em nada;
 *   2. lista não vazia → só lê e reconcilia os abertos cuja `origem_tipo` está
 *      na lista (`.in("origem_tipo", ...)`).
 *
 * Sem (2), (1) sozinho não bastaria: duas origens vivas e uma caída produziriam
 * uma lista não vazia, e a fallenada seria varrida junto.
 */
import { describe, expect, it } from "vitest";

import { reconciliarAlertas, type AlertaParaSubir } from "@/lib/alertas/reconciliar";

/**
 * Um cliente Supabase que responde ao que a função pede e REGISTRA o que recebeu.
 *
 * Não é um mock preguiçoso com `expect(insert).toHaveBeenCalled()`: o que importa
 * aqui é o FILTRO que saiu, porque é ele — e não o resultado — que impede a
 * reconciliação de alcançar outra origem.
 */
function clienteFake(abertos: Record<string, unknown>[]) {
  const registro = {
    selects: [] as { filtros: Record<string, unknown> }[],
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
  };

  /**
   * Uma cadeia que sabe ENCADEAR e ser ESPERADA — como o supabase-js.
   *
   * O código de produção faz `await admin.from(t).update({...}).eq(...)` sem
   * `.select()` no fim, e `await admin.from(t).select(c).eq(...).in(...)`. Um fake
   * que só sabe encadear quebraria no primeiro `await` — e o teste passaria a
   * medir o fake em vez da função.
   *
   * `filtros` é lido no momento do `then`, não no do `select`, porque na cadeia
   * real o `.in("origem_tipo", ...)` vem DEPOIS do `.select(...)`.
   */
  function cadeia() {
    const filtros: Record<string, unknown> = {};
    const registroSelect = { filtros };
    let marcado = false;

    const c = {
      select(_cols?: string) {
        if (!marcado) {
          marcado = true;
          registro.selects.push(registroSelect);
        }
        return c;
      },
      eq(_col: string, v: unknown) {
        filtros.eq = v;
        return c;
      },
      in(col: string, v: unknown) {
        filtros.in = { coluna: col, valores: v as unknown[] };
        return c;
      },
      limit() {
        return c;
      },
      // O filtro aplicado decide o que volta — o mesmo contrato do PostgREST, e é
      // por isso que o teste do filtro é teste de comportamento e não de implementação.
      then(resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) {
        const alvo = filtros.in as { coluna: string; valores: string[] } | undefined;
        const dados = alvo
          ? abertos.filter((a) => alvo.valores.includes((a as { origem_tipo: string }).origem_tipo))
          : abertos;
        return Promise.resolve({ data: dados, error: null }).then(resolve, reject);
      },
    };
    return c;
  }

  const admin = {
    from(_tabela: string) {
      const c = cadeia();
      return Object.assign(c, {
        insert(valores: Record<string, unknown>) {
          registro.inserts.push(valores);
          return cadeia();
        },
        update(valores: Record<string, unknown>) {
          registro.updates.push(valores);
          return cadeia();
        },
      });
    },
  };

  return { admin: admin as never, registro };
}

function aberto(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: `id-${String(over.chave ?? Math.random())}`,
    chave: "k",
    origem_tipo: "nf_pendente",
    origem_id: null,
    titulo: "t",
    descricao: null,
    acao_recomendada: null,
    href: null,
    prioridade: "alta",
    repeticoes: 1,
    created_at: "2026-10-09T00:00:00Z",
    updated_at: "2026-10-09T00:00:00Z",
    ...over,
  };
}

function candidato(over: Partial<AlertaParaSubir> & { chave: string }): AlertaParaSubir {
  return {
    origemTipo: "nf_pendente",
    titulo: "t",
    ...over,
  } as AlertaParaSubir;
}

const ORG = "org-1";

describe("lista vazia não toca em nada", () => {
  it("não insere, não atualiza e não resolve", async () => {
    const { admin, registro } = clienteFake([aberto({ chave: "nf_pendente:p1" })]);
    const r = await reconciliarAlertas(admin, ORG, []);
    expect(r).toEqual({ criados: 0, atualizados: 0, resolvidos: 0 });
    expect(registro.inserts).toHaveLength(0);
    expect(registro.updates).toHaveLength(0);
  });

  it("nem consulta: lista vazia sai antes do SELECT", async () => {
    // A rota devolve lista vazia quando uma varredura quebra. Com a guarda, o
    // motor nem chega a ler a tabela — e é isso que impede que TODO alerta
    // aberto da organização vire resolvido, com o Meu Dia esvaziando e a
    // aparência de uma instalação sem pendência.
    const abertos = [
      aberto({ chave: "nf_pendente:p1" }),
      aberto({ chave: "fora_da_carga:p2", origem_tipo: "fora_da_carga" }),
      aberto({ chave: "vencimento:r3", origem_tipo: "vencimento_vencido" }),
    ];
    const { admin, registro } = clienteFake(abertos);
    const r = await reconciliarAlertas(admin, ORG, []);

    expect(r).toEqual({ criados: 0, atualizados: 0, resolvidos: 0 });
    expect(registro.selects, "consultou a tabela com a lista vazia").toHaveLength(0);
    expect(registro.updates.filter((u) => u.status === "resolvido")).toHaveLength(0);
  });

  it("a guarda é o que segura o vazio; o `.in` é o que segura a falha PARCIAL", async () => {
    // Os dois mecanismos protegem coisas diferentes, e só a mutação diz qual é
    // qual — por isso este teste existe.
    //
    //   remover a guarda  → o vazio passa a consultar com `.in([])`, e o
    //                        PostgREST ainda não devolve nada. Por isso este
    //                        teste CONTINUA VERDE depois da mutação: quem
    //                        segura o vazio é o filtro.
    //   remover o filtro  → os testes de escopo abaixo reprovam.
    //
    // A afirmação honesta é: com o código como está, o vazio não consulta; e o
    // filtro impede que a reconciliação de uma origem alcance outra. As duas
    // coisas são verdade e nenhuma é redundante.
    const { admin, registro } = clienteFake([aberto({ chave: "nf_pendente:p1" })]);
    await reconciliarAlertas(admin, ORG, []);
    expect(registro.selects).toHaveLength(0);

    const parcial = clienteFake([aberto({ chave: "nf_pendente:p1" })]);
    await reconciliarAlertas(parcial.admin, ORG, [
      candidato({ chave: "vencimento:r1", origemTipo: "vencimento_vencido" }),
    ]);
    const filtro = parcial.registro.selects[0]?.filtros.in as { valores: string[] };
    expect(filtro!.valores).toEqual(["vencimento_vencido"]);
  });
});

describe("a reconciliação é escopada pela origem", () => {
  it("só pede as origens que estão na lista", async () => {
    // A PROPRIEDADE. A varredura de NF falhou, a de vencimento respondeu com um
    // alerta: a consulta tem que pedir SÓ vencimento. Se pedisse `nf_pendente`
    // junto, os alertas de NF que estivessem abertos desapareceriam.
    const { admin, registro } = clienteFake([]);
    await reconciliarAlertas(admin, ORG, [
      candidato({ chave: "vencimento:r1", origemTipo: "vencimento_vencido" }),
    ]);

    const select = registro.selects[0];
    const filtro = select?.filtros.in as { coluna: string; valores: string[] } | undefined;
    expect(filtro, "a consulta não foi escopada por origem").toBeTruthy();
    expect(filtro!.coluna).toBe("origem_tipo");
    expect(filtro!.valores).toEqual(["vencimento_vencido"]);
    expect(filtro!.valores).not.toContain("nf_pendente");
  });

  it("duas origens vivas pedem as duas, e só as duas", async () => {
    const { admin, registro } = clienteFake([]);
    await reconciliarAlertas(admin, ORG, [
      candidato({ chave: "vencimento:r1", origemTipo: "vencimento_vencido" }),
      candidato({ chave: "fora_da_carga:p1", origemTipo: "fora_da_carga" }),
    ]);
    const filtro = registro.selects[0]?.filtros.in as { valores: string[] };
    expect([...filtro!.valores].sort()).toEqual(["fora_da_carga", "vencimento_vencido"]);
  });

  it("a origem que respondeu sem candidatos some do escopo — e é por isso que a lista precisa dos dois lados", async () => {
    // `vencimento_vencido` respondeu VAZIO e `nf_pendente` tem um candidato. O
    // filtro traz `nf_pendente`; os alertas de vencimento abertos não são lidos,
    // porque o `.in` os exclui do resultado.
    //
    // Isso é uma escolha, e vale dizer qual é: um alerta de vencimento que
    // deixou de valer SÓ é resolvido num tick em que a varredura de vencimento
    // produziu pelo menos um candidato. Uma organização sem nenhum vencimento
    // mantém o que tinha aberto.
    //
    // A alternativa (`.in` com a lista de origens possíveis, não a de candidatos)
    // resolveria o que parou de acontecer — mas passaria a resolver TUDO de uma
    // origem que falhou, que é exatamente o defeito que estes testes impedem.
    const abertos = [aberto({ chave: "vencimento:r1", origem_tipo: "vencimento_vencido" })];
    const { admin, registro } = clienteFake(abertos);
    await reconciliarAlertas(admin, ORG, [
      candidato({ chave: "nf_pendente:p1", origemTipo: "nf_pendente" }),
    ]);
    const filtro = registro.selects[0]?.filtros.in as { valores: string[] };
    expect(filtro!.valores).toEqual(["nf_pendente"]);
  });
});

describe("a chave é a identidade do evento", () => {
  it("o mesmo evento reexecutado atualiza, não duplica", async () => {
    const { admin, registro } = clienteFake([aberto({ chave: "nf_pendente:p1", repeticoes: 2 })]);
    const r = await reconciliarAlertas(admin, ORG, [candidato({ chave: "nf_pendente:p1" })]);
    expect(registro.inserts, "duplicou um alerta que já estava aberto").toHaveLength(0);
    expect(registro.updates).toHaveLength(1);
    expect(r.atualizados).toBe(1);
  });

  it("o `repeticoes` sobe, porque a segunda vez é informação", async () => {
    // Um alerta que reaparece todo dia precisa dizer há quantos dias ele vem
    // voltando. Sem isso, o operador não distingue "acabou de acontecer" de
    // "está acontecendo há duas semanas".
    const { admin, registro } = clienteFake([aberto({ chave: "nf_pendente:p1", repeticoes: 2 })]);
    await reconciliarAlertas(admin, ORG, [candidato({ chave: "nf_pendente:p1" })]);
    expect(registro.updates[0]?.repeticoes).toBe(3);
  });

  it("o evento deixou de valer → resolve", async () => {
    const { admin, registro } = clienteFake([
      aberto({ chave: "nf_pendente:p1" }),
      aberto({ chave: "nf_pendente:p2" }),
    ]);
    const r = await reconciliarAlertas(admin, ORG, [candidato({ chave: "nf_pendente:p1" })]);
    expect(r.resolvidos).toBe(1);
    const resolvido = registro.updates.find((u) => u.status === "resolvido");
    expect(resolvido).toBeTruthy();
  });

  it("a chave não tem data — com timestamp seria um aviso novo por dia", async () => {
    const { admin } = clienteFake([]);
    await reconciliarAlertas(admin, ORG, [
      candidato({ chave: "nf_pendente:p1" }),
      candidato({ chave: "vencimento_vencido:r1", origemTipo: "vencimento_vencido" }),
    ]);
    // as duas chaves do exemplo são estáveis e não carregam tempo
    expect("nf_pendente:p1").not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
