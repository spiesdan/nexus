/**
 * GET /api/v1/prospecting/campaigns/opcoes — as cidades que existem na base.
 *
 * ═══ POR QUE ESTA ROTA EXISTE ═════════════════════════════════════════════
 *
 * O assistente de campanha pedia as cidades num textarea ("uma por linha,
 * Cidade/UF"). O operador tinha de lembrar a grafia exata, e uma diferença de
 * acento fazia a empresa não entrar no público — o filtro normaliza a cidade,
 * mas ninguém adivinha o que a planilha importou. A tela agora SELECIONA da
 * lista que existe de verdade, com a contagem por cidade.
 *
 * A varredura é a mesma base do público (`business_prospects`), com os mesmos
 * filtros que o disparo aplica: WhatsApp potencial, sem opt-out e sem bloqueio.
 * Cidade sem nenhuma empresa elegível não vira opção: selecionar uma cidade
 * vazia e criar uma campanha sem público é o caminho mais curto para a
 * frustração.
 *
 * A rota é somente leitura; não reserva nem cria nada.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { chaveDeCidade } from "@/lib/prospeccao/publico-da-base";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGINA = 1_000;
/** O mesmo teto largo da varredura do público: 50 mil linhas. */
const MAX_PAGINAS = 50;

interface CidadeOpcao {
  cidade: string;
  estado: string | null;
  total: number;
}

interface LinhaDeCidade {
  cidade: string | null;
  estado: string | null;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const porChave = new Map<string, CidadeOpcao>();
  let varridas = 0;

  try {
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
      const de = pagina * PAGINA;
      const { data, error } = await admin
        .from("business_prospects")
        .select("cidade, estado")
        .eq("organization_id", authz.org.orgId)
        .eq("do_not_contact", false)
        .eq("bloqueado", false)
        .eq("whatsapp_potencial", true)
        .not("cidade", "is", null)
        // A ordem explícita mantém a paginação estável; sem ela, um `range`
        // pode ler a mesma linha duas vezes e perder outra.
        .order("id", { ascending: true })
        .range(de, de + PAGINA - 1);

      if (error) throw new Error(error.message);
      const lote = (data ?? []) as unknown as LinhaDeCidade[];
      varridas += lote.length;

      for (const linha of lote) {
        const cidade = (linha.cidade ?? "").trim();
        if (cidade === "") continue;
        const estado = (linha.estado ?? "").trim().toUpperCase() || null;
        // Chave sem acento/caixa: "Caçador" e "Cacador" são a MESMA opção.
        // O rótulo guarda a primeira grafia encontrada — a ordem é estável
        // (id), então não muda a cada abertura da tela.
        const chave = `${chaveDeCidade(cidade)}|${estado ?? ""}`;
        const atual = porChave.get(chave);
        if (atual) atual.total += 1;
        else porChave.set(chave, { cidade, estado, total: 1 });
      }

      if (lote.length < PAGINA) break;
    }
  } catch (e) {
    logger.error("[prospecting.campaigns.opcoes] falha ao ler as cidades", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Não foi possível carregar as cidades da base.", 500, {
      requestId,
    });
  }

  const cidades = [...porChave.values()].sort(
    (a, b) => b.total - a.total || a.cidade.localeCompare(b.cidade, "pt-BR"),
  );

  return ok({ cidades, varridas }, { requestId });
}
