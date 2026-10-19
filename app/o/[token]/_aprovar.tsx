"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * O CLIQUE DO CLIENTE.
 *
 * Três desfechos possíveis, e a tela nunca mente sobre qual aconteceu:
 *
 *  - `aprovado` — o pedido entrou na fila (`aprovado`). É o caso normal.
 *  - `aguardando` — o desconto passou do teto do vendedor. A aprovação do
 *    cliente foi REGISTRADA, mas o pedido continua `em_analise` até o gerente
 *    confirmar. Dizer "aprovado" aqui seria prometer o que o sistema não fez.
 *  - `erro` — link vencido, pedido cancelado, ou rede. Mostra a mensagem e
 *    deixa tentar de novo.
 */
type Estado = "parado" | "enviando" | "aprovado" | "aguardando";

export function BotaoAprovar(p: {
  token: string;
  podeAprovar: boolean;
  jaAprovado: boolean;
  espera: "gerente" | "cancelado" | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState<string | null>(null);

  if (p.espera === "cancelado") {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        Este orçamento foi cancelado. Fale com quem enviou o link se precisar de uma nova
        proposta.
      </p>
    );
  }

  if (p.jaAprovado || estado === "aprovado") {
    return (
      <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        <strong className="block">Orçamento aprovado.</strong>
        Obrigado! O pedido já está na fila da nossa equipe.
      </p>
    );
  }

  if (estado === "aguardando") {
    return (
      <p className="rounded-xl border p-4 text-sm">
        <strong className="block">Aprovação registrada.</strong>
        Recebemos sua aprovação. Nosso time confirma os detalhes e segue com o pedido.
      </p>
    );
  }

  async function aprovar() {
    setEstado("enviando");
    setErro(null);
    try {
      const resposta = await fetch(`/api/v1/public/orcamento/${encodeURIComponent(p.token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "aprovar" }),
      });
      const corpo = (await resposta.json().catch(() => null)) as {
        data?: { aguardando_aprovacao?: boolean };
        error?: { message?: string };
      } | null;

      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível registrar a aprovação.");
        setEstado("parado");
        return;
      }

      if (corpo?.data?.aguardando_aprovacao) {
        setEstado("aguardando");
        return;
      }
      setEstado("aprovado");
      router.refresh();
    } catch {
      setErro("Sem conexão. Tente de novo.");
      setEstado("parado");
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="h-12 w-full text-base"
        disabled={!p.podeAprovar || estado === "enviando"}
        onClick={aprovar}
      >
        {estado === "enviando" ? "Aprovando…" : "Aprovar orçamento"}
      </Button>
      {erro ? <p className="text-center text-sm text-destructive">{erro}</p> : null}
    </div>
  );
}
