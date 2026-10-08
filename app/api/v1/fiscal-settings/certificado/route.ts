/**
 * POST /api/v1/fiscal-settings/certificado — ENVIA o certificado A1.
 *
 * Esta rota existe porque a tela, antes, tinha um seletor de arquivo que não
 * enviava arquivo nenhum: pegava o `.pfx` do computador de quem configurou,
 * guardava só o **nome** em `fiscal_settings.certificado_path` e mostrava
 * "configurado". O arquivo nunca saía do navegador. Medido na instalação real
 * depois disso: nenhum `.pfx` na VPS, nenhum em volume, e um
 * `certificado_path` apontando para um arquivo inexistente.
 *
 * ─── Onde o arquivo vai ──────────────────────────────────────────────────────
 *
 * `/srv/fiscal/certs/certificado.pfx` no host, montado em `/fiscal-certs` no
 * contêiner. **Nunca** no Storage: o bucket público transformaria o
 * certificado — que assina nota fiscal — num arquivo com URL adivinhável. O
 * `fiscal/sidecar/README.md` já escrevia essa regra antes de a tela existir.
 *
 * ─── Por que `manager` ───────────────────────────────────────────────────────
 *
 * Mesmo papel do `PUT` da config. Certificado é credencial de assinatura: quem
 * troca o par cert/senha troca quem assina pela empresa.
 *
 * ─── Por que a checagem é de CERTIFICADO e não de ARQUIVO ────────────────────
 *
 * O `accept=".pfx"` do `<input type="file">` é dica de interface, e a interface
 * é do cliente. Um `.exe` renomeado para `.pfx` passa por ele; os bytes
 * começam com `0x30 0x82`, e é isso que a rota exige. Ver `lib/fiscal/certificado.ts`.
 */
import { randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  decidirCertificado,
  DIRETORIO_DE_CERTIFICADOS_NO_HOST,
  NOME_DO_CERTIFICADO,
} from "@/lib/fiscal/certificado";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Só o começo do arquivo, para reconhecer o DER sem ler o certificado todo. */
const BYTES_PARA_RECONHECER = 4;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal_settings" });
  if (!authz.ok) return authz.response;

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!arquivo || typeof arquivo === "string") {
    return fail("validation_failed", 'Envie o certificado no campo "arquivo".', 422, { requestId });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const destino = decidirCertificado(
    {
      size: bytes.byteLength,
      cabecalho: bytes.subarray(0, BYTES_PARA_RECONHECER),
      nomeOriginal: arquivo.name,
    },
    // Por organização: `fiscal_settings` tem mais de uma linha nesta
    // instalação (a real e a de teste do e2e), e um arquivo único faria a
    // segunda sobrescrever o certificado da primeira.
    authz.org.orgId,
  );
  if (!destino.ok) {
    return fail("validation_failed", destino.motivo, destino.status, { requestId });
  }

  // `0o700`/`0o600`: o diretório e o arquivo legíveis só pelo dono. O sidecar
  // precisa LER o `.pfx`, e ele roda como o mesmo usuário do app — por isso
  // leitura em vez de `0o400`, que quebraria o sidecar sem ganho nenhum (quem
  // entra como root lê os dois).
  const diretorio = path.dirname(destino.caminhoNoHost);
  try {
    await mkdir(diretorio, { recursive: true, mode: 0o700 });
    const caminho = destino.caminhoNoHost;
    await writeFile(caminho, bytes, { mode: 0o600 });
    await chmod(caminho, 0o600);
  } catch (e) {
    // A mensagem vai o bastante para o operador agir (falta o volume no
    // compose) sem despejar caminho e `errno` da máquina.
    return fail(
      "internal_error",
      `Não consegui gravar o certificado em ${DIRETORIO_DE_CERTIFICADOS_NO_HOST}. Verifique se o diretório existe no servidor.`,
      500,
      { requestId },
    );
  }

  // O `certificado_path` passa a ser o que o sidecar realmente vai ler. Antes
  // ele era o nome que o navegador mandou, que não apontava para nada.
  const admin = createAdminClient();
  const { error: erroGravacao } = await admin
    .from("fiscal_settings")
    .update({ certificado_path: NOME_DO_CERTIFICADO })
    .eq("organization_id", authz.org.orgId);
  if (erroGravacao) {
    return fail("internal_error", "Certificado gravado, mas não consegui salvar o caminho.", 500, {
      requestId,
    });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal.certificado_enviado",
    resourceType: "fiscal_settings",
    resourceId: null,
    requestId,
  });

  return ok(
    {
      certificado_path: NOME_DO_CERTIFICADO,
      bytes: destino.tamanho,
    },
    { requestId },
  );
}
