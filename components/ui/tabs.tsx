"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * Tab Bar — Visitors (DESIGN.md): sem preenchimento de fundo, texto Ash no
 * inativo, Carbon no ativo com underline lavanda de 2px. Mantido o
 * `max-w-full overflow-x-auto`: fila de abas cresce com o produto e a página
 * nunca pode rolar na horizontal (ver comentário original abaixo).
 *
 * Modo `items` (UImaxxing registry `tabs.json`): os showcases
 * (`markets-table`, `order-book`, `trading-chart`) usam `<Tabs items={[...]}/>`
 * com estado interno. Em vez de duplicar o componente (§33), o mesmo `Tabs`
 * aceita esse modo — presença de `items` decide, as APIs não se sobrepõem
 * (Radix não tem prop `items`).
 */
function Tabs(
  props: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & {
    items?: string[];
    defaultActive?: number;
    variant?: "underline" | "pill";
    size?: "md" | "sm";
    onChange?: (index: number) => void;
  },
) {
  const { items, defaultActive, variant, size, onChange, ...radixProps } = props;
  if (items) {
    return (
      <ShowcaseTabs
        items={items}
        defaultActive={defaultActive}
        variant={variant}
        size={size}
        onChange={onChange}
        className={radixProps.className as string | undefined}
      />
    );
  }
  return <TabsPrimitive.Root {...radixProps} />;
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // `max-w-full overflow-x-auto` porque uma fila de abas cresce com o
      // produto e nunca encolhe: no detalhe do agente são SEIS, e em 390px de
      // largura a fila mede 814px — a página inteira passava a rolar na
      // horizontal, que é o pior jeito de uma tela quebrar (o conteúdo some
      // para o lado e nada indica que existe). Medido antes/depois com
      // `documentElement.scrollWidth - clientWidth`.
      //
      // Aqui e não na tela do agente de propósito: TODA `TabsList` do app tem a
      // mesma fragilidade, e consertar só onde eu esbarrei deixaria as irmãs
      // quebradas com um álibi de "já foi tratado".
      "inline-flex h-10 max-w-full items-center justify-start gap-1 overflow-x-auto border-b border-border bg-transparent p-0 text-text-subtle",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium tracking-[-0.02em] ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-accent data-[state=active]:text-text",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

/**
 * Faixa de abas apresentacional com estado interno (modo `items` do
 * UImaxxing). `underline` = estilo trading-panel; `pill` = chip segmentado.
 */
function ShowcaseTabs({
  items,
  defaultActive = 0,
  variant = "underline",
  size = "sm",
  className,
  onChange,
}: {
  items: string[];
  defaultActive?: number;
  variant?: "underline" | "pill";
  size?: "md" | "sm";
  className?: string;
  onChange?: (index: number) => void;
}) {
  const [active, setActive] = React.useState(defaultActive);

  const select = (i: number) => {
    setActive(i);
    onChange?.(i);
  };

  if (variant === "pill") {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {items.map((item, i) => (
          <button
            key={item}
            type="button"
            onClick={() => select(i)}
            className={cn(
              "rounded-pill interactive font-medium",
              size === "sm" ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              i === active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-5 border-b border-border", className)}>
      {items.map((item, i) => (
        <button
          key={item}
          type="button"
          onClick={() => select(i)}
          className={cn(
            "-mb-px border-b-2 border-transparent pb-2 font-medium interactive",
            size === "sm" ? "text-xs" : "text-sm",
            i === active
              ? "border-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, ShowcaseTabs }
