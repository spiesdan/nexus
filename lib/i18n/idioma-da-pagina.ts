import { createClient } from "@/lib/supabase/server";

import { normalizarIdioma, type Idioma } from "./idiomas";

/**
 * Idioma de uma página FORA da árvore de `app/app/layout.tsx` (status, legal,
 * convite): sem `IdiomaProvider` ali dentro, o `useIdioma()` não existe — o
 * bloco `createClient` → `getUser` → `normalizarIdioma` era copiado em
 * `403`/`404`/`500`/`account-suspended`/`admin/forbidden` e continua nos
 * vizinhos legais. Um helper, chamado por quem PODE depender do Supabase.
 *
 * `503` NÃO usa isto de propósito: manutenção é o cenário em que o Supabase
 * pode estar fora, e a página precisa renderizar sem ele (`IDIOMA_PADRAO`).
 *
 * Pode chegar sem sessão (link direto, robô) — `user` é opcional.
 */
export async function idiomaDaPagina(): Promise<Idioma> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return normalizarIdioma((user?.user_metadata?.locale as string | undefined) ?? null);
}
