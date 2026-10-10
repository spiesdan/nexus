"use client";

/**
 * O SINCRONIZADOR — mora no sistema, drena a fila do shell.
 *
 * ─── Por que aqui e não no shell ────────────────────────────────────────────
 *
 * Enviar pedido e baixar catálogo exigem sessão autenticada. A sessão é um
 * cookie httpOnly — o shell (outra origem) não o tem e nunca terá. Este
 * componente roda DENTRO do sistema, onde o `fetch` leva os cookies sozinho.
 *
 * O shell captura; o sistema envia. O SQLite é a ponte: o mesmo arquivo que o
 * shell escreve, este componente lê.
 *
 * ─── Quando drena ───────────────────────────────────────────────────────────
 *
 * Na abertura (com sinal) e a cada evento `online`. Só no Capacitor nativo:
 * no navegador desktop não há shell nem fila — e drenar fila inexistente a
 * cada abertura seria request à toa.
 *
 * ─── O que mostra ───────────────────────────────────────────────────────────
 *
 * Nada quando não há nada. Toast curto quando envia ("2 pedidos enviados, nº
 * 101 e 102"), aviso quando algo volta rejeitado — com o motivo, porque
 * "rejeitado" sem motivo manda o vendedor adivinhar.
 */

import { useEffect, useRef } from "react";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";

import { banco } from "@/lib/offline/db";
import { contarAbertos } from "@/lib/offline/outbox";
import { sincronizarCatalogo } from "@/lib/offline/catalogo";
import { drenarFila } from "@/lib/offline/sync";
import { temSinal } from "@/lib/offline/rede";

function ehNativo(): boolean {
  try {
    // `Capacitor.isNativePlatform()` sem importar o core no SSR: o import é
    // dinâmico para não tocar em `window` no servidor.
    return (
      typeof window !== "undefined" &&
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
        ?.isNativePlatform?.() === true
    );
  } catch {
    return false;
  }
}

async function buscarMesmaOrigem(
  url: string,
  init: { method: string; body: string },
): Promise<{ status: number; corpo: () => Promise<unknown> }> {
  const r = await fetch(url, {
    method: init.method,
    headers: { "content-type": "application/json" },
    body: init.body,
  });
  return { status: r.status, corpo: () => r.json() as Promise<unknown> };
}

async function buscarGet(url: string): Promise<{ status: number; corpo: () => Promise<unknown> }> {
  const r = await fetch(url);
  return { status: r.status, corpo: () => r.json() as Promise<unknown> };
}

export function SincronizadorOffline(): null {
  const rodando = useRef(false);

  useEffect(() => {
    if (!ehNativo()) return;

    const avisar = (texto: string) => {
      nexusToast.info("Pedidos offline", texto);
    };

    const rodada = async () => {
      if (rodando.current) return;
      if (!(await temSinal())) return;
      rodando.current = true;
      try {
        const db = await banco();
        const antes = await contarAbertos(db);
        if (antes.pendentes + antes.rejeitados === 0) {
          // Sem fila não há o que drenar — mas o catálogo ainda pode estar
          // velho. Baixar em silêncio mantém o preço fresco sem toast.
          try {
            await sincronizarCatalogo(db, buscarGet);
          } catch {
            // Catálogo velho não trava nada: a captura avisa a idade.
          }
          return;
        }
        try {
          await sincronizarCatalogo(db, buscarGet);
        } catch {
          // Segue para o dreno mesmo assim: o pedido usa o preço que o
          // vendedor viu, e o servidor decide. Travar o envio por catálogo
          // velho seria prender pedido bom por causa de preço.
        }
        const r = await drenarFila(db, buscarMesmaOrigem);
        if (r.aceitos > 0 || r.rejeitados > 0) {
          const numeros = r.itens
            .filter((i) => i.resultado === "aceito" && i.pedido_numero != null)
            .map((i) => i.pedido_numero);
          const partes = [];
          if (r.aceitos > 0) partes.push(`${r.aceitos} enviado(s)${numeros.length > 0 ? ` (nº ${numeros.join(", ")})` : ""}`);
          const rejeitados = r.itens.filter((i) => i.resultado === "rejeitado");
          for (const rej of rejeitados) {
            partes.push(`${rej.numero_provisorio}: ${rej.motivo ?? "recusado"}`);
          }
          avisar(partes.join(" · "));
        }
      } finally {
        rodando.current = false;
      }
    };

    void rodada();
    const onOnline = () => void rodada();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return null;
}
