/**
 * O MANIFESTO PWA — três coisas que a instalação exige e uma que a marca exige.
 *
 * ─── Por que um teste, se é "só um objeto" ─────────────────────────────────
 *
 * Porque o objeto é a única coisa que o navegador lê para decidir se oferece
 * "Instalar". Um ícone apagado, um `display` trocado ou um `start_url` movido
 * não quebram build, lint nem tela — quebram a instalação, em silêncio, no
 * celular de quem usa. E nome de instalação específica aqui violaria a
 * doutrina white-label: a imagem é uma só para todos os revendedores
 * (`tests/unit/branding.test.ts` varre `app/`, então este teste cobre o
 * arquivo por outro ângulo: a marca que sai no manifest é neutra).
 */
import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

const m = manifest();

describe("manifest PWA", () => {
  it("declara a identidade da instalação", () => {
    // `id` explícito: sem ele o navegador usa `start_url`, e mudar a rota
    // inicial criaria um SEGUNDO app instalado em vez de atualizar o existente.
    expect(m.id).toBe("/");
    expect(m.start_url).toBe("/");
  });

  it("abre sem a barra do navegador (standalone)", () => {
    expect(m.display).toBe("standalone");
  });

  it("tem ícone grande o bastante para instalar", () => {
    // O critério prático dos navegadores é ≥144px; o produto serve 512 gerado
    // em runtime com a marca da instalação (`app/icone-512/route.ts`).
    const tamanhos = (m.icons ?? []).map((i) => Number((i.sizes ?? "0x0").split("x")[0]));
    expect(Math.max(...tamanhos)).toBeGreaterThanOrEqual(512);
    expect((m.icons ?? []).some((i) => i.src === "/icone-512")).toBe(true);
  });

  it("não carrega marca de cliente/revendedor", () => {
    // "Operação de vendas" é neutro de propósito; a marca vive no ícone.
    const texto = `${m.name ?? ""} ${m.short_name ?? ""} ${m.description ?? ""}`.toLowerCase();
    expect(texto).not.toMatch(/bill|higiene|deskcomm|melgarafael/);
  });
});
