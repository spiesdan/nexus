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
  sincronizacaoFiscalComFalha,
} from "./regras-fiscal";
import { DIA, HORA, MIN, jobFiscal, nota, pedido, primeiro, snapshot, syncFiscal } from "./teste-fixtures";

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
});
