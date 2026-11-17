/**
 * `pnpm audit:run` — exporta o trace durável do `before_send` de um run.
 *
 * ─── POR QUE ESTE COMANDO EXISTE ──────────────────────────────────────────
 *
 * A cadeia `before_send` grava cada gate avaliado em `before_send_traces`
 * (`before-send.ts`, `persistTrace`), e o próprio comentário da cadeia prometia
 * "exportável por run — o comando `pnpm audit:run`, acceptance 3". O comando
 * **não existia**: a linha durável era gravada e ninguém conseguia exportá-la.
 * É o acceptance 3 do F4-08, e é o que transforma "acho que o gate vetou" em
 * evidência.
 *
 * ─── O QUE ELE FAZ ────────────────────────────────────────────────────────
 *
 * Lê `before_send_traces` por `job_id` (o RUN é `job_queue.id`), por organização
 * e/ou desde um instante, e imprime o JSON com os gates, veredito e código do
 * veto. Sem PII: a tabela não guarda telefone, e-mail nem conteúdo de mensagem.
 *
 * Uso:
 *   pnpm audit:run --run <job_id>
 *   pnpm audit:run --org <uuid> --since 2026-11-17T00:00:00Z --limit 200
 *
 * Requer as variáveis de ambiente do app (service role) carregadas.
 */
import { createAdminClient } from "@/lib/supabase/admin";

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const run = argumento("--run");
  const org = argumento("--org");
  const since = argumento("--since");
  const limiteBruto = Number(argumento("--limit") ?? 500);
  const limite = Number.isFinite(limiteBruto)
    ? Math.min(2000, Math.max(1, Math.trunc(limiteBruto)))
    : 500;

  if (!run && !org) {
    console.error(
      "Uso: pnpm audit:run --run <job_id> [--org <uuid>] [--since ISO] [--limit N]\n" +
        "     (sem --run, informe --org; exportar a instalação inteira não é auditoria de run)",
    );
    process.exit(2);
  }

  const admin = createAdminClient();
  let consulta = admin
    .from("before_send_traces")
    .select(
      "id, organization_id, job_id, contact_id, channel_session_id, trace, vetoed_gate, vetoed_code, created_at",
    )
    .order("created_at", { ascending: true })
    .limit(limite);

  if (run) consulta = consulta.eq("job_id", run);
  if (org) consulta = consulta.eq("organization_id", org);
  if (since) consulta = consulta.gte("created_at", since);

  const { data, error } = await consulta;
  if (error) {
    console.error("Falha ao ler before_send_traces:", error.message);
    process.exit(1);
  }

  const linhas = (data ?? []) as Array<{
    vetoed_gate: string | null;
    trace: unknown;
  }>;
  const vetos = linhas.filter((l) => l.vetoed_gate !== null).length;

  // O JSON vai para stdout (dá para redirecionar para arquivo); o resumo vai
  // para stderr, para não contaminar o artefato.
  process.stdout.write(`${JSON.stringify(data ?? [], null, 2)}\n`);
  console.error(
    `[audit:run] ${linhas.length} trace(s) · ${vetos} veto(s)` +
      (run ? ` · run ${run}` : "") +
      (org ? ` · org ${org}` : "") +
      (since ? ` · desde ${since}` : ""),
  );
}

void main();
