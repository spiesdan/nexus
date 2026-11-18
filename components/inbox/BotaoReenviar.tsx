"use client";

import { ArrowsClockwise, CircleNotch } from "@phosphor-icons/react";
import { useRef } from "react";

import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useT } from "@/hooks/i18n/useT";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { payloadDeReenvio, podeReenviar } from "@/lib/inbox/reenvio";
import type { Message } from "@/lib/types/messaging";

/**
 * REENVIAR UMA MENSAGEM QUE FALHOU — a saída que a bolha não tinha.
 *
 * O envio reusa `useSendMessage`, o MESMO caminho do composer: a mensagem nova
 * nasce com o optimistic update, a invalidação e o tratamento de erro que já
 * existem. Um segundo endpoint de reenvio seria um segundo lugar para esquecer
 * a assinatura do atendente, a checagem de janela e o filtro de organização.
 *
 * A mensagem original NÃO é alterada: o histórico conta que houve uma tentativa
 * que falhou, e a nova linha conta que houve outra. Reescrever a antiga para
 * `sent` faria o CRM afirmar uma entrega que ninguém confirmou.
 */
export function BotaoReenviar({ message }: { message: Message }) {
  const t = useT();
  const send = useSendMessage();
  // Trava SÍNCRONA do clique duplo. `isPending` só chega na próxima render e
  // dois cliques no mesmo tick passariam os dois — duas mensagens iguais para o
  // cliente é o defeito que o retry existe para evitar.
  const emVoo = useRef(false);

  if (!podeReenviar(message)) return null;

  function reenviar() {
    if (emVoo.current || send.isPending) return;
    const payload = payloadDeReenvio(message);
    if (!payload) return;
    emVoo.current = true;
    send.mutate(
      { conversation_id: message.conversation_id, ...payload },
      {
        onSuccess: () => toast.success(t("Mensagem reenviada.")),
        onSettled: () => {
          emVoo.current = false;
        },
      },
    );
  }

  return (
    <button
      type="button"
      onClick={reenviar}
      disabled={send.isPending}
      className="inline-flex items-center gap-0.5 rounded px-1 font-semibold text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      aria-label={t("Reenviar mensagem")}
    >
      {send.isPending ? (
        <CircleNotch size={11} weight="bold" className="animate-spin" aria-hidden />
      ) : (
        <ArrowsClockwise size={11} weight="bold" aria-hidden />
      )}
      {send.isPending ? t("Reenviando…") : t("Reenviar")}
    </button>
  );
}
