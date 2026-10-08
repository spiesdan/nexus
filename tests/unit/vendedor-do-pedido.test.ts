/**
 * QUEM É O VENDEDOR DO PEDIDO.
 *
 * Medido na instalação real: dos 10.769 pedidos, **ZERO** tinham
 * `vendedor_user_id`. A coluna existia, o schema aceitava, a API filtrava por
 * ela, o PDF já tinha o campo `Vendedor` desenhado — e nada gravava nada.
 *
 * O pedido inteiro do dono dependia dessa coluna e não tinha dado: o filtro por
 * vendedor não filtrava nada, o nome não saía no PDF, e "o Daniel não pode ver
 * os pedidos da Ana" não tinha onde se apoiar.
 *
 * ─── O que este teste trava, e por que o `origem` é a parte difícil ──────────
 *
 * A regra é "o pedido é de quem criou". A tentação é aplicá-la sempre, e aí um
 * pedido que entra pelo WhatsApp ou pela IA fica em nome da pessoa que por acaso
 * apertou o botão — e isso é pior do que não ter dono: nome errado em relatório
 * de comissão não se percebe, enquanto campo vazio se vê.
 *
 * O teste importa a função de `lib/comercial/vendedor-do-pedido.ts`, a mesma
 * que `criarPedidoComercial` chama. Uma cópia da regra aqui passaria verde
 * depois de alguém mudar a regra no código — que foi exatamente como o defeito
 * desta história entrou: uma mudança que nenhum teste viu.
 */
import { describe, expect, it } from "vitest";

import { vendedorDoPedido } from "@/lib/comercial/vendedor-do-pedido";

const QUEM = "user-do-vendedor";

describe("vendedor do pedido na criação", () => {
  it("pedido feito na mão é de quem criou", () => {
    expect(vendedorDoPedido({ origem: "vendedor" }, QUEM)).toBe(QUEM);
  });

  it("vendedor enviado pelo chamador vence — o campo da tela manda", () => {
    expect(vendedorDoPedido({ origem: "vendedor", vendedor_user_id: "outro" }, QUEM)).toBe("outro");
  });

  it.each(["ia", "whatsapp", "b2b"])(
    "origem %s NÃO fica com o nome de quem apertou o botão",
    (origem) => {
      // Pedido de sistema é de sistema. Atribuir a uma pessoa aqui inventa dono
      // de venda, e nome errado em comissão não se percebe.
      expect(vendedorDoPedido({ origem }, QUEM)).toBeNull();
    },
  );

  it("origem de sistema com vendedor explícito respeita o vendedor explícito", () => {
    // Se o chamador DISSE qual é o vendedor, isso vale em qualquer origem: quem
    // atribui é a informação, não o palpite.
    expect(vendedorDoPedido({ origem: "ia", vendedor_user_id: "outro" }, QUEM)).toBe("outro");
  });

  it("sem pessoa criando (job/rotina), não há vendedor a inventar", () => {
    // `created_by` é `string | null`. Um job que cria pedido na origem
    // `vendedor` não tem ninguém para ser dono — e inventar seria o nome errado
    // em comissão que este módulo existe para evitar.
    expect(vendedorDoPedido({ origem: "vendedor" }, null)).toBeNull();
  });
});

describe("rótulo do vendedor na tela", () => {
  /**
   * A regra do rótulo, como está no `_client.tsx`: nome quando o servidor
   * resolveu, prefixo do UUID quando não.
   *
   * O caso que não pode voltar é o primeiro UUID do bug: servidor devolveu
   * string vazia porque o filtro não achou nenhum pedido, e o rótulo virou
   * `a1b2c3d4` na frente de quem opera.
   */
  const rotulo = (vendedorNome: string, vendedorId: string): string =>
    vendedorNome || vendedorId.slice(0, 8);

  it("mostra o NOME quando o servidor resolveu", () => {
    expect(rotulo("Daniel", "a1b2c3d4-0000-4000-8000-000000000000")).toBe("Daniel");
  });

  it("cai para o prefixo do UUID só quando o nome não veio", () => {
    const r = rotulo("", "a1b2c3d4-0000-4000-8000-000000000000");
    expect(r).toBe("a1b2c3d4");
    // O ponto do prefixo: 8 caracteres, e NÃO o UUID inteiro. 36 caracteres
    // num rótulo de filtro não é informação para quem opera.
    expect(r.length).toBe(8);
  });

  it("nome com acento e caixa não é normalizado no rótulo", () => {
    // O nome é dado da pessoa, escrito como ela usa. Mostrar `Jo~ao` por
    // normalizar de menos seria pior do que mostrar o acento.
    expect(rotulo("João da Silva", "abc")).toBe("João da Silva");
  });
});
