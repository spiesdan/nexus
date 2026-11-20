import { describe, expect, it } from "vitest";

import { estadoDaPublicacao } from "./publicacao";

/**
 * PUBLICAR A ROTA — a tabela que decide o que o botão faz.
 *
 * O gesto é irreversível e avisa cliente: a tela não pode oferecê-lo onde ele
 * não existe (carga na rua, carga concluída, carga vazia), nem esconder que
 * publicar com ordem pendente SALVA antes.
 */
describe("estado da publicação da rota", () => {
  it("carga montando, ordem salva: publicar direto", () => {
    expect(
      estadoDaPublicacao({ statusDaCarga: "montando", ordemMudou: false, paradas: 3 }),
    ).toEqual({ tipo: "publicar", precisaSalvar: false });
  });

  it("carga montando com proposta na tela: publicar SALVA antes", () => {
    // Sem isso o entregador receberia a ordem anterior — o defeito silencioso
    // que a tela de rota existe para evitar.
    expect(estadoDaPublicacao({ statusDaCarga: "montando", ordemMudou: true, paradas: 3 })).toEqual(
      { tipo: "publicar", precisaSalvar: true },
    );
  });

  it("já na rua: não se publica duas vezes", () => {
    expect(estadoDaPublicacao({ statusDaCarga: "em_rota", ordemMudou: true, paradas: 3 })).toEqual({
      tipo: "publicada",
    });
  });

  it("concluída vence em rota — o gesto não existe mais", () => {
    expect(
      estadoDaPublicacao({ statusDaCarga: "concluida", ordemMudou: false, paradas: 3 }),
    ).toEqual({ tipo: "encerrada" });
  });

  it("sem parada: não há o que publicar (o servidor recusaria com 422)", () => {
    // A ordem das regras importa: "vazia" vence "publicar", senão o botão
    // prometeria um envio que a rota recusa.
    expect(estadoDaPublicacao({ statusDaCarga: "montando", ordemMudou: false, paradas: 0 })).toEqual(
      { tipo: "vazia" },
    );
  });

  it("vazia também não passa por 'publicada' quando já está na rua", () => {
    // Carga em rota sem parada é estado anômalo, mas a resposta não pode ser
    // "publicada" com um botão de ação — e não pode ser "publicar".
    const e = estadoDaPublicacao({ statusDaCarga: "em_rota", ordemMudou: false, paradas: 0 });
    expect(e.tipo).toBe("vazia");
  });
});
