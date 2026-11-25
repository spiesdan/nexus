import { placaEhValida } from "./placa";

export interface ItemDeProntidao {
  tipo: "ok" | "aviso" | "bloqueio";
  texto: string;
}

export interface ProntidaoDaCarga {
  itens: ItemDeProntidao[];
  podeCriar: boolean;
  bloqueios: number;
  avisos: number;
}

/**
 * Prontidão ANTES de confirmar a criação: o mesmo vocabulário do cartão
 * "Próximo passo" da ficha. Bloqueio impede criar; aviso é informação para
 * quem vai escalar/publicar depois — os dois são nomeados, nunca misturados.
 */
export function prontidaoDaCarga({
  selecionados,
  pedidos,
  placa,
  motorista,
  enderecoResolvido,
}: {
  selecionados: string[];
  pedidos: Array<{ id: string; endereco_entrega?: string | null }>;
  placa: string;
  motorista: string;
  /**
   * O ENDEREÇO QUE A ENTREGA VAI USAR — resolvido no servidor, cadastro
   * incluído (`enderecoDaEntrega`).
   *
   * Medido em 25/11/2026: a prontidão olhava só `endereco_entrega` do pedido e
   * bloqueava a carga de três pedidos cujo CLIENTE tinha endereço completo no
   * cadastro — a tela dizia "3 pedidos sem endereço, corrija antes de incluir"
   * e o operador não tinha onde corrigir. O destino que a rota grava já vinha
   * do cadastro; só a checagem olhava o lugar errado.
   *
   * Ausente (undefined) = comportamento antigo, para quem não tem o mapa.
   */
  enderecoResolvido?: Record<string, string | null> | null;
}): ProntidaoDaCarga {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  // O MAPA MANDA quando existe: ele é a resposta do mesmo resolvedor que a
  // rota usa (`enderecoDaEntrega`), que já prefere o snapshot com rua e cai no
  // cadastro. Sem o mapa, vale o snapshot cru — comportamento antigo.
  const enderecoDe = (id: string): string =>
    (enderecoResolvido ? (enderecoResolvido[id] ?? "") : (porId.get(id)?.endereco_entrega ?? "")).trim();
  const semEndereco = selecionados.filter((id) => !enderecoDe(id)).length;
  const itens: ItemDeProntidao[] = [
    {
      tipo: selecionados.length > 0 ? "ok" : "bloqueio",
      texto: `${selecionados.length} pedidos selecionados`,
    },
  ];
  if (semEndereco > 0) {
    itens.push({
      tipo: "bloqueio",
      texto: `${semEndereco} pedidos sem endereço — corrija antes de incluir`,
    });
  }
  if (!motorista.trim()) {
    itens.push({ tipo: "aviso", texto: "Sem motorista — a rota não pode ser publicada" });
  }
  if (placa.trim() && !placaEhValida(placa)) {
    itens.push({ tipo: "bloqueio", texto: "Placa inválida — use ABC1D23 ou ABC1234" });
  }
  const bloqueios = itens.filter((i) => i.tipo === "bloqueio").length;
  return {
    itens,
    podeCriar: bloqueios === 0,
    bloqueios,
    avisos: itens.filter((i) => i.tipo === "aviso").length,
  };
}
