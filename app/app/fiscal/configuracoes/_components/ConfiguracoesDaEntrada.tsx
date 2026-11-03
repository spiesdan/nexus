"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ConfigFiscalSalva } from "@/lib/schemas/fiscal";

/**
 * A configuração que o RECEBIMENTO precisa: identidade fiscal, certificado A1
 * e o ritmo da sincronização.
 *
 * Não é um segundo cadastro do emitente — é a mesma linha de
 * `fiscal_settings`, com os campos que a distribuição DF-e usa. Série, CFOP e
 * endereço continuam editáveis em Emissão → Configuração; aqui eles viajam
 * intactos no PUT para que salvar esta tela não apague o que a outra gravou.
 *
 * O certificado é ENVIADO, nunca digitado: o caminho é resultado do upload no
 * servidor (`/api/v1/fiscal-settings/certificado`). A senha só existe em
 * trânsito, é cifrada pela rota e nunca volta.
 */

/** Fora do render: `Date.now()` no corpo do componente é impuro (lint). */
function certificadoVencido(validade: string | null): boolean {
  if (!validade) return false;
  return Date.parse(validade) < Date.now();
}
export function ConfiguracoesDaEntrada({
  config,
  certificadoPresente,
  certificado,
  podeGerir,
}: {
  config: ConfigFiscalSalva | null;
  certificadoPresente: boolean;
  certificado: { arquivo: string; titular: string | null; validade: string | null } | null;
  podeGerir: boolean;
}) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();

  const [documento, setDocumento] = React.useState(config?.emitente_documento ?? "");
  const [ie, setIe] = React.useState(config?.ie ?? "");
  const [uf, setUf] = React.useState(config?.uf ?? "");
  const [ambiente, setAmbiente] = React.useState(config?.ambiente ?? "homologacao");
  const [provedor, setProvedor] = React.useState(config?.provedor ?? "stub");
  const [entradaAtiva, setEntradaAtiva] = React.useState(config?.entrada_ativa ?? false);
  const [frequencia, setFrequencia] = React.useState(
    String(config?.frequencia_minutos ?? 60),
  );
  const [manifestacaoAuto, setManifestacaoAuto] = React.useState(
    config?.manifestacao_automatica ?? false,
  );
  const [senha, setSenha] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  const desabilitado = !podeGerir || salvando;

  async function enviarCertificado(arquivo: File) {
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const resposta = await fetch("/api/v1/fiscal-settings/certificado", {
        method: "POST",
        credentials: "include",
        body: corpo,
      });
      const payload = (await resposta.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!resposta.ok) {
        throw new Error(payload?.error?.message || `Falha no envio (${resposta.status}).`);
      }
      toast.success(t("Certificado enviado."));
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setEnviando(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      await apiClient.put("/api/v1/fiscal-settings", {
        // Campos da emissão viajam como estão: esta tela não os edita, mas o
        // PUT substitui a linha inteira. Omiti-los gravaria `null` por cima.
        serie: config?.serie ?? "1",
        natureza_operacao: config?.natureza_operacao ?? "Venda de mercadoria",
        cfop_padrao: config?.cfop_padrao ?? "5102",
        emitente_documento: documento.trim() === "" ? null : documento.trim(),
        ie: ie.trim() === "" ? null : ie.trim(),
        crt: config?.crt ?? "1",
        logradouro: config?.logradouro ?? null,
        numero_end: config?.numero_end ?? null,
        bairro: config?.bairro ?? null,
        municipio: config?.municipio ?? null,
        codigo_municipio: config?.codigo_municipio ?? null,
        uf: uf.trim() === "" ? null : uf.trim().toUpperCase(),
        cep: config?.cep ?? null,
        ambiente,
        provedor,
        entrada_ativa: entradaAtiva,
        frequencia_minutos: Math.min(1440, Math.max(1, Number(frequencia) || 60)),
        manifestacao_automatica: manifestacaoAuto,
        ...(senha !== "" ? { certificado_senha: senha } : {}),
      });
      toast.success(t("Configuração fiscal salva."));
      setSenha("");
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  const vencido = certificadoVencido(certificado?.validade ?? null);

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">{t("Identidade fiscal")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="entrada-cnpj">{t("CNPJ do destinatário (o seu)")}</Label>
            <Input
              id="entrada-cnpj"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="00.000.000/0000-00"
              disabled={desabilitado}
            />
            <p className="text-xs text-muted-foreground">
              {t("É este CNPJ que a SEFAZ usa para entregar as notas emitidas contra a empresa.")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entrada-ie">{t("Inscrição estadual")}</Label>
            <Input
              id="entrada-ie"
              value={ie}
              onChange={(e) => setIe(e.target.value)}
              disabled={desabilitado}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entrada-uf">UF</Label>
            <Input
              id="entrada-uf"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              maxLength={2}
              disabled={desabilitado}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entrada-ambiente">{t("Ambiente")}</Label>
            <select
              id="entrada-ambiente"
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value)}
              disabled={desabilitado}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="homologacao">{t("Homologação")}</option>
              <option value="producao">{t("Produção")}</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {t(
                "Homologação não devolve notas de terceiros: a distribuição DF-e real só existe em produção.",
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entrada-provedor">{t("Provedor fiscal")}</Label>
            <select
              id="entrada-provedor"
              value={provedor}
              onChange={(e) => setProvedor(e.target.value)}
              disabled={desabilitado}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="stub">{t("Stub (sem SEFAZ)")}</option>
              <option value="spednfe">{t("SPED-NFe (certificado A1)")}</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">{t("Certificado A1")}</h2>
          <Badge variant={certificadoPresente ? (vencido ? "error" : "success") : "warning"}>
            {certificadoPresente
              ? vencido
                ? t("Vencido")
                : t("No servidor")
              : t("Ausente")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {certificadoPresente
            ? t(
                "O .pfx está no servidor. A senha só é gravada cifrada e nunca volta para a tela.",
              )
            : t(
                "Sem o .pfx no servidor a sincronização não assina a consulta e a SEFAZ recusa.",
              )}
        </p>
        {certificado && (
          <p className="text-xs text-muted-foreground">
            {certificado.arquivo}
            {certificado.titular ? ` · ${certificado.titular}` : ""}
            {certificado.validade
              ? ` · ${t("validade")} ${new Date(certificado.validade).toLocaleDateString(tagIdioma)}`
              : ""}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("Arquivo .pfx")}</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!podeGerir || enviando}
                onClick={() => document.getElementById("entrada-cert-file")?.click()}
              >
                {enviando ? t("Enviando…") : t("Enviar certificado")}
              </Button>
              <input
                id="entrada-cert-file"
                type="file"
                accept=".pfx,.p12"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void enviarCertificado(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entrada-cert-senha">{t("Senha do certificado")}</Label>
            <Input
              id="entrada-cert-senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={t("Deixe vazio para manter a atual")}
              autoComplete="off"
              disabled={desabilitado}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">{t("Sincronização automática")}</h2>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={entradaAtiva}
            onChange={(e) => setEntradaAtiva(e.target.checked)}
            disabled={desabilitado}
          />
          <span>
            <span className="block font-medium">{t("Buscar notas automaticamente")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("O cron consulta a SEFAZ no intervalo abaixo. Desligado, só o botão busca.")}
            </span>
          </span>
        </label>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="entrada-frequencia">{t("Intervalo entre buscas (minutos)")}</Label>
          <Input
            id="entrada-frequencia"
            type="number"
            min={1}
            max={1440}
            value={frequencia}
            onChange={(e) => setFrequencia(e.target.value)}
            disabled={desabilitado}
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={manifestacaoAuto}
            onChange={(e) => setManifestacaoAuto(e.target.checked)}
            disabled={desabilitado}
          />
          <span>
            <span className="block font-medium">{t("Manifestar ciência automaticamente")}</span>
            <span className="block text-xs text-muted-foreground">
              {t(
                "Só a ciência (210210). Os demais eventos continuam exigindo um gerente — a spec 21 §12 proíbe manifestar sozinho.",
              )}
            </span>
          </span>
        </label>
      </section>

      {!podeGerir && (
        <p className="text-sm text-muted-foreground">
          {t("Seu papel permite consultar, mas não alterar a configuração fiscal.")}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => void salvar()} disabled={desabilitado}>
          {salvando ? t("Salvando…") : t("Salvar configuração")}
        </Button>
      </div>
    </div>
  );
}
