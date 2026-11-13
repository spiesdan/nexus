/**
 * DEMANDA DE CADA PARADA — peso e volume do que realmente vai ser entregue.
 *
 * Fonte única da conta que o VRPTW usa e que a confirmação da distribuição
 * revalida no servidor. Duplicar a fórmula nos dois lugares foi como a
 * capacidade passou a medir a coisa errada uma vez; aqui ela é uma só.
 *
 * Regra: produto sem peso/volume no cadastro marca `semPeso`/`semVolume` — a
 * parada fica sem o dado, e quem chama DECLARA a restrição como não aplicada.
 * Ausência nunca vira zero silencioso.
 */
import type { ItemDaCargaParaParada, ParadaDaRota } from "@/lib/rotas/paradas";

export interface DemandaDaParada {
  peso_kg: number;
  volume_m3: number;
  semPeso: boolean;
  semVolume: boolean;
}

const arredondar = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;

export function demandasPorParada(
  itens: ItemDaCargaParaParada[],
  paradas: ParadaDaRota[],
): Map<string, DemandaDaParada> {
  const porShipmentOrder = new Map<string, DemandaDaParada>();
  for (const item of itens) {
    let peso = 0;
    let volume = 0;
    let semPeso = false;
    let semVolume = false;
    for (const produto of item.itens ?? []) {
      const qtd = Number(produto.quantidade ?? 0);
      if (produto.peso_unit_kg == null) semPeso = true;
      else peso += qtd * produto.peso_unit_kg;
      if (produto.volume_unit_m3 == null) semVolume = true;
      else volume += qtd * produto.volume_unit_m3;
    }
    porShipmentOrder.set(item.shipment_order_id, {
      peso_kg: arredondar(peso, 3),
      volume_m3: arredondar(volume, 6),
      semPeso,
      semVolume,
    });
  }

  const resultado = new Map<string, DemandaDaParada>();
  for (const parada of paradas) {
    let peso = 0;
    let volume = 0;
    let semPeso = false;
    let semVolume = false;
    for (const pedido of parada.pedidos) {
      const demanda = porShipmentOrder.get(pedido.shipment_order_id);
      if (!demanda) continue;
      peso += demanda.peso_kg;
      volume += demanda.volume_m3;
      semPeso ||= demanda.semPeso;
      semVolume ||= demanda.semVolume;
    }
    resultado.set(parada.chave, {
      peso_kg: arredondar(peso, 3),
      volume_m3: arredondar(volume, 6),
      semPeso,
      semVolume,
    });
  }
  return resultado;
}
