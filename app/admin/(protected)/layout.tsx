import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { loadAuthUser } from "@/lib/auth/server";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuthProvider } from "@/hooks/auth/AuthProvider";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { tituloDaRota } from "@/lib/navigation/titulos";

/**
 * Título da aba do admin de plataforma. As páginas que já declaram
 * `metadata` próprio (dashboard, tenants, audit, usage, marca, incidentes,
 * usuários…) continuam vencendo — isto cobre o que faltava e o que nascer
 * depois, sem uma lista paralela para envelhecer.
 */
export async function generateMetadata(): Promise<Metadata> {
  const caminho = (await headers()).get("x-pathname") ?? "";
  const titulo = tituloDaRota(caminho);
  return titulo ? { title: titulo } : {};
}

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  // Duas leituras, propósitos diferentes: `requirePlatformAdmin` é a GUARDA
  // (redireciona/403 e trata revogação via `platform_admins`); `loadAuthUser`
  // é o AuthUser rico (is_platform_admin, idioma, memberships) que o
  // `AuthProvider` da TopBar do admin (§17) exige — o Supabase `User` cru que
  // a guarda devolve não é esse tipo. Sem o Provider, a barra nova derruba a
  // árvore inteira no SSR com "useAuth must be used inside <AuthProvider>"
  // (medido numa falha de /admin/marca em e2e).
  await requirePlatformAdmin();
  const user = await loadAuthUser();
  if (!user) redirect("/login?next=/admin");

  // Mesmo padrão de `app/app/layout.tsx`: o idioma envolve a árvore inteira e
  // recebe o código PRONTO. O AdminShell é client component e `children`
  // continua chegando como Server Component normalmente.
  return (
    <IdiomaProvider locale={user.locale ?? null}>
      <AuthProvider user={user} activeOrg={null}>
        <AdminShell userEmail={user.email ?? ""}>{children}</AdminShell>
      </AuthProvider>
    </IdiomaProvider>
  );
}
