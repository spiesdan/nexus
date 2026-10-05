"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api/client";
import { comoMoeda } from "@/lib/format/moeda";
import { lerMensagemCarta, type CartaDeCorrecao, type ConfigFiscalSalva, type InutilizacaoSalva } from "@/lib/schemas/fiscal";
import { FileText, MagnifyingGlass, Receipt } from "@/lib/ui/icons";

import type { Textos } from "./textos";

const ANO_ATUAL = String(new Date().getFullYear() % 100).padStart(2, "0");

function situacao(status: string | null): "success" | "error" | "neutral" {
  if (status === "transmitida") return "success";
  if (status === "erro") return "error";
  return "neutral";
}

/** Uma linha da consulta ao IBPT (vem pronta da rota, com o total já somado). */
type LinhaIbptConsulta = {
  codigo: string;
  ex: string;
  descricao: string | null;
  nacional_federal: number;
  importados_federal: number;
  estadual: number;
  municipal: number;
  total_percentual: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  versao: string | null;
  fonte: string | null;
  imposto_aproximado_cents?: number;
};

/** `yyyy-mm-dd` como dia local — `new Date("2026-09-20")` é meia-noite UTC e mostraria o dia anterior. */
function vigenciaLocal(iso: string, tagIdioma: string): string {
  const [a, m, d] = iso.split("-");
  return new Date(Number(a), Number(m) - 1, Number(d)).toLocaleDateString(tagIdioma);
}

/**
 * Aba "Ações fiscais" — o menu Emissor do Odivix: inutilizar numeração (com
 * ano/modelo do inutNFe), lista de inutilizadas com o retorno da SEFAZ,
 * numerações puladas em PDF, cartas de correção e IBPT. A carta nova nasce na
 * grade, junto da nota autorizada que ela corrige (é lá que o usuário está
 * quando precisa); aqui fica a lista e a retransmissão.
 */
export function AcoesFiscais({
  configInicial,
  inutilizacoesIniciais,
  cartasIniciais,
  podeConfigurar,
  textos,
}: {
  configInicial: ConfigFiscalSalva | null;
  inutilizacoesIniciais: InutilizacaoSalva[];
  cartasIniciais: CartaDeCorrecao[];
  podeConfigurar: boolean;
  textos: Textos;
}) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const formRef = React.useRef<HTMLDivElement | null>(null);
  const [serieInut, setSerieInut] = React.useState(configInicial?.serie ?? "1");
  const [anoInut, setAnoInut] = React.useState(ANO_ATUAL);
  const [modeloInut, setModeloInut] = React.useState("55");
  const [numIni, setNumIni] = React.useState("");
  const [numFim, setNumFim] = React.useState("");
  const [motivoInut, setMotivoInut] = React.useState("");
  const [inutilizando, setInutilizando] = React.useState(false);
  const [retransmitindo, setRetransmitindo] = React.useState<string | null>(null);
  const [buscaCarta, setBuscaCarta] = React.useState("");
  const arquivoIbptRef = React.useRef<HTMLInputElement | null>(null);
  const [ncmIbpt, setNcmIbpt] = React.useState("");
  const [exIbpt, setExIbpt] = React.useState("");
  const [valorIbpt, setValorIbpt] = React.useState("");
  const [origemIbpt, setOrigemIbpt] = React.useState<"nacional" | "importado">("nacional");
  const [consultandoIbpt, setConsultandoIbpt] = React.useState(false);
  const [importandoIbpt, setImportandoIbpt] = React.useState(false);
  const [resultadoIbpt, setResultadoIbpt] = React.useState<LinhaIbptConsulta[] | null>(null);
  const [importouIbpt, setImportouIbpt] = React.useState(false);

  async function inutilizarFaixa() {
    const ini = Number(numIni);
    const fim = Number(numFim);
    if (!Number.isInteger(ini) || ini <= 0 || !Number.isInteger(fim) || fim < ini) {
      toast.error(textos.faixa);
      return;
    }
    if (motivoInut.trim().length < 15 || motivoInut.trim().length > 255) {
      toast.error(textos.dicaMotivo);
      return;
    }
    setInutilizando(true);
    try {
      const r = await apiClient.post<{ data?: { status?: string; motivo_transmissao?: string | null } }>(
        "/api/v1/fiscal-inutilizacoes",
        {
          serie: serieInut.trim() || "1",
          numero_inicial: ini,
          numero_final: fim,
          motivo: motivoInut.trim(),
          ano: anoInut.trim() || ANO_ATUAL,
          modelo: modeloInut === "65" ? "65" : "55",
        },
      );
      const status = r.data?.status;
      if (status === "transmitida") toast.success(`${textos.inutilizarFaixa} — ${textos.transmitida}`);
      else if (status === "erro") toast.error(r.data?.motivo_transmissao ?? textos.erro);
      else toast.success(`${textos.inutilizarFaixa} — ${textos.registradaLocal}`);
      setNumIni("");
      setNumFim("");
      setMotivoInut("");
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setInutilizando(false);
    }
  }

  async function retransmitirInutilizacao(id: string) {
    setRetransmitindo(id);
    try {
      const r = await apiClient.post<{ data?: { status?: string; motivo_transmissao?: string | null } }>(
        `/api/v1/fiscal-inutilizacoes/${id}/retransmitir`,
        {},
      );
      if (r.data?.status === "transmitida") toast.success(textos.retransmitidoOk);
      else toast.error(r.data?.motivo_transmissao ?? textos.erro);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setRetransmitindo(null);
    }
  }

  async function retransmitirCarta(id: string) {
    setRetransmitindo(id);
    try {
      const r = await apiClient.post<{ data?: { status?: string; motivo_transmissao?: string | null } }>(
        `/api/v1/fiscal-events/${id}/retransmitir`,
        {},
      );
      if (r.data?.status === "transmitida") toast.success(textos.retransmitidoOk);
      else toast.error(r.data?.motivo_transmissao ?? textos.erro);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setRetransmitindo(null);
    }
  }

  /** "Inutiliza Nota" (Odivix): traz o formulário de faixa para a vista. */
  function focarFormulario() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => document.getElementById("inut-ini")?.focus(), 350);
  }

  /** Exportar CSV da lista de inutilizadas (separador ; para o Excel BR). */
  function exportarCsv() {
    const cab = [
      textos.serie,
      textos.faixa,
      textos.motivoSimples,
      textos.protocolo,
      textos.retornoSefaz,
      textos.status,
      textos.data,
    ];
    const linhas = inutilizacoesIniciais.map((u) =>
      [
        u.serie,
        `${u.numero_inicial}-${u.numero_final}`,
        u.motivo,
        u.sefaz_protocolo ?? "",
        u.sefaz_xmotivo ?? "",
        u.status,
        new Date(u.created_at).toLocaleDateString(tagIdioma),
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob(["﻿" + cab.join(";") + "\r\n" + linhas.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inutilizacoes.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Consulta o imposto aproximado de um NCM/serviço na tabela importada. */
  async function consultarIbpt() {
    const codigo = ncmIbpt.trim();
    if (!/^\d{4,16}$/.test(codigo)) {
      toast.error(textos.ncmInvalido);
      return;
    }
    const params = new URLSearchParams({ tipo: "produto", ncm: codigo, origem: origemIbpt });
    const ex = exIbpt.trim();
    if (ex) params.set("ex", ex);
    const valor = Number(valorIbpt.trim().replace(/\./g, "").replace(",", "."));
    if (valorIbpt.trim() && Number.isFinite(valor) && valor >= 0) params.set("valor", String(valor));
    setConsultandoIbpt(true);
    try {
      const r = await apiClient.get<{ data?: { linhas?: LinhaIbptConsulta[] } }>(
        `/api/v1/fiscal-ibpt/consulta?${params.toString()}`,
      );
      setResultadoIbpt(r.data?.linhas ?? []);
    } catch (e) {
      showApiError(e);
    } finally {
      setConsultandoIbpt(false);
    }
  }

  /** Importa o CSV oficial do IBPT (manager+); reimportar o mesmo exercício atualiza. */
  async function importarIbpt() {
    const arquivo = arquivoIbptRef.current?.files?.[0];
    if (!arquivo) {
      toast.error(textos.semArquivoIbpt);
      return;
    }
    setImportandoIbpt(true);
    try {
      const csv = await arquivo.text();
      const r = await apiClient.post<{ data?: { importadas?: number } }>(
        "/api/v1/fiscal-ibpt/importar",
        { csv, tipo: "produto" },
        { timeoutMs: 120_000 },
      );
      toast.success(`${textos.importadaOkIbpt}: ${r.data?.importadas ?? 0}`);
      if (arquivoIbptRef.current) arquivoIbptRef.current.value = "";
      setImportouIbpt(true);
      setResultadoIbpt(null);
      // Já com código na tela, mostra a consulta nova na hora.
      if (/^\d{4,16}$/.test(ncmIbpt.trim())) await consultarIbpt();
    } catch (e) {
      showApiError(e);
    } finally {
      setImportandoIbpt(false);
    }
  }

  const cartas = cartasIniciais.filter((c) => {
    const b = buscaCarta.trim().toLowerCase();
    if (b === "") return true;
    const lida = lerMensagemCarta(c.mensagem ?? "");
    const numero = c.numero !== null ? `${c.numero}/${c.serie}` : "";
    return (
      numero.includes(b) ||
      (c.protocolo ?? "").toLowerCase().includes(b) ||
      (lida?.correcao ?? "").toLowerCase().includes(b)
    );
  });

  return (
    <div className="space-y-5">
      <div ref={formRef} className="scroll-mt-24">
        <Card className="hover-raise space-y-3 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-medium text-text">
            <FileText size={18} className="text-muted-foreground" />
            {textos.inutilizarNum}
          </h2>
          <p className="text-xs text-muted-foreground">{textos.registradaLocal}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label htmlFor="inut-serie">{textos.serie}</Label>
              <Input
                id="inut-serie"
                value={serieInut}
                onChange={(e) => setSerieInut(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inut-ano">{textos.ano}</Label>
              <Input
                id="inut-ano"
                inputMode="numeric"
                maxLength={2}
                value={anoInut}
                onChange={(e) => setAnoInut(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inut-modelo">{textos.modelo}</Label>
              <select
                id="inut-modelo"
                aria-label={textos.modelo}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={modeloInut}
                onChange={(e) => setModeloInut(e.target.value)}
              >
                <option value="55">{textos.modeloNfe}</option>
                <option value="65">{textos.modeloNfce}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inut-ini">{textos.numInicial}</Label>
              <Input
                id="inut-ini"
                inputMode="numeric"
                value={numIni}
                onChange={(e) => setNumIni(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inut-fim">{textos.numFinal}</Label>
              <Input
                id="inut-fim"
                inputMode="numeric"
                value={numFim}
                onChange={(e) => setNumFim(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inut-motivo">{textos.motivoSimples}</Label>
              <Input
                id="inut-motivo"
                value={motivoInut}
                onChange={(e) => setMotivoInut(e.target.value)}
                placeholder={textos.dicaMotivo}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void inutilizarFaixa()} disabled={inutilizando}>
              {inutilizando ? t("Enviando…") : textos.inutilizarFaixa}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="hover-raise space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-text">{textos.notasInutilizadas}</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={focarFormulario}>
              <Receipt size={14} />
              {textos.inutilizaNota}
            </Button>
            <Button size="sm" variant="outline" onClick={exportarCsv}>
              {textos.exportarCsv}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a
                href={`/api/v1/fiscal-inutilizacoes/puladas${
                  serieInut.trim() ? `?serie=${encodeURIComponent(serieInut.trim())}` : ""
                }&destino=baixar`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText size={14} />
                {textos.numPuladas}
              </a>
            </Button>
          </div>
        </div>
        {inutilizacoesIniciais.length === 0 ? (
          <p className="text-sm text-muted-foreground">{textos.nenhumaInutilizacao}</p>
        ) : (
          <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{textos.serie}</TableHead>
                  <TableHead>{textos.faixa}</TableHead>
                  <TableHead>{textos.motivoSimples}</TableHead>
                  <TableHead>{textos.protocolo}</TableHead>
                  <TableHead>{textos.retornoSefaz}</TableHead>
                  <TableHead>{textos.status}</TableHead>
                  <TableHead>{textos.data}</TableHead>
                  <TableHead>
                    <span className="sr-only">{textos.acoes}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inutilizacoesIniciais.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.serie}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {u.numero_inicial}–{u.numero_final}
                    </TableCell>
                    <TableCell className="max-w-56 truncate" title={u.motivo}>
                      {u.motivo}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {u.sefaz_protocolo ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-56 truncate" title={u.sefaz_xmotivo ?? ""}>
                      {u.sefaz_xmotivo ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={situacao(u.status)}>
                        {u.status === "transmitida"
                          ? textos.transmitida
                          : u.status === "erro"
                            ? textos.erro
                            : textos.registrada}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString(tagIdioma)}
                    </TableCell>
                    <TableCell>
                      {u.status !== "transmitida" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retransmitindo === u.id}
                          onClick={() => void retransmitirInutilizacao(u.id)}
                        >
                          {textos.retransmitir}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="hover-raise space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-text">{textos.cartasCorrecao}</h2>
          <div className="relative min-w-52 max-w-xs flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={textos.buscarCarta}
              value={buscaCarta}
              onChange={(e) => setBuscaCarta(e.target.value)}
              placeholder={textos.buscarCarta}
              className="pl-9"
            />
          </div>
        </div>
        {cartasIniciais.length === 0 ? (
          <p className="text-sm text-muted-foreground">{textos.nenhumaCarta}</p>
        ) : cartas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{textos.nenhumaNotaEncontrada}</p>
        ) : (
          <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{textos.numNota}</TableHead>
                  <TableHead>{textos.sequencia}</TableHead>
                  <TableHead>{textos.correcao}</TableHead>
                  <TableHead>{textos.protocolo}</TableHead>
                  <TableHead>{textos.status}</TableHead>
                  <TableHead>{textos.data}</TableHead>
                  <TableHead>
                    <span className="sr-only">{textos.acoes}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cartas.map((c) => {
                  const lida = lerMensagemCarta(c.mensagem ?? "");
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {c.numero === null ? textos.semNumero : `${c.numero}/${c.serie}`}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {lida?.sequencia ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-72 truncate" title={lida?.correcao ?? ""}>
                        {lida?.correcao ?? c.mensagem ?? ""}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {c.protocolo ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={situacao(c.status)}>
                          {c.status === "transmitida"
                            ? textos.transmitida
                            : c.status === "erro"
                              ? textos.erro
                              : textos.registrada}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(c.created_at).toLocaleString(tagIdioma)}
                      </TableCell>
                      <TableCell>
                        {c.status !== "transmitida" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={retransmitindo === c.id}
                            onClick={() => void retransmitirCarta(c.id)}
                          >
                            {textos.retransmitir}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="hover-raise space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-text">{textos.ibpt}</h2>
          {podeConfigurar && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={arquivoIbptRef}
                type="file"
                accept=".csv,text/csv"
                aria-label={textos.importarIbpt}
                className="text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text"
              />
              <Button size="sm" variant="outline" disabled={importandoIbpt} onClick={() => void importarIbpt()}>
                {importandoIbpt ? t("Importando…") : textos.importarIbpt}
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            aria-label={textos.ncm}
            inputMode="numeric"
            maxLength={16}
            placeholder={textos.ncm}
            value={ncmIbpt}
            onChange={(e) => setNcmIbpt(e.target.value)}
          />
          <Input
            aria-label={textos.ex}
            maxLength={8}
            placeholder={textos.ex}
            value={exIbpt}
            onChange={(e) => setExIbpt(e.target.value)}
          />
          <Input
            aria-label={textos.valor}
            inputMode="decimal"
            placeholder={textos.valor}
            value={valorIbpt}
            onChange={(e) => setValorIbpt(e.target.value)}
          />
          <select
            aria-label={textos.origem}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={origemIbpt}
            onChange={(e) => setOrigemIbpt(e.target.value === "importado" ? "importado" : "nacional")}
          >
            <option value="nacional">{textos.nacional}</option>
            <option value="importado">{textos.importado}</option>
          </select>
          <Button disabled={consultandoIbpt} onClick={() => void consultarIbpt()}>
            {consultandoIbpt ? t("Consultando…") : textos.consultarIbpt}
          </Button>
        </div>

        {resultadoIbpt === null ? (
          !importouIbpt && <p className="text-sm text-muted-foreground">{textos.semIbpt}</p>
        ) : resultadoIbpt.length === 0 ? (
          <p className="text-sm text-muted-foreground">{textos.nenhumaLinhaIbpt}</p>
        ) : (
          <div className="space-y-2">
            {resultadoIbpt.map((l, i) => (
              <div
                key={`${l.codigo}-${l.ex}-${l.vigencia_inicio}-${i}`}
                className="hover-raise space-y-1 rounded-lg border border-border bg-surface p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {l.codigo}
                    {l.ex ? ` · EX ${l.ex}` : ""}
                    {l.descricao ? ` — ${l.descricao}` : ""}
                  </span>
                  {typeof l.imposto_aproximado_cents === "number" && (
                    <span className="font-semibold tabular-nums">
                      {comoMoeda(l.imposto_aproximado_cents, "BRL")}
                    </span>
                  )}
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {textos.nacional} {l.nacional_federal}% · {textos.importado} {l.importados_federal}% ·{" "}
                  {textos.estadual} {l.estadual}% · {textos.municipal} {l.municipal}% · {textos.total}{" "}
                  {l.total_percentual}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {textos.vigencia}: {vigenciaLocal(l.vigencia_inicio, tagIdioma)}
                  {l.vigencia_fim ? ` – ${vigenciaLocal(l.vigencia_fim, tagIdioma)}` : ""}
                  {l.fonte ? ` · ${l.fonte}` : ""}
                  {l.versao ? ` · ${l.versao}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
