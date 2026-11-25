/**
 * CARREGA A VISÃO DE COBRANÇA DA PLATAFORMA — uma leitura, zero Stripe.
 *
 * A tela responde "quem está pagando e quem não está" para o dono da
 * instalação. Ela é montada com SETE consultas ao banco local (organizações,
 * plano, clientes, assinaturas, faturas, verificações e último evento), não com
 * uma chamada ao Stripe por linha: com 50 organizações, N+1 aqui é a diferença
 * entre uma lista e um travamento.
 *
 * O que o banco pode não ter: o `billing-reconcile` sincroniza as assinaturas
 * e o webhook grava faturas/eventos. Quando nada foi sincronizado, a tela diz
 * "Nunca sincronizado" e mostra o que existe — nunca inventa "em dia".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { estadoStripe, type EstadoStripe } from "./stripe-estado";
import {
  classificarAssinatura,
  motivoNaoVerificado,
  proximoVencimento,
  resumirEstados,
  tempoRelativo,
  ultimaCobranca,
  valorDoPlano,
  type AssinaturaLocal,
  type EstadoAssinatura,
  type FaturaLocal,
  type ResumoContagens,
} from "./visao-plataforma";

/** Teto de faturas lidas numa abertura. Numa instalação com muitas orgs o
 *  histórico pode passar disso; a tela avisa que a leitura foi parcial em vez
 *  de tratar ausência como "nunca cobrado". */
export const TETO_FATURAS = 1000;

export interface LinhaBilling {
  organizacao_id: string;
  organizacao: string;
  slug: string;
  situacao: EstadoAssinatura;
  rotulo: string;
  motivo: string | null;
  valor_texto: string | null;
  moeda: string | null;
  vencimento_texto: string;
  vencimento_iso: string | null;
  vencimento_vencido: boolean;
  ultima_cobranca_texto: string;
  ultima_cobranca_iso: string | null;
  falhas: number;
  tem_cliente_stripe: boolean;
  status_stripe: string | null;
  /** Só as ações que fazem sentido para a linha. */
  acao: "portal" | "criar" | null;
}

export interface VisaoBilling {
  linhas: LinhaBilling[];
  resumo: ResumoContagens;
  total_organizacoes: number;
  plano: { nome: string; valor_cents: number; moeda: string; intervalo: string } | null;
  stripe: EstadoStripe;
  sincronizado_em: string | null;
  sincronizado_texto: string;
  /** `true` quando o teto de faturas foi atingido — a contagem de falhas pode
   *  ser menor que a real. A tela diz isso. */
  faturas_parciais: boolean;
  /** Erros de leitura que impediram montar alguma parte (nunca engolidos). */
  avisos: string[];
}

interface OrganizacaoRow {
  id: string;
  display_name: string | null;
  slug: string | null;
}

interface AssinaturaRow extends AssinaturaLocal {
  organization_id: string;
  updated_at: string | null;
}

interface FaturaRow extends FaturaLocal {
  organization_id: string;
  updated_at: string | null;
}

interface ClienteRow {
  organization_id: string;
  stripe_customer_id: string | null;
  updated_at: string | null;
}

const STATUS_VIVA = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

/**
 * Uma organização pode ter mais de uma assinatura ao longo da vida (a antiga
 * cancelada continua na tabela). A regra: assinatura VIVA mais recente vence;
 * só quando não há nenhuma viva usa-se a cancelada mais recente. Escolher a
 * "última atualizada" ao acaso faria uma cancelada antiga esconder a ativa.
 */
export function melhorAssinatura(rows: readonly AssinaturaRow[]): AssinaturaRow | null {
  const porData = [...rows].sort(
    (a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
  );
  return porData.find((r) => STATUS_VIVA.has((r.status ?? "").toLowerCase())) ?? porData[0] ?? null;
}

function maiorData(datas: Array<string | null | undefined>): string | null {
  let maior: string | null = null;
  let maiorMs = -Infinity;
  for (const iso of datas) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms) && ms > maiorMs) {
      maior = iso;
      maiorMs = ms;
    }
  }
  return maior;
}

function agrupar<T extends { organization_id: string }>(rows: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const row of rows) {
    const atuais = mapa.get(row.organization_id);
    if (atuais) atuais.push(row);
    else mapa.set(row.organization_id, [row]);
  }
  return mapa;
}

/**
 * A ordem segue a leitura da tela: quem está em dia primeiro, depois o atraso,
 * o desconhecido (que exige investigação), quem nunca assinou (lead) e, por
 * último, o cancelado. Empilhar o problema no topo empurraria "Ativa" para
 * fora da primeira dobra em instalações com dezenas de organizações.
 */
const PESO_ESTADO: Record<EstadoAssinatura, number> = {
  ativa: 0,
  em_atraso: 1,
  nao_verificado: 2,
  sem_assinatura: 3,
  cancelada: 4,
};

export async function carregarVisaoBilling(
  admin: SupabaseClient,
  opcoes: { agora?: Date; stripe?: EstadoStripe } = {},
): Promise<VisaoBilling> {
  const agora = opcoes.agora ?? new Date();

  const [
    orgsRes,
    planoRes,
    clientesRes,
    assinaturasRes,
    faturasRes,
    verificacoesRes,
    eventoRes,
  ] = await Promise.all([
    admin.from("organizations").select("id, display_name, slug").order("display_name", { ascending: true }),
    admin
      .from("billing_plans")
      .select("nome, valor_cents, moeda, intervalo")
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin.from("billing_customers").select("organization_id, stripe_customer_id, updated_at"),
    admin
      .from("billing_subscriptions")
      .select("organization_id, status, current_period_end, cancel_at_period_end, updated_at"),
    admin
      .from("billing_invoices")
      .select("organization_id, status, amount_cents, currency, due_at, paid_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(TETO_FATURAS),
    admin
      .from("billing_verifications")
      .select("organization_id, kind, ultimo_erro, updated_at")
      .is("resolvido_em", null),
    admin
      .from("billing_events")
      .select("processado_em")
      .order("processado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const avisos: string[] = [];
  const erro = (rotulo: string, erro: { message?: string } | null) => {
    if (erro) avisos.push(`${rotulo}: ${erro.message ?? "falha de leitura"}`);
  };
  erro("organizações", orgsRes.error);
  erro("plano", planoRes.error);
  erro("clientes", clientesRes.error);
  erro("assinaturas", assinaturasRes.error);
  erro("faturas", faturasRes.error);
  erro("verificações", verificacoesRes.error);
  erro("eventos", eventoRes.error);

  const organizacoes = (orgsRes.data ?? []) as OrganizacaoRow[];
  const planoCru = planoRes.data as
    | { nome: string; valor_cents: number; moeda: string; intervalo: string }
    | null;
  const clientes = agrupar((clientesRes.data ?? []) as ClienteRow[]);
  const assinaturas = agrupar((assinaturasRes.data ?? []) as AssinaturaRow[]);
  const faturas = agrupar((faturasRes.data ?? []) as FaturaRow[]);
  const verificacoes = agrupar(
    (verificacoesRes.data ?? []) as Array<{ organization_id: string; kind: string; ultimo_erro: string | null; updated_at: string | null }>,
  );

  const valorTexto = valorDoPlano(planoCru);
  const linhas: LinhaBilling[] = organizacoes.map((org) => {
    const cliente = (clientes.get(org.id) ?? [])[0] ?? null;
    const assinatura = melhorAssinatura(assinaturas.get(org.id) ?? []);
    const faturasDaOrg = faturas.get(org.id) ?? [];
    const entrada = {
      customer: cliente,
      assinatura,
      faturas: faturasDaOrg,
      agora,
    };
    const situacao = classificarAssinatura(entrada);
    const vencimento = proximoVencimento(entrada, agora);
    const cobranca = ultimaCobranca(faturasDaOrg, agora);
    // A última leitura falhou? Só é dito quando o banco registrou a falha —
    // uma verificação pendente antiga aparece como motivo, não como estado.
    const pendentes = verificacoes.get(org.id) ?? [];
    const leituraFalhou = pendentes.length > 0 ? pendentes[0]!.ultimo_erro : null;
    const motivo =
      motivoNaoVerificado(entrada) ??
      (leituraFalhou ? `Última leitura do Stripe falhou: ${leituraFalhou}` : null);

    return {
      organizacao_id: org.id,
      organizacao: org.display_name || org.slug || org.id,
      slug: org.slug ?? "",
      situacao,
      rotulo: {
        ativa: "Ativa",
        em_atraso: "Em atraso",
        sem_assinatura: "Sem assinatura",
        cancelada: "Cancelada",
        nao_verificado: "Não verificada",
      }[situacao],
      motivo,
      valor_texto: valorTexto,
      moeda: planoCru?.moeda ?? null,
      vencimento_texto: vencimento.texto,
      vencimento_iso: vencimento.iso,
      vencimento_vencido: vencimento.vencido,
      ultima_cobranca_texto: cobranca.texto,
      ultima_cobranca_iso: cobranca.iso,
      falhas: cobranca.falhas,
      tem_cliente_stripe: Boolean(cliente?.stripe_customer_id),
      status_stripe: assinatura?.status ?? null,
      acao:
        situacao === "sem_assinatura"
          ? "criar"
          : situacao === "ativa" || situacao === "em_atraso"
            ? "portal"
            : null,
    };
  });

  linhas.sort((a, b) => {
    const peso = PESO_ESTADO[a.situacao] - PESO_ESTADO[b.situacao];
    if (peso !== 0) return peso;
    return a.organizacao.localeCompare(b.organizacao, "pt-BR");
  });

  const sincronizadoEm = maiorData([
    ...((assinaturasRes.data ?? []) as AssinaturaRow[]).map((r) => r.updated_at),
    ...((faturasRes.data ?? []) as FaturaRow[]).map((r) => r.updated_at),
    ...((clientesRes.data ?? []) as ClienteRow[]).map((r) => r.updated_at),
    (eventoRes.data as { processado_em: string | null } | null)?.processado_em ?? null,
  ]);
  const relativo = tempoRelativo(sincronizadoEm, agora);

  return {
    linhas,
    resumo: resumirEstados(
      linhas.map((l) => l.situacao),
      organizacoes.length,
    ),
    total_organizacoes: organizacoes.length,
    plano: planoCru,
    stripe: opcoes.stripe ?? estadoStripe(),
    sincronizado_em: sincronizadoEm,
    sincronizado_texto: relativo ? `Sincronizado ${relativo}` : "Nunca sincronizado com o Stripe",
    faturas_parciais: (faturasRes.data ?? []).length >= TETO_FATURAS,
    avisos,
  };
}

/** Cliente Stripe da organização, se houver — usado pelas ações de plataforma. */
export async function clienteStripeDaOrg(
  admin: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null;
}
