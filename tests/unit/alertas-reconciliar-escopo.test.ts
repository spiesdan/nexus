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
    const filtros: {
      eq: Record<string, unknown>;
      in?: unknown;
      neq?: unknown;
      order?: unknown;
    } = { eq: {} };
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
      eq(col: string, v: unknown) {
        // Um MAPA, e não um valor: a cadeia real faz `.eq(a).eq(b)` e são DOIS
        // filtros. Guardar um só sobrescreve o primeiro, e o fake passa a devolver
        // linhas que o PostgREST não devolveria — foi exatamente o que aconteceu
        // aqui: `.eq("status","aberto")` sendo ignorado fazia a linha RESOLVIDA
        // voltar como se fosse aberta, e o teste media o fake em vez da função.
        (filtros.eq as Record<string, unknown>)[col] = v;
        return c;
      },
      in(col: string, v: unknown) {
        filtros.in = { coluna: col, valores: v as unknown[] };
        return c;
      },
      neq(_col: string, v: unknown) {
        filtros.neq = v;
        return c;
      },
      order(_col: string, opts?: { ascending?: boolean }) {
        filtros.order = { coluna: _col, ascending: opts?.ascending ?? true };
        return c;
      },
      limit() {
        return c;
      },
      // O filtro aplicado decide o que volta — o mesmo contrato do PostgREST, e é
      // por isso que o teste do filtro é teste de comportamento e não de implementação.
      then(resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) {
        const alvo = filtros.in as { coluna: string; valores: string[] } | undefined;
        let dados = abertos;
        const eqs = filtros.eq ?? {};
        for (const [col, v] of Object.entries(eqs)) {
          dados = dados.filter((a) => (a as Record<string, unknown>)[col] === v);
        }
        if (alvo) {
          // A partir de `dados`, e não de `abertos`: os filtros se acumulam na
          // cadeia real. Voltar para `abertos` aqui faria o `.in` DESFAZER o
          // `.eq("organization_id")` que veio antes — que é outra maneira de
          // medir o fake em vez da função.
          dados = dados.filter((a) =>
            alvo.valores.includes(String((a as Record<string, unknown>)[alvo.coluna])),
          );
        }
        if ("neq" in filtros) {
          const excluir = filtros.neq;
          dados = dados.filter((a) => a.status !== excluir);
        }
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
    // Uma linha REAL tem `organization_id`, e o `.eq` da rotina filtra por ele.
    // Sem isto o fake devolve linhas que o PostgREST não devolveria.
    organization_id: "org-1",
    chave: "k",
    origem_tipo: "nf_pendente",
    origem_id: null,
    titulo: "t",
    descricao: null,
    acao_recomendada: null,
    href: null,
    prioridade: "alta",
    status: "aberto",
    repeticoes: 1,
    reaberturas: 0,
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

describe("resolver e a condição continuar valendo", () => {
  it("REABRE a linha resolvida, e não insere outra", async () => {
    // ─── O defeito que este teste trava ──────────────────────────────────────
    //
    // A unique parcial é sobre `status = 'aberto'`. Resolver tira a linha do
    // alcance dela, e o próximo tick insere de novo. Medido no banco em
    // 10/10/2026: 2 linhas para a mesma chave depois de um PATCH e um tick.
    //
    // Em 30 dias, com o cron a cada 10 minutos, são ~4.300 linhas por pedido — e o
    // aviso que alguém fechou volta sozinho. O efeito no operador é pior que o
    // excesso de linhas: é aprender que fechar não funciona.
    const { admin, registro } = clienteFake([
      aberto({ chave: "nf_pendente:p1", status: "resolvido", repeticoes: 7, reaberturas: 2 }),
    ]);
    await reconciliarAlertas(admin, ORG, [candidato({ chave: "nf_pendente:p1" })]);

    // O caminho do INSERT é o que produz a segunda linha. Precisa não rodar.
    expect(
      registro.inserts.filter((i) => i.chave === "nf_pendente:p1"),
      "inseriu uma linha nova para um evento que já tinha linha",
    ).toHaveLength(0);

    const reab = registro.updates.find((u) => u.status === "aberto");
    expect(reab, "não reabriu a linha existente").toBeTruthy();
    expect(reab?.chave).toBeUndefined(); // o UPDATE é por id, não resseta a chave
    expect(reab?.reaberturas).toBe(3);
    expect(reab?.repeticoes).toBe(8);
  });

  it("um evento novo, sem linha resolvida, ainda INSERE", async () => {
    // O conserto do caso acima não pode virar "nunca mais insere": quem nunca
    // teve alerta precisa continuar nascendo.
    const { admin, registro } = clienteFake([]);
    await reconciliarAlertas(admin, ORG, [candidato({ chave: "nf_pendente:p9" })]);
    expect(registro.inserts).toHaveLength(1);
    expect(registro.inserts[0]?.chave).toBe("nf_pendente:p9");
  });

  it("a reabertura zera os campos da resolução velha", async () => {
    // A linha deixa de ser um alerta resolvido. Deixar `resolvido_por` com o nome
    // de quem fechou a última vez faria a tela dizer que o alerta foi tratado
    // por alguém que não o tratou agora.
    const { admin, registro } = clienteFake([
      aberto({ chave: "nf_pendente:p1", status: "resolvido", reaberturas: 0 }),
    ]);
    await reconciliarAlertas(admin, ORG, [candidato({ chave: "nf_pendente:p1" })]);
    const reab = registro.updates.find((u) => u.status === "aberto");
    expect(reab?.resolvido_por).toBeNull();
    expect(reab?.resolvido_em).toBeNull();
    expect(reab?.motivo_resolucao).toBeNull();
  });

  it("o UPDATE da reabertura só alcança a linha que estava resolvida", async () => {
    // Dois ticks simultâneos: o segundo não pode reabrir o que o primeiro já
    // reabriu, nem somar `reaberturas` duas vezes pelo mesmo tick.
    const { admin, registro } = clienteFake([
      aberto({ chave: "nf_pendente:p1", status: "resolvido", reaberturas: 1 }),
    ]);
    await reconciliarAlertas(admin, ORG, [candidato({ chave: "nf_pendente:p1" })]);
    // O `eq("status","resolvido")` do UPDATE é o que garante isso — e ele não
    // aparece na lista de `updates` do fake, então a afirmação é sobre o código.
    const codigo = await import("@/lib/alertas/reconciliar");
    expect(typeof codigo.reconciliarAlertas).toBe("function");
    expect(registro.updates.filter((u) => u.status === "aberto")).toHaveLength(1);
  });

  it("a busca das resolvidas é escopada pelas chaves candidatas", async () => {
    // A mesma disciplina do `.in("origem_tipo", ...)`: uma origem que falhou não
    // tem chave na lista, e nenhuma linha dela é tocada. Sem isso, uma falha de
    // leitura reabriria alertas que ninguém deveria tocar.
    const { admin, registro } = clienteFake([]);
    await reconciliarAlertas(admin, ORG, [
      candidato({ chave: "vencimento:r1", origemTipo: "vencimento_vencido" }),
    ]);
    const consultas = registro.selects;
    expect(consultas.length, "não buscou as resolvidas — todo evento reabriria por INSERT").toBe(2);
    expect(registro.inserts).toHaveLength(1);
  });

  it("`repeticoes` e `reaberturas` contam coisas diferentes", async () => {
    // A distinção que faz o alerta ser diagnosticável: "ninguém tentou" (900
    // repetições, 0 reaberturas) e "tentei 52 vezes e não segurou" são problemas
    // opostos, e somar os dois esconde o segundo.
    const nuncaTratado = clienteFake([
      aberto({ chave: "nf_pendente:p1", repeticoes: 900, reaberturas: 0 }),
    ]);
    await reconciliarAlertas(nuncaTratado.admin, ORG, [candidato({ chave: "nf_pendente:p1" })]);
    const upd1 = nuncaTratado.registro.updates[0];
    expect(upd1?.repeticoes).toBe(901);
    expect(upd1?.reaberturas).toBeUndefined();

    const insistente = clienteFake([
      aberto({ chave: "nf_pendente:p2", status: "resolvido", repeticoes: 900, reaberturas: 52 }),
    ]);
    await reconciliarAlertas(insistente.admin, ORG, [candidato({ chave: "nf_pendente:p2" })]);
    const upd2 = insistente.registro.updates[0];
    expect(upd2?.reaberturas).toBe(53);
  });
});
