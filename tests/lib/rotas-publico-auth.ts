/**
 * A RÉGUA DE ROTAS DA CAPTURA DE PÚBLICO/AUTH.
 *
 * Saiu do script para ser TESTÁVEL: importar o captura executa a captura
 * (`void main()`), então a régua não podia ser conferida sem abrir navegador.
 * Aqui ela é só dado — e o teste unitário cobra h1, destino e slugs.
 */
/**
 * A RÉGUA: cada rota declara o **h1** que a tela dela tem, e o instrumento
 * espera esse h1 com timeout. Medir "algum texto apareceu" deixava a captura
 * passar com a tela errada (foi assim que `/login/mfa` virou `aplicado` sem
 * nunca ter sido medido: sem sessão parcial, ele redireciona para `/login`, e o
 * texto de login satisfazia a espera).
 *
 * `destino`: a rota redireciona de propósito e a medição é do DESTINO — o
 * `urlFinal` tem de começar por ele.
 * `semRedirect`: a rota TEM de renderizar a si mesma; se o `urlFinal` mudar, a
 * linha não é medida (e o registro diz isso).
 */
export const ROTAS = [
  { slug: "login", path: "/login", h1: /^Entrar$/, semRedirect: true },
  { slug: "login-forgot", path: "/login/forgot", h1: /^Recuperar senha$/, semRedirect: true },
  { slug: "login-recovery", path: "/login/recovery", h1: /^Recuperar acesso$/, semRedirect: true },
  { slug: "login-reset", path: "/login/reset", h1: /^Definir nova senha$/, semRedirect: true },
  // Sem sessão parcial (1º fator), esta rota redireciona para /login — e aí a
  // linha NÃO é medida, mesmo que o h1 do destino case. Ver §2.2 da matriz.
  { slug: "login-mfa", path: "/login/mfa", h1: /^Verificação em duas etapas$/, semRedirect: true },
  { slug: "signup", path: "/signup", h1: /^Criar conta$/, semRedirect: true },
  { slug: "403", path: "/403", h1: /^403 — Sem permissão$/, semRedirect: true },
  { slug: "500", path: "/500", h1: /^500 — Erro interno$/, semRedirect: true },
  { slug: "503", path: "/503", h1: /^503 — Em manutenção$/, semRedirect: true },
  { slug: "account-suspended", path: "/account-suspended", h1: /^Conta suspensa$/, semRedirect: true },
  { slug: "legal-privacy", path: "/legal/privacy", h1: /^Política de Privacidade$/, semRedirect: true },
  { slug: "legal-terms", path: "/legal/terms", h1: /^Termos de Uso$/, semRedirect: true },
  { slug: "orcamento", path: "/o/token-de-teste", h1: /^Link inválido ou vencido$/, semRedirect: true },
  // Redirecionam de propósito; a medição é do DESTINO.
  { slug: "landing", path: "/", h1: /^Entrar$/, destino: "/login" },
  { slug: "vitrine-agenda", path: "/vitrine-agenda", h1: /^Entrar$/, destino: "/login" },
  { slug: "accept-invite", path: "/team/accept-invite/token-de-teste", h1: /^Convite inválido ou expirado$|^Muitas tentativas$/, semRedirect: true },
  // ESTADO DE ERRO — não é rota, é `not-found.tsx`.
  { slug: "404", path: "/404", h1: /^404 — Página não encontrada$/, semRedirect: true },
  // Rota inexistente ANÔNIMA: o proxy manda para /login — mede-se o destino.
  { slug: "404-rota", path: "/rota-que-nao-existe-matriz", h1: /^Entrar$/, destino: "/login" },
] as const;