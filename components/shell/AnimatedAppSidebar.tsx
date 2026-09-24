"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useRef } from "react";
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
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
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
 * Mesmos primitivos e movimento do preview oficial; os DADOS vêm do produto
 * (`sidebarGroups()` para RBAC, `useT()` para i18n, marca branca) e a
 * SEMÂNTICA é a do sidebar antigo, que o e2e cobra:
 *
 * - itens são ÂNCORAS reais (`href`), não botões — `getByRole("link")`,
 *   botão do meio, abrir em nova guia e SEO continuam funcionando;
 * - grupos têm `<nav aria-label>` + `<h2>` (dobra medida em 900px);
 * - Configurações é link fora do `<nav>`, no rodapé fixo;
 * - densidade 28px/linha para o menu inteiro caber sem scroll.
 *
 * O beUI renderiza `<a>` nativo (reload full = regressão). O
 * `segurarNavegacao` cancela o nativo só no clique simples e o `ir` faz o
 * `router.push` — modificadores/teclado especial seguem nativos.
 */
function AnimatedSidebarBody({ onNavigate }: { onNavigate: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { user, activeOrg } = useAuth();
  const { state } = useAnimatedSidebar();
  const collapsed = state === "collapsed";
  // Clique com modificador abre guia nova no nativo; nesse caso o `ir` não
  // deve empurrar a aba atual junto (o capture roda antes do bubble, sempre).
  const nativo = useRef(false);

  const todos = sidebarGroups(user.is_platform_admin, activeOrg?.role ?? null);
  const grupos = todos.filter((g) => g.group.id !== GRUPO_NO_RODAPE);
  const rodape = NAV_GROUPS.find((g) => g.id === GRUPO_NO_RODAPE)?.hub;

  const brand = useMarcaDaInstalacao();
  const nome = activeOrg?.marca?.nome ?? brand.name;
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;

  const ir = (href: string) => {
    if (nativo.current) {
      nativo.current = false;
      return;
    }
    onNavigate();
    router.push(href);
  };

  const segurarNavegacao = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      nativo.current = true;
      return;
    }
    const alvo = e.target as HTMLElement | null;
    const a = alvo?.closest?.("a[href]");
    if (!a) return;
    if (a.getAttribute("target") === "_blank") {
      nativo.current = true;
      return;
    }
    e.preventDefault();
  };

  return (
    <>
      <AnimatedSidebarHeader className="h-12 justify-center p-0 px-3 pb-0">
        <div className="flex min-h-0 items-center gap-2.5 overflow-hidden px-1">
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

      <nav
        aria-label={t("Navegação principal")}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-1"
      >
        {grupos.map(({ group, items }) => {
          const tituloId = `nav-grupo-${group.id}`;
          return (
            <AnimatedSidebarGroup key={group.id} className="px-1 py-0.5">
              {collapsed ? null : (
                <h2
                  id={tituloId}
                  className="mb-0 h-5 overflow-hidden px-2 text-[10px] font-semibold uppercase leading-5 tracking-[0.14em] text-muted-foreground"
                >
                  {t(group.label)}
                </h2>
              )}
              <AnimatedSidebarGroupContent>
                <AnimatedSidebarMenu onClickCapture={segurarNavegacao} className="gap-px">
                  {items.map((item) => {
                    const isActive =
                      pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <AnimatedSidebarMenuItem key={item.href}>
                        <AnimatedSidebarMenuButton
                          href={item.href}
                          isActive={isActive}
                          icon={<Icon size={17} weight={isActive ? "fill" : "regular"} aria-hidden />}
                          badge={
                            item.healthDot ? (
                              <ConnectionHealthDot
                                className={cn(collapsed && "absolute top-1.5 right-1.5")}
                              />
                            ) : undefined
                          }
                          onSelect={() => ir(item.href)}
                          className="min-h-7 gap-2 rounded-lg px-2.5 text-[13px]"
                        >
                          {t(item.label)}
                        </AnimatedSidebarMenuButton>
                      </AnimatedSidebarMenuItem>
                    );
                  })}
                  {group.hub ? (
                    <AnimatedSidebarMenuItem>
                      <AnimatedSidebarMenuButton
                        href={group.hub.href}
                        isActive={pathname === group.hub.href}
                        icon={<ArrowRight size={17} aria-hidden />}
                        onSelect={() => {
                          const href = group.hub?.href;
                          if (href) ir(href);
                        }}
                        className="min-h-7 gap-2 rounded-lg px-2.5 text-[13px]"
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
      </nav>

      <AnimatedSidebarFooter className="gap-1 border-none p-2">
        {rodape ? (
          <AnimatedSidebarMenu onClickCapture={segurarNavegacao}>
            <AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuButton
                href={rodape.href}
                isActive={pathname.startsWith(rodape.href)}
                icon={<Gear size={17} aria-hidden />}
                onSelect={() => ir(rodape.href)}
                className="min-h-7 gap-2 rounded-lg px-2.5 text-[13px]"
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

/**
 * Botão que alterna a sidebar — no desktop recolhe/expande, no mobile abre a
 * gaveta. O nome "Abrir navegação" no mobile é o que o e2e procura.
 */
export function SidebarToggleButton({ className }: { className?: string }) {
  const t = useT();
  const { isMobile, open } = useAnimatedSidebar();
  const rotulo = isMobile
    ? t("Abrir navegação")
    : open
      ? t("Recolher sidebar")
      : t("Expandir sidebar");
  return (
    <AnimatedSidebarTrigger
      aria-label={rotulo}
      title={rotulo}
      className={cn("text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", className)}
    >
      <PanelLeft aria-hidden="true" className="size-4" />
    </AnimatedSidebarTrigger>
  );
}
