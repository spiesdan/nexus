/**
 * GET  /api/v1/invoices/importar-sefaz — cursor do histórico (NSU atual / máximo).
 * POST /api/v1/invoices/importar-sefaz — importa um lote das notas emitidas.
 *
 * Paridade com o "Exporta XMLs" do Odivix: o que a SEFAZ já autorizou para o
 * CNPJ do emitente está lá fora, não no nosso banco. O POST anda a partir do
 * `fiscal_emitidas_cursor` (migration 0253), grava a cada rodada e responde o
 * progresso — a tela mostra "NSU atual / máximo" e pode chamar de novo até
 * alcançar o topo. Falha de sidecar/SEFAZ é 502 com o motivo; o cursor não
 * volta atrás.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarContextoSped, motivoDeNaoBaixar } from "@/lib/fiscal/eventos";
import { importarHistoricoEmitidas } from "@/lib/fiscal/historico";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  /** Documentos emitidos lidos no máximo nesta chamada (padrão 50). */
  limite: z.number().int().min(1).max(200).optional(),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data } = await admin
    .from("fiscal_emitidas_cursor")
    .select("ult_nsu, max_nsu, atualizado_em")
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const cursor = (data ?? null) as {
    ult_nsu: number;
    max_nsu: number;
    atualizado_em: string;
  } | null;
  return ok(
    {
      ult_nsu: Number(cursor?.ult_nsu ?? 0),
      max_nsu: Number(cursor?.max_nsu ?? 0),
      atualizado_em: cursor?.atualizado_em ?? null,
    },
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Parâmetros inválidos (limite de 1 a 200).", 422, {
      requestId,
    });
  }

  // O portão do DOWNLOAD, e não o da transmissão: baixar exige CNPJ +
  // certificado + senha — provedor e IE não entram na chamada à SEFAZ.
  // Com o portão de transmissão aqui, o botão respondia 502 com provedor
  // `stub` mesmo com certificado válido (medido em 10/10/2026). O 502 continua
  // nomeando o que falta em vez de fingir progresso.
  const contexto = await carregarContextoSped(authz.org.orgId);
  const bloqueio = contexto
    ? motivoDeNaoBaixar(contexto)
    : "Sem configuração fiscal para a organização.";
  if (bloqueio) {
    // `fiscal_nao_configurado`, e não `upstream_unavailable`: o portão diz que
    // falta CNPJ, certificado ou senha — estado esperado de instalação sem
    // fiscal completo. `upstream_unavailable` continua reservado para a
    // SEFAZ/sidecar cair DE VERDADE, abaixo — que é vermelho e é o que o
    // operador precisa ver. Juntar os dois obriga a escolher um tom para os dois.
    return fail("fiscal_nao_configurado", `Importação não executada: ${bloqueio}`, 502, {
      requestId,
    });
  }

  const resumo = await importarHistoricoEmitidas(authz.org.orgId, {
    limite: parsed.data.limite,
    rodadas: 4,
    userId: authz.user.id,
  });
  if (!resumo.ok) {
    return fail("upstream_unavailable", resumo.erro ?? "SEFAZ/sidecar indisponível.", 502, {
      requestId,
    });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal.historico_importado",
    resourceType: "invoices",
    resourceId: null,
    requestId,
  });

  return ok(resumo, { requestId });
}
