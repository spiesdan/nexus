/**
 * GET  /api/v1/fiscal-settings — a config fiscal da org (ou null).
 * PUT  /api/v1/fiscal-settings — grava a config (upsert por org).
 *
 * Leitura `viewer`, escrita `manager`: série e CFOP errados geram nota
 * inválida para a empresa inteira.
 */
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { DIRETORIO_DE_CERTIFICADOS_NO_APP, NOME_DO_CERTIFICADO } from "@/lib/fiscal/certificado";
import { configFiscalSchema, type ConfigFiscalSalva } from "@/lib/schemas/fiscal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

const COLUNAS =
  "serie, natureza_operacao, cfop_padrao, emitente_documento, ie, crt, logradouro, " +
  "numero_end, bairro, municipio, codigo_municipio, uf, cep, ambiente, provedor, " +
  "certificado_path, updated_at";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal_settings" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fiscal_settings")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (error) return fail("internal_error", "Erro ao ler a configuração.", 500, { requestId });

  // `data` vem sem tipo do PostgREST quando a tabela é lida com uma lista de
  // colunas em `const` — daí o cast explícito, o mesmo que as outras rotas
  // desta pasta fazem.
  const config = (data ?? null) as ConfigFiscalSalva | null;
  // `certificado_presente` responde "o arquivo EXISTE", e não "o campo tem
  // texto". São coisas diferentes, e a diferença é o defeito inteiro: a
  // instalação ficou com `certificado_path = "PATRICIA CNPJ (1).pfx"` gravado e
  // nenhum `.pfx` na máquina — a tela mostrava um certificado configurado que
  // não existia, e nada avisava.
  //
  // Sem este campo, a tela volta a ser um espelho do texto e a mentira volta
  // junto.
  const certificadoPresente = config?.certificado_path
    ? await certificadoExisteNoServidor(config.certificado_path)
    : false;

  return ok(config ? { ...config, certificado_presente: certificadoPresente } : null, {
    requestId,
  });
}

/**
 * O arquivo indicado está no disco?
 *
 * Só um `stat` com o NOME FIXO, sem concatenar o que veio do banco: um
 * `certificado_path` forjado apontaria para qualquer arquivo do contêiner.
 */
async function certificadoExisteNoServidor(nome: string): Promise<boolean> {
  if (nome !== NOME_DO_CERTIFICADO) return false;
  try {
    const st = await stat(path.join(DIRETORIO_DE_CERTIFICADOS_NO_APP, NOME_DO_CERTIFICADO));
    return st.isFile() && st.size > 0;
  } catch {
    // Sem diretório montado é o estado normal de quem não enviou certificado.
    return false;
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal_settings" });
  if (!authz.ok) return authz.response;

  const parsed = configFiscalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();

  // A senha do certificado nunca grava em plaintext: cifra com a infra
  // compartilhada (mesma dos webhooks/Meta) ou 422 explicando. String vazia
  // ou ausente = mantém a que já está (não zera sem querer).
  const { certificado_senha, ...resto } = parsed.data;
  let senhaCifrada: string | undefined;
  if (certificado_senha !== undefined && certificado_senha !== null && certificado_senha !== "") {
    const admin = createAdminClient();
    const enc = await encryptWebhookSecret(admin, certificado_senha);
    if (enc === null) {
      return fail(
        "validation_failed",
        "Cifra indisponível (chave de criptografia ausente no servidor).",
        422,
        { requestId },
      );
    }
    senhaCifrada = enc;
  }

  const { data, error } = await supabase
    .from("fiscal_settings")
    .upsert(
      {
        organization_id: authz.org.orgId,
        ...resto,
        ...(senhaCifrada !== undefined ? { certificado_senha_encrypted: senhaCifrada } : {}),
      },
      { onConflict: "organization_id" },
    )
    .select(COLUNAS)
    .single();

  if (error || !data) {
    return fail("internal_error", "Erro ao salvar a configuração.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal_settings.updated",
    resourceType: "fiscal_settings",
    resourceId: authz.org.orgId,
    requestId,
  });

  return ok(data, { requestId });
}
