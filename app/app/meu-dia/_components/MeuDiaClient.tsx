"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { CalendarBlank, ListChecks, Receipt, Sun } from "@/lib/ui/icons";
import type { SalesBrainItem } from "@/hooks/nexus/useSalesBrain";
import type { QueueRow } from "@/app/api/v1/ai/followups/queue/route";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

import {
  agruparDoDia,
  chaveDeAmanha,
  dataPorExtenso,
  limitesDeHojeEAmanha,
  limitesDoDia,
  saudacaoDoDia,
  type CompromissoDoDia,
  type TarefaDoDia,
} from "@/lib/meu-dia/dia";
import { LinhaDoTempo, type AcoesDaLinha } from "./LinhaDoTempo";

interface TarefaDaApi {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  contato_nome: string | null;
  agendada_para: string | null;
}

interface AgendamentoDaApi {
  id: string;
  titulo: string;
  iniciaEm: string;
  situacao: string;
  contatoNome: string | null;
}

/**
 * Bloco da coluna de contexto: quatro estados EXPLÍCITOS — carregando
 * (esqueleto), erro (mensagem + "Tentar de novo"), vazio (uma frase, sem
 * caixa) e lista. A versão anterior renderizava a caixa vazia com um parágrafo
 * de erro dentro do `<ul>` — o gate de "estados" da auditoria (§100) existe
 * justamente para isto.
 */
function Bloco({
  titulo,
  href,
  hrefLabel,
  loading,
  erro,
  erroTexto,
  onRetry,
  vazio,
  vazioTexto,
  children,
}: {
  titulo: string;
  href: string;
  hrefLabel: string;
  loading: boolean;
  erro: boolean;
  erroTexto: string;
  onRetry: () => void;
  vazio: boolean;
  vazioTexto: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section aria-label={titulo} className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">{titulo}</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href={href}>{hrefLabel}</Link>
        </Button>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </>
      ) : erro ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <p className="text-sm text-muted-foreground">{erroTexto}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("Tentar de novo")}
          </Button>
        </div>
      ) : vazio ? (
        <p className="text-sm text-muted-foreground">{vazioTexto}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

/**
 * Meu Dia (§21) — "o que preciso fazer agora?".
 *
 * Duas colunas no desktop (timeline | contexto), pilha única no mobile:
 *
 * - **Esquerda — a linha do tempo do dia**: tarefas MINHAS (as da equipe sem
 *   dono entram junto — ver o filtro `responsavel=minhas`) + compromissos da
 *   agenda do usuário, agrupados em Atrasado → Hoje → Amanhã → Mais tarde.
 *   As ações do dia (Concluir, Amanhã) acontecem aqui.
 * - **Direita — o contexto**: mensagens não-lidas que aguardam você,
 *   follow-ups ativos, recomendações do Brain (60s de paciência — o Brain
 *   pensa, o default de 10s do cliente o matava no timeout) e os atalhos do
 *   dia.
 *
 * Cada bloco tem fonte própria e falha isolada: uma query que morre não
 * derruba a tela. O relógio é o do NAVEGADOR (fuso de quem olha), por isso a
 * saudação e a data só existem depois do mount — a primeira pintura é igual
 * no servidor e no cliente, sem briga de hidratação.
 */
export function MeuDiaClient({ nome, userId }: { nome: string | null; userId: string }) {
  const t = useT();
  const qc = useQueryClient();

  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    // O relógio É um sistema externo: a primeira pintura tem de ser igual no
    // servidor e no cliente (sem a data/hora), e só depois do mount o fuso de
    // quem olha entra na cena. setState aqui é o padrão hidratação-segura —
    // a regra set-state-in-effect existe para render derivado de estado, não
    // para o primeiro batimento do relógio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAgora(new Date());
  }, []);

  // Recortes calculados UMA vez por montagem (fim de dia na aba aberta não
  // reescreve o ontem — refetch de madrugada pega o novo dia na próxima
  // abertura). `de`/`ate` são INSTANTES no fuso de quem olha, nunca o
  // filtro `dia` da rota (que corta em UTC).
  const janelaAgenda = useMemo(() => limitesDeHojeEAmanha(new Date()), []);
  const janelaHoje = useMemo(() => limitesDoDia(new Date()), []);

  const tarefas = useQuery({
    queryKey: ["meu-dia", "tarefas"],
    queryFn: () =>
      apiClient
        .get<{ data: TarefaDaApi[] }>("/api/v1/tarefas?status=pendente&responsavel=minhas")
        .then((r) => (Array.isArray(r.data) ? r.data : [])),
  });

  const agenda = useQuery({
    queryKey: ["meu-dia", "agenda", janelaAgenda.de, janelaAgenda.ate],
    queryFn: () => {
      const qs = new URLSearchParams({
        de: janelaAgenda.de,
        ate: janelaAgenda.ate,
        owner_user_id: userId,
      });
      return apiClient
        .get<{ data: AgendamentoDaApi[] }>(`/api/v1/agenda/agendamentos?${qs.toString()}`)
        .then((r) => (Array.isArray(r.data) ? r.data : []));
    },
  });

  const mensagens = useQuery({
    queryKey: ["meu-dia", "mensagens"],
    queryFn: () =>
      apiClient
        .get<{ data: ConversationWithContact[] }>(
          "/api/v1/conversations?assigned_to=me&exclude_finished=true&limit=50",
        )
        .then((r) => (Array.isArray(r.data) ? r.data : [])),
  });

  const followups = useQuery({
    queryKey: ["meu-dia", "followups"],
    queryFn: () =>
      apiClient
        .get<{ data: QueueRow[] }>("/api/v1/ai/followups/queue?status=active&limit=10")
        .then((r) => (Array.isArray(r.data) ? r.data : [])),
  });

  const brain = useQuery({
    queryKey: ["meu-dia", "brain"],
    // 60s: o Brain consulta LLMs. No default de 10s o cliente abortava o
    // pedido enquanto o backend seguia trabalhando — a tela dizia "erro" de
    // um conselho que chegaria 40s depois.
    queryFn: () =>
      apiClient
        .get<{ data: SalesBrainItem[] }>("/api/v1/sales-brain?limit=6", { timeoutMs: 60_000 })
        .then((r) => (Array.isArray(r.data) ? r.data : [])),
  });

  const pedidosHoje = useQuery({
    queryKey: ["meu-dia", "pedidos", janelaHoje.de, janelaHoje.ate],
    queryFn: () =>
      apiClient
        .get<{ data: unknown[] }>(
          `/api/v1/commercial-orders?de=${encodeURIComponent(janelaHoje.de)}&ate=${encodeURIComponent(janelaHoje.ate)}`,
        )
        .then((r) => (Array.isArray(r.data) ? r.data.length : 0)),
  });

  const concluir = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/v1/tarefas/${id}`, { status: "concluida" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["meu-dia", "tarefas"] }),
    onError: (e) => showApiError(e),
  });

  const adiar = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/api/v1/tarefas/${id}`, { agendada_para: chaveDeAmanha() }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["meu-dia", "tarefas"] }),
    onError: (e) => showApiError(e),
  });

  const linha = useMemo(
    () =>
      agruparDoDia({
        agora: agora ?? new Date(),
        tarefas: (tarefas.data ?? []).map((tar): TarefaDoDia => ({
          id: tar.id,
          titulo: tar.titulo,
          contato: tar.contato_nome,
          agendada_para: tar.agendada_para,
        })),
        compromissos: (agenda.data ?? []).map((a): CompromissoDoDia => ({
          id: a.id,
          titulo: a.titulo,
          contato: a.contatoNome,
          iniciaEm: a.iniciaEm,
          situacao: a.situacao,
        })),
      }),
    [agora, tarefas.data, agenda.data],
  );

  const linhaVazia =
    linha.atrasado.length === 0 &&
    linha.hoje.length === 0 &&
    linha.amanha.length === 0 &&
    linha.depois.length === 0;

  const carregandoDia = tarefas.isLoading || agenda.isLoading;
  const erroDia = tarefas.isError || agenda.isError;
  const recarregarDia = () => {
    void tarefas.refetch();
    void agenda.refetch();
  };

  const naoLidas = (mensagens.data ?? [])
    .filter((c) => (c.unread_count_for_assignee ?? 0) > 0)
    .slice(0, 3);
  const listaFollow = (followups.data ?? []).slice(0, 6);
  const listaBrain = (brain.data ?? []).slice(0, 6);

  const listas = [tarefas, agenda, mensagens, followups, brain, pedidosHoje];
  const tudoOk = listas.every((q) => !q.isLoading);
  const algumErro = listas.some((q) => q.isError);
  const diaLimpo =
    tudoOk &&
    !algumErro &&
    linhaVazia &&
    naoLidas.length === 0 &&
    listaFollow.length === 0 &&
    listaBrain.length === 0;

  const titulo = agora
    ? `${saudacaoDoDia(agora)}${nome ? `, ${nome}` : ""}`
    : t("Meu Dia");
  const plural = (n: number, um: string, muitos: string): string =>
    `${n} ${n === 1 ? um : muitos}`;
  const resumo = [
    linha.atrasado.length > 0 ? plural(linha.atrasado.length, "atrasada", "atrasadas") : null,
    linha.hoje.length > 0 ? `${linha.hoje.length} hoje` : null,
    linha.amanha.length > 0 ? `${linha.amanha.length} amanhã` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const subtitulo = agora ? [dataPorExtenso(agora), resumo].filter(Boolean).join(" · ") : undefined;

  const acoes: AcoesDaLinha = {
    concluindoId: concluir.isPending ? (concluir.variables ?? null) : null,
    adiandoId: adiar.isPending ? (adiar.variables ?? null) : null,
    onConcluir: (id) => concluir.mutate(id),
    onAdiar: (id) => adiar.mutate(id),
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <NexusPageHeader title={titulo} subtitle={subtitulo} />

      {diaLimpo ? (
        <Card className="p-2">
          <NexusEmptyState
            icon={Sun}
            headline={t("Dia limpo")}
            subcopy={t("Nada pendente, nenhuma mensagem, nenhum follow-up e nenhuma recomendação à vista.")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <LinhaDoTempo
            linha={linha}
            loading={carregandoDia}
            erro={erroDia}
            onRetry={recarregarDia}
            acoes={acoes}
          />

          <aside className="space-y-6" aria-label={t("Contexto do dia")}>
            <Bloco
              titulo={t("Mensagens")}
              href="/app/inbox"
              hrefLabel={t("Abrir inbox")}
              loading={mensagens.isLoading}
              erro={mensagens.isError}
              erroTexto={t("Não consegui ler as mensagens.")}
              onRetry={() => void mensagens.refetch()}
              vazio={naoLidas.length === 0}
              vazioTexto={t("Nenhuma mensagem não lida para você.")}
            >
              {naoLidas.map((c) => (
                <li key={c.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-text">
                      {c.contacts?.display_name ?? c.contacts?.name ?? t("Sem nome")}
                    </p>
                    <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">
                      {c.unread_count_for_assignee}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.last_message_preview ?? t("Sem prévia da mensagem")}
                  </p>
                  <Link
                    href={`/app/inbox?id=${c.id}`}
                    className="mt-1 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("Responder")}
                  </Link>
                </li>
              ))}
            </Bloco>

            <Bloco
              titulo={t("Follow-ups ativos")}
              href="/app/ai/followups"
              hrefLabel={t("Ver fila")}
              loading={followups.isLoading}
              erro={followups.isError}
              erroTexto={t("Não consegui ler os follow-ups.")}
              onRetry={() => void followups.refetch()}
              vazio={listaFollow.length === 0}
              vazioTexto={t("Nenhum follow-up ativo agora.")}
            >
              {listaFollow.map((f) => (
                <li key={`${f.source}-${f.id}`} className="rounded-lg border border-border bg-surface p-3">
                  <p className="truncate text-sm font-medium text-text">{f.flow_name ?? t("Fluxo")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.contact.name} · {f.node_or_reason}
                  </p>
                </li>
              ))}
            </Bloco>

            <Bloco
              titulo={t("Recomendações")}
              href="/app/inteligencia"
              hrefLabel={t("Ver inteligência")}
              loading={brain.isLoading}
              erro={brain.isError}
              erroTexto={t("Não consegui ler as recomendações.")}
              onRetry={() => void brain.refetch()}
              vazio={listaBrain.length === 0}
              vazioTexto={t("Nenhuma recomendação agora.")}
            >
              {listaBrain.map((r) => (
                <li key={r.contact_id} className="rounded-lg border border-border bg-surface p-3">
                  {r.contact_name ? (
                    <p className="truncate text-sm font-medium text-text">{r.contact_name}</p>
                  ) : null}
                  <p className="text-sm text-text">{r.recomendacao}</p>
                  <Link
                    href={`/app/contacts/${r.contact_id}`}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("Ver cliente")}
                  </Link>
                </li>
              ))}
            </Bloco>

            <section aria-label={t("Pedidos e atalhos")} className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-surface p-3">
                  <Receipt className="mb-1 size-4 text-muted-foreground" aria-hidden />
                  <p className="text-lg font-semibold text-text">
                    {pedidosHoje.isLoading ? "—" : (pedidosHoje.data ?? 0)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t("Pedidos hoje")}</p>
                </div>
                <Link
                  href="/app/tarefas"
                  className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-accent"
                >
                  <ListChecks className="mb-1 size-4 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium text-text">{t("Tarefas")}</p>
                  <p className="truncate text-xs text-muted-foreground">{t("Ver todas")}</p>
                </Link>
                <Link
                  href="/app/agenda"
                  className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-accent"
                >
                  <CalendarBlank className="mb-1 size-4 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium text-text">{t("Agenda")}</p>
                  <p className="truncate text-xs text-muted-foreground">{t("Ver semana")}</p>
                </Link>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
