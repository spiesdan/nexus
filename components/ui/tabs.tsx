"use client"

import * as React from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/**
 * Tab Bar — API Radix preservada (`value`, `defaultValue`, `onValueChange`,
 * `disabled`, `data-state="active|inactive"`, `role="tab"`), movimento beUI
 * (`motion/tabs`, variante `underline`): o filete ativo desliza entre abas
 * com a mesma mola do original (stiffness 245, damping 36, mass 1.2), sem
 * overshoot para a fila rolavel nao ganhar scrollbar fantasma.
 *
 * Por que reimplementar em vez de importar o `Tabs` do beUI: o trigger de la
 * nao aceita `disabled` nem espalha props (`data-tab`), e nao pinta
 * `data-state` — tres coisas que o e2e le (`webhooks.spec`,
 * `agenda-caminho-ate-os-horarios.spec`) e que uma tela usa
 * (`AgentTabs`, aba de teste desabilitada).
 */

const GLIDE = { type: "spring", stiffness: 245, damping: 36, mass: 1.2 } as const

type TabsContexto = {
  valor: string
  selecionar: (v: string) => void
  layoutId: string
  registrar: (valor: string, el: HTMLElement | null) => void
}

const Ctx = React.createContext<TabsContexto | null>(null)

function useAbas() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("Tabs.* precisa estar dentro de <Tabs>")
  return ctx
}

function Tabs(
  props: {
    value?: string
    defaultValue?: string
    onValueChange?: (v: string) => void
    children?: React.ReactNode
    className?: string
    items?: string[]
    defaultActive?: number
    variant?: "underline" | "pill"
    size?: "md" | "sm"
    onChange?: (index: number) => void
  },
) {
  const { items, defaultActive, variant, size, onChange, value, defaultValue, onValueChange, children, className } = props
  const [interno, setInterno] = React.useState(defaultValue ?? "")
  const atual = value ?? interno
  const layoutId = React.useId()
  const refs = React.useRef(new Map<string, HTMLElement>())

  const selecionar = React.useCallback(
    (v: string) => {
      if (value === undefined) setInterno(v)
      onValueChange?.(v)
    },
    [value, onValueChange],
  )

  const registrar = React.useCallback((v: string, el: HTMLElement | null) => {
    if (el) refs.current.set(v, el)
    else refs.current.delete(v)
  }, [])

  if (items) {
    return (
      <ShowcaseTabs
        items={items}
        defaultActive={defaultActive}
        variant={variant}
        size={size}
        onChange={onChange}
        className={className}
      />
    )
  }

  const aoTeclar = (e: React.KeyboardEvent) => {
    const ordem = [...refs.current.keys()]
    const i = ordem.indexOf(atual)
    if (i < 0) return
    let proximo: number | null = null
    if (e.key === "ArrowRight") proximo = (i + 1) % ordem.length
    else if (e.key === "ArrowLeft") proximo = (i - 1 + ordem.length) % ordem.length
    else if (e.key === "Home") proximo = 0
    else if (e.key === "End") proximo = ordem.length - 1
    if (proximo !== null) {
      e.preventDefault()
      const v = ordem[proximo] as string
      selecionar(v)
      refs.current.get(v)?.focus()
    }
  };

  return (
    <Ctx.Provider value={{ valor: atual, selecionar, layoutId, registrar }}>
      <div className={className} data-slot="tabs" onKeyDown={aoTeclar}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  // `max-w-full overflow-x-auto`: fila de abas cresce com o produto e a pagina
  // nunca pode rolar na horizontal (detalhe do agente: seis abas, 814px em
  // 390px de viewport — medido `scrollWidth - clientWidth` antes/depois).
  <div
    ref={ref}
    role="tablist"
    className={cn(
      "inline-flex h-10 max-w-full items-center justify-start gap-1 overflow-x-auto border-b border-border bg-transparent p-0 text-text-subtle",
      className,
    )}
    {...props}
  >
    {children}
  </div>
))
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, disabled, children, ...props }, ref) => {
  const { valor, selecionar, layoutId, registrar } = useAbas()
  const ativo = valor === value
  const reduce = useReducedMotion()
  const internoRef = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(() => {
    registrar(value, internoRef.current)
    return () => registrar(value, null)
  }, [value, registrar])

  return (
    <button
      ref={(no) => {
        internoRef.current = no
        if (typeof ref === "function") ref(no)
        else if (ref) ref.current = no
      }}
      type="button"
      role="tab"
      aria-selected={ativo}
      data-state={ativo ? "active" : "inactive"}
      data-value={value}
      disabled={disabled}
      onClick={() => selecionar(value)}
      className={cn(
        "relative isolate inline-flex min-h-[40px] shrink-0 whitespace-nowrap items-center justify-center px-3 pb-2.5 pt-1 text-sm font-medium tracking-[-0.02em] ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        ativo ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {ativo && !reduce ? (
        <motion.span
          layoutId={layoutId}
          transition={GLIDE}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
          aria-hidden
        />
      ) : null}
      {ativo && reduce ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" aria-hidden />
      ) : null}
    </button>
  )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
  const { valor } = useAbas()
  if (valor !== value) return null
  return (
    <div
      ref={ref}
      role="tabpanel"
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})
TabsContent.displayName = "TabsContent"

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
