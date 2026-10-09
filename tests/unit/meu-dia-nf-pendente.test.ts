/**
 * A CONFERÊNCIA DE NOTA, E PRINCIPALMENTE O QUE ELA NÃO CONSEGUE AFIRMAR.
 *
 * ─── O que estes testes protegem ──────────────────────────────────────────────
 *
 * Duas direções, e a segunda é a que o pedido original pede por nome:
 *
 *   FALSO NEGATIVO — um pedido que pede NF e não é avisado. O pedido some do
 *   Meu Dia e ninguém percebe que ele sumiu. **É o pior.**
 *
 *   FALSO POSITIVO / FALSA CONFIRMAÇÃO — a tela diz "nota emitida" sem que a
 *   SEFAZ tenha dito, ou diz "pendente" para algo que já foi emitido. Ambos
 *   treinam o operador a ignorar o Meu Dia, e um Meu Dia ignorado é pior que
 *   não existir.
 *
 * O teste mais importante do arquivo é `provedor stub nao confirma nada`: sem
 * ele, um pedido com `invoices.status = 'autorizada'` num provedor `stub`
 * apareceria como emitido — e o XML nunca saiu da máquina.
 */
import { describe, expect, it } from "vitest";

import {
  chaveDoAlerta,
  descricaoDaIndicacao,
  estadoFiscal,
  integracaoConfiavel,
  textoDoEstado,
  type NotaParaConferir,
  type PedidoParaConferir,
} from "@/lib/meu-dia/nf-pendente";

function pedido(over: Partial<PedidoParaConferir> = {}): PedidoParaConferir {
  return {
    id: "p-1",
    numero: 100,
    cliente_nome: "ACME",
    status: "aprovado",
    created_at: "2026-10-01T10:00:00Z",
    exige_nf: true,
    observacoes: null,
    ...over,
  };
}

describe("o estado fiscal do pedido", () => {
  it("pedido que não pede NF não é assunto da rotina", () => {
    expect(estadoFiscal(pedido({ exige_nf: false }), [], true)).toBe("nao_pediu");
  });

  it("pedido cancelado nunca é pendência fiscal", () => {
    // Cancelado antes de a rotina de semeadura ver: o texto pode dizer "com
    // nf" num pedido que foi cancelado, e ele não pode virar aviso.
    expect(estadoFiscal(pedido({ status: "cancelado" }), [], true)).toBe("nao_pediu");
  });

  it("pedido com NF e sem nota registrada é PENDENTE", () => {
    expect(estadoFiscal(pedido(), [], true)).toBe("pendente");
  });

  it("nota autorizada encerra a pendência", () => {
    const notas: NotaParaConferir[] = [{ order_id: "p-1", status: "autorizada" }];
    expect(estadoFiscal(pedido(), notas, true)).toBe("emitida");
  });

  it("nota cancelada também é um desfecho — não é pendência", () => {
    // Cancelar a nota é uma decisão do emitente. O pedido não tem mais o que
    // emitir, e continuar avisando é o ruído que faz o operador parar de ler.
    const notas: NotaParaConferir[] = [{ order_id: "p-1", status: "cancelada" }];
    expect(estadoFiscal(pedido(), notas, true)).toBe("emitida");
  });

  it("nota em erro NÃO é desfecho — continua pendente", () => {
    const notas: NotaParaConferir[] = [{ order_id: "p-1", status: "erro" }];
    expect(estadoFiscal(pedido(), notas, true)).toBe("pendente");
  });

  it("nota PENDENTE não encerra nada", () => {
    const notas: NotaParaConferir[] = [{ order_id: "p-1", status: "pendente" }];
    expect(estadoFiscal(pedido(), notas, true)).toBe("pendente");
  });

  it("a indicação pode vir do texto da observação", () => {
    // O pedido de antes da 0261: ninguém marcou o campo, mas escreveu "pedido
    // com nf". Perder este caso faz o pedido antigo sumir do Meu Dia.
    expect(
      estadoFiscal(pedido({ exige_nf: false, observacoes: "Levar café, pedido com nf" }), [], true),
    ).toBe("pendente");
  });
});

describe("a integração que não existe não pode virar confirmação", () => {
  it("provedor stub NÃO confirma emissão", () => {
    // O caso que o teste inteiro existe para provar. Com `stub`, o sistema grava
    // `invoices` do mesmo jeito — e nenhum XML saiu da máquina.
    const notas: NotaParaConferir[] = [{ order_id: "p-1", status: "autorizada" }];
    const estado = estadoFiscal(pedido(), notas, integracaoConfiavel("stub"));
    expect(estado, "stub nao pode levar o sistema a afirmar que a SEFAZ autorizou").toBe(
      "nao_verificavel",
    );
  });

  it("stub também não afirma que está pendente", () => {
    // Sem integração, "não emitiu" e "não sei se emitiu" são estados
    // diferentes. Dizer "pendente" seria afirmar que consultou.
    expect(estadoFiscal(pedido(), [], integracaoConfiavel("stub"))).toBe("nao_verificavel");
  });

  it("provedor de verdade confirma", () => {
    expect(integracaoConfiavel("spednfe")).toBe(true);
    expect(integracaoConfiavel("SPEDNFE")).toBe(true);
  });

  it("provedor ausente é NÃO confiável", () => {
    // Sem nome de provedor não há o que confiar, e a resposta é a mesma do
    // `stub`. A primeira versão desta função tratava ausente como confiável —
    // o pior lado para errar: sem integração declarada, o sistema afirmaria que
    // consultou a SEFAZ.
    expect(integracaoConfiavel(null)).toBe(false);
    expect(integracaoConfiavel("")).toBe(false);
    expect(integracaoConfiavel("  ")).toBe(false);
    expect(integracaoConfiavel(undefined)).toBe(false);
  });
});

describe("o que a tela diz, e com que tom", () => {
  it("pendente é erro — é o que exige ação", () => {
    expect(textoDoEstado("pendente").tom).toBe("erro");
  });

  it("não verificável é aviso, e NÃO é erro", () => {
    // A diferença importa: "não consigo conferir" não é falha de ninguém. Um
    // tom de erro aqui puniria o operador por uma limitação da instalação.
    const t = textoDoEstado("nao_verificavel");
    expect(t.tom).toBe("aviso");
    expect(t.titulo).toMatch(/não pode ser conferida/i);
  });

  it("o título de 'não verificável' NÃO promete nem nega", () => {
    // Um título que dissesse "NF pendente" seria uma confirmação falsa pelo
    // avesso; um que dissesse "NF emitida" seria pior.
    const t = textoDoEstado("nao_verificavel").titulo.toLowerCase();
    expect(t).not.toMatch(/\bemitida\b/);
    expect(t).not.toMatch(/\bpendente\b/);
  });

  it("emitida é neutra — não é má notícia", () => {
    expect(textoDoEstado("emitida").tom).toBe("neutro");
  });
});

describe("a indicação nomeia de onde veio", () => {
  it("marcado no cadastro", () => {
    expect(descricaoDaIndicacao(pedido())).toMatch(/marcado no cadastro/i);
  });

  it("pelo texto, com o trecho que disparou", () => {
    const d = descricaoDaIndicacao(pedido({ exige_nf: false, observacoes: "pedido com nf" }));
    expect(d).toMatch(/observação/i);
    expect(d).toContain("pedido com nf");
  });

  it("marcado no cadastro E no texto: diz as duas", () => {
    const d = descricaoDaIndicacao(pedido({ observacoes: "nota fiscal" }));
    expect(d).toMatch(/marcado no cadastro/i);
    expect(d).toMatch(/observação/i);
  });
});

describe("a chave do alerta", () => {
  it("é o pedido, e não a nota", () => {
    // Um pedido pode ter duas notas. Com o id da nota na chave, a segunda criaria
    // um segundo aviso para o mesmo pedido — que é a duplicidade que o pedido
    // original proíbe.
    expect(chaveDoAlerta("pedido-abc")).toBe("nf_pendente:pedido-abc");
  });

  it("é estável entre execuções", () => {
    expect(chaveDoAlerta("pedido-abc")).toBe(chaveDoAlerta("pedido-abc"));
  });

  it("não contém data nem contador", () => {
    // Uma chave com timestamp muda a cada dia e vira um aviso novo por dia: a
    // idempotência deixa de existir sem que nada pareça quebrado.
    const chave = chaveDoAlerta("pedido-abc");
    expect(chave).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(chave).not.toMatch(/\d/);
  });
});
