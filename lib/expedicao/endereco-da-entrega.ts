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

export function enderecoDaEntrega(
  pedido: PedidoComEndereco,
  contatos: ContatosDaEntrega,
): string | null {
  const escrito = (pedido.endereco_entrega ?? "").trim();
  if (escrito) return escrito;

  const porId = pedido.contact_id ? contatos.porId.get(pedido.contact_id) : undefined;
  const cnpj = cnpjDoPedido(pedido.cliente_documento);
  const contato = porId ?? (cnpj ? contatos.porDocumento.get(cnpj) : undefined);

  return enderecoEmLinha(contato ?? null) || null;
}

const COLUNAS_DO_CONTATO =
  "id, cnpj, logradouro, numero_end, complemento, bairro, cidade, uf, cep";

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
