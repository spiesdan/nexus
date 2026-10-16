/**
 * Qual é A foto do produto — resolução compartilhada entre leitura
 * (`crm_get_product_photos`) e envio (`crm_send_product_photo`).
 *
 * Produto ativo da org por código EXATO + fotos ordenadas por posição, sem
 * `local:` (disco do servidor — o envio não alcança). Uma função só para os
 * dois caminhos não divergirem sobre "qual é a foto". Supabase injetado para
 * teste sem banco.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FotoResolvida {
  produto: { id: string; nome: string };
  fotos: Array<{ storage_path: string; posicao: number }>;
}

export async function resolverFotoDoProduto(
  supabase: SupabaseClient,
  organizationId: string,
  codigo: string,
): Promise<
  | { found: false; mensagem: string }
  | { found: true; produto: { id: string; nome: string }; fotos: Array<{ storage_path: string; posicao: number }>; mensagem: string | null }
> {
  const limpo = codigo.trim();
  const { data: produto, error: errProd } = await supabase
    .from("catalog_products")
    .select("id, nome")
    .eq("organization_id", organizationId)
    .eq("codigo", limpo)
    .eq("ativo", true)
    .maybeSingle();
  if (errProd) throw new Error(`buscar_produto_falhou: ${(errProd as { message?: string }).message ?? "erro"}`);
  if (!produto) {
    return {
      found: false,
      mensagem: `não há produto ativo com código "${limpo}" no catálogo. Confira com \`crm_search_products\`.`,
    };
  }
  const p = produto as { id: string; nome: string };
  const { data: fotos, error: errFotos } = await supabase
    .from("product_images")
    .select("storage_path, posicao")
    .eq("organization_id", organizationId)
    .eq("product_id", p.id)
    .order("posicao", { ascending: true });
  if (errFotos) throw new Error(`buscar_fotos_falhou: ${(errFotos as { message?: string }).message ?? "erro"}`);
  const enviaveis = ((fotos ?? []) as { storage_path: string; posicao: number }[]).filter(
    (f) => !f.storage_path.startsWith("local:"),
  );
  return {
    found: true,
    produto: p,
    fotos: enviaveis.map((f) => ({ storage_path: f.storage_path, posicao: f.posicao })),
    mensagem:
      enviaveis.length === 0 ? `o produto "${p.nome}" não tem foto cadastrada para envio.` : null,
  };
}
