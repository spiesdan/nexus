/**
 * POST /api/v1/prospecting/campaigns/[id]/laboratorio — roda as 6 personas.
 * GET  /api/v1/prospecting/campaigns/[id]/laboratorio — histórico com delta.
 *
 * ─── O que uma rodada custa ─────────────────────────────────────────────────
 *
 * Até 6 personas × 6 turnos de geração + 6 chamadas de juiz. É gasto LLM de
 * verdade, com a MESMA precedência de provedor da produção (o ponto resolve
 * pelo painel) — testar com modelo diferente do que fala com o cliente seria
 * testar outro agente. Por isso o gate é `manager`, e por isso a resposta diz
 * quantas gerações rodaram.
 *
 * ─── Por que o simulado usa o `gerarAbordagem` real ─────────────────────────
 *
 * Laboratório que testa template testa template. O injetado aqui é o mesmo
 * que escreve a primeira mensagem fria (produtos do catálogo, perfil da
 * campanha, remetente da org). A única diferença para a produção: o harness
 * devolve o texto em vez de enviar — ver `lib/laboratorio/simulacao.ts`.
 *
 * ─── O delta ────────────────────────────────────────────────────────────────
 *
 * O GET devolve as rodadas com a média e o `config_hash` de cada uma. Delta só
 * vale entre rodadas de MESMO hash (nada mudou na campanha) — com hash
 * diferente, a comparação é mostrada mas marcada como "config mudou".
 */
import { createHash, randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { env } from "@/lib/env";
import { gerarAbordagem } from "@/lib/venda-automatica/abordagem";
import { PERSONA_IDS } from "@/lib/laboratorio/personas";
import { simularConversa, type Turno } from "@/lib/laboratorio/simulacao";
import { julgarTranscricao } from "@/lib/laboratorio/juiz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function hashDaConfig(campanha: {
  perfil_abordagem: string | null;
  oferta_produtos: unknown;
  followup_textos: unknown;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        perfil: campanha.perfil_abordagem ?? null,
        oferta: campanha.oferta_produtos ?? [],
        followups: campanha.followup_textos ?? [],
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function configDoJuiz(): { url: string; chave: string; modelo: string } | { falta: string } {
  // A mesma escada do resto da instalação: OpenAI direto, senão OpenRouter.
  // Modelo fixo e barato de propósito: o juiz pontua, não cria — pagar
  // raciocínio caro para dar nota é o gasto que ninguém auditou. Quando
  // existir `JUiz_MODEL` no env, ele manda (ver lib/env.ts).
  if (env.OPENAI_API_KEY) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      chave: env.OPENAI_API_KEY,
      modelo: "gpt-4o-mini",
    };
  }
  if (env.OPENROUTER_API_KEY) {
    return {
      url: `${env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`,
      chave: env.OPENROUTER_API_KEY,
      modelo: "openai/gpt-4o-mini",
    };
  }
  return {
    falta: "Sem chave de IA (OPENAI_API_KEY ou OPENROUTER_API_KEY). Configure em Ajustes → IA.",
  };
}

export async function POST(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("manager", { requestId, resource: "lab_avaliacoes" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: campanha, error: erroCampanha } = await supabase
    .from("automatic_sales_campaigns")
    .select("id, nome, perfil_abordagem, oferta_produtos, followup_textos")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (erroCampanha || !campanha) {
    return fail("not_found", "Campanha não encontrada.", 404, { requestId });
  }
  const camp = campanha as unknown as {
    id: string;
    nome: string;
    perfil_abordagem: string | null;
    oferta_produtos: string[];
    followup_textos: unknown;
  };

  const juiz = configDoJuiz();
  if ("falta" in juiz) {
    return fail("validation_failed", juiz.falta, 422, { requestId });
  }

  let pool: ReturnType<typeof getRequestPool> | null = null;
  try {
    pool = getRequestPool();
  } catch {
    pool = null;
  }
  if (!pool) {
    return fail("internal_error", "Sem pool de banco para a IA (SUPABASE_DB_URL).", 500, {
      requestId,
    });
  }
  const llmCfg = llmEdgeConfigFromEnv(env as unknown as Parameters<typeof llmEdgeConfigFromEnv>[0]);

  const { data: org } = await admin
    .from("organizations")
    .select("display_name")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  const remetente =
    (org as unknown as { display_name?: string | null } | null)?.display_name ?? "a loja";

  let produtos: string[] = [];
  if (camp.oferta_produtos.length > 0) {
    const { data: doCatalogo } = await admin
      .from("catalog_products")
      .select("nome")
      .eq("organization_id", authz.org.orgId)
      .in("id", camp.oferta_produtos)
      .eq("ativo", true)
      .limit(10);
    produtos = ((doCatalogo ?? []) as { nome: string }[]).map((p) => p.nome);
  }

  const hash = hashDaConfig(camp);
  const agora = new Date().toISOString();
  let geracoes = 0;

  const linhas: {
    persona: string;
    nota: number | null;
    resumo: string;
    turnos: number;
  }[] = [];

  for (const personaId of PERSONA_IDS) {
    const simulada = await simularConversa({
      personaId,
      campanhaNome: camp.nome,
      campanhaPerfil: camp.perfil_abordagem,
      gerar: async ({ turno }) => {
        // O contato sintético marca a origem no orçamento: gasto de lab não
        // se mistura com gasto de venda na hora de auditar.
        const gerado = await gerarAbordagem(pool!, llmCfg, {
          tenantId: authz.org.orgId,
          contactId: `lab:${personaId}:${turno}`,
          empresa: {
            nome: "Cliente Simulado",
            categoria: "",
            cidade: "",
            perfil: camp.perfil_abordagem,
          },
          produtos,
          remetente,
        });
        geracoes++;
        if (!gerado.ok) return { ok: false as const, motivo: gerado.reason };
        return { ok: true as const, texto: gerado.texto };
      },
    });

    const turnos: Turno[] = simulada.turnos;
    const veredito = await julgarTranscricao(
      turnos.map((t) => ({ de: t.de, texto: t.texto })),
      juiz,
      {
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
      },
    );

    await admin.from("lab_avaliacoes").insert({
      organization_id: authz.org.orgId,
      campanha_id: camp.id,
      campanha_nome: camp.nome,
      persona: personaId,
      nota: veredito.nota,
      resumo: veredito.resumo,
      achados: veredito.achados,
      transcricao: turnos,
      config_hash: hash,
      rodada_em: agora,
      created_by: authz.user.id,
    });

    linhas.push({
      persona: personaId,
      nota: veredito.nota,
      resumo: veredito.resumo,
      turnos: turnos.length,
    });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "lab.rodada",
    resourceType: "automatic_sales_campaigns",
    resourceId: camp.id,
    requestId,
    metadata: { personas: PERSONA_IDS.length, geracoes },
  });

  const notas = linhas.map((l) => l.nota).filter((n): n is number => n !== null);
  return ok(
    {
      campanha: camp.nome,
      rodada_em: agora,
      config_hash: hash,
      geracoes,
      media: notas.length > 0 ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null,
      linhas,
    },
    { requestId },
  );
}

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "lab_avaliacoes" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lab_avaliacoes")
    .select(
      "id, campanha_nome, persona, nota, resumo, achados, transcricao, config_hash, rodada_em, created_at",
    )
    .eq("organization_id", authz.org.orgId)
    .eq("campanha_id", id)
    .order("rodada_em", { ascending: false })
    .limit(60);
  if (error) {
    return fail("internal_error", "Erro ao ler o histórico.", 500, { requestId });
  }

  type Linha = {
    rodada_em: string;
    persona: string;
    nota: number | null;
    resumo: string;
    config_hash: string;
  };
  const linhas = (data ?? []) as unknown as Linha[];

  // Agrupa por rodada (mesmo instante): média + hash. O delta só vale entre
  // rodadas de mesmo hash — a resposta marca quando a config mudou no meio.
  const rodadas = new Map<string, { notas: (number | null)[]; hash: string; linhas: number }>();
  for (const l of linhas) {
    const r = rodadas.get(l.rodada_em) ?? { notas: [], hash: l.config_hash, linhas: 0 };
    r.notas.push(l.nota);
    r.linhas++;
    rodadas.set(l.rodada_em, r);
  }

  const resumo = [...rodadas.entries()].map(([em, r]) => {
    const validas = r.notas.filter((n): n is number => n !== null);
    return {
      rodada_em: em,
      media:
        validas.length > 0 ? Math.round(validas.reduce((a, b) => a + b, 0) / validas.length) : null,
      config_hash: r.hash,
      personas: r.linhas,
    };
  });

  const deltas: { de: string; para: string; delta: number | null; config_mudou: boolean }[] = [];
  for (let i = resumo.length - 1; i > 0; i--) {
    const anterior = resumo[i]!;
    const atual = resumo[i - 1]!;
    deltas.push({
      de: anterior.rodada_em,
      para: atual.rodada_em,
      delta: anterior.media !== null && atual.media !== null ? atual.media - anterior.media : null,
      config_mudou: anterior.config_hash !== atual.config_hash,
    });
  }

  return ok({ rodadas: resumo, deltas, linhas }, { requestId });
}
