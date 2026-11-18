import { describe, expect, it } from "vitest";

import {
  campanhasComCidadeInvalida,
  campanhasComCidadeRepetida,
  clientesDuplicadosPorEmail,
  estoqueDivergente,
  estoqueNegativo,
  importacaoMercosFalhou,
  importacaoMercosTravada,
  jobsDaFilaTravados,
  leadsDuplicados,
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
  estoqueRazao,
  ha,
  DIA,
  HORA,
  jobFila,
  leadAberto,
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

  it("estoque divergente: diferença acima do piso dispara com confiança baixa; pequena não", () => {
    const grande = estoqueDivergente(
      snapshot({
        estoqueRazao: [
          estoqueRazao({ quantidade: 100, saldo_razao: 40, diferenca: 60 }),
        ],
      }),
    );
    expect(grande).toHaveLength(1);
    const estoque = primeiro(grande);
    expect(estoque.severidade).toBe("baixa");
    expect(estoque.evidencia.confianca).toBe("baixa");
    expect(String(estoque.evidencia.limitacao)).toContain("saldo de abertura");

    expect(
      estoqueDivergente(
        snapshot({
          estoqueRazao: [estoqueRazao({ quantidade: 100, saldo_razao: 95, diferenca: 5 })],
        }),
      ),
    ).toHaveLength(0);
  });

  it("lead duplicado: mesmo contato no mesmo funil dispara; funis diferentes não", () => {
    const mesmoContato = leadsDuplicados(
      snapshot({
        leadsAbertos: [
          leadAberto({ id: "l1", contact_id: "contato-1" }),
          leadAberto({ id: "l2", contact_id: "contato-1" }),
        ],
      }),
    );
    expect(mesmoContato).toHaveLength(1);
    const contato = primeiro(mesmoContato);
    expect(contato.evidencia.identidade).toBe("contato");
    expect(contato.evidencia.confianca).toBe("alta");

    expect(
      leadsDuplicados(
        snapshot({
          leadsAbertos: [
            leadAberto({ id: "l1", pipeline_id: "p1", contact_id: "c1" }),
            leadAberto({ id: "l2", pipeline_id: "p2", contact_id: "c1" }),
          ],
        }),
      ),
    ).toHaveLength(0);
  });

  it("lead duplicado por telefone/e-mail: contatos diferentes, evidência mascarada", () => {
    const porTelefone = leadsDuplicados(
      snapshot({
        leadsAbertos: [
          leadAberto({
            id: "l1",
            contact_id: "c1",
            contatos: { phone_number: "+5511999998888", email_normalized: null },
          }),
          leadAberto({
            id: "l2",
            contact_id: "c2",
            contatos: { phone_number: "+55 11 99999-8888", email_normalized: null },
          }),
        ],
      }),
    );
    expect(porTelefone).toHaveLength(1);
    const telefone = primeiro(porTelefone);
    expect(telefone.evidencia.identidade).toBe("telefone");
    expect(telefone.evidencia.confianca).toBe("media");
    expect(String(telefone.evidencia.telefone_mascarado)).toContain("8888");
    expect(JSON.stringify(telefone.evidencia)).not.toContain("5511999998888");

    const porEmail = leadsDuplicados(
      snapshot({
        leadsAbertos: [
          leadAberto({
            id: "l1",
            contact_id: "c1",
            contatos: { phone_number: null, email_normalized: "ana@loja.test" },
          }),
          leadAberto({
            id: "l2",
            contact_id: "c2",
            contatos: { phone_number: null, email_normalized: "ANA@loja.test" },
          }),
        ],
      }),
    );
    expect(porEmail).toHaveLength(1);
    const email = primeiro(porEmail);
    expect(email.evidencia.identidade).toBe("email");
    expect(JSON.stringify(email.evidencia)).not.toContain("ana@loja.test");
  });

  it("lead duplicado não conta duas vezes quando contato e e-mail dão a mesma assinatura", () => {
    const achados = leadsDuplicados(
      snapshot({
        leadsAbertos: [
          leadAberto({ id: "l1", contact_id: "c1" }),
          leadAberto({ id: "l2", contact_id: "c2" }),
        ],
      }),
    );
    // Mesmo telefone/e-mail nos dois contatos, mas contacts diferentes: a
    // assinatura de IDs é a mesma, então só a melhor confiança sobrevive.
    expect(achados).toHaveLength(1);
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
