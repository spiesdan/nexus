/**
 * GET /api/v1/prospecting/campaigns/[id]/controle — a tela de controle da campanha.
 *
 * ═══ O DEFEITO QUE ESTA ROTA CORRIGE ══════════════════════════════════════
 *
 * A aba Campanhas criava a campanha e mostrava um funil. Não mostrava a fila:
 * para quem já foi, quem falta, quem ficou sem comprovante de envio, nem as
 * empresas da base antes de reservar. O card "Ver público" era efêmero — fechou
 * a tela, sumiu. O dono precisava de um lugar persistente para acompanhar.
 *
 * A fonte da verdade é o par lista fechada + ledger:
 *
 *   campanha.prospect_ids / contato_ids  → a audiência reservada
 *   prospecting_sends                    → o que já saiu (message_id) e o que
 *                                          ficou reservado sem comprovante
 *
 * Quando a campanha ainda não tem lista fechada e usa a base, a rota roda o
 * MESMO `publicoDaBase` do disparo e devolve uma prévia honesta (`previa_base:
 * true`). Ela não reserva nada; a reserva acontece quando o operador agenda.
 *
 * A rota também resolve o `conversation_id` de cada envio confirmado (via
 * `messages.id`), para o botão "Abrir conversa" levar ao Inbox certo em vez de
 * obrigar o operador a procurar pelo telefone.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";
import { indiceDeClientes } from "@/lib/prospeccao/ja-cadastrada";
import {
  LIMITE_PADRAO,
  publicoDaBase,
  resumoDaBase,
  usaBase,
  type CidadeDaCampanha,
} from "@/lib/prospeccao/publico-da-base";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";
import { resumirEnvios, type EnvioDaCampanha } from "@/lib/prospeccao/resumo-de-envio";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, nome, objetivo, categorias, cidades, status, publico, fonte_publico, prospect_ids, " +
  "contato_ids, mensagens, espaco_ms, limite_diario, data_inicio, data_fim, janelas, " +
  "agendada_em, ultimo_envio_at, created_at";

interface Params {
  params: Promise<{ id: string }>;
}

interface CampanhaControle {
  id: string;
  nome: string;
  objetivo: string | null;
  categorias: string[] | null;
  cidades: CidadeDaCampanha[] | null;
  status: string;
  publico: "prospects" | "contatos";
  fonte_publico: string | null;
  prospect_ids: string[] | null;
  contato_ids: string[] | null;
  mensagens: string[] | null;
  espaco_ms: number | null;
  limite_diario: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  janelas: unknown;
  agendada_em: string | null;
  ultimo_envio_at: string | null;
  created_at: string;
}

interface EmpresaControle {
  id: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  categoria: string | null;
  status_comercial: string | null;
  /** O envio foi confirmado (linha do ledger com `message_id`). */
  enviado: boolean;
  /** Há linha no ledger, mas sem comprovante — pode ter falhado. */
  sem_confirmacao: boolean;
  /** Data real do envio (`messages.sent_at`) ou, na falta, a reserva. */
  enviado_em: string | null;
  mensagem_indice: number | null;
  conversa_id: string | null;
}

interface LinhaProspect {
  id: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  categoria: string | null;
  categoria_canonica: string | null;
  status_comercial: string | null;
}

interface LinhaContato {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
}

interface LinhaMensagem {
  id: string;
  conversation_id: string;
  sent_at: string | null;
}

interface EnvioLinha extends EnvioDaCampanha {
  mensagem_indice: number | null;
}

const LOTE = 400;
/** `message_id` é o id de `messages`; só vale consultar o que parece uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function buscarProspects(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  ids: string[],
): Promise<Map<string, LinhaProspect>> {
  const mapa = new Map<string, LinhaProspect>();
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await admin
      .from("business_prospects")
      .select("id, nome, telefone, cidade, estado, categoria, categoria_canonica, status_comercial")
      .eq("organization_id", organizationId)
      .in("id", ids.slice(i, i + LOTE));
    if (error) throw new Error(`prospects_indisponiveis: ${error.message}`);
    for (const linha of (data ?? []) as unknown as LinhaProspect[]) mapa.set(linha.id, linha);
  }
  return mapa;
}

async function buscarContatos(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  ids: string[],
): Promise<Map<string, LinhaContato>> {
  const mapa = new Map<string, LinhaContato>();
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await admin
      .from("contacts")
      .select("id, name, display_name, phone_number")
      .eq("organization_id", organizationId)
      .in("id", ids.slice(i, i + LOTE));
    if (error) throw new Error(`contatos_indisponiveis: ${error.message}`);
    for (const linha of (data ?? []) as unknown as LinhaContato[]) mapa.set(linha.id, linha);
  }
  return mapa;
}

async function buscarMensagens(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  messageIds: string[],
): Promise<Map<string, LinhaMensagem>> {
  const mapa = new Map<string, LinhaMensagem>();
  const validos = [...new Set(messageIds.filter((id) => UUID.test(id)))];
  for (let i = 0; i < validos.length; i += LOTE) {
    const { data, error } = await admin
      .from("messages")
      .select("id, conversation_id, sent_at")
      .eq("organization_id", organizationId)
      .in("id", validos.slice(i, i + LOTE));
    if (error) throw new Error(`mensagens_indisponiveis: ${error.message}`);
    for (const linha of (data ?? []) as unknown as LinhaMensagem[]) mapa.set(linha.id, linha);
  }
  return mapa;
}

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const orgId = authz.org.orgId;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("prospecting_campaigns")
    .select(COLUNAS)
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    logger.error("[prospecting.campaign.controle] falha ao ler a campanha", {
      requestId,
      organization_id: orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao abrir a campanha.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  const campanha = data as unknown as CampanhaControle;
  const ehContatos = campanha.publico === "contatos";
  const lista = (ehContatos ? campanha.contato_ids : campanha.prospect_ids) ?? [];

  const { data: enviosData, error: enviosErro } = await admin
    .from("prospecting_sends")
    .select("prospect_id, message_id, mensagem_indice, enviado_em")
    .eq("organization_id", orgId)
    .eq("campaign_id", id);

  if (enviosErro) {
    logger.error("[prospecting.campaign.controle] falha ao ler o ledger de envios", {
      requestId,
      organization_id: orgId,
      campanha_id: id,
      erro: enviosErro.message,
    });
    return fail("internal_error", "Erro ao ler os envios da campanha.", 500, { requestId });
  }

  const envios = (enviosData ?? []) as unknown as EnvioLinha[];
  const envioPorProspect = new Map(envios.map((e) => [e.prospect_id, e]));
  const mensagens = await (async () => {
    try {
      return await buscarMensagens(
        admin,
        orgId,
        envios.map((e) => e.message_id).filter((m): m is string => Boolean(m)),
      );
    } catch (e) {
      // A lista de empresas é mais importante que o link do Inbox. Se a
      // consulta de mensagens falhar, a tela ainda abre; o botão vira "—".
      logger.warn("[prospecting.campaign.controle] conversas indisponíveis", {
        requestId,
        organization_id: orgId,
        erro: e instanceof Error ? e.message : String(e),
      });
      return new Map<string, LinhaMensagem>();
    }
  })();

  let empresas: EmpresaControle[] = [];
  let previaBase = false;
  let publicoPreview: {
    total: number;
    truncado: boolean;
    resumo: string;
    varridas: number;
    completa: boolean;
    ja_clientes: number;
    duplicadas: number;
    para_revisar: number;
    em_campanha: number;
    categoria_a_revisar: number;
  } | null = null;

  // ── Audiência ainda não reservada: prévia da base ───────────────────────
  if (lista.length === 0 && !ehContatos && usaBase(campanha.fonte_publico)) {
    try {
      const clientes = await indiceDeClientes(admin, orgId);
      const reservados = await idsReservadosPorOutras(admin, orgId, id);
      const resultado = await publicoDaBase(admin, {
        organizationId: orgId,
        cidades: campanha.cidades ?? [],
        categorias: campanha.categorias ?? [],
        limite: LIMITE_PADRAO,
        clientes,
        reservados,
      });
      previaBase = true;
      publicoPreview = {
        total: resultado.total,
        truncado: resultado.linhas.length >= LIMITE_PADRAO,
        resumo: resumoDaBase(resultado),
        varridas: resultado.varridas,
        completa: resultado.completa,
        ja_clientes: resultado.ja_clientes.length,
        duplicadas: resultado.duplicadas,
        para_revisar: resultado.para_revisar.length,
        em_campanha: resultado.em_campanha,
        categoria_a_revisar: resultado.categoria_a_revisar,
      };
      const vistos = new Set(resultado.linhas.map((linha) => linha.id));
      empresas = resultado.linhas.map((linha) => {
        const envio = envioPorProspect.get(linha.id);
        const msg = envio?.message_id ? mensagens.get(envio.message_id) : null;
        return {
          id: linha.id,
          nome: linha.nome,
          telefone: linha.telefone,
          cidade: linha.cidade,
          estado: null,
          categoria: linha.categoria,
          status_comercial: null,
          enviado: Boolean(envio?.message_id),
          sem_confirmacao: Boolean(envio && !envio.message_id),
          enviado_em: msg?.sent_at ?? envio?.enviado_em ?? null,
          mensagem_indice: envio?.mensagem_indice ?? null,
          conversa_id: msg?.conversation_id ?? null,
        };
      });
      // A campanha pode ter enviado pelo "Enviar agora" sem gravar
      // `prospect_ids` (o disparo síncrono não fecha a lista). Nesse caso,
      // uma empresa que saiu do recorte depois do envio sumiria da tabela e
      // o total do ledger ficaria maior que as linhas. Os ids do ledger que
      // não estão na prévia entram como "empresa removida", com o envio real.
      const faltantes = envios.map((e) => e.prospect_id).filter((pid) => !vistos.has(pid));
      if (faltantes.length > 0) {
        const extras = await buscarProspects(admin, orgId, faltantes);
        empresas.push(
          ...faltantes.map((prospectId) => {
            const p = extras.get(prospectId);
            const envio = envioPorProspect.get(prospectId);
            const msg = envio?.message_id ? mensagens.get(envio.message_id) : null;
            return {
              id: prospectId,
              nome: p?.nome ?? "Empresa removida",
              telefone: p?.telefone ?? null,
              cidade: p?.cidade ?? null,
              estado: p?.estado ?? null,
              categoria: p?.categoria_canonica ?? p?.categoria ?? null,
              status_comercial: p?.status_comercial ?? null,
              enviado: Boolean(envio?.message_id),
              sem_confirmacao: Boolean(envio && !envio.message_id),
              enviado_em: msg?.sent_at ?? envio?.enviado_em ?? null,
              mensagem_indice: envio?.mensagem_indice ?? null,
              conversa_id: msg?.conversation_id ?? null,
            };
          }),
        );
      }
    } catch (e) {
      logger.error("[prospecting.campaign.controle] falha ao calcular a prévia da base", {
        requestId,
        organization_id: orgId,
        campanha_id: id,
        erro: e instanceof Error ? e.message : String(e),
      });
      return fail("internal_error", "Não foi possível calcular o público da campanha.", 500, {
        requestId,
      });
    }
  }

  // ── Audiência reservada (prospects ou contatos) ─────────────────────────
  if (!previaBase && lista.length > 0) {
    // O ledger pode ter ids que já saíram da lista (edição/corrida). Incluir
    // esses ids é o que faz o painel não esconder uma mensagem que saiu.
    const idsDaAudiencia = [...new Set([...lista, ...envios.map((e) => e.prospect_id)])];
    try {
      if (ehContatos) {
        const contatos = await buscarContatos(admin, orgId, idsDaAudiencia);
        empresas = idsDaAudiencia.map((prospectId) => {
          const contato = contatos.get(prospectId);
          const envio = envioPorProspect.get(prospectId);
          const msg = envio?.message_id ? mensagens.get(envio.message_id) : null;
          return {
            id: prospectId,
            // A cadeia de fallback é uma decisão só, em `rotuloDoContato`:
            // display_name técnico (`Contato 543134@lid`) não vira nome e o
            // telefone vale mais que "Sem nome".
            nome: rotuloDoContato(contato),
            telefone: contato?.phone_number ?? null,
            cidade: null,
            estado: null,
            categoria: "Recuperação",
            status_comercial: null,
            enviado: Boolean(envio?.message_id),
            sem_confirmacao: Boolean(envio && !envio.message_id),
            enviado_em: msg?.sent_at ?? envio?.enviado_em ?? null,
            mensagem_indice: envio?.mensagem_indice ?? null,
            conversa_id: msg?.conversation_id ?? null,
          };
        });
      } else {
        const prospects = await buscarProspects(admin, orgId, idsDaAudiencia);
        empresas = idsDaAudiencia.map((prospectId) => {
          const p = prospects.get(prospectId);
          const envio = envioPorProspect.get(prospectId);
          const msg = envio?.message_id ? mensagens.get(envio.message_id) : null;
          return {
            id: prospectId,
            nome: p?.nome ?? "Empresa removida",
            telefone: p?.telefone ?? null,
            cidade: p?.cidade ?? null,
            estado: p?.estado ?? null,
            categoria: p?.categoria_canonica ?? p?.categoria ?? null,
            status_comercial: p?.status_comercial ?? null,
            enviado: Boolean(envio?.message_id),
            sem_confirmacao: Boolean(envio && !envio.message_id),
            enviado_em: msg?.sent_at ?? envio?.enviado_em ?? null,
            mensagem_indice: envio?.mensagem_indice ?? null,
            conversa_id: msg?.conversation_id ?? null,
          };
        });
      }
    } catch (e) {
      logger.error("[prospecting.campaign.controle] falha ao ler a audiência", {
        requestId,
        organization_id: orgId,
        campanha_id: id,
        erro: e instanceof Error ? e.message : String(e),
      });
      return fail("internal_error", "Erro ao ler as empresas da campanha.", 500, { requestId });
    }
  }

  const resumo = resumirEnvios({
    prospectIds: lista,
    sends: envios,
    totalFallback: previaBase ? empresas.length : 0,
  });

  // O `enviado_em` do ledger é o instante da RESERVA. O horário que o dono
  // reconhece é o `messages.sent_at`; quando ele existe, ele manda no card.
  let ultimoEnvioReal = 0;
  for (const e of empresas) {
    if (!e.enviado || !e.enviado_em) continue;
    const ms = Date.parse(e.enviado_em);
    if (Number.isFinite(ms)) ultimoEnvioReal = Math.max(ultimoEnvioReal, ms);
  }
  if (ultimoEnvioReal > 0) {
    resumo.ultimo_envio_at = new Date(ultimoEnvioReal).toISOString();
  }

  // A quebra por cidade é a leitura que o operador usa para decidir onde
  // reforçar. "Sem cidade" é um grupo explícito, não um buraco na tabela.
  const cidades = new Map<
    string,
    { cidade: string; total: number; enviados: number; pendentes: number; sem_confirmacao: number }
  >();
  for (const e of empresas) {
    const chave = e.cidade?.trim() || "Sem cidade";
    const atual = cidades.get(chave) ?? {
      cidade: chave,
      total: 0,
      enviados: 0,
      pendentes: 0,
      sem_confirmacao: 0,
    };
    atual.total += 1;
    if (e.enviado) atual.enviados += 1;
    else {
      atual.pendentes += 1;
      if (e.sem_confirmacao) atual.sem_confirmacao += 1;
    }
    cidades.set(chave, atual);
  }

  return ok(
    {
      campanha,
      tipo: ehContatos ? "contatos" : "prospects",
      resumo,
      por_cidade: [...cidades.values()].sort(
        (a, b) => b.total - a.total || a.cidade.localeCompare(b.cidade, "pt-BR"),
      ),
      empresas,
      previa_base: previaBase,
      publico: publicoPreview,
      /** O público completo que o PATCH de agendamento deve guardar. */
      audiencia_ids: empresas.map((e) => e.id),
    },
    { requestId },
  );
}
