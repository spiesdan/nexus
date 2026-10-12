/**
 * POST /api/v1/products/ncm-completar — o lote do NCM.
 *
 * ─── O que faz ──────────────────────────────────────────────────────────────
 *
 * Para cada produto SEM NCM: roda `candidatosDeNcm` contra a IBPT da org.
 * Confiança alta E sem ambiguidade → grava (`ncm_origem: "sugerido"`).
 * Resto → volta na lista `para_revisar` com os candidatos, para decidir na
 * tela de edição (que já mostra sugestão por produto).
 *
 * ─── O piso de auto-aplicação ───────────────────────────────────────────────
 *
 * `LIMIAR_AUTO = 0.9` + margem 0.1 sobre o segundo colocado. O `0.6` do
 * `CONFIANCA_MINIMA` é piso de SUGESTÃO (com humano confirmando); aplicar sem
 * humano exige mais. NCM errado em nota é autuação — e "a máquina preencheu
 * com 0.61" não é defesa.
 *
 * A margem existe pelo caso "ÁLCOOL 70" casando 2207 e 2905 quase juntos:
 * dois candidatos empatados não são decisão, são dúvida — e dúvida vai para
 * humano, não para a nota.
 *
 * ─── Uma auditoria para o lote ──────────────────────────────────────────────
 *
 * 600 linhas de `ncm_sugerido` enterrariam a trilha. Uma `ncm_lote` com
 * contagens + os ids aplicados (teto de 200 na metadata; acima disso, a
 * contagem basta — o detalhe por produto está no `updated_at` de cada um).
 *
 * ─── Sem IBPT, 422 com instrução ────────────────────────────────────────────
 *
 * Sem tabela não há onde se apoiar — nem regra nem IA. A resposta diz onde
 * importar (Notas → IBPT), em vez de rodar e devolver zero em silêncio.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  candidatosDeNcm,
  termosParaFiltrar,
  type LinhaIbptCandidata,
} from "@/lib/catalogo/sugerir-ncm";
import { concordam, sugerirNcmPorIa, type CandidatoParaIa } from "@/lib/catalogo/sugerir-ncm-ia";
import { resolverChaveDeNcm } from "@/lib/catalogo/chave-ncm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Piso para gravar sem humano. Ver o cabeçalho. */
export const LIMIAR_AUTO = 0.9;
/** Distância mínima do 1º para o 2º colocado. Empate é dúvida. */
export const MARGEM_AUTO = 0.1;
/** Teto de ids na metadata da auditoria. */
const TETO_IDS_AUDITORIA = 200;
/**
 * Teto de chamadas Gemini por invocação: 100 itens ≈ 1 min de janela free
 * (15 RPM) com o respiro de 500ms. Acima disso, `continuar: true` e o botão
 * roda de novo — sem timeout estourado no meio do lote.
 */
const TETO_IA_POR_CHAMADA = 100;

interface Aplicado {
  id: string;
  nome: string;
  ncm: string;
  confianca: number;
  /** `regra` = casamento certo sozinho; `regra+ia` = a IA concordou. */
  via: "regra" | "regra+ia";
}

interface ParaRevisar {
  id: string;
  nome: string;
  motivo: "sem_termos" | "sem_candidato" | "ambiguo" | "abaixo_do_piso";
  candidatos: { ncm: string; descricao: string | null; confianca: number }[];
  ia_opiniao?: { ncm: string | null; confianca: number; motivo: string };
}

export async function POST(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: linhas, error: erroIbpt } = await supabase
    .from("fiscal_ibpt" as never)
    .select("codigo, ex, descricao, vigencia_inicio, vigencia_fim")
    .eq("organization_id", authz.org.orgId)
    .eq("tipo", "produto")
    .lte("vigencia_inicio", hoje);
  if (erroIbpt) {
    return fail("internal_error", "Erro ao ler a tabela IBPT.", 500, { requestId });
  }
  // A vigência final sai em JS (mesmo motivo da rota de sugestão: um segundo
  // `.or()` sobrescreveria o primeiro). Linha vencida sugerindo código velho
  // em nota nova é autuação com data marcada.
  const tabela = (
    (linhas ?? []) as unknown as (LinhaIbptCandidata & {
      vigencia_inicio: string;
      vigencia_fim: string | null;
    })[]
  )
    .filter((l) => l.descricao)
    .filter(
      (l) => l.vigencia_inicio <= hoje && (l.vigencia_fim === null || l.vigencia_fim >= hoje),
    );
  if (tabela.length === 0) {
    return fail(
      "validation_failed",
      "Tabela IBPT vazia: importe o CSV oficial em Notas → IBPT antes de completar.",
      422,
      { requestId },
    );
  }

  const { data: produtos, error: erroProdutos } = await supabase
    .from("catalog_products")
    .select("id, nome")
    .eq("organization_id", authz.org.orgId)
    .eq("ativo", true)
    .or("ncm.is.null,ncm.eq.")
    .order("nome")
    .limit(1000);
  if (erroProdutos) {
    return fail("internal_error", "Erro ao listar os produtos.", 500, { requestId });
  }
  const aplicados: Aplicado[] = [];
  const paraRevisar: ParaRevisar[] = [];

  for (const p of (produtos ?? []) as unknown as { id: string; nome: string }[]) {
    const termos = termosParaFiltrar(p.nome);
    if (termos.length === 0) {
      paraRevisar.push({ id: p.id, nome: p.nome, motivo: "sem_termos", candidatos: [] });
      continue;
    }
    const candidatos = candidatosDeNcm(tabela, p.nome, 3);
    if (candidatos.length === 0) {
      paraRevisar.push({ id: p.id, nome: p.nome, motivo: "sem_candidato", candidatos: [] });
      continue;
    }
    const primeiro = candidatos[0]!;
    const segundo = candidatos[1]?.confianca ?? 0;
    const resumidos = candidatos.map((c) => ({
      ncm: c.ncm,
      descricao: c.descricao,
      confianca: Math.round(c.confianca * 100) / 100,
    }));
    if (primeiro.confianca < LIMIAR_AUTO) {
      paraRevisar.push({ id: p.id, nome: p.nome, motivo: "abaixo_do_piso", candidatos: resumidos });
      continue;
    }
    if (primeiro.confianca - segundo < MARGEM_AUTO) {
      paraRevisar.push({ id: p.id, nome: p.nome, motivo: "ambiguo", candidatos: resumidos });
      continue;
    }

    const { error: erroGravacao } = await supabase
      .from("catalog_products")
      .update({
        ncm: primeiro.ncm,
        ncm_origem: "sugerido",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", authz.org.orgId)
      .eq("id", p.id);
    if (erroGravacao) {
      paraRevisar.push({
        id: p.id,
        nome: p.nome,
        motivo: "abaixo_do_piso",
        candidatos: resumidos,
      });
      continue;
    }
    aplicados.push({
      id: p.id,
      nome: p.nome,
      ncm: primeiro.ncm,
      confianca: Math.round(primeiro.confianca * 100) / 100,
      via: "regra",
    });
  }

  // ─── PASSE DE IA (Gemini, zona cinzenta) ──────────────────────────────────
  //
  // Só itens com candidatos (abaixo_do_piso + ambiguo): sem candidatos não há
  // o que julgar. Só com chave configurada: sem ela, tudo já está decidido
  // (revisão). Teto por chamada para não estourar timeout nem cota do free.
  //
  // A chave vem de `resolverChaveDeNcm`: credencial Google da organização
  // primeiro, chave da instalação depois. Ler só o env (como antes) fazia o
  // passe NÃO ligar para quem cadastrou a chave pela tela — o defeito que
  // `lib/catalogo/chave-ncm.ts` documenta.
  const chaveDeIa = await resolverChaveDeNcm(authz.org.orgId);
  const ia = chaveDeIa ? { chave: chaveDeIa.apiKey, modelo: chaveDeIa.modelo } : null;
  let iaChamadas = 0;
  let iaAplicados = 0;
  let continuar = false;

  if (ia) {
    const cinzentos = paraRevisar.filter(
      (r) => (r.motivo === "abaixo_do_piso" || r.motivo === "ambiguo") && r.candidatos.length > 0,
    );
    for (const item of cinzentos) {
      if (iaChamadas >= TETO_IA_POR_CHAMADA) {
        continuar = true;
        break;
      }
      iaChamadas++;
      // Respiro contra o rate limit do tier free (429 vira revisão, mas
      // espaçar evita queimar a cota à toa).
      if (iaChamadas > 1) await new Promise((r) => setTimeout(r, 500));
      const candidatosIa: CandidatoParaIa[] = item.candidatos.map((c) => ({
        ncm: c.ncm,
        descricao: c.descricao,
      }));
      const opiniao = await sugerirNcmPorIa(item.nome, candidatosIa, ia, {
        buscar: async (
          url: string,
          init: { method: string; headers: Record<string, string>; body: string },
        ) => {
          const res = await fetch(url, {
            method: init.method,
            headers: init.headers,
            body: init.body,
          });
          return { status: res.status, corpo: () => res.text() };
        },
      });
      if (!opiniao) continue;
      item.ia_opiniao = { ncm: opiniao.ncm, confianca: opiniao.confianca, motivo: opiniao.motivo };

      const primeiro = item.candidatos[0];
      if (primeiro && concordam(primeiro.ncm, opiniao)) {
        const { error: erroIa } = await supabase
          .from("catalog_products")
          .update({
            ncm: primeiro.ncm,
            ncm_origem: "sugerido",
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", authz.org.orgId)
          .eq("id", item.id);
        if (!erroIa) {
          aplicados.push({
            id: item.id,
            nome: item.nome,
            ncm: primeiro.ncm,
            confianca: primeiro.confianca,
            via: "regra+ia",
          });
          iaAplicados++;
          const i = paraRevisar.indexOf(item);
          if (i >= 0) paraRevisar.splice(i, 1);
        }
      }
    }
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "catalog_product.ncm_lote",
    resourceType: "catalog_products",
    resourceId: null,
    requestId,
    metadata: {
      aplicados: aplicados.length,
      via_ia: iaAplicados,
      ia_chamadas: iaChamadas,
      continuar,
      para_revisar: paraRevisar.length,
      limiar: LIMIAR_AUTO,
      ids: aplicados.slice(0, TETO_IDS_AUDITORIA).map((a) => a.id),
    },
  });

  return ok(
    {
      aplicados,
      para_revisar: paraRevisar,
      ia_chamadas: iaChamadas,
      continuar,
      // "Chave nenhuma" é resposta legítima — o lote usou só a regra. Quem
      // cadastrou a chave pela tela precisa ver que ELA está valendo.
      ia_origem: chaveDeIa
        ? { origem: chaveDeIa.origem, rotulo: chaveDeIa.rotulo, avisos: chaveDeIa.avisos }
        : null,
    },
    { requestId },
  );
}
