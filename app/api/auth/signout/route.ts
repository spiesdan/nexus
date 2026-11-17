/**
 * POST /api/auth/signout — a saída que os dois formulários já chamavam.
 *
 * ─── O DEFEITO (medido em 17/11/2026) ─────────────────────────────────────
 *
 * `AppShell.tsx` (o botão redondo da cabine do entregador) e
 * `team/accept-invite/[token]/page.tsx` (“Saia e faça login com o email
 * correto”) postam em `/api/auth/signout`. A rota **não existia**: os dois
 * botões “Sair” respondiam 404. O `signOut` de verdade só existia como Server
 * Action (`app/actions/auth/signOut.ts`), que nenhum dos dois formulários usa.
 *
 * A rota faz o mesmo que a action: encerra a sessão, apaga o cookie
 * `active_org` e volta para `/login`. POST, não GET: um link GET de logout é
 * acionável por terceiros (logout CSRF) e não é o que os formulários pedem.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  // A org ativa é cookie nosso, não da sessão do Supabase: sem apagar, o
  // próximo login herdaria a seleção de quem saiu.
  const store = await cookies();
  store.delete("active_org");

  if (user) {
    // Falha de audit não pode impedir a saída — o cookie já foi limpo.
    void audit({
      action: "auth.logout",
      actorUserId: user.id,
      requestId: request.headers.get("x-request-id"),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });
  }

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
