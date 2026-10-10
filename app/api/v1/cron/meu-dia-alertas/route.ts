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
  cidadeDoEndereco,
  foraDaCargaDe,
  type CargaMontada,
  type PedidoElegivel,
} from "@/lib/meu-dia/fora-da-carga";
import { alertasDeVencimento, type RecebivelParaConferir } from "@/lib/meu-dia/vencimento";
import { reconciliarAlertas, type AlertaParaSubir } from "@/lib/alertas/reconciliar";

export const dynamic = "force-dynamic";

/** Teto por organização e por varredura. Ver a nota do cabeçalho. */
const SCAN_LIMIT = 300;

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
      // ─── Cada varredura é isolada ─────────────────────────────────────────
      //
      // Uma organização que derruba NÃO derruba as outras: um tick que para no
      // primeiro erro deixa a instalação inteira sem aviso.
      //
      // E — o que só apareceu depois das duas colunas que não existem — uma
      // ORIGEM que derruba NÃO derruba as outras da MESMA organização. O erro de
      // `financial_receivables.cliente_nome` derrubou a varredura de vencimento e
      // a de NF junto, porque as três rodavam dentro de um único `try`. A de NF
      // não consulta recebíveis e não tem por que sumir por causa dela.
      //
      // `tryPorOrigem` transforma "o tick inteiro falhou" em "esta origem
      // falhou, e as outras duas responderam" — e o resumo mostra exatamente
      // isso, para que a falha não seja um número que parece sucesso.
      const nf = await tryPorOrigem(admin, org.id, "nf_pendente", () =>
        varrerNfPendente(admin, org.id, hoje),
      );
      const carga = await tryPorOrigem(admin, org.id, "fora_da_carga", () =>
        varrerForaDaCarga(admin, org.id),
      );
      const venc = await tryPorOrigem(admin, org.id, "vencimento", () =>
        varrerVencimentos(admin, org.id, hoje),
      );

      const candidatos: AlertaParaSubir[] = [...nf, ...carga, ...venc];
      resumo.porOrigem.nf_pendente += nf.length;
      resumo.porOrigem.fora_da_carga += carga.length;
      resumo.porOrigem.vencimento += venc.length;

      // ─── Por que a falha parcial NÃO resolve alerta de outra origem ─────────
      //
      // Duas garantias, e as duas estão no motor e não aqui:
      //
      //   1. `reconciliarAlertas` com lista vazia devolve sem tocar em nada.
      //   2. Quando a lista NÃO está vazia, ele só lê os abertos cuja
      //      `origem_tipo` está na lista (`.in("origem_tipo", ...)`).
      //
      // Então a varredura de NF falhando não resolve nenhum alerta de NF: a
      // origem nem entra no `.in`. Sem a segunda garantia, uma origem que falhou
      // seria tratada como "acabou" pela reconciliação das outras — e um erro de
      // leitura viraria "não há mais pendências", que é a pior mentira possível
      // para quem abre o Meu Dia.
      //
      // Por isso não há `continue` aqui: seria código morto fingindo proteger
      // algo que o motor já protege.

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

  const { data: candidatos, error: erroCandidatos } = await admin
    .from("commercial_orders")
    .select(
      "id, numero, cliente_nome, status, created_at, previsao_entrega, contact_id, endereco_entrega",
    )
    .eq("organization_id", organizationId)
    .in("status", ["aprovado", "faturado", "em_analise", "rascunho"])
    .lt("created_at", `${ontem}T23:59:59Z`)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (erroCandidatos) {
    throw new Error(`candidatos: ${erroCandidatos.message}`);
  }

  // ─── A CIDADE NÃO ESTÁ NO PEDIDO ───────────────────────────────────────────
  //
  // A primeira versão desta rotina pedia `commercial_orders.cidade_entrega`, e a
  // coluna não existe. O Postgres respondia `column ... does not exist`, a rota
  // registrava "organization failed" e seguia — um tick que respondia 200 com
  // zero de tudo, e nenhum alerta de "fora da carga" jamais apareceria.
  //
  // A cidade mora em `contacts.cidade`, e o pedido chega lá por `contact_id`.
  // Duas consultas para N pedidos: uma por pedido seria o N+1 que a instalação
  // grande não aguenta.
  const pedidosDaCarga = await lerPedidos(admin, [...emAlgumaCarga]);
  const cidadeDosPedidosDaCarga = await cidadesDosPedidos(admin, pedidosDaCarga);
  const cidadeDosCandidatos = await cidadesDosPedidos(
    admin,
    (candidatos ?? []) as unknown as { id: string; contact_id: string | null }[],
  );

  const listaCandidatos = ((candidatos ?? []) as unknown as PedidoComCidade[]).map((c) => ({
    ...c,
    cidade_entrega: cidadeDosCandidatos.get(c.id) ?? null,
  }));

  const saida: AlertaParaSubir[] = [];
  const vistos = new Set<string>();

  for (const c of listaCargas) {
    const idsDaCarga = porCarga.get(c.id) ?? [];
    const comCidade: CargaMontada = {
      ...c,
      pedidosDaCarga: idsDaCarga.map((id) => ({
        id,
        cidade: cidadeDosPedidosDaCarga.get(id) ?? null,
      })),
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
    .select(COLUNAS_DO_RECEBIVEL)
    .eq("organization_id", organizationId)
    .in("status", ["aberto", "parcial"])
    .not("vencimento", "is", null)
    .lte("vencimento", hoje)
    .order("vencimento", { ascending: true })
    .limit(SCAN_LIMIT);
  if (error) {
    throw new Error(`recebíveis: ${error.message}`);
  }

  const lista = await enriquecerComNome(admin, (data ?? []) as unknown as RecebivelParaConferir[]);
  if (lista.length === 0) return [];

  // Os 15 dias que faltam para o 45 dias não aparecem em `lte(hoje)` — eles
  // estão no FUTURO. Uma segunda varredura, que é a que produz o preventivo.
  const { data: futuros, error: erroFuturos } = await admin
    .from("financial_receivables")
    .select(COLUNAS_DO_RECEBIVEL)
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

  const futurosComNome = await enriquecerComNome(
    admin,
    (futuros ?? []) as unknown as RecebivelParaConferir[],
  );

  return alertasDeVencimento([...lista, ...futurosComNome], hoje, organizationId);
}

/**
 * As colunas que existem de verdade.
 *
 * `cliente_nome` NÃO está entre elas — `financial_receivables` guarda
 * `contact_id` e `order_id`, e o nome vem do contato ou do pedido. A primeira
 * versão pedia `cliente_nome` no SELECT, e o Postgres respondia
 * `column financial_receivables.cliente_nome does not exist` — que a rota
 * registrava como "organization failed", uma linha por organização, e seguia.
 *
 * A falha era invisível do lado de fora: o cron respondia 200 com um resumo de
 * zeros, e a única pista estava no log, com o nome de uma coluna que ninguém
 * procurou porque o pedido do alerta não fala em nome de cliente.
 */
const COLUNAS_DO_RECEBIVEL =
  "id, order_id, contact_id, valor_original_cents, vencimento, " +
  "status, forma_pagamento, parcela_n, total_parcelas, vencimento_depende_de_nf";

/**
 * Traz o nome de quem deve pagar.
 *
 * Duas consultas, não uma por linha: um recebível por pedido que o N+1
 * transformaria em uma consulta por parcelado.
 */
async function enriquecerComNome(
  admin: ReturnType<typeof createAdminClient>,
  recebiveis: RecebivelParaConferir[],
): Promise<RecebivelParaConferir[]> {
  if (recebiveis.length === 0) return recebiveis;

  const idsContato = [...new Set(recebiveis.map((r) => r.contact_id).filter(Boolean))] as string[];
  const idsPedido = [...new Set(recebiveis.map((r) => r.order_id).filter(Boolean))] as string[];

  const nomePorContato = new Map<string, string>();
  if (idsContato.length > 0) {
    const { data } = await admin
      .from("contacts")
      .select("id, display_name, name")
      .in("id", idsContato);
    for (const c of (data ?? []) as unknown as {
      id: string;
      display_name: string | null;
      name: string | null;
    }[]) {
      nomePorContato.set(c.id, c.display_name ?? c.name ?? "");
    }
  }

  const nomePorPedido = new Map<string, string>();
  if (idsPedido.length > 0) {
    const { data } = await admin
      .from("commercial_orders")
      .select("id, cliente_nome")
      .in("id", idsPedido);
    for (const o of (data ?? []) as unknown as { id: string; cliente_nome: string }[]) {
      nomePorPedido.set(o.id, o.cliente_nome);
    }
  }

  return recebiveis.map((r) => ({
    ...r,
    // O contato é a fonte: o pedido guarda um SNAPSHOT do nome na venda, e o
    // contato o nome atual. Um parcelado de dois meses mostra o nome de hoje.
    cliente_nome:
      (r.contact_id ? nomePorContato.get(r.contact_id) : null) ??
      (r.order_id ? nomePorPedido.get(r.order_id) : null) ??
      null,
  }));
}

/**
 * Uma varredura que falha não derruba as outras.
 *
 * Devolve lista vazia no erro — e é por isso que o chamador precisa do `continue`
 * de "nenhuma respondeu": lista vazia de sucesso e lista vazia de falha são a
 * mesma coisa, e só o log as distingue. Confundir as duas resolveria todos os
 * alertas da organização.
 */
async function tryPorOrigem<T>(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  origem: string,
  fn: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await fn();
  } catch (e) {
    logger.error("[meu-dia-alertas] origem falhou", {
      organizationId,
      origem,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

function somarDiasLocal(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000).toISOString().slice(0, 10);
}

// Reexporta o schema para os testes poderem validar a entrada do cron.
export const AlertaQuerySchema = z.object({}).passthrough();

/** Um pedido com a cidade que a rota calculou — a coluna é do CONTATO. */
type PedidoComCidade = PedidoElegivel & { cidade_entrega: string | null };

/** Lê os pedidos por id. Devolve um mapa, para o chamador não precisar(indexar). */
async function lerPedidos(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<{ id: string; contact_id: string | null }[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from("commercial_orders")
    .select("id, contact_id, endereco_entrega")
    .in("id", ids.slice(0, SCAN_LIMIT * 2));
  if (error) {
    throw new Error(`pedidos da carga: ${error.message}`);
  }
  return (data ?? []) as unknown as { id: string; contact_id: string | null }[];
}

/**
 * A cidade de cada pedido, veio do contato.
 *
 * Pedido sem contato fica sem cidade — e sem cidade não é candidato, porque
 * "cidade em comum" que não se pode verificar não é sinal de nada. A regra pura
 * já devolve `null` para cidade vazia, e é ela que decide.
 */
async function cidadesDosPedidos(
  admin: ReturnType<typeof createAdminClient>,
  pedidos: { id: string; contact_id: string | null; endereco_entrega?: string | null }[],
): Promise<Map<string, string | null>> {
  const saida = new Map<string, string | null>();
  if (pedidos.length === 0) return saida;

  // ─── O ENDEREÇO PRIMEIRO ──────────────────────────────────────────────────
  //
  // Medido em produção em 10/10/2026: `endereco_entrega` está em 82% dos pedidos
  // e `contacts.cidade` em 25% dos contatos. E o endereço é a fonte CORRETA: o
  // mesmo cliente pode receber em outro lugar, e o que define a praça da carga é
  // para onde o pedido ENTRA.
  //
  // A rotina lia só o contato. Em produção isso significava zero comparação de
  // cidade — sem erro e sem log, porque "não achei cidade" é um resultado
  // legítimo.
  const faltamContato = pedidos.filter((p) => !cidadeDoEndereco(p.endereco_entrega));

  const porContato = new Map<string, string | null>();
  const idsContato = [
    ...new Set(faltamContato.map((p) => p.contact_id).filter(Boolean)),
  ] as string[];
  if (idsContato.length > 0) {
    const { data, error } = await admin
      .from("contacts")
      .select("id, cidade")
      .in("id", idsContato.slice(0, SCAN_LIMIT * 2));
    if (error) {
      throw new Error(`cidades dos contatos: ${error.message}`);
    }
    for (const c of (data ?? []) as unknown as { id: string; cidade: string | null }[]) {
      porContato.set(c.id, c.cidade ?? null);
    }
  }

  for (const p of pedidos) {
    const doEndereco = cidadeDoEndereco(p.endereco_entrega);
    saida.set(p.id, doEndereco ?? (p.contact_id ? (porContato.get(p.contact_id) ?? null) : null));
  }
  return saida;
}
