"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import type { ConfigFiscalSalva } from "@/lib/schemas/fiscal";

import type { Textos } from "./textos";

/**
 * Aba "Configuração" — os dados do emitente em seções (emitente, endereço,
 * emissão/SEFAZ, certificado), como a ficha cadastral dos ERPs. Uma tela só
 * para isso: série/CFOP errado contamina todas as notas.
 */
export function ConfigFiscal({
  configInicial,
  textos,
}: {
  configInicial: ConfigFiscalSalva | null;
  textos: Textos;
}) {
  const t = useT();
  const router = useRouter();
  const [serie, setSerie] = React.useState(configInicial?.serie ?? "1");
  const [natureza, setNatureza] = React.useState(
    configInicial?.natureza_operacao ?? "Venda de mercadoria",
  );
  const [cfop, setCfop] = React.useState(configInicial?.cfop_padrao ?? "5102");
  const [documento, setDocumento] = React.useState(configInicial?.emitente_documento ?? "");
  const [ie, setIe] = React.useState(configInicial?.ie ?? "");
  const [crt, setCrt] = React.useState(configInicial?.crt ?? "1");
  const [logradouro, setLogradouro] = React.useState(configInicial?.logradouro ?? "");
  const [numeroEnd, setNumeroEnd] = React.useState(configInicial?.numero_end ?? "");
  const [bairro, setBairro] = React.useState(configInicial?.bairro ?? "");
  const [municipio, setMunicipio] = React.useState(configInicial?.municipio ?? "");
  const [codMun, setCodMun] = React.useState(configInicial?.codigo_municipio ?? "");
  const [uf, setUf] = React.useState(configInicial?.uf ?? "");
  const [cep, setCep] = React.useState(configInicial?.cep ?? "");
  const [ambiente, setAmbiente] = React.useState(configInicial?.ambiente ?? "homologacao");
  const [provedor, setProvedor] = React.useState(configInicial?.provedor ?? "stub");
  const [certPath, setCertPath] = React.useState(configInicial?.certificado_path ?? "");
  const [certSenha, setCertSenha] = React.useState("");
  const [salvandoConfig, setSalvandoConfig] = React.useState(false);
  const [enviandoCert, setEnviandoCert] = React.useState(false);
  /**
   * O certificado está NO SERVIDOR?
   *
   * Não vem de `certificado_path`: aquele campo é um texto, e foi exatamente
   * ele que mentiu — carregava o nome de um arquivo que ninguém tinha. A
   * verdade é o arquivo existir em disco, e quem responde isso é o servidor
   * (`certificado_presente` no GET). Ver a rota.
   */
  const [certEnviado, setCertEnviado] = React.useState(
    configInicial?.certificado_presente ?? false,
  );

  /**
   * O certificado é ENVIADO, não só nomeado.
   *
   * Antes disto o seletor de arquivo fazia `setCertPath(f.name)`: pegava o
   * `.pfx` do computador de quem configurou, guardava o NOME, e o arquivo nunca
   * saía do navegador. A tela ficava com cara de configurada — nome, senha,
   * ambiente — apontando para um arquivo que não existia em lugar nenhum. Foi o
   * que aconteceu na instalação real: `certificado_path` gravado e zero `.pfx`
   * na VPS.
   *
   * Por isso o caminho agora é **resultado do envio**, e não algo que a pessoa
   * escreve: o campo de texto virou leitura do que o servidor já gravou.
   */
  async function enviarCertificado(arquivo: File) {
    setEnviandoCert(true);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const resposta = await fetch("/api/v1/fiscal-settings/certificado", {
        method: "POST",
        credentials: "include",
        body: corpo,
      });
      const payload = (await resposta.json().catch(() => null)) as {
        data?: { certificado_path?: string };
        error?: { message?: string };
      } | null;
      if (!resposta.ok) {
        throw new Error(payload?.error?.message || `Falha no envio (${resposta.status}).`);
      }
      // O caminho que a tela mostra é o que o SERVIDOR gravou, não o nome do
      // arquivo que estava no computador de quem enviou. Os dois são diferentes
      // de propósito: o servidor grava com nome fixo, para que o sidecar tenha
      // um caminho estável e um nome vindo do cliente não vire caminho em disco.
      // Mostrar `arquivo.name` aqui era a tela discordindo do servidor sobre o
      // próprio estado — a mesma classe de defeito que o `certificado_path`
      // inventado.
      setCertPath(payload?.data?.certificado_path ?? "");
      setCertEnviado(true);
      toast.success(t("Certificado enviado"));
    } catch (e) {
      showApiError(e);
    } finally {
      setEnviandoCert(false);
    }
  }

  async function salvarConfig() {
    setSalvandoConfig(true);
    try {
      await apiClient.put("/api/v1/fiscal-settings", {
        serie: serie.trim() || "1",
        natureza_operacao: natureza.trim() || "Venda de mercadoria",
        cfop_padrao: cfop.trim() || "5102",
        emitente_documento: documento.trim() === "" ? null : documento.trim(),
        ie: ie.trim() === "" ? null : ie.trim(),
        crt,
        logradouro: logradouro.trim() === "" ? null : logradouro.trim(),
        numero_end: numeroEnd.trim() === "" ? null : numeroEnd.trim(),
        bairro: bairro.trim() === "" ? null : bairro.trim(),
        municipio: municipio.trim() === "" ? null : municipio.trim(),
        codigo_municipio: codMun.trim() === "" ? null : codMun.trim(),
        uf: uf.trim() === "" ? null : uf.trim().toUpperCase(),
        cep: cep.trim() === "" ? null : cep.trim(),
        ambiente,
        provedor,
        // `certificado_path` NÃO é enviado aqui, de propósito. Ele é do
        // servidor: a rota de upload grava o arquivo e o caminho, juntos. Este
        // formulário já aceitou texto livre nesse campo, e foi assim que a
        // instalação ficou com `certificado_path` apontando para um `.pfx`
        // inexistente — configuração que parecia pronta e não servia para nada.
        // Quem muda o caminho agora é o envio do arquivo, e só ele.
        ...(certSenha !== "" ? { certificado_senha: certSenha } : {}),
      });
      toast.success(t("Configuração salva"));
      setCertSenha("");
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvandoConfig(false);
    }
  }

  return (
    <Card className="hover-raise space-y-5 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-medium text-text">{textos.config}</h2>
        {ambiente === "homologacao" && <Badge variant="warning">{textos.homologacao}</Badge>}
      </div>

      {ambiente === "homologacao" && (
        <p className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg">
          {textos.avisoHomologacao}
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {textos.emitente}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="serie">{textos.serie}</Label>
            <Input id="serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crt">CRT</Label>
            <select
              id="crt"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={crt}
              onChange={(e) => setCrt(e.target.value)}
            >
              <option value="1">1 — Simples Nacional</option>
              <option value="2">2 — Simples, excesso</option>
              <option value="3">3 — Regime normal</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc">{textos.documento}</Label>
            <Input id="doc" value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ie">IE</Label>
            <Input id="ie" value={ie} onChange={(e) => setIe(e.target.value)} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {textos.enderecoEmitente}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="logradouro">{textos.logradouro}</Label>
            <Input
              id="logradouro"
              value={logradouro}
              onChange={(e) => setLogradouro(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numero-end">{textos.numeroEnd}</Label>
            <Input
              id="numero-end"
              value={numeroEnd}
              onChange={(e) => setNumeroEnd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bairro">{textos.bairro}</Label>
            <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="municipio">{textos.municipio}</Label>
            <Input
              id="municipio"
              value={municipio}
              onChange={(e) => setMunicipio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="codmun">{textos.codMun}</Label>
            <Input
              id="codmun"
              value={codMun}
              onChange={(e) => setCodMun(e.target.value)}
              placeholder="3550308"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="uf">UF</Label>
              <Input id="uf" value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" value={cep} onChange={(e) => setCep(e.target.value)} />
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {textos.emissaoSefaz}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="natureza">{textos.natureza}</Label>
            <Input id="natureza" value={natureza} onChange={(e) => setNatureza(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfop">{textos.cfop}</Label>
            <Input id="cfop" value={cfop} onChange={(e) => setCfop(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ambiente">{textos.ambiente}</Label>
            <select
              id="ambiente"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value)}
            >
              <option value="homologacao">{textos.homologacao}</option>
              <option value="producao">{textos.producao}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provedor">{textos.provedorFiscal}</Label>
            <select
              id="provedor"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={provedor}
              onChange={(e) => setProvedor(e.target.value)}
            >
              <option value="stub">{textos.provedorStub}</option>
              <option value="spednfe">{textos.provedorSped}</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {textos.certificado}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cert-path">{textos.certPath}</Label>
            <div className="flex items-center gap-2">
              {/*
                O caminho é LEITURA, não edição. O campo acceptava texto livre e
                gravava o que a pessoa escrevesse — a origem do
                `certificado_path` apontando para arquivo inexistente. Quem
                decide o caminho agora é o envio, no servidor.
              */}
              <Input
                id="cert-path"
                value={certEnviado ? certPath : ""}
                readOnly
                placeholder={t("Nenhum certificado no servidor")}
                data-testid="fiscal-cert-path"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={enviandoCert}
                onClick={() => document.getElementById("cert-file-input")?.click()}
              >
                {enviandoCert ? t("Enviando…") : t("Enviar certificado")}
              </Button>
              <input
                id="cert-file-input"
                type="file"
                accept=".pfx,.p12"
                className="hidden"
                data-testid="fiscal-cert-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void enviarCertificado(f);
                  // Limpa para reenviar o MESMO arquivo depois de corrigir a
                  // senha — sem isso, `change` não dispara e o botão parece
                  // quebrado na segunda tentativa.
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground" data-testid="fiscal-cert-situacao">
              {certEnviado
                ? t("Certificado gravado no servidor.")
                : t(
                    "O certificado não está no servidor. Envie o arquivo .pfx — sem ele a nota não é transmitida.",
                  )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-senha">{textos.certSenha}</Label>
            <Input
              id="cert-senha"
              type="password"
              value={certSenha}
              onChange={(e) => setCertSenha(e.target.value)}
              placeholder={textos.certSenhaVazia}
              autoComplete="off"
            />
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button onClick={() => void salvarConfig()} disabled={salvandoConfig}>
          {salvandoConfig ? t("Salvando…") : textos.salvarConfig}
        </Button>
      </div>
    </Card>
  );
}
