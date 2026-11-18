/**
 * A TELA INICIAL DO SHELL — funciona sem internet, sempre.
 *
 * ─── O que mudou em 18/11/2026 (opção B) ────────────────────────────────────
 *
 * Antes o shell só capturava; quem drenava era o sistema, lendo o mesmo SQLite
 * — o que nunca aconteceu, porque a ponte do Capacitor não atravessa para a
 * origem remota. Agora o shell é dono do ciclo inteiro no aparelho:
 *
 *   1. pareamento (código colado, gerado no sistema com sessão humana);
 *   2. catálogo baixado pelo token do aparelho;
 *   3. dreno da fila por `POST /api/v1/device/orders`, com o MESMO UUID como
 *      `chave_sincronizacao` (timeout + retry não duplicam);
 *   4. 401/403 → "pareie de novo" e a fila FICA (nada é descartado).
 *
 * ─── Por que `window.__offline` só em DEV ───────────────────────────────────
 *
 * O e2e precisa semear o SQLite e ler a fila sem passar pela UI — e não há API
 * local para isso. O namespace some no build de produção
 * (`import.meta.env.DEV`), então o APK não carrega gancho de teste.
 */

import { banco } from "@/lib/offline/db";
import {
  contarAbertos,
  descartarPendente,
  filaAberta,
  reabrirRejeitado,
  type Db,
  type PedidoNaFila,
} from "@/lib/offline/outbox";
import {
  carimboDoCatalogo,
  contarCatalogo,
  sincronizarCatalogoDoDispositivo,
} from "@/lib/offline/catalogo";
import { drenarFila } from "@/lib/offline/sync";
import { buscarComDispositivo, requisitar } from "@/lib/offline/http";
import {
  gravarCredencial,
  lerCodigoDePareamento,
  lerCredencial,
  limparCredencial,
  marcarEstadoDoPareamento,
  type CredencialDoDispositivo,
  type EstadoDoPareamento,
} from "@/lib/offline/credencial";
import { temSinal } from "@/lib/offline/rede";

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
  return `aguardando envio${tent}`;
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

// ─── Estado de execução (módulo, não DOM) ───────────────────────────────────

let credencial: CredencialDoDispositivo | null = null;
let rodando = false;
let relogioDoRetry: ReturnType<typeof setTimeout> | undefined;
let tentativa = 0;

const ESPERA_INICIAL_MS = 30_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

function textoDoEstado(estado: EstadoDoPareamento): string {
  switch (estado) {
    case "pareado":
      return "pareado";
    case "expirado":
      return "credencial expirada — pareie de novo";
    case "revogado":
      return "aparelho desconectado pelo sistema — pareie de novo";
    case "sem_rede":
      return "sem rede — não deu para confirmar o pareamento";
  }
}

// ─── Pareamento ─────────────────────────────────────────────────────────────

async function confirmarCredencial(db: Db): Promise<boolean> {
  if (!credencial) return false;
  try {
    const r = await requisitar(
      `${credencial.url}/api/v1/device/me`,
      { method: "GET" },
      credencial.token,
    );
    if (r.status === 200) {
      const corpo = (await r.corpo()) as {
        data?: {
          nome?: string;
          organizacao?: { nome?: string | null };
          usuario?: { nome?: string | null };
          expires_at?: string;
        };
      };
      credencial = {
        ...credencial,
        nome: corpo.data?.nome ?? credencial.nome,
        organizacao: corpo.data?.organizacao?.nome ?? credencial.organizacao,
        usuario: corpo.data?.usuario?.nome ?? credencial.usuario,
        expiraEm: corpo.data?.expires_at ?? credencial.expiraEm,
        estado: "pareado",
      };
      await gravarCredencial(db, credencial);
      return true;
    }

    const corpo = (await r.corpo()) as { error?: { code?: string } };
    const codigo = corpo?.error?.code;
    const estado: EstadoDoPareamento = codigo === "token_expired" ? "expirado" : "revogado";
    credencial = { ...credencial, estado };
    await marcarEstadoDoPareamento(db, estado);
    return false;
  } catch {
    // Sem rede não invalida a credencial: o servidor pode estar momentaneamente
    // fora. A tela diz que não confirmou, e o dreno tenta de novo depois.
    credencial = { ...credencial, estado: "sem_rede" };
    await marcarEstadoDoPareamento(db, "sem_rede");
    return false;
  }
}

async function parear(db: Db): Promise<void> {
  const entrada = ($("codigo") as HTMLInputElement).value;
  const lido = lerCodigoDePareamento(entrada, credencial?.url ?? null);
  if (!lido) {
    avisar(
      "Código inválido. Copie o código de pareamento inteiro (começa com NEXUS1.) na tela Dispositivos offline do sistema.",
    );
    return;
  }

  const botao = $("btn-parear") as HTMLButtonElement;
  botao.disabled = true;
  try {
    credencial = {
      url: lido.url,
      token: lido.token,
      nome: "aparelho",
      organizacao: null,
      usuario: null,
      expiraEm: "",
      estado: "pareado",
    };
    await gravarCredencial(db, credencial);
    // O código contém o token: some da tela assim que é salvo, mesmo quando a
    // confirmação falha por rede. Deixá-lo visível é segredo à mostra no
    // celular que vai para a rua.
    ($("codigo") as HTMLInputElement).value = "";
    const ok = await confirmarCredencial(db);
    await renderizar();
    if (ok) {
      avisar("Aparelho pareado. Baixando o catálogo…");
      await baixarCatalogo(db);
      await drenar(db);
    } else if (credencial?.estado === "sem_rede") {
      avisar("Credencial salva. Sem rede para confirmar agora — tentaremos de novo.");
    } else {
      avisar(
        `Não foi possível parear: ${textoDoEstado(credencial?.estado ?? "revogado")}. Gere outro código no sistema.`,
      );
    }
  } finally {
    botao.disabled = false;
  }
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

async function baixarCatalogo(db: Db): Promise<void> {
  if (!credencial) {
    avisar("Pareie o aparelho primeiro: o catálogo depende da credencial.");
    return;
  }
  if (!(await temSinal())) {
    avisar("Sem internet agora. O catálogo atualiza sozinho quando o sinal voltar.");
    return;
  }
  try {
    const r = await sincronizarCatalogoDoDispositivo(
      db,
      buscarComDispositivo(credencial.url, credencial.token),
    );
    avisar(`${r.produtos} produtos e ${r.contatos} clientes sincronizados.`);
  } catch (e) {
    avisar(
      `Não deu para baixar o catálogo: ${e instanceof Error ? e.message : "erro"}. O que já estava no aparelho continua valendo.`,
    );
  }
}

// ─── Dreno ──────────────────────────────────────────────────────────────────

async function drenar(db: Db): Promise<void> {
  if (rodando) return;
  if (!credencial) {
    avisar("Pareie o aparelho para enviar os pedidos.");
    return;
  }
  if (!(await temSinal())) return;

  const { pendentes, rejeitados } = await contarAbertos(db);
  if (pendentes + rejeitados === 0) return;

  rodando = true;
  try {
    const r = await drenarFila(
      db,
      buscarComDispositivo(credencial.url, credencial.token),
      undefined,
      "/api/v1/device/orders",
    );

    const parou = r.itens.find((i) => i.resultado === "parado_sem_sessao");
    if (parou) {
      // 401/403: a fila FICA. A tela precisa dizer o motivo exato (expirado ×
      // revogado), então perguntamos ao /device/me em vez de adivinhar.
      await confirmarCredencial(db);
      avisar(
        `O aparelho não está mais autorizado (${textoDoEstado(
          credencial?.estado ?? "revogado",
        )}). Os pedidos continuam salvos aqui — pareie de novo para enviá-los.`,
      );
    } else {
      if (r.aceitos > 0) {
        const numeros = r.itens
          .filter((i) => i.resultado === "aceito" && i.pedido_numero != null)
          .map((i) => i.pedido_numero);
        avisar(
          `${r.aceitos} pedido(s) enviado(s)${numeros.length > 0 ? ` — nº ${numeros.join(", ")}` : ""}.`,
        );
      }
      const rejeitadosAgora = r.itens.filter((i) => i.resultado === "rejeitado");
      if (rejeitadosAgora.length > 0) {
        avisar(
          rejeitadosAgora
            .map((i) => `${i.numero_provisorio}: ${i.motivo ?? "recusado"}`)
            .join(" · "),
        );
      }
      // "Adiado" (sem rede, timeout, 5xx) precisa de aviso PRÓPRIO: o dreno
      // trata a falha por item e devolve normalmente, então sem esta linha a
      // tela fica idêntica a "nada aconteceu" — o vendedor acha que enviou.
      // Medido no emulador em 18/11/2026: fila com 1 pedido, host inválido,
      // nenhum aviso na tela.
      if (
        r.adiados > 0 &&
        r.aceitos === 0 &&
        rejeitadosAgora.length === 0 &&
        !r.itens.some((i) => i.resultado === "parado_sem_sessao")
      ) {
        const motivo = r.itens.find((i) => i.resultado === "adiado")?.motivo;
        avisar(
          `Sem conexão com o sistema${motivo ? ` (${motivo})` : ""}. Os pedidos continuam na fila e sobem sozinhos quando o sinal voltar.`,
        );
      }
      if (r.retomados > 0 && r.aceitos === 0) {
        avisar(`${r.retomados} pedido(s) retomado(s) de envio interrompido. Tentando de novo.`);
      }
    }
  } catch (e) {
    credencial = credencial ? { ...credencial, estado: "sem_rede" } : null;
    if (credencial) await marcarEstadoDoPareamento(db, "sem_rede");
    avisar(
      `Sem conexão com o sistema: ${e instanceof Error ? e.message : "erro"}. Os pedidos continuam na fila.`,
    );
  } finally {
    rodando = false;
    // Repinta DEPOIS do dreno. Medido no emulador em 18/11/2026: o aviso dizia
    // "2 pedido(s) enviado(s) — nº 65, 66" e a lista continuava mostrando os
    // dois como "aguardando envio", com (2) no cabeçalho. O dado estava certo
    // no SQLite; a tela é que tinha sido desenhada antes do dreno e ninguém a
    // desenhou de novo.
    await renderizar();
  }
}

/** Agenda a próxima tentativa com backoff; uma por vez, sempre. */
async function agendarSePreciso(db: Db): Promise<void> {
  if (relogioDoRetry) clearTimeout(relogioDoRetry);
  relogioDoRetry = undefined;

  if (!credencial || credencial.estado === "expirado" || credencial.estado === "revogado") return;

  const { pendentes, rejeitados } = await contarAbertos(db);
  const carimbo = await carimboDoCatalogo(db);
  // Catálogo velho (>7 dias) também merece uma tentativa; fila é prioridade.
  const catalogoVelho = !carimbo || Date.now() - Date.parse(carimbo) > 7 * 24 * 60 * 60 * 1000;
  if (pendentes + rejeitados === 0 && !catalogoVelho) {
    tentativa = 0;
    return;
  }

  tentativa += 1;
  const espera = Math.min(ESPERA_INICIAL_MS * 2 ** (tentativa - 1), ESPERA_MAXIMA_MS);
  relogioDoRetry = setTimeout(() => {
    void (async () => {
      const db2 = await banco();
      if (catalogoVelho && pendentes + rejeitados === 0) await baixarCatalogo(db2);
      else await drenar(db2);
    })();
  }, espera);
}

// ─── Render ─────────────────────────────────────────────────────────────────

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

function nomeDoPayload(payload: Record<string, unknown>): string {
  const nome = payload.cliente_nome;
  return typeof nome === "string" && nome ? nome : "(sem nome)";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function renderizar(): Promise<void> {
  const db = await banco();
  credencial = await lerCredencial(db);

  const online = await temSinal();
  const sinal = $("sinal");
  sinal.textContent = online ? "● com internet" : "● sem internet — tudo fica salvo aqui";
  sinal.classList.toggle("online", online);
  sinal.classList.toggle("offline", !online);

  // Marca da organização vem do pareamento — o APK é um só para todas.
  $("titulo").textContent = credencial?.organizacao || "Pedidos offline";

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
     * A linha recusada tem saída. `rejeitado` é terminal por desenho (o 422 se
     * repetiria para sempre), mas terminal sem saída é pedido perdido: o
     * vendedor lia o motivo e não tinha o que tocar.
     */
    const acoes = document.createElement("div");
    acoes.className = "acoes-item";
    if (p.status === "rejeitado") {
      acoes.appendChild(
        botaoDeAcao("Tentar de novo", async () => {
          if (await reabrirRejeitado(db, p.uuid)) {
            // Sem credencial não há para onde enviar: dizer "tentando" e
            // sobrescrever com "pareie" seria mensagem que se contradiz.
            avisar(
              `${p.numero_provisorio} voltou para a fila.` +
                (credencial ? " Tentando enviar…" : " Pareie o aparelho para enviar."),
            );
            if (credencial) await drenar(db);
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

  // ─── Pareamento ──────────────────────────────────────────────────────────
  const estado = $("aparelho-estado");
  const texto = $("aparelho-texto");
  const campo = $("codigo") as HTMLInputElement;
  const btnParear = $("btn-parear") as HTMLButtonElement;
  const btnDesconectar = $("btn-desconectar") as HTMLButtonElement;

  if (!credencial) {
    estado.textContent = "não pareado";
    texto.textContent =
      "Gere um código em Configurações → Dispositivos offline (no sistema) e cole abaixo. É o que liga este aparelho à sua empresa.";
    campo.style.display = "";
    btnParear.style.display = "";
    btnDesconectar.style.display = "none";
  } else {
    estado.textContent = textoDoEstado(credencial.estado);
    const expira = credencial.expiraEm ? new Date(credencial.expiraEm) : null;
    const prazo =
      expira && !Number.isNaN(expira.getTime())
        ? ` Expira em ${expira.toLocaleDateString("pt-BR")}.`
        : "";
    texto.textContent =
      `Aparelho “${credencial.nome}”` +
      (credencial.usuario ? ` de ${credencial.usuario}` : "") +
      (credencial.organizacao ? ` — ${credencial.organizacao}` : "") +
      `.${prazo}`;
    // Pareado e saudável: o campo só volta se a credencial morreu.
    const precisaReparear = credencial.estado !== "pareado";
    campo.style.display = precisaReparear ? "" : "none";
    btnParear.style.display = precisaReparear ? "" : "none";
    btnParear.textContent = "Parear de novo";
    btnDesconectar.style.display = "";
  }

  // ─── Catálogo ────────────────────────────────────────────────────────────
  const carimbo = await carimboDoCatalogo(db);
  const { produtos, contatos } = await contarCatalogo(db);
  const estadoCat = $("catalogo-estado");
  const btnNovo = $("btn-novo") as HTMLAnchorElement;

  if (!credencial) {
    estadoCat.textContent =
      "Pareie o aparelho para baixar o catálogo. Sem catálogo não dá para capturar pedido.";
    btnNovo.setAttribute("aria-disabled", "true");
  } else if (!carimbo || produtos === 0) {
    estadoCat.textContent = online
      ? "Catálogo vazio. Toque em “Baixar catálogo agora”."
      : "Catálogo vazio e sem internet. Conecte para baixar antes de capturar.";
    btnNovo.setAttribute("aria-disabled", "true");
  } else {
    const dias = Math.floor((Date.now() - Date.parse(carimbo)) / 86_400_000);
    estadoCat.textContent =
      `${produtos} produtos, ${contatos} clientes — sincronizado ` +
      (dias <= 0 ? "hoje" : `há ${dias} dia(s)`) +
      `. Preço velho pode ser recusado no envio.`;
    btnNovo.removeAttribute("aria-disabled");
  }

  // ─── Ações ───────────────────────────────────────────────────────────────
  btnParear.onclick = () => void parear(db);

  btnDesconectar.onclick = async () => {
    if (
      !window.confirm(
        "Desconectar este aparelho? Os pedidos na fila continuam salvos, mas só sobem depois de parear de novo.",
      )
    ) {
      return;
    }
    await limparCredencial(db);
    credencial = null;
    avisar("Aparelho desconectado. A fila continua aqui.");
    await renderizar();
  };

  btnNovo.onclick = (e) => {
    if (btnNovo.getAttribute("aria-disabled") === "true") {
      e.preventDefault();
      avisar(
        credencial
          ? "Baixe o catálogo primeiro: sem preço não dá para capturar."
          : "Pareie o aparelho e baixe o catálogo antes de capturar.",
      );
    }
  };

  $("btn-catalogo").onclick = () => void baixarCatalogo(db);

  $("btn-sistema").onclick = () => {
    if (!credencial) {
      avisar("Pareie o aparelho primeiro: o endereço do sistema vem do código.");
      return;
    }
    if (!online) {
      avisar("Sem internet — o sistema precisa de sinal. Seus pedidos estão salvos aqui.");
      return;
    }
    window.location.href = `${credencial.url}/app/meu-dia`;
  };

  $("btn-enviar").onclick = () => {
    if (pendentes + rejeitados === 0) {
      avisar("Não há pedido esperando envio.");
      return;
    }
    if (!credencial) {
      avisar("Pareie o aparelho para enviar os pedidos.");
      return;
    }
    if (rejeitados > 0) {
      avisar(
        "Há pedido recusado na fila — resolva o motivo e toque em “Tentar de novo” antes de enviar.",
      );
      return;
    }
    if (!online) {
      avisar("Sem internet agora. Assim que o sinal voltar, a fila sobe sozinha.");
      return;
    }
    void drenar(db);
  };

  await agendarSePreciso(db);
}

void (async () => {
  const db = await banco();
  await renderizar();
  await drenar(db);
})();

window.addEventListener("online", () => void renderizar());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void renderizar();
});

if (import.meta.env.DEV) {
  (window as unknown as { __offline: unknown }).__offline = {
    banco,
    lerCredencial,
    gravarCredencial,
    limparCredencial,
  };
}
