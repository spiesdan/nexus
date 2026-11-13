/**
 * O DESTINO DA ENTREGA — identidade estável do endereço, com snapshot.
 *
 * O problema que isto resolve (prompt §2): até aqui, coordenada e geocodificação
 * moravam em `contacts`. Dois pedidos do MESMO cliente para endereços
 * diferentes já viravam duas paradas na lista (`agruparParadas`), mas caíam no
 * mesmo pino do mapa — porque o pino era do contato, não do endereço. Corrigir
 * um pino movia o outro, e mudar o cadastro do cliente movia silenciosamente o
 * destino de uma entrega já planejada.
 *
 * A regra: o destino é o ENDEREÇO EFETIVO do pedido no momento em que ele
 * entra na carga. Desse momento em diante ele é imutável — o cadastro do
 * cliente pode mudar à vontade que a entrega histórica não se mexe. Mudou o
 * endereço? Muda a chave, nasce outro destino, e a parada antiga fica onde
 * estava.
 *
 * Quem NÃO mora aqui: nome do cliente, telefone, itens (são do contato/pedido),
 * e a atribuição de veículo (é da parada, migration 0307).
 */
import { enderecoEmLinha } from "@/lib/contacts/endereco-em-linha";
import { linhaComRua } from "@/lib/expedicao/endereco-da-entrega";

export interface ContatoParaDestino {
  id: string;
  logradouro: string | null;
  numero_end: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geo_fonte?: string | null;
}

export interface SnapshotDoDestino {
  contact_id: string | null;
  /** Chave de agrupamento — a MESMA que `agruparParadas` usa para a parada. */
  chave: string;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string;
  geo_fonte: string | null;
}

/**
 * Normaliza o nome do cliente avulso exatamente como `agruparParadas` faz.
 * Duas normalizações diferentes criariam duas paradas para a mesma porta.
 */
export function nomeAvulsoNormalizado(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A chave do destino. `contact_id` identifica o CLIENTE; o endereço identifica
 * o DESTINO. Sem endereço, a chave cai no cliente (comportamento antigo) — e
 * nesse caso não há snapshot geográfico para herdar, o que a tela declara.
 */
export function chaveDoDestino(contactId: string | null, nomeCliente: string, endereco: string | null): string {
  const base = contactId ?? `avulso:${nomeAvulsoNormalizado(nomeCliente)}`;
  const destino = (endereco ?? "").trim();
  return destino ? `${base}::${destino}` : base;
}

/**
 * O endereço efetivo do pedido: o do pedido quando tem rua; senão o do
 * cadastro. Mesma prioridade de `_carga.ts` — a parada e o destino não podem
 * discordar sobre qual endereço é o da entrega.
 */
export function enderecoEfetivo(enderecoDoPedido: string | null, contato: ContatoParaDestino | null): string | null {
  return linhaComRua(enderecoDoPedido) ?? enderecoEmLinha(contato) ?? null;
}

/**
 * O snapshot do destino a partir do cadastro. `endereco` é a linha formatada
 * (a identidade); as partes soltas vêm do contato para o romaneio e a tela não
 * precisarem reprocessar texto.
 */
export function snapshotDoDestino(
  contato: ContatoParaDestino | null,
  nomeCliente: string,
  enderecoDoPedido: string | null,
): SnapshotDoDestino {
  const endereco = enderecoEfetivo(enderecoDoPedido, contato);
  return {
    contact_id: contato?.id ?? null,
    chave: chaveDoDestino(contato?.id ?? null, nomeCliente, endereco),
    endereco,
    numero: contato?.numero_end ?? null,
    complemento: contato?.complemento ?? null,
    bairro: contato?.bairro ?? null,
    cidade: contato?.cidade ?? null,
    uf: contato?.uf ?? null,
    cep: contato?.cep ?? null,
    latitude: contato?.latitude ?? null,
    longitude: contato?.longitude ?? null,
    // Sem endereço não há o que geocodificar: já nasce "não encontrado", em
    // vez de "pendente" para sempre (pendente sem alvo é fila infinita).
    geo_status: endereco ? (contato?.latitude != null ? "ok" : "pendente") : "nao_encontrado",
    geo_fonte: contato?.latitude != null ? (contato.geo_fonte ?? null) : null,
  };
}
