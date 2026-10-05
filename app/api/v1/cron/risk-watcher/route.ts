/**
 * GET/POST /api/v1/cron/risk-watcher — wave 7, peça 5 (o ciclo).
 *
 * O OBSERVADOR DA TRAVESSIA. Antes desta wave, `classifyRisk` só rodava dentro
 * de rotas de LEITURA: "esfriando" não existia até alguém abrir a tela. Um radar
 * que só enxerga quando observado não é mecanismo anti-morte — é a mesma morte,
 * com testemunha opcional. Esta rota é o que faz o estado acontecer sozinho.
 *
 * Para cada organização com negócio aberto, compara o bucket ATUAL com o
 * GRAVADO. Só escreve quando muda, e a travessia que conta para um humano vira
 * linha na timeline (`lead_cooled` / `lead_reactivated`).
 *
 * ⚠️ NÃO TOCA `crm_leads` — nem direto, nem pelo trigger: os tipos que ele emite
 * estão fora da lista positiva da 0079. É isso que impede o produtor de apagar o
 * próprio estado ao registrá-lo, e que impede um worker de segundo plano de
 * invalidar o arrasto em voo do usuário (o 409 fantasma da 0075). Provado com
 * hash de (id, updated_at) de todos os leads antes e depois da passada.
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|
 * INTERNAL_SECRET, fail-closed).
 *
 * DEPLOY: não há `vercel.json` neste repo (self-host). Esta rota é agendada no
 * serviço `scheduler` do `docker-compose.prod.yml`, a cada 15 min — cadência
 * grossa de propósito, porque a menor janela de estágio é medida em HORAS.
 *
 * ⚠️ Esta nota já pediu o agendamento no futuro do verbo ("o kit PRECISA
 * agendar") e ficou assim por meses: a rota existia, tinha teste e tinha doc, e
 * NINGUÉM A CHAMAVA num self-host — nada esfriava sozinho, nenhuma proposta
 * nascia, e o modo de falha era silencioso ("nada esfriou" é indistinguível de
 * "nada esfriou ainda"). Pedido em comentário não é agendamento. Hoje a garantia
 * é mecânica: `tests/unit/cron-routes-scheduled.test.ts` compara o diretório de
 * rotas com o crontab e fica VERMELHO se alguma rota ficar órfã dos dois lados.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { motorDeDecisaoLigado, novoOrcamento } from "@/lib/leads/laya-decisao";
import { venceReativacoes } from "@/lib/leads/reactivation";
import { observaTravessias } from "@/lib/leads/risk-worker";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Teto de orgs por invocação — a próxima passada pega o resto. */
const ORG_LIMIT = 50;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("crm_leads")
    .select("organization_id")
    .eq("status", "open");
  if (error) {
    logger.error("[risk-watcher] query failed", { error: error.message, requestId });
    return fail("internal_error", "Failed to list organizations.", 500, { requestId });
  }

  const orgs = [
    ...new Set(((rows ?? []) as Array<{ organization_id: string }>).map((r) => r.organization_id)),
  ].slice(0, ORG_LIMIT);

  let travessias = 0;
  let esfriaram = 0;
  let reativaram = 0;
  let falhas = 0;
  let propostas = 0;
  let vencidas = 0;
  let sugestoes = 0;
  let sugestoesAdiadas = 0;
  let sugestoesSemEvidencia = 0;
  let motorCaiu = 0;
  const comErro: string[] = [];

  // UM orçamento para a passada INTEIRA, não um por organização. Cada org
  // chamando o motor com o teto cheio daria ORG_LIMIT x teto inferências num
  // cron de 60 s — e a última org da lista ficaria sem sugestão enquanto a
  // primeira levava tudo. A ordem é a mesma de sempre: a que precisa, primeiro.
  const orcamento = novoOrcamento();

  for (const org of orgs) {
    try {
      const r = await observaTravessias(admin, org, new Date(), orcamento);
      travessias += r.travessias;
      esfriaram += r.esfriaram;
      reativaram += r.reativaram;
      falhas += r.falhasDeAtividade;
      propostas += r.propostas;
      sugestoes += r.sugestoes.decididas;
      sugestoesAdiadas += r.sugestoes.adiadas;
      sugestoesSemEvidencia += r.sugestoes.semEvidencia;
      if (r.sugestoes.falhou) motorCaiu += 1;

      // O VENCIMENTO RODA NO MESMO TICK, depois da travessia. Se morasse num
      // cron separado, a proposta poderia vencer em silêncio até o outro rodar
      // — e o buraco entre os dois seria exatamente onde a demanda morre.
      const v = await venceReativacoes(admin, org, new Date());
      vencidas += v.vencidas;
      falhas += v.falhasDeAtividade;
    } catch (e) {
      // Uma org que falha NÃO derruba as outras. Sem isto, um tenant com dado
      // estranho congelaria o radar de todos os demais — e o sintoma seria
      // "ninguém esfria mais", que é indistinguível de "está tudo em dia".
      comErro.push(org);
      logger.error("[risk-watcher] org falhou", {
        organizationId: org,
        error: e instanceof Error ? e.message : String(e),
        requestId,
      });
    }
  }

  if (falhas > 0) {
    logger.warn("[risk-watcher] travessias sem linha na timeline", { falhas, requestId });
  }
  if (motorCaiu > 0) {
    // Contado e dito: o modo de falha silencioso aqui seria "nenhuma sugestão
    // nova" — indistinguível de "nada esfriou", que já é o pecado deste cron.
    logger.warn("[risk-watcher] motor de decisão indisponível", { organizations: motorCaiu, requestId });
  }

  return ok(
    {
      organizations: orgs.length,
      travessias,
      esfriaram,
      reativaram,
      propostas_criadas: propostas,
      propostas_vencidas: vencidas,
      atividades_falhas: falhas,
      organizations_com_erro: comErro.length,
      // A sugestão de ação (0258) é a única peça desta passada que pode faltar
      // sem estragar o resto — por isso tem contagem própria na resposta.
      motor_de_decisao: motorDeDecisaoLigado(),
      sugestoes_de_acao: sugestoes,
      sugestoes_adiadas: sugestoesAdiadas,
      sugestoes_sem_evidencia: sugestoesSemEvidencia,
      sugestoes_falhas: motorCaiu,
    },
    { requestId },
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
