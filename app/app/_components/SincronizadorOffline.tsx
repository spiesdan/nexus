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
 * ─── O defeito que este arquivo carregou até 18/11/2026 ────────────────────
 *
 * Ele foi escrito, importado no layout e **nunca renderizado** (`aaff0b51`).
 * A fila nunca subiu sozinha: o vendedor capturava offline e o pedido ficava no
 * aparelho, sem erro e sem aviso. Nenhum teste pegava, porque os testes mediam
 * a biblioteca e o shell — não a ligação. `tests/unit/layout-componentes-montados.test.ts`
 * existe para isso não voltar a acontecer.
 *
 * ─── Quando drena ───────────────────────────────────────────────────────────
 *
 * Na abertura, a cada `online`, quando a aba volta a ficar visível e, com a
 * fila ainda cheia, em retry com backoff (30 s → 5 min). O retry é necessário
 * porque `online` não cobre o caso real: o Wi-Fi do hotel "conecta" sem
 * internet, o servidor cai por dez minutos, ou o WebView é retomado sem evento
 * nenhum. Sem o timer, a fila só tentaria de novo no próximo cold start.
 *
 * ─── O que mostra ───────────────────────────────────────────────────────────
 *
 * Faixa no topo enquanto existe pedido no aparelho — não só toast. Toast some
 * em quatro segundos e leva junto o único sinal de que o pedido ainda não
 * subiu. A faixa diz quantos estão esperando, quantos foram recusados e POR
 * QUÊ, e oferece "Enviar agora" (e "Tentar de novo" para recusado, depois de
 * resolver o motivo fora do sistema). `rejeitado` nunca reenvia sozinho: um 422
 * de crédito se repete para sempre e queima bateria.
 */

import * as React from "react";

import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useT } from "@/hooks/i18n/useT";

import { banco } from "@/lib/offline/db";
import { contarAbertos, filaAberta, reabrirRejeitado } from "@/lib/offline/outbox";
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

/** O que a faixa precisa saber — e nada de payload (nome de cliente não vaza). */
interface EstadoDaFila {
  pendentes: number;
  rejeitados: number;
  motivos: string[];
  semSessao: boolean;
}

const PRIMEIRA_ESPERA_MS = 30_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

export function SincronizadorOffline(): React.ReactElement | null {
  const t = useT();
  const [fila, setFila] = React.useState<EstadoDaFila | null>(null);
  const disparar = React.useRef<() => void>(() => undefined);

  React.useEffect(() => {
    if (!ehNativo()) return;

    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rodando = false;
    let tentativa = 0;

    const ler = async (): Promise<EstadoDaFila> => {
      const db = await banco();
      const { pendentes, rejeitados } = await contarAbertos(db);
      const abertas = await filaAberta(db);
      const motivos = [
        ...new Set(
          abertas
            .filter((p) => p.status === "rejeitado" && p.ultimo_erro)
            .map((p) => p.ultimo_erro as string),
        ),
      ].slice(0, 3);
      return { pendentes, rejeitados, motivos, semSessao: false };
    };

    const publicar = (estado: EstadoDaFila) => {
      if (!cancelado) setFila(estado);
    };

    const agendar = (espera: number) => {
      if (cancelado) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void rodada(), espera);
    };

    const rodada = async () => {
      if (cancelado || rodando) return;
      rodando = true;
      let restantes = 0;
      try {
        const db = await banco();
        if (!(await temSinal())) {
          const estado = await ler();
          publicar(estado);
          restantes = estado.pendentes + estado.rejeitados;
          return;
        }

        // Catálogo velho não trava o envio — o pedido usa o preço que o
        // vendedor viu e o servidor decide. Mas baixar mantém o preço fresco.
        try {
          await sincronizarCatalogo(db, buscarGet);
        } catch {
          // silêncio de propósito: ver comentário acima.
        }

        const r = await drenarFila(db, buscarMesmaOrigem);

        if (r.aceitos > 0 || r.rejeitados > 0 || r.retomados > 0) {
          const numeros = r.itens
            .filter((i) => i.resultado === "aceito" && i.pedido_numero != null)
            .map((i) => i.pedido_numero);
          const partes: string[] = [];
          if (r.retomados > 0) partes.push(`${r.retomados} retomado(s) de envio interrompido`);
          if (r.aceitos > 0) {
            partes.push(
              `${r.aceitos} enviado(s)${numeros.length > 0 ? ` (nº ${numeros.join(", ")})` : ""}`,
            );
          }
          for (const rej of r.itens.filter((i) => i.resultado === "rejeitado")) {
            partes.push(`${rej.numero_provisorio}: ${rej.motivo ?? "recusado"}`);
          }
          nexusToast.info("Pedidos offline", partes.join(" · "));
        }

        const parouSemSessao = r.itens.some((i) => i.resultado === "parado_sem_sessao");
        const estado = await ler();
        publicar({ ...estado, semSessao: parouSemSessao });
        restantes = estado.pendentes + estado.rejeitados;
      } catch {
        // Banco ainda não abriu ou o aparelho negou o SQLite: a faixa continua
        // com o último estado conhecido. Engolir aqui é melhor do que derrubar
        // o layout inteiro por causa do sincronizador — mas NÃO desistir: uma
        // abertura que falhou agora pode abrir no próximo ciclo, e sem o retry
        // a fila esperaria o próximo cold start. O backoff sobe até 5 min.
        restantes = 1;
      } finally {
        rodando = false;
        if (cancelado) return;
        if (restantes > 0) {
          tentativa += 1;
          agendar(Math.min(PRIMEIRA_ESPERA_MS * 2 ** (tentativa - 1), ESPERA_MAXIMA_MS));
        } else {
          tentativa = 0;
        }
      }
    };

    disparar.current = () => {
      tentativa = 0;
      void rodada();
    };

    void rodada();

    const onOnline = () => {
      tentativa = 0;
      void rodada();
    };
    const onVisivel = () => {
      if (document.visibilityState === "visible") void rodada();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisivel);

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisivel);
    };
    // `rodada` e `ler` são recriadas a cada execução do efeito por desenho: elas
    // fecham sobre `cancelado`/`timer`, e recriar a cada render perderia a
    // referência do timer que está agendado. Por isso o efeito roda uma vez só.
  }, []);

  const temFila = fila !== null && fila.pendentes + fila.rejeitados > 0;

  const tentarDeNovo = async () => {
    try {
      const db = await banco();
      const rejeitados = (await filaAberta(db)).filter((p) => p.status === "rejeitado");
      for (const p of rejeitados) await reabrirRejeitado(db, p.uuid);
    } catch {
      // O botão do "tentar agora" logo abaixo ainda roda e mostra o erro real.
    }
    disparar.current();
  };

  if (!temFila) return null;

  const motivo = fila.motivos[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-info/40 bg-info-bg px-4 py-2 text-sm text-info-fg"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden>📶</span>
        <span>
          {fila.pendentes > 0 ? (
            <>
              <strong className="font-semibold">{fila.pendentes}</strong>{" "}
              {t(fila.pendentes === 1 ? "pedido salvo no aparelho" : "pedidos salvos no aparelho")}{" "}
              {t("aguardando envio")}
            </>
          ) : null}
          {fila.pendentes > 0 && fila.rejeitados > 0 ? " · " : null}
          {fila.rejeitados > 0 ? (
            <>
              <strong className="font-semibold">{fila.rejeitados}</strong>{" "}
              {t(fila.rejeitados === 1 ? "recusado" : "recusados")}
              {motivo ? `: ${motivo}` : null}
            </>
          ) : null}
          {fila.semSessao ? ` — ${t("entre de novo no sistema para enviar")}` : null}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {fila.rejeitados > 0 ? (
          <button
            type="button"
            onClick={() => void tentarDeNovo()}
            className="rounded-full border border-info/40 bg-surface px-3 py-1 font-medium text-info-fg hover:bg-surface-elevated"
          >
            {t("Tentar de novo")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => disparar.current()}
          className="rounded-full border border-info/40 bg-surface px-3 py-1 font-medium text-info-fg hover:bg-surface-elevated"
        >
          {t("Enviar agora")}
        </button>
      </div>
    </div>
  );
}
