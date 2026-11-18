/**
 * A TELA INICIAL DO SHELL — funciona sem internet, sempre.
 *
 * ─── O que ela faz e o que ela NÃO faz ──────────────────────────────────────
 *
 * FAZ: mostra a fila, abre a captura, leva ao sistema, mostra o estado do
 * catálogo. NÃO baixa catálogo nem envia pedido — os dois precisam de sessão
 * autenticada, e a sessão (cookie httpOnly) só existe no contexto remoto. O
 * contexto remoto sincroniza sozinho ao abrir (`SincronizadorOffline` no app);
 * aqui, o botão "Abrir o sistema" é o caminho — e é por isso que ele é o mais
 * visível quando há fila e há sinal.
 *
 * ─── Por que `window.__offline` só em DEV ───────────────────────────────────
 *
 * O e2e precisa semear o SQLite e ler a fila sem passar pela UI — e não há
 * API local para isso. O namespace some no build de produção (`import.meta.env.DEV`),
 * então o APK não carrega gancho de teste.
 */

import { banco } from "@/lib/offline/db";
import {
  contarAbertos,
  descartarPendente,
  filaAberta,
  reabrirRejeitado,
  type PedidoNaFila,
} from "@/lib/offline/outbox";
import { carimboDoCatalogo, contarCatalogo } from "@/lib/offline/catalogo";
import { temSinal } from "@/lib/offline/rede";

/** Para onde o shell leva quando há sinal. Fixo na v1 (ver capacitor.config). */
export const URL_DO_SISTEMA = "https://crm.billhigiene.tech";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`elemento #${id} não existe`);
  return el;
};

function avisar(texto: string): void {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.add("visivel");
}

function dinheiro(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function estadoDaLinha(p: PedidoNaFila): string {
  if (p.status === "rejeitado") return `recusado: ${p.ultimo_erro ?? "ver motivo"}`;
  if (p.status === "enviando") return "enviando…";
  const tent = p.tentativas > 0 ? ` (${p.tentativas} tentativas)` : "";
  return `aguardando sinal${tent}`;
}

/**
 * Um botão de ação por linha da fila.
 *
 * `type="button"` porque a lista não é form: sem isto, um Enter no teclado
 * virtual do Android submeteria a página.
 */
function botaoDeAcao(rotulo: string, aoClicar: () => Promise<void>): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = rotulo;
  b.className = "btn secundario";
  b.onclick = () => {
    b.disabled = true;
    void aoClicar().finally(() => {
      b.disabled = false;
    });
  };
  return b;
}

async function renderizar(): Promise<void> {
  const db = await banco();

  const online = await temSinal();
  const sinal = $("sinal");
  sinal.textContent = online ? "● com internet" : "● sem internet — tudo fica salvo aqui";
  sinal.classList.toggle("online", online);
  sinal.classList.toggle("offline", !online);

  const { pendentes, rejeitados } = await contarAbertos(db);
  $("conta-fila").textContent =
    pendentes + rejeitados === 0 ? "" : `(${pendentes + rejeitados})`;

  const lista = $("fila");
  lista.innerHTML = "";
  const aberta = await filaAberta(db);
  $("fila-vazia").style.display = aberta.length === 0 ? "" : "none";
  for (const p of aberta) {
    const li = document.createElement("li");
    const total = totalDoPayload(p.payload);
    li.innerHTML =
      `<strong>${escapeHtml(p.numero_provisorio)}</strong> — ${escapeHtml(nomeDoPayload(p.payload))}<br>` +
      `<span class="miudo">${dinheiro(total)} · ${escapeHtml(estadoDaLinha(p))}</span>`;

    /*
     * ─── Por que a linha recusada tem botão ──────────────────────────────
     *
     * `rejeitado` é terminal por desenho: o servidor disse "não" (crédito,
     * preço, estoque) e repetir sozinho repetiria o mesmo 422 para sempre.
     * Mas terminal sem saída é pedido perdido: o vendedor lia o motivo e não
     * tinha o que tocar. As duas saídas moram aqui — "Tentar de novo" (depois
     * de resolver o motivo) e "Descartar" (o cliente desistiu, o pedido estava
     * errado). Sem elas, a única forma de limpar a fila seria desinstalar.
     */
    const acoes = document.createElement("div");
    acoes.className = "acoes-item";

    if (p.status === "rejeitado") {
      acoes.appendChild(
        botaoDeAcao("Tentar de novo", async () => {
          if (await reabrirRejeitado(db, p.uuid)) {
            avisar(`${p.numero_provisorio} voltou para a fila. Envie abrindo o sistema com internet.`);
          }
          await renderizar();
        }),
      );
    }

    if (p.status !== "enviando") {
      acoes.appendChild(
        botaoDeAcao("Descartar", async () => {
          const mesmo = p.status === "rejeitado" ? "este pedido recusado" : "este pedido";
          if (!window.confirm(`Descartar ${mesmo}? Ele não será enviado e não dá para recuperar.`)) {
            return;
          }
          await descartarPendente(db, p.uuid);
          avisar(`${p.numero_provisorio} descartado.`);
          await renderizar();
        }),
      );
    }

    if (acoes.childElementCount > 0) li.appendChild(acoes);
    lista.appendChild(li);
  }

  const carimbo = await carimboDoCatalogo(db);
  const { produtos, contatos } = await contarCatalogo(db);
  const estadoCat = $("catalogo-estado");
  if (!carimbo || produtos === 0) {
    estadoCat.textContent =
      "Catálogo vazio. Sem ele não dá para capturar pedido — abra o sistema com internet uma vez.";
    $("btn-novo").setAttribute("aria-disabled", "true");
  } else {
    const dias = Math.floor((Date.now() - Date.parse(carimbo)) / 86_400_000);
    estadoCat.textContent =
      `${produtos} produtos, ${contatos} clientes — sincronizado ` +
      (dias <= 0 ? "hoje" : `há ${dias} dia(s)`) +
      `. Preço velho pode ser recusado no envio.`;
    $("btn-novo").removeAttribute("aria-disabled");
  }

  $("btn-catalogo").onclick = () => {
    if (!online) {
      avisar("Sem internet agora. O catálogo atualiza sozinho quando você abrir o sistema com sinal.");
      return;
    }
    // O contexto remoto baixa o catálogo ao abrir (SincronizadorOffline).
    window.location.href = `${URL_DO_SISTEMA}/app/meu-dia`;
  };

  $("btn-sistema").onclick = () => {
    if (!online) {
      avisar("Sem internet — o sistema precisa de sinal. Seus pedidos estão salvos aqui e enviam sozinhos depois.");
      return;
    }
    window.location.href = `${URL_DO_SISTEMA}/app/meu-dia`;
  };

  /*
   * O botão existia no HTML e NÃO tinha handler — tocar nele não fazia nada.
   * É o mesmo defeito do sincronizador não montado, em escala menor: a peça
   * visível sem a ligação. Ele abre o sistema, que é quem tem a sessão e, ao
   * carregar, drena a fila (`SincronizadorOffline`).
   */
  $("btn-enviar").onclick = () => {
    if (pendentes + rejeitados === 0) {
      avisar("Não há pedido esperando envio.");
      return;
    }
    if (rejeitados > 0) {
      avisar("Há pedido recusado na fila — resolva o motivo e toque em “Tentar de novo” antes de enviar.");
      return;
    }
    if (!online) {
      avisar("Sem internet agora. Assim que o sinal voltar, abra o sistema: a fila sobe sozinha.");
      return;
    }
    window.location.href = `${URL_DO_SISTEMA}/app/meu-dia`;
  };

  const btnNovo = $("btn-novo") as HTMLAnchorElement;
  btnNovo.onclick = (e) => {
    if (btnNovo.getAttribute("aria-disabled") === "true") {
      e.preventDefault();
      avisar("Baixe o catálogo primeiro: abra o sistema uma vez com internet.");
    }
  };
}

function nomeDoPayload(payload: Record<string, unknown>): string {
  const nome = payload.cliente_nome;
  return typeof nome === "string" && nome ? nome : "(sem nome)";
}

function totalDoPayload(payload: Record<string, unknown>): number {
  const itens = payload.itens;
  if (!Array.isArray(itens)) return 0;
  return itens.reduce((s: number, it: unknown) => {
    const i = it as { quantidade?: number; preco_unit_cents?: number; desconto_pct?: number };
    const qtd = Number(i.quantidade ?? 0);
    const preco = Number(i.preco_unit_cents ?? 0);
    const desc = Number(i.desconto_pct ?? 0);
    return s + Math.round(qtd * preco * (1 - desc / 100));
  }, 0);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

void renderizar();

if (import.meta.env.DEV) {
  (window as unknown as { __offline: unknown }).__offline = {
    banco,
    URL_DO_SISTEMA,
  };
}
