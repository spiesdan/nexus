/**
 * GET /api/v1/contacts/cidades — municípios da organização ativa, canônicos.
 *
 * ─── O que mudou (bug do seletor listando empresa) ─────────────────────────
 *
 * Antes esta rota devolvia o valor CRU de `contacts.cidade` — inclusive
 * `AGROCOMERCIAL SCHULTZ LTDA ME` e as três grafias de "Canoinhas". Agora cada
 * valor passa por `municipioIbge(cidade, uf)`: o que é município vira o nome
 * oficial do IBGE + UF (`Canoinhas/SC`), o que não é fica de fora e é CONTADO
 * em `meta.sem_municipio`. O agrupamento e a ordem moram em
 * `lib/contacts/cidades.ts` (teste próprio).
 *
 * ─── Por que a resposta traz `variantes` ───────────────────────────────────
 *
 * Sem migration e sem `unaccent`, o filtro não consegue casar `União da
 * Vitória` com `UNIAO DA VITORIA` por igualdade simples. Cada opção leva as
 * grafias cruas vistas no banco, e a lista de contatos filtra com `IN (...)`
 * sobre elas. A fonte é o banco da própria organização — não o cliente.
 *
 * ─── Por que pagina ────────────────────────────────────────────────────────
 *
 * O Supabase/PostgREST corta a resposta em `max-rows` (1.000 por padrão). O
 * laço lê páginas de 1.000 ordenadas por `cidade,id` até a página vir
 * incompleta, com teto de 20 páginas. Contato sem cidade entra na leitura (é
 * ele que alimenta `sem_municipio`), mas não vira opção.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { cidadesCanonicas, type LinhaComCidade } from "@/lib/contacts/cidades";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TAMANHO_DA_PAGINA = 1_000;
const MAX_PAGINAS = 20;

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const linhas: LinhaComCidade[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * TAMANHO_DA_PAGINA;
    const { data, error } = await supabase
      .from("contacts")
      .select("cidade, uf")
      .eq("organization_id", authz.org.orgId)
      // Mesmo recorte da lista: contato mesclado é ponteiro e anonimizado é
      // dado que a LGPD mandou apagar — nenhum dos dois oferece cidade.
      .eq("is_anonymized", false)
      .is("is_merged_into", null)
      .order("cidade", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + TAMANHO_DA_PAGINA - 1);

    if (error) return fail("internal_error", error.message, 500, { requestId });

    const paginaAtual = (data ?? []) as LinhaComCidade[];
    linhas.push(...paginaAtual);
    if (paginaAtual.length < TAMANHO_DA_PAGINA) break;
  }

  const { cidades, sem_municipio } = cidadesCanonicas(linhas);

  return ok(cidades, {
    requestId,
    meta: {
      sem_municipio,
      // O total de contatos lidos: transparência para quem vê o número acima.
      total_contatos: linhas.length,
    },
  });
}
