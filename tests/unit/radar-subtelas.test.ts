import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HASH_ANTIGO, SECOES, secaoDaRota } from "@/app/app/radar/_secoes";

/**
 * O RADAR VIROU SEIS TELAS — e nenhuma delas pode ficar sem porta.
 *
 * O defeito que este teste impede é o de sempre que uma landing é fatiada: a
 * navegação (ou um link antigo) apontando para um endereço que não existe. O
 * `navegacao-completude` cobre a porta de entrada; aqui se cobre o miolo, onde
 * o link nasce de uma lista em código (`_secoes.ts`) e não do `next/link` que
 * alguém digitou à mão.
 */
const BASE = path.join(process.cwd(), "app", "app");

function paginaDaRota(href: string): string {
  return path.join(BASE, href.replace(/^\/app/, ""), "page.tsx");
}

describe("as telas do Radar", () => {
  it("são seis, com id e endereço únicos", () => {
    expect(SECOES).toHaveLength(6);
    expect(new Set(SECOES.map((s) => s.id)).size).toBe(SECOES.length);
    expect(new Set(SECOES.map((s) => s.href)).size).toBe(SECOES.length);
  });

  it("todo href da navegação tem page.tsx no disco", () => {
    const semPagina = SECOES.filter((s) => !fs.existsSync(paginaDaRota(s.href))).map(
      (s) => `${s.rotulo} → ${s.href}`,
    );
    expect(semPagina, `A navegação do Radar aponta para endereço sem página:\n${semPagina.join("\n")}`).toEqual(
      [],
    );
  });

  it("a visão geral é a raiz — abrir o Radar não é abrir uma lista qualquer", () => {
    expect(SECOES[0].href).toBe("/app/radar");
    expect(secaoDaRota("/app/radar")?.id).toBe("visao");
  });

  it("reconhece a seção pelo endereço, com ou sem barra final", () => {
    expect(secaoDaRota("/app/radar/oportunidades")?.id).toBe("oportunidades");
    expect(secaoDaRota("/app/radar/oportunidades/")?.id).toBe("oportunidades");
    expect(secaoDaRota("/app/radar/risco-de-algo")).toBeNull();
    expect(secaoDaRota("/app/inbox")).toBeNull();
    expect(secaoDaRota(null)).toBeNull();
  });

  it("todo hash da landing antiga aponta para uma tela que existe", () => {
    const hrefs = new Set<string>(SECOES.map((s) => s.href));
    const quebrados = Object.entries(HASH_ANTIGO)
      .filter(([, alvo]) => !hrefs.has(alvo))
      .map(([hash, alvo]) => `#${hash} → ${alvo}`);
    expect(quebrados, `Âncora antiga apontando para tela inexistente:\n${quebrados.join("\n")}`).toEqual(
      [],
    );
  });
});
