import { describe, expect, it } from "vitest";

import {
  divergenciaDeValorDaNota,
  jobsFiscaisComRetryExcessivo,
  jobsFiscaisTravados,
  notasAutorizadasComPedidoNaoFaturado,
  notasAutorizadasSemChave,
  notasDuplicadasPorPedido,
  notasPendentesAntigas,
  notasRejeitadas,
  notasSemVinculo,
  notasTravadasEmEmissao,
  pedidosComNfSemNota,
  rejeicoesRepetidas,
  sincronizacaoFiscalComFalha,
} from "./regras-fiscal";
import { DIA, HORA, MIN, jobFiscal, nota, pedido, primeiro, snapshot, syncFiscal } from "./teste-fixtures";
import { fingerprint } from "./tipos";

describe("detectores fiscais — caso positivo e negativo", () => {
  it("nota rejeitada: erro/denegada dispara; autorizada não", () => {
    expect(notasRejeitadas(snapshot({ notas: [nota({ status: "erro" })] }))).toHaveLength(1);
    expect(notasRejeitadas(snapshot({ notas: [nota({ status: "denegada" })] }))).toHaveLength(1);
    expect(notasRejeitadas(snapshot({ notas: [nota()] }))).toHaveLength(0);
  });

  it("nota travada em emissão: mais de 30 min dispara; recente não", () => {
    const travada = notasTravadasEmEmissao(
      snapshot({ notas: [nota({ status: "em_emissao", updated_at: `2026-11-18T11:00:00.000Z` })] }),
    );
    expect(travada).toHaveLength(1);
    expect(primeiro(travada).severidade).toBe("alta");
    expect(
      notasTravadasEmEmissao(
        snapshot({
          notas: [nota({ status: "em_emissao", updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 10 * MIN).toISOString() })],
        }),
      ),
    ).toHaveLength(0);
  });

  it("nota pendente antiga: mais de 24h dispara; uma hora não", () => {
    expect(
      notasPendentesAntigas(
        snapshot({ notas: [nota({ status: "pendente", created_at: `2026-11-17T10:00:00.000Z` })] }),
      ),
    ).toHaveLength(1);
    expect(
      notasPendentesAntigas(
        snapshot({
          notas: [nota({ status: "pendente", created_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - HORA).toISOString() })],
        }),
      ),
    ).toHaveLength(0);
  });

  it("nota sem vínculo: autorizada sem pedido dispara; com pedido não", () => {
    expect(
      notasSemVinculo(snapshot({ notas: [nota({ order_id: null })] })),
    ).toHaveLength(1);
    expect(notasSemVinculo(snapshot({ notas: [nota()] }))).toHaveLength(0);
  });

  it("nota sem chave: autorizada sem chave dispara; com chave não", () => {
    expect(
      notasAutorizadasSemChave(snapshot({ notas: [nota({ chave_acesso: null })] })),
    ).toHaveLength(1);
    expect(notasAutorizadasSemChave(snapshot({ notas: [nota()] }))).toHaveLength(0);
  });

  it("nota duplicada por pedido: duas ativas disparam; uma ativa + cancelada não", () => {
    const duas = notasDuplicadasPorPedido(
      snapshot({
        notas: [
          nota({ id: "a", status: "autorizada" }),
          nota({ id: "b", status: "pendente", numero: 11 }),
        ],
      }),
    );
    expect(duas).toHaveLength(1);
    expect(primeiro(duas).severidade).toBe("critica");
    expect(primeiro(duas).evidencia.notas).toHaveLength(2);

    expect(
      notasDuplicadasPorPedido(
        snapshot({
          notas: [
            nota({ id: "a", status: "autorizada" }),
            nota({ id: "b", status: "cancelada", numero: 11 }),
          ],
        }),
      ),
    ).toHaveLength(0);

    // Agrupamento (0294): a nota principal é de outro pedido, mas as duas
    // compartilham um pedido secundário — é duplicidade do mesmo jeito.
    const secundario = notasDuplicadasPorPedido(
      snapshot({
        notas: [
          nota({ id: "a", order_id: "pedido-a", status: "autorizada" }),
          nota({ id: "b", order_id: "pedido-b", status: "pendente", numero: 12 }),
        ],
        notasPedidos: [
          { invoice_id: "a", order_id: "pedido-x" },
          { invoice_id: "b", order_id: "pedido-x" },
        ],
      }),
    );
    expect(secundario).toHaveLength(1);
    expect(primeiro(secundario).entidadeId).toBe("pedido-x");
  });


  it("devolução não concorre com a venda: venda+devolução e devolução+devolução não abrem", () => {
    const pedido = "7a7e781b-0000-4000-8000-000000009560";
    // Caso real 19560: 4634 é a venda; 4644 é a devolução (finalidade 4,
    // ref_nfe da 4634). O banco já sabe disso desde a 0326; o detector agora
    // usa a mesma regra.
    const venda = nota({
      id: "4634",
      order_id: pedido,
      numero: 4634,
      status: "autorizada",
      extras_fiscais: { finalidade: "1" },
    });
    const devolucao = nota({
      id: "4644",
      order_id: pedido,
      numero: 4644,
      status: "autorizada",
      extras_fiscais: { finalidade: "4", ref_nfe: "chave-4634" },
    });

    expect(
      notasDuplicadasPorPedido(snapshot({ notas: [venda, devolucao] })),
    ).toHaveLength(0);
    expect(
      notasDuplicadasPorPedido(snapshot({ notas: [devolucao, { ...devolucao, id: "4645", numero: 4645 }] })),
    ).toHaveLength(0);

    // Duas VENDAS vivas continuam sendo o caso crítico que motivou a regra.
    const duasVendas = notasDuplicadasPorPedido(snapshot({ notas: [venda, { ...venda, id: "4635", numero: 4635 }] }));
    expect(duasVendas).toHaveLength(1);
    expect(primeiro(duasVendas).evidencia.finalidades).toEqual([1, 1]);

    // Devolução ligada como pedido secundário (0294) também não conta.
    expect(
      notasDuplicadasPorPedido(
        snapshot({
          notas: [venda, { ...devolucao, order_id: "outro-pedido" }],
          notasPedidos: [
            { invoice_id: "4634", order_id: pedido },
            { invoice_id: "4644", order_id: pedido },
          ],
        }),
      ),
    ).toHaveLength(0);
  });

  it("divergência de valor: totais diferentes disparam; iguais não", () => {
    expect(
      divergenciaDeValorDaNota(
        snapshot({ notas: [nota({ total_cents: 9_000 })], pedidos: [pedido()] }),
      ),
    ).toHaveLength(1);
    expect(
      divergenciaDeValorDaNota(
        snapshot({ notas: [nota({ total_cents: 10_000 })], pedidos: [pedido()] }),
      ),
    ).toHaveLength(0);
  });

  it("divergência com agrupamento: soma de N pedidos fecha → não abre", () => {
    const notaAgrupada = nota({ id: "nf-4629", total_cents: 13_400, order_id: "p-19594" });
    const p1 = pedido({ id: "p-19594", numero: 19_594, total_cents: 9_200 });
    const p2 = pedido({ id: "p-19597", numero: 19_597, total_cents: 4_200 });
    const vinculo = { invoice_id: "nf-4629", order_id: "p-19597" };

    expect(
      divergenciaDeValorDaNota(
        snapshot({ notas: [notaAgrupada], pedidos: [p1, p2], notasPedidos: [vinculo] }),
      ),
    ).toHaveLength(0);
  });

  it("divergência com agrupamento: soma diferente abre com a decomposição", () => {
    const notaAgrupada = nota({ id: "nf-4629", total_cents: 13_400, order_id: "p-19594" });
    const p1 = pedido({ id: "p-19594", numero: 19_594, total_cents: 9_200 });
    const p2 = pedido({ id: "p-19597", numero: 19_597, total_cents: 4_000 });

    const r = divergenciaDeValorDaNota(
      snapshot({
        notas: [notaAgrupada],
        pedidos: [p1, p2],
        notasPedidos: [{ invoice_id: "nf-4629", order_id: "p-19597" }],
      }),
    );

    expect(r).toHaveLength(1);
    expect(primeiro(r).evidencia).toMatchObject({
      nota_total_cents: 13_400,
      soma_pedidos_cents: 13_200,
      diferenca_cents: -200,
      pedidos_total_cents: [9_200, 4_000],
      pedido_numeros: [19_594, 19_597],
    });
  });

  it("pedido do vínculo ausente do snapshot não abre (coleta incompleta)", () => {
    expect(
      divergenciaDeValorDaNota(
        snapshot({
          notas: [nota({ id: "nf-4629", total_cents: 13_400, order_id: "p-19594" })],
          pedidos: [pedido({ id: "p-19594", total_cents: 9_200 })],
          notasPedidos: [{ invoice_id: "nf-4629", order_id: "p-19597" }],
        }),
      ),
    ).toHaveLength(0);
  });

  it("nota com vínculo secundário não é 'sem vínculo'", () => {
    expect(
      notasSemVinculo(
        snapshot({
          notas: [nota({ id: "nf-4629", order_id: null })],
          notasPedidos: [{ invoice_id: "nf-4629", order_id: "pedido-1" }],
        }),
      ),
    ).toHaveLength(0);
  });

  it("nota autorizada com pedido não faturado: agrupamento olha todos", () => {
    const p1 = pedido({ id: "p-1", numero: 1, status: "faturado" });
    const p2 = pedido({ id: "p-2", numero: 2, status: "aprovado" });
    const notaAgrupada = nota({ id: "nf-1", order_id: "p-1" });
    const vinculo = { invoice_id: "nf-1", order_id: "p-2" };

    expect(
      notasAutorizadasComPedidoNaoFaturado(
        snapshot({ notas: [notaAgrupada], pedidos: [p1, p2], notasPedidos: [vinculo] }),
      ),
    ).toHaveLength(1);

    expect(
      notasAutorizadasComPedidoNaoFaturado(
        snapshot({
          notas: [notaAgrupada],
          pedidos: [p1, pedido({ id: "p-2", numero: 2, status: "faturado" })],
          notasPedidos: [vinculo],
        }),
      ),
    ).toHaveLength(0);
  });

  it("pedido com NF coberto por vínculo secundário não dispara", () => {
    expect(
      pedidosComNfSemNota(
        snapshot({
          pedidos: [
            pedido({ id: "p-2", numero: 2, exige_nf: true, status: "faturado", updated_at: "2026-11-18T10:00:00.000Z" }),
          ],
          notas: [nota({ id: "nf-1", order_id: "p-1", status: "autorizada" })],
          notasPedidos: [{ invoice_id: "nf-1", order_id: "p-2" }],
        }),
      ),
    ).toHaveLength(0);
  });

  it("nota autorizada com pedido não faturado: aprovado dispara; faturado não", () => {
    expect(
      notasAutorizadasComPedidoNaoFaturado(
        snapshot({ notas: [nota()], pedidos: [pedido({ status: "aprovado" })] }),
      ),
    ).toHaveLength(1);
    expect(
      notasAutorizadasComPedidoNaoFaturado(
        snapshot({ notas: [nota()], pedidos: [pedido({ status: "faturado" })] }),
      ),
    ).toHaveLength(0);
  });

  it("pedido com NF sem nota: faturado há 2h dispara; aprovado há 1h (janela 24h) não", () => {
    const faturado = pedidosComNfSemNota(
      snapshot({
        pedidos: [pedido({ exige_nf: true, status: "faturado", updated_at: `2026-11-18T10:00:00.000Z` })],
      }),
    );
    expect(faturado).toHaveLength(1);
    expect(primeiro(faturado).severidade).toBe("critica");

    expect(
      pedidosComNfSemNota(
        snapshot({
          pedidos: [pedido({ exige_nf: true, status: "aprovado", updated_at: `2026-11-18T11:00:00.000Z` })],
        }),
      ),
    ).toHaveLength(0);

    expect(
      pedidosComNfSemNota(
        snapshot({
          pedidos: [pedido({ exige_nf: true, status: "faturado", updated_at: `2026-11-18T10:00:00.000Z` })],
          notas: [nota({ status: "pendente" })],
        }),
      ),
    ).toHaveLength(0);
  });

  it("job fiscal travado: processando há 31 min dispara; recente não; pendente atrasado dispara", () => {
    expect(
      jobsFiscaisTravados(
        snapshot({
          jobsFiscais: [
            {
              ...jobFiscal({ status: "processando" }),
              updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 31 * MIN).toISOString(),
            },
          ],
        }),
      ),
    ).toHaveLength(1);
    expect(
      jobsFiscaisTravados(snapshot({ jobsFiscais: [jobFiscal({ status: "processando" })] })),
    ).toHaveLength(0);
    expect(
      jobsFiscaisTravados(
        snapshot({
          jobsFiscais: [
            jobFiscal({
              status: "pendente",
              proxima_tentativa: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 31 * MIN).toISOString(),
            }),
          ],
        }),
      ),
    ).toHaveLength(1);
  });

  it("retry excessivo: 3 tentativas disparam; 2 não", () => {
    expect(
      jobsFiscaisComRetryExcessivo(
        snapshot({ jobsFiscais: [jobFiscal({ tentativas: 3 })] }),
      ),
    ).toHaveLength(1);
    expect(
      jobsFiscaisComRetryExcessivo(
        snapshot({ jobsFiscais: [jobFiscal({ tentativas: 2 })] }),
      ),
    ).toHaveLength(0);
  });

  it("sincronização fiscal: uma falha no dia é media; três viram alta; sucesso não", () => {
    const uma = sincronizacaoFiscalComFalha(
      snapshot({ sincronizacoesFiscais: [syncFiscal({ resultado: "erro" })] }),
    );
    expect(uma).toHaveLength(1);
    expect(primeiro(uma).severidade).toBe("media");

    const tres = sincronizacaoFiscalComFalha(
      snapshot({
        sincronizacoesFiscais: [
          syncFiscal({ id: "a", resultado: "erro" }),
          syncFiscal({ id: "b", resultado: "bloqueado" }),
          syncFiscal({ id: "c", resultado: "erro" }),
        ],
      }),
    );
    expect(tres).toHaveLength(1);
    expect(primeiro(tres).severidade).toBe("alta");
    expect(primeiro(tres).evidencia.total).toBe(3);

    expect(
      sincronizacaoFiscalComFalha(
        snapshot({ sincronizacoesFiscais: [syncFiscal({ resultado: "sucesso" })] }),
      ),
    ).toHaveLength(0);
  });

  it("sincronização antiga (mais de 24h) não vira ocorrência nova", () => {
    expect(
      sincronizacaoFiscalComFalha(
        snapshot({
          sincronizacoesFiscais: [
            syncFiscal({ resultado: "erro", iniciado_em: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 2 * DIA).toISOString() }),
          ],
        }),
      ),
    ).toHaveLength(0);
  });

  it("evidência não carrega erro cru com PII", () => {
    const achado = primeiro(
      notasRejeitadas(
        snapshot({
          notas: [
            nota({
              status: "erro",
              erro: "Falha ao enviar para joao@cliente.com telefone +5511999998888",
            }),
          ],
        }),
      ),
    );
    expect(String(achado.evidencia.erro)).not.toContain("joao@cliente.com");
    expect(String(achado.evidencia.erro)).not.toContain("5511999998888");
    expect(String(achado.evidencia.erro)).toContain("[email]");
  });

  it("rejeição repetida: 3 do mesmo cStat/série abrem UMA ocorrência com limiar declarado", () => {
    const notas = [
      nota({ id: "n1", numero: 10, sefaz_cstat: "539", sefaz_xmotivo: "Rejeicao: duplicidade", updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 2 * HORA).toISOString() }),
      nota({ id: "n2", numero: 12, sefaz_cstat: "539", sefaz_xmotivo: "Rejeicao: duplicidade", updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - HORA).toISOString() }),
      nota({ id: "n3", numero: 11, sefaz_cstat: " 539 ", sefaz_xmotivo: "Rejeicao: duplicidade", updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 30 * MIN).toISOString() }),
    ];
    const achados = rejeicoesRepetidas(snapshot({ notas }));
    expect(achados).toHaveLength(1);
    const a = primeiro(achados);
    expect(a.regra).toBe("fiscal.rejeicao_repetida");
    expect(a.severidade).toBe("alta");
    expect(a.evidencia.total).toBe(3);
    expect(a.evidencia.limiar).toBe(3);
    expect(a.evidencia.primeiro_numero).toBe(10);
    expect(a.evidencia.ultimo_numero).toBe(12);
    expect(a.evidencia.notas).toEqual([10, 11, 12]);
    expect(String(a.evidencia.mensagem)).toContain("duplicidade");
  });

  it("rejeição repetida: 2 não abre, cStat de sucesso não entra, fora da janela não conta", () => {
    const duas = [
      nota({ id: "n1", numero: 10, sefaz_cstat: "539", updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - HORA).toISOString() }),
      nota({ id: "n2", numero: 11, sefaz_cstat: "539", updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 2 * HORA).toISOString() }),
    ];
    expect(rejeicoesRepetidas(snapshot({ notas: duas }))).toHaveLength(0);

    const sucesso = [100, 101, 135, 150, 151].map((cstat, i) =>
      nota({ id: `ok-${i}`, numero: 20 + i, sefaz_cstat: String(cstat) }),
    );
    expect(rejeicoesRepetidas(snapshot({ notas: sucesso }))).toHaveLength(0);

    const antiga = nota({
      id: "velha",
      numero: 9,
      sefaz_cstat: "539",
      updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 25 * HORA).toISOString(),
    });
    expect(rejeicoesRepetidas(snapshot({ notas: [...duas, antiga] }))).toHaveLength(0);
  });

  it("rejeição repetida: séries diferentes são grupos diferentes; duas orgs, uma cada", () => {
    const base = [10, 11, 12].map((numero) =>
      nota({ id: `s1-${numero}`, numero, serie: "1", sefaz_cstat: "610" }),
    );
    const outraSerie = [20, 21, 22].map((numero) =>
      nota({ id: `s2-${numero}`, numero, serie: "2", sefaz_cstat: "610" }),
    );
    expect(rejeicoesRepetidas(snapshot({ notas: [...base, ...outraSerie] }))).toHaveLength(2);

    const org1 = primeiro(rejeicoesRepetidas(snapshot({ organizationId: "org-1", notas: base })));
    const org2 = primeiro(rejeicoesRepetidas(snapshot({ organizationId: "org-2", notas: base })));
    expect(org1.entidadeId).not.toBe(org2.entidadeId);
  });

  it("rejeição repetida: fingerprint estável e contagem cresce na reexecução", () => {
    const tres = [10, 11, 12].map((numero) =>
      nota({ id: `n${numero}`, numero, sefaz_cstat: "176" }),
    );
    const primeira = primeiro(rejeicoesRepetidas(snapshot({ notas: tres })));
    const quatro = [
      ...tres,
      nota({ id: "n13", numero: 13, sefaz_cstat: "176" }),
    ];
    const segunda = primeiro(rejeicoesRepetidas(snapshot({ notas: quatro })));

    expect(fingerprint(segunda)).toBe(fingerprint(primeira));
    expect(segunda.evidencia.total).toBe(4);
    expect(segunda.evidencia.primeiro_numero).toBe(10);
    expect(segunda.evidencia.ultimo_numero).toBe(13);
  });
});
