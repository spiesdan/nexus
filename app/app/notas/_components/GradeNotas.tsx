"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { RecorteDaLista } from "@/components/fiscal/RecorteDaLista";
import { EmptyFilterResults, EmptyState } from "@/components/empty";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { naturezaDaNota, ROTULO_DA_NATUREZA } from "@/lib/fiscal/natureza-da-nota";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import { ROTULO_DA_NOTA, type NotaFiscal, type StatusDaNota } from "@/lib/schemas/fiscal";
import { comoMoeda } from "@/lib/format/moeda";
import {
  CaretDown,
  DownloadSimple,
  FileText,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Printer,
  Receipt,
  UploadSimple,
} from "@/lib/ui/icons";

import type { Textos } from "./textos";
import { CorrigirNota } from "./CorrigirNota";

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
  totalNotas = null,
  pessoas,
  pessoasAvulsas = {},
  operacaoPadrao,
  ambientePadrao,
  podeEmitir,
  textos,
}: {
  inicial: NotaFiscal[];
  /** Total da organização (sem o teto de 200). `null` = não medido. */
  totalNotas?: number | null;
  pessoas: Record<string, string>;
  /** Nota sem pedido (venda avulsa): o nome vem da própria nota, por id dela. */
  pessoasAvulsas?: Record<string, string>;
  operacaoPadrao: string;
  ambientePadrao: string;
  podeEmitir: boolean;
  textos: Textos;
}) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const confirmar = useConfirmar();
  const [expandida, setExpandida] = React.useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [periodo, setPeriodo] = React.useState("ano");
  const [cartaPara, setCartaPara] = React.useState<NotaFiscal | null>(null);
  const [corrigirPara, setCorrigirPara] = React.useState<NotaFiscal | null>(null);
  const [correcao, setCorrecao] = React.useState("");
  const [registrandoCarta, setRegistrandoCarta] = React.useState(false);
  const [modeloXml, setModeloXml] = React.useState("");
  const [progressoXml, setProgressoXml] = React.useState<{ total: number; feitos: number } | null>(
    null,
  );
  const [importarXmlAberto, setImportarXmlAberto] = React.useState(false);
  const [importandoXml, setImportandoXml] = React.useState(false);
  const [resumoXml, setResumoXml] = React.useState<{
    importados: number;
    jaExistiam: number;
    fora_do_emitente: number;
    ilegiveis: number;
    conflitos: number;
    naoAutorizadas: number;
    erros: string[];
  } | null>(null);
  const [erroXml, setErroXml] = React.useState<string | null>(null);
  /**
   * Qual nota está com a reemissão EM CURSO.
   *
   * Sem isto o botão "Tentar de novo" continuava clicável durante a chamada: o
   * segundo clique mandava outro POST antes de o primeiro voltar. A rota é
   * idempotente por job aberto, mas o operador via dois toasts e não sabia se
   * tinha pedido duas vezes — e o estado da tela dizia "nada acontecendo".
   */
  const [reemitindoId, setReemitindoId] = React.useState<string | null>(null);
  const arquivoXmlRef = React.useRef<HTMLInputElement>(null);

  // O NSU foi embora desta aba de propósito: a distribuição da SEFAZ é do
  // DESTINATÁRIO e não devolve ao emitente as notas que ele mesmo emitiu
  // (NT 2014.002). O botão antigo ficava em "NSU 0/0" para sempre. O histórico
  // entra pelo XML exportado do sistema antigo — ver o diálogo abaixo.

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
    const pessoa = (n.order_id
      ? (pessoas[n.order_id] ?? "")
      : (pessoasAvulsas[n.id] ?? "")
    ).toLowerCase();
    return numero.includes(b) || chave.includes(b) || protocolo.includes(b) || pessoa.includes(b);
  });

  /**
   * As SITUAÇÕES como filtro — a contagem e o filtro são a mesma pergunta.
   *
   * Antes havia um seletor de status e, acima dele, quatro cartões com os
   * mesmos números. Quem abre a tela quer "ver as com erro", não escolher
   * "erro" numa lista suspensa. Só aparece a situação que existe: chip de
   * filtro que devolve lista vazia é ruído.
   */
  const chips = [
    { valor: "", rotulo: textos.todos, contagem: inicial.length },
    {
      valor: "autorizada",
      rotulo: textos.autorizada,
      contagem: inicial.filter((n) => n.status === "autorizada").length,
    },
    {
      valor: "em_emissao",
      rotulo: textos.emitindo,
      contagem: inicial.filter((n) => n.status === "em_emissao").length,
    },
    {
      valor: "pendente",
      rotulo: textos.pendente,
      contagem: inicial.filter((n) => n.status === "pendente").length,
    },
    {
      valor: "cancelada",
      rotulo: textos.cancelada,
      contagem: inicial.filter((n) => n.status === "cancelada").length,
    },
    {
      valor: "erro",
      rotulo: textos.erro,
      contagem: inicial.filter((n) => n.status === "erro").length,
    },
    {
      valor: "denegada",
      rotulo: textos.denegada,
      contagem: inicial.filter((n) => n.status === "denegada").length,
    },
  ].filter((c) => c.valor === "" || c.contagem > 0);
  /**
   * A NATUREZA DE CADA NOTA — e a soma que não mistura.
   *
   * Caso real (pedido 19560): duas autorizadas de R$ 70, uma delas devolução
   * (finalidade 4). A lista mostrava as duas iguais e o total somava as duas,
   * o que lê como faturamento em dobro. Aqui o selo diz o que é, a devolução
   * aponta a nota que devolve, e a soma separa venda de devolução.
   */
  const porChave = React.useMemo(
    () => new Map(inicial.filter((n) => n.chave_acesso).map((n) => [n.chave_acesso as string, n])),
    [inicial],
  );
  const naturezaDe = (n: NotaFiscal) => naturezaDaNota(n.extras_fiscais);

  const somaVisiveis = visiveis.reduce((a, n) => a + n.total_cents, 0);
  const somaVenda = visiveis
    .filter((n) => naturezaDe(n).natureza !== "devolucao")
    .reduce((a, n) => a + n.total_cents, 0);
  const somaDevolucao = visiveis
    .filter((n) => naturezaDe(n).natureza === "devolucao")
    .reduce((a, n) => a + n.total_cents, 0);
  const temDevolucao = somaDevolucao > 0;

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
        n.order_id ? (pessoas[n.order_id] ?? "") : (pessoasAvulsas[n.id] ?? ""),
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

  /**
   * Importar o histórico do sistema antigo (Mercos, Odivix…) pelos XMLs.
   *
   * O resumo fica NO DIÁLOGO, não num toast que some: quem sobe 300 notas
   * precisa ler quantas entraram, quantas já existiam e quais foram recusadas.
   */
  async function importarXmls(arquivos: File[]) {
    setImportandoXml(true);
    setErroXml(null);
    setResumoXml(null);
    try {
      const form = new FormData();
      for (const arquivo of arquivos) form.append("arquivos", arquivo);
      // `fetch` direto: upload de ZIP grande passa do timeout de 10s do
      // apiClient, e o `Content-Type` com boundary tem que ser o do browser.
      const res = await fetch("/api/v1/invoices/importar-xmls", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const json = (await res.json().catch(() => null)) as {
        data?: {
          importados: number;
          jaExistiam: number;
          fora_do_emitente: number;
          ilegiveis: number;
          conflitos: number;
          naoAutorizadas: number;
          erros: string[];
        };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.data) {
        setErroXml(json?.error?.message ?? t("Não consegui importar os XMLs."));
        return;
      }
      setResumoXml(json.data);
      router.refresh();
    } catch {
      setErroXml(t("Não consegui enviar os arquivos."));
    } finally {
      setImportandoXml(false);
      if (arquivoXmlRef.current) arquivoXmlRef.current.value = "";
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

  async function reemitir(id: string, status: StatusDaNota) {
    // Nota em `erro` é dead-letter; `em_emissao` pode estar PROCESSANDO ou
    // travada. Os dois usam a mesma rota, que decide pelo job aberto e recusa
    // com 409 quando a tentativa ainda está viva — por isso a confirmação diz
    // o que acontece em cada caso, em vez de prometer um reenvio que pode não
    // sair.
    const travada = status === "em_emissao";
    const ok = await confirmar({
      title: travada
        ? t("Tentar de novo uma nota que ficou em Emitindo?")
        : t("Tentar emitir esta nota de novo?"),
      description: travada
        ? t(
            "Use quando a nota está em Emitindo há mais de 15 minutos sem mudar: o processamento travou e esta ação devolve o mesmo job à fila, sem criar outro. Se ela ainda estiver sendo processada, o servidor recusa e nada é duplicado.",
          )
        : t(
            "A nota volta para a fila de emissão e a tentativa anterior continua no histórico. Nada é transmitido agora: o worker pega o job em seguida.",
          ),
      confirmLabel: t("Tentar de novo"),
      cancelLabel: t("Voltar"),
    });
    if (!ok) return;
    setReemitindoId(id);
    try {
      await apiClient.post(`/api/v1/invoices/${id}/reemitir`, {});
      toast.success(t("Nota enfileirada para emissão"));
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setReemitindoId(null);
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

  async function confirmaCancelamento(n: NotaFiscal) {
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
    // Pendente/emitindo/erro NÃO são terminais, mas o cancelamento encerra a
    // tentativa e apaga o erro que explica o que deu errado. Sem esta
    // confirmação, um clique no ícone da linha descartava o diagnóstico que o
    // operador ia usar para corrigir e reemitir.
    const rotulo = ROTULO_DA_NOTA[n.status] ?? n.status;
    const ok = await confirmar({
      title: t(`Cancelar esta nota (${rotulo})?`),
      description:
        n.status === "em_emissao"
          ? t(
              "A nota está em emissão agora. Cancelar interrompe esta tentativa e não há como voltar atrás — se o que você quer é tentar de novo, use “Tentar de novo”.",
            )
          : t(
              "O cancelamento é definitivo. O erro registrado nesta tentativa deixa de aparecer na nota, e você pode emitir outra depois.",
            ),
      confirmLabel: t("Cancelar nota"),
      cancelLabel: t("Voltar"),
      danger: true,
    });
    if (!ok) return;
    void cancelar(n.id);
  }

  return (
    <div className="space-y-3">
      {/* O teto da grade, dito. A busca/status filtram as 200 carregadas; sem o
          aviso, "não achei a nota" parecia ausência de nota. */}
      <RecorteDaLista mostrados={inicial.length} total={totalNotas} descricao="notas" />
      {/* ── A BARRA DE TRABALHO ──────────────────────────────────────────────
          Saíram os quatro cartões de resumo: os mesmos números já estão no topo
          da página, e repeti-los aqui empurrava a lista para baixo. No lugar,
          uma faixa só — busca, período, modelo, exportar — e, embaixo, as
          SITUAÇÕES como filtro (a contagem e o filtro eram a mesma pergunta em
          dois controles diferentes: um seletor e um cartão).

          O total do período fica à direita da faixa, colado no que ele soma. */}
      <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={textos.buscarNota}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={textos.buscarNota}
              className="h-10 rounded-xl pl-9"
            />
          </div>

          <select
            aria-label={textos.data}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          >
            <option value="ano">{textos.esteAno}</option>
            <option value="mes">{textos.esteMes}</option>
            <option value="30">{textos.ultimos30}</option>
            <option value="tudo">{textos.tudo}</option>
          </select>

          <select
            aria-label={textos.modelo}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
            value={modeloXml}
            onChange={(e) => setModeloXml(e.target.value)}
          >
            <option value="">
              {textos.modelo}: {textos.todos}
            </option>
            <option value="55">{textos.modeloNfe}</option>
            <option value="65">{textos.modeloNfce}</option>
          </select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-10 rounded-xl">
                <DownloadSimple size={14} />
                {t("Exportar")}
                <CaretDown size={13} className="ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={exportarCsv}>{textos.exportarCsv}</DropdownMenuItem>
              {podeEmitir && (
                <DropdownMenuItem onSelect={exportarXmls}>{textos.exportaXmls}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {podeEmitir && (
            <Button
              size="sm"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => setImportarXmlAberto(true)}
            >
              <UploadSimple size={14} />
              {textos.importarXmls}
            </Button>
          )}

          {podeEmitir && (
            <Button size="sm" className="h-10 rounded-xl" asChild>
              <Link href="/app/notas?aba=emitir">
                <Plus size={14} />
                {textos.emitir}
              </Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.valor || "todas"}
              type="button"
              onClick={() => setFiltroStatus(c.valor)}
              aria-pressed={filtroStatus === c.valor}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                filtroStatus === c.valor
                  ? "border-accent-600/50 bg-accent-soft text-accent-ink"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-text",
              )}
            >
              {c.rotulo}
              <span className="tabular-nums opacity-70">{c.contagem}</span>
            </button>
          ))}

          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {visiveis.length} {textos.notas} ·{" "}
            <strong className="font-semibold text-text">{comoMoeda(somaVenda, "BRL")}</strong>
            {temDevolucao ? (
              <>
                {" "}
                {textos.venda.toLowerCase()} ·{" "}
                <span className="text-muted-foreground">
                  {comoMoeda(somaDevolucao, "BRL")} {textos.devolucao.toLowerCase()}
                </span>
              </>
            ) : null}
          </span>
        </div>
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
          subcopy="As notas nascem dos pedidos que já foram aprovados, concluídos, faturados ou expedidos."
          primary={{ label: t("Ver pedidos"), href: "/app/pedidos" }}
        />
      ) : visiveis.length === 0 ? (
        <EmptyFilterResults primary={{ label: t("Limpar filtros"), onClick: limparFiltros }} />
      ) : (
        <>
          <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
            <Table>
              <TableCaption className="sr-only">
                {t("Notas, da mais recente para a mais antiga pela data de criação.")}
              </TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{textos.status}</TableHead>
                  <TableHead className="hidden 2xl:table-cell">{textos.protocolo}</TableHead>
                  <TableHead className="hidden 2xl:table-cell">{textos.operacao}</TableHead>
                  <TableHead>{textos.data}</TableHead>
                  <TableHead className="text-right">{textos.numNota}</TableHead>
                  <TableHead className="hidden 2xl:table-cell">{textos.serie}</TableHead>
                  <TableHead>{textos.pessoa}</TableHead>
                  <TableHead className="text-right">{textos.valorTotal}</TableHead>
                  <TableHead className="hidden min-[1700px]:table-cell">
                    {textos.ambiente}
                  </TableHead>
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={VARIANTE_STATUS[n.status]}>
                            {ROTULO_DA_NOTA[n.status] ?? n.status}
                          </Badge>
                          <Badge
                            variant={
                              naturezaDe(n).natureza === "devolucao"
                                ? "warning"
                                : naturezaDe(n).natureza === "venda"
                                  ? "neutral"
                                  : "info"
                            }
                            title={
                              naturezaDe(n).natureza === "devolucao"
                                ? t("Esta nota devolve mercadoria — ela não soma como venda.")
                                : undefined
                            }
                          >
                            {t(ROTULO_DA_NATUREZA[naturezaDe(n).natureza])}
                          </Badge>
                        </div>
                        {naturezaDe(n).natureza === "devolucao" && naturezaDe(n).refNfe
                          ? (() => {
                              const original = porChave.get(naturezaDe(n).refNfe as string);
                              const rotulo = original
                                ? `${textos.devolveA} ${original.numero ?? textos.semNumero}/${original.serie}`
                                : `${textos.devolveA} ${naturezaDe(n).refNfe!.slice(0, 8)}…`;
                              return original ? (
                                <button
                                  type="button"
                                  className="mt-1 block text-xs text-accent-ink underline underline-offset-4"
                                  onClick={() => setExpandida(original.id)}
                                >
                                  {rotulo}
                                </button>
                              ) : (
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {rotulo}
                                </span>
                              );
                            })()
                          : null}
                        {n.erro && <span className="block text-xs text-error-fg">{n.erro}</span>}
                        {/*
                            EM EMISSÃO NÃO É ESTADO FINAL — e a tela dizia só
                            "Emitindo". O job velho é reaberto por CAS no
                            servidor (>15 min), mas quem olha a tela não sabia
                            que existe saída: a dica ficava no `title` do
                            botão, que não aparece no toque nem no teclado.
                          */}
                        {n.status === "em_emissao" && (
                          <span className="block max-w-64 text-xs text-muted-foreground">
                            {t(
                              "Processando. Se ficar assim por mais de 15 minutos, use “Tentar de novo”.",
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs whitespace-nowrap 2xl:table-cell">
                        {n.protocolo ?? "—"}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground 2xl:table-cell">
                        {operacaoPadrao === "" ? "—" : operacaoPadrao}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(n.created_at).toLocaleDateString(tagIdioma)}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap text-text tabular-nums">
                        {n.numero === null ? textos.semNumero : n.numero}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground 2xl:table-cell">
                        {n.serie}
                      </TableCell>
                      <TableCell className="max-w-56 truncate">
                        {n.order_id ? (pessoas[n.order_id] ?? "—") : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                        {comoMoeda(n.total_cents, "BRL")}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground min-[1700px]:table-cell">
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
                          {podeEmitir && (n.status === "erro" || n.status === "pendente") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => setCorrigirPara(n)}
                              title={t("Corrigir nota")}
                            >
                              <PencilSimple size={14} />
                              {t("Corrigir")}
                            </Button>
                          )}
                          {podeEmitir && (n.status === "erro" || n.status === "em_emissao") && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reemitindoId === n.id}
                              onClick={() => void reemitir(n.id, n.status)}
                              title={
                                n.status === "em_emissao"
                                  ? t("Só depois de 15 minutos em Emitindo sem mudar")
                                  : undefined
                              }
                            >
                              {n.status === "erro" ? textos.reemitir : t("Tentar de novo")}
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
                        <TableCell colSpan={6} className="p-3 2xl:hidden">
                          <DetalheNota id={n.id} textos={textos} />
                        </TableCell>
                        <TableCell colSpan={10} className="hidden p-3 2xl:table-cell">
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
                  <TableCell colSpan={3} className="2xl:hidden">
                    {visiveis.length} {textos.notas}
                  </TableCell>
                  <TableCell colSpan={7} className="hidden 2xl:table-cell">
                    {visiveis.length} {textos.notas}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {temDevolucao ? (
                      <>
                        <span className="block">
                          {textos.venda}: {comoMoeda(somaVenda, "BRL")}
                        </span>
                        <span className="block text-muted-foreground">
                          {textos.devolucao}: {comoMoeda(somaDevolucao, "BRL")}
                        </span>
                        <span className="block">
                          {textos.total} ({textos.incluiDevolucao}):{" "}
                          {comoMoeda(somaVisiveis, "BRL")}
                        </span>
                      </>
                    ) : (
                      <>
                        {textos.total}: {comoMoeda(somaVisiveis, "BRL")}
                      </>
                    )}
                  </TableCell>
                  <TableCell colSpan={2} className="hidden 2xl:table-cell" />
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {textos.filtrandoPor}: {partesFiltro.join(" · ")}
          </p>
        </>
      )}

      {corrigirPara && (
        <CorrigirNota
          id={corrigirPara.id}
          rotulo={
            corrigirPara.numero === null
              ? `${corrigirPara.serie}`
              : `${corrigirPara.numero}/${corrigirPara.serie}`
          }
          aberto
          aoFechar={() => {
            setCorrigirPara(null);
            router.refresh();
          }}
        />
      )}
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
      {importarXmlAberto && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setImportarXmlAberto(false);
              setResumoXml(null);
              setErroXml(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-medium text-text">
                {textos.importarXmls}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {textos.importarXmlsAjuda}
              </DialogDescription>
            </DialogHeader>

            <p className="rounded-lg border border-border bg-surface-elevated p-3 text-xs text-muted-foreground">
              {textos.importarXmlsNsu}
            </p>

            <input
              ref={arquivoXmlRef}
              type="file"
              multiple
              accept=".xml,.zip,application/xml,application/zip"
              className="hidden"
              data-testid="arquivos-xml"
              onChange={(e) => {
                const arquivos = Array.from(e.target.files ?? []);
                if (arquivos.length > 0) void importarXmls(arquivos);
              }}
            />

            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={importandoXml}
              onClick={() => arquivoXmlRef.current?.click()}
            >
              <UploadSimple size={16} />
              {importandoXml ? t("Importando…") : textos.escolherXmls}
            </Button>

            {erroXml && <p className="text-sm text-destructive">{erroXml}</p>}

            {resumoXml && (
              <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">
                  {resumoXml.importados} {t("importada(s)")} · {resumoXml.jaExistiam}{" "}
                  {t("já existiam")}
                </p>
                {(resumoXml.fora_do_emitente > 0 ||
                  resumoXml.ilegiveis > 0 ||
                  resumoXml.naoAutorizadas > 0 ||
                  resumoXml.conflitos > 0) && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {resumoXml.fora_do_emitente > 0 && (
                      <li>
                        {resumoXml.fora_do_emitente} {t("de outro emitente (não é o seu CNPJ)")}
                      </li>
                    )}
                    {resumoXml.ilegiveis > 0 && (
                      <li>
                        {resumoXml.ilegiveis} {t("ilegível(is) — não era um procNFe")}
                      </li>
                    )}
                    {resumoXml.naoAutorizadas > 0 && (
                      <li>
                        {resumoXml.naoAutorizadas}{" "}
                        {t("sem protocolo de autorização (cStat diferente de 100)")}
                      </li>
                    )}
                    {resumoXml.conflitos > 0 && (
                      <li>
                        {resumoXml.conflitos} {t("conflito(s) de numeração")}
                      </li>
                    )}
                  </ul>
                )}
                {resumoXml.erros.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-destructive">
                    {resumoXml.erros.map((erro) => (
                      <li key={erro}>{erro}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
