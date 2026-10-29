"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { format, isToday, isYesterday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WA } from "@/components/inbox/whatsapp-theme";
import { BTN_REF, BTN_REF_SEC } from "@/components/inbox/estilos-da-referencia";
import { MessageBubble } from "./MessageBubble";
import { NoteCard } from "./NoteCard";
import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";
import { useConversationNotes } from "@/hooks/inbox/useConversationNotes";
import { useDeleteNote } from "@/hooks/inbox/useDeleteNote";
import { useDebugToggle } from "@/hooks/ai/useDebugToggle";
import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { CaretDown } from "@/lib/ui/icons";
import type { Message, Note } from "@/lib/types/messaging";

interface Props {
  conversationId: string | null;
  /** Escolher uma mensagem para responder. Sobe até o composer. */
  onResponder?: (m: Message) => void;
}

/** Onda 5.2: union de item do thread — mensagem real ou nota interna (nunca vai ao cliente). */
export type ThreadItem =
  { kind: "message"; ts: string; data: Message } | { kind: "note"; ts: string; data: Note };

/** `null`/vazio/inválido não ordena: vai para o começo na leitura cronológica. */
function instante(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * Intercala mensagens e notas por timestamp asc (puro, sem I/O — testado em
 * thread-merge.test.ts).
 *
 * ─── O QUE MUDOU, E POR QUÊ ────────────────────────────────────────────────
 *
 * Antes: concatenava as páginas e ordenava só por `ts`. Duas coisas ficavam
 * de fora, e as duas aparecem na tela como "mensagem fora de ordem":
 *
 *   1. **Empate de instante.** Várias mensagens do mesmo segundo saíam na
 *      ordem em que o `flatMap` as juntou — isto é, a ordem das PÁGINAS, não a
 *      do banco. Duas mensagens trocadas trocavam de lugar a cada refetch.
 *      O desempate agora é o mesmo da consulta: `id` asc (o servidor pagina
 *      por `sent_at desc, id desc` e inverte a página).
 *   2. **Borda de página.** Realtime + refetch podem sobrepor a fronteira de
 *      duas páginas e a mesma mensagem entrar duas vezes. Duplicata no meio
 *      da conversa não parece "duplicata", parece desordem. Deduplicar por
 *      `kind:id` — a primeira ocorrência, que vem da página mais nova.
 *
 * A ordem final é CRONOLÓGICA (antiga em cima, nova embaixo), como no
 * WhatsApp: é o rodapé que está sempre à vista quando a conversa abre.
 */
export function mergeThreadItems(messages: Message[], notes: Note[]): ThreadItem[] {
  const vistos = new Set<string>();
  const items: ThreadItem[] = [];

  for (const data of messages) {
    const chave = `message:${data.id}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    items.push({ kind: "message", ts: data.sent_at, data });
  }
  for (const data of notes) {
    const chave = `note:${data.id}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    items.push({ kind: "note", ts: data.created_at, data });
  }

  // Sort estável (Array#sort é estável no V8/Node) com desempate EXPLÍCITO:
  // instante, depois mensagem antes de nota (a nota é um comentário sobre o
  // que acabou de acontecer), depois id.
  items.sort((a, b) => {
    const ta = instante(a.ts);
    const tb = instante(b.ts);
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "message" ? -1 : 1;
    return a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0;
  });
  return items;
}

function dayLabel(
  d: Date,
  t: (texto: string) => string = (texto) => texto,
  locale: Locale,
): string {
  if (isToday(d)) return t("Hoje");
  if (isYesterday(d)) return t("Ontem");
  return format(d, "dd/MM/yyyy", { locale: locale });
}

/** A que distância do fim ainda conta como "estou acompanhando a conversa". */
const PERTO_DO_FIM_PX = 80;

export function ChatThread({ conversationId, onResponder }: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const q = useMessagesRealtime(conversationId);
  // Desestruturado uma vez: `q.fetchNextPage` dentro do `useCallback` fazia o
  // lint pedir o objeto `q` inteiro nas dependências — e `q` é um objeto novo a
  // cada render, o que recriaria o callback toda vez.
  const { fetchNextPage: buscarPaginaAnterior } = q;
  const notes = useConversationNotes(conversationId);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sentinelaRef = useRef<HTMLDivElement | null>(null);
  const paginasVistas = useRef(0);
  const itensVistos = useRef(0);
  /** A altura do conteúdo ANTES de buscar a página antiga — reancora a leitura. */
  const alturaAntesDeCarregar = useRef<number | null>(null);
  /** `true` enquanto a pessoa está no fim: mensagem nova acompanha, não arranca. */
  const ancoradoNoFim = useRef(true);
  const observadorDeTamanho = useRef<ResizeObserver | null>(null);
  const activeOrg = useActiveOrg();
  const currentUser = useUser();
  const deleteNote = useDeleteNote(conversationId ?? "");
  const canManage = activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  const { enabled: debugCitations } = useDebugToggle(activeOrg?.role ?? null);

  const [noFim, setNoFim] = useState(true);
  const [novasAbaixo, setNovasAbaixo] = useState(0);

  const messages: Message[] = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  /**
   * As mensagens por id, para resolver a CITADA sem ir ao servidor.
   *
   * Uma consulta por bolha citada seria uma cascata de requisições numa
   * conversa longa. Aqui o fio sai da lista que já está na tela — e quando a
   * citada ficou fora da página carregada, ele simplesmente não aparece, que é
   * melhor que segurar a conversa esperando por um texto de enfeite.
   */
  const porId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const items: ThreadItem[] = useMemo(() => mergeThreadItems(messages, notes), [messages, notes]);

  const paginas = q.data?.pages.length ?? 0;

  /**
   * IR PARA O FIM — a única forma de "abrir a conversa onde ela está".
   *
   * `scrollTo` no SCROLLER, e não `scrollIntoView` no sentinela: o segundo
   * rola o ancestral mais próximo que rola — e, com o layout do inbox, ele
   * também mexia no `main` da página, levando junto a lista e o cabeçalho.
   *
   * `behavior: "auto"` na primeira carga de propósito: rolagem suave ali
   * aparece como a tela "descendo sozinha" ao abrir a conversa, que é o
   * oposto de abrir no presente.
   */
  const irParaFim = useCallback((suave: boolean) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const reduzirMovimento =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sc.scrollTo({
      top: sc.scrollHeight,
      behavior: suave && !reduzirMovimento ? "smooth" : "auto",
    });
    ancoradoNoFim.current = true;
    setNoFim(true);
    setNovasAbaixo(0);
  }, []);

  const aoRolar = useCallback(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const distancia = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
    const fim = distancia <= PERTO_DO_FIM_PX;
    ancoradoNoFim.current = fim;
    setNoFim(fim);
    if (fim) setNovasAbaixo(0);
  }, []);

  /**
   * Buscar a página anterior SEM perder o ponto de leitura.
   *
   * A thread pagina para o PASSADO: a página nova entra ACIMA. Sem guardar a
   * altura antes, o navegador mantém o `scrollTop` e o conteúdo que a pessoa
   * estava lendo desce — o clique parece não ter feito nada, embora tenha
   * carregado. O `scrollHeight` anterior é a âncora; o efeito abaixo devolve
   * a posição relativa quando a página chega.
   */
  const carregarAntigas = useCallback(() => {
    const sc = scrollerRef.current;
    if (sc) alturaAntesDeCarregar.current = sc.scrollHeight;
    void buscarPaginaAnterior();
  }, [buscarPaginaAnterior]);

  // Conversa nova = componente novo: a `key` em `InboxLayout` remonta o thread,
  // então âncoras e contadores abaixo começam no estado inicial — não existe
  // efeito de reset, nem uma segunda fonte para a mesma verdade.

  /**
   * Rola ao fim na primeira carga e quando chega mensagem/nota nova — mas NÃO
   * quando o crescimento veio do "Carregar mais antigas".
   *
   * A segunda guarda cobre o outro caso: se a pessoa rolou para ler o
   * histórico, mensagem nova não a arranca de onde estava. Em vez disso o
   * contador de novidades aparece no botão do canto.
   */
  useEffect(() => {
    const primeiraCarga = paginasVistas.current === 0;
    const carregouAntigas = !primeiraCarga && paginas > paginasVistas.current;
    paginasVistas.current = paginas;

    const cresceu = items.length - itensVistos.current;
    itensVistos.current = items.length;

    if (carregouAntigas) {
      const alturaAnterior = alturaAntesDeCarregar.current;
      alturaAntesDeCarregar.current = null;
      const sc = scrollerRef.current;
      // A página nova entrou ACIMA: empurrar o scroll pela altura acrescentada
      // mantém a mesma mensagem sob os olhos — e, se estava no fim, mantém no fim.
      if (sc && alturaAnterior !== null) sc.scrollTop += sc.scrollHeight - alturaAnterior;
      return;
    }

    if (primeiraCarga) {
      irParaFim(false);
      return;
    }

    if (ancoradoNoFim.current) {
      if (cresceu > 0) irParaFim(true);
      return;
    }

    if (cresceu > 0) setNovasAbaixo((n) => n + cresceu);
  }, [items.length, paginas, irParaFim]);

  /**
   * MÍDIA QUE CARREGA DEPOIS EMPURRA A CONVERSA PARA CIMA.
   *
   * Foto/vídeo chegam sem altura reservada; quando os bytes chegam, o conteúdo
   * cresce acima da viewport e o que estava à vista sai — o sintoma de "abriu
   * a conversa numa parte antiga". Observar o tamanho do conteúdo e recolocar
   * no fim enquanto a pessoa está acompanhando resolve sem `onLoad` em cada
   * mídia (que existe em seis componentes e esqueceria em um).
   */
  const medirConteudo = useCallback((no: HTMLDivElement | null) => {
    observadorDeTamanho.current?.disconnect();
    observadorDeTamanho.current = null;
    if (!no || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      const sc = scrollerRef.current;
      if (!sc || !ancoradoNoFim.current) return;
      sc.scrollTop = sc.scrollHeight;
    });
    obs.observe(no);
    observadorDeTamanho.current = obs;
  }, []);

  useEffect(() => () => observadorDeTamanho.current?.disconnect(), []);

  /**
   * Rolar até o topo carrega a página anterior — como no WhatsApp.
   *
   * O botão continua ali como caminho de teclado e para navegador sem
   * `IntersectionObserver`; o observador é conveniência, não a única porta.
   */
  useEffect(() => {
    const alvo = sentinelaRef.current;
    const raiz = scrollerRef.current;
    if (!alvo || !raiz || !q.hasNextPage) return;
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) carregarAntigas();
      },
      { root: raiz, rootMargin: "240px" },
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, carregarAntigas]);

  /**
   * O ESTADO DO CANAL DESTE THREAD, PUBLICADO SEMPRE — inclusive quando não há
   * mensagem nenhuma.
   *
   * ⚠️ A primeira versão punha estes atributos só no caso de SUCESSO, junto com
   * o `data-testid`. Isso os tornava invisíveis exatamente no estado em que
   * mais importam: conversa sem mensagens, esperando a primeira chegar. O canal
   * existe desde que a conversa abre; o sinal dele não pode depender de já
   * haver o que mostrar.
   *
   * Custou uma rodada de CI para aparecer, e por um motivo que vale registrar:
   * na máquina de quem desenvolve a conversa tem histórico acumulado, então o
   * caminho de sucesso é o único que se exercita. No CI o banco é fresco e a
   * conversa nasce vazia — o estado que nunca se vê localmente é o normal lá.
   *
   * Os dois atributos dizem coisas diferentes e nenhum sozinho basta:
   * `-status-mensagens` distingue "assinou" de "nem chegou a assinar";
   * `-divergencias-mensagens` é o que denuncia canal ASSINADO E MUDO, porque só
   * incrementa quando o refetch traz o que o canal não trouxe.
   */
  const sinalDoCanal = {
    "data-testid": "chat-thread",
    "data-realtime-status-mensagens": q.realtimeStatus,
    "data-refetch-divergencias-mensagens": q.seguranca?.divergencias ?? 0,
  } as const;

  if (!conversationId) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
      >
        {t("Selecione uma conversa")}
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div {...sinalDoCanal} className="space-y-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-2/3" />
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <p>{t("Erro ao carregar mensagens.")}</p>
        <Button
          size="sm"
          variant="outline"
          className={`${BTN_REF} ${BTN_REF_SEC}`}
          onClick={() => q.refetch()}
        >
          {t("Tentar novamente")}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
      >
        {t("Nenhuma mensagem nesta conversa.")}
      </div>
    );
  }

  // Group by day for separators (usa o timestamp do item — sent_at pra mensagem, created_at pra nota).
  //
  // `instante` devolve `-Infinity` para data ausente/inválida: essa linha não
  // pode derrubar a conversa inteira (`new Date("...")` inválido faz `format`
  // lançar e o thread vira tela de erro). Ela cai num grupo próprio, no topo —
  // que é onde a ordenação já a colocou.
  const groups: { key: string; date: Date | null; items: ThreadItem[] }[] = [];
  for (const item of items) {
    const ms = instante(item.ts);
    const d = Number.isFinite(ms) ? new Date(ms) : null;
    const key = d ? format(d, "yyyy-MM-dd") : "sem-data";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, date: d, items: [item] });
  }

  return (
    <div {...sinalDoCanal} className={`relative flex h-full flex-col ${WA.chatBg}`}>
      <div
        ref={scrollerRef}
        onScroll={aoRolar}
        // `.msgs` da referência: 22×26 de respiro (aqui na grade de 4px da
        // §15: 20×24) — o padding mora no scroller para a pílula de dia, as
        // bolhas e a nota nascerem todas alinhadas na mesma margem.
        className="flex-1 overflow-y-auto px-6 py-5"
      >
        {/* Coluna de leitura limitada: em ultrawide (1920) as bolhas
            esticavam a tela inteira — screenshot da auditoria. O padrão é o
            do WhatsApp Web: fio centralizado com respiro nas bordas. */}
        <div ref={medirConteudo} className="mx-auto w-full max-w-3xl">
          {/* Sentinela do carregamento automático + o botão como caminho
              alternativo (teclado, navegador sem IntersectionObserver). */}
          <div ref={sentinelaRef}>
            {q.hasNextPage && (
              <div className="flex justify-center py-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`rounded-lg ${BTN_REF}`}
                  onClick={carregarAntigas}
                  disabled={q.isFetchingNextPage}
                >
                  {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais antigas")}
                </Button>
              </div>
            )}
          </div>

          {groups.map((g) => (
            <div key={g.key} className="space-y-1">
              <div className="sticky top-0 z-10 flex justify-center py-1.5">
                <span
                  // `.day` da referência: 12px/600, 3×12 de respiro, fundo
                  // `--surface` com filete de `--line`, sem sombra.
                  className={`rounded-full border border-border bg-muted px-3 py-0.5 text-xs font-semibold ${WA.dayLabel}`}
                >
                  {g.date ? dayLabel(g.date, t, localeDaData) : t("Sem data")}
                </span>
              </div>
              {g.items.map((item) =>
                item.kind === "note" ? (
                  <NoteCard
                    key={`note-${item.data.id}`}
                    note={item.data}
                    // Só o autor ou manager+ vê o excluir — o backend barra o resto (403),
                    // então não mostramos um botão que daria erro.
                    onDelete={
                      item.data.created_by_user_id === currentUser.id || canManage
                        ? () => deleteNote.mutate(item.data.id)
                        : undefined
                    }
                  />
                ) : (
                  <MessageBubble
                    key={`msg-${item.data.id}`}
                    message={item.data}
                    debugCitations={debugCitations}
                    onResponder={onResponder}
                    // A citada sai da MESMA lista já carregada: buscar no servidor
                    // por cada citação faria uma consulta por bolha. Quando a
                    // citada é antiga demais e ficou fora da página, o fio some —
                    // que é melhor que segurar a conversa esperando.
                    citada={porId.get(item.data.reply_to_message_id ?? "") ?? null}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {/*
        O ATALHO DE VOLTA PARA O PRESENTE — só quando a pessoa saiu do fim.

        Sem ele, quem rola para ler o histórico e recebe mensagem nova fica sem
        saber que chegou algo: a mensagem entra abaixo da viewport e a tela não
        se mexe (de propósito — arrancar quem está lendo é pior). O contador
        diz QUANTO chegou; o clique devolve ao fim. É o mesmo gesto do WhatsApp.
      */}
      {!noFim && (
        <button
          type="button"
          onClick={() => irParaFim(true)}
          aria-label={
            novasAbaixo > 0
              ? `${t("Ir para as mensagens novas")} (${novasAbaixo})`
              : t("Ir para o fim da conversa")
          }
          data-testid="ir-para-o-fim"
          className="absolute right-6 bottom-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-muted"
        >
          <CaretDown size={16} aria-hidden />
          {novasAbaixo > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground tabular-nums">
              {novasAbaixo > 99 ? "99+" : novasAbaixo}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
