"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ROTULO_RECOMPRA, type SituacaoRecompra } from "@/lib/comercial/radar-compras";
import { comoMoeda } from "@/lib/format/moeda";

type LinhaRadar = {
  contact_id: string;
  nome: string | null;
  situacao: SituacaoRecompra;
  atraso_dias: number;
  dias_sem_compra: number;
};

type FilaFollowup = {
  source: string;
  id: string;
  contact: { id: string; name: string | null } | null;
  flow_name: string | null;
  next_fire_at: string | null;
  status: string;
};

type MesRoadmap = {
  ano_mes: string;
  rotulo: string;
  status: "fechado" | "andamento" | "futuro";
  realizado_cents: number;
  meta_cents: number | null;
  atingido_pct: number | null;
  projecao_cents: number | null;
  metodo_projecao: string | null;
};

type RespostaRoadmap = {
  ano: string;
  meses: MesRoadmap[];
  amostra_parcial: boolean;
};

const TIMEOUT_RADAR_MS = 60_000;

/**
 * O radar agrega a base inteira a cada chamada (mesmo molde da tela do
 * Radar): 60s de teto, e o resultado fica guardado 10 min — o dashboard é
 * a página mais aberta, não pode reagregar o histórico a cada visita.
 */
function useRadarDoDashboard() {
  return useQuery({
    queryKey: ["nexus", "radar-dashboard"],
    staleTime: 10 * 60_000,
    queryFn: () =>
      apiClient
        .get<{ data: LinhaRadar[] }>("/api/v1/radar-compras?situacao=todas&limit=5000", {
          timeoutMs: TIMEOUT_RADAR_MS,
        })
        .then((r) => r.data ?? []),
  });
}

/** Agrupamento igual ao do Radar (`RadarCategorias`): mesma pergunta, mesma resposta. */
function contarPorGrupo(linhas: LinhaRadar[]) {
  let risco = 0;
  let recompra = 0;
  let oportunidade = 0;
  for (const l of linhas) {
    if (l.situacao === "em_risco") risco += 1;
    else if (l.situacao === "recompra_atrasada") recompra += 1;
    else if (l.situacao === "oportunidade_aberta" || l.situacao === "em_voo" || l.situacao === "primeira_compra") {
      oportunidade += 1;
    }
  }
  return { risco, recompra, oportunidade };
}

const STATUS_VENCIDO = new Set(["active", "waiting_reply", "agendada"]);

export function ClientesParaAgir() {
  const t = useT();
  const radar = useRadarDoDashboard();
  const fila = useQuery({
    queryKey: ["nexus", "fila-followups-vencidos"],
    staleTime: 5 * 60_000,
    // O corte "vencido" acontece no fetch (fora do render, que é puro) e vale
    // enquanto o cache durar — mesma janela do staleTime.
    queryFn: () =>
      apiClient
        .get<{ data: FilaFollowup[] }>("/api/v1/ai/followups/queue?limit=100")
        .then((r) => {
          const agora = Date.now();
          return (r.data ?? []).filter(
            (f) =>
              f.next_fire_at != null && STATUS_VENCIDO.has(f.status) && new Date(f.next_fire_at).getTime() < agora,
          );
        }),
  });

  const linhas = radar.data ?? [];
  const contagens = contarPorGrupo(linhas);
  const vencidos = fila.data ?? [];
  // Prioridade do radar: risco → recompra → oportunidade (mesma ordem da rota).
  const ORDEM: SituacaoRecompra[] = ["em_risco", "recompra_atrasada", "oportunidade_aberta", "em_voo", "primeira_compra"];
  const paraAgir = ORDEM.map((s) => linhas.filter((l) => l.situacao === s)).flat().slice(0, 5);

  const carregando = radar.isLoading || fila.isLoading;

  return (
    <section aria-label={t("Clientes para agir")} className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-foreground">{t("Clientes para agir")}</h2>

      {carregando ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              [t("Recompra"), contagens.recompra],
              [t("Risco"), contagens.risco],
              [t("Oportunidades"), contagens.oportunidade],
              [t("Follow-up"), fila.isError ? null : vencidos.length],
            ] as const
          ).map(([rotulo, n]) => (
            <Card key={rotulo} className="hover-raise p-3">
              <p className="text-xs text-muted-foreground">{rotulo}</p>
              <p className="text-xl font-semibold tabular-nums">{n === null ? "—" : n}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="hover-raise space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">{t("Recompra, risco e oportunidade")}</h3>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/app/radar">{t("Abrir radar")}</Link>
            </Button>
          </div>
          {radar.isError ? (
            <p className="text-sm text-muted-foreground">{t("Não foi possível carregar agora.")}</p>
          ) : paraAgir.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Ninguém precisa de atenção agora.")}</p>
          ) : (
            <ul className="space-y-2">
              {paraAgir.map((l) => (
                <li key={l.contact_id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/app/contacts/${l.contact_id}`} className="hover:underline">
                    <span className="font-medium">{l.nome ?? t("Sem nome")}</span>
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {l.atraso_dias > 0 ? `+${l.atraso_dias}d` : `${l.dias_sem_compra}d`}
                    </span>
                    <Badge
                      variant={
                        l.situacao === "em_risco"
                          ? "error"
                          : l.situacao === "recompra_atrasada"
                            ? "warning"
                            : "info"
                      }
                    >
                      {ROTULO_RECOMPRA[l.situacao] ?? l.situacao}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="hover-raise space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">{t("Follow-ups vencidos")}</h3>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/app/ai/followups">{t("Ver fila")}</Link>
            </Button>
          </div>
          {fila.isError ? (
            <p className="text-sm text-muted-foreground">{t("Não foi possível carregar agora.")}</p>
          ) : vencidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Fila em dia.")}</p>
          ) : (
            <ul className="space-y-2">
              {vencidos.slice(0, 5).map((f) => (
                <li key={`${f.source}:${f.id}`} className="flex items-center justify-between gap-2 text-sm">
                  {f.contact?.id ? (
                    <Link href={`/app/contacts/${f.contact.id}`} className="hover:underline">
                      <span className="font-medium">{f.contact.name ?? t("Sem nome")}</span>
                    </Link>
                  ) : (
                    <span className="font-medium">{f.contact?.name ?? t("Sem cliente")}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {f.next_fire_at ? new Date(f.next_fire_at).toLocaleString() : t("sem hora")}
                    {f.flow_name ? ` · ${f.flow_name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}

export function SalesRadar() {
  const t = useT();
  const radar = useRadarDoDashboard();
  const contagens = contarPorGrupo(radar.data ?? []);

  return (
    <section aria-label={t("Sales radar")} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{t("Sales radar")}</h2>
        <Button size="sm" variant="ghost" asChild>
          <Link href="/app/radar">{t("Abrir radar")}</Link>
        </Button>
      </div>
      {radar.isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : radar.isError ? (
        <p className="text-sm text-muted-foreground">{t("Não foi possível carregar agora.")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="hover-raise p-4">
            <p className="text-xs text-muted-foreground">{t("Risco")}</p>
            <p className="text-xl font-semibold tabular-nums">{contagens.risco}</p>
          </Card>
          <Card className="hover-raise p-4">
            <p className="text-xs text-muted-foreground">{t("Oportunidade")}</p>
            <p className="text-xl font-semibold tabular-nums">{contagens.oportunidade}</p>
          </Card>
          <Card className="hover-raise p-4">
            <p className="text-xs text-muted-foreground">{t("Recompra")}</p>
            <p className="text-xl font-semibold tabular-nums">{contagens.recompra}</p>
          </Card>
        </div>
      )}
    </section>
  );
}

function brl(cents: number): string {
  return comoMoeda(cents, "BRL");
}

export function SalesRoadmap() {
  const t = useT();
  const roadmap = useQuery({
    queryKey: ["nexus", "roadmap-dashboard"],
    staleTime: 10 * 60_000,
    queryFn: () =>
      apiClient.get<{ data: RespostaRoadmap }>("/api/v1/roadmap").then((r) => r.data),
  });

  if (roadmap.isLoading) return <Skeleton className="h-64 w-full" aria-live="polite" />;
  if (roadmap.isError || !roadmap.data) {
    return (
      <section aria-label={t("Sales roadmap")} className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{t("Sales roadmap")}</h2>
        <p className="text-sm text-muted-foreground">{t("Não foi possível carregar agora.")}</p>
      </section>
    );
  }

  const dados = roadmap.data.meses.map((m) => ({
    rotulo: m.rotulo,
    realizado: m.realizado_cents,
    projecao: m.projecao_cents,
    meta: m.meta_cents,
  }));

  return (
    <section aria-label={t("Sales roadmap")} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{t("Sales roadmap")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("Realizado × meta; projeção só no mês em andamento.")}
        </span>
      </div>
      <Card className="hover-raise p-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval={0} angle={-20} height={52} />
              <YAxis
                tickFormatter={(v: number) => `${Math.round(v / 100 / 1000)}k`}
                tick={{ fontSize: 11 }}
                width={44}
              />
              <Tooltip formatter={(v) => brl(Math.round(Number(v ?? 0)))} />
              <Legend />
              <Bar dataKey="realizado" name={t("Realizado")} fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="projecao" name={t("Projeção")} fill="#93c5fd" radius={[4, 4, 0, 0]} />
              <Line
                dataKey="meta"
                name={t("Meta")}
                stroke="#16a34a"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {roadmap.data.amostra_parcial ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Amostra parcial: há mais pedidos do que a análise lê por vez.")}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
