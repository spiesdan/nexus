/**
 * POST /api/v1/fiscal-entradas/[id]/manifestar — declara ciência da nota.
 *
 * Sem manifestação, a SEFAZ não libera o XML completo (regra dela, não
 * nossa) — e sem XML não há itens para importar. A ciência (210210) é o
 * evento seguro de rotina: diz "vi a nota", sem confirmar a operação.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { caminhoDoCertificadoNoSidecar } from "@/lib/fiscal/certificado";
import { limiteDoClaim } from "@/lib/fiscal/claims";
import { manifestarNaSefaz, type ContextoEntrada } from "@/lib/fiscal/entrada";
import { carregarContextoSped } from "@/lib/fiscal/sped-payload";
import { resolverProvedor } from "@/lib/fiscal/provedor";
import {
  COLUNAS_DA_ENTRADA,
  manifestarEntradaSchema,
  NOME_DO_EVENTO,
  type EntradaFiscal,
} from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fiscal-entradas" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const parsed = manifestarEntradaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  // Decisão da spec 21 §12: ciência é rotina (agent); confirmação,
  // desconhecimento e não-realizada são atos declarativos com consequência
  // contábil (manager). A policy de `fiscal_manifestations` repete a regra,
  // então um INSERT direto no PostgREST não fura.
  if (parsed.data.evento !== "210210") {
    const gerente = await requireRole("manager", { requestId, resource: "fiscal-entradas" });
    if (!gerente.ok) return gerente.response;
  }
  if (parsed.data.evento === "210240" && (parsed.data.justificativa ?? "").trim().length < 15) {
    return fail(
      "validation_failed",
      "Operação não realizada exige justificativa (15+ letras).",
      422,
      { requestId },
    );
  }

  const supabase = await createClient();
  const { data: linha } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const entrada = linha as unknown as EntradaFiscal | null;
  if (!entrada) return fail("not_found", "Entrada não encontrada.", 404, { requestId });
  if (entrada.status === "importada") {
    return fail(
      "invalid_state_transition",
      "Entrada já importada — manifestação não muda mais nada.",
      409,
      { requestId },
    );
  }
  if (entrada.status === "ignorada") {
    return fail(
      "invalid_state_transition",
      "Entrada ignorada — reative antes de manifestar.",
      409,
      { requestId },
    );
  }

  const { data: cfgRaw } = await supabase
    .from("fiscal_settings")
    .select("provedor")
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (
    resolverProvedor({
      provedor: (cfgRaw as unknown as { provedor?: string | null } | null)?.provedor ?? null,
    }) !== "spednfe"
  ) {
    return fail("validation_failed", "Sem emissor fiscal com certificado.", 422, { requestId });
  }
  const ctx = await carregarContextoSped(authz.org.orgId);
  if (!ctx || !ctx.emitente.uf || !ctx.emitente.certificado_path || !ctx.senhaCertificado) {
    return fail(
      "validation_failed",
      "Faltam UF, certificado (.pfx) ou senha na configuração fiscal.",
      422,
      { requestId },
    );
  }
  const ctxEntrada: ContextoEntrada = {
    ambiente: ctx.emitente.ambiente,
    cnpj: (ctx.emitente.emitente_documento ?? "").replace(/\D/g, ""),
    razao: ctx.emitente.emitente_documento ?? "",
    ie: ctx.emitente.ie ?? "",
    uf: ctx.emitente.uf,
    certificadoPath: ctx.emitente.certificado_path,
    // O sidecar valida que o caminho esta dentro de `/certs/`, e o
    // `certificado_path` do banco e so o NOME. Sem este campo o caminho
    // montado aqui seria recusado com "deve estar dentro de /certs/" e a
    // // nota apareceria como "nao transmitida", sem dizer que o caminho
    // esta errado.
    caminhoDoCertificado: caminhoDoCertificadoNoSidecar(ctx.orgId),
    senhaCertificado: ctx.senhaCertificado,
  };

  // ─── A MESMA MANIFESTAÇÃO NÃO VAI DUAS VEZES À SEFAZ ───────────────────
  //
  // Retry depois do sucesso: o evento já tem protocolo gravado; devolve o
  // resultado original em vez de transmitir de novo (a SEFAZ recusaria como
  // duplicidade e a timeline ficaria com um "erro" falso).
  const evento = NOME_DO_EVENTO[parsed.data.evento];
  const { data: jaFeita } = await supabase
    .from("fiscal_manifestations")
    .select("protocolo, cstat, created_at")
    .eq("organization_id", authz.org.orgId)
    .eq("entrada_id", id)
    .eq("evento", evento)
    .eq("resultado", "sucesso")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jaFeita) {
    return ok(
      {
        evento,
        protocolo: (jaFeita as { protocolo: string | null }).protocolo,
        cstat: (jaFeita as { cstat: string | null }).cstat,
        ja_existia: true,
      },
      { requestId, status: 200 },
    );
  }

  // Claim da transmissão: dois cliques simultâneos, um transmite e o outro
  // recebe 409. O TTL de 5 min recupera processo morto. Nenhum status muda
  // aqui — a entrada só vira `manifestada` depois do protocolo.
  const claimEm = new Date().toISOString();
  const limite = limiteDoClaim(new Date());
  let reivindicado = false;
  {
    const { data } = await supabase
      .from("fiscal_entradas")
      .update({ manifestacao_em_andamento_em: claimEm })
      .eq("organization_id", authz.org.orgId)
      .eq("id", id)
      .is("manifestacao_em_andamento_em", null)
      .select("id");
    reivindicado = (data ?? []).length > 0;
  }
  if (!reivindicado) {
    const { data } = await supabase
      .from("fiscal_entradas")
      .update({ manifestacao_em_andamento_em: claimEm })
      .eq("organization_id", authz.org.orgId)
      .eq("id", id)
      .lt("manifestacao_em_andamento_em", limite)
      .select("id");
    reivindicado = (data ?? []).length > 0;
  }
  if (!reivindicado) {
    return fail(
      "conflict",
      "A manifestação desta entrada já está sendo transmitida. Aguarde o resultado.",
      409,
      { requestId },
    );
  }
  const liberarClaim = async (): Promise<void> => {
    await supabase
      .from("fiscal_entradas")
      .update({ manifestacao_em_andamento_em: null })
      .eq("organization_id", authz.org.orgId)
      .eq("id", id)
      .eq("manifestacao_em_andamento_em", claimEm);
  };

  let resultado: Awaited<ReturnType<typeof manifestarNaSefaz>>;
  try {
    resultado = await manifestarNaSefaz(
      ctxEntrada,
      entrada.chave,
      parsed.data.evento,
      parsed.data.justificativa,
    );
  } catch (err) {
    await liberarClaim();
    throw err;
  }
  // A transmissão terminou (com sucesso ou erro): o claim já cumpriu o papel.
  // Liberar antes das gravações permite que um retry explícito prossiga sem
  // esperar o TTL; a SEFAZ não é chamada de novo por causa disso.
  await liberarClaim();

  if (!resultado.ok) {
    // A tentativa que falhou também é histórico: sem esta linha, a tela de
    // manifestações mostraria só os sucessos e o operador não saberia que a
    // SEFAZ recusou.
    await supabase.from("fiscal_manifestations").insert({
      organization_id: authz.org.orgId,
      entrada_id: id,
      evento: NOME_DO_EVENTO[parsed.data.evento],
      justificativa: parsed.data.justificativa ?? null,
      cstat: resultado.cstat,
      resultado: "erro",
      mensagem: resultado.erro ?? "SEFAZ inalcançável.",
      usuario_id: authz.user.id,
    });
    return fail("upstream_unavailable", resultado.erro ?? "SEFAZ inalcançável.", 502, {
      requestId,
    });
  }

  await supabase.from("fiscal_manifestations").insert({
    organization_id: authz.org.orgId,
    entrada_id: id,
    evento: NOME_DO_EVENTO[parsed.data.evento],
    justificativa: parsed.data.justificativa ?? null,
    protocolo: resultado.protocolo,
    cstat: resultado.cstat,
    resultado: "sucesso",
    usuario_id: authz.user.id,
  });

  await supabase
    .from("fiscal_entradas")
    .update({
      manifestacao: resultado.manifestacao,
      manifestada_em: new Date().toISOString(),
      status: "manifestada",
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId);

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal_entrada.manifestada",
    resourceType: "fiscal_entradas",
    resourceId: id,
    requestId,
  });

  return ok(
    { manifestacao: resultado.manifestacao, protocolo: resultado.protocolo },
    { requestId },
  );
}
