/**
 * Coleta da fotografia — a única parte do Sentinel que fala com o banco.
 *
 * Toda consulta filtra `organization_id` explicitamente. O client é o de
 * service role (bypassa RLS), então o filtro é responsabilidade DESTE arquivo:
 * o `organizationId` vem do guard da rota ou do cron, nunca do body.
 *
 * Duas garantias de carga:
 *  - cada consulta tem teto (`TETO_*`) e pede `teto + 1` para saber se cortou;
 *  - falha de UMA consulta não derruba a fotografia: ela entra em `falhas` e
 *    marca a execução como truncada. Rodada truncada não encerra ocorrências
 *    por ausência — lista incompleta não é prova de nada.
 */
import { createAdminClient } from "@/lib/supabase/admin";

import type {
  CampanhaProspeccao,
  CampanhaVenda,
  ClienteDuplicado,
  ContatoEndereco,
  CorrecaoSentinel,
  EstoqueRazao,
  ImportacaoMercos,
  JobDaFila,
  JobFiscal,
  LeadAberto,
  NotaFiscal,
  NotaPedido,
  Pedido,
  Produto,
  Recebivel,
  Snapshot,
  SyncFiscal,
  WebhookEvento,
} from "./tipos";
import { DIA_MS } from "./utilitarios";

const TETO_NOTAS = 500;
const TETO_NOTAS_PEDIDOS = 2_000;
const TETO_PEDIDOS = 500;
const TETO_JOBS_FISCAIS = 500;
const TETO_SYNC_FISCAL = 100;
const TETO_PRODUTOS = 200;
const TETO_ESTOQUE_RAZAO = 500;
const TETO_RECEBIVEIS = 1_000;
const TETO_LEADS = 2_000;
const TETO_FILA = 500;
const TETO_WEBHOOKS = 500;
const TETO_MERCOS = 100;
const TETO_CAMPANHAS = 300;
const TETO_DUPLICADOS = 200;
// 100 mantém o `in (ids)` do PostgREST abaixo do limite de URL; se houver mais,
// a coleta trunca e a rodada não encerra por ausência.
const TETO_CORRECOES = 100;
const TETO_CONTATOS_ENDERECO = 1_000;
const TETO_EVENTOS_CORRECAO = 2_000;

interface Coleta<T> {
  dados: T[];
  truncado: boolean;
  falha: string | null;
}

interface ResultadoBruto {
  data: unknown[] | null;
  error: { message: string } | null;
}

async function coletar<T>(
  nome: string,
  consulta: PromiseLike<ResultadoBruto>,
  teto: number,
): Promise<Coleta<T>> {
  try {
    const { data, error } = await consulta;
    if (error) return { dados: [], truncado: true, falha: `${nome}: ${error.message}` };
    const linhas = (data ?? []) as T[];
    return { dados: linhas.slice(0, teto), truncado: linhas.length > teto, falha: null };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { dados: [], truncado: true, falha: `${nome}: ${motivo.slice(0, 200)}` };
  }
}

interface OcorrenciaCorrecao {
  id: string;
  estado: "aprovada" | "corrigida";
  entidade_id: string;
}

interface EventoCorrecao {
  occurrence_id: string;
  tipo: string;
  estado_novo: string | null;
  detalhe: Record<string, unknown> | null;
  created_at: string;
}

interface JobCorrecao {
  id: string;
  kind: string;
  status: string;
  run_after: string;
}

export interface ResultadoColeta {
  snapshot: Snapshot;
  truncado: boolean;
  falhas: string[];
}

export async function coletarSnapshot(
  organizationId: string,
  agoraMs = Date.now(),
): Promise<ResultadoColeta> {
  const admin = createAdminClient();
  const iso = (msAtras: number) => new Date(agoraMs - msAtras).toISOString();

  const [
    notas,
    notasPedidos,
    pedidos,
    jobsFiscais,
    sincronizacoesFiscais,
    produtos,
    estoqueRazao,
    recebiveis,
    leadsAbertos,
    fila,
    webhooks,
    importacoesMercos,
    campanhasProspeccao,
    campanhasVenda,
    clientesDuplicados,
    contatosEndereco,
  ] = await Promise.all([
    coletar<NotaFiscal>(
      "notas",
      admin
        .from("invoices")
        .select(
          "id, order_id, serie, numero, chave_acesso, status, total_cents, erro, sefaz_cstat, sefaz_xmotivo, extras_fiscais, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .gte("created_at", iso(365 * DIA_MS))
        .order("updated_at", { ascending: false })
        .limit(TETO_NOTAS + 1),
      TETO_NOTAS,
    ),
    coletar<NotaPedido>(
      "notas_pedidos",
      admin
        .from("invoice_orders")
        .select("invoice_id, order_id")
        .eq("organization_id", organizationId)
        .limit(TETO_NOTAS_PEDIDOS + 1),
      TETO_NOTAS_PEDIDOS,
    ),
    coletar<Pedido>(
      "pedidos",
      admin
        .from("commercial_orders")
        .select(
          "id, numero, status, exige_nf, total_cents, subtotal_cents, desconto_cents, frete_cents, contact_id, cliente_documento, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .gte("updated_at", iso(365 * DIA_MS))
        .order("updated_at", { ascending: false })
        .limit(TETO_PEDIDOS + 1),
      TETO_PEDIDOS,
    ),
    coletar<JobFiscal>(
      "jobs_fiscais",
      admin
        .from("fiscal_jobs")
        .select(
          "id, invoice_id, status, tentativas, max_tentativas, proxima_tentativa, ultimo_erro, updated_at",
        )
        .eq("organization_id", organizationId)
        .in("status", ["pendente", "processando", "erro"])
        .order("updated_at", { ascending: false })
        .limit(TETO_JOBS_FISCAIS + 1),
      TETO_JOBS_FISCAIS,
    ),
    coletar<SyncFiscal>(
      "sincronizacoes_fiscais",
      admin
        .from("fiscal_sync_logs")
        .select(
          "id, resultado, iniciado_em, finalizado_em, docs_encontrados, docs_importados, docs_erro, mensagem",
        )
        .eq("organization_id", organizationId)
        .gte("iniciado_em", iso(7 * DIA_MS))
        .order("iniciado_em", { ascending: false })
        .limit(TETO_SYNC_FISCAL + 1),
      TETO_SYNC_FISCAL,
    ),
    coletar<Produto>(
      "produtos",
      admin
        .from("catalog_products")
        .select("id, codigo, nome, quantidade, controla_estoque, estoque_minimo, updated_at")
        .eq("organization_id", organizationId)
        .eq("controla_estoque", true)
        .lt("quantidade", 0)
        .order("quantidade", { ascending: true })
        .limit(TETO_PRODUTOS + 1),
      TETO_PRODUTOS,
    ),
    coletar<EstoqueRazao>(
      "estoque_razao",
      admin
        .from("sentinel_estoque_razao")
        .select(
          "product_id, codigo, nome, quantidade, saldo_razao, diferenca, movimentos, criado_em, ultimo_movimento",
        )
        .eq("organization_id", organizationId)
        .gte("criado_em", "2026-09-25T00:00:00.000Z")
        .neq("diferenca", 0)
        .order("diferenca", { ascending: false })
        .limit(TETO_ESTOQUE_RAZAO + 1),
      TETO_ESTOQUE_RAZAO,
    ),
    coletar<Recebivel>(
      "recebiveis",
      admin
        .from("financial_receivables")
        .select(
          "id, order_id, invoice_id, contact_id, parcela_n, total_parcelas, valor_original_cents, vencimento, status",
        )
        .eq("organization_id", organizationId)
        .in("status", ["aberto", "parcial"])
        .order("vencimento", { ascending: true })
        .limit(TETO_RECEBIVEIS + 1),
      TETO_RECEBIVEIS,
    ),
    coletar<LeadAberto>(
      "leads_abertos",
      admin
        .from("crm_leads")
        .select(
          "id, pipeline_id, contact_id, created_at, contacts(phone_number, email_normalized)",
        )
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .not("contact_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(TETO_LEADS + 1),
      TETO_LEADS,
    ),
    coletar<JobDaFila>(
      "fila",
      admin
        .from("job_queue")
        .select(
          "id, kind, status, attempts, max_attempts, run_after, locked_at, last_error, created_at",
        )
        .eq("organization_id", organizationId)
        .in("status", ["running", "pending", "failed", "dead"])
        .gte("created_at", iso(14 * DIA_MS))
        .order("created_at", { ascending: false })
        .limit(TETO_FILA + 1),
      TETO_FILA,
    ),
    coletar<WebhookEvento>(
      "webhooks",
      admin
        .from("webhook_events_log")
        .select("id, provider, event_type, status, attempts, error_message, received_at")
        .eq("organization_id", organizationId)
        .in("status", ["error", "dead"])
        .gte("received_at", iso(7 * DIA_MS))
        .order("received_at", { ascending: false })
        .limit(TETO_WEBHOOKS + 1),
      TETO_WEBHOOKS,
    ),
    coletar<ImportacaoMercos>(
      "mercos",
      admin
        .from("mercos_import_runs")
        .select(
          "id, status, origem, started_at, finished_at, orders_new, errors, created_at",
        )
        .eq("organization_id", organizationId)
        .gte("created_at", iso(30 * DIA_MS))
        .order("created_at", { ascending: false })
        .limit(TETO_MERCOS + 1),
      TETO_MERCOS,
    ),
    coletar<CampanhaProspeccao>(
      "campanhas_prospeccao",
      admin
        .from("prospecting_campaigns")
        .select("id, nome, status, cidades, categorias, recorrencia_dias")
        .eq("organization_id", organizationId)
        .in("status", ["ativa"])
        .limit(TETO_CAMPANHAS + 1),
      TETO_CAMPANHAS,
    ),
    coletar<CampanhaVenda>(
      "campanhas_venda",
      admin
        .from("automatic_sales_campaigns")
        .select("id, nome, status, cidade, uf, categorias")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .limit(TETO_CAMPANHAS + 1),
      TETO_CAMPANHAS,
    ),
    coletar<ClienteDuplicado>(
      "clientes_duplicados",
      admin
        .from("sentinel_contatos_duplicados")
        .select("organization_id, chave, total, ids")
        .eq("organization_id", organizationId)
        .limit(TETO_DUPLICADOS + 1),
      TETO_DUPLICADOS,
    ),
    coletar<ContatoEndereco>(
      "contatos_endereco",
      admin
        .from("contacts")
        .select("id, logradouro, complemento, bairro, cidade")
        .eq("organization_id", organizationId)
        .or(
          "logradouro.not.is.null,complemento.not.is.null,bairro.not.is.null,cidade.not.is.null",
        )
        .limit(TETO_CONTATOS_ENDERECO + 1),
      TETO_CONTATOS_ENDERECO,
    ),
  ]);

  // ─── Observabilidade da correção aprovada (v1.3+) ───────────────────────
  //
  // O Sentinel lê as PRÓPRIAS ocorrências/eventos e o job ATUAL para observar
  // dois fatos que a tela não mostra sozinha: a reversão ainda é honesta? a
  // aprovação ainda está dentro da janela de 5 min? Nada aqui escreve.
  const ocorrenciasCorrecao = await coletar<OcorrenciaCorrecao>(
    "correcoes",
    admin
      .from("sentinel_occurrences")
      .select("id, estado, entidade_id")
      .eq("organization_id", organizationId)
      .eq("regra", "operacao.job_fila_travado")
      .in("estado", ["aprovada", "corrigida"])
      .order("updated_at", { ascending: false })
      .limit(TETO_CORRECOES + 1),
    TETO_CORRECOES,
  );

  const ocorrenciaIds = ocorrenciasCorrecao.dados.map((o) => o.id);
  const jobIds = [...new Set(ocorrenciasCorrecao.dados.map((o) => o.entidade_id))].filter(
    (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  );
  const vazio = <T,>(): Coleta<T> => ({ dados: [], truncado: false, falha: null });

  const [eventosCorrecao, jobsCorrecao] =
    ocorrenciaIds.length === 0
      ? [vazio<EventoCorrecao>(), vazio<JobCorrecao>()]
      : await Promise.all([
          coletar<EventoCorrecao>(
            "eventos_correcao",
            admin
              .from("sentinel_occurrence_events")
              .select("occurrence_id, tipo, estado_novo, detalhe, created_at")
              .eq("organization_id", organizationId)
              .in("occurrence_id", ocorrenciaIds)
              .in("tipo", ["nota", "estado_alterado"])
              .order("created_at", { ascending: false })
              .limit(TETO_EVENTOS_CORRECAO + 1),
            TETO_EVENTOS_CORRECAO,
          ),
          jobIds.length === 0
            ? vazio<JobCorrecao>()
            : coletar<JobCorrecao>(
                "jobs_correcao",
                admin
                  .from("job_queue")
                  .select("id, kind, status, run_after")
                  .eq("organization_id", organizationId)
                  .in("id", jobIds)
                  .limit(TETO_CORRECOES + 1),
                TETO_CORRECOES,
              ),
        ]);

  const eventosPorOcorrencia = new Map<string, EventoCorrecao[]>();
  for (const evento of eventosCorrecao.dados) {
    const lista = eventosPorOcorrencia.get(evento.occurrence_id) ?? [];
    lista.push(evento);
    eventosPorOcorrencia.set(evento.occurrence_id, lista);
  }
  const jobsPorId = new Map(jobsCorrecao.dados.map((j) => [j.id, j]));

  const correcoes: CorrecaoSentinel[] = ocorrenciasCorrecao.dados.map((o) => {
    const eventos = eventosPorOcorrencia.get(o.id) ?? [];
    const aprovacao = eventos.find(
      (e) => e.tipo === "estado_alterado" && e.estado_novo === "aprovada",
    );
    const nota = eventos.find(
      (e) => e.tipo === "nota" && e.detalhe?.correcao === "antecipar_job",
    );
    const job = jobsPorId.get(o.entidade_id);
    return {
      ocorrencia_id: o.id,
      estado: o.estado,
      job_id: o.entidade_id,
      aprovada_em: aprovacao?.created_at ?? null,
      correcao:
        nota && nota.detalhe
          ? {
              job_id: String(nota.detalhe.job_id ?? ""),
              run_after_antes: String(nota.detalhe.run_after_antes ?? ""),
              run_after_depois: String(nota.detalhe.run_after_depois ?? ""),
              executada_em: nota.created_at,
            }
          : null,
      job: job
        ? { id: job.id, kind: job.kind, status: job.status, run_after: job.run_after }
        : null,
    };
  });

  const coletas = [
    notas,
    notasPedidos,
    pedidos,
    jobsFiscais,
    sincronizacoesFiscais,
    produtos,
    estoqueRazao,
    recebiveis,
    leadsAbertos,
    fila,
    webhooks,
    importacoesMercos,
    campanhasProspeccao,
    campanhasVenda,
    clientesDuplicados,
    contatosEndereco,
    ocorrenciasCorrecao,
    eventosCorrecao,
    jobsCorrecao,
  ];

  return {
    snapshot: {
      organizationId,
      agoraMs,
      notas: notas.dados,
      notasPedidos: notasPedidos.dados,
      pedidos: pedidos.dados,
      jobsFiscais: jobsFiscais.dados,
      sincronizacoesFiscais: sincronizacoesFiscais.dados,
      produtos: produtos.dados,
      estoqueRazao: estoqueRazao.dados,
      recebiveis: recebiveis.dados,
      leadsAbertos: leadsAbertos.dados,
      fila: fila.dados,
      webhooks: webhooks.dados,
      importacoesMercos: importacoesMercos.dados,
      campanhasProspeccao: campanhasProspeccao.dados,
      campanhasVenda: campanhasVenda.dados,
      clientesDuplicados: clientesDuplicados.dados,
      correcoes,
      contatosEndereco: contatosEndereco.dados,
    },
    truncado: coletas.some((c) => c.truncado),
    falhas: coletas.map((c) => c.falha).filter((f): f is string => f !== null),
  };
}
