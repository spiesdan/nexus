import { describe, expect, it } from "vitest";

import {
  campanhasComCidadeInvalida,
  campanhasComCidadeRepetida,
  clientesDuplicadosPorEmail,
  estoqueNegativo,
  importacaoMercosFalhou,
  importacaoMercosTravada,
  jobsDaFilaTravados,
  pedidosAvancadosSemCliente,
  pedidosComNfSemDocumento,
  pedidosComTotalIncoerente,
  pedidosPresos,
  recebiveisComParcelaInvalida,
  recebiveisDuplicados,
  recebiveisSemOrigem,
  webhooksComFalha,
} from "./regras-operacao";
import {
  campanhaProspeccao,
  campanhaVenda,
  duplicado,
  ha,
  DIA,
  HORA,
  jobFila,
  mercos,
  MIN,
  pedido,
  primeiro,
  produto,
  recebivel,
  snapshot,
  webhook,
} from "./teste-fixtures";

describe("detectores de operação — caso positivo e negativo", () => {
  it("estoque negativo: saldo < 0 com controle dispara; zero ou sem controle não", () => {
    expect(estoqueNegativo(snapshot({ produtos: [produto({ quantidade: -1 })] }))).toHaveLength(1);
    expect(estoqueNegativo(snapshot({ produtos: [produto({ quantidade: 0 })] }))).toHaveLength(0);
    expect(
      estoqueNegativo(
        snapshot({ produtos: [produto({ quantidade: -1, controla_estoque: false })] }),
      ),
    ).toHaveLength(0);
  });

  it("total incoerente: total diferente da conta dispara; igual não", () => {
    expect(
      pedidosComTotalIncoerente(
        snapshot({
          pedidos: [pedido({ subtotal_cents: 10_000, desconto_cents: 500, frete_cents: 200, total_cents: 10_000 })],
        }),
      ),
    ).toHaveLength(1);
    expect(
      pedidosComTotalIncoerente(
        snapshot({
          pedidos: [pedido({ subtotal_cents: 10_000, desconto_cents: 500, frete_cents: 200, total_cents: 9_700 })],
        }),
      ),
    ).toHaveLength(0);
  });

  it("pedido preso: rascunho há 8 dias dispara; há 1 dia não", () => {
    expect(
      pedidosPresos(
        snapshot({
          pedidos: [pedido({ status: "rascunho", updated_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 8 * DIA).toISOString() })],
        }),
      ),
    ).toHaveLength(1);
    expect(pedidosPresos(snapshot({ pedidos: [pedido({ status: "rascunho" })] }))).toHaveLength(0);
  });

  it("pedido avançado sem cliente: faturado sem contato dispara; com contato não", () => {
    expect(
      pedidosAvancadosSemCliente(
        snapshot({ pedidos: [pedido({ status: "faturado", contact_id: null })] }),
      ),
    ).toHaveLength(1);
    expect(
      pedidosAvancadosSemCliente(snapshot({ pedidos: [pedido({ status: "faturado" })] })),
    ).toHaveLength(0);
  });

  it("pedido com NF sem documento: exige NF e documento vazio dispara; com documento não", () => {
    expect(
      pedidosComNfSemDocumento(
        snapshot({ pedidos: [pedido({ exige_nf: true, cliente_documento: null })] }),
      ),
    ).toHaveLength(1);
    expect(
      pedidosComNfSemDocumento(
        snapshot({ pedidos: [pedido({ exige_nf: true, cliente_documento: "123" })] }),
      ),
    ).toHaveLength(0);
    expect(
      pedidosComNfSemDocumento(
        snapshot({ pedidos: [pedido({ exige_nf: false, cliente_documento: null })] }),
      ),
    ).toHaveLength(0);
  });

  it("recebível sem origem: sem pedido, nota e cliente dispara; com cliente não", () => {
    expect(
      recebiveisSemOrigem(
        snapshot({ recebiveis: [recebivel({ order_id: null, invoice_id: null, contact_id: null })] }),
      ),
    ).toHaveLength(1);
    expect(recebiveisSemOrigem(snapshot({ recebiveis: [recebivel()] }))).toHaveLength(0);
  });

  it("recebível duplicado: mesmo cliente/valor/vencimento manual dispara; valores diferentes não", () => {
    const dois = recebiveisDuplicados(
      snapshot({
        recebiveis: [
          recebivel({ id: "a", order_id: null }),
          recebivel({ id: "b", order_id: null }),
        ],
      }),
    );
    expect(dois).toHaveLength(1);
    expect(primeiro(dois).severidade).toBe("alta");

    expect(
      recebiveisDuplicados(
        snapshot({
          recebiveis: [
            recebivel({ id: "a", order_id: null, valor_original_cents: 100 }),
            recebivel({ id: "b", order_id: null, valor_original_cents: 200 }),
          ],
        }),
      ),
    ).toHaveLength(0);

    // Com pedido, o índice único do banco já impede o par — a regra não inventa.
    expect(
      recebiveisDuplicados(
        snapshot({
          recebiveis: [recebivel({ id: "a" }), recebivel({ id: "b" })],
        }),
      ),
    ).toHaveLength(0);
  });

  it("parcela inválida: número maior que o total dispara; válida não", () => {
    expect(
      recebiveisComParcelaInvalida(
        snapshot({ recebiveis: [recebivel({ parcela_n: 3, total_parcelas: 2 })] }),
      ),
    ).toHaveLength(1);
    expect(
      recebiveisComParcelaInvalida(
        snapshot({ recebiveis: [recebivel({ parcela_n: 2, total_parcelas: 2 })] }),
      ),
    ).toHaveLength(0);
  });

  it("Mercos travado: queued há 46 min dispara; recente não", () => {
    expect(
      importacaoMercosTravada(
        snapshot({
          importacoesMercos: [
            mercos({
              status: "queued",
              created_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 46 * MIN).toISOString(),
            }),
          ],
        }),
      ),
    ).toHaveLength(1);
    expect(
      importacaoMercosTravada(
        snapshot({
          importacoesMercos: [mercos({ status: "queued", created_at: ha(10 * MIN) })],
        }),
      ),
    ).toHaveLength(0);
  });

  it("Mercos falhou: duas falhas no dia viram uma ocorrência alta; sucesso não", () => {
    const duas = importacaoMercosFalhou(
      snapshot({
        importacoesMercos: [
          mercos({ id: "a", status: "error" }),
          mercos({ id: "b", status: "partial" }),
        ],
      }),
    );
    expect(duas).toHaveLength(1);
    expect(primeiro(duas).severidade).toBe("alta");
    expect(primeiro(duas).evidencia.total).toBe(2);

    expect(
      importacaoMercosFalhou(snapshot({ importacoesMercos: [mercos({ status: "success" })] })),
    ).toHaveLength(0);
  });

  it("fila: running travado, pendente atrasado, failed esgotado e dead disparam; done não", () => {
    expect(
      jobsDaFilaTravados(
        snapshot({
          fila: [
            jobFila({
              status: "running",
              locked_at: new Date(Date.parse("2026-11-18T12:00:00.000Z") - 31 * MIN).toISOString(),
            }),
          ],
        }),
      ),
    ).toHaveLength(1);
    expect(
      jobsDaFilaTravados(
        snapshot({
          fila: [jobFila({ status: "pending", run_after: ha(3 * HORA) })],
        }),
      ),
    ).toHaveLength(1);
    expect(
      jobsDaFilaTravados(
        snapshot({ fila: [jobFila({ status: "failed", attempts: 5, max_attempts: 5 })] }),
      ),
    ).toHaveLength(1);
    const morto = jobsDaFilaTravados(snapshot({ fila: [jobFila({ status: "dead" })] }));
    expect(morto).toHaveLength(1);
    expect(primeiro(morto).severidade).toBe("critica");
    expect(jobsDaFilaTravados(snapshot({ fila: [jobFila({ status: "done" })] }))).toHaveLength(0);
  });

  it("webhook: erro isolado é media; três viram alta; dead é crítica; processado não", () => {
    const um = webhooksComFalha(snapshot({ webhooks: [webhook({ status: "error" })] }));
    expect(um).toHaveLength(1);
    expect(primeiro(um).severidade).toBe("media");

    const tres = webhooksComFalha(
      snapshot({
        webhooks: [
          webhook({ id: "a", status: "error" }),
          webhook({ id: "b", status: "error" }),
          webhook({ id: "c", status: "error" }),
        ],
      }),
    );
    expect(tres).toHaveLength(1);
    expect(primeiro(tres).severidade).toBe("alta");

    const morto = webhooksComFalha(snapshot({ webhooks: [webhook({ status: "dead" })] }));
    expect(morto).toHaveLength(1);
    expect(primeiro(morto).severidade).toBe("critica");

    expect(
      webhooksComFalha(snapshot({ webhooks: [webhook({ status: "processed" })] })),
    ).toHaveLength(0);
  });

  it("campanha: cidade vazia/UF inválida dispara; campanha de recuperação sem cidade não", () => {
    expect(
      campanhasComCidadeInvalida(
        snapshot({
          campanhasProspeccao: [
            campanhaProspeccao({ cidades: [{ cidade: "Campinas", estado: "São Paulo" }] }),
          ],
        }),
      ),
    ).toHaveLength(1);
    expect(
      campanhasComCidadeInvalida(
        snapshot({
          campanhasVenda: [campanhaVenda({ cidade: "" })],
        }),
      ),
    ).toHaveLength(1);

    // `cidades: []` é legítimo para campanha de recuperação (contatos sem
    // recorte geográfico) — a regra não pode chamar isso de erro.
    expect(
      campanhasComCidadeInvalida(
        snapshot({ campanhasProspeccao: [campanhaProspeccao({ cidades: [] })] }),
      ),
    ).toHaveLength(0);
    expect(
      campanhasComCidadeInvalida(
        snapshot({ campanhasVenda: [campanhaVenda()] }),
      ),
    ).toHaveLength(0);
  });

  it("campanha com cidade repetida dispara; cidade única não", () => {
    expect(
      campanhasComCidadeRepetida(
        snapshot({
          campanhasProspeccao: [
            campanhaProspeccao({
              cidades: [
                { cidade: "Campinas", estado: "SP" },
                { cidade: "campinas", estado: "sp" },
              ],
            }),
          ],
        }),
      ),
    ).toHaveLength(1);
    expect(
      campanhasComCidadeRepetida(snapshot({ campanhasProspeccao: [campanhaProspeccao()] })),
    ).toHaveLength(0);
  });

  it("cliente duplicado por e-mail: evidência mascara o endereço", () => {
    const achado = primeiro(
      clientesDuplicadosPorEmail(snapshot({ clientesDuplicados: [duplicado()] })),
    );
    expect(achado.regra).toBe("operacao.cliente_duplicado_email");
    expect(String(achado.evidencia.email_mascarado)).toBe("a**@loja.test");
    expect(JSON.stringify(achado.evidencia)).not.toContain("ana@loja.test");
  });
});
