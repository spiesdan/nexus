/**
 * RÓTULO VISÍVEL VIRA NOME ACESSÍVEL — o gate que fecha a classe da V-15.
 *
 * ─── O QUE ELE PEGOU QUE O ANTERIOR NÃO PEGAVA ─────────────────────────────
 *
 * Em 16/11/2026, abrindo a aba "Motoristas" de `/app/frota` com o instrumento de
 * subtelas, dois campos apareceram com `camposSemRotulo = 2`. A causa não estava
 * no `<Input>`: estava no `<Label>` ao lado, **sem `htmlFor`** e com o campo como
 * irmão. `<Label>` é o primitivo de `components/ui/label` — renderiza `<label>`
 * em runtime, e o gate anterior (`rotulo-de-campo-aponta-para-controle`) só lia
 * `<label>` literal. Resultado: a classe inteira ficou invisível.
 *
 * Medido com o mesmo critério em todo `app/` e `components/`: **90** `<Label>`
 * sem `htmlFor` e sem controle dentro. Em dezenas deles o campo não tinha nome
 * nenhum — leitor de tela anunciando "campo de texto" sem dizer o que preencher.
 *
 * ─── A REGRA ──────────────────────────────────────────────────────────────
 *
 * Para cada `<Label>` sem `htmlFor` e sem controle no próprio corpo, o primeiro
 * controle do irmão (Input/Textarea/Select→SelectTrigger/Checkbox/Switch) tem de
 * ter `aria-label`, `aria-labelledby` ou `id`. Se não tiver, o rótulo visível é
 * decoração — e o campo é inacessível.
 *
 * ─── POR QUE O GATE E O CONSERTO SÃO O MESMO CÓDIGO ───────────────────────
 *
 * A régua aqui é `planejar()`, exportada de
 * `scripts/auditoria/cod-rotulo-acessivel.mjs`: a mesma função que injeta o
 * `aria-label` é a que o teste chama e exige vazia. Isso elimina o modo de falha
 * mais comum de gate escrito à parte — o teste mede uma coisa, o conserto faz
 * outra, e o verde não significa nada. Rodar o script com `--aplicar` é o
 * conserto; rodar o teste é a vigilância; e a função é idempotente.
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error — script .mjs sem tipos; a assinatura é conferida pelo uso abaixo.
import { planejar } from "../../scripts/auditoria/cod-rotulo-acessivel.mjs";

const RAIZ = path.resolve(__dirname, "../..");

describe("rótulo visível vira nome acessível", () => {
  it("nenhum <Label> sobra ao lado de campo sem nome", () => {
    const { mudancas } = planejar(RAIZ) as {
      mudancas: { arquivo: string; linha: number; rotulo: string; controle: string }[];
    };
    expect(
      mudancas.map((m) => `${m.arquivo}:${m.linha} — "${m.rotulo}" → ${m.controle}`),
      "rótulo visível sem vínculo com o campo: o texto está na tela e o campo não tem nome. " +
        "Rode `node scripts/auditoria/cod-rotulo-acessivel.mjs --aplicar` ou vinele à mão.",
    ).toEqual([]);
  });

  it("a análise realmente varre o produto (não é vazia por não olhar)", () => {
    // Sem isto, um erro de caminho devolveria `mudancas: []` e o gate acima
    // ficaria verde para sempre — o jeito mais fácil de um gate mentir.
    const { rotulosLidos } = planejar(RAIZ) as { rotulosLidos: number };
    // Medido em 16/11/2026: 93 `<Label>` com `</Label>` fora do primitivo `ui/`.
    expect(rotulosLidos).toBeGreaterThan(60);
  });
});
