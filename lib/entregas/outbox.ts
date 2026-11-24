/**
 * O OUTBOX DO ENTREGADOR — a rota funciona sem internet.
 *
 * O motorista perde sinal no meio da rota: o desfecho (cheguei, entregue,
 * devolvido) é gravado no aparelho na hora do fato — com GPS e
 * `ocorrido_em` — e enviado quando a internet voltar. Sem isto, ou ele
 * anota no papel (e alguém redigita), ou a entrega "acontece" na hora do
 * envio (mentira no histórico).
 *
 * Armazenamento: `localStorage` (desfechos são JSON pequeno). Decisão (b):
 * sem conexão a cabine NÃO aceita foto — registra o desfecho com o motivo
 * `sem_conexao`, e foto só pode ser enviada online pelo endpoint de proof.
 * Blob em IndexedDB foi descartado: o outbox guarda só desfechos JSON.
 */

import { randomId } from "@/lib/random-id";
import type { MotivoDevolucao } from "@/lib/schemas/expedicao";

export const MOTIVO_FOTO_SEM_CONEXAO = "Foto precisa de conexão — desfecho registrado sem foto.";

export function registroDeFoto(conectado: boolean): { estado: "sem_conexao"; motivo: string } | null {
  return conectado ? null : { estado: "sem_conexao", motivo: MOTIVO_FOTO_SEM_CONEXAO };
}

export interface DesfechoPendente {
  id: string;
  cargaId: string;
  orderId: string;
  status: "em_atendimento" | "entregue" | "devolvido";
  motivo?: MotivoDevolucao;
  latitude?: number;
  longitude?: number;
  /** ISO-8601 de quando aconteceu (vale no servidor, não a hora do envio). */
  ocorrido_em: string;
  /** Decisão (b): sem conexão, sem foto — o motivo vai junto do desfecho. */
  foto?: { estado: "sem_conexao"; motivo: string } | null;
  tentativas: number;
  erro?: string | null;
  criado_em: string;
}

export interface ArmazenLocal {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

const CHAVE_OUTBOX = "entregas-outbox-v1";
const CHAVE_ROTA = "entregas-rota-v1";
/** Instante do último descarte bem-sucedido da fila (P1-24). */
const CHAVE_ULTIMA_SYNC = "entregas-ultima-sync-v1";

function memoria(): ArmazenLocal | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function carregarOutbox(store?: ArmazenLocal | null): DesfechoPendente[] {
  const s = store ?? memoria();
  if (!s) return store === undefined ? [] : [];
  try {
    const cru = s.getItem(CHAVE_OUTBOX);
    if (!cru) return [];
    const lista = JSON.parse(cru) as unknown;
    return Array.isArray(lista) ? (lista as DesfechoPendente[]) : [];
  } catch {
    return [];
  }
}

function gravarOutbox(lista: DesfechoPendente[], store?: ArmazenLocal | null): void {
  const s = store ?? memoria();
  if (!s) return;
  try {
    s.setItem(CHAVE_OUTBOX, JSON.stringify(lista));
  } catch {
    // Armazenamento cheio/bloqueado: o desfecho da memória segue valendo
    // nesta sessão; na próxima abertura a fila recomeça vazia.
  }
}

export function enfileirarDesfecho(
  entrada: Omit<DesfechoPendente, "id" | "tentativas" | "criado_em" | "erro" | "foto"> & { conectado?: boolean },
  store?: ArmazenLocal | null,
): DesfechoPendente {
  const conectado = entrada.conectado ?? false;
  const { conectado: _conectado, ...resto } = entrada;
  const item: DesfechoPendente = {
    ...resto,
    foto: registroDeFoto(conectado),
    id: randomId(),
    tentativas: 0,
    erro: null,
    criado_em: new Date().toISOString(),
  };
  const lista = carregarOutbox(store);
  // Um pedido, um desfecho pendente: remarcar substitui, nunca duplica.
  gravarOutbox([...lista.filter((d) => d.orderId !== item.orderId), item], store);
  return item;
}

export function removerDesfecho(id: string, store?: ArmazenLocal | null): void {
  gravarOutbox(carregarOutbox(store).filter((d) => d.id !== id), store);
}

export function pendentesDaCarga(cargaId: string, store?: ArmazenLocal | null): DesfechoPendente[] {
  return carregarOutbox(store).filter((d) => d.cargaId === cargaId);
}

/** orderId → status pendente (para pintar a lista antes do servidor saber). */
export function mapaPendentes(cargaId: string, store?: ArmazenLocal | null): Map<string, DesfechoPendente> {
  return new Map(pendentesDaCarga(cargaId, store).map((d) => [d.orderId, d]));
}

export interface ResultadoDescarga {
  enviados: number;
  falhas: { id: string; orderId: string; erro: string }[];
}

/**
 * Envia a fila em ordem de criação. Falha numa, as outras seguem — a que
 * falhou fica com `tentativas+1` e o motivo, para a próxima rodada.
 */
export async function descarregarOutbox(
  enviar: (item: DesfechoPendente) => Promise<void>,
  store?: ArmazenLocal | null,
): Promise<ResultadoDescarga> {
  const lista = carregarOutbox(store);
  let enviados = 0;
  const falhas: ResultadoDescarga["falhas"] = [];
  const restantes: DesfechoPendente[] = [];
  for (const item of lista) {
    try {
      await enviar(item);
      enviados++;
    } catch (e) {
      const erro = e instanceof Error ? e.message : "falha no envio";
      restantes.push({ ...item, tentativas: item.tentativas + 1, erro });
      falhas.push({ id: item.id, orderId: item.orderId, erro });
    }
  }
  gravarOutbox(restantes, store);
  return { enviados, falhas };
}

/** Rota da carga para abrir offline (última vista com internet). */
export function salvarRotaLocal<T>(cargaId: string, rota: T, store?: ArmazenLocal | null): void {
  const s = store ?? memoria();
  if (!s) return;
  try {
    s.setItem(`${CHAVE_ROTA}:${cargaId}`, JSON.stringify({ em: new Date().toISOString(), rota }));
  } catch {
    // Sem espaço: a rota ao vivo segue valendo nesta sessão.
  }
}

export function lerRotaLocal<T>(cargaId: string, store?: ArmazenLocal | null): T | null {
  const s = store ?? memoria();
  if (!s) return null;
  try {
    const cru = s.getItem(`${CHAVE_ROTA}:${cargaId}`);
    if (!cru) return null;
    return (JSON.parse(cru) as { rota: T }).rota ?? null;
  } catch {
    return null;
  }
}


/**
 * Última sincronização bem-sucedida, no mesmo `store` injetável da fila.
 * Só é gravada quando `descarregarOutbox` enviou pelo menos um desfecho —
 * " Sincronizado" não pode mentir sobre uma rodada que não aconteceu.
 */
export function registrarUltimaSincronizacao(
  agoraIso: string = new Date().toISOString(),
  store?: ArmazenLocal | null,
): void {
  const s = store ?? memoria();
  if (!s) return;
  try {
    s.setItem(CHAVE_ULTIMA_SYNC, agoraIso);
  } catch {
    /* armazenamento cheio: o horário não é crítico para a entrega */
  }
}

export function lerUltimaSincronizacao(store?: ArmazenLocal | null): string | null {
  const s = store ?? memoria();
  if (!s) return null;
  try {
    return s.getItem(CHAVE_ULTIMA_SYNC);
  } catch {
    return null;
  }
}
