"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/hooks/i18n/useT";
import { Plus } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { searchable, type NavDestination } from "@/lib/navigation/registry";
import { cn } from "@/lib/utils";

const DESTINOS = ["/app/inbox", "/app/radar", "/app/pedidos", "/app/inteligencia"];
const NOVO_PEDIDO = { href: "/app/pedidos/novo", minRole: "agent" } as const;

/**
 * Dock inferior mobile (padrão command-dock): 4 destinos + ação central de
 * criar pedido. Só `<md` — no desktop o sidebar continua valendo.
 * Destinos filtrados por papel (mesma regra do sidebar, sem lista paralela).
 */
// Telas que já possuem barra inferior própria no mobile: o dock sumiria
// com ela (pedidos/novo tem a barra de revisão). Exceção documentada,
// não precedente — nova barra fixa mobile deve compor com o dock, não
// escondê-lo.
const SEM_DOCK = ["/app/pedidos/novo"];

export function MobileDock() {
  const t = useT();
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const role = activeOrg?.role ?? null;
  const admin = user.is_platform_admin;

  if (SEM_DOCK.some((rota) => pathname === rota || pathname.startsWith(rota + "/"))) {
    return null;
  }

  const itens = DESTINOS.map((href) => searchable(admin, role).find((d) => d.href === href)).filter(
    (d): d is NavDestination => d !== undefined,
  );
  const podeCriarPedido = role !== null && ROLE_RANK[role] >= ROLE_RANK[NOVO_PEDIDO.minRole];

  if (itens.length === 0) return null;

  return (
    // Landmark PRÓPRIO ("Navegação rápida"), não "Navegação principal": dois
    // `nav` com o mesmo rótulo são indistinguíveis para leitor de tela — e o
    // e2e `navegacao` conta o principal por esse rótulo no mobile, onde SÓ o
    // dock está visível. Renomear aqui é o conserto; excluir o dock do teste
    // seria esconder o sintoma.
    <nav
      aria-label={t("Navegação rápida")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="flex items-stretch justify-around px-2 py-1.5">
        {itens.slice(0, 2).map((d) => (
          <ItemDock key={d.href} destino={d} pathname={pathname} t={t} />
        ))}
        {podeCriarPedido && (
          <Link
            href={NOVO_PEDIDO.href}
            aria-label={t("Criar pedido")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xs transition-transform active:scale-95"
          >
            <Plus size={20} weight="bold" aria-hidden />
          </Link>
        )}
        {itens.slice(2).map((d) => (
          <ItemDock key={d.href} destino={d} pathname={pathname} t={t} />
        ))}
      </div>
    </nav>
  );
}

function ItemDock({
  destino,
  pathname,
  t,
}: {
  destino: NavDestination;
  pathname: string;
  t: (texto: string) => string;
}) {
  const ativo = pathname === destino.href || pathname.startsWith(destino.href + "/");
  const Icon = destino.icon;
  return (
    <Link
      href={destino.href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-lg px-2",
        ativo ? "text-accent" : "text-muted-foreground",
      )}
    >
      <Icon size={20} weight={ativo ? "fill" : "regular"} aria-hidden />
      <span className="max-w-full truncate text-[10px] font-medium">{t(destino.label)}</span>
    </Link>
  );
}
