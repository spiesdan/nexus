/**
 * O DRENO DA FILA — manda o que está pendente, na ordem em que foi capturado.
 *
 * ─── O contrato com o servidor ──────────────────────────────────────────────
 *
 * Cada item sai com `{ ...payload, chave_sincronizacao: uuid }`. O servidor
 * (0263) devolve o pedido existente no retry — então um timeout depois do
 * commit não duplica. Sem a chave, este arquivo seria uma máquina de pedidos
 * dobrados.
 *
 * ─── O que cada resposta vira ───────────────────────────────────────────────
 *
 *   200/201            → `aceito`, com id e número definitivos.
 *   200/201 + ja_existia → `aceito` do mesmo jeito: o pedido JÁ era nosso,
 *                          de uma tentativa anterior que o timeout engoliu.
 *   422                → `rejeitado` com a mensagem DO SERVIDOR (crédito,
 *                        preço, estoque). Não tenta sozinho.
 *   timeout / sem rede → volta para `pendente`, tentativa contada.
 *   401/403            → PARA TUDO. A sessão morreu; continuar mandando
 *                        enfileiraria 422s que não são do pedido. O vendedor
 *                        precisa abrir o sistema e logar de novo.
 *
 * ─── Por que FIFO ───────────────────────────────────────────────────────────
 *
 * A numeração do servidor segue a ordem de chegada. Drenar fora de ordem
 * embaralha os números em relação à ordem em que o vendedor capturou — e é a
 * ordem de captura que ele conta para o cliente ("o seu foi o terceiro").
 *
 * ─── Por que o `fetch` é injetado ───────────────────────────────────────────
 *
 * No contexto remoto é o `fetch` do navegador (cookies da sessão vão juntos).
 * No shell é o `CapacitorHttp` (sem cookies — por isso o sync da v1 roda no
 * contexto remoto). O teste injeta um fake e mede as transições, não a rede.
 */

import {
  devolverParaFila,
  filaPendente,
  marcarAceito,
  marcarRejeitado,
  reservarParaEnvio,
  type Db,
} from "./outbox";

export interface ResultadoDoItem {
  uuid: string;
  numero_provisorio: string;
  resultado: "aceito" | "rejeitado" | "adiado" | "parado_sem_sessao";
  pedido_numero?: number;
  motivo?: string;
}

export interface ResultadoDoDreno {
  itens: ResultadoDoItem[];
  aceitos: number;
  rejeitados: number;
  adiados: number;
}

type FetchDoSync = (
  url: string,
  init: { method: string; body: string },
) => Promise<{
  status: number;
  corpo: () => Promise<unknown>;
}>;

const TEMPO_LIMITE_MS = 30_000;

export async function drenarFila(
  db: Db,
  buscar: FetchDoSync,
  agora: () => string = () => new Date().toISOString(),
): Promise<ResultadoDoDreno> {
  const saida: ResultadoDoDreno = { itens: [], aceitos: 0, rejeitados: 0, adiados: 0 };

  for (const item of await filaPendente(db)) {
    // A reserva é o que impede dois drenos de mandarem o mesmo pedido — ver
    // `reservarParaEnvio`. Sem ela, abrir o sistema com o evento `online`
    // disparando junto duplicaria o POST (e aí só a chave salvaria).
    const reservado = await reservarParaEnvio(db, item.uuid);
    if (!reservado) continue;

    let resposta: { status: number; corpo: () => Promise<unknown> };
    try {
      resposta = await comTempoLimite(
        buscar("/api/v1/commercial-orders", {
          method: "POST",
          body: JSON.stringify({ ...item.payload, chave_sincronizacao: item.uuid }),
        }),
      );
    } catch (e) {
      await devolverParaFila(db, {
        uuid: item.uuid,
        erro: e instanceof Error ? e.message : "sem conexão",
      });
      saida.adiados++;
      saida.itens.push({
        uuid: item.uuid,
        numero_provisorio: item.numero_provisorio,
        resultado: "adiado",
        motivo: "sem conexão",
      });
      continue;
    }

    if (resposta.status === 401 || resposta.status === 403) {
      // A sessão morreu. Devolve a linha e PARA: os próximos itens dariam o
      // mesmo 401, e cada um contaria uma tentativa à toa.
      await devolverParaFila(db, {
        uuid: item.uuid,
        erro: "sessão expirada — abra o sistema e entre de novo",
      });
      saida.itens.push({
        uuid: item.uuid,
        numero_provisorio: item.numero_provisorio,
        resultado: "parado_sem_sessao",
        motivo: "sessão expirada — abra o sistema e entre de novo",
      });
      break;
    }

    if (resposta.status === 200 || resposta.status === 201) {
      const corpo = (await resposta.corpo()) as {
        data?: { id?: string; numero?: number; ja_existia?: boolean };
      };
      const pedidoId = corpo.data?.id;
      const pedidoNumero = corpo.data?.numero;
      if (typeof pedidoId === "string" && typeof pedidoNumero === "number") {
        await marcarAceito(db, {
          uuid: item.uuid,
          pedido_id: pedidoId,
          pedido_numero: pedidoNumero,
          agora: agora(),
        });
        saida.aceitos++;
        saida.itens.push({
          uuid: item.uuid,
          numero_provisorio: item.numero_provisorio,
          resultado: "aceito",
          pedido_numero: pedidoNumero,
        });
      } else {
        // 200 sem id/número é resposta que não se entende — e confirmar sem
        // entender seria dizer "foi" para um pedido que talvez não foi.
        await devolverParaFila(db, { uuid: item.uuid, erro: "resposta incompleta do servidor" });
        saida.adiados++;
        saida.itens.push({
          uuid: item.uuid,
          numero_provisorio: item.numero_provisorio,
          resultado: "adiado",
          motivo: "resposta incompleta do servidor",
        });
      }
      continue;
    }

    if (resposta.status === 422) {
      const corpo = (await resposta.corpo()) as { error?: { message?: string } };
      const motivo = corpo.error?.message ?? "recusado pelo servidor";
      await marcarRejeitado(db, { uuid: item.uuid, motivo, agora: agora() });
      saida.rejeitados++;
      saida.itens.push({
        uuid: item.uuid,
        numero_provisorio: item.numero_provisorio,
        resultado: "rejeitado",
        motivo,
      });
      continue;
    }

    // 500 e o resto: não é culpa do pedido, então não é rejeição. Volta para
    // a fila — o próximo dreno tenta de novo.
    await devolverParaFila(db, { uuid: item.uuid, erro: `servidor respondeu ${resposta.status}` });
    saida.adiados++;
    saida.itens.push({
      uuid: item.uuid,
      numero_provisorio: item.numero_provisorio,
      resultado: "adiado",
      motivo: `servidor respondeu ${resposta.status}`,
    });
  }

  return saida;
}

/** Timeout próprio: um POST pendurado trava a fila inteira atrás dele. */
async function comTempoLimite<T>(promessa: Promise<T>, ms = TEMPO_LIMITE_MS): Promise<T> {
  let soltar: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<never>((_, rejeitar) => {
        soltar = setTimeout(() => rejeitar(new Error("tempo esgotado (30s)")), ms);
      }),
    ]);
  } finally {
    if (soltar) clearTimeout(soltar);
  }
}
