/**
 * A tela das colisões do Mercos existe porque o dono achou sozinho o pedido
 * 19669: ele nunca entrou e ninguém viu. O gate aqui protege o que é dito —
 * sem jargão, sem dado inventado e com a porta ao lado da importação.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  nomeClienteLocal,
  nomeClienteMercos,
  rotuloData,
  rotuloEstado,
  coberturaDaConferencia,
  estadoDaConferencia,
  SEM_CLIENTE_LOCAL,
  SEM_CLIENTE_MERCOS,
  type ColisaoMercos,
} from "@/lib/mercos/colisoes";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const base: ColisaoMercos = {
  numero_mercos: 19669,
  cliente_mercos_nome: "FULANO LTDA",
  cliente_local_nome: "AMERICO YOSHIO NAGANO",
  valor_cents: 20750,
  visto_em: "2026-11-17T19:40:00Z",
  pedido_importado_id: null,
};

describe("colisões do Mercos — o que a tela diz", () => {
  it("cliente sem nome é DITO como sem nome, nunca inventado", () => {
    expect(nomeClienteMercos({ ...base, cliente_mercos_nome: null })).toBe(SEM_CLIENTE_MERCOS);
    expect(nomeClienteMercos({ ...base, cliente_mercos_nome: "   " })).toBe(SEM_CLIENTE_MERCOS);
    expect(nomeClienteLocal({ ...base, cliente_local_nome: null })).toBe(SEM_CLIENTE_LOCAL);
  });

  it("os dois lados aparecem com os nomes que o contrato trouxe", () => {
    expect(nomeClienteMercos(base)).toBe("FULANO LTDA");
    expect(nomeClienteLocal(base)).toBe("AMERICO YOSHIO NAGANO");
  });

  it("estado distingue não entrou de importado, e só mostra número se o backend der", () => {
    expect(rotuloEstado(base)).toBe("não entrou");
    expect(rotuloEstado({ ...base, pedido_importado_id: "uuid" })).toBe("importado");
    expect(rotuloEstado({ ...base, pedido_importado_id: "uuid", numero_local: 900123 })).toBe(
      "importado como nº 900123",
    );
  });

  it("data inválida é dita como sem data", () => {
    // A tag do idioma vem da camada (organização), nunca de literal: a
    // instalação pode estar em inglês.
    expect(rotuloData("não é data", "pt-BR")).toBe("data não informada");
    expect(rotuloData(base.visto_em, "pt-BR")).toMatch(/2026/);
  });

  it("a explicação é em frase de dono, sem jargão de colisão", () => {
    const tela = ler("app/app/pedidos/colisoes-mercos/_client.tsx");
    expect(tela).toContain(
      "Este pedido do Mercos não entrou porque o número dele já estava usado por outro pedido aqui",
    );
    expect(tela).toContain("Cada linha mostra os dois lados");
  });

  it("o vazio é boa notícia, não silêncio", () => {
    const tela = ler("app/app/pedidos/colisoes-mercos/_client.tsx");
    expect(tela).toContain("Nenhum pedido do Mercos ficou de fora");
    expect(tela).toContain("Boa notícia: todos os pedidos do Mercos entraram");
    // erro/de lista indisponível tem ação, nunca texto morto.
    expect(tela).toContain("role=\"alert\"");
    expect(tela).toContain("textos.tentar");
  });

  it("a confirmação nomeia as consequências sem inventar número local", () => {
    const tela = ler("app/app/pedidos/colisoes-mercos/_client.tsx");
    expect(tela).toContain("fica guardado como referência");
    expect(tela).toContain("próximo número da série local");
    expect(tela).not.toContain("900123");
  });

  it("a porta fica onde a importação já vive — nenhum menu novo", () => {
    const pedidos = ler("app/app/pedidos/_client.tsx");
    expect(pedidos).toContain('href="/app/pedidos/colisoes-mercos"');
    expect(pedidos).toContain("Ficaram de fora");
    const navegacao = ler("tests/unit/navegacao-completude.test.ts");
    expect(navegacao).toContain('"/app/pedidos/colisoes-mercos"');
    const registro = ler("lib/navigation/registry.ts");
    expect(registro).not.toContain('href: "/app/pedidos/colisoes-mercos"');
  });
});

/**
 * O resumo da reconciliação é a RESPOSTA para "tenho certeza?". O estado
 * incompleto não pode dizer "nenhum ficou de fora" — e zero ausente nunca
 * aparece sem a cobertura ao lado.
 */
describe("resumo da reconciliação", () => {
  const completa = {
    quando: "2026-11-23T22:00:00Z",
    censo_lido: 5929,
    censo_esperado: 5929,
    ausentes: 0,
    colisoes: 4,
    ignorados_sem_item: 1,
    status: "completa" as const,
  };

  it("tolerante: sem reconciliação, o estado é 'sem' e a tela segue", () => {
    expect(estadoDaConferencia(null)).toBe("sem");
    expect(estadoDaConferencia(undefined)).toBe("sem");
    expect(estadoDaConferencia({ status: null })).toBe("sem");
  });

  it("quatro estados, decididos por status + ausentes", () => {
    expect(estadoDaConferencia(completa)).toBe("completa");
    expect(estadoDaConferencia({ ...completa, ausentes: 3 })).toBe("ausentes");
    expect(estadoDaConferencia({ ...completa, status: "incompleta" })).toBe("incompleta");
  });

  it("o número de ausentes nunca aparece sozinho: cobertura sempre ao lado", () => {
    expect(coberturaDaConferencia(completa, "pt-BR")).toBe(
      "0 ausentes · 5.929 de 5.929 verificados",
    );
    expect(coberturaDaConferencia({ ...completa, censo_lido: 100 }, "pt-BR")).toBe(
      "0 ausentes · 100 de 5.929 verificados",
    );
  });

  it("cópia dos quatro estados está na tela, sem tooltip escondendo 'incompleta'", () => {
    const tela = ler("app/app/pedidos/colisoes-mercos/_client.tsx");
    expect(tela).toContain("Nenhum pedido do Mercos ficou de fora.");
    expect(tela).toContain("pedidos do Mercos ainda não entraram");
    expect(tela).toContain("Verificação incompleta: olhamos");
    expect(tela).toContain("Ainda não verificamos os pedidos do Mercos");
    expect(tela).toContain("A próxima execução termina a verificação");
    const inicio = tela.indexOf('data-testid="estado-reconciliacao"');
    const bloco = tela.slice(inicio, inicio + 2200);
    expect(bloco).not.toContain("title="); // nada de tooltip escondendo "incompleta"
    expect(tela).toContain('data-testid="estado-reconciliacao"');
  });

  it("390: duas linhas, não um parágrafo", () => {
    const tela = ler("app/app/pedidos/colisoes-mercos/_client.tsx");
    expect(tela).toContain("flex flex-wrap items-baseline gap-x-3 gap-y-1");
  });
});
