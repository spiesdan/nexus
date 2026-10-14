/**
 * A tela de pedidos filtra por período no fuso de quem pediu.
 *
 * ═══ O QUE ESTE ARQUIVO TRAVA ═════════════════════════════════════════════
 *
 * Que `app/app/pedidos/page.tsx` NÃO monta a janela do dia com `T00:00:00Z` /
 * `T23:59:59.999Z`.
 *
 * ═══ POR QUE PRECISA DE UM TESTE DE ARQUIVO ═══════════════════════════════
 *
 * A janela em UTC produz uma lista **plausível**. Ela abre, mostra pedidos,
 * tem data, tem número. O que ela faz é errar em três horas nas duas pontas —
 * traz o fim do dia anterior e perde o fim do dia pedido.
 *
 * E o lugar onde isso está é uma chamada `.gte()` dentro de uma página de Server
 * Component. Um teste que rode a tela precisaria de banco; um teste que
 * importasse a função de filtro precisaria extraí-la da página. Este arquivo lê
 * o código-fonte, que é o que existe.
 *
 * A leitura direta é feia e é honesta: `ver` que a página **não** contém a
 * fronteira antiga é mais forte que confiar que alguém não a vai reintroduzir,
 * porque reintroduzi-la é o caminho óbvio e é o que aconteceu.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extremosDoPeriodo, janelaDoDia } from "@/lib/comercial/janela-do-dia";

const RAIZ = process.cwd();

/**
 * O código da página, sem comentário nenhum.
 *
 * ═══ POR QUE ISTO EXISTE ══════════════════════════════════════════════════
 *
 * A página tem um comentário que **cita** a fronteira antiga ao explicar o
 * conserto:
 *
 *     // Antes isso era `T00:00:00Z` a `T23:59:59.999Z`, que em Brasília cobria
 *
 * Ler o arquivo cru faz o `not.toContain("T00:00:00Z")` reprovar por causa da
 * PRÓPRIA EXPLICAÇÃO do conserto — que é o pior tipo de falha: obriga a apagar
 * a documentação para o teste passar, e a documentação é a parte boa.
 *
 * Por isso o comentário sai ANTES de qualquer busca. O teste passa a medir o
 * código, que é o que ele diz medir.
 */
function semComentario(texto: string): string {
  return texto
    // `{/* ... */}` e o bloco que abre em `{/*` e fecha na primeira `*/`.
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // `//` só quando abre a linha (ou vem de código), para não comer o `//`
    // de uma URL como "https://".
    .replace(/^\s*\/\/.*$/gm, " ");
}

const PAGINA_BRUTA = readFileSync(join(RAIZ, "app/app/pedidos/page.tsx"), "utf8");
const PAGINA = semComentario(PAGINA_BRUTA);

describe("filtro de período da tela de pedidos", () => {
  it("guarda de vácuo: o arquivo lido é o que este teste acha que é", () => {
    // Sem isto, um `join` errado faria o arquivo vir vazio e todo `not.toContain`
    // abaixo passaria — o teste viraria verde por não ler nada.
    expect(PAGINA_BRUTA.length).toBeGreaterThan(1000);
    expect(PAGINA).toContain("commercial_orders");
  });

  it("o leitor tira comentário — e é por isso que o próximo teste não falha por causa da explicação", () => {
    // A guarda que prova a guarda: o arquivo tem um comentário que CITA a
    // fronteira antiga. Se o leitor parasse de remover comentário, este teste
    // passaria e o de baixo reprovaria — que é o sintoma exato do problema.
    expect(PAGINA_BRUTA).toContain("T00:00:00Z");
    expect(PAGINA).not.toContain("T00:00:00Z");
  });

  it("NÃO usa a fronteira em UTC que existia antes", () => {
    // A mutação que importa. `2026-10-14T00:00:00Z` é a meia-noite UTC — e em
    // Brasília ela é 21:00 do dia ANTERIOR.
    expect(PAGINA).not.toContain("T00:00:00Z");
    expect(PAGINA).not.toContain("T23:59:59.999Z");
  });

  it("constrói a janela pelo helper do fuso, e não à mão", () => {
    expect(PAGINA).toContain("extremosDoPeriodo");
    expect(PAGINA).toContain("janela-do-dia");
  });

  it("usa o fuso do USUÁRIO, com o padrão do Brasil como queda", () => {
    // `user.timezone`, e não `user_metadata.timezone`: no ponto do código, `user`
    // já é o `AuthUser` do servidor. Mesmo cuidado que a Agenda.
    expect(PAGINA).toContain("user.timezone");
    expect(PAGINA).toContain("FUSO_PADRAO");
  });

  it("aplica os dois extremos no filtro", () => {
    expect(PAGINA).toContain("periodo.de");
    expect(PAGINA).toContain("periodo.ate");
    expect(PAGINA).toMatch(/q\.gte\("created_at"/);
    expect(PAGINA).toMatch(/q\.lt\("created_at"/);
  });
});

describe("o período que a tela produz", () => {
  it("dia 14/10 em São Paulo = 03:00Z a 03:00Z de 15/10", () => {
    const e = extremosDoPeriodo("2026-10-14", "2026-10-14", "America/Sao_Paulo");
    expect(e.de).toBe("2026-10-14T03:00:00.000Z");
    expect(e.ate).toBe("2026-10-15T03:00:00.000Z");
  });

  it("MUTAÇÃO: a fronteira antiga daria 14/10 inteiro, e está errado nas pontas", () => {
    // O que a tela mostrava antes, e por que o dono fechava o dia sem bater.
    const antigo = {
      de: "2026-10-14T00:00:00.000Z", // 13/10 21:00 em Brasília
      ate: "2026-10-14T23:59:59.999Z", // 14/10 20:59 em Brasília
    };
    const certo = extremosDoPeriodo("2026-10-14", "2026-10-14", "America/Sao_Paulo");
    // Mesmo formato, mesmo tamanho — e ainda assim é outro conjunto de pedidos.
    expect(antigo.de.slice(0, 10)).toBe(certo.de!.slice(0, 10));
    expect(antigo.de).not.toBe(certo.de);

    // Um pedido de 14/10 às 22:00 em Brasília entra no certo e some no antigo.
    const vinteEDuas = Date.parse("2026-10-15T01:00:00.000Z");
    expect(vinteEDuas).toBeGreaterThanOrEqual(Date.parse(certo.de!));
    expect(vinteEDuas).toBeLessThan(Date.parse(certo.ate!));
    expect(vinteEDuas).toBeGreaterThan(Date.parse(antigo.ate));
  });

  it("intervalo de vários dias sai pela regra do primeiro/último dia", () => {
    const e = extremosDoPeriodo("2026-10-01", "2026-10-07", "America/Sao_Paulo");
    // Começa na meia-noite do dia 1 e vai até a meia-noite do dia 8 — sete
    // dias completos, com o dia 7 incluído inteiro.
    expect(e.de).toBe("2026-10-01T03:00:00.000Z");
    expect(e.ate).toBe("2026-10-08T03:00:00.000Z");
    const dias = (Date.parse(e.ate!) - Date.parse(e.de!)) / 86_400_000;
    expect(dias).toBe(7);
  });

  it("sem período, a tela mostra tudo — e não já filtrada por hoje", () => {
    const e = extremosDoPeriodo(undefined, undefined, "America/Sao_Paulo");
    expect(e.de).toBeNull();
    expect(e.ate).toBeNull();
  });
});

describe("o dia que o atalho da tela oferece", () => {
  it("o helper do fuso aceita o que um `<input type=\"date\">` devolve", () => {
    // `<input type="date">` devolve sempre `YYYY-MM-DD` — nunca com hora, nunca
    // em ISO completo. Se um dia o navegador mudar de formato, a tela passa a
    // filtrar por nada e a lista fica silenciosamente sem período.
    expect(janelaDoDia("2026-10-14", "America/Sao_Paulo")).not.toBeNull();
  });
});