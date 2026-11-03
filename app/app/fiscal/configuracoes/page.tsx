import Link from "next/link";

import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { certificadoPresenteNoServidor } from "@/lib/fiscal/certificado";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { tagDeIdioma } from "@/lib/i18n/datas";
import type { ConfigFiscalSalva } from "@/lib/schemas/fiscal";
import { createClient } from "@/lib/supabase/server";

import { ConfiguracoesDaEntrada } from "./_components/ConfiguracoesDaEntrada";

export const dynamic = "force-dynamic";

/** Fora do render: `Date.now()` no corpo do componente é impuro (lint). */
function emBackoff(proximaTentativa: string | null): boolean {
  if (!proximaTentativa) return false;
  return Date.parse(proximaTentativa) > Date.now();
}

/**
 * CONFIGURAÇÕES FISCAIS — o que a distribuição DF-e precisa para funcionar.
 *
 * A tela não é um segundo cadastro: ela edita a MESMA linha de
 * `fiscal_settings` que a emissão usa, com foco no que o recebimento consome
 * (CNPJ, UF, ambiente, certificado A1 e o ritmo da sincronização). Série, CFOP
 * e endereço continuam em Emissão → Configuração; aqui eles só viajam intactos.
 *
 * Os avisos são o estado REAL, não o texto do banco: o certificado é checado
 * em disco (`certificadoPresenteNoServidor`), e o cursor diz se a última
 * tentativa foi bloqueada por 656.
 */
export default async function ConfiguracoesFiscaisPage() {
  const { org, podeGerir, user } = await contextoFiscal();
  const tagIdioma = tagDeIdioma(user.idioma);
  const supabase = await createClient();

  const [{ data: configRaw }, { data: certRaw }, { data: cursorRaw }, presente] =
    await Promise.all([
      supabase.from("fiscal_settings").select("*").eq("organization_id", org.orgId).maybeSingle(),
      supabase
        .from("fiscal_certificates")
        .select("arquivo, titular, validade, enviado_em")
        .eq("organization_id", org.orgId)
        .is("revogado_em", null)
        .maybeSingle(),
      supabase
        .from("fiscal_entrada_cursor")
        .select("ult_nsu, max_nsu, proxima_tentativa, ultimo_erro, atualizado_em")
        .eq("organization_id", org.orgId)
        .maybeSingle(),
      certificadoPresenteNoServidor(org.orgId),
    ]);

  const config = configRaw as unknown as ConfigFiscalSalva | null;
  const certificado = certRaw as unknown as {
    arquivo: string;
    titular: string | null;
    validade: string | null;
  } | null;
  const cursor = cursorRaw as unknown as {
    ult_nsu: number;
    max_nsu: number;
    proxima_tentativa: string | null;
    ultimo_erro: string | null;
    atualizado_em: string;
  } | null;

  const bloqueado = emBackoff(cursor?.proxima_tentativa ?? null);

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Configurações fiscais"
        subtitle="Identidade fiscal, certificado A1 e o ritmo da sincronização de notas de entrada."
        actions={
          <Link
            href="/app/notas?aba=config"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Série, CFOP e endereço da emissão →
          </Link>
        }
      />

      {!config && (
        <p className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm">
          <strong>Nada configurado ainda.</strong> Preencha o CNPJ, a UF e envie o certificado A1
          para a SEFAZ começar a entregar as notas.
        </p>
      )}

      {bloqueado && (
        <p className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm">
          <strong>A SEFAZ pediu para aguardar (656).</strong> A próxima tentativa automática é
          depois de{" "}
          {cursor?.proxima_tentativa
            ? new Date(cursor.proxima_tentativa).toLocaleString(tagIdioma)
            : "1 hora"}
          . Antecipar pode bloquear o CNPJ por consumo indevido.
        </p>
      )}

      <ConfiguracoesDaEntrada
        config={config}
        certificadoPresente={presente}
        certificado={certificado}
        podeGerir={podeGerir}
      />

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium">Estado do cursor</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-muted-foreground">Último NSU processado</dt>
            <dd className="tabular-nums">{cursor?.ult_nsu ?? 0}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-muted-foreground">NSU máximo informado pela SEFAZ</dt>
            <dd className="tabular-nums">{cursor?.max_nsu ?? 0}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-muted-foreground">Atualizado em</dt>
            <dd>
              {cursor?.atualizado_em
                ? new Date(cursor.atualizado_em).toLocaleString(tagIdioma)
                : "Nunca"}
            </dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-muted-foreground">Último erro</dt>
            <dd className="break-words">{cursor?.ultimo_erro ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          O cursor só avança até o último documento gravado com sucesso. Se a importação falhar, a
          próxima execução retoma do mesmo NSU — nenhuma nota é perdida.
        </p>
      </section>
    </div>
  );
}
