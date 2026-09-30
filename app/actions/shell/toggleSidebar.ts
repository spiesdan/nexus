"use server";
import { cookies } from "next/headers";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

/**
 * Grava a preferência de recolhimento e NÃO revalida mais o layout.
 *
 * O `revalidatePath("/app", "layout")` custava um render RSC completo a cada
 * clique — em produção, ~5–8 roundtrips para o Supabase cloud (medição em
 * produção: 120ms só de `SELECT 1`) para trocar a largura de uma div.
 *
 * O cookie é o contrato: `app/app/layout.tsx:150` o lê no SSR da PRÓXIMA
 * navegação (sem flash de hidratação), e o clique em si é instantâneo porque
 * `components/shell/Sidebar.tsx` guarda o estado localmente — servidor não
 * participa da interação. Falhar aqui seria só não persistir; a UI já mudou.
 */
export async function toggleSidebar(currentlyCollapsed: boolean): Promise<void> {
  const store = await cookies();
  store.set("sidebar_collapsed", currentlyCollapsed ? "0" : "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
