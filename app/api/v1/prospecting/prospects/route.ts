/**
 * GET /api/v1/prospecting/prospects — a tabela (§14 do plano).
 *
 * Filtros: categoria, cidade, estado, com_telefone, com_website,
 * com_whatsapp, nota_min, avaliacoes_min, origem(provider), status_comercial
 * (aceita lista separada por vírgula — o Radar da FASE 11 pediu
 * "novo,nao_analisado" de uma vez), so_sem_cliente (ainda não é cliente),
 * busca (nome/telefone/cidade/website), id (UM prospect pelo id — o "Abrir"
 * do Radar, FASE 11: o drawer da Prospecção abre por deep-link
 * `?prospect=<uuid>` mesmo fora da janela da lista),
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
import { logger } from "@/lib/logger";
import { classificarProspect } from "@/lib/prospeccao/classificacao";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { categoriasQueCasam } from "@/lib/prospeccao/categoria-pt";
import { valoresDoParametro } from "@/lib/prospeccao/parametros";
import { COLUNAS_DO_PROSPECT, STATUS_COMERCIAL } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LIMITE_CRUZAMENTO = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Um valor dentro de um `.or()` do PostgREST.
 *
 * A cláusula é separada por vírgula e agrupada por parêntese, então valor que
 * tenha vírgula ou parêntese PRECISA vir entre aspas — e valor entre aspas não
 * pode conter aspas. Só aspas quando necessário: os rótulos do Google quase
 * nunca têm vírgula, e sem aspas a cláusula fica legível no log.
 */
function valorParaOr(valor: string): string {
  return /[(),"]/.test(valor) ? `"${valor.replace(/"/g, "")}"` : valor;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  // Categoria aceita VÁRIOS valores (repetição do parâmetro: `?categoria=A&categoria=B`),
  // pela mesma porta do resto do contrato. Quem manda é a lista, não o primeiro.
  const categorias = valoresDoParametro(p.getAll("categoria"));
  const cidade = p.get("cidade")?.trim() ?? "";
  const estado = p.get("estado")?.trim() ?? "";
  const status = p.get("status")?.trim() ?? "";
  const soId = p.get("id")?.trim() ?? "";
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
  // "Prospectada há": quantos dias atras a empresa foi descoberta. O dado e o
  // `discovered_at` que o import grava; o filtro corta a lista por ele.
  const diasAtras = Number(p.get("prospectado_ha") ?? 0) || 0;
  const soSemCliente = p.get("so_sem_cliente") === "true";
  const minhaFila = p.get("minha_fila") === "true";
  const limite = Math.min(200, Math.max(1, Number(p.get("limite") ?? 50) || 50));
  // B3/FASE 15: paginação de verdade — offset estável (score desc, id como
  // desempate) e `meta.total` contando TODAS as linhas do recorte, não a
  // janela que coube na resposta.
  const offset = Math.max(0, Math.min(100000, Number(p.get("offset") ?? 0) || 0));

  const supabase = await createClient();
  const admin = createAdminClient();

  let idsDaBusca: string[] = [];
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
    idsDaBusca = ((vinculos ?? []) as { prospect_id: string }[]).map((v) => v.prospect_id);
    if (idsDaBusca.length === 0) return ok([], { requestId });
  }

  // "Abrir" do Radar (FASE 11): uuid puro, casa com ou sem os outros filtros
  // — id de outro tenant cai no where organization_id e volta vazio.
  if (soId && !UUID_RE.test(soId)) {
    return fail("validation_failed", "id inválido.", 400, { requestId });
  }

  // Seleção da prospecção (0269): a aba "nova campanha da seleção" precisa
  // mostrar as empresas marcadas. Lista fechada, teto de 500 — o mesmo da
  // campanha. Id inválido é descartado, não erro: colar URL com um id
  // digitado errado não pode derrubar a tela inteira.
  const idsParam = p.get("ids")?.trim() ?? "";
  const idsSelecao = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    .slice(0, 500);

  // Os MESMOS filtros nas duas queries (contagem exata + página) — a
  // contagem tem que responder pela mesma recorte que a lista.
  const montar = (colunas: string, opts?: { count?: "exact"; head?: boolean }) => {
    let q = supabase
      .from("business_prospects")
      .select(colunas, opts)
      .eq("organization_id", authz.org.orgId)
      .eq("bloqueado", false);
    if (buscaId) q = q.in("id", idsDaBusca);
    if (soId) q = q.eq("id", soId);
    if (idsSelecao.length > 0) q = q.in("id", idsSelecao);
    // ═══ CATEGORIA: o termo chega em PORTUGUÊS, o banco guarda em INGLÊS ═══
    //
    // Este filtro já foi um defeito meu. Ele comparava `categoria ilike
    // '%termo%'` contra o valor gravado, e o valor gravado é o rótulo da API
    // do Google Maps — "Auto repair shop". Eu anunciei que digitar "mecanica"
    // traria "Auto repair shop" e não trazia: `ilike` compara letra a letra e
    // "mecanica" não é substring de "auto repair shop".
    //
    // `categoriasQueCasam` traduz o termo de volta para os valores em inglês
    // que ele descreve (ver `lib/prospeccao/categoria-pt.ts`, 533 categorias
    // medidas no banco). O `in` abaixo é o que casa.
    //
    // E o fallback: se a tradução não achou nada, filtra por `ilike` no valor
    // gravado. Sem ele, digitar uma categoria que chegou do Google hoje e não
    // está na tabela devolveria lista vazia — o filtro apareceria quebrado
    // quando o problema é só uma linha a mais no mapa.
    //
    // VÁRIAS categorias são a UNIÃO, nunca a interseção: `categoria` guarda um
    // rótulo só, então "E" entre duas categorias daria lista vazia sempre. Quem
    // marca Oficina + Borracharia + Autopeças quer as três na tela.
    if (categorias.length > 0) {
      const traduzidas = new Set<string>();
      const semTraducao: string[] = [];
      for (const termo of categorias) {
        const emIngles = categoriasQueCasam(termo);
        if (emIngles.length > 0) for (const v of emIngles) traduzidas.add(v);
        else semTraducao.push(termo);
      }
      const lista = [...traduzidas].slice(0, 200);

      if (semTraducao.length === 0) {
        q = q.in("categoria", lista);
      } else {
        // Categoria desconhecida ainda tem que filtrar. Sem este caminho,
        // marcar uma categoria que a tabela PT↔EN não conhece junto de outra
        // conhecida devolveria só a conhecida — em silêncio.
        const partes = [
          ...(lista.length > 0 ? [`categoria.in.(${lista.map(valorParaOr).join(",")})`] : []),
          ...semTraducao.map((termo) => `categoria.ilike.${valorParaOr(`%${termo}%`)}`),
        ];
        q = q.or(partes.join(","));
      }
    }
    if (cidade) q = q.ilike("cidade", `%${cidade}%`);
    if (estado) q = q.eq("estado", estado.toUpperCase());
    if (status !== "") {
      // Lista por vírgula (Radar): cada item tem que estar no vocabulário;
      // o que não estiver cai fora (mesmo silêncio do filtro único antigo).
      const statuses = status
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "" && (STATUS_COMERCIAL as readonly string[]).includes(s));
      if (statuses.length > 0) q = q.in("status_comercial", statuses);
    }
    if (origem) q = q.eq("provider", origem);
    if (comTelefone) q = q.not("telefone_normalizado", "is", null);
    if (semTelefone) q = q.is("telefone_normalizado", null);
    if (comWebsite) q = q.not("website", "is", null);
    if (semWebsite) q = q.is("website", null);
    if (comWhatsapp) q = q.eq("whatsapp_potencial", true);
    if (notaMin > 0) q = q.gte("nota", notaMin);
    if (avalMin > 0) q = q.gte("total_avaliacoes", avalMin);
    if (diasAtras > 0) {
      // O corte e por `>=` em UTC: "hoje" tem que trazer o que entrou hoje,
      // e a data gravada tem hora — cortar em meia-noite perderia o dia.
      const desde = new Date(Date.now() - diasAtras * 86_400_000).toISOString();
      q = q.gte("discovered_at", desde);
    }
    if (soSemCliente) q = q.is("contact_id", null);
    if (minhaFila) q = q.eq("owner_user_id", authz.user.id);
    if (busca) {
      q = q.or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%,cidade.ilike.%${busca}%,website.ilike.%${busca}%`);
    }
    return q;
  };

  const [contagem, listaRes] = await Promise.all([
    montar(COLUNAS_DO_PROSPECT, { count: "exact", head: true }),
    // Ordem estável ANTES do range: score desc com id como desempate — sem
    // ela o Postgrest devolve páginas em ordem arbitrária e o offset repete
    // ou pula linha (B3/FASE 15).
    montar(COLUNAS_DO_PROSPECT)
      .order("score", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1),
  ]);
  if (contagem.error || listaRes.error) {
    logger.error("[prospecting.prospects] falha ao listar prospects", {
      requestId,
      organization_id: authz.org.orgId,
      erro: (contagem.error ?? listaRes.error)?.message ?? "sem erro capturado",
    });
    return fail("internal_error", "Erro ao listar prospects.", 500, { requestId });
  }

  const linhas = (listaRes.data ?? []) as unknown as {
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

  const total = contagem.count ?? linhas.length;
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
    {
      requestId,
      meta: { total, limite, offset, has_more: offset + linhas.length < total },
    },
  );
}
