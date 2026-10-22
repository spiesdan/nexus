import { describe, expect, it } from "vitest";

import {
  presetsDaSelecao,
  presetSugerido,
} from "@/lib/prospeccao/mensagens-por-categoria";

/**
 * A REGRA QUE O TESTE PROTEGE: a tela nunca oferece um padrão de categoria que
 * a campanha não escolheu, e nunca oferece um padrão vazio.
 *
 * O caso caro de errar é o segundo: se "oficina mecânica" aparecesse com três
 * caixas em branco, o operador clicaria, acharia que aplicou algo e dispararia
 * sem texto. Por isso o filtro de vazio acontece aqui, na função pura, e não na
 * tela.
 */
describe("mensagens por categoria", () => {
  const presets = [
    { categoria: "mecanica", mensagens: ["  Olá da oficina  ", "", "Variação"] },
    { categoria: "restaurante", mensagens: ["Olá do restaurante"] },
    { categoria: "padaria", mensagens: ["   "] },
    { categoria: "mercado", mensagens: [] },
  ];

  it("segue a ordem das categorias escolhidas, não a do banco", () => {
    const escolhidas = ["restaurante", "mecanica"];
    expect(presetsDaSelecao(presets, escolhidas).map((p) => p.categoria)).toEqual([
      "restaurante",
      "mecanica",
    ]);
  });

  it("descarta categoria sem padrão e padrão só com caixas vazias", () => {
    const escolhidas = ["padaria", "mercado", "mecanica", "inexistente"];
    expect(presetsDaSelecao(presets, escolhidas).map((p) => p.categoria)).toEqual(["mecanica"]);
  });

  it("limpa espaços e remove as mensagens vazias, preservando a ordem", () => {
    const [mecanica] = presetsDaSelecao(presets, ["mecanica"]);
    expect(mecanica?.mensagens).toEqual(["Olá da oficina", "Variação"]);
  });

  it("não repete a mesma categoria escolhida duas vezes", () => {
    expect(
      presetsDaSelecao(presets, ["mecanica", "mecanica"]).map((p) => p.categoria),
    ).toEqual(["mecanica"]);
  });

  it("sugere o padrão da primeira categoria escolhida que tem texto", () => {
    expect(presetSugerido(presets, ["padaria", "restaurante", "mecanica"])?.categoria).toBe(
      "restaurante",
    );
  });

  it("devolve null quando nenhuma categoria escolhida tem padrão", () => {
    expect(presetSugerido(presets, ["padaria", "mercado"])).toBeNull();
    expect(presetSugerido(presets, [])).toBeNull();
  });
});
