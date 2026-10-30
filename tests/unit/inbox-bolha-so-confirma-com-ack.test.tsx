import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageBubble } from "@/components/inbox/MessageBubble";
import type { Message } from "@/lib/types/messaging";

/**
 * A BOLHA SÓ FICA VERDE QUANDO O WHATSAPP CONFIRMA.
 *
 * ─── O defeito, relatado olhando a tela ─────────────────────────────────────
 *
 * O inbox mostrava o tique de "enviada" no instante em que o transporte aceitou
 * o pedido. No canal por QR isso acontece ANTES de o WhatsApp confirmar — e ele
 * pode recusar depois (463, conta restrita). Medido em 30/10/2026: a campanha
 * mostrou 90 enviadas para 22 confirmações. A tela afirmava entrega que não
 * existia, e o operador só descobria no celular do cliente.
 *
 * ─── A régua que estes casos prendem ────────────────────────────────────────
 *
 * O ACK manda mais que o status local: uma linha legada pode estar `sent` com
 * ack 0 (gravada no aceite, antes deste conserto) e ela não é envio. Sem
 * confirmação, o ícone é relógio — honesto: saiu do CRM, ninguém confirmou que
 * chegou. E o ack negativo vira falha, com o motivo no tooltip.
 */

function msg(over: Partial<Message>): Message {
  return {
    id: "m1",
    organization_id: "org-1",
    conversation_id: "c1",
    contact_id: "ct1",
    channel_session_id: "s1",
    external_id: "x1",
    type: "text",
    direction: "outbound",
    status: "sending",
    ack: 0,
    body: "oi",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    reply_to_message_id: null,
    sent_via: "user",
    sent_by_user_id: null,
    sent_at: "2026-10-30T18:00:00.000Z",
    delivered_at: null,
    read_at: null,
    error_code: null,
    error_message: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    created_at: "2026-10-30T18:00:00.000Z",
    ...over,
  } as Message;
}

const AGUARDANDO = "Aguardando confirmação do WhatsApp";

describe("MessageBubble — confirmação de envio", () => {
  it("aceite do transporte (ack 0) NÃO vira tique: mostra relógio", () => {
    render(<MessageBubble message={msg({ status: "sending", ack: 0 })} />);

    expect(screen.getByLabelText(AGUARDANDO)).toBeInTheDocument();
    expect(screen.queryByLabelText("Enviada")).not.toBeInTheDocument();
  });

  it("linha legada `sent` com ack 0 também não é envio", () => {
    // O status gravado no aceite continua no banco de quem já usava o produto.
    // Se a tela confiasse nele, o conserto só valeria para mensagens novas.
    render(<MessageBubble message={msg({ status: "sent", ack: 0 })} />);

    expect(screen.getByLabelText(AGUARDANDO)).toBeInTheDocument();
    expect(screen.queryByLabelText("Enviada")).not.toBeInTheDocument();
  });

  it("ack 1 é o primeiro degrau que prova que saiu: um tique", () => {
    render(<MessageBubble message={msg({ status: "sent", ack: 1 })} />);

    expect(screen.getByLabelText("Enviada")).toBeInTheDocument();
    expect(screen.queryByLabelText(AGUARDANDO)).not.toBeInTheDocument();
  });

  it("ack 2 é entregue e ack 3 é lida", () => {
    const { unmount } = render(<MessageBubble message={msg({ status: "delivered", ack: 2 })} />);
    expect(screen.getByLabelText("Entregue")).toBeInTheDocument();
    unmount();

    render(<MessageBubble message={msg({ status: "read", ack: 3 })} />);
    expect(screen.getByLabelText("Lida")).toBeInTheDocument();
  });

  it("ack negativo é falha, com o motivo visível", () => {
    render(
      <MessageBubble
        message={msg({
          status: "failed",
          ack: -1,
          error_code: "whatsapp_ack_error",
          error_message: "O WhatsApp recusou a entrega (ERROR): 463",
        })}
      />,
    );

    expect(screen.getByText("Falhou")).toBeInTheDocument();
    expect(screen.queryByLabelText(AGUARDANDO)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enviada")).not.toBeInTheDocument();
  });

  it("mensagem recebida não ganha indicador de envio", () => {
    render(
      <MessageBubble message={msg({ direction: "inbound", status: "delivered", ack: null })} />,
    );

    expect(screen.queryByLabelText(AGUARDANDO)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enviada")).not.toBeInTheDocument();
  });
});
