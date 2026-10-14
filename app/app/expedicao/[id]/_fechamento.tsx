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
import { ROTULO_MOTIVO_DEVOLUCAO, type MotivoDevolucao } from "@/lib/schemas/expedicao";

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
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-medium text-text">{t("Fechamento de caixa")}</h2>
        {gravado?.conferido_em && (
          <p className="text-xs text-muted-foreground">
            {t("Conferido em")} {dataHora(gravado.conferido_em)}
            {gravado.conferente_nome ? ` · ${gravado.conferente_nome}` : ""}
          </p>
        )}
        {gravado && (
          <p
            className={`ml-auto text-sm font-semibold tabular-nums ${gravado.conta.bate ? "text-emerald-600" : "text-amber-600"}`}
          >
            {gravado.conta.bate
              ? t("O caixa bateu.")
              : gravado.conta.diferenca_cents > 0
                ? `${t("Sobra de")} ${comoMoeda(gravado.conta.diferenca_cents, "BRL")}`
                : `${t("Falta de")} ${comoMoeda(Math.abs(gravado.conta.diferenca_cents), "BRL")}`}
          </p>
        )}
      </div>

      {/* RESUMO FINANCEIRO — as mesmas cinco linhas do PDF, lidas do servidor. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            [t("Total faturado"), resumo.totalFaturado],
            [t("Pago antecipado"), resumo.pagoAntecipado],
            [t("A cobrar na entrega"), resumo.aCobrar],
            [t("Devolvido"), resumo.devolvido],
          ] as [string, number][]
        ).map(([rotulo, valor]) => (
          <Card key={rotulo} className="hover-raise p-3">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">{rotulo}</p>
            <p className="text-lg font-semibold tabular-nums">{comoMoeda(valor, "BRL")}</p>
          </Card>
        ))}
        <Card className="hover-raise p-3">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">{t("Volumes")}</p>
          <p className="text-lg font-semibold tabular-nums">
            {resumo.volumes} {t("un.")}
          </p>
        </Card>
      </div>

      {/* COBRANÇA POR PARADA — a tabela do PDF, com o ☐ virando checkbox. */}
      <Card className="hover-raise p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground">
          {t("COBRANÇA POR PARADA")} · {resumo.concluidas} {t("concluídas")} · {resumo.pendentes}{" "}
          {t("pendentes")} · {conferidos.size}/{dados.paradas.length} {t("conferidas")}
        </p>
        {dados.paradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nenhum pedido embarcado.")}</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-12 text-center" title={t("Conferido")}>
                    ☐
                  </TableHead>
                  <TableHead>{t("Seq")}</TableHead>
                  <TableHead>{t("Pedido")}</TableHead>
                  <TableHead>{t("Cliente")}</TableHead>
                  <TableHead>{t("Condição")}</TableHead>
                  <TableHead>{t("Situação")}</TableHead>
                  <TableHead className="text-right">{t("Vol.")}</TableHead>
                  <TableHead className="text-right">{t("Total")}</TableHead>
                  <TableHead className="text-right">{t("A cobrar")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.paradas.map((p) => (
                  <TableRow key={p.shipment_order_id}>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-current"
                        checked={conferidos.has(p.shipment_order_id)}
                        disabled={!podeFechar}
                        onChange={() => alternar(p.shipment_order_id)}
                        aria-label={`${t("Conferido")}: ${numeroDoPedido(p.numero)}`}
                      />
                    </TableCell>
                    <TableCell className="font-bold text-primary">{p.sequencia}</TableCell>
                    <TableCell className="tabular-nums">{numeroDoPedido(p.numero)}</TableCell>
                    <TableCell className="font-medium">{p.cliente_nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.condicao?.trim() ? p.condicao : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.situacao}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.volumes > 0 ? p.volumes : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(p.total_cents, "BRL")}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {p.a_cobrar_cents > 0 ? comoMoeda(p.a_cobrar_cents, "BRL") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* A COBRAR POR CONDIÇÃO — prepare troco e maquininha, como no PDF. */}
      {dados.por_condicao.length > 0 && (
        <Card className="hover-raise p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
            {t("A COBRAR POR CONDIÇÃO")}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {dados.por_condicao.map((g) => (
              <li key={g.condicao}>
                <span className="text-muted-foreground">{g.condicao}: </span>
                <strong className="tabular-nums">{comoMoeda(g.valor_cents, "BRL")}</strong>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* CONFERÊNCIA DE CAIXA — as oito linhas do PDF, agora com a conta feita. */}
      <Card className="hover-raise space-y-3 p-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          {t("CONFERÊNCIA DE CAIXA")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {LINHAS_DO_CAIXA.map((l) => (
            <div key={l.chave} className="space-y-1">
              <Label htmlFor={`caixa-${l.chave}`}>
                {l.entrada ? t(l.rotulo) : `${t(l.rotulo)} (−)`}
              </Label>
              <Input
                id={`caixa-${l.chave}`}
                inputMode="decimal"
                placeholder="0,00"
                className="text-right tabular-nums"
                value={valores[l.chave] ?? ""}
                disabled={!podeFechar}
                onChange={(e) => mudou(l.chave, e.target.value)}
                aria-label={l.rotulo}
              />
            </div>
          ))}
        </div>
        <dl className="grid gap-2 rounded-2xl border p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">{t("Entradas")}</dt>
            <dd className="font-semibold tabular-nums">{comoMoeda(previa.entradas_cents, "BRL")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("Saídas")}</dt>
            <dd className="font-semibold tabular-nums">{comoMoeda(previa.saidas_cents, "BRL")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("Total líquido entregue ao caixa")}</dt>
            <dd className="text-base font-semibold tabular-nums">
              {comoMoeda(previa.liquido_cents, "BRL")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("Diferença")} ({t("esperado")} {comoMoeda(previa.esperado_cents, "BRL")})
            </dt>
            <dd
              className={`text-base font-semibold tabular-nums ${previa.bate ? "text-emerald-600" : "text-amber-600"}`}
            >
              {previa.bate
                ? t("Bateu.")
                : previa.diferenca_cents > 0
                  ? `${t("Sobra")} ${comoMoeda(previa.diferenca_cents, "BRL")}`
                  : `${t("Falta")} ${comoMoeda(Math.abs(previa.diferenca_cents), "BRL")}`}
            </dd>
          </div>
        </dl>
        {avisosPrevios.length > 0 && (
          <ul className="space-y-1 text-sm">
            {avisosPrevios.map((a, i) => (
              <li key={i} className={a.nivel === "erro" ? "font-medium text-red-600" : "text-amber-600"}>
                {a.texto}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* OCORRÊNCIAS E DEVOLUÇÕES — o que o PDF listava no verso. */}
      {devolvidas.length > 0 && (
        <Card className="hover-raise p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
            {t("OCORRÊNCIAS E DEVOLUÇÕES")}
          </p>
          <ul className="space-y-1 text-sm">
            {devolvidas.map((p) => (
              <li key={p.shipment_order_id}>
                {numeroDoPedido(p.numero)} · {p.cliente_nome} ·{" "}
                {(ROTULO_MOTIVO_DEVOLUCAO[p.motivo as MotivoDevolucao] ?? p.motivo ?? t("sem motivo registrado"))}{" "}
                · {comoMoeda(p.total_cents, "BRL")}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* QUEM CONFERIU — a assinatura do papel, em nome e hora gravados. */}
      {podeFechar && (
        <Card className="hover-raise space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fechamento-conferente">{t("Conferente / caixa")}</Label>
              <Input
                id="fechamento-conferente"
                value={conferente}
                maxLength={120}
                onChange={(e) => setConferente(e.target.value)}
                placeholder={t("Quem recebeu e contou")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fechamento-obs">{t("Observação")}</Label>
              <Textarea
                id="fechamento-obs"
                value={observacao}
                maxLength={2000}
                rows={2}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder={t("O que ficou pendente, se ficou")}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void salvar()} disabled={salvando || temErro}>
              {salvando ? t("Gravando...") : t("Gravar fechamento")}
            </Button>
            {!temErro && (
              <p className="text-xs text-muted-foreground">
                {t("Gravar não dá baixa nos pedidos — só registra a conferência.")}
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
