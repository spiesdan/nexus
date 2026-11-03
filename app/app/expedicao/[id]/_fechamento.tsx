"use client";

/**
 * FECHAMENTO DE CAIXA DA CARGA — a prestação de contas que era papel.
 *
 * ═══ O QUE ESTA TELA É ════════════════════════════════════════════════════
 *
 * O PDF de romaneio imprimia a conferência de caixa como oito linhas vazias,
 * que o motorista preenchia à mão. Esta tela é a MESMA lista, com a conta
 * feita: as opções do PDF (resumo financeiro, cobrança por parada com ☐,
 * a cobrar por condição, as oito linhas de caixa, ocorrências e devoluções)
 * estão todas aqui, e o que o papel deixava em branco o sistema calcula.
 *
 * ═══ O QUE A TELA MOSTRA E O QUE ELA GRAVA ═══════════════════════════════
 *
 * Mostra (lido do servidor, nunca editável): o resumo financeiro, a cobrança
 * por parada, o "a cobrar por condição" e as ocorrências. Grava: o ☐ de cada
 * parada, as oito linhas contadas, quem conferiu e a observação.
 *
 * O total líquido e a diferença são calculados NA HORA a partir do que foi
 * digitado — prévia, não verdade. A verdade é a que o servidor devolve depois
 * de gravar, porque as somas são calculadas lá (`contaDoCaixa`), nunca aceitas
 * do corpo. A tela mostra a prévia para conferir antes de salvar, e o
 * resultado do servidor depois.
 *
 * ═══ O QUE "FECHOU" SIGNIFICA ════════════════════════════════════════════
 *
 * Que o caixa foi conferido e gravado — NÃO que os pedidos deram baixa. Dar
 * baixa é outra decisão, com regra própria (`POST /conciliar`), e juntar as
 * duas num ato só seria a mistura entre operação e dinheiro que a regra
 * proíbe. O aviso de diferença é atenção, não trava: troco a menos acontece
 * todo dia, e o que não pode é passar sem ninguém ver.
 */
import * as React from "react";

import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  avisosDoFechamento,
  contaDoCaixa,
  linhasCompletas,
  LINHAS_DO_CAIXA,
  type AvisoDoFechamento,
  type ChaveDaLinha,
  type ContaDoCaixa,
  type LinhaDoCaixa,
} from "@/lib/comercial/fechamento-carga";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import {
  ROTULO_MOTIVO_DEVOLUCAO,
  ROTULO_NA_CARGA,
  type MotivoDevolucao,
  type StatusNaCarga,
} from "@/lib/schemas/expedicao";
import { cn } from "@/lib/utils";

interface ParadaDaTela {
  shipment_order_id: string;
  order_id: string;
  sequencia: number;
  numero: number;
  cliente_nome: string;
  condicao: string | null;
  situacao: string;
  motivo: string | null;
  entregue_em: string | null;
  volumes: number;
  total_cents: number;
  pago_cents: number;
  a_cobrar_cents: number;
  conferido: boolean;
}

interface FechamentoDaTela {
  linhas: LinhaDoCaixa[];
  conta: ContaDoCaixa;
  conferente_nome: string | null;
  conferido_em: string | null;
  observacao: string | null;
}

interface CargaDoFechamento {
  resumo: {
    totalFaturado: number;
    pagoAntecipado: number;
    aCobrar: number;
    devolvido: number;
    volumes: number;
    concluidas: number;
    pendentes: number;
  };
  por_condicao: { condicao: string; valor_cents: number }[];
  paradas: ParadaDaTela[];
  fechamento: FechamentoDaTela | null;
  avisos: AvisoDoFechamento[];
}

/** "1.234,56" ou "1234.56" → cents. O que não é número vale 0, e não NaN. */
function reaisParaCents(reais: string): number {
  const n = Number(reais.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

function centsParaReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function dataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function FechamentoCarga({
  cargaId,
  podeFechar,
}: {
  cargaId: string;
  podeFechar: boolean;
}) {
  const t = useT();
  const [dados, setDados] = React.useState<CargaDoFechamento | null>(null);
  const [falhou, setFalhou] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  // O rascunho nasce do que o servidor mandou — e renasce a cada recarregada.
  // Editar direto no `dados` misturaria "o que está gravado" com "o que está
  // digitado", e a diferença entre os dois é justamente o que a tela precisa
  // mostrar.
  const [valores, setValores] = React.useState<Record<ChaveDaLinha, string> | null>(null);
  const [conferidos, setConferidos] = React.useState<Set<string> | null>(null);
  const [conferente, setConferente] = React.useState("");
  const [observacao, setObservacao] = React.useState("");

  const carregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: CargaDoFechamento }>(
        `/api/v1/shipments/${cargaId}/fechamento`,
      );
      const d = corpo?.data;
      if (!d || !Array.isArray(d.paradas)) {
        setFalhou(true);
        return;
      }
      setDados(d);
      setFalhou(false);
      const completas = linhasCompletas(d.fechamento?.linhas ?? []);
      setValores(
        Object.fromEntries(completas.map((l) => [l.chave, centsParaReais(l.valor_cents)])) as Record<
          ChaveDaLinha,
          string
        >,
      );
      setConferidos(new Set(d.paradas.filter((p) => p.conferido).map((p) => p.shipment_order_id)));
      setConferente(d.fechamento?.conferente_nome ?? "");
      setObservacao(d.fechamento?.observacao ?? "");
    } catch (e) {
      setFalhou(true);
      showApiError(e);
    }
  }, [cargaId]);

  React.useEffect(() => {
    // Sincronização com o servidor (a fonte da verdade), não estado derivado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  if (falhou || !dados || !valores || !conferidos) {
    if (falhou) return null;
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Prévia local: a mesma conta do servidor, sobre o que está DIGITADO. Serve
  // para conferir antes de salvar; a verdade é a que volta no PUT.
  const linhasDigitadas: LinhaDoCaixa[] = LINHAS_DO_CAIXA.map((l) => ({
    chave: l.chave,
    valor_cents: reaisParaCents(valores[l.chave] ?? "0"),
  }));
  const previa = contaDoCaixa(linhasDigitadas, dados.resumo.aCobrar);
  const avisosPrevios = avisosDoFechamento(previa, conferidos.size, dados.paradas.length);
  const temErro = avisosPrevios.some((a) => a.nivel === "erro");

  const mudou = (chave: ChaveDaLinha, valor: string) =>
    setValores((v) => (v ? { ...v, [chave]: valor } : v));

  const alternar = (id: string) =>
    setConferidos((c) => {
      if (!c) return c;
      const proximo = new Set(c);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  async function salvar() {
    if (temErro) {
      for (const a of avisosPrevios.filter((x) => x.nivel === "erro")) toast.error(a.texto);
      return;
    }
    // `conferidos` é não-nulo aqui pelo guarda do render, mas o TypeScript não
    // estreita estado dentro de closure assíncrona — e é ele que tem razão em
    // desconfiar: entre o clique e o `await`, um recarregar pode ter trocado.
    const marcados = conferidos;
    if (!marcados) return;
    setSalvando(true);
    try {
      const r = await apiClient.put<{
        data: { conta: ContaDoCaixa; avisos: AvisoDoFechamento[] };
      }>(`/api/v1/shipments/${cargaId}/fechamento`, {
        linhas: linhasDigitadas.filter((l) => l.valor_cents > 0),
        conferidos: [...marcados],
        conferente_nome: conferente.trim() || null,
        observacao: observacao.trim() || null,
      });
      for (const a of r.data.avisos ?? []) {
        if (a.nivel === "erro") toast.error(a.texto);
        else toast.warning(a.texto);
      }
      if ((r.data.avisos ?? []).length === 0) toast.success(t("Fechamento gravado."));
      else if (r.data.conta?.bate) toast.success(t("Fechamento gravado. O caixa bateu."));
      await carregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  const { resumo } = dados;
  const devolvidas = dados.paradas.filter((p) => p.situacao === "devolvido");
  const gravado = dados.fechamento;

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho da seção ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {t("Caixa")}
          </p>
          <h2 className="text-base font-medium text-text">{t("Fechamento de caixa")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("As oito linhas do romaneio — com a conta feita na hora.")}
          </p>
        </div>
        {gravado?.conferido_em ? (
          <Badge variant={gravado.conta.bate ? "success" : "warning"}>
            {t("Conferido em")} {dataHora(gravado.conferido_em)}
            {gravado.conferente_nome ? ` · ${gravado.conferente_nome}` : ""}
          </Badge>
        ) : (
          <Badge variant="neutral">{t("Ainda não conferido")}</Badge>
        )}
      </div>

      {/* ── Resumo financeiro — a fita do PDF, lida do servidor ───────────── */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-xs lg:grid-cols-5">
        {(
          [
            [t("Total faturado"), resumo.totalFaturado],
            [t("Pago antecipado"), resumo.pagoAntecipado],
            [t("A cobrar na entrega"), resumo.aCobrar],
            [t("Devolvido"), resumo.devolvido],
          ] as [string, number][]
        ).map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0 bg-surface px-3.5 py-3">
            <dt className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {rotulo}
            </dt>
            <dd className="mt-0.5 truncate text-lg font-semibold text-text tabular-nums">
              {comoMoeda(valor, "BRL")}
            </dd>
          </div>
        ))}
        <div className="col-span-2 min-w-0 bg-surface px-3.5 py-3 lg:col-span-1">
          <dt className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Volumes")}
          </dt>
          <dd className="mt-0.5 text-lg font-semibold text-text tabular-nums">
            {resumo.volumes}{" "}
            <span className="text-xs font-normal text-muted-foreground">{t("un.")}</span>
          </dd>
        </div>
      </dl>

      {/* A folha de conferência NÃO fica ao lado: com a coluna de contexto
          aberta, a tabela do romaneio (9 colunas, ~600px) não caberia e a
          situação/valores ficavam atrás de um scroll horizontal silencioso.
          Empilhada, cada bloco usa a largura inteira da ficha. */}
      <div className="space-y-4">
        {/* ── O que veio de cada parada ────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden p-0">
            <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {t("Cobrança por parada")}
                </p>
                <p className="text-sm font-medium text-text">
                  {resumo.concluidas} {resumo.concluidas === 1 ? t("concluída") : t("concluídas")}
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {resumo.pendentes} {resumo.pendentes === 1 ? t("pendente") : t("pendentes")}
                  </span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {conferidos.size}/{dados.paradas.length}{" "}
                {conferidos.size === 1 ? t("conferida") : t("conferidas")}
              </p>
            </header>

            {dados.paradas.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("Nenhum pedido embarcado.")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 text-center">
                        <span aria-hidden>☐</span>
                        <span className="sr-only">{t("Conferido")}</span>
                      </TableHead>
                      <TableHead className="hidden w-10 md:table-cell">{t("Seq")}</TableHead>
                      <TableHead>{t("Pedido")}</TableHead>
                      <TableHead>{t("Cliente")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("Condição")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("Situação")}</TableHead>
                      <TableHead className="hidden text-right md:table-cell">{t("Vol.")}</TableHead>
                      <TableHead className="text-right">{t("Total")}</TableHead>
                      <TableHead className="hidden text-right md:table-cell">{t("A cobrar")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dados.paradas.map((p) => (
                      <TableRow key={p.shipment_order_id}>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-accent"
                            checked={conferidos.has(p.shipment_order_id)}
                            disabled={!podeFechar}
                            onChange={() => alternar(p.shipment_order_id)}
                            aria-label={`${t("Conferido")}: ${numeroDoPedido(p.numero)}`}
                          />
                        </TableCell>
                        <TableCell className="hidden font-semibold text-accent tabular-nums md:table-cell">
                          {p.sequencia}
                        </TableCell>
                        <TableCell className="tabular-nums whitespace-nowrap">
                          {numeroDoPedido(p.numero)}
                        </TableCell>
                        <TableCell className="font-medium">{p.cliente_nome}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {p.condicao?.trim() ? p.condicao : "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                          {ROTULO_NA_CARGA[p.situacao as StatusNaCarga] ?? p.situacao}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {p.volumes > 0 ? p.volumes : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {comoMoeda(p.total_cents, "BRL")}
                        </TableCell>
                        <TableCell className="hidden text-right font-medium tabular-nums md:table-cell">
                          {p.a_cobrar_cents > 0 ? comoMoeda(p.a_cobrar_cents, "BRL") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {/* A cobrar por condição — prepare troco e maquininha. */}
          {dados.por_condicao.length > 0 && (
            <Card className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-3.5 py-3">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {t("A cobrar por condição")}
              </p>
              {dados.por_condicao.map((g) => (
                <p key={g.condicao} className="text-sm">
                  <span className="text-muted-foreground">{g.condicao}: </span>
                  <strong className="tabular-nums">{comoMoeda(g.valor_cents, "BRL")}</strong>
                </p>
              ))}
            </Card>
          )}

          {/* Ocorrências e devoluções — o verso do romaneio. */}
          {devolvidas.length > 0 && (
            <Card className="overflow-hidden p-0">
              <header className="border-b border-border bg-warning-bg px-3.5 py-2.5">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-warning-fg uppercase">
                  {t("Ocorrências e devoluções")}
                </p>
              </header>
              <ul className="divide-y divide-border text-sm">
                {devolvidas.map((p) => (
                  <li
                    key={p.shipment_order_id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-2"
                  >
                    <span className="font-medium tabular-nums">{numeroDoPedido(p.numero)}</span>
                    <span className="min-w-0 truncate text-muted-foreground">{p.cliente_nome}</span>
                    <span className="text-xs text-warning-fg">
                      {ROTULO_MOTIVO_DEVOLUCAO[p.motivo as MotivoDevolucao] ??
                        p.motivo ??
                        t("sem motivo registrado")}
                    </span>
                    <span className="ml-auto tabular-nums">{comoMoeda(p.total_cents, "BRL")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ── A folha de conferência: as oito linhas contadas ──────────────── */}
        <div className="min-w-0">
          <Card className="overflow-hidden p-0">
            <header className="flex items-start justify-between gap-2 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {t("Conferência")}
                </p>
                <p className="text-sm font-medium text-text">{t("Caixa contado")}</p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {conferidos.size}/{dados.paradas.length}
              </span>
            </header>

            <div className="space-y-4 p-3.5">
              {/* Entradas e saídas lado a lado: a folha do romaneio é uma
                  tabela, não uma lista comprida. */}
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      {t("Entradas")}
                    </p>
                    <p className="text-xs font-semibold text-text tabular-nums">
                      {comoMoeda(previa.entradas_cents, "BRL")}
                    </p>
                  </div>
                  {LINHAS_DO_CAIXA.filter((l) => l.entrada).map((l) => (
                    <div key={l.chave} className="flex items-center gap-2">
                      <Label
                        htmlFor={`caixa-${l.chave}`}
                        className="min-w-0 flex-1 text-xs leading-tight font-normal text-muted-foreground"
                      >
                        {t(l.rotulo)}
                      </Label>
                      <div className="relative w-28 shrink-0">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-text-subtle"
                        >
                          R$
                        </span>
                        <Input
                          id={`caixa-${l.chave}`}
                          inputMode="decimal"
                          placeholder="0,00"
                          className="h-8 pl-6 text-right text-xs tabular-nums"
                          value={valores[l.chave] ?? ""}
                          disabled={!podeFechar}
                          onChange={(e) => mudou(l.chave, e.target.value)}
                          aria-label={l.rotulo}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      {t("Saídas")}
                    </p>
                    <p className="text-xs font-semibold text-text tabular-nums">
                      {comoMoeda(previa.saidas_cents, "BRL")}
                    </p>
                  </div>
                  {LINHAS_DO_CAIXA.filter((l) => !l.entrada).map((l) => (
                    <div key={l.chave} className="flex items-center gap-2">
                      <Label
                        htmlFor={`caixa-${l.chave}`}
                        className="min-w-0 flex-1 text-xs leading-tight font-normal text-muted-foreground"
                      >
                        {t(l.rotulo)}
                      </Label>
                      <div className="relative w-28 shrink-0">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-text-subtle"
                        >
                          R$
                        </span>
                        <Input
                          id={`caixa-${l.chave}`}
                          inputMode="decimal"
                          placeholder="0,00"
                          className="h-8 pl-6 text-right text-xs tabular-nums"
                          value={valores[l.chave] ?? ""}
                          disabled={!podeFechar}
                          onChange={(e) => mudou(l.chave, e.target.value)}
                          aria-label={l.rotulo}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* A conta, na hora — prévia do que o servidor vai confirmar. */}
              <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                <div className="min-w-0 bg-surface px-3.5 py-2.5">
                  <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    {t("Total líquido entregue ao caixa")}
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold text-text tabular-nums">
                    {comoMoeda(previa.liquido_cents, "BRL")}
                  </dd>
                </div>
                <div className="min-w-0 bg-surface px-3.5 py-2.5">
                  <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    {t("Esperado")}
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold text-text tabular-nums">
                    {comoMoeda(previa.esperado_cents, "BRL")}
                  </dd>
                </div>
                <div
                  className={cn(
                    "min-w-0 px-3.5 py-2.5",
                    previa.bate ? "bg-success-bg" : "bg-warning-bg",
                  )}
                >
                  <dt
                    className={cn(
                      "text-[10px] font-semibold tracking-[0.12em] uppercase",
                      previa.bate ? "text-success-fg" : "text-warning-fg",
                    )}
                  >
                    {previa.bate ? t("O caixa bateu.") : t("Diferença")}
                  </dt>
                  <dd
                    className={cn(
                      "mt-0.5 text-lg font-semibold tabular-nums",
                      previa.bate ? "text-success-fg" : "text-warning-fg",
                    )}
                  >
                    {previa.bate
                      ? comoMoeda(0, "BRL")
                      : previa.diferenca_cents > 0
                        ? `${t("Sobra")} ${comoMoeda(previa.diferenca_cents, "BRL")}`
                        : `${t("Falta")} ${comoMoeda(Math.abs(previa.diferenca_cents), "BRL")}`}
                  </dd>
                </div>
              </dl>

              {avisosPrevios.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {avisosPrevios.map((a, i) => (
                    <li
                      key={i}
                      className={
                        a.nivel === "erro" ? "font-medium text-error-fg" : "text-warning-fg"
                      }
                    >
                      {a.texto}
                    </li>
                  ))}
                </ul>
              )}

              {/* A assinatura do papel, em nome e hora gravados. */}
              {podeFechar && (
                <div className="space-y-2.5 border-t border-border pt-3">
                  <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    {t("Quem conferiu")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="fechamento-conferente" className="text-xs">
                        {t("Conferente / caixa")}
                      </Label>
                      <Input
                        id="fechamento-conferente"
                        className="h-9"
                        value={conferente}
                        maxLength={120}
                        onChange={(e) => setConferente(e.target.value)}
                        placeholder={t("Quem recebeu e contou")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fechamento-obs" className="text-xs">
                        {t("Observação")}
                      </Label>
                      <Textarea
                        id="fechamento-obs"
                        className="min-h-16"
                        value={observacao}
                        maxLength={2000}
                        rows={2}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder={t("O que ficou pendente, se ficou")}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => void salvar()}
                      disabled={salvando || temErro}
                    >
                      {salvando ? t("Gravando...") : t("Gravar fechamento")}
                    </Button>
                    {!temErro && (
                      <p className="text-[11px] leading-relaxed text-text-subtle">
                        {t("Gravar não dá baixa nos pedidos — só registra a conferência.")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {gravado && (
                <p
                  className={cn(
                    "rounded-lg px-2.5 py-2 text-xs font-medium",
                    gravado.conta.bate ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg",
                  )}
                >
                  {t("Gravado")}:{" "}
                  {gravado.conta.bate
                    ? t("O caixa bateu.")
                    : gravado.conta.diferenca_cents > 0
                      ? `${t("Sobra de")} ${comoMoeda(gravado.conta.diferenca_cents, "BRL")}`
                      : `${t("Falta de")} ${comoMoeda(Math.abs(gravado.conta.diferenca_cents), "BRL")}`}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
