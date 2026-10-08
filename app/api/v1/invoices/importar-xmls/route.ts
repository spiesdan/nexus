/**
 * POST /api/v1/invoices/importar-xmls — subir XML/ZIP exportados do sistema antigo.
 *
 * Fallback do histórico (Fase 3): quando o caminho da SEFAZ não serve (ou para
 * carregar o que o Odivix emitiu), o operador sube os XMLs/ZIP exportados de
 * lá. Mesma rotina de insert do importador de distribuição e as mesmas travas:
 * procNFe legível, CNPJ do emitente batendo com a configuração fiscal, cStat
 * 100 e dedupe na unique de `chave_acesso` — nada de nota duplicada ou nota
 * de outro emitente entrando por upload.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { unzipSync } from "fflate";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarContextoSped, motivoDeNaoTransmitir } from "@/lib/fiscal/eventos";
import {
  lerProcNfe,
  registrarEmitidas,
  type Candidata,
  type ResumoImportacao,
} from "@/lib/fiscal/historico";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_ARQUIVOS = 300;
const MAX_BYTES_POR_ARQUIVO = 30 * 1024 * 1024;

function xmlsDoArquivo(nome: string, bytes: Uint8Array): { xmls: string[]; erro: string | null } {
  const baixo = nome.toLowerCase();
  if (baixo.endsWith(".zip")) {
    try {
      const entradas = unzipSync(bytes);
      const xmls: string[] = [];
      for (const [arquivo, conteudo] of Object.entries(entradas)) {
        if (arquivo.toLowerCase().endsWith(".xml")) xmls.push(new TextDecoder().decode(conteudo));
      }
      return { xmls, erro: xmls.length > 0 ? null : `${nome}: ZIP sem XML dentro.` };
    } catch {
      return { xmls: [], erro: `${nome}: ZIP ilegível.` };
    }
  }
  if (baixo.endsWith(".xml")) return { xmls: [new TextDecoder().decode(bytes)], erro: null };
  return { xmls: [], erro: `${nome}: só aceito .xml ou .zip.` };
}

function digitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const form = await req.formData().catch(() => null);
  if (!form)
    return fail(
      "validation_failed",
      "Envie um formulário multipart com os XMLs (campo 'arquivos').",
      422,
      { requestId },
    );

  const arquivos = form
    .getAll("arquivos")
    .filter((v): v is File => typeof File !== "undefined" && v instanceof File);
  if (arquivos.length === 0) {
    return fail("validation_failed", "Nenhum arquivo no campo 'arquivos'.", 422, { requestId });
  }
  if (arquivos.length > MAX_ARQUIVOS) {
    return fail("validation_failed", `Máximo de ${MAX_ARQUIVOS} arquivos por envio.`, 422, {
      requestId,
    });
  }

  // O CNPJ do emitente é a régua de quem é "nossa" emissão: sem config
  // fiscal não há o que comparar, e o 502 nomeia o que falta.
  const contexto = await carregarContextoSped(authz.org.orgId);
  const bloqueio = contexto
    ? motivoDeNaoTransmitir(contexto)
    : "Sem configuração fiscal para a organização.";
  // Configuração ausente é estado esperado, não queda de serviço — ver o mesmo
  // portão em `importar-sefaz/route.ts`.
  if (bloqueio)
    return fail("fiscal_nao_configurado", `Importação não executada: ${bloqueio}`, 502, {
      requestId,
    });
  const cnpj = digitos(contexto!.emitente.emitente_documento);

  const resumo: ResumoImportacao = {
    ok: true,
    erro: null,
    lidos: 0,
    importados: 0,
    jaExistiam: 0,
    semXml: 0,
    naoAutorizadas: 0,
    cancelamentos: 0,
    conflitos: 0,
    ult_nsu: 0,
    max_nsu: 0,
    aviso: null,
  };
  const candidatas: Candidata[] = [];
  const erros: string[] = [];
  let foraDoEmitente = 0;

  for (const arquivo of arquivos) {
    if (arquivo.size > MAX_BYTES_POR_ARQUIVO) {
      erros.push(`${arquivo.name}: maior que 30 MB.`);
      continue;
    }
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const { xmls, erro } = xmlsDoArquivo(arquivo.name, bytes);
    if (erro) erros.push(erro);
    for (const xml of xmls) {
      resumo.lidos += 1;
      const lida = lerProcNfe(xml);
      if (!lida) {
        resumo.semXml += 1; // não era procNFe reconhecível
        continue;
      }
      if (lida.cnpj_emitente !== cnpj) {
        foraDoEmitente += 1; // nota de outro emitente: não é nosso histórico
        continue;
      }
      const { cnpj_emitente: _, ...candidata } = lida;
      candidatas.push(candidata);
    }
  }

  const admin = createAdminClient();
  await registrarEmitidas(admin, authz.org.orgId, candidatas, new Set(), resumo, authz.user.id);

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal.historico_importado",
    resourceType: "invoices",
    resourceId: null,
    requestId,
  });

  return ok(
    {
      arquivos: arquivos.length,
      fora_do_emitente: foraDoEmitente,
      ilegiveis: resumo.semXml,
      ...resumo,
      semXml: undefined,
      erros,
    },
    { requestId, status: 201 },
  );
}
