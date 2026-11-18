/**
 * GET /api/v1/contacts/cidades — cidades distintas da organização ativa.
 *
 * ─── Por que existe ────────────────────────────────────────────────────────
 *
 * O filtro de cidade precisa de opções que EXISTEM na carteira. Montar a lista
 * a partir da página carregada daria um seletor que muda conforme o scroll e
 * esconde cidades que nenhum contato da primeira página tem. Aqui a fonte é o
 * banco, com o MESMO recorte da lista (não mesclado, não anonimizado) e a mesma
 * fronteira de organização.
 *
 * ─── Por que pagina ────────────────────────────────────────────────────────
 *
 * O Supabase/PostgREST corta a resposta em `max-rows` (1.000 por padrão). Uma
 * organização com 3.000 contatos em 40 cidades teria as opções truncadas em
 * silêncio se a rota pedisse tudo de uma vez. O laço lê páginas de 1.000
 * ordenadas por `cidade,id` (ordem total, paginação estável) até a página vir
 * incompleta, com teto de 20 páginas.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { cidadesUnicas } from "@/lib/contacts/cidades";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TAMANHO_DA_PAGINA = 1_000;
const MAX_PAGINAS = 20;

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const linhas: { cidade: string | null }[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * TAMANHO_DA_PAGINA;
    const { data, error } = await supabase
      .from("contacts")
      .select("cidade")
      .eq("organization_id", authz.org.orgId)
      // Mesmo recorte da lista: contato mesclado é ponteiro e anonimizado é
      // dado que a LGPD mandou apagar — nenhum dos dois oferece cidade.
      .eq("is_anonymized", false)
      .is("is_merged_into", null)
      .not("cidade", "is", null)
      .neq("cidade", "")
      .order("cidade", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + TAMANHO_DA_PAGINA - 1);

    if (error) return fail("internal_error", error.message, 500, { requestId });

    const paginaAtual = (data ?? []) as { cidade: string | null }[];
    linhas.push(...paginaAtual);
    if (paginaAtual.length < TAMANHO_DA_PAGINA) break;
  }

  return ok(cidadesUnicas(linhas), { requestId });
}
