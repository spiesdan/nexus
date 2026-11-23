"use client";

/**
 * PAINEL DE GASTOS DA CAMPANHA — fecha o ciclo do P1-17.
 *
 * Orçado × gasto real com o MESMO guard da criação (`guardOrcamento`), o
 * histórico curto de mídia LANÇADA À MÃO (até existir Marketing API — a tela
 * diz isso), e os links para o relatório mensal e o CSV. Sem schema novo.
 *
 * Viewer só lê: o formulário e os botões de editar/excluir aparecem só para
 * manager (a rota cobra o papel de novo — esconder não é autorização).
 */
import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusKpi } from "@/components/nexus-ui/kpi/nexus-kpi";
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
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { comoMoeda } from "@/lib/format/moeda";
import {
  guardOrcamento,
  type GuardDeOrcamento,
} from "@/lib/prospeccao/simulacao-gastos";

interface Lancamento {
  id: string;
  data: string;
  valor_cents: number;
  observacao: string | null;
  autor_id: string | null;
  created_at: string;
}

export function GastosDaCampanha({
  campanhaId,
  orcamentoProspeccaoCents,
  orcamentoMidiaCents,
  gastoProspeccaoCents,
  podeEditar,
}: {
  campanhaId: string;
  orcamentoProspeccaoCents: number | null;
  orcamentoMidiaCents: number | null;
  gastoProspeccaoCents: number;
  podeEditar: boolean;
}) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const [lancamentos, setLancamentos] = React.useState<Lancamento[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [data, setData] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [valor, setValor] = React.useState("");
  const [observacao, setObservacao] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const resposta = await apiClient.get<{ data?: { lancamentos?: Lancamento[] } }>(
        `/api/v1/prospecting/campaigns/${campanhaId}/gastos`,
      );
      setLancamentos(resposta?.data?.lancamentos ?? []);
      setErro(null);
    } catch (e) {
      setErro(t("Não foi possível carregar os lançamentos."));
      showApiError(e);
    }
  }, [campanhaId, t]);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const orcamentoTotal =
    orcamentoProspeccaoCents == null && orcamentoMidiaCents == null
      ? null
      : (orcamentoProspeccaoCents ?? 0) + (orcamentoMidiaCents ?? 0);
  const midiaLancada = lancamentos?.reduce((soma, l) => soma + l.valor_cents, 0) ?? 0;
  const gastoTotal = gastoProspeccaoCents + midiaLancada;
  const guard: GuardDeOrcamento = guardOrcamento({
    gastoCents: gastoTotal,
    limiteCents: orcamentoTotal,
  });
  const estado =
    guard.estado === "bloqueio" ? "bloqueio" : guard.estado === "aviso" || guard.estado === "reducao" ? "alerta" : "ok";

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round((Number(valor) || 0) * 100);
    if (cents <= 0) {
      toast.error(t("Informe um valor maior que zero."));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.post(`/api/v1/prospecting/campaigns/${campanhaId}/gastos`, {
        data,
        valor_cents: cents,
        observacao,
      });
      toast.success(t("Gasto de mídia lançado"));
      setValor("");
      setObservacao("");
      await carregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    try {
      await apiClient.delete(`/api/v1/prospecting/campaigns/${campanhaId}/gastos/${id}`);
      toast.success(t("Lançamento removido"));
      await carregar();
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium text-text">{t("Gastos")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={estado === "bloqueio" ? "destructive" : estado === "alerta" ? "secondary" : "outline"}>
            {estado === "bloqueio" ? t("bloqueio") : estado === "alerta" ? t("alerta") : t("ok")}
          </Badge>
          <a
            href={`/api/v1/prospecting/relatorio-gastos?campanha=${campanhaId}`}
            className="text-xs font-medium text-foreground underline underline-offset-4"
          >
            {t("Relatório mensal")}
          </a>
          <a
            href="/api/v1/prospecting/relatorio-gastos?formato=csv"
            className="text-xs font-medium text-foreground underline underline-offset-4"
          >
            CSV
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <NexusKpi label={t("Orçado")} value={comoMoeda(orcamentoTotal ?? 0, "BRL")} hint={t("prospecção + mídia")} />
        <NexusKpi label={t("Gasto real")} value={comoMoeda(gastoTotal, "BRL")} hint={t("prospecção medida + mídia lançada")} />
        <NexusKpi label={t("Percentual")} value={`${guard.pct}%`} hint={guard.proximoPasso} />
      </div>

      <p className="text-xs text-muted-foreground">
        {t("Gasto de mídia é LANÇAMENTO MANUAL até existir Marketing API — nada é importado ou inferido.")}
      </p>

      {erro ? (
        <div className="rounded-lg border border-error/40 bg-error-bg p-3 text-sm text-error-fg" role="alert">
          {erro}
          <Button variant="outline" size="sm" className="ml-2 min-h-11" onClick={() => void carregar()}>
            {t("Tentar de novo")}
          </Button>
        </div>
      ) : null}

      {podeEditar ? (
        <form onSubmit={(e) => void salvar(e)} className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="gasto-data">{t("Data")}</Label>
            <Input id="gasto-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gasto-valor">{t("Valor (R$)")}</Label>
            <Input id="gasto-valor" type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gasto-obs">{t("Observação")}</Label>
            <Input id="gasto-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={salvando} className="min-h-11">
              {salvando ? t("Salvando…") : t("Lançar mídia")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">{t("Somente gerentes podem lançar mídia.")}</p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">{t("Últimos lançamentos")}</h3>
        {lancamentos === null ? (
          <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
        ) : lancamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nenhum lançamento ainda.")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Data")}</TableHead>
                  <TableHead className="text-right">{t("Valor")}</TableHead>
                  <TableHead>{t("Observação")}</TableHead>
                  {podeEditar ? <TableHead>{t("Ações")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentos.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{new Date(`${l.data}T12:00:00Z`).toLocaleDateString(tagIdioma)}</TableCell>
                    <TableCell className="text-right tabular-nums">{comoMoeda(l.valor_cents, "BRL")}</TableCell>
                    <TableCell>{l.observacao ?? "—"}</TableCell>
                    {podeEditar ? (
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          onClick={() => void excluir(l.id)}
                        >
                          {t("Excluir")}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}
