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
}: {
  selecionados: string[];
  pedidos: Array<{ id: string; endereco_entrega?: string | null }>;
  placa: string;
  motorista: string;
}): ProntidaoDaCarga {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const semEndereco = selecionados.filter((id) => !porId.get(id)?.endereco_entrega?.trim()).length;
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
