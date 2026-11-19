/**
 * UM WAHA DE VERDADE NO FIO, CONTROLÁVEL — para provar envio, falha e recuperação.
 *
 * A doutrina de QA Visual pede **receiver real** para efeito colateral externo:
 * mock no módulo prova que a função foi chamada, não que o HTTP saiu e voltou.
 * Aqui o app fala com `http://127.0.0.1:<porta>` (o `WAHA_API_BASE_URL` do
 * `.env.e2e`) de verdade — o servidor abaixo implementa só as duas rotas que o
 * caminho de envio usa:
 *
 *   - `POST /api/sendText` — o envio em si;
 *   - `GET  /api/contacts/check-exists` — o nono dígito, chamado antes do envio
 *     quando o destinatário é `@c.us` (`resolveCanonicalCusChatId`).
 *
 * O `modo` é mutável em tempo de execução: `falha` devolve 500 (o transporte
 * recusa, a bolha vira "Falhou" com "Reenviar") e `ok` devolve o id no formato
 * do NOWEB. É o que permite provar, na MESMA sessão de navegador, o caminho
 * feliz, o erro e a recuperação depois do erro — sem reiniciar app nem banco.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type ModoDoStub = "ok" | "falha";

export interface EnvioRecebido {
  session: string;
  chatId: string;
  text: string;
}

export interface WahaDeTeste {
  /** Muda o desfecho do PRÓXIMO `/api/sendText`. */
  modo: ModoDoStub;
  /** Tudo o que o app mandou de verdade — a prova de que o HTTP saiu. */
  enviados: EnvioRecebido[];
  fechar(): Promise<void>;
}

function corpo(req: IncomingMessage): Promise<string> {
  return new Promise((ok, erro) => {
    const pedacos: Buffer[] = [];
    req.on("data", (p: Buffer) => pedacos.push(p));
    req.on("end", () => ok(Buffer.concat(pedacos).toString("utf8")));
    req.on("error", erro);
  });
}

function json(res: ServerResponse, status: number, dados: unknown): void {
  const texto = JSON.stringify(dados);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(texto),
  });
  res.end(texto);
}

/**
 * Sobe o stub na porta indicada. Falha ALTO se a porta estiver ocupada: um
 * `EADDRINUSE` silencioso faria o app falar com outro processo e o teste
 * mediria a coisa errada com o nome certo.
 */
export async function subirWahaDeTeste(porta: number): Promise<WahaDeTeste> {
  const enviados: EnvioRecebido[] = [];
  const estado = { modo: "ok" as ModoDoStub };

  const servidor: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${porta}`);

      if (url.pathname === "/api/contacts/check-exists") {
        const phone = (url.searchParams.get("phone") ?? "").replace(/\D/g, "");
        // `numberExists: true` com o chatId canônico: é o que o adapter espera
        // para não cair no fallback e mandar para o número como veio.
        json(res, 200, { numberExists: true, chatId: `${phone}@c.us`, pn: `${phone}@c.us` });
        return;
      }

      if (url.pathname === "/api/sendText" && req.method === "POST") {
        const bruto = await corpo(req);
        if (estado.modo === "falha") {
          json(res, 500, { message: "stub: transporte recusou o envio" });
          return;
        }
        let payload: { session?: string; chatId?: string; text?: string } = {};
        try {
          payload = JSON.parse(bruto) as typeof payload;
        } catch {
          json(res, 400, { message: "corpo inválido" });
          return;
        }
        enviados.push({
          session: payload.session ?? "",
          chatId: payload.chatId ?? "",
          text: payload.text ?? "",
        });
        // Formato NOWEB: `{ id: { id: "3EB0…" } }` — o shape que
        // `parseWahaMessageId` lê (o `_serialized` do WEBJS também serve).
        json(res, 200, {
          id: { id: `3EB0${Date.now().toString(16).toUpperCase()}${enviados.length}` },
        });
        return;
      }

      json(res, 404, { message: `stub WAHA não implementa ${req.method} ${url.pathname}` });
    })().catch(() => {
      if (!res.headersSent) json(res, 500, { message: "stub WAHA falhou" });
      else res.end();
    });
  });

  await new Promise<void>((ok, erro) => {
    servidor.once("error", erro);
    servidor.listen(porta, "127.0.0.1", () => ok());
  });

  return {
    get modo() {
      return estado.modo;
    },
    set modo(novo: ModoDoStub) {
      estado.modo = novo;
    },
    enviados,
    fechar: () =>
      new Promise<void>((ok, erro) => {
        servidor.close((e) => (e ? erro(e) : ok()));
      }),
  };
}

/** A porta que o `.env.e2e` aponta. Exportada para o teste não redigitar. */
export function portaDoWahaDoEnv(): number {
  const url = process.env.WAHA_API_BASE_URL ?? "";
  try {
    return Number(new URL(url).port) || 3999;
  } catch {
    return 3999;
  }
}
