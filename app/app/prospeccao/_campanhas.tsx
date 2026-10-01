"use client";

import * as React from "react";
import { Megaphone, PencilSimple } from "@phosphor-icons/react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { comoMoeda } from "@/lib/format/moeda";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";
import type { FunilDaCampanha } from "@/lib/prospeccao/funil";
import { CampanhaWizard } from "./_campanha-wizard";

/**
 * Aba CAMPANHAS — painel de funil (§28), não lista técnica.
 *
 * As DUAS campanhas do produto aparecem juntas (D2, sem terceira tabela):
 * descoberta (`prospecting_campaigns`) e venda automática
 * (`automatic_sales_campaigns`). Cada card traz Nome, Objetivo (editável no
 * lugar), Região, Categorias, os KPIs que a spec lista e o funil
 * Encontrados → Selecionados → Contatados → Responderam → Qualificados →
 * Oportunidades → Pedidos + Faturamento — tudo vindo dos painéis de cada
 * tipo, que já calculam do banco real.
 */
interface CampanhaDescoberta {
  id: string;
  nome: string;
  objetivo: string | null;
  categorias: string[];
  cidades: { cidade: string; estado?: string }[];
  status: string;
  recorrencia_dias: number | null;
  ultima_execucao_at: string | null;
}

interface CampanhaVa {
  id: string;
  nome: string;
  objetivo: string | null;
  status: string;
  cidade: string;
  uf: string | null;
  categorias: string[];
}

type CardCampanha =
  | { tipo: "descoberta"; campanha: CampanhaDescoberta }
  | { tipo: "va"; campanha: CampanhaVa };

/**
 * O status da campanha nunca chega cru à tela (`rascunho`/`ativa`/`concluida`
 * são vocabulário interno, não texto para o usuário).
 */
function rotuloDaCampanha(status: string, t: (texto: string) => string): string {
  if (status === "ativa" || status === "active") return t("Ativa");
  if (status === "concluida" || status === "completed") return t("Concluída");
  if (status === "paused" || status === "pausada") return t("Pausada");
  return t("Rascunho");
}

const ESTAGIOS: { chave: keyof FunilDaCampanha; rotulo: (t: (s: string) => string) => string }[] = [
  { chave: "encontrados", rotulo: (t) => t("Encontrados") },
  { chave: "selecionados", rotulo: (t) => t("Selecionados") },
  { chave: "contatados", rotulo: (t) => t("Contatados") },
  { chave: "responderam", rotulo: (t) => t("Responderam") },
  { chave: "qualificados", rotulo: (t) => t("Qualificados") },
  { chave: "oportunidades", rotulo: (t) => t("Oportunidades") },
  { chave: "pedidos", rotulo: (t) => t("Pedidos") },
];

function ObjetivoInline({
  valor,
  rota,
  salvo,
}: {
  valor: string | null;
  rota: string;
  salvo: (novo: string | null) => void;
}) {
  const t = useT();
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(valor ?? "");

  async function salvar() {
    const novo = texto.trim();
    try {
      await apiClient.patch(rota, { objetivo: novo === "" ? null : novo });
      salvo(novo === "" ? null : novo);
      setEditando(false);
    } catch (e) {
      showApiError(e);
    }
  }

  if (!editando) {
    return (
      <button
        type="button"
        className="flex items-start gap-1.5 text-left text-sm text-muted-foreground hover:text-foreground"
        onClick={() => {
          setTexto(valor ?? "");
          setEditando(true);
        }}
      >
        <span>{valor || t("Sem objetivo ainda.")}</span>
        <PencilSimple size={12} className="mt-1 shrink-0" aria-hidden />
        <span className="sr-only">{t("Editar objetivo")}</span>
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        autoFocus
        value={texto}
        maxLength={300}
        placeholder={t("Objetivo desta campanha…")}
        aria-label={t("Objetivo")}
        className="h-8 max-w-md text-sm"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void salvar();
          if (e.key === "Escape") setEditando(false);
        }}
      />
      <Button size="sm" onClick={() => void salvar()}>
        {t("Salvar")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
        {t("Cancelar")}
      </Button>
    </div>
  );
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

function Funil({ funil }: { funil: FunilDaCampanha }) {
  const t = useT();
  const maximo = Math.max(1, ...ESTAGIOS.map((e) => funil[e.chave]));
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{t("Funil")}</p>
      <ul className="space-y-1.5">
        {ESTAGIOS.map((e) => {
          const valor = funil[e.chave];
          return (
            <li key={e.chave} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 text-muted-foreground">{e.rotulo(t)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(valor > 0 ? 4 : 0, (valor / maximo) * 100)}%` }}
                />
              </span>
              <span className="w-12 shrink-0 text-right font-medium tabular-nums">{valor}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CampanhasTab({
  categorias,
  podeOperar,
}: {
  categorias: MacroCategoria[];
  podeOperar: boolean;
}) {
  const t = useT();
  const [descobertas, setDescobertas] = React.useState<CampanhaDescoberta[] | null>(null);
  const [vas, setVas] = React.useState<CampanhaVa[] | null>(null);
  const [funis, setFunis] = React.useState<Record<string, FunilDaCampanha>>({});
  const [erro, setErro] = React.useState(false);

  const carregarPaineis = React.useCallback(async (cards: CardCampanha[]) => {
    const resultados = await Promise.all(
      cards.map(async (card) => {
        try {
          const rota =
            card.tipo === "descoberta"
              ? `/api/v1/prospecting/campaigns/${card.campanha.id}/painel`
              : `/api/v1/automatic-sales/campaigns/${card.campanha.id}/painel`;
          const corpo = await apiClient.get<{ data: { funil?: FunilDaCampanha } | null }>(rota);
          const funil = corpo?.data?.funil;
          return funil ? ([card.campanha.id, funil] as const) : null;
        } catch {
          // Uma campanha sem painel não derruba o resto da aba (não poluir
          // a tela com N toasts: o card fica com "—" e o resto carrega).
          return null;
        }
      }),
    );
    const mapa: Record<string, FunilDaCampanha> = {};
    for (const par of resultados) if (par) mapa[par[0]] = par[1];
    setFunis((atual) => ({ ...atual, ...mapa }));
  }, []);

  const recarregar = React.useCallback(async () => {
    try {
      const [resDesc, resVa] = await Promise.all([
        apiClient.get<{ data: unknown }>("/api/v1/prospecting/campaigns"),
        apiClient.get<{ data: unknown }>("/api/v1/automatic-sales/campaigns"),
      ]);
      const listaDesc = ((resDesc as { data?: unknown } | null)?.data ?? []) as CampanhaDescoberta[];
      const listaVa = ((resVa as { data?: unknown } | null)?.data ?? []) as CampanhaVa[];
      setDescobertas(Array.isArray(listaDesc) ? listaDesc : []);
      setVas(Array.isArray(listaVa) ? listaVa : []);
      setErro(false);
      const cards: CardCampanha[] = [
        ...(Array.isArray(listaDesc) ? listaDesc : []).map((campanha) => ({ tipo: "descoberta" as const, campanha })),
        ...(Array.isArray(listaVa) ? listaVa : []).map((campanha) => ({ tipo: "va" as const, campanha })),
      ];
      if (cards.length > 0) await carregarPaineis(cards);
    } catch (e) {
      setErro(true);
      showApiError(e);
    }
  }, [carregarPaineis]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  async function executar(id: string) {
    try {
      const corpo = await apiClient.post<{ data: { buscas: number; sem_mapa: string[] } | null }>(
        `/api/v1/prospecting/campaigns/${id}/executar`,
        {},
      );
      const r = corpo?.data ?? { buscas: 0, sem_mapa: [] as string[] };
      toast.success(t(`${r.buscas} buscas criadas`));
      if (Array.isArray(r.sem_mapa) && r.sem_mapa.length > 0)
        toast.warning(t(`Sem mapa: ${r.sem_mapa.join(", ")}`));
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  const cards: CardCampanha[] = [
    ...(descobertas ?? []).map((campanha) => ({ tipo: "descoberta" as const, campanha })),
    ...(vas ?? []).map((campanha) => ({ tipo: "va" as const, campanha })),
  ];
  const carregando = descobertas === null || vas === null;

  return (
    <div className="space-y-4">
      {podeOperar && (
        <CampanhaWizard categorias={categorias} aoConcluir={() => void recarregar()} />
      )}

      {erro && carregando ? (
        <NexusErrorState onRetry={() => void recarregar()} />
      ) : carregando ? (
        <div className="space-y-2" aria-live="polite">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : cards.length === 0 ? (
        <NexusEmptyState icon={Megaphone} headline={t("Nenhuma campanha ainda.")} />
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => {
            const id = card.campanha.id;
            const funil = funis[id];
            const rotaPatch =
              card.tipo === "descoberta"
                ? `/api/v1/prospecting/campaigns/${id}`
                : `/api/v1/automatic-sales/campaigns/${id}`;
            const regiao =
              card.tipo === "descoberta"
                ? card.campanha.cidades
                    .map((c) => (c.estado ? `${c.cidade}/${c.estado}` : c.cidade))
                    .join(", ")
                : `${card.campanha.cidade}${card.campanha.uf ? `/${card.campanha.uf}` : ""}`;
            const objetivo = card.campanha.objetivo;
            const atualizarObjetivo = (novo: string | null) => {
              if (card.tipo === "descoberta") {
                setDescobertas((lista) =>
                  (lista ?? []).map((c) => (c.id === id ? { ...c, objetivo: novo } : c)),
                );
              } else {
                setVas((lista) => (lista ?? []).map((c) => (c.id === id ? { ...c, objetivo: novo } : c)));
              }
            };
            return (
              <li key={id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{card.campanha.nome}</strong>
                    <Badge variant="secondary" className="h-5 px-2 text-xs font-normal">
                      {card.tipo === "descoberta" ? t("Descoberta") : t("Venda automática")}
                    </Badge>
                    <Badge variant="outline" className="h-5 px-2 text-xs font-normal">
                      {rotuloDaCampanha(card.campanha.status, t)}
                    </Badge>
                    {card.tipo === "descoberta" &&
                      podeOperar &&
                      card.campanha.status !== "concluida" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => void executar(id)}
                        >
                          {t("Executar")}
                        </Button>
                      )}
                  </div>

                  <ObjetivoInline valor={objetivo} rota={rotaPatch} salvo={atualizarObjetivo} />

                  <p className="text-xs text-muted-foreground">
                    {t("Região")}: {regiao || "—"} · {t("Categorias")}:{" "}
                    {card.campanha.categorias.join(", ") || "—"}
                  </p>

                  {funil ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <Kpi rotulo={t("Quantidade de prospects")} valor={String(funil.encontrados)} />
                        <Kpi rotulo={t("Contatados")} valor={String(funil.contatados)} />
                        <Kpi rotulo={t("Respostas")} valor={String(funil.responderam)} />
                        <Kpi rotulo={t("Oportunidades")} valor={String(funil.oportunidades)} />
                        <Kpi rotulo={t("Pedidos")} valor={String(funil.pedidos)} />
                        <Kpi rotulo={t("Faturamento")} valor={comoMoeda(funil.faturamento_cents, "BRL")} />
                      </div>
                      <Funil funil={funil} />
                    </>
                  ) : (
                    <div aria-live="polite">
                      <Skeleton className="h-16 w-full" />
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
