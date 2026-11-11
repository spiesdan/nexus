/**
 * QUEM JÁ COMPROU NUMA REGIÃO — a audiência da campanha por cidade.
 *
 * ═══ A PERGUNTA ═══════════════════════════════════════════════════════════
 *
 * "Quais clientes já foram atendidos nas cidades que eu escolhi?" A resposta
 * NÃO mora no pedido: `commercial_orders` não guarda cidade. Mora no CONTATO
 * (`contacts.cidade` / `contacts.uf`), e o pedido é o que prova o atendimento.
 *
 * Por isso a função lê os pedidos e cruza com o cadastro:
 *
 *   1. qualquer pedido NÃO CANCELADO conta como "já atendemos" — a mesma régua
 *      do radar de inativos (`lib/comercial/inativos.ts`). Rascunho, aprovado,
 *      faturado, concluído, expedido, entregue: todos provam que a loja atendeu
 *      aquela pessoa naquela cidade.
 *   2. o contato entra UMA vez, somando todos os pedidos daquela cidade.
 *   3. veto de contato é o MESMO do resto do produto (`contatoPodeReceber`):
 *      STOP, recusa de marketing, anonimizado ou mesclado não recebem campanha.
 *
 * ═══ A COMPARAÇÃO DE CIDADE É FEITA AQUI, NÃO NO BANCO ════════════════════
 *
 * A base tem "Caçador" e "Cacador", "São Bento" e "Sao Bento". O PostgREST não
 * sabe disso, então a comparação usa `chaveDeCidade` (sem acento, sem caixa) —
 * a MESMA função do público da base. Se fosse `eq` no banco, escolher a cidade
 * na tela deixaria gente de fora em silêncio.
 *
 * ═══ O QUE ESTA FUNÇÃO NÃO DECIDE ═════════════════════════════════════════
 *
 * Reserva de campanha. Um contato já reservado por outra campanha não pode
 * entrar nesta (trigger da 0277); a borda cruza as duas listas com
 * `idsReservadosPorOutras`. Aqui só se responde "quem já comprou nesta região".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizaTelefone } from "@/lib/contacts/csv";
import { contatoPodeReceber } from "@/lib/comercial/inativos";
import { chaveDeCidade } from "@/lib/prospeccao/publico-da-base";

/** Teto de PEDIDOS varridos — 20 páginas de 1.000, com ordem estável. */
const PAGINA = 1_000;
const MAX_PAGINAS = 20;
/** Teto de CONTATOS devolvidos — o mesmo teto do `contato_ids` no schema. */
export const LIMITE_DE_CLIENTES = 10_000;

/** E.164 mínimo que o motor exige (`escolherContato`). */
const TELEFONE_VALIDO = /^\+\d{8,15}$/;

export interface CidadeDaCampanha {
  cidade: string;
  estado?: string | null;
}

export interface ClienteDaRegiao {
  contact_id: string;
  nome: string;
  /** Como está no cadastro — a tela mostra; o motor normaliza de novo. */
  telefone: string | null;
  /** `null` = não dá para mandar (sem telefone ou fora do E.164). */
  telefone_e164: string | null;
  cidade: string;
  uf: string | null;
  pedidos: number;
  total_cents: number;
  ultimo_pedido_em: string;
}

export interface CidadeComCliente {
  cidade: string;
  uf: string | null;
  /** Quantos contatos daquela cidade já têm pedido (não quantos pedidos). */
  total: number;
}

export interface ResultadoDeClientesPorRegiao {
  lista: ClienteDaRegiao[];
  /** Pedidos lidos até o teto — é o denominador da varredura. */
  pedidos_lidos: number;
  /** `false` = havia mais pedidos do que o teto; a tela não pode dizer "todos". */
  completa: boolean;
}

interface ContatoBruto {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  cidade: string | null;
  uf: string | null;
  is_blocked: boolean;
  is_anonymized: boolean;
  is_merged_into: string | null;
  consent: { marketing?: { declined_at?: string | null } | null } | null;
}

interface PedidoComContato {
  contact_id: string | null;
  total_cents: number;
  created_at: string;
  contacts: ContatoBruto | ContatoBruto[] | null;
}

/** A UF só entra na conta quando a campanha declarou uma. */
function ufCombina(ufDoContato: string | null, ufDoCriterio: string | null | undefined): boolean {
  if (ufDoCriterio === null || ufDoCriterio === undefined || ufDoCriterio.trim() === "") {
    return true;
  }
  return (ufDoContato ?? "").trim().toUpperCase() === ufDoCriterio.trim().toUpperCase();
}

/** O contato mora em UMA das cidades escolhidas? (acento e caixa fora) */
export function cidadeCombina(
  cidade: string | null | undefined,
  uf: string | null | undefined,
  criterios: readonly CidadeDaCampanha[],
): boolean {
  const nome = (cidade ?? "").trim();
  if (nome === "") return false;
  if (criterios.length === 0) return true;
  const chave = chaveDeCidade(nome);
  return criterios.some(
    (c) => chaveDeCidade(c.cidade) === chave && ufCombina(uf ?? null, c.estado),
  );
}

/** Uma linha por contato, com a contagem por cidade preservando a primeira grafia. */
export function agruparPorCidade(
  lista: readonly ClienteDaRegiao[],
): CidadeComCliente[] {
  const porChave = new Map<string, CidadeComCliente>();
  for (const cliente of lista) {
    const chave = `${chaveDeCidade(cliente.cidade)}|${(cliente.uf ?? "").trim().toUpperCase()}`;
    const atual = porChave.get(chave);
    if (atual) atual.total += 1;
    else porChave.set(chave, { cidade: cliente.cidade, uf: cliente.uf, total: 1 });
  }
  return [...porChave.values()].sort(
    (a, b) => b.total - a.total || a.cidade.localeCompare(b.cidade, "pt-BR"),
  );
}

/** O embed pode vir como objeto ou array — normaliza sem perder a linha. */
function contatoDoPedido(pedido: PedidoComContato): ContatoBruto | null {
  const bruto = Array.isArray(pedido.contacts) ? pedido.contacts[0] : pedido.contacts;
  return bruto ?? null;
}

/**
 * Lista os clientes com pedido não cancelado nas cidades escolhidas.
 *
 * `cidades: []` (ou omitido) = todas: é o que a rota de cidades usa para montar
 * as opções da tela com a contagem real.
 */
export async function listarClientesPorRegiao(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    cidades?: readonly CidadeDaCampanha[];
    limite?: number;
  },
): Promise<ResultadoDeClientesPorRegiao> {
  const cidades = input.cidades ?? [];
  const limite = Math.min(
    Math.max(input.limite ?? LIMITE_DE_CLIENTES, 1),
    LIMITE_DE_CLIENTES,
  );

  const porContato = new Map<
    string,
    {
      contato: ContatoBruto;
      pedidos: number;
      total_cents: number;
      ultimo_pedido_em: string;
    }
  >();
  let pedidosLidos = 0;
  let completa = true;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const de = pagina * PAGINA;
    const { data, error } = await supabase
      .from("commercial_orders")
      .select(
        "contact_id, total_cents, created_at, " +
          "contacts!inner(id, name, display_name, phone_number, cidade, uf, " +
          "is_blocked, is_anonymized, is_merged_into, consent)",
      )
      .eq("organization_id", input.organizationId)
      // A mesma organização DENTRO do contato: o `!inner` só traz pedido cujo
      // contato é desta organização — um vínculo cross-tenant não vira público.
      .eq("contacts.organization_id", input.organizationId)
      .neq("status", "cancelado")
      .not("contact_id", "is", null)
      // Ordem estável: `created_at` sozinho empata, e o `range` pularia ou
      // repetiria linha. O mesmo defeito que a `opcoes` já documentou.
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);

    if (error) throw new Error(`pedidos_indisponiveis: ${error.message}`);
    const lote = (data ?? []) as unknown as PedidoComContato[];
    pedidosLidos += lote.length;

    for (const pedido of lote) {
      if (!pedido.contact_id) continue;
      const contato = contatoDoPedido(pedido);
      if (!contato) continue;
      if (!contatoPodeReceber(contato)) continue;
      if (!cidadeCombina(contato.cidade, contato.uf, cidades)) continue;

      const atual = porContato.get(pedido.contact_id);
      if (atual) {
        atual.pedidos += 1;
        atual.total_cents += pedido.total_cents;
        // A varredura vem em ordem decrescente; o primeiro é o mais recente.
      } else {
        porContato.set(pedido.contact_id, {
          contato,
          pedidos: 1,
          total_cents: pedido.total_cents,
          ultimo_pedido_em: pedido.created_at,
        });
      }
    }

    if (lote.length < PAGINA) break;
    if (pagina === MAX_PAGINAS - 1) completa = false;
  }

  const lista = [...porContato.entries()]
    .map(([contact_id, v]): ClienteDaRegiao => {
      const normalizado = v.contato.phone_number
        ? normalizaTelefone(v.contato.phone_number)
        : null;
      return {
        contact_id,
        nome:
          v.contato.display_name ?? v.contato.name ?? v.contato.phone_number ?? "Sem nome",
        telefone: v.contato.phone_number,
        telefone_e164: normalizado !== null && TELEFONE_VALIDO.test(normalizado) ? normalizado : null,
        cidade: (v.contato.cidade ?? "").trim(),
        uf: (v.contato.uf ?? "").trim() || null,
        pedidos: v.pedidos,
        total_cents: v.total_cents,
        ultimo_pedido_em: v.ultimo_pedido_em,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(b.ultimo_pedido_em) - Date.parse(a.ultimo_pedido_em) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );

  const cortada = lista.length > limite;
  return {
    lista: cortada ? lista.slice(0, limite) : lista,
    pedidos_lidos: pedidosLidos,
    completa: completa && !cortada,
  };
}
