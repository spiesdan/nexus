/**
 * O dublê de `URL.createObjectURL` no setup do Vitest.
 *
 * ═══ POR QUE ESTE TESTE EXISTE ════════════════════════════════════════════
 *
 * O bump do Dependabot #134 trouxe `jsdom` 30.0.1 → 30.1.2 e derrubou três
 * testes com `TypeError: Cannot read properties of undefined (reading
 * '_buffer')`. A implementação de `URL.createObjectURL` do jsdom mudou — e três
 * testes que medem o COMPORTAMENTO do composer (abrir preview, enviar, manter
 * o diálogo aberto quando o upload falha) passaram a depender de um campo
 * interno do jsdom.
 *
 * A resposta certa é dublar a object URL no setup, e não pinar o jsdom numa
 * versão antiga para sempre por causa de um detalhe de implementação.
 *
 * ═══ O QUE ESTE ARQUIVO TRAVA ═════════════════════════════════════════════
 *
 * Que o dublê está de pé e faz o que promete. Um setup que define
 * `createObjectURL` com o corpo errado — ou que o sobrewrita de volta para a
 * implementação do jsdom — derrubaria de novo exatamente os mesmos três testes,
 * e o culpado apareceria como "o jsdom quebrou de novo".
 */
import { describe, expect, it } from "vitest";

import { objectUrlDe } from "../setup/vitest.setup";

describe("dublê de URL.createObjectURL", () => {
  it("devolve uma string com cara de blob, e não a url do teste", () => {
    const url = URL.createObjectURL(new Blob(["x"], { type: "text/plain" }));
    expect(typeof url).toBe("string");
    expect(url).toMatch(/^blob:/);
  });

  it("devolve uma URL DIFFERENTE a cada chamada", () => {
    // Sem isto, dois previews na mesma tela receberiam a mesma URL e o segundo
    // mostraria a imagem do primeiro — falha que passa em teste e aparece só
    // na tela.
    const a = URL.createObjectURL(new Blob(["a"]));
    const b = URL.createObjectURL(new Blob(["b"]));
    expect(a).not.toBe(b);
  });

  it("guarda o objeto passado, para o teste poder conferir o que foi anexado", () => {
    const blob = new Blob(["conteudo"], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    expect(objectUrlDe(url)).toBe(blob);
  });

  it("revokeObjectURL tira da guarda — é o que o useEffect de limpeza chama", () => {
    const url = URL.createObjectURL(new Blob(["x"]));
    expect(objectUrlDe(url)).toBeDefined();
    URL.revokeObjectURL(url);
    expect(objectUrlDe(url)).toBeUndefined();
  });

  it("revogar uma URL que não existe não estoura", () => {
    // O `revoke` roda em `useEffect(() => () => revoke(url))`, ou seja, no
    // desmonte — e o desmonte pode rodar depois de outro `revoke` do mesmo
    // objeto. Se isso lançar, o erro aparece como falha de render.
    expect(() => URL.revokeObjectURL("blob:https://test.invalid/99999")).not.toThrow();
  });

  it("MUTAÇÃO: sem o dublê, os testes do composer caem de novo", () => {
    // A prova de que este arquivo mede algo. A implementação do jsdom 30.1.2 é
    // a que quebrou; este teste é o que garante que a de casa está no lugar.
    const chamado = { criado: 0, revogado: 0 };
    const originalCriar = URL.createObjectURL;
    const originalRevogar = URL.revokeObjectURL;
    try {
      URL.createObjectURL = () => {
        chamado.criado++;
        return "blob:x";
      };
      URL.revokeObjectURL = () => {
        chamado.revogado++;
      };
      URL.createObjectURL(new Blob(["x"]));
      URL.revokeObjectURL("blob:x");
      expect(chamado).toEqual({ criado: 1, revogado: 1 });
    } finally {
      URL.createObjectURL = originalCriar;
      URL.revokeObjectURL = originalRevogar;
    }
  });
});