/**
 * O OVERPASS RESPONDE 200 COM XML DE ERRO — e isso virava "0 empresas".
 *
 * Medido em 12/10/2026 na instalação real: uma varredura de 210 células em
 * Calmon terminou com `encontradas: 0, novas: 0, erros: 0` e status
 * `completed`. Não havia nenhuma empresa porque o espelho estava recusando as
 * consultas com `duplicate_query` — mas devolvia isso como HTTP 200 e XML, e o
 * parser aceitou como se fosse resultado.
 *
 * O pior do modo de falha não é o zero: é o zero **sem erro**. O painel mostra
 * "Encontradas 0 · Erros 0", que é indistinguível de "essa cidade não tem
 * empresas" — e o operador conclui que o dado não existe, não que a fonte
 * estava fora.
 */
import { describe, expect, it, vi } from "vitest";

import { OSMOverpassProvider } from "@/lib/prospeccao/providers/osm";

/** Corpo REAL devolvido pelo espelho (status 200, XML de erro). */
const XML_DUPLICATE_QUERY = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"
    "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta http-equiv="content-type" content="text/html; charset=utf-8"/>
  <title>OSM3S Response</title>
</head>
<body>

<p>The data included in this document is from www.openstreetmap.org.</p>
<p><strong style="color:#FF0000">Error</strong>: runtime error: open64: 0 Success
/osm3s_osm_base Dispatcher_Client::request_read_and_idx::duplicate_query.</p>
</body>
</html>`;

const XML_TIMEOUT = `<?xml version="1.0" encoding="UTF-8"?>
<html><body>
<p><strong style="color:#FF0000">Error</strong>: runtime error: open64: 0 Success
/osm3s_osm_base Dispatcher_Client::request_read_and_idx::timeout.
The server is probably too busy to handle your request.</p>
</body></html>`;

/**
 * Padaria e um dos segmentos que o provider mapeia para `shop=bakery`
 * (lib/prospeccao/providers/osm.ts:109) e o no precisa de `tags.name`, porque
 * o provider descarta elemento sem nome. Sem os dois, o teste passaria por um
 * motivo errado — vazio de filtro, e nao ausencia de erro.
 */
const JSON_OK = JSON.stringify({
  version: 0.6,
  elements: [{ type: "node", id: 1, lat: -26.6, lon: -51.1, tags: { shop: "bakery", name: "Padaria Teste" } }],
});

function providerCom(respostas: Array<{ status: number; corpo: string }>) {
  const fetchMock = vi.fn(async () => {
    const r = respostas.shift() ?? { status: 200, corpo: XML_DUPLICATE_QUERY };
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: new Headers(),
      // `text()` e `json()` coerentes: um Response real so deixa ler o corpo
      // uma vez, e o provider agora parseia o MESMO corpo que inspecionou.
      text: async () => r.corpo,
      json: async () => JSON.parse(r.corpo) as unknown,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return new OSMOverpassProvider({ overpassUrl: "https://exemplo.test/api/interpreter" });
}

const CONSULTA = {
  categoria: "padaria",
  latitude: -26.6,
  longitude: -51.1,
  raioMetros: 5000,
  limite: 20,
};

describe("corpo de erro com status 200", () => {
  it("duplicate_query vira erro, não lista vazia", async () => {
    // A falha medida: 210 células, zero empresas, zero erros.
    const p = providerCom([{ status: 200, corpo: XML_DUPLICATE_QUERY }]);
    await expect(p.search(CONSULTA)).rejects.toThrow(/duplicate_query|overpass_erro_no_corpo/);
  });

  it("o motivo traz o texto do Overpass, não a página inteira", async () => {
    const p = providerCom([{ status: 200, corpo: XML_TIMEOUT }]);
    await expect(p.search(CONSULTA)).rejects.toThrow(/too busy|timeout/);
  });

  it("JSON válido continua passando", async () => {
    const p = providerCom([{ status: 200, corpo: JSON_OK }]);
    const r = await p.search(CONSULTA);
    expect(r.negocios.length).toBeGreaterThan(0);
  });
});