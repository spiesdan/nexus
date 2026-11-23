import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isPublicPath } from "@/lib/auth/public-paths";
import { BILLING_GATE_ALLOWLIST } from "@/lib/billing/gate";
import { lerConfiguracaoBilling } from "@/lib/billing/config";
import {
  verifyImpersonateCookieEdge,
  IMPERSONATE_COOKIE_NAME_EDGE,
} from "@/lib/impersonate/cookie-edge";

const COOKIE_NAME = "sb-nexus-auth";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  // Inject X-Request-Id for downstream correlation (audit log, error wrappers).
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  response.headers.set("x-request-id", requestId);

  const { pathname, search } = request.nextUrl;
  // Expose pathname to Server Components via header (used by onboarding layout).
  response.headers.set("x-pathname", pathname);
  request.headers.set("x-pathname", pathname);

  // EPIC-11: in dev we route by path (`/admin/*`); in prod the
  // `admin.nexus.com` sub-domain is mapped via Vercel rewrites to the same
  // `/admin/*` paths. The host-based branch below stays a NOOP today and only
  // exists as documentation of the intended deploy topology.
  const host = request.headers.get("host") ?? "";
  const isAdminSurface = host.startsWith("admin.") || pathname.startsWith("/admin");

  if (isPublicPath(pathname)) {
    return response;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
      cookieOptions: {
        name: COOKIE_NAME,
        // O middleware TAMBÉM grava o cookie — e era ele que o rebaixava a
        // cookie de sessão a cada refresh: `getUser()` renova o token e chama
        // `setAll`, que reescrevia o cookie com estas opções, sem `maxAge`.
        // Resultado: a pessoa entrava, atualizava a página e, ao fechar o app,
        // caía no login de novo. As três cópias (proxy, server, browser)
        // precisam carregar o mesmo prazo.
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "strict",
        httpOnly: true,
        secure: cookieSecure(),
        path: "/",
      },
    },
  );

  // Validate JWT server-side (NEVER use getSession on backend per CLAUDE.md).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // API routes must respond with JSON envelope (contract: {error:{code,message}})
    // — never redirect HTML to JSON consumers. UI routes redirect to /login as before.
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({
          error: {
            code: "unauthenticated",
            message: "Authentication required",
          },
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
          },
        },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // EPIC-11 S-11.07: validate impersonate cookie on /app/* paths. Middleware
  // runs in Edge — no DB access, only HMAC + expiry. On any failure we delete
  // the cookie (defence-in-depth) and let the request continue (the layout
  // re-checks server-side; downstream code that depends on the cookie will
  // simply see no impersonation in effect).
  if (pathname.startsWith("/app")) {
    const impCookie = request.cookies.get(IMPERSONATE_COOKIE_NAME_EDGE)?.value;
    if (impCookie) {
      const result = await verifyImpersonateCookieEdge(
        impCookie,
        env.IMPERSONATE_COOKIE_SECRET ?? "",
      );
      if (!result.valid) {
        console.warn(
          `[middleware] impersonate cookie invalid (${result.reason ?? "unknown"}) — clearing`,
        );
        response.cookies.delete(IMPERSONATE_COOKIE_NAME_EDGE);
      }
    }
  }

  // Gate de cobrança no EDGE para /app/* E /api/v1/*: `/app` sozinho deixava
  // as APIs de um tenant suspenso operando (há handler com service role que não
  // chama requireRole). Deny-by-default com allowlist EXATA; kill-switch sem
  // escrita. Webhooks/crons já voltaram no isPublicPath acima.
  const caminhoGateado =
    pathname.startsWith("/app") || pathname.startsWith("/api/v1/");
  if (
    caminhoGateado &&
    !BILLING_GATE_ALLOWLIST.includes(pathname) &&
    lerConfiguracaoBilling().killSwitchGate
  ) {
    const orgCookie = request.cookies.get("active_org")?.value;
    if (orgCookie) {
      const { data: suspenso } = await supabase.rpc("fn_billing_gate_bloqueia", {
        p_org: orgCookie,
      });
      if (suspenso) {
        // API responde no envelope canônico; UI redireciona.
        if (pathname.startsWith("/api/")) {
          return new NextResponse(
            JSON.stringify({
              error: {
                code: "tenant_suspended",
                message: "Assinatura vencida. Regularize o pagamento.",
              },
            }),
            {
              status: 403,
              headers: { "content-type": "application/json", "x-request-id": requestId },
            },
          );
        }
        return NextResponse.redirect(new URL("/account-suspended", request.url));
      }
    }
  }

  // /admin/* additionally requires platform_admin (early gate — authoritative
  // check is server-side in `requirePlatformAdmin`). Skip the RPC for
  // `/admin/forbidden` (rendered to non-admins, would otherwise loop).
  if (isAdminSurface && pathname.startsWith("/admin") && pathname !== "/admin/forbidden") {
    const { data: isAdmin, error } = await supabase.rpc("fn_is_platform_admin");
    if (error || !isAdmin) {
      return NextResponse.redirect(new URL("/admin/forbidden", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets / Next internals.
    //
    // `mjs` entra na lista por um defeito medido: o worker do MapLibre é um
    // módulo `.mjs` servido pelo `public/`, e sem esta extensão ele caía no
    // proxy, que respondia 307 para `/login`. O navegador recebia HTML onde
    // esperava JavaScript e abortava com "non-JavaScript MIME type of
    // text/html" — as rotas do mapa paravam de pintar em produção.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|mjs)$).*)",
  ],
};
