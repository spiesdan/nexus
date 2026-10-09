/**
 * GET  /api/v1/fiscal-settings — a config fiscal da org (ou null).
 * PUT  /api/v1/fiscal-settings — grava a config (upsert por org).
 *
 * Leitura `viewer`, escrita `manager`: série e CFOP errados geram nota
 * inválida para a empresa inteira.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { certificadoPresenteNoServidor } from "@/lib/fiscal/certificado";
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
  const certificadoPresente = await certificadoPresenteNoServidor(authz.org.orgId);

  return ok(config ? { ...config, certificado_presente: certificadoPresente } : null, {
    requestId,
  });
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

  // `certificado_path` NAO e sobrescrito por este PUT.
  //
  // Medido em 09/10/2026 pela e2e `jornada-fiscal`: o certificado e enviado por
  // upload -- `POST /fiscal-settings/certificado` grava `certificado_path` e
  // escreve o `.pfx` -- e DEPOIS a configuracao e salva por este PUT. O schema
  // tipa `certificado_path` como `.nullable()`, `resto` entra no `upsert` com
  // `null`, e o caminho GRAVADO some.
  //
  // O resultado e o pior tipo de defeito: o arquivo continua no disco e o banco
  // passa a dizer que nao ha certificado. A tela mostra "Nenhum certificado no
  // servidor" com o `.pfx` a dois centimetros dali, e a emissao para -- sem
  // erro, sem log, e sem nada que aponte para um PUT de configuracao.
  //
  // A PRIMEIRA correcao tirou a coluna do corpo, achando que `upsert` com
  // `onConflict` so reescreve o que o corpo menciona. NAO E ASSIM: o PostgREST
  // emite um INSERT com as colunas enviadas e o ON CONFLICT faz DO UPDATE SET
  // de TODAS as colunas da tabela -- as ausentes vao com o DEFAULT da coluna,
  // e `certificado_path` tem default vazio. O resultado foi o mesmo defeito com
  // um codigo diferente, e a e2e continuou reprovando.
  //
  // Por isso a leitura antes. Uma query extra nesta rota, que roda quando
  // alguem salva a configuracao, e o preco de nao apagar o certificado.
  //
  // Nenhum caminho do produto manda `null` de proposito para apagar o
  // certificado; apagar e o que o botao de remover faz, e ele nao e este.
  const { certificado_path: _ignoradoNoPut, ...restoSemCaminho } = resto;

  // A LEITURA USA O MESMO CLIENTE QUE GRAVOU.
  //
  // `POST /fiscal-settings/certificado` grava com `createAdminClient()` --
  // service role, que bypassa RLS -- porque o `fiscal_settings` tem politica
  // restrita. Ler com o cliente da sessao (RLS ligado) pode devolver vazio
  // para um papel que nao tem `select` na tabela, e o resultado e o MESMO
  // defeito: o `upsert` seguinte grava `null` por cima do caminho gravado.
  //
  // Medido em 09/10/2026: com a leitura em `supabase` (sessao), o
  // `certificado_path` continuava vazio depois do PUT, e a e2e reprovava no mesmo
  // ponto -- agora por um motivo diferente do original, e igualmente invisivel.
  const admin = createAdminClient();
  const { data: antes, error: erroAntes } = await admin
    .from("fiscal_settings")
    .select("certificado_path")
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (erroAntes) {
    return fail("internal_error", "Erro ao ler a configuracao atual.", 500, { requestId });
  }

  const { data, error } = await supabase
    .from("fiscal_settings")
    .upsert(
      {
        organization_id: authz.org.orgId,
        ...restoSemCaminho,
        // Reaposta o que JA ESTAVA GRAVADO. `?? null` cobre a instalacao que
        // nunca teve certificado -- nesse caso e `null` de verdade, e gravar
        // `null` e o comportamento certo.
        certificado_path: antes?.certificado_path ?? null,
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
