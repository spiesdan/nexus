/**
 * O ENDEREÇO DE ENTREGA — de onde ele sai, em uma decisão só.
 *
 * O romaneio (e a ficha da carga) liam só `commercial_orders.endereco_entrega`.
 * Medido na carga 022: os 22 pedidos tinham essa coluna NULL — e o cadastro do
 * cliente tinha endereço em 21 deles. O papel que o motorista leva dizia
 * "sem endereço" em toda parada, embora o destino existisse.
 *
 * A ordem de precedência não é gosto, é o que a operação já faz:
 * 1. `endereco_entrega` do pedido, quando alguém o digitou — é o destino
 *    daquele pedido, e vence o cadastro (entrega em obra, em outro depósito).
 *    Só vale se tiver rua de verdade (`linhaComRua`): snapshot importado sem
 *    logradouro não é escolha de destino, é dado velho.
 * 2. o endereço estruturado do contato (`logradouro`…`cep`), via
 *    `enderecoEmLinha`.
 * 3. o contato achado pelo CNPJ do pedido, para os importados que trouxeram o
 *    documento mas não o vínculo (`contact_id` NULL) — mesmo caminho que a
 *    fila de embarque usa para achar a cidade.
 *
 * Vazio de verdade devolve `null`. Quem escolhe o literal de ausência é a tela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { enderecoEmLinha, type EnderecoEstruturado } from "@/lib/contacts/endereco-em-linha";

export interface PedidoComEndereco {
  endereco_entrega?: string | null;
  contact_id?: string | null;
  cliente_documento?: string | null;
}

export interface ContatoDaEntrega extends EnderecoEstruturado {
  id: string;
  cnpj?: string | null;
  name?: string | null;
  display_name?: string | null;
}

export type ContatosDaEntrega = {
  porId: Map<string, ContatoDaEntrega>;
  porDocumento: Map<string, ContatoDaEntrega>;
};

/** Só CNPJ (14 dígitos) casa com `contacts.cnpj`; CPF não entra nessa busca. */
export function cnpjDoPedido(documento: string | null | undefined): string | null {
  const digitos = (documento ?? "").replace(/\D/g, "");
  return digitos.length === 14 ? digitos : null;
}

/**
 * O SNAPSHOT DO PEDIDO SÓ VALE SE TIVER RUA.
 *
 * `endereco_entrega` é gravado no faturamento a partir do cadastro. Quando o
 * cadastro ainda estava sem `logradouro`, o snapshot saiu começando com
 * vírgula (", 679 — INDUSTRIAL, Ponte Alta do Norte/SC") — medido em 658
 * pedidos desta instalação em 2026-11-05. Usar esse texto esconde a rua que o
 * cadastro tem HOJE e entrega à geocodificação uma linha sem alvo: a parada
 * some do mapa mesmo com endereço completo no cadastro.
 *
 * Rua = primeiro trecho (antes do "—") com alguma letra e que não começa em
 * vírgula. "RUA X, 10" e "KM 89" passam; ", 1919", ", SN" e "1919" não.
 * Snapshot sem rua não é ponto de entrega escolhido — é cadastro incompleto
 * do passado.
 */
export function linhaComRua(linha: string | null | undefined): string | null {
  const texto = (linha ?? "").trim();
  if (!texto) return null;
  const primeira = texto.split("—")[0]?.trim() ?? "";
  const temLetra = /\p{L}/u.test(primeira);
  const slotVazio = /^[,;]/.test(primeira);
  return temLetra && !slotVazio ? texto : null;
}

export function enderecoDaEntrega(
  pedido: PedidoComEndereco,
  contatos: ContatosDaEntrega,
): string | null {
  const escrito = linhaComRua(pedido.endereco_entrega);
  if (escrito) return escrito;

  return enderecoEmLinha(contatoDaEntrega(pedido, contatos) ?? null) || null;
}

/**
 * O CONTATO DONO DA ENTREGA — vínculo primeiro, CNPJ depois.
 *
 * Existe como função própria porque o nome e a cidade da parada têm que sair
 * do MESMO contato que o endereço. Resolver cada um por um caminho era como o
 * romaneio dizia "BILL COMERCIO DE ESTOPAS - PATRICIA..." (o nome congelado
 * no pedido, de quando ele foi importado) para um cadastro que já se chamava
 * "PATRICIA DE FATIMA DA SILVA" — medido: 109 dos 393 pedidos abertos têm o
 * nome do pedido diferente do cadastro.
 */
export function contatoDaEntrega(
  pedido: PedidoComEndereco,
  contatos: ContatosDaEntrega,
): ContatoDaEntrega | undefined {
  const porId = pedido.contact_id ? contatos.porId.get(pedido.contact_id) : undefined;
  const cnpj = cnpjDoPedido(pedido.cliente_documento);
  return porId ?? (cnpj ? contatos.porDocumento.get(cnpj) : undefined);
}

/**
 * O NOME QUE O PAPEL MOSTRA — o do cadastro, não o congelado no pedido.
 *
 * Quem muda o nome do cliente muda no cadastro (foi o que o dono fez no
 * 19341). `commercial_orders.cliente_nome` é foto do dia da importação e
 * envelhece: 109 dos 393 pedidos abertos já divergiam. O pedido fica como
 * reserva para quando não há vínculo nem CNPJ que levem a um contato.
 */
export function nomeDaEntrega(
  pedido: PedidoComEndereco & { cliente_nome?: string | null },
  contatos: ContatosDaEntrega,
): string {
  const contato = contatoDaEntrega(pedido, contatos);
  const doCadastro = (contato?.display_name ?? contato?.name ?? "").trim();
  if (doCadastro) return doCadastro;
  return (pedido.cliente_nome ?? "").trim();
}

/**
 * A CIDADE DA PARADA, para separar a carga por cidade.
 *
 * Sai do mesmo contato do endereço. O `uf` do cadastro é o que fecha
 * "MAFRA/SC"; quando ele falta, a cidade vai sozinha. Há cadastro com a cidade
 * escrita por extenso ("Mafra, Santa Catarina") — a parte antes da vírgula é a
 * cidade, e o resto não vira UF por adivinhação.
 */
export function cidadeDaEntrega(
  pedido: PedidoComEndereco,
  contatos: ContatosDaEntrega,
): string | null {
  const contato = contatoDaEntrega(pedido, contatos);
  const bruta = ((contato?.cidade ?? "").split(",")[0] ?? "").replace(/\s+/g, " ").trim();
  if (!bruta) return null;
  const uf = (contato?.uf ?? "").trim().toUpperCase();
  return uf.length === 2 ? `${bruta}/${uf}` : bruta;
}

const COLUNAS_DO_CONTATO =
  "id, cnpj, name, display_name, logradouro, numero_end, complemento, bairro, cidade, uf, cep";

/**
 * Carrega os contatos que podem resolver o endereço de uma lista de pedidos:
 * uma consulta por `contact_id`, outra por CNPJ dos que não têm vínculo.
 */
export async function carregarContatosDaEntrega(
  supabase: SupabaseClient,
  organizationId: string,
  pedidos: readonly PedidoComEndereco[],
): Promise<ContatosDaEntrega> {
  const ids = [...new Set(pedidos.map((p) => p.contact_id).filter((v): v is string => Boolean(v)))];
  const documentos = [
    ...new Set(
      pedidos
        .filter((p) => !p.contact_id)
        .map((p) => cnpjDoPedido(p.cliente_documento))
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const [{ data: porId }, { data: porDocumento }] = await Promise.all([
    ids.length
      ? supabase
          .from("contacts")
          .select(COLUNAS_DO_CONTATO)
          .eq("organization_id", organizationId)
          .in("id", ids)
      : Promise.resolve({ data: [] as ContatoDaEntrega[] }),
    documentos.length
      ? supabase
          .from("contacts")
          .select(COLUNAS_DO_CONTATO)
          .eq("organization_id", organizationId)
          .in("cnpj", documentos)
      : Promise.resolve({ data: [] as ContatoDaEntrega[] }),
  ]);

  return {
    porId: new Map(((porId ?? []) as ContatoDaEntrega[]).map((c) => [c.id, c])),
    porDocumento: new Map(
      ((porDocumento ?? []) as ContatoDaEntrega[])
        .filter((c) => cnpjDoPedido(c.cnpj))
        .map((c) => [cnpjDoPedido(c.cnpj) as string, c]),
    ),
  };
}
