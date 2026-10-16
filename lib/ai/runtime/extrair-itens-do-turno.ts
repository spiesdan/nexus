/**
 * Itens que `crm_search_products` devolveu NESTE run do runtime legado,
 * extraídos dos tool results crus (antes da serialização com redact, que pode
 * truncar a lista). Formato defensivo: o SDK entrega `toolResults[]` com
 * `toolName` + `output`.
 */
import type { ItemCitavel } from "@/lib/agent-engine/guardrails/catalog-identity";

export function extrairItensDoTurnoLegado(steps: readonly unknown[]): ItemCitavel[] {
  const itens: ItemCitavel[] = [];
  for (const step of steps) {
    const resultados = (step as { toolResults?: unknown }).toolResults;
    if (!Array.isArray(resultados)) continue;
    for (const r of resultados) {
      const rec = r as { toolName?: unknown; output?: unknown; result?: unknown };
      if (rec.toolName !== "crm_search_products") continue;
      const out = (rec.output ?? rec.result) as { produtos?: unknown };
      const prods = Array.isArray(out?.produtos) ? out.produtos : [];
      for (const p of prods) {
        const pr = p as { codigo?: unknown; nome?: unknown; preco_cents?: unknown; relacao?: unknown };
        if (typeof pr.codigo !== "string" || typeof pr.nome !== "string") continue;
        itens.push({
          codigo: pr.codigo,
          nome: pr.nome,
          preco_cents: typeof pr.preco_cents === "number" ? pr.preco_cents : 0,
          ...(pr.relacao === "relacionada" ? { relacao: "relacionada" as const } : {}),
        });
      }
    }
  }
  return itens;
}

/**
 * Fallback honesto quando a validação de identidade veta a resposta do modelo
 * no runtime legado (sem cadeia before_send): não envia o texto incorreto e
 * não inventa outro — diz que vai conferir. Sem preço, sem produto, sem
 * promessa: passa por qualquer validação e não cria compromisso.
 */
export const FALLBACK_IDENTIDADE_LEGADO =
  "Deixa eu conferir certinho esse item aqui e já te retorno, tá?";
