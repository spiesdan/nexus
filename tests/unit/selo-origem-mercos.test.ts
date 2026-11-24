/**
 * O selo diz DE ONDE o pedido veio — não repete o número (que já está na
 * linha). Pedido local não ganha selo de ERP.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

describe("selo (Mercos)", () => {
  const pills = ler("app/app/pedidos/_pills.tsx");

  it("só aparece com numero_mercos", () => {
    expect(pills).toContain("if (numeroMercos == null) return null;");
  });

  it("ícone decorativo, texto carrega o significado, sem número no selo", () => {
    const bloco = pills.slice(pills.indexOf("export function SeloMercos"));
    expect(bloco).toContain('aria-hidden');
    expect(bloco).toContain("(Mercos)");
    expect(bloco).not.toContain("numeroMercos}"); // nunca imprime o número
  });

  it("390: quebra linha em vez de empurrar status/cliente", () => {
    const lista = ler("app/app/pedidos/_client.tsx");
    expect(lista).toContain("flex flex-wrap items-center gap-x-2 gap-y-1");
  });

  it("nos dois lugares, ao lado do status", () => {
    const lista = ler("app/app/pedidos/_client.tsx");
    const ficha = ler("app/app/pedidos/[id]/_detalhe.tsx");
    expect(lista.split("SeloMercos numeroMercos={p.numero_mercos}").length - 1).toBe(2); // cartão + mesa
    expect(ficha).toContain("SeloMercos numeroMercos={pedido.numero_mercos}");
    expect(ficha.split("SeloMercos").length - 1).toBe(2); // import + uso
  });

  it("a coluna chega da API para lista e ficha", () => {
    expect(ler("lib/schemas/pedidos.ts")).toContain("id, numero, numero_mercos, contact_id");
  });
});
