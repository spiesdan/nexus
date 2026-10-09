/**
 * A ROTINA DOS ALERTAS OPERACIONAIS.
 *
 * ─── Por que um motor, e não uma função por origem ───────────────────────────
 *
 * Três rotinas vão subir avisos: NF pendente, pedido fora da carga e vencimento.
 * As três precisam das MESMAS cinco coisas — achar o que mudou, criar o que é
 * novo, reconcilar o que deixou de valer, não duplicar, e não deixar lixo.
 *
 * Feito três vezes, isso vira três lugares onde um dia alguém esquece a
 * reconciliação: o aviso de um pedido que já foi pago continua na tela, e
 * ninguém sabe por quê — porque a limpeza estava no segundo arquivo e no
 * terceiro nunca entrou.
 *
 * A IDEMPOTÊNCIA é `operational_alerts.chave`, com unique parcial sobre
 * `status = 'aberto'`. Uma função só:
 *
 *   - chave nova → INSERT
 *   - chave já aberta → UPDATE (o `repeticoes` sobe, o texto é atualizado)
 *   - o evento deixou de valer → UPDATE para `resolvido`
 *
 * ─── Por que o `repeticoes` existe ───────────────────────────────────────────
 *
 * Um alerta atualizado a cada 5 minutos parece idempotente e esconde a pergunta
 * "a rotina está rodando?". `repeticoes` é o contador de REAFIRMAÇÕES — quantas
 * vezes o tick seguinte confirmou que o aviso continua valendo. É o que separa
 * "aviso que acabou de aparecer" de "aviso de três dias que ninguém tratou", e
 * nenhuma tela mostra isso sem o número.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** As origens que o sistema sabe produzir. Espelha o CHECK da migration 0261. */
export const TIPOS_DE_ALERTA = [
  "nf_pendente",
  "fora_da_carga",
  "vencimento_proximo",
  "vencimento_vencido",
] as const;

export type TipoDeAlerta = (typeof TIPOS_DE_ALERTA)[number];

export type PrioridadeDeAlerta = "baixa" | "normal" | "alta" | "critica";

export interface AlertaParaSubir {
  /**
   * Identidade do EVENTO. Precisa ser estável entre execuções e única por
   * evento — é ela que a unique parcial usa.
   *
   * A forma é `origem_tipo:id_do_registro`. Nunca inclui data, timestamp nem
   * counter: um alert que muda de chave a cada dia vira um aviso novo por dia e
   * a idempotência não existe.
   */
  chave: string;
  origemTipo: TipoDeAlerta;
  origemId?: string | null;
  titulo: string;
  descricao?: string | null;
  acaoRecomendada?: string | null;
  href?: string | null;
  prioridade?: PrioridadeDeAlerta;
}

export interface ResultadoDoTick {
  criados: number;
  atualizados: number;
  resolvidos: number;
}

/** A linha como volta do PostgREST. O `unknown` é porque o schema gerado ainda
 *  não conhece `operational_alerts` — ver `lib/database.types.ts`. */
interface AlertaAberto {
  id: string;
  chave: string;
  repeticoes?: number | null;
  origem_tipo: string;
}

const colunasDeSelect =
  "id, chave, origem_tipo, origem_id, titulo, descricao, acao_recomendada, href, prioridade, repeticoes";

/**
 * Confere uma lista de candidatos contra os alertas abertos e reconcilia.
 *
 * `candidatos` é a lista COMPLETA do que está valendo AGORA. O que estava
 * aberto antes e não aparece aqui é resolvido — é essa a reconciliação, e ela
 * não pode ser esquecida por nenhuma origem.
 */
export async function reconciliarAlertas(
  admin: SupabaseClient,
  organizationId: string,
  candidatos: AlertaParaSubir[],
): Promise<ResultadoDoTick> {
  if (candidatos.length === 0) {
    const resolvidos = await resolverTudo(admin, organizationId, [], "todos");
    return { criados: 0, atualizados: 0, resolvidos };
  }

  const { data: abertos, error } = await admin
    .from("operational_alerts")
    .select(colunasDeSelect)
    .eq("organization_id", organizationId)
    .eq("status", "aberto")
    .in(
      "origem_tipo",
      candidatos.map((c) => c.origemTipo),
    );
  if (error) {
    logger.error("[alertas.reconciliar] leitura dos abertos falhou", {
      error: error.message,
      organizationId,
    });
    return { criados: 0, atualizados: 0, resolvidos: 0 };
  }

  const porChave = new Map<string, AlertaAberto>();
  for (const a of (abertos ?? []) as unknown as AlertaAberto[]) {
    porChave.set(a.chave, a);
  }

  let criados = 0;
  let atualizados = 0;
  for (const c of candidatos) {
    const existente = porChave.get(c.chave);
    if (existente) {
      // UPDATE, e não nada: o texto do alerta muda (o prazo aproxima, o status
      // muda) e o operador precisa ver o estado ATUAL, não o de quando o
      // alerta nasceu. `repeticoes` só para provar que a rotina rodou.
      const { error: e } = await admin
        .from("operational_alerts")
        .update({
          titulo: c.titulo,
          descricao: c.descricao ?? null,
          acao_recomendada: c.acaoRecomendada ?? null,
          href: c.href ?? null,
          prioridade: c.prioridade ?? "normal",
          updated_at: new Date().toISOString(),
          // `repeticoes` volta no payload porque o supabase-js não tem
          // incremento: sem ele, o contador ficaria sempre 0 e o Meu Dia não
          // teria como dizer que a rotina rodou e manteve o aviso.
          repeticoes: (existente.repeticoes ?? 0) + 1,
        })
        .eq("id", existente.id);
      if (e) {
        logger.error("[alertas.reconciliar] update falhou", {
          error: e.message,
          chave: c.chave,
          organizationId,
        });
        continue;
      }
      atualizados++;
    } else {
      const { error: e } = await admin.from("operational_alerts").insert({
        organization_id: organizationId,
        chave: c.chave,
        origem_tipo: c.origemTipo,
        origem_id: c.origemId ?? null,
        titulo: c.titulo,
        descricao: c.descricao ?? null,
        acao_recomendada: c.acaoRecomendada ?? null,
        href: c.href ?? null,
        prioridade: c.prioridade ?? "normal",
        status: "aberto",
      });
      if (e) {
        // Uma corrida entre dois ticks pode bater na unique parcial. O
        // `23505` aqui é ESPERADO e não é erro: o outro tick criou.
        if (!e.message.includes("duplicate") && !e.code?.includes("23505")) {
          logger.error("[alertas.reconciliar] insert falhou", {
            error: e.message,
            chave: c.chave,
            organizationId,
          });
        }
        continue;
      }
      criados++;
    }
  }

  const chavesVivas = new Set(candidatos.map((c) => c.chave));
  const paraResolver = ((abertos ?? []) as unknown as AlertaAberto[]).filter(
    (a) => !chavesVivas.has(a.chave),
  );
  const resolvidos = await resolverTudo(admin, organizationId, paraResolver, "nao-confirmado");

  return { criados, atualizados, resolvidos };
}

async function resolverTudo(
  admin: SupabaseClient,
  organizationId: string,
  linhas: { id: string }[],
  motivo: string,
): Promise<number> {
  if (linhas.length === 0) return 0;
  const { error } = await admin
    .from("operational_alerts")
    .update({
      status: "resolvido",
      resolvido_em: new Date().toISOString(),
      motivo_resolucao: motivo,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .in(
      "id",
      linhas.map((l) => l.id),
    )
    .eq("status", "aberto");
  if (error) {
    logger.error("[alertas.resolver] update falhou", { error: error.message, organizationId });
    return 0;
  }
  return linhas.length;
}
