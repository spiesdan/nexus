/**
 * A ROTINA DOS ALERTAS DO MEU DIA.
 *
 * ─── O que esta rotina é, e o que ela NÃO é ──────────────────────────────────
 *
 * Ela LE e RECONCILIA. Não cria pedido, não emite nota, não manda mensagem. A
 * diferença importa porque é a diferença entre "o sistema sabe" e "o sistema
 * age": um aviso que aparece no Meu Dia é uma afirmação sobre o estado real, e
 * afirmar errado é pior que não afirmar.
 *
 * Três varreduras, três origens:
 *
 *   nf_pendente          — pedido pede NF e não há nota emitida
 *   fora_da_carga        — pedido elegível da mesma cidade ficou de fora
 *   vencimento_*          — prazo de 30/45 dias chegando ou vencido
 *
 * ─── Por que uma rota só ─────────────────────────────────────────────────────
 *
 * As três compartilham a mesma forma: varre um conjunto, chama `estadoX` (que é
 * pura e testada fora daqui), e entrega a lista ao `reconciliarAlertas`. Uma
 * rota por origem repetiria o `CRONS`, o auth e o `reconciliar` — e a
 * reconciliação é a parte que não pode faltar em nenhuma delas.
 *
 * ─── O teto ──────────────────────────────────────────────────────────────────
 *
 * `SCAN_LIMIT` por organização, não por organização+origem. Uma instalação com
 * 10 mil pedidos pendentes não pode fazer o tick passar de 20 minutos — e o que
 * sobra fica para o próximo, porque a reconciliação é por chave e o que não foi
 * varrido não é resolvido. Nenhum alerta some por isso.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chaveDoAlerta,
  descricaoDaIndicacao,
  estadoFiscal,
  integracaoConfiavel,
  textoDoEstado,
  type NotaParaConferir,
  type PedidoParaConferir,
} from "@/lib/meu-dia/nf-pendente";
import {
  chaveDoAlerta as chaveForaDaCarga,
  foraDaCargaDe,
  type CargaMontada,
  type PedidoElegivel,
} from "@/lib/meu-dia/fora-da-carga";
import { alertasDeVencimento, type RecebivelParaConferir } from "@/lib/meu-dia/vencimento";
import { reconciliarAlertas, type AlertaParaSubir } from "@/lib/alertas/reconciliar";

export const dynamic = "force-dynamic";

/** Teto por organização e por varredura. Ver a nota do cabeçalho. */
const SCAN_LIMIT = 300;

/** UUID inválido, para a clause `.in()` nunca receber lista vazia. */
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export async function GET(req: NextRequest): Promise<Response> {
  return rodar(req);
}
export async function POST(req: NextRequest): Promise<Response> {
  return rodar(req);
}

async function rodar(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const startedAt = Date.now();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();

  const { data: orgaos, error: erroOrgs } = await admin
    .from("organizations")
    .select("id")
    .limit(200);
  if (erroOrgs) {
    logger.error("[meu-dia-alertas] Organizations failed", {
      error: erroOrgs.message,
      requestId,
    });
    return fail("internal_error", "Failed to list organizations.", 500, { requestId });
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const resumo = {
    organizaciones: (orgaos ?? []).length,
    criados: 0,
    atualizados: 0,
    resolvidos: 0,
    porOrigem: { nf_pendente: 0, fora_da_carga: 0, vencimento: 0 },
  };

  for (const org of (orgaos ?? []) as { id: string }[]) {
    try {
      // Uma organização que derruba NÃO pode derrubar as outras: um tick que
      // para no primeiro erro deixa a instalação inteira sem aviso, e a próxima
      // org da lista seria a única que ficaria sem conferência.
      const nf = await varrerNfPendente(admin, org.id, hoje);
      const carga = await varrerForaDaCarga(admin, org.id);
      const venc = await varrerVencimentos(admin, org.id, hoje);

      const candidatos: AlertaParaSubir[] = [...nf, ...carga, ...venc];
      resumo.porOrigem.nf_pendente += nf.length;
      resumo.porOrigem.fora_da_carga += carga.length;
      resumo.porOrigem.vencimento += venc.length;

      // Uma chamada só: `reconciliar` resolve o que não está na lista e
      // reaffirma o que está. Duas chamadas (uma por origem) dariam o mesmo
      // resultado, com o dobro de round-trips.
      const r = await reconciliarAlertas(admin, org.id, candidatos);
      resumo.criados += r.criados;
      resumo.atualizados += r.atualizados;
      resumo.resolvidos += r.resolvidos;
    } catch (e) {
      logger.error("[meu-dia-alertas] organization failed", {
        organizationId: org.id,
        error: e instanceof Error ? e.message : String(e),
        requestId,
      });
    }
  }

  logger.info("[meu-dia-alertas] tick", {
    ...resumo,
    ms: Date.now() - startedAt,
    requestId,
  });

  return ok(resumo, { requestId });
}

/**
 * Pedidos que pedem NF e não têm nota emitida.
 *
 * O filtro de `provedor` vem ANTES da varredura: uma instalação com
 * `provedor = 'stub'` não consegue confirmar emissão, e `integracaoConfiavel`
 * transforma tudo em `nao_verificavel`. Ler as notas dela seria trabalho
 * descartado — e subir alerta de `nao_verificavel` para toda nota que existe no
 * sistema seria barulho, porque a resposta é a mesma para todas.
 */
async function varrerNfPendente(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  hoje: string,
): Promise<AlertaParaSubir[]> {
  const { data: pedido, error } = await admin
    .from("commercial_orders")
    .select("id, numero, cliente_nome, status, created_at, exige_nf, observacoes")
    .eq("organization_id", organizationId)
    .eq("exige_nf", true)
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) {
    throw new Error(`pedidos: ${error.message}`);
  }
  const pedidos = (pedido ?? []) as unknown as PedidoParaConferir[];
  if (pedidos.length === 0) return [];

  const ids = pedidos.map((p) => p.id);
  const { data: notas, error: erroNotas } = await admin
    .from("invoices")
    .select("order_id, status, numero, serie, created_at")
    .in("order_id", ids);
  if (erroNotas) {
    throw new Error(`notas: ${erroNotas.message}`);
  }

  const { data: config, error: erroConfig } = await admin
    .from("fiscal_settings")
    .select("provedor")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (erroConfig) {
    throw new Error(`config fiscal: ${erroConfig.message}`);
  }
  const confiavel = integracaoConfiavel(
    (config as unknown as { provedor?: string | null } | null)?.provedor,
  );

  const porPedido = new Map<string, NotaParaConferir[]>();
  for (const n of (notas ?? []) as unknown as (NotaParaConferir & { created_at: string })[]) {
    if (!n.order_id) continue;
    const lista = porPedido.get(n.order_id) ?? [];
    // `invoices` não tem coluna de emissão; `created_at` é quando a nota foi
    // gerada, que é o que importa para calcular o vencimento do pedido.
    lista.push({ ...n, data_emissao: (n.created_at ?? "").slice(0, 10) || null });
    porPedido.set(n.order_id, lista);
  }

  const saida: AlertaParaSubir[] = [];
  for (const p of pedidos) {
    const estado = estadoFiscal(p, porPedido.get(p.id) ?? [], confiavel);
    if (estado !== "pendente" && estado !== "nao_verificavel") continue;

    const texto = textoDoEstado(estado);
    saida.push({
      chave: chaveDoAlerta(p.id),
      origemTipo: "nf_pendente",
      origemId: p.id,
      titulo: `Pedido #${p.numero} — ${p.cliente_nome}`,
      descricao: `${texto.titulo}. ${descricaoDaIndicacao(p)} Pedido de ${p.created_at.slice(0, 10)}.`,
      acaoRecomendada:
        estado === "pendente"
          ? "Emitir a nota em Notas Fiscais, ou corrigir a marcação se o pedido não precisa de nota."
          : "A instalação não tem provedor que confirme a emissão. Configure o provedor fiscal, ou confirme a nota fora do sistema.",
      href: `/app/pedidos/${p.id}`,
      // `nao_verificavel` é aviso e `pendente` é erro: o primeiro não é falha de
      // ninguém, e o operador precisa ver os dois com pesos diferentes.
      prioridade: estado === "pendente" ? "alta" : "normal",
    });
  }
  void hoje;
  return saida;
}

/**
 * Pedidos elegíveis da mesma cidade que ficaram de fora de uma carga.
 *
 * Duas consultas e uma comparação. A comparação em si é `foraDaCargaDe`, que é
 * pura e testada — a rota só junta os dados.
 */
async function varrerForaDaCarga(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<AlertaParaSubir[]> {
  // "Ontem": o aviso é do dia SEGUINTE à montagem, e uma carga montada hoje
  // ainda pode ganhar pedidos.
  const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const { data: cargas, error } = await admin
    .from("shipments")
    .select("id, numero, placa, status, created_at, updated_at")
    .eq("organization_id", organizationId)
    .in("status", ["montando", "em_rota", "concluida"])
    .gte("created_at", `${ontem}T00:00:00Z`)
    .limit(SCAN_LIMIT);
  if (error) {
    throw new Error(`cargas: ${error.message}`);
  }
  const listaCargas = (cargas ?? []) as unknown as CargaMontada[];
  if (listaCargas.length === 0) return [];

  const ids = listaCargas.map((c) => c.id);
  const { data: itens, error: erroItens } = await admin
    .from("shipment_orders")
    .select("shipment_id, order_id")
    .in("shipment_id", ids);
  if (erroItens) {
    throw new Error(`itens da carga: ${erroItens.message}`);
  }

  const porCarga = new Map<string, string[]>();
  const emAlgumaCarga = new Set<string>();
  for (const i of (itens ?? []) as unknown as { shipment_id: string; order_id: string }[]) {
    const l = porCarga.get(i.shipment_id) ?? [];
    l.push(i.order_id);
    porCarga.set(i.shipment_id, l);
    emAlgumaCarga.add(i.order_id);
  }

  // Os pedidos das cargas E os candidatos que ficaram de fora, na mesma
  // consulta: uma vez só, e o filtro de cidade acontece na comparação.
  const cidadePorId = new Map<string, string | null>();
  const idsDasCargas = [...emAlgumaCarga];
  const { data: infoCarga, error: erroInfoCarga } = await admin
    .from("commercial_orders")
    .select("id, cidade_entrega")
    .in("id", idsDasCargas.length > 0 ? idsDasCargas : [ZERO_UUID])
    .limit(SCAN_LIMIT * 2);
  if (erroInfoCarga) {
    throw new Error(`pedidos da carga: ${erroInfoCarga.message}`);
  }
  for (const i of (infoCarga ?? []) as unknown as { id: string; cidade_entrega: string | null }[]) {
    cidadePorId.set(i.id, i.cidade_entrega);
  }

  const { data: candidatos, error: erroCandidatos } = await admin
    .from("commercial_orders")
    .select("id, numero, cliente_nome, status, cidade_entrega, created_at, previsao_entrega")
    .eq("organization_id", organizationId)
    .in("status", ["aprovado", "faturado", "em_analise", "rascunho"])
    .lt("created_at", `${ontem}T23:59:59Z`)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (erroCandidatos) {
    throw new Error(`candidatos: ${erroCandidatos.message}`);
  }

  const listaCandidatos = (candidatos ?? []) as unknown as (PedidoElegivel & {
    cidade_entrega: string | null;
  })[];

  const saida: AlertaParaSubir[] = [];
  const vistos = new Set<string>();

  for (const c of listaCargas) {
    const idsDaCarga = porCarga.get(c.id) ?? [];
    const comCidade: CargaMontada = {
      ...c,
      pedidosDaCarga: idsDaCarga.map((id) => ({ id, cidade: cidadePorId.get(id) ?? null })),
    };

    for (const achado of foraDaCargaDe(comCidade, listaCandidatos, emAlgumaCarga)) {
      if (vistos.has(achado.pedido.id)) continue;
      vistos.add(achado.pedido.id);
      saida.push({
        chave: chaveForaDaCarga(achado.pedido.id),
        origemTipo: "fora_da_carga",
        origemId: achado.pedido.id,
        titulo: `Pedido #${achado.pedido.numero} — ${achado.pedido.cliente_nome}`,
        descricao: `${achado.motivo} Pedido de ${achado.pedido.created_at.slice(0, 10)}.`,
        acaoRecomendada:
          "Vincular o pedido a uma carga, reagendar a entrega, ou registrar por que ele não entrou.",
        href: `/app/pedidos/${achado.pedido.id}`,
        prioridade: "alta",
      });
    }
  }

  return saida;
}

/** Recebíveis de prazo: preventivo (30º dia do 45) e vencido. */
async function varrerVencimentos(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  hoje: string,
): Promise<AlertaParaSubir[]> {
  const { data, error } = await admin
    .from("financial_receivables")
    .select(
      "id, order_id, contact_id, cliente_nome, valor_original_cents, vencimento, " +
        "status, forma_pagamento, parcela_n, total_parcelas, vencimento_depende_de_nf",
    )
    .eq("organization_id", organizationId)
    .in("status", ["aberto", "parcial"])
    .not("vencimento", "is", null)
    .lte("vencimento", hoje)
    .order("vencimento", { ascending: true })
    .limit(SCAN_LIMIT);
  if (error) {
    throw new Error(`recebíveis: ${error.message}`);
  }

  const lista = (data ?? []) as unknown as RecebivelParaConferir[];
  if (lista.length === 0) return [];

  // Os 15 dias que faltam para o 45 dias não aparecem em `lte(hoje)` — eles
  // estão no FUTURO. Uma segunda varredura, que é a que produz o preventivo.
  const { data: futuros, error: erroFuturos } = await admin
    .from("financial_receivables")
    .select(
      "id, order_id, contact_id, cliente_nome, valor_original_cents, vencimento, " +
        "status, forma_pagamento, parcela_n, total_parcelas, vencimento_depende_de_nf",
    )
    .eq("organization_id", organizationId)
    .in("status", ["aberto", "parcial"])
    .not("vencimento", "is", null)
    .gt("vencimento", hoje)
    .lte("vencimento", somarDiasLocal(hoje, 15))
    .order("vencimento", { ascending: true })
    .limit(SCAN_LIMIT);
  if (erroFuturos) {
    throw new Error(`recebíveis futuros: ${erroFuturos.message}`);
  }

  return alertasDeVencimento(
    [...lista, ...((futuros ?? []) as unknown as RecebivelParaConferir[])],
    hoje,
    organizationId,
  );
}

function somarDiasLocal(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000).toISOString().slice(0, 10);
}

// Reexporta o schema para os testes poderem validar a entrada do cron.
export const AlertaQuerySchema = z.object({}).passthrough();
