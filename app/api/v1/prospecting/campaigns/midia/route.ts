/**
 * A MÍDIA DE UM SLOT DA CAMPANHA — subir do computador, sem colar URL.
 *
 * ─── Por que uma rota própria ──────────────────────────────────────────────
 *
 * A rota de mídia do inbox exige uma CONVERSA, e a de templates do parceiro é
 * para a definição do modelo. Aqui o arquivo é de uma CAMPANHA: ele vira o
 * valor de um slot de cabeçalho (imagem/vídeo/documento) e é reaproveitado por
 * todos os prospects da lista.
 *
 * ─── O que a resposta devolve ──────────────────────────────────────────────
 *
 * `referencia` é o que a campanha GUARDA (`bucket://whatsapp-media/…`), e é
 * assinada de novo a cada envio — campanha dura semanas e URL assinada vence.
 * `url` é curta e serve só para a tela mostrar o arquivo agora; ninguém deve
 * gravá-la na configuração.
 *
 * O bucket segue PRIVADO (migration 0055): ele também guarda a mídia das
 * conversas, e abri-lo para resolver o cabeçalho de uma campanha exporia o
 * histórico de todos os clientes.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { referenciaDeMidia } from "@/lib/channels/templates/midia";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "whatsapp-media";

/**
 * Os formatos que a Meta aceita em cabeçalho de template, com o teto de cada
 * um. Recusar aqui é melhor que deixar subir: o arquivo iria para o storage, a
 * campanha seria ativada, e a recusa chegaria na ENTREGA falando de um formato
 * que a tela deixou escolher.
 */
const TIPOS: Record<string, { ext: string; max: number; rotulo: string }> = {
  "image/jpeg": { ext: "jpg", max: 5 * 1024 * 1024, rotulo: "imagem JPG" },
  "image/png": { ext: "png", max: 5 * 1024 * 1024, rotulo: "imagem PNG" },
  "video/mp4": { ext: "mp4", max: 16 * 1024 * 1024, rotulo: "vídeo MP4" },
  "application/pdf": { ext: "pdf", max: 20 * 1024 * 1024, rotulo: "documento PDF" },
};

/** O link de preview morre em 1h; a campanha nunca guarda esta URL. */
const VALIDADE_PREVIEW_SEGUNDOS = 60 * 60;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "prospecting_campaigns",
  });
  if (!authz.ok) return authz.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", "Campo 'file' (multipart) obrigatório.", 422, { requestId });
  }

  const mime = file.type || "application/octet-stream";
  const tipo = TIPOS[mime];
  if (!tipo) {
    return fail(
      "unsupported_media_type",
      "A campanha aceita imagem JPG/PNG, vídeo MP4 ou documento PDF.",
      415,
      { requestId },
    );
  }
  if (file.size > tipo.max) {
    return fail(
      "payload_too_large",
      `O arquivo precisa ter até ${Math.round(tipo.max / (1024 * 1024))} MB (${tipo.rotulo}).`,
      413,
      { requestId },
    );
  }

  const caminho = `${authz.org.orgId}/campanhas/${randomUUID()}.${tipo.ext}`;
  const admin = createAdminClient();

  const { error: erroUp } = await admin.storage
    .from(BUCKET)
    .upload(caminho, Buffer.from(await file.arrayBuffer()), {
      contentType: mime,
      upsert: false,
    });
  if (erroUp) {
    logger.error("[prospecting.campaigns.midia] upload falhou", {
      requestId,
      organization_id: authz.org.orgId,
      detail: erroUp.message,
    });
    return fail("internal_error", "Erro ao subir o arquivo.", 500, { requestId });
  }

  const { data: assinada, error: erroUrl } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(caminho, VALIDADE_PREVIEW_SEGUNDOS);
  if (erroUrl || !assinada?.signedUrl) {
    logger.error("[prospecting.campaigns.midia] assinatura falhou", {
      requestId,
      organization_id: authz.org.orgId,
      detail: erroUrl?.message ?? "sem url",
    });
    return fail("internal_error", "Erro ao preparar o link do arquivo.", 500, { requestId });
  }

  return ok(
    { referencia: referenciaDeMidia(caminho), path: caminho, url: assinada.signedUrl },
    { requestId },
  );
}
