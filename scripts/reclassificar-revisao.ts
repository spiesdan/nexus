/**
 * Reavalia as linhas marcadas `categoria_revisar` com o resolvedor atual.
 *
 * A tradução Google→PT ganhou categorias novas (Seed supplier, Box lunch,
 * Wheel store, Urgent care, Cramming school, Handicraft). Linhas que estavam
 * em revisão só porque o rótulo não existia passam a ter categoria canônica
 * sem intervenção humana. O que continua ambíguo continua em revisão.
 *
 *   pnpm exec tsx scripts/reclassificar-revisao.ts [--confirmar]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { categoriaEfetiva } from "@/lib/prospeccao/categoria-efetiva";

const SLUG = "bill-higiene-limpeza";

interface Linha {
  id: string;
  nome: string;
  categoria: string | null;
  categorias: string[] | null;
  website: string | null;
  cidade: string | null;
}

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

async function carregar(admin: SupabaseClient, orgId: string): Promise<Linha[]> {
  const PAGINA = 1_000;
  const todos: Linha[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await admin
      .from("business_prospects")
      .select("id, nome, categoria, categorias, website, cidade")
      .eq("organization_id", orgId)
      .eq("bloqueado", false)
      .eq("categoria_revisar", true)
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    todos.push(...((data ?? []) as Linha[]));
    if (!data || data.length < PAGINA) break;
  }
  return todos;
}

async function main(): Promise<void> {
  const confirmar = process.argv.includes("--confirmar");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
  const admin = createClient(url, chave, { auth: { persistSession: false } });

  const { data: org, error: errOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", SLUG)
    .maybeSingle();
  if (errOrg) throw errOrg;
  if (!org) throw new Error(`organização ${SLUG} não encontrada`);

  const linhas = await carregar(admin, org.id as string);
  const decisoes = linhas
    .map((l) => ({
      linha: l,
      efetiva: categoriaEfetiva({
        nome: l.nome,
        categoria: l.categoria,
        categorias: l.categorias,
        website: l.website,
        categoria_canonica: null,
        // `null` = ainda não decidido pela coluna; `true` seria o veto que
        // estamos justamente tentando levantar.
        categoria_revisar: null,
      }),
    }))
    .filter((d) => !d.efetiva.revisar && d.efetiva.rotulo);

  const porCategoria = new Map<string, number>();
  for (const d of decisoes) {
    porCategoria.set(d.efetiva.rotulo, (porCategoria.get(d.efetiva.rotulo) ?? 0) + 1);
  }
  log(`em revisão ........ ${linhas.length}`);
  log(`resolvidas ........ ${decisoes.length}`);
  log(
    `por categoria ..... ${[...porCategoria.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(" · ")}`,
  );
  if (!confirmar) {
    log("SEM GRAVAR. rode com --confirmar.");
    return;
  }

  const LOTE = 50;
  let feitos = 0;
  for (let i = 0; i < decisoes.length; i += LOTE) {
    const fatia = decisoes.slice(i, i + LOTE);
    await Promise.all(
      fatia.map(async (d) => {
        const { error } = await admin
          .from("business_prospects")
          .update({
            categoria_canonica: d.efetiva.rotulo,
            categoria_revisar: false,
            categoria_confianca: d.efetiva.confianca,
          })
          .eq("id", d.linha.id)
          .eq("organization_id", org.id as string);
        if (error) throw error;
      }),
    );
    feitos += fatia.length;
    log(`  ${feitos}/${decisoes.length}`);
  }
  log("aplicado.");
}

const direto = process.argv[1]?.endsWith("reclassificar-revisao.ts");
if (direto) {
  main().catch((e: unknown) => {
    log(`erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
