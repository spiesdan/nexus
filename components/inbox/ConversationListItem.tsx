"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useT } from "@/hooks/i18n/useT";
import { Phone, Robot } from "@/lib/ui/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { OwnerBadge } from "@/components/kanban/OwnerBadge";
import { WA } from "@/components/inbox/whatsapp-theme";
import { comandoDaConversa } from "@/lib/inbox/comando-da-conversa";
import { cn } from "@/lib/utils";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { phoneForDisplay } from "@/lib/channels/phone-variants";

interface Props {
  conversation: ConversationWithContact;
  isSelected: boolean;
  onSelect: (id: string) => void;
  /**
   * Mostrar "Aguardando há…" — só na visão Fila.
   *
   * O que NÃO existe mais aqui é a posição ("1º, 2º…"). Ela era o índice de uma
   * lista ordenada por tempo de espera; a lista passou a ordenar por
   * `last_message_at` em todas as abas (o mesmo relógio que a linha imprime), e
   * o número passaria a prometer uma prioridade que a ordem não entrega. O
   * tempo de espera continua — esse é verdadeiro em qualquer ordenação.
   */
  mostrarEspera?: boolean;
  /**
   * Mostrar POR ONDE a conversa entrou.
   *
   * Só com mais de um número conectado. Com um só, o rótulo seria a mesma
   * palavra em toda linha da lista — ruído que ensina o olho a ignorar a área
   * onde vivem os avisos que importam (bloqueado, tags).
   */
  mostrarCanal?: boolean;
  /**
   * Mostrar QUEM está no comando de cada conversa.
   *
   * Mesma regra do canal, e pelo mesmo motivo: só quando o rótulo DISCRIMINA. Nas
   * abas "Fila" (todas sem dono), "Minhas" (todas do mesmo dono) e "IA" o badge
   * seria a mesma palavra em toda linha — ruído que ensina o olho a ignorar a
   * área onde vivem os avisos que importam. Quem decide é a lista, que é quem
   * sabe quantos donos distintos ela tem.
   */
  mostrarAtendente?: boolean;
  /**
   * A org tem atendimento automático de pé? Vem por PROP e não por hook: um hook
   * por linha faria 50 assinaturas de query na mesma lista para responder a MESMA
   * pergunta org-wide. `undefined` = "não sei", e a função trata isso como "não
   * afirme nada".
   */
  automaticoDaOrg?: boolean;
}

/**
 * A COR SAI DE QUEM MANDA, NÃO DO STATUS.
 *
 * O mapa anterior era por `conversations.status`, e o `bg-purple-500` de
 * `ai_handling` era a mesma mentira das abas em forma de cor: `ai_handling` é
 * escrito por UM caminho só em produção, então a bolinha do automático quase
 * nunca aparecia — enquanto o robô atendia a maior parte da lista — e, quando
 * aparecia, sobrevivia ao silêncio, porque o status não muda quando o atendente
 * cala o automático.
 *
 * As chaves são as de `Comando["quem"]`, ao lado de `ROTULO_DO_COMANDO`, pela
 * mesma razão que ele mora ali: a cor e a palavra dizem a mesma coisa e não
 * podem ser mantidas em arquivos diferentes.
 */
const COR_DO_COMANDO: Record<string, string> = {
  humano: "bg-blue-500",
  automatico: "bg-purple-500",
  aguardando: "bg-amber-500",
  ninguem: "bg-muted-foreground/60",
  encerrada: "bg-muted-foreground/30",
};

/**
 * O ponto diz QUEM está no comando — e cor sozinha não diz nada a quem não a
 * distingue. O `aria-label` (e o `title`) é o que transforma o ponto em
 * informação: antes ele era `aria-hidden` e a única pista era o matiz.
 */
const ROTULO_DO_COMANDO: Record<string, string> = {
  humano: "Atendente no comando",
  automatico: "Assistente no comando",
  aguardando: "Aguardando atendente",
  ninguem: "Sem responsável",
  encerrada: "Conversa encerrada",
};

function initials(name: string | null | undefined, fallback: string): string {
  const v = (name ?? "").trim();
  if (!v) return fallback.slice(0, 2).toUpperCase();
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

function relativeTime(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return format(d, "HH:mm");
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) return formatDistanceToNowStrict(d, { addSuffix: false, locale: locale });
  return format(d, "dd/MM");
}

/** "Aguardando há 5 min" — desde a última mensagem do cliente (fallback: criação). */
function waitingLabel(
  conversation: ConversationWithContact,
  t: (texto: string) => string = (texto) => texto,
  locale: Locale,
): string {
  const since = conversation.last_inbound_at ?? conversation.created_at;
  if (!since) return t("Aguardando");
  return `${t("Aguardando")} ${formatDistanceToNowStrict(new Date(since), { addSuffix: true, locale: locale })}`;
}

export function ConversationListItem({
  conversation,
  isSelected,
  onSelect,
  mostrarEspera,
  mostrarCanal,
  mostrarAtendente,
  automaticoDaOrg,
}: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const c = conversation.contacts ?? null;
  const displayName = rotuloDoContato(c);
  const phoneFallback = c?.phone_number ? phoneForDisplay(c.phone_number) : "??";
  const tags = c?.tags ?? [];
  const visibleTags = tags.slice(0, 2);
  const overflow = tags.length - visibleTags.length;
  const preview = conversation.last_message_preview?.trim() || t("Sem mensagens");
  const truncated = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;
  const time = relativeTime(conversation.last_message_at, localeDaData);
  const unread = conversation.unread_count_for_assignee ?? 0;

  /**
   * Quem manda, pela MESMA regra do cabeçalho.
   *
   * `status === 'ai_handling'` era um proxy ruim e foi medido: o único escritor
   * desse status em produção é o botão "Devolver ao automático", então o ícone de
   * robô aparecia só em conversa que já tinha sido escalada E devolvida — nunca
   * na que o automático atendeu do começo ao fim, que é a maioria.
   */
  const { comando } = comandoDaConversa({
    status: conversation.status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    assignee_kind: conversation.assignee_kind ?? null,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: c?.is_blocked ?? null,
    automaticoDaOrg,
  });
  const isAi = comando.quem === "automatico";
  const dot = COR_DO_COMANDO[comando.quem] ?? COR_DO_COMANDO.ninguem;
  const rotuloDoComando =
    ROTULO_DO_COMANDO[comando.quem] ?? ROTULO_DO_COMANDO.ninguem ?? "Sem responsável";

  // O número DA EMPRESA por onde esta conversa chegou — não o do cliente. Com
  // dois canais é o que decide o tom da resposta e qual número a pessoa vê
  // respondendo. Cai no nome do canal quando não há número (canal recém-criado).
  const canal = conversation.channel_sessions ?? null;
  const rotuloCanal = canal?.phone_number ?? canal?.display_name ?? null;

  /**
   * Há ALGUM selo para desenhar nesta linha?
   *
   * A faixa de selos é a última linha da linha da lista e existia SEMPRE — com
   * `mt-1.5` fixo mesmo quando estava vazia. Numa instalação com um canal só, a
   * maioria das linhas não tem selo nenhum: era margem paga por todas elas. A
   * lista é a tela em que o atendente passa o dia; 6px × 30 linhas é uma linha
   * e meia de conversa a menos na tela.
   */
  const temSelos =
    visibleTags.length > 0 ||
    overflow > 0 ||
    (mostrarAtendente && comando.quem === "humano") ||
    Boolean(mostrarCanal && rotuloCanal) ||
    Boolean(c?.is_blocked) ||
    Boolean(c?.is_anonymized) ||
    unread > 0;

  return (
    <button
      type="button"
      data-conversation-id={conversation.id}
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "row-hover interactive group flex w-full items-start gap-3 border-b border-l-[3px] px-4 py-3 text-left",
        isSelected ? `${WA.selected} border-l-accent` : "border-l-transparent",
      )}
      aria-current={isSelected ? "true" : undefined}
    >
      <div className="relative shrink-0">
        {/* As INICIAIS são decoração: elas resumem um nome que vem logo ao
            lado e no nome acessível da linha. Sem `aria-hidden`, o leitor de
            tela anuncia "M-S" antes de cada cliente — ruído em toda linha. */}
        <Avatar className="h-10 w-10" aria-hidden>
          {/* Só monta a <img> quando existe arquivo: sem isso o browser pediria
              a rota para TODO contato da lista e levaria 404 em cada um sem
              foto — que é a maioria. O AvatarFallback do Radix já cobre o caso
              de a imagem não carregar, então as iniciais nunca somem. */}
          {c?.avatar_storage_path && !c?.is_anonymized ? (
            <AvatarImage src={`/api/v1/contacts/${c.id}/avatar`} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback
            className={cn(
              "text-[13px] font-bold",
              isSelected && "bg-accent text-accent-foreground",
            )}
          >
            {initials(displayName, phoneFallback)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background",
            dot,
          )}
          role="img"
          aria-label={t(rotuloDoComando)}
          title={t(rotuloDoComando)}
        />
      </div>

      <div className="min-w-0 flex-1">
        {mostrarEspera && (
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-error-fg">
              {waitingLabel(conversation, t, localeDaData)}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          {/* O NOME É O TÍTULO DA LINHA — e o que a distingue de uma linha
              VISTA. Não lida não ganha só o selo no fim: o nome engrossa e a
              prévia sobe do cinza-mudo para a tinta, que é a mesma gramática do
              WhatsApp. Cor e negrito juntos fazem a diferença sobreviver ao
              daltonismo e ao teste do metro. */}
          <span
            className={cn(
              "truncate text-sm",
              unread > 0 ? "font-bold" : "font-semibold",
              // Cor em PARES mutuamente exclusivos: `text-text` e
              // `text-muted-foreground` juntos são dois utilitários da mesma
              // propriedade, e quem vence é a ordem da folha compilada — não a
              // ordem em que estão escritos aqui.
              c?.is_anonymized ? "text-muted-foreground italic" : "text-text",
            )}
          >
            {displayName}
          </span>
          {/* Hora: um degrau ABAIXO da prévia, e não no mesmo tamanho dela. O
              relógio é a informação menos importante da linha e competia com o
              texto que se lê. */}
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{time}</span>
        </div>

        <p
          className={cn(
            "mt-0.5 truncate text-[13px] leading-snug",
            unread > 0 ? "font-medium text-text" : "text-muted-foreground",
          )}
        >
          {isAi ? <Robot size={10} weight="duotone" className="mr-1 inline" aria-hidden /> : null}
          {truncated}
        </p>

        {/* A FAIXA DE SELOS SÓ EXISTE QUANDO HÁ SELO.
            Ela carregava `mt-1.5` fixo e, sem tag/canal/selo nenhum, deixava 6px
            de margem para um `div` de altura zero — em toda linha de instalação
            com um canal só. `compacto` é o caso comum: quase nenhuma linha tem
            selo, e o vão era invisível na conta. */}
        {temSelos && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {visibleTags.map((t) => (
              <Badge key={t} variant="secondary" className="h-4 px-1.5 text-[10px]">
                {t}
              </Badge>
            ))}
            {overflow > 0 && (
              <span
                className={cn("text-[10px]", isSelected ? "text-text" : "text-muted-foreground")}
              >
                +{overflow}
              </span>
            )}
            {mostrarAtendente && comando.quem === "humano" && (
              <OwnerBadge ownerKind="user" ownerName={comando.nome ?? t("Atendente")} compacto />
            )}
            {mostrarCanal && rotuloCanal && (
              <Badge
                variant="outline"
                // Na linha SELECIONADA o fundo é `accent-soft`; o cinza-mudo a
                // 10px não alcança o mínimo AA sobre ele no tema escuro (medido
                // pelo axe: `color-contrast` em `Entrou por …`). Metadado de 10px
                // em linha selecionada vai na tinta cheia.
                className={cn(
                  "h-4 gap-1 px-1.5 text-[10px] font-normal",
                  isSelected ? "text-text" : "text-muted-foreground",
                )}
                title={`${t("Entrou por")} ${rotuloCanal}`}
              >
                <Phone size={9} weight="regular" aria-hidden />
                {rotuloCanal}
              </Badge>
            )}
            {c?.is_blocked && (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                {t("Bloqueado")}
              </Badge>
            )}
            {c?.is_anonymized && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                {t("Anonimizado")}
              </Badge>
            )}
            {unread > 0 && (
              <Badge className={`ml-auto h-4 min-w-4 px-1.5 text-[10px] ${WA.unread}`}>
                {unread}
                {/* Um número sozinho não diz o que conta. "3 não lidas" é o que
                  o leitor de tela precisa ouvir para o selo significar algo. */}
                <span className="sr-only"> {t("não lidas")}</span>
              </Badge>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
