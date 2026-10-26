/**
 * A LISTA DE CLIENTES INATIVOS — uma só, para o Radar e para a campanha.
 *
 * O Radar (`/app/radar`) e a campanha de recuperação precisam responder à
 * MESMA pergunta: "quem comprava e parou de comprar há pelo menos N dias?".
 * Antes esta consulta vivia dentro da rota `/comercial/inativos`; a prévia da
 * campanha teria uma segunda cópia e, no dia em que uma ganhasse um filtro
 * (opt-out, contato mesclado), a outra continuaria mandando para quem pediu
 * para sair. A função pura de classificação continua em `inatividade.ts`.
 *
 * O que a lista NÃO decide: se o contato já está em outra campanha. Reserva é
 * assunto de `prospeccao/reserva-de-campanha`; a borda cruza as duas listas.
 *
 * Veto de contato (regra dura nº 2, não invenção desta função):
 *   - `is_blocked` — o contato pediu STOP; é irrevogável;
 *   - `consent.marketing.declined_at` — recusou contato de marketing;
 *   - `is_anonymized` / `is_merged_into` — a linha não é mais uma pessoa
 *     alcançável (LGPD/merge). As mesmas checagens que a Venda Automática usa
 *     em `lib/venda-automatica/dedupe.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { porFatias } from "@/lib/db/por-fatias";

import { classificarInativo, type ClienteInativo } from "./inatividade";

/** Teto da leitura: volume de PME, não de marketplace (mesmo teto do Radar). */
export const LIMITE_DE_INATIVOS = 500;
/** Teto de pedidos varridos para achar a última compra de cada contato. */
const LIMITE_DE_PEDIDOS = 5000;

export interface ResultadoDeInativos {
  lista: ClienteInativo[];
  /** Quantos contatos tinham pelo menos uma compra na janela lida. */
  varridos: number;
  /** `false` = havia mais inativos do que o teto; a tela não pode dizer "todos". */
  completa: boolean;
}

interface ContatoBruto {
  id: string;
  display_name: string | null;
  name: string | null;
  phone_number: string | null;
  is_blocked: boolean;
  is_anonymized: boolean;
  is_merged_into: string | null;
  consent: { marketing?: { declined_at?: string | null } | null } | null;
}

/** O contato pode receber uma campanha? (opt-out, LGPD e merge) */
export function contatoPodeReceber(c: {
  is_blocked?: boolean | null;
  is_anonymized?: boolean | null;
  is_merged_into?: string | null;
  consent?: { marketing?: { declined_at?: string | null } | null } | null;
}): boolean {
  if (c.is_blocked === true) return false;
  if (c.is_anonymized === true) return false;
  if (c.is_merged_into) return false;
  if (c.consent?.marketing?.declined_at) return false;
  return true;
}

/**
 * Lista os inativos da organização, do maior score de recuperação para o menor.
 *
 * `agora` é injetável para o teste não depender do relógio. A janela de
 * inatividade é comparada com a ÚLTIMA compra (cancelado não é compra).
 */
export async function listarInativos(
  supabase: SupabaseClient,
  input: { organizationId: string; dias: number; limite?: number; agora?: Date },
): Promise<ResultadoDeInativos> {
  const limite = Math.min(
    Math.max(input.limite ?? LIMITE_DE_INATIVOS, 1),
    LIMITE_DE_INATIVOS,
  );
  const agora = input.agora ?? new Date();
  const corte = new Date(agora.getTime() - input.dias * 86400000).toISOString();

  const { data: pedidos, error: erroPedidos } = await supabase
    .from("commercial_orders")
    .select("contact_id, total_cents, created_at")
    .eq("organization_id", input.organizationId)
    .neq("status", "cancelado")
    .not("contact_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(LIMITE_DE_PEDIDOS);
  if (erroPedidos) throw new Error(`pedidos_indisponiveis: ${erroPedidos.message}`);

  const porContato = new Map<string, { ultima: string; total: number; qtd: number }>();
  for (const p of (pedidos ?? []) as unknown as {
    contact_id: string;
    total_cents: number;
    created_at: string;
  }[]) {
    const atual = porContato.get(p.contact_id);
    if (!atual) {
      porContato.set(p.contact_id, { ultima: p.created_at, total: p.total_cents, qtd: 1 });
    } else {
      atual.total += p.total_cents;
      atual.qtd += 1;
    }
  }

  const inativos: string[] = [];
  for (const [contactId, v] of porContato) {
    if (v.ultima < corte) inativos.push(contactId);
  }
  if (inativos.length === 0) return { lista: [], varridos: porContato.size, completa: true };

  // Os ids vão em FATIAS de 100: 500 UUIDs numa única URL dão 18.499 bytes e o
  // PostgREST responde `414 URI too long` (medido na VPS — o Radar mostrava
  // erro 500 com o banco são).
  const { linhas: contatosLidos, falhas } = await porFatias(
    inativos.slice(0, limite),
    async (fatia) => {
      const r = await supabase
        .from("contacts")
        .select(
          "id, display_name, name, phone_number, is_blocked, is_anonymized, is_merged_into, consent",
        )
        .eq("organization_id", input.organizationId)
        .in("id", fatia);
      return { linhas: (r.data ?? []) as never[], erro: r.error };
    },
  );
  if (falhas > 0 && contatosLidos.length === 0) {
    throw new Error("contatos_indisponiveis: todas as fatias falharam");
  }

  const lista = (contatosLidos as unknown as ContatoBruto[])
    .filter(contatoPodeReceber)
    .map((c) => {
      const v = porContato.get(c.id);
      if (!v) return null;
      const diasSem = Math.floor(
        (agora.getTime() - new Date(v.ultima).getTime()) / 86400000,
      );
      return classificarInativo(
        {
          contact_id: c.id,
          nome: c.display_name ?? c.name ?? c.phone_number ?? "Sem nome",
          telefone: c.phone_number,
        },
        diasSem,
        v.total,
        v.qtd,
      );
    })
    .filter((x): x is ClienteInativo => x !== null)
    .sort((a, b) => b.score - a.score);

  return {
    lista,
    varridos: porContato.size,
    // O teto corta os IDs ANTES da leitura; se a lista devolvida encheu o
    // limite, pode haver mais gente do lado de fora.
    completa: inativos.length < limite,
  };
}
