"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { EmptyFilterResults, EmptyState } from "@/components/empty";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api/client";
import { ROTULO_DA_NOTA, type NotaFiscal, type StatusDaNota } from "@/lib/schemas/fiscal";
import { comoMoeda } from "@/lib/format/moeda";
import {
  ArrowsClockwise,
  DownloadSimple,
  FileText,
  MagnifyingGlass,
  Plus,
  Printer,
  Receipt,
} from "@/lib/ui/icons";

import type { Textos } from "./textos";

const VARIANTE_STATUS: Record<
  StatusDaNota,
  NonNullable<React.ComponentProps<typeof Badge>["variant"]>
> = {
  autorizada: "success",
  em_emissao: "info",
  pendente: "neutral",
  denegada: "error",
  cancelada: "warning",
  erro: "error",
};

const OBJETIVOS_CANCELAMENTO: StatusDaNota[] = ["pendente", "em_emissao", "erro"];

/**
 * Modelo fiscal da nota (55 NF-e / 65 NFC-e): os dígitos 21–22 da chave de
 * acesso são o `mod` do ide — dado do documento, não opção da tela. Sem chave
 * (pendente, XML de fora) o modelo é desconhecido e fica de fora do filtro.
 */
function modeloDaNota(chave: string | null): "55" | "65" | null {
  if (!chave || !/^\d{44}$/.test(chave)) return null;
  const mod = chave.slice(20, 22);
  return mod === "55" || mod === "65" ? mod : null;
}

/**
 * Aba "Notas" — o Cadastro de NFes (Odivix): KPIs, grade com
 * Status/Protocolo/Operação/Emissão/Nº/Série/Pessoa/Valor/Ambiente, toolbar
 * (emitir, CSV, XMLs, busca, período, status), rodapé Nº/Total e detalhe por
 * linha com timeline, fila e arquivos.
 */
export function GradeNotas({
  inicial,
  pessoas,
  operacaoPadrao,
  ambientePadrao,
  podeEmitir,
  textos,
}: {
  inicial: NotaFiscal[];
  pessoas: Record<string, string>;
  operacaoPadrao: string;
  ambientePadrao: string;
  podeEmitir: boolean;
  textos: Textos;
}) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const [expandida, setExpandida] = React.useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [periodo, setPeriodo] = React.useState("ano");
  const [cartaPara, setCartaPara] = React.useState<NotaFiscal | null>(null);
  const [correcao, setCorrecao] = React.useState("");
  const [registrandoCarta, setRegistrandoCarta] = React.useState(false);
  const [modeloXml, setModeloXml] = React.useState("");
  const [progressoXml, setProgressoXml] = React.useState<{ total: number; feitos: number } | null>(
    null,
  );
  const [cursor, setCursor] = React.useState<{ ult_nsu: number; max_nsu: number } | null>(null);
  const [importando, setImportando] = React.useState(false);

  // NSU do histórico (Fase 3): lido no mount, atualizado por cada importação.
  React.useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: { ult_nsu: number; max_nsu: number } | null }>("/api/v1/invoices/importar-sefaz")
      .then((r) => {
        if (vivo && r.data) setCursor({ ult_nsu: r.data.ult_nsu, max_nsu: r.data.max_nsu });
      })
      .catch(() => {
        // Sem cursor a tela continua: o botão de importar diz o resto.
      });
    return () => {
      vivo = false;
    };
  }, []);

  function noPeriodo(iso: string): boolean {
    if (periodo === "tudo") return true;
    const t = new Date(iso).getTime();
    const agora = new Date();
    if (periodo === "mes") {
      return t >= new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
    }
    if (periodo === "30") {
      return t >= agora.getTime() - 30 * 24 * 3600 * 1000;
    }
    return t >= new Date(agora.getFullYear(), 0, 1).getTime();
  }

  const visiveis = inicial.filter((n) => {
    if (filtroStatus !== "" && n.status !== filtroStatus) return false;
    if (!noPeriodo(n.created_at)) return false;
    const b = busca.trim().toLowerCase();
    if (b === "") return true;
    const numero = n.numero !== null ? `${n.numero}/${n.serie}` : "";
    const chave = (n.chave_acesso ?? "").toLowerCase();
    const protocolo = (n.protocolo ?? "").toLowerCase();
    const pessoa = (n.order_id ? (pessoas[n.order_id] ?? "") : "").toLowerCase();
    return numero.includes(b) || chave.includes(b) || protocolo.includes(b) || pessoa.includes(b);
  });

  const totalCents = inicial.reduce((a, n) => a + n.total_cents, 0);
  const autorizadasCents = inicial
    .filter((n) => n.status === "autorizada")
    .reduce((a, n) => a + n.total_cents, 0);
  const pendentes = inicial.filter(
    (n) => n.status === "pendente" || n.status === "em_emissao",
  ).length;
  const comErro = inicial.filter((n) => n.status === "erro" || n.status === "denegada").length;
  const somaVisiveis = visiveis.reduce((a, n) => a + n.total_cents, 0);

  const rotuloPeriodo =
    periodo === "ano"
      ? textos.esteAno
      : periodo === "mes"
        ? textos.esteMes
        : periodo === "30"
          ? textos.ultimos30
          : textos.tudo;
  const rotuloStatus =
    filtroStatus === "" ? "" : (ROTULO_DA_NOTA[filtroStatus as StatusDaNota] ?? filtroStatus);
  const partesFiltro: string[] = [];
  if (busca.trim() !== "") partesFiltro.push(`"${busca.trim()}"`);
  partesFiltro.push(`${textos.data} (${rotuloPeriodo})`);
  if (rotuloStatus !== "") partesFiltro.push(`${textos.status} (${rotuloStatus})`);

  function limparFiltros() {
    setFiltroStatus("");
    setBusca("");
    setPeriodo("ano");
    setExpandida(null);
  }

  /** Exportar CSV (Odivix): as linhas visíveis, separador ; para o Excel BR. */
  function exportarCsv() {
    const cab = [
      textos.status,
      textos.protocolo,
      textos.operacao,
      textos.data,
      textos.numNota,
      textos.serie,
      textos.pessoa,
      textos.valorTotal,
      textos.ambiente,
    ];
    const linhas = visiveis.map((n) =>
      [
        ROTULO_DA_NOTA[n.status] ?? n.status,
        n.protocolo ?? "",
        operacaoPadrao,
        new Date(n.created_at).toLocaleDateString(tagIdioma),
        n.numero === null ? "" : String(n.numero),
        n.serie,
        n.order_id ? (pessoas[n.order_id] ?? "") : "",
        (n.total_cents / 100).toFixed(2).replace(".", ","),
        ambientePadrao === "producao" ? textos.producao : textos.homologacao,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob([" " + cab.join(";") + "\r\n" + linhas.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nfes.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Exporta XMLs (Odivix): baixa o XML das autorizadas visíveis, um por vez,
   * com a barra de progresso. O filtro de modelo entra aqui — 55/65 vem da
   * chave; o período já veio na `visiveis`.
   */
  function exportarXmls() {
    const alvos = visiveis.filter(
      (n) =>
        n.status === "autorizada" &&
        (modeloXml === "" || modeloDaNota(n.chave_acesso) === modeloXml),
    );
    if (alvos.length === 0) {
      toast.error(t("Nenhuma nota encontrada"));
      return;
    }
    setProgressoXml({ total: alvos.length, feitos: 0 });
    alvos.forEach((n, i) => {
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = `/api/v1/invoices/${n.id}/xml`;
        a.download = `nfe-${n.serie}-${n.numero ?? n.id}.xml`;
        a.click();
        setProgressoXml((p) => (p ? { ...p, feitos: p.feitos + 1 } : p));
        if (i === alvos.length - 1) {
          toast.success(`${alvos.length} ${textos.notas}`);
          setProgressoXml(null);
        }
      }, i * 600);
    });
  }

  /** Importar histórico do SEFAZ: anda com o cursor e mostra o resumo. */
  async function importarHistorico() {
    setImportando(true);
    try {
      const r = await apiClient.post<{
        data?: {
          lidos?: number;
          importados?: number;
          jaExistiam?: number;
          ult_nsu?: number;
          max_nsu?: number;
          aviso?: string | null;
        };
      }>("/api/v1/invoices/importar-sefaz", {});
      const d = r.data ?? {};
      if (typeof d.ult_nsu === "number" && typeof d.max_nsu === "number") {
        setCursor({ ult_nsu: d.ult_nsu, max_nsu: d.max_nsu });
      }
      if (d.aviso) toast.info(d.aviso);
      toast.success(
        `${d.importados ?? 0} ${t("importada(s)")} · ${d.jaExistiam ?? 0} ${t("já existiam")} · NSU ${
          d.ult_nsu ?? 0
        }/${d.max_nsu ?? 0}`,
      );
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setImportando(false);
    }
  }

  async function registrarCarta() {
    if (!cartaPara) return;
    const texto = correcao.trim();
    if (texto.length < 15 || texto.length > 1000) {
      toast.error(textos.dicaCorrecao);
      return;
    }
    setRegistrandoCarta(true);
    try {
      await apiClient.post(`/api/v1/invoices/${cartaPara.id}/carta-correcao`, { correcao: texto });
      toast.success(`${textos.cartaCorrecao} — ${textos.registradaLocal}`);
      setCartaPara(null);
      setCorrecao("");
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setRegistrandoCarta(false);
    }
  }

  async function reemitir(id: string) {
    try {
      await apiClient.post(`/api/v1/invoices/${id}/reemitir`, {});
      toast.success(t("Nota enfileirada para emissão"));
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  async function cancelar(id: string, motivoFinal?: string) {
    try {
      await apiClient.post(`/api/v1/invoices/${id}/cancel`, {
        ...(motivoFinal?.trim() ? { motivo: motivoFinal.trim() } : {}),
      });
      toast.success(t("Nota cancelada"));
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  function confirmaCancelamento(n: NotaFiscal) {
    if (n.status === "autorizada") {
      const m = window.prompt(textos.motivo, "");
      if (m === null) return;
      if (!m.trim()) {
        toast.error(t("O motivo é obrigatório para cancelar uma nota autorizada."));
        return;
      }
      void cancelar(n.id, m);
      return;
    }
    void cancelar(n.id);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="hover-raise p-3">
          <p className="text-xs text-muted-foreground">{textos.total}</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">
            {comoMoeda(totalCents, "BRL")}
          </p>
        </Card>
        <Card className="hover-raise p-3">
          <p className="text-xs text-muted-foreground">{textos.autorizadas}</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">
            {comoMoeda(autorizadasCents, "BRL")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {inicial.filter((n) => n.status === "autorizada").length} {textos.notas}
          </p>
        </Card>
        <Card className="hover-raise p-3">
          <p className="text-xs text-muted-foreground">{textos.pendentes}</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">{pendentes}</p>
        </Card>
        <Card className="hover-raise p-3">
          <p className="text-xs text-muted-foreground">{textos.comErro}</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">{comErro}</p>
        </Card>
      </div>

      <h2 className="flex items-center gap-2 text-base font-medium text-text">
        {textos.notas}
        <Badge variant="neutral">{visiveis.length}</Badge>
      </h2>

      <>
        <div className="flex flex-wrap items-center gap-2">
          {podeEmitir && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/app/notas?aba=emitir">
                <Plus size={14} />
                {textos.emitir}
              </Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportarCsv}>
            <DownloadSimple size={14} />
            {textos.exportarCsv}
          </Button>
          {podeEmitir && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void importarHistorico()}
              disabled={importando}
            >
              <ArrowsClockwise size={14} />
              {importando ? t("Importando…") : textos.importarHistorico}
            </Button>
          )}
          {cursor && (
            <span className="text-xs text-muted-foreground tabular-nums" title={textos.nsuTitulo}>
              {textos.nsuTitulo} {cursor.ult_nsu}/{cursor.max_nsu}
            </span>
          )}
          <select
            aria-label={textos.modelo}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={modeloXml}
            onChange={(e) => setModeloXml(e.target.value)}
          >
            <option value="">
              {textos.modelo}: {textos.todos}
            </option>
            <option value="55">{textos.modeloNfe}</option>
            <option value="65">{textos.modeloNfce}</option>
          </select>
          {podeEmitir && (
            <Button size="sm" variant="outline" onClick={exportarXmls}>
              <FileText size={14} />
              {textos.exportaXmls}
            </Button>
          )}
          <div className="relative min-w-52 flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={textos.buscarNota}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={textos.buscarNota}
              className="pl-9"
            />
          </div>
          <select
            aria-label={textos.data}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          >
            <option value="ano">{textos.esteAno}</option>
            <option value="mes">{textos.esteMes}</option>
            <option value="30">{textos.ultimos30}</option>
            <option value="tudo">{textos.tudo}</option>
          </select>
          <select
            aria-label={textos.status}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
          >
            <option value="">{textos.todos}</option>
            <option value="pendente">{textos.pendente}</option>
            <option value="em_emissao">{textos.emitindo}</option>
            <option value="autorizada">{textos.autorizada}</option>
            <option value="denegada">{textos.denegada}</option>
            <option value="cancelada">{textos.cancelada}</option>
            <option value="erro">{textos.erro}</option>
          </select>
        </div>

        {progressoXml && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground tabular-nums">
              {textos.exportaXmls}: {progressoXml.feitos}/{progressoXml.total}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progressoXml.total}
              aria-valuenow={progressoXml.feitos}
              aria-label={textos.exportaXmls}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${(progressoXml.feitos / Math.max(progressoXml.total, 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {inicial.length === 0 ? (
          <EmptyState
            icon={Receipt}
            headline="Nenhuma nota ainda"
            subcopy="As notas nascem dos pedidos que já foram faturados."
          />
        ) : visiveis.length === 0 ? (
          <EmptyFilterResults primary={{ label: t("Limpar filtros"), onClick: limparFiltros }} />
        ) : (
          <>
            <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>{textos.status}</TableHead>
                    <TableHead>{textos.protocolo}</TableHead>
                    <TableHead>{textos.operacao}</TableHead>
                    <TableHead>{textos.data}</TableHead>
                    <TableHead className="text-right">{textos.numNota}</TableHead>
                    <TableHead>{textos.serie}</TableHead>
                    <TableHead>{textos.pessoa}</TableHead>
                    <TableHead className="text-right">{textos.valorTotal}</TableHead>
                    <TableHead>{textos.ambiente}</TableHead>
                    <TableHead>
                      <span className="sr-only">{textos.acoes}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((n) => (
                    <React.Fragment key={n.id}>
                      <TableRow>
                        <TableCell>
                          <Badge variant={VARIANTE_STATUS[n.status]}>
                            {ROTULO_DA_NOTA[n.status] ?? n.status}
                          </Badge>
                          {n.erro && <span className="block text-xs text-error-fg">{n.erro}</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {n.protocolo ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {operacaoPadrao === "" ? "—" : operacaoPadrao}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {new Date(n.created_at).toLocaleDateString(tagIdioma)}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap text-text tabular-nums">
                          {n.numero === null ? textos.semNumero : n.numero}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{n.serie}</TableCell>
                        <TableCell className="max-w-64 truncate">
                          {n.order_id ? (pessoas[n.order_id] ?? "—") : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                          {comoMoeda(n.total_cents, "BRL")}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {ambientePadrao === "producao" ? textos.producao : textos.homologacao}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title={textos.detalhe}
                              aria-label={textos.detalhe}
                              onClick={() => setExpandida(expandida === n.id ? null : n.id)}
                              aria-expanded={expandida === n.id}
                            >
                              <MagnifyingGlass size={14} />
                            </Button>
                            {n.status === "autorizada" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title={textos.verDanfe}
                                  aria-label={textos.verDanfe}
                                  asChild
                                >
                                  <a
                                    href={`/api/v1/invoices/${n.id}/danfe`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Printer size={14} />
                                  </a>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title={textos.baixarXml}
                                  aria-label={textos.baixarXml}
                                  asChild
                                >
                                  <a
                                    href={`/api/v1/invoices/${n.id}/xml`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <DownloadSimple size={14} />
                                  </a>
                                </Button>
                                {podeEmitir && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title={textos.cartaCorrecao}
                                    aria-label={textos.cartaCorrecao}
                                    onClick={() => {
                                      setCartaPara(n);
                                      setCorrecao("");
                                    }}
                                  >
                                    <FileText size={14} />
                                  </Button>
                                )}
                              </>
                            )}
                            {podeEmitir && n.status === "erro" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void reemitir(n.id)}
                              >
                                {textos.reemitir}
                              </Button>
                            )}
                            {podeEmitir &&
                              (OBJETIVOS_CANCELAMENTO.includes(n.status) ||
                                n.status === "autorizada") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => confirmaCancelamento(n)}
                                >
                                  {textos.cancelar}
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandida === n.id && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={10} className="p-3">
                            <DetalheNota id={n.id} textos={textos} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
              <Table>
                <TableBody>
                  <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                    <TableCell colSpan={7}>
                      {visiveis.length} {textos.notas}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {textos.total}: {comoMoeda(somaVisiveis, "BRL")}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {textos.filtrandoPor}: {partesFiltro.join(" · ")}
            </p>
          </>
        )}
      </>

      {cartaPara && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setCartaPara(null);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-medium text-text">
                {textos.cartaCorrecao}
              </DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-sm text-muted-foreground">
              {textos.numNota} {cartaPara.numero ?? textos.semNumero}/{cartaPara.serie} ·{" "}
              {textos.registradaLocal}
            </DialogDescription>
            <div className="space-y-1.5">
              <Label htmlFor="correcao">{textos.correcao}</Label>
              <textarea
                id="correcao"
                className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={correcao}
                onChange={(e) => setCorrecao(e.target.value)}
                placeholder={textos.dicaCorrecao}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {correcao.trim().length}/1000 · {textos.dicaCorrecao}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCartaPara(null)}>
                {textos.cancelarBtn}
              </Button>
              <Button onClick={() => void registrarCarta()} disabled={registrandoCarta}>
                {registrandoCarta ? t("Enviando…") : textos.registrarCarta}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

type DetalheDaNota = {
  protocolo?: string | null;
  sefaz_cstat?: string | null;
  sefaz_xmotivo?: string | null;
  serie?: string | null;
  provedor?: string | null;
  erro?: string | null;
  chave_acesso?: string | null;
  order_id?: string | null;
  tem_xml: boolean;
  ibpt: {
    total_cents: number;
    origem: string;
    itens_com_ncm: number;
    itens_sem_ncm: number;
    fonte: string | null;
    versao: string | null;
    vigencia_inicio: string | null;
  } | null;
  eventos: {
    id: string;
    tipo: string;
    status: string | null;
    protocolo: string | null;
    mensagem: string | null;
    created_at: string;
  }[];
  jobs: {
    status: string;
    tentativas: number;
    max_tentativas: number;
    ultimo_erro: string | null;
  }[];
};

/** Detalhe da nota: dados da SEFAZ, histórico de eventos, fila e arquivos. */
function DetalheNota({ id, textos }: { id: string; textos: Textos }) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const [dados, setDados] = React.useState<DetalheDaNota | null>(null);

  React.useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: DetalheDaNota }>(`/api/v1/invoices/${id}`)
      .then((r) => vivo && setDados(r.data))
      .catch(() => vivo && setDados(null));
    return () => {
      vivo = false;
    };
  }, [id]);

  if (!dados) return <Skeleton className="h-32 w-full" />;

  const retornoSefaz = dados.sefaz_xmotivo || dados.erro;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="hover-raise space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
          {dados.provedor ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{textos.provedor}</span>
              <span className="font-medium">{dados.provedor}</span>
            </div>
          ) : null}
          {dados.protocolo ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{textos.protocolo}</span>
              <span className="font-mono text-xs">{dados.protocolo}</span>
            </div>
          ) : null}
          {retornoSefaz ? (
            <div className="rounded-lg border border-warning/40 bg-warning-bg p-2 text-xs">
              <p className="font-medium">
                {textos.retornoSefaz}
                {dados.sefaz_cstat ? (
                  <span className="ml-1 font-mono">({dados.sefaz_cstat})</span>
                ) : null}
              </p>
              <p className="mt-0.5">{retornoSefaz}</p>
            </div>
          ) : null}
          {dados.chave_acesso ? (
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">{textos.chaveAcesso}</span>
              <span className="font-mono text-xs break-all">{dados.chave_acesso}</span>
            </div>
          ) : null}
          {dados.ibpt ? (
            <div className="space-y-1 rounded-lg border border-border bg-surface p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{textos.impostoAproximado}</span>
                <span className="font-medium tabular-nums">
                  {comoMoeda(dados.ibpt.total_cents, "BRL")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                IBPT
                {dados.ibpt.vigencia_inicio
                  ? ` · ${textos.vigencia} ${new Date(
                      Number(dados.ibpt.vigencia_inicio.slice(0, 4)),
                      Number(dados.ibpt.vigencia_inicio.slice(5, 7)) - 1,
                      Number(dados.ibpt.vigencia_inicio.slice(8, 10)),
                    ).toLocaleDateString(tagIdioma)}`
                  : ""}
                {dados.ibpt.fonte ? ` · ${dados.ibpt.fonte}` : ""}
                {dados.ibpt.itens_sem_ncm > 0
                  ? ` · ${dados.ibpt.itens_sem_ncm} ${t("item(s) sem NCM")}`
                  : ""}
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {textos.timeline}
          </p>
          {dados.eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="space-y-2">
              {dados.eventos.map((e) => (
                <li key={e.id} className="relative border-l border-border pl-4">
                  <span className="absolute top-1.5 -left-[3px] h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{e.tipo}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(e.created_at).toLocaleString(tagIdioma)}
                    </span>
                  </div>
                  {e.mensagem && <p className="text-xs text-muted-foreground">{e.mensagem}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {dados.jobs.length > 0 && dados.jobs[0]?.status !== "concluido" && (
          <div className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm">
            <p className="font-medium">
              {t("Fila")}: {dados.jobs[0]?.status}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {t("tentativa")} {dados.jobs[0]?.tentativas}/{dados.jobs[0]?.max_tentativas}
              {dados.jobs[0]?.ultimo_erro ? ` — ${dados.jobs[0]?.ultimo_erro}` : ""}
            </p>
          </div>
        )}
        {dados.tem_xml && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/v1/invoices/${id}/xml`} target="_blank" rel="noopener noreferrer">
                {textos.baixarXml}
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/v1/invoices/${id}/danfe`} target="_blank" rel="noopener noreferrer">
                {textos.verDanfe}
              </a>
            </Button>
          </div>
        )}
        {dados.order_id && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/app/pedidos/${dados.order_id}`}>{textos.verPedido}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
