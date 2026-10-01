"use client";

import * as React from "react";
import {
  ArrowsClockwise,
  ArrowUUpLeft,
  EyeSlash,
  HandPalm,
  Pause,
  Play,
  Plus,
  Trash,
} from "@phosphor-icons/react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";

/**
 * Tela da Venda Automática (spec 18 §21–§25): lista de campanhas à esquerda,
 * painel + fila + timeline à direita. Tudo que muda passa pelas rotas
 * `/api/v1/automatic-sales/*` — nada de mutação local fingindo estado.
 */
export interface CampanhaVa {
  id: string;
  nome: string;
  status: string;
  cidade: string;
  uf: string | null;
  categorias: string[];
  limite_diario: number;
  janela_inicio: string;
  janela_fim: string;
  followup_horas: number[];
  perfil_abordagem: string | null;
  created_at: string;
}

interface LinhaFila {
  id: string;
  status: string;
  interest_level: string | null;
  followup_count: number;
  proximo_followup_at: string | null;
  ultima_mensagem_at: string | null;
  rejection_reason: string | null;
  snapshot: { nome?: string; categoria?: string };
  created_at: string;
}

interface Resumo {
  dia: string;
  limite_diario: number;
  consumidos_hoje: number;
  restante_hoje: number;
  pendentes: number;
  total: number;
  contatados: number;
  responderam: number;
  taxa_resposta_pct: number;
  leads_criados: number;
  oportunidades: number;
}

interface Evento {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const ROTULOS_DE_STATUS: Record<string, string> = {
  discovered: "Descoberto",
  qualified: "Qualificado",
  queued: "Na fila",
  contacting: "Enviando",
  contacted: "Contatado",
  responded: "Respondeu",
  qualified_lead: "Lead qualificado",
  opportunity: "Oportunidade",
  order: "Pedido",
  no_response: "Sem resposta",
  not_interested: "Não interessado",
  invalid_contact: "Contato inválido",
  failed: "Falhou",
};

const ROTULOS_DE_EVENTO: Record<string, string> = {
  inserida: "Entrou na fila",
  descartada: "Descartada na triagem",
  enviada: "Primeira mensagem enviada",
  followup_enviado: "Follow-up enviado",
  sem_followup: "Sem follow-up (fim da sequência)",
  classificada: "Resposta classificada",
  humano_assumiu: "Humano assumiu",
  ignorada: "Ignorada por operador",
  bloqueado: "Bloqueado (opt-out)",
  reenfileirada: "Reenfileirada",
  sem_sessao: "Sem sessão de canal",
  sem_modelo: "Sem modelo/LLM configurado",
  sem_funil: "Sem funil de entrada",
  falha_envio: "Falha no envio",
  cota_esgotada: "Cota diária esgotada",
};

function rotulo(status: string, mapa: Record<string, string>, t: (s: string) => string): string {
  return t(mapa[status] ?? status);
}

function quando(iso: string, tagIdioma: string): string {
  try {
    return new Date(iso).toLocaleString(tagIdioma, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export interface TextosVa {
  titulo: string;
  subtitulo: string;
  novaCampanha: string;
  nenhuma: string;
  cotaHoje: string;
  fila: string;
  resumo: string;
  timeline: string;
  pausar: string;
  retomar: string;
  excluir: string;
  ignorar: string;
  bloquear: string;
  reenfileirar: string;
  assumir: string;
  recarregar: string;
  vazio: string;
  semEventos: string;
}

export function VendaAutomaticaClient({
  campanhasIniciais,
  podeOperar,
  podeGerenciar,
  textos,
}: {
  campanhasIniciais: CampanhaVa[];
  podeOperar: boolean;
  podeGerenciar: boolean;
  textos: TextosVa;
}) {
  const t = useT();
  const confirmar = useConfirmar();
  const tagIdioma = useTagDeIdioma();
  const [campanhas, setCampanhas] = React.useState<CampanhaVa[]>(campanhasIniciais);
  const [selecionada, setSelecionada] = React.useState<string | null>(null);
  const [resumo, setResumo] = React.useState<Resumo | null>(null);
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [fila, setFila] = React.useState<LinhaFila[]>([]);
  const [filtro, setFiltro] = React.useState<string>("todos");
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState(false);
  const [dialogoAberto, setDialogoAberto] = React.useState(false);

  async function carregar(id: string, statusFiltro = filtro): Promise<void> {
    setCarregando(true);
    setErro(false);
    try {
      const painel = await apiClient.get<{ data: { resumo: Resumo; eventos: Evento[] } | null }>(
        `/api/v1/automatic-sales/campaigns/${id}/painel`,
      );
      const p = painel?.data;
      setResumo(p?.resumo ?? null);
      setEventos(p?.eventos ?? []);
      const url =
        `/api/v1/automatic-sales/campaigns/${id}/queue` +
        (statusFiltro !== "todos" ? `?status=${encodeURIComponent(statusFiltro)}` : "");
      const lista = await apiClient.get<{ data: LinhaFila[] | null }>(url);
      setFila(Array.isArray(lista?.data) ? lista.data : []);
    } catch (e) {
      setErro(true);
      showApiError(e);
    } finally {
      setCarregando(false);
    }
  }

  async function recarregarCampanhas(): Promise<void> {
    try {
      const corpo = await apiClient.get<{ data: CampanhaVa[] | null }>(
        "/api/v1/automatic-sales/campaigns",
      );
      setCampanhas(Array.isArray(corpo?.data) ? corpo.data : []);
    } catch (e) {
      showApiError(e);
    }
  }

  function selecionar(id: string): void {
    setSelecionada(id);
    setResumo(null);
    setFila([]);
    setEventos([]);
    void carregar(id, "todos");
    setFiltro("todos");
  }

  async function alternarStatus(c: CampanhaVa): Promise<void> {
    const novo = c.status === "active" ? "paused" : "active";
    try {
      await apiClient.patch(`/api/v1/automatic-sales/campaigns/${c.id}`, { status: novo });
      toast.success(t(novo === "active" ? "Campanha retomada" : "Campanha pausada"));
      await recarregarCampanhas();
      if (selecionada === c.id) await carregar(c.id);
    } catch (e) {
      showApiError(e);
    }
  }

  async function excluir(c: CampanhaVa): Promise<void> {
    const aprovado = await confirmar({
      title: t(`Excluir a campanha "${c.nome}" e toda a fila dela?`),
      confirmLabel: t("Excluir"),
    });
    if (!aprovado) return;
    try {
      await apiClient.delete(`/api/v1/automatic-sales/campaigns/${c.id}`);
      toast.success(t("Campanha excluída"));
      if (selecionada === c.id) {
        setSelecionada(null);
        setResumo(null);
        setFila([]);
        setEventos([]);
      }
      await recarregarCampanhas();
    } catch (e) {
      showApiError(e);
    }
  }

  async function agirNaLinha(
    linha: LinhaFila,
    acao: "ignorar" | "bloquear" | "reenfileirar" | "assumir",
  ): Promise<void> {
    try {
      await apiClient.post<{ data: unknown }>(`/api/v1/automatic-sales/queue/${linha.id}`, { acao });
      toast.success(t(`Ação "${rotulo(acao, {}, t)}" aplicada`));
      if (selecionada) await carregar(selecionada, filtro);
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{textos.titulo}</h1>
          <p className="text-sm text-muted-foreground">{textos.subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          {selecionada && (
            <Button variant="outline" size="sm" onClick={() => void carregar(selecionada)}>
              <ArrowsClockwise className="h-4 w-4" />
              {textos.recarregar}
            </Button>
          )}
          {podeOperar && (
            <Button size="sm" onClick={() => setDialogoAberto(true)}>
              <Plus className="h-4 w-4" />
              {textos.novaCampanha}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <section aria-label={textos.titulo} className="space-y-2">
          {campanhas.length === 0 ? (
            <NexusEmptyState icon={Play} headline={textos.nenhuma} />
          ) : (
            <ul className="space-y-2">
              {campanhas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selecionar(c.id)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent-soft/40 ${
                      selecionada === c.id ? "border-accent bg-accent-soft/60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <strong className="truncate">{c.nome}</strong>
                      <Badge
                        variant={
                          c.status === "active"
                            ? "success"
                            : c.status === "paused"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {rotulo(c.status, { active: "Ativa", paused: "Pausada", completed: "Concluída" }, t)}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {c.cidade}
                      {c.uf ? `/${c.uf}` : ""} · {t("cota")} {c.limite_diario}/{t("dia")} ·{" "}
                      {c.janela_inicio}–{c.janela_fim}
                      {c.categorias.length > 0 ? ` · ${c.categorias.join(", ")}` : ""}
                    </div>
                    {podeGerenciar && (
                      <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => void alternarStatus(c)}
                        >
                          {c.status === "active" ? (
                            <>
                              <Pause className="h-3 w-3" /> {textos.pausar}
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" /> {textos.retomar}
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => void excluir(c)}
                        >
                          <Trash className="h-3 w-3" /> {textos.excluir}
                        </Button>
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={textos.resumo} className="space-y-4">
          {!selecionada ? (
            <NexusEmptyState icon={Play} headline={t("Escolha uma campanha para ver o painel.")} />
          ) : erro ? (
            <NexusErrorState onRetry={() => void carregar(selecionada)} />
          ) : carregando && !resumo ? (
            <div className="space-y-2" aria-live="polite">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              {resumo && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Cardz rotulo={textos.cotaHoje} valor={`${resumo.consumidos_hoje}/${resumo.limite_diario}`} />
                  <Cardz rotulo={t("Na fila")} valor={String(resumo.pendentes)} />
                  <Cardz rotulo={t("Contatados")} valor={String(resumo.contatados)} />
                  <Cardz rotulo={t("Responderam")} valor={`${resumo.taxa_resposta_pct}%`} />
                  <Cardz rotulo={t("Leads")} valor={String(resumo.leads_criados)} />
                  <Cardz rotulo={t("Oportunidades")} valor={String(resumo.oportunidades)} />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t("Filtro da fila")}</Label>
                <Select
                  value={filtro}
                  onValueChange={(v) => {
                    setFiltro(v);
                    void carregar(selecionada, v);
                  }}
                >
                  <SelectTrigger className="h-8 w-52 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t("Todos")}</SelectItem>
                    <SelectItem value="queued">{t("Na fila")}</SelectItem>
                    <SelectItem value="contacted">{t("Aguardando resposta")}</SelectItem>
                    <SelectItem value="responded">{t("Responderam")}</SelectItem>
                    <SelectItem value="failed">{t("Falhas")}</SelectItem>
                    <SelectItem value="not_interested">{t("Não interessados")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border">
                {fila.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">{textos.vazio}</p>
                ) : (
                  <ul className="divide-y">
                    {fila.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {l.snapshot?.nome || t("(sem nome)")}
                            </span>
                            <Badge variant="neutral">{rotulo(l.status, ROTULOS_DE_STATUS, t)}</Badge>
                            {l.interest_level && (
                              <Badge
                                variant={
                                  l.interest_level === "alto"
                                    ? "success"
                                    : l.interest_level === "recusou"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {rotulo(
                                  l.interest_level,
                                  { alto: "Alto", medio: "Médio", baixo: "Baixo", recusou: "Recusou" },
                                  t,
                                )}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {l.snapshot?.categoria ? `${l.snapshot.categoria} · ` : ""}
                            {t("follow-ups")}: {l.followup_count}
                            {l.proximo_followup_at ? ` · ${quando(l.proximo_followup_at, tagIdioma)}` : ""}
                            {l.rejection_reason ? ` · ${l.rejection_reason}` : ""}
                          </div>
                        </div>
                        {podeOperar && (
                          <div className="flex flex-wrap gap-1">
                            <MiniAcao onClick={() => void agirNaLinha(l, "ignorar")}>
                              <EyeSlash className="h-3 w-3" /> {textos.ignorar}
                            </MiniAcao>
                            <MiniAcao onClick={() => void agirNaLinha(l, "bloquear")}>
                              <HandPalm className="h-3 w-3" /> {textos.bloquear}
                            </MiniAcao>
                            {l.status === "failed" && (
                              <MiniAcao onClick={() => void agirNaLinha(l, "reenfileirar")}>
                                <ArrowUUpLeft className="h-3 w-3" /> {textos.reenfileirar}
                              </MiniAcao>
                            )}
                            {l.status === "contacted" && (
                              <MiniAcao onClick={() => void agirNaLinha(l, "assumir")}>
                                <HandPalm className="h-3 w-3" /> {textos.assumir}
                              </MiniAcao>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h2 className="mb-2 text-sm font-medium">{textos.timeline}</h2>
                {eventos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{textos.semEventos}</p>
                ) : (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {eventos.slice(0, 50).map((ev) => (
                      <li key={ev.id} className="flex gap-2">
                        <span className="w-32 shrink-0">{quando(ev.created_at, tagIdioma)}</span>
                        <span className="text-foreground">
                          {rotulo(ev.event_type, ROTULOS_DE_EVENTO, t)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <DialogNovo
        aberto={dialogoAberto}
        aoFechar={() => setDialogoAberto(false)}
        aoCriar={(id) => {
          setDialogoAberto(false);
          void recarregarCampanhas().then(() => selecionar(id));
        }}
        textos={textos}
      />
    </div>
  );
}

function Cardz({ rotulo: r, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{r}</div>
      <div className="text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

function MiniAcao({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onClick}>
      {children}
    </Button>
  );
}

function DialogNovo({
  aberto,
  aoFechar,
  aoCriar,
  textos,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: (id: string) => void;
  textos: TextosVa;
}) {
  const t = useT();
  const [salvando, setSalvando] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [cidade, setCidade] = React.useState("");
  const [uf, setUf] = React.useState("");
  const [categorias, setCategorias] = React.useState("");
  const [limite, setLimite] = React.useState("30");
  const [inicio, setInicio] = React.useState("09:00");
  const [fim, setFim] = React.useState("17:30");
  const [fu24, setFu24] = React.useState(true);
  const [fu48, setFu48] = React.useState(true);

  async function salvar(): Promise<void> {
    setSalvando(true);
    try {
      const corpo = await apiClient.post<{ data: { id: string } | null }>(
        "/api/v1/automatic-sales/campaigns",
        {
          nome: nome.trim(),
          cidade: cidade.trim(),
          uf: uf.trim() ? uf.trim().toUpperCase() : null,
          categorias: categorias
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          limite_diario: Number(limite),
          janela_inicio: inicio,
          janela_fim: fim,
          followup_horas: [fu24 ? 24 : null, fu48 ? 48 : null].filter((h): h is number => h !== null),
        },
      );
      const id = corpo?.data?.id;
      toast.success(t("Campanha criada"));
      setNome("");
      setCidade("");
      setUf("");
      setCategorias("");
      if (id) aoCriar(id);
      else aoFechar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{textos.novaCampanha}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="va-nome">{t("Nome")}</Label>
            <Input id="va-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div className="space-y-1">
              <Label htmlFor="va-cidade">{t("Cidade")}</Label>
              <Input id="va-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="va-uf">{t("UF")}</Label>
              <Input
                id="va-uf"
                maxLength={2}
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="va-cat">{t("Categorias (separadas por vírgula)")}</Label>
            <Input id="va-cat" value={categorias} onChange={(e) => setCategorias(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="va-limite">{t("Cota/dia")}</Label>
              <Input
                id="va-limite"
                type="number"
                min={1}
                max={500}
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="va-inicio">{t("Início")}</Label>
              <Input id="va-inicio" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="va-fim">{t("Fim")}</Label>
              <Input id="va-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fu24}
                onChange={(e) => setFu24(e.target.checked)}
              />
              {t("Follow-up 24h")}
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fu48}
                onChange={(e) => setFu48(e.target.checked)}
              />
              {t("Follow-up 48h")}
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={aoFechar}>
              {t("Cancelar")}
            </Button>
            <Button onClick={() => void salvar()} disabled={salvando || !nome.trim() || !cidade.trim()}>
              {t("Criar")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
