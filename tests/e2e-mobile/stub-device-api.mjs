#!/usr/bin/env node
/**
 * STUB DO LADO SERVIDOR — para provar o dreno ACEITO no emulador sem produção.
 *
 * ─── Por que existe ────────────────────────────────────────────────────────
 *
 * O caminho de falha já está provado no aparelho. O caminho de sucesso precisa
 * de um servidor que responda os contratos de `/api/v1/device/*`; apontar o
 * emulador para a instalação de alguém é proibido (e apontar para a nossa é
 * produção). Este stub responde exatamente os formatos que as rotas reais
 * devolvem — o que ele NÃO prova é a regra de negócio (crédito, estoque,
 * `criarPedidoComercial`), que é a mesma função reaproveitada e tem teste
 * unit/invariante; aqui se prova o COMPORTAMENTO DO SHELL: drenar, aceitar,
 * limpar a fila, e 401 manter a fila.
 *
 * ─── Como rodar ────────────────────────────────────────────────────────────
 *
 *   node tests/e2e-mobile/stub-device-api.mjs                # aceita pedidos
 *   REVOKED=1 node tests/e2e-mobile/stub-device-api.mjs      # 401 token_revoked
 *
 *   adb reverse tcp:8787 tcp:8787
 *   # no aparelho, pareie com url http://10.0.2.2:8787 (build DEBUG libera
 *   # cleartext só para 10.0.2.2/localhost)
 *
 * Idempotência: a mesma `chave_sincronizacao` devolve o pedido já criado com
 * `ja_existia: true` — igual à rota real, que relê antes de validar.
 */
import { createServer } from "node:http";

const PORTA = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.TOKEN ?? "nod_aaaaaaaa_0123456789abcdef0123456789abcdef01234567";
const REVOGADO = process.env.REVOKED === "1";

const pedidos = new Map(); // chave_sincronizacao -> { id, numero }
let proximoNumero = 1234;

function json(res, status, corpo) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
}

function autorizado(req) {
  const h = req.headers.authorization ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m?.[1] === TOKEN;
}

function recusar(res) {
  json(res, 401, {
    error: {
      code: REVOGADO ? "token_revoked" : "unauthenticated",
      message: REVOGADO
        ? "Este aparelho foi desconectado. Gere uma nova credencial no sistema."
        : "Credencial do aparelho inválida.",
    },
  });
}

const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  console.log(`[stub] ${req.method} ${url.pathname}${url.search}`);

  if (!url.pathname.startsWith("/api/v1/device/")) {
    return json(res, 404, { error: { code: "not_found", message: "stub" } });
  }
  if (!autorizado(req)) return recusar(res);

  if (url.pathname === "/api/v1/device/me" && req.method === "GET") {
    return json(res, 200, {
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        nome: "Aparelho de teste",
        organizacao: { id: "00000000-0000-4000-8000-000000000002", nome: "Higiene Teste" },
        usuario: { id: "00000000-0000-4000-8000-000000000003", nome: "Vendedor Teste" },
        scopes: ["offline:pedidos:write", "offline:catalogo:read"],
        expires_at: "2027-02-18T10:00:00.000Z",
      },
    });
  }

  if (url.pathname === "/api/v1/device/catalog" && req.method === "GET") {
    return json(res, 200, {
      data: {
        produtos: [
          {
            id: "prod-teste-1",
            codigo: "SKU-1",
            nome: "Sabonete de glicerina 90g",
            preco_cents: 450,
            controla_estoque: true,
            quantidade: 100,
            ativo: true,
          },
        ],
        contatos: [
          {
            id: "cont-teste-1",
            nome: "Mercadinho do Zé",
            documento: "12345678000199",
            cidade: "Ribeirão Preto",
            limite_cents: 500000,
          },
        ],
        tabelas: [],
      },
      meta: { cursor: null, has_more: false },
    });
  }

  if (url.pathname === "/api/v1/device/orders" && req.method === "POST") {
    let bruto = "";
    req.on("data", (c) => (bruto += c));
    req.on("end", () => {
      let corpo = {};
      try {
        corpo = JSON.parse(bruto);
      } catch {
        return json(res, 422, { error: { code: "validation_failed", message: "JSON inválido" } });
      }
      const chave = corpo.chave_sincronizacao;
      if (!chave) {
        return json(res, 422, {
          error: { code: "validation_failed", message: "Sem chave_sincronizacao" },
        });
      }
      const existente = pedidos.get(chave);
      if (existente) {
        console.log(`[stub] replay ${chave} -> ${existente.numero}`);
        return json(res, 200, { data: { ...existente, ja_existia: true } });
      }
      const criado = { id: `pedido-${proximoNumero}`, numero: proximoNumero++ };
      pedidos.set(chave, criado);
      console.log(`[stub] criado ${chave} -> ${criado.numero}`);
      return json(res, 201, { data: { ...criado, ja_existia: false } });
    });
    return;
  }

  return json(res, 404, { error: { code: "not_found", message: "stub" } });
});

servidor.listen(PORTA, "0.0.0.0", () => {
  console.log(
    `[stub] ouvindo em :${PORTA} — ${REVOGADO ? "REVOGADO (401)" : "aceitando pedidos"}; token ${TOKEN.slice(0, 12)}…`,
  );
});
