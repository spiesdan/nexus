/**
 * A RÉGUA DA CAPTURA DE PÚBLICO/AUTH — testada sem abrir navegador.
 *
 * O defeito que estes testes evitam já aconteceu: `/login/mfa` foi marcado como
 * medido quando a captura, na verdade, tinha caído em `/login` (a rota
 * redireciona sem sessão parcial). A espera era por "algum texto da tela", que
 * o login satisfazia.
 *
 * A régua nova exige DUAS provas por linha:
 *  1. **h1 esperado**, lido com timeout — a tela certa renderizou;
 *  2. **destino do redirect** — quando a rota redireciona de propósito, a
 *     medição é do destino, e o `urlFinal` tem de começar por ele.
 *
 * Rota que redireciona sem declarar destino, ou que não declara h1, reprova
 * aqui — antes de gastar uma captura inteira.
 */
import { describe, expect, it } from "vitest";

import { ROTAS } from "../lib/rotas-publico-auth";

describe("régua da captura público/auth", () => {
  it("toda rota declara o h1 que prova a tela certa", () => {
    for (const rota of ROTAS) {
      expect(rota.h1, `${rota.slug} sem h1`).toBeInstanceOf(RegExp);
      expect(rota.h1.test("").valueOf(), `${rota.slug} com regex que casa vazio`).toBe(false);
    }
  });

  it("toda rota é ou semRedirect (renderiza a si) ou destino (mede o redirect)", () => {
    for (const rota of ROTAS) {
      const temDestino = "destino" in rota && Boolean(rota.destino);
      const semRedirect = "semRedirect" in rota && Boolean(rota.semRedirect);
      expect(
        Number(temDestino) + Number(semRedirect),
        `${rota.slug}: precisa de exatamente um entre destino e semRedirect`,
      ).toBe(1);
    }
  });

  it("slug e path não se repetem, e path é absoluto", () => {
    const slugs = ROTAS.map((r) => r.slug);
    const paths = ROTAS.map((r) => r.path);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(paths).size).toBe(paths.length);
    for (const rota of ROTAS) expect(rota.path.startsWith("/")).toBe(true);
  });

  it("as primitivas pedidas têm h1 explícito: login, signup, recuperação, 404 e 500", () => {
    const porSlug = new Map(ROTAS.map((r) => [r.slug, r]));
    expect(porSlug.get("login")?.h1.test("Entrar")).toBe(true);
    expect(porSlug.get("signup")?.h1.test("Criar conta")).toBe(true);
    expect(porSlug.get("login-recovery")?.h1.test("Recuperar acesso")).toBe(true);
    expect(porSlug.get("404")?.h1.test("404 — Página não encontrada")).toBe(true);
    expect(porSlug.get("500")?.h1.test("500 — Erro interno")).toBe(true);
  });

  it("o MFA não pode passar por h1 do destino: sem sessão parcial ele é semRedirect", () => {
    const mfa = ROTAS.find((r) => r.slug === "login-mfa");
    expect(mfa).toBeDefined();
    expect("semRedirect" in mfa! && mfa!.semRedirect).toBe(true);
    expect("destino" in mfa!).toBe(false);
  });

  it("redirect é medido no destino declarado (landing e vitrine → /login)", () => {
    const landing = ROTAS.find((r) => r.slug === "landing");
    const vitrine = ROTAS.find((r) => r.slug === "vitrine-agenda");
    expect("destino" in landing! && landing!.destino).toBe("/login");
    expect("destino" in vitrine! && vitrine!.destino).toBe("/login");
  });
});
