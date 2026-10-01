/**
 * GET /api/v1/prospecting/prospects — a tabela (§14 do plano).
 *
 * Filtros: categoria, cidade, estado, com_telefone, com_website,
 * com_whatsapp, nota_min, avaliacoes_min, origem(provider), status_comercial,
 * so_sem_cliente (ainda não é cliente), busca (nome/telefone/cidade/website),
 * busca_id (somente os prospects de UMA busca — o "Ver empresas" da aba
 * Pesquisas, B1 da spec 19: uuid nunca vai para o campo de texto),
 * minha_fila (só os que tenho como dono — item 16; o dono vem do authz,
 * nunca da query string: não existe "fila de outra pessoa" como parâmetro).
 *
 * Cruzamento com a base (§9) em lote, 3 queries, nunca N+1: contacts
 * (telefone/email → "já é cliente") + crm_leads (lead_id ou contato → lead,
 * aberto?). Daí nasce `classificacao` (§10, derivada por linha — D13 da spec
 * 19). As verdades vêm do service role com organization_id explícito: é
 * verdade do TENANT, não do recorte de RLS de quem está olhando — um viewer
 * com visão parcial não pode ser mandado a "abordar" um cliente existente.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { classificarProspect } from "@/lib/prospeccao/classificacao";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { COLUNAS_DO_PROSPECT, STATUS_COMERCIAL } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LIMITE_CRUZAMENTO = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const categoria = p.get("categoria")?.trim() ?? "";
  const cidade = p.get("cidade")?.trim() ?? "";
  const estado = p.get("estado")?.trim() ?? "";
  const status = p.get("status")?.trim() ?? "";
  const origem = p.get("origem")?.trim() ?? "";
  const busca = p.get("busca")?.trim() ?? "";
  const buscaId = p.get("busca_id")?.trim() ?? "";
  const comTelefone = p.get("com_telefone") === "true";
  const semTelefone = p.get("sem_telefone") === "true";
  const comWebsite = p.get("com_website") === "true";
  const semWebsite = p.get("sem_website") === "true";
  const comWhatsapp = p.get("com_whatsapp") === "true";
  const notaMin = Number(p.get("nota_min") ?? 0) || 0;
  const avalMin = Number(p.get("avaliacoes_min") ?? 0) || 0;
  const soSemCliente = p.get("so_sem_cliente") === "true";
  const minhaFila = p.get("minha_fila") === "true";
  const limite = Math.min(200, Math.max(1, Number(p.get("limite") ?? 50) || 50));

  const supabase = await createClient();
  const admin = createAdminClient();
  let q = supabase
    .from("business_prospects")
    .select(COLUNAS_DO_PROSPECT)
    .eq("organization_id", authz.org.orgId)
    .eq("bloqueado", false);

  // "Ver empresas" desta busca (B1): ponte busca↔prospect, com a busca
  // precisa existir para este tenant — busca de outro org responde vazio,
  // sem vazar nem confirmar existência.
  if (buscaId) {
    if (!UUID_RE.test(buscaId)) {
      return fail("validation_failed", "busca_id inválido.", 400, { requestId });
    }
    const { data: buscaRow } = await admin
      .from("prospecting_searches")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", buscaId)
      .maybeSingle();
    if (!buscaRow) return ok([], { requestId });
    const { data: vinculos } = await admin
      .from("prospect_search_results")
      .select("prospect_id")
      .eq("organization_id", authz.org.orgId)
      .eq("search_id", buscaId)
      .limit(LIMITE_CRUZAMENTO);
    const idsDaBusca = ((vinculos ?? []) as { prospect_id: string }[]).map((v) => v.prospect_id);
    if (idsDaBusca.length === 0) return ok([], { requestId });
    q = q.in("id", idsDaBusca);
  }

  if (categoria) q = q.eq("categoria", categoria);
  if (cidade) q = q.ilike("cidade", `%${cidade}%`);
  if (estado) q = q.eq("estado", estado.toUpperCase());
  if (status !== "" && (STATUS_COMERCIAL as readonly string[]).includes(status)) {
    q = q.eq("status_comercial", status);
  }
  if (origem) q = q.eq("provider", origem);
  if (comTelefone) q = q.not("telefone_normalizado", "is", null);
  if (semTelefone) q = q.is("telefone_normalizado", null);
  if (comWebsite) q = q.not("website", "is", null);
  if (semWebsite) q = q.is("website", null);
  if (comWhatsapp) q = q.eq("whatsapp_potencial", true);
  if (notaMin > 0) q = q.gte("nota", notaMin);
  if (avalMin > 0) q = q.gte("total_avaliacoes", avalMin);
  if (soSemCliente) q = q.is("contact_id", null);
  if (minhaFila) q = q.eq("owner_user_id", authz.user.id);
  if (busca) {
    q = q.or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%,cidade.ilike.%${busca}%,website.ilike.%${busca}%`);
  }

  const { data, error } = await q.order("score", { ascending: false }).limit(limite);
  if (error) return fail("internal_error", "Erro ao listar prospects.", 500, { requestId });

  const linhas = (data ?? []) as unknown as {
    id: string;
    contact_id: string | null;
    lead_id: string | null;
    telefone: string | null;
    email: string | null;
    status_comercial: string;
  }[];

  // --- Verdades do CRM em lote (§9), service role + organization_id explícito.
  const fones = [...new Set(linhas.map((l) => l.telefone).filter(Boolean))] as string[];
  const emails = [...new Set(linhas.map((l) => l.email).filter(Boolean))] as string[];

  // contacts → quem é cliente, e o id do contato para achar lead depois.
  const idPorFone = new Map<string, string>();
  const idPorEmail = new Map<string, string>();
  if (fones.length > 0 || emails.length > 0) {
    const conds: string[] = [];
    if (fones.length > 0) {
      const canonicos = [...new Set(fones.map((f) => canonicalPhoneBR(f)))];
      conds.push(`phone_number.in.(${canonicos.join(",")})`);
    }
    if (emails.length > 0) conds.push(`email.in.(${emails.join(",")})`);
    const { data: contatos } = await admin
      .from("contacts")
      .select("id, phone_number, email")
      .eq("organization_id", authz.org.orgId)
      .or(conds.join(","))
      .limit(LIMITE_CRUZAMENTO);
    for (const c of (contatos ?? []) as { id: string; phone_number: string | null; email: string | null }[]) {
      if (c.phone_number && !idPorFone.has(c.phone_number)) idPorFone.set(c.phone_number, c.id);
      if (c.email && !idPorEmail.has(c.email)) idPorEmail.set(c.email, c.id);
    }
  }

  // Contato correspondente por linha (vínculo direto vence o match).
  const contatoDaLinha = (l: (typeof linhas)[number]): string | null => {
    if (l.contact_id) return l.contact_id;
    if (l.telefone) {
      const id = idPorFone.get(canonicalPhoneBR(l.telefone));
      if (id) return id;
    }
    if (l.email) {
      const id = idPorEmail.get(l.email);
      if (id) return id;
    }
    return null;
  };

  // crm_leads → lead direto ou pelo contato; aberto = oportunidade em andamento.
  const leadIds = [...new Set(linhas.map((l) => l.lead_id).filter(Boolean))] as string[];
  const contatoIds = [
    ...new Set(linhas.map(contatoDaLinha).filter((id): id is string => id !== null)),
  ];
  const leadPorId = new Map<string, string>(); // leadId → status
  const contatosComLeadAberto = new Set<string>();
  const contatosComLead = new Set<string>();
  if (leadIds.length > 0 || contatoIds.length > 0) {
    const conds: string[] = [];
    if (leadIds.length > 0) conds.push(`id.in.(${leadIds.join(",")})`);
    if (contatoIds.length > 0) conds.push(`contact_id.in.(${contatoIds.join(",")})`);
    const { data: leads } = await admin
      .from("crm_leads")
      .select("id, contact_id, status")
      .eq("organization_id", authz.org.orgId)
      .or(conds.join(","))
      .limit(LIMITE_CRUZAMENTO);
    for (const ld of (leads ?? []) as { id: string; contact_id: string | null; status: string }[]) {
      leadPorId.set(ld.id, ld.status);
      if (ld.contact_id) {
        contatosComLead.add(ld.contact_id);
        if (ld.status === "open") contatosComLeadAberto.add(ld.contact_id);
      }
    }
  }

  const cliente = (l: (typeof linhas)[number], contatoId: string | null): boolean =>
    Boolean(l.contact_id) || contatoId !== null;

  return ok(
    linhas.map((l) => {
      const contatoId = contatoDaLinha(l);
      const statusLeadDireto = l.lead_id ? leadPorId.get(l.lead_id) : undefined;
      const temLead =
        statusLeadDireto !== undefined || (contatoId !== null && contatosComLead.has(contatoId));
      const leadAberto =
        statusLeadDireto === "open" ||
        (contatoId !== null && contatosComLeadAberto.has(contatoId));
      const crm = { cliente: cliente(l, contatoId), temLead, leadAberto };
      return {
        ...l,
        ja_e_cliente: crm.cliente,
        classificacao: classificarProspect(l.status_comercial, crm),
      };
    }),
    { requestId },
  );
}
