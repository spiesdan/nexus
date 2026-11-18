/**
 * POST /api/v1/invoices/[id]/cancel — cancela uma nota.
 *
 * Pendente/erro cancela direto (nada foi ao fisco). Autorizada é ato formal:
 * o cancelamento é TRANSMITIDO ao SEFAZ (evento 110111, cStat 135) antes de a
 * nota virar "cancelada" — se a SEFAZ recusar ou o sidecar não estiver
 * disponível, a nota continua autorizada e o erro volta na resposta. Nada aqui
 * marca "cancelada" sem protocolo do fisco. Denegada/cancelada não mudam:
 * história fiscal não se reescreve.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  carregarContextoSped,
  motivoDeNaoTransmitir,
  transmitirCancelamento,
} from "@/lib/fiscal/eventos";
import { COLUNAS_DA_NOTA } from "@/lib/schemas/fiscal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  motivo: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: nota } = await supabase
    .from("invoices")
    .select("id, status, chave_acesso, protocolo")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const atual = nota as unknown as {
    id: string;
    status: string;
    chave_acesso: string | null;
    protocolo: string | null;
  } | null;
  if (!atual) return fail("not_found", "Nota não encontrada.", 404, { requestId });

  if (atual.status === "cancelada" || atual.status === "denegada") {
    return fail("validation_failed", "Nota encerrada não pode ser cancelada.", 422, { requestId });
  }
  const justificativa = parsed.data.motivo?.trim() || null;
  if (atual.status === "autorizada" && !justificativa) {
    return fail("validation_failed", "Cancelar nota autorizada exige motivo.", 422, { requestId });
  }

  // ─── A CORRIDA COM O DRAIN ───────────────────────────────────────────────
  //
  // O drain reivindica o job (`pendente → processando`) ANTES de falar com a
  // SEFAZ e grava o resultado na nota no fim. Cancelar no meio dessa janela
  // marcava a nota `cancelada` e o drain, ao voltar, sobrescrevia com
  // `autorizada` — ou o contrário: a nota existe no fisco e o app diz que foi
  // cancelada. O comentário antigo ("o claim condicional protege") valia para
  // dois drains, não para cancel × drain.
  //
  // A ordem agora é a única segura:
  // - job `processando` → 409. Há transmissão em curso; espere o resultado
  //   (autorizada vira cancelamento formal; erro volta a ser cancelável).
  // - job `pendente` → encerra por CAS (`where status = 'pendente'`). Se o
  //   drain reivindicou no meio, o CAS devolve 0 linhas e respondemos 409 —
  //   nunca "cancelada" com transmissão viva.
  const admin = createAdminClient();
  const { data: jobAbertoDb } = await admin
    .from("fiscal_jobs")
    .select("id, status")
    .eq("organization_id", authz.org.orgId)
    .eq("invoice_id", id)
    .in("status", ["pendente", "processando"])
    .maybeSingle();
  const jobAberto = jobAbertoDb as unknown as { id: string; status: string } | null;
  if (jobAberto?.status === "processando") {
    return fail(
      "conflict",
      "A nota está sendo transmitida agora. Aguarde o resultado antes de cancelar.",
      409,
      { requestId },
    );
  }
  if (jobAberto?.status === "pendente") {
    const { data: encerrado } = await admin
      .from("fiscal_jobs")
      .update({
        status: "concluido",
        ultimo_erro: "nota cancelada",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", authz.org.orgId)
      .eq("id", jobAberto.id)
      .eq("status", "pendente")
      .select("id");
    if ((encerrado ?? []).length === 0) {
      return fail(
        "conflict",
        "A nota começou a ser transmitida agora. Aguarde o resultado antes de cancelar.",
        409,
        { requestId },
      );
    }
  }

  // Nota autorizada: o fisco decide antes do banco. Transmitir primeiro — se
  // falhar, a nota segue autorizada e a resposta diz por quê.
  let protocoloCancelamento: string | null = null;
  if (atual.status === "autorizada") {
    if (justificativa && justificativa.length < 15) {
      return fail(
        "validation_failed",
        "Justificativa do cancelamento: mínimo de 15 caracteres.",
        422,
        { requestId },
      );
    }
    const contexto = await carregarContextoSped(authz.org.orgId);
    const bloqueio = contexto
      ? motivoDeNaoTransmitir(contexto)
      : "Sem configuração fiscal para a organização.";
    if (bloqueio) {
      // Configuração ausente é estado esperado — o mesmo tom de
      // `fiscal_nao_configurado` em `importar-xmls/route.ts`. O 502 abaixo,
      // logo depois, é o sidecar caindo de verdade, e esse continua
      // `upstream_unavailable`.
      return fail("fiscal_nao_configurado", `Cancelamento não transmitido: ${bloqueio}`, 502, {
        requestId,
      });
    }
    if (!atual.chave_acesso || !atual.protocolo) {
      return fail("validation_failed", "Nota autorizada sem chave de acesso ou protocolo.", 422, {
        requestId,
      });
    }
    const r = await transmitirCancelamento(contexto!, {
      chave: atual.chave_acesso,
      protocolo: atual.protocolo,
      justificativa: justificativa!,
    });
    if (!r.ok) {
      const detalhe = r.cstat
        ? `cStat ${r.cstat}: ${r.xmotivo ?? "sem motivo"}`
        : (r.xmotivo ?? "falha sem motivo");
      if (r.retentavel) {
        return fail(
          "upstream_unavailable",
          `Sidecar fiscal indisponível — cancelamento não transmitido (${detalhe}).`,
          502,
          { requestId },
        );
      }
      return fail("validation_failed", `SEFAZ recusou o cancelamento (${detalhe}).`, 422, {
        requestId,
      });
    }
    protocoloCancelamento = r.protocolo;
  }

  // CAS no status lido: se o drain/outra chamada mudou a nota no meio (por
  // exemplo, terminou a emissão), não sobrescrevemos com um "cancelada" velho.
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "cancelada", erro: justificativa })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .eq("status", atual.status)
    .select(COLUNAS_DA_NOTA)
    .maybeSingle();

  if (error) {
    return fail("internal_error", "Erro ao cancelar a nota.", 500, { requestId });
  }
  if (!data) {
    return fail(
      "conflict",
      "O estado da nota mudou durante o cancelamento. Recarregue e confira antes de tentar de novo.",
      409,
      { requestId },
    );
  }

  await admin.from("fiscal_events").insert({
    organization_id: authz.org.orgId,
    invoice_id: id,
    tipo: "cancelada",
    status: "cancelada",
    protocolo: protocoloCancelamento,
    mensagem: justificativa,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "invoice.cancelled",
    resourceType: "invoices",
    resourceId: id,
    requestId,
  });

  return ok(data, { requestId });
}
