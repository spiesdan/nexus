"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { ArrowRight, Gear } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { SidebarNotice } from "@/components/shell/SidebarNotice";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { GRUPO_NO_RODAPE, NAV_GROUPS, sidebarGroups } from "@/lib/navigation/registry";
import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
  AnimatedSidebarRail,
  AnimatedSidebarTrigger,
  useAnimatedSidebar,
} from "@/components/motion/animated-sidebar";
import { cn } from "@/lib/utils";

/**
 * Barra lateral do app no visual beUI Animated Sidebar.
 *
 * Mesmos primitivos e classes do preview oficial (`animated-sidebar.preview`);
 * só os DADOS vêm do produto: `sidebarGroups()` (RBAC), `useT()` (i18n),
 * marca branca (instalação/organização) e `router.push` (navegação client).
 */
function AnimatedSidebarBody({ onNavigate }: { onNavigate: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { user, activeOrg } = useAuth();
  const { state } = useAnimatedSidebar();
  const collapsed = state === "collapsed";

  const todos = sidebarGroups(user.is_platform_admin, activeOrg?.role ?? null);
  const grupos = todos.filter((g) => g.group.id !== GRUPO_NO_RODAPE);
  const rodape = NAV_GROUPS.find((g) => g.id === GRUPO_NO_RODAPE)?.hub;

  const brand = useMarcaDaInstalacao();
  const nome = activeOrg?.marca?.nome ?? brand.name;
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;

  const go = (href: string) => {
    onNavigate();
    router.push(href);
  };

  return (
    <>
      <AnimatedSidebarHeader className="p-3 pb-2">
        <div className="flex min-h-11 items-center gap-3 overflow-hidden px-2">
          <Link
            href="/app"
            title={nome}
            onClick={onNavigate}
            className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground text-background"
          >
            {logo && !collapsed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="size-7 object-contain" />
            ) : (
              <span aria-hidden className="text-xs font-semibold">
                {[...nome][0]?.toUpperCase() ?? brand.initial}
              </span>
            )}
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground group-data-[state=collapsed]/sidebar:hidden">
            {nome}
          </span>
        </div>
      </AnimatedSidebarHeader>

      <AnimatedSidebarContent className="px-2 pt-1">
        {grupos.map(({ group, items }) => {
          return (
            <AnimatedSidebarGroup key={group.id} className="pt-1">
              {collapsed ? null : (
                <AnimatedSidebarGroupLabel>{t(group.label)}</AnimatedSidebarGroupLabel>
              )}
              <AnimatedSidebarGroupContent>
                <AnimatedSidebarMenu>
                  {items.map((item) => {
                    const isActive =
                      pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <AnimatedSidebarMenuItem key={item.href}>
                        <AnimatedSidebarMenuButton
                          isActive={isActive}
                          icon={<Icon size={18} weight={isActive ? "fill" : "regular"} aria-hidden />}
                          badge={
                            item.healthDot ? (
                              <ConnectionHealthDot
                                className={cn(collapsed && "absolute top-1.5 right-1.5")}
                              />
                            ) : undefined
                          }
                          onSelect={() => go(item.href)}
                        >
                          {t(item.label)}
                        </AnimatedSidebarMenuButton>
                      </AnimatedSidebarMenuItem>
                    );
                  })}
                  {group.hub ? (
                    <AnimatedSidebarMenuItem>
                      <AnimatedSidebarMenuButton
                        isActive={pathname === group.hub.href}
                        icon={<ArrowRight size={18} aria-hidden />}
                        onSelect={() => {
                          const href = group.hub?.href;
                          if (href) go(href);
                        }}
                      >
                        {t(group.hub.label)}
                      </AnimatedSidebarMenuButton>
                    </AnimatedSidebarMenuItem>
                  ) : null}
                </AnimatedSidebarMenu>
              </AnimatedSidebarGroupContent>
            </AnimatedSidebarGroup>
          );
        })}
      </AnimatedSidebarContent>

      <AnimatedSidebarFooter className="gap-3 border-none p-3">
        {rodape ? (
          <AnimatedSidebarMenu>
            <AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuButton
                isActive={pathname.startsWith(rodape.href)}
                icon={<Gear size={18} aria-hidden />}
                onSelect={() => go(rodape.href)}
              >
                {t(rodape.label)}
              </AnimatedSidebarMenuButton>
            </AnimatedSidebarMenuItem>
          </AnimatedSidebarMenu>
        ) : null}
        <SidebarNotice collapsed={collapsed} />
        <VersionFooter collapsed={collapsed} onNavigate={onNavigate} />
      </AnimatedSidebarFooter>

      <AnimatedSidebarRail />
    </>
  );
}

export function AnimatedAppSidebar() {
  const t = useT();
  const { setOpenMobile, isMobile } = useAnimatedSidebar();
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <AnimatedSidebar ariaLabel={t("Navegação principal")} collapsible="icon" className="min-h-0">
      <AnimatedSidebarBody onNavigate={close} />
    </AnimatedSidebar>
  );
}

/** Botão que alterna a sidebar — no desktop recolhe, no mobile abre o sheet. */
export function SidebarToggleButton({ className }: { className?: string }) {
  return (
    <AnimatedSidebarTrigger
      className={cn("text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", className)}
    >
      <PanelLeft aria-hidden="true" className="size-4" />
    </AnimatedSidebarTrigger>
  );
}
