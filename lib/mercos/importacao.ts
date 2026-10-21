/**
 * A IMPORTAÇÃO DO MERCOS — o lado do produto.
 *
 * O navegador não roda dentro do Next. Ele mora no serviço `mercos`, que
 * reivindica uma linha desta tabela e executa. O app só enfileira e lê o
 * resultado; é o que mantém a credencial do ERP fora do processo que atende
 * o browser do usuário e o que permite o botão responder em milissegundos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type StatusDaImportacao = "queued" | "running" | "success" | "partial" | "error";

export interface ExecucaoMercos {
  id: string;
  organization_id: string;
  status: StatusDaImportacao;
  origem: "manual" | "cron";
  requested_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  orders_new: number;
  orders_skipped: number;
  items_new: number;
  customers_new: number;
  errors: unknown[];
  summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ResultadoDoEnfileiramento {
  execucao: ExecucaoMercos;
  /** true quando já havia uma execução em curso e o clique não abriu outra. */
  jaEstavaRodando: boolean;
}

/**
 * Enfileira uma execução. O índice único parcial `mercos_import_runs_uma_ativa`
 * é a trava: se outra aba/cron já abriu, o INSERT falha com 23505 e devolvemos
 * a execução que está em curso. Não usamos lock em memória porque o app pode
 * ter mais de uma instância.
 */
export async function enfileirarImportacaoMercos(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    requestedBy: string | null;
    origem: "manual" | "cron";
  },
): Promise<ResultadoDoEnfileiramento> {
  const { data, error } = await admin
    .from("mercos_import_runs")
    .insert({
      organization_id: params.organizationId,
      origem: params.origem,
      requested_by: params.requestedBy,
      status: "queued",
    })
    .select("*")
    .single();

  if (!error && data) {
    return { execucao: data as ExecucaoMercos, jaEstavaRodando: false };
  }

  if (error?.code === "23505") {
    const { data: ativa, error: erroAtiva } = await admin
      .from("mercos_import_runs")
      .select("*")
      .eq("organization_id", params.organizationId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (erroAtiva) throw new Error(erroAtiva.message);
    if (ativa) {
      return { execucao: ativa as ExecucaoMercos, jaEstavaRodando: true };
    }
  }

  throw new Error(error?.message ?? "não foi possível enfileirar a importação do Mercos");
}

export async function ultimaExecucaoMercos(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ExecucaoMercos | null> {
  const { data, error } = await admin
    .from("mercos_import_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ExecucaoMercos | null) ?? null;
}

export async function execucaoMercosPorId(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<ExecucaoMercos | null> {
  const { data, error } = await admin
    .from("mercos_import_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ExecucaoMercos | null) ?? null;
}

/** Organizações que já têm histórico Mercos — o alvo do tick das 17h. */
export async function organizacoesComMercos(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin
    .from("commercial_orders")
    .select("organization_id")
    .eq("origem", "mercos")
    .limit(2000);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.organization_id as string))];
}
