"use client";

import * as React from "react";

import { CaretDown, Check, Funnel, MagnifyingGlass, X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * O PADRÃO GLOBAL DE FILTROS — uma linguagem só para todas as listas.
 *
 * Hierarquia (§5 do padrão): a linha primária carrega busca + 1–2 selects que
 * resolvem ~80% dos usos; o resto mora em `FilterAdvanced` (colapsado); o que
 * está aplicado aparece em `FilterChips` (remoção individual + limpar tudo).
 * Filtros salvos vivem em `SavedFilters`, com o mesmo vocabulário em toda tela.
 *
 * Os textos vêm por props, sempre: estes componentes não conhecem idioma.
 */

// ---------------------------------------------------------------------------
// Barra — o invólucro. Não é Card de destaque: é a toolbar da lista.
// ---------------------------------------------------------------------------

export function FilterBar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`space-y-3 rounded-lg border bg-card p-3 sm:p-4 ${className}`}>{children}</section>;
}

/** Linha primária: busca cresce, selects têm largura fixa. Empilha no mobile. */
export function FilterPrimary({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 md:flex-row md:items-end">{children}</div>;
}

/** Linha de ações/rodapé: salvos à esquerda, resto à direita. */
export function FilterActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

// ---------------------------------------------------------------------------
// Busca — cresce, com ícone e botão de limpar.
// ---------------------------------------------------------------------------

export function FilterSearch({
  id,
  label,
  value,
  onChange,
  placeholder,
  className = "",
  dataTestId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  className?: string;
  /** Gancho para e2e — não muda comportamento. */
  dataTestId?: string;
}) {
  return (
    <div className={`w-full space-y-1.5 md:min-w-52 md:flex-1 ${className}`}>
      <Label htmlFor={id} className="block text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-8 pl-9"
          type="search"
          data-testid={dataTestId}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`${label}: limpar`}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select — altura e tipografia iguais às do Input, largura fixa no desktop.
// ---------------------------------------------------------------------------

export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  options: { value: string; label: string }[];
  /** Rótulo da opção vazia ("Todos", "Todas"…). Sem ele, não há opção vazia. */
  allLabel?: string;
  className?: string;
}) {
  return (
    <div className={`w-full space-y-1.5 sm:w-44 md:shrink-0 ${className}`}>
      <Label htmlFor={id} className="block text-sm font-medium">
        {label}
      </Label>
      <select
        id={id}
        className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select — VÁRIOS valores do mesmo filtro, na mesma consulta.
// ---------------------------------------------------------------------------
//
// POR QUE EXISTE: o filtro de Categoria da prospecção aceitava UMA categoria,
// e quem vende para oficina, borracharia e autopeças tinha que olhar três
// listas — ou nenhuma. A campanha já aceitava várias (`categorias` é array);
// a lista não. Este componente fecha essa assimetria.
//
// Ele é o irmão de `FilterSelect`, não um substituto: um valor só continua
// sendo um `<select>` nativo (teclado do sistema, sem JS). Aqui o painel
// FICA ABERTO a cada escolha — marcar três categorias não pode custar três
// aberturas — e por isso é popover e não menu: menu fecha no primeiro item.
//
// Com até ~500 categorias medidas no banco, a lista tem busca própria: rolar
// 500 linhas para achar "Oficina mecânica" é pior que digitar "mecan".
export function FilterMultiSelect({
  id,
  label,
  values,
  onChange,
  options,
  allLabel,
  searchPlaceholder,
  clearLabel,
  className = "",
  dataTestId,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (valores: string[]) => void;
  options: { value: string; label: string }[];
  /** Rótulo do estado sem nada marcado ("Todas as categorias"). */
  allLabel: string;
  searchPlaceholder: string;
  clearLabel: string;
  className?: string;
  /** Gancho para e2e — não muda comportamento. */
  dataTestId?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const labelId = `${id}-rotulo`;
  const marcados = new Set(values);

  // A busca casa no RÓTULO (português, o que a pessoa lê) e no VALOR (o que
  // está gravado). Casar só no valor faria "mecanica" não achar nada — o
  // mesmo defeito que `categoriasQueCasam` corrigiu no backend.
  const visiveis = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo === "") return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(termo) || o.value.toLowerCase().includes(termo),
    );
  }, [busca, options]);

  function alternar(valor: string) {
    onChange(marcados.has(valor) ? values.filter((v) => v !== valor) : [...values, valor]);
  }

  // O gatilho fechado é a única superfície que sobra quando o painel está
  // fechado: ele tem que dizer o que está aplicado.
  const resumo =
    values.length === 0
      ? allLabel
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? allLabel)
        : `${label}: ${values.length}`;

  return (
    <div className={`w-full space-y-1.5 sm:w-44 md:shrink-0 ${className}`}>
      <Label id={labelId} className="block text-sm font-medium">
        {label}
      </Label>
      <Popover
        open={aberto}
        onOpenChange={(o) => {
          setAberto(o);
          if (!o) setBusca("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-labelledby={labelId}
            aria-expanded={aberto}
            aria-haspopup="listbox"
            data-testid={dataTestId}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 text-left text-sm"
          >
            <span className={`truncate ${values.length === 0 ? "text-muted-foreground" : ""}`}>
              {resumo}
            </span>
            <CaretDown
              size={14}
              aria-hidden
              className={`shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-8"
          />
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            className="mt-2 max-h-64 overflow-auto"
          >
            {visiveis.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">{searchPlaceholder}</p>
            ) : (
              visiveis.map((o) => {
                const marcado = marcados.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={marcado}
                    onClick={() => alternar(o.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                        marcado ? "border-primary bg-primary text-primary-foreground" : ""
                      }`}
                    >
                      {marcado && <Check size={12} aria-hidden />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <span className="text-xs text-muted-foreground">{values.length}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => onChange([])}
              disabled={values.length === 0}
            >
              {clearLabel}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Número — par min/max com a mesma altura dos demais.
// ---------------------------------------------------------------------------

export function FilterNumber({
  id,
  label,
  value,
  onChange,
  placeholder,
  min = 0,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  min?: number;
  className?: string;
}) {
  return (
    <div className={`w-full space-y-1.5 sm:w-36 md:shrink-0 ${className}`}>
      <Label htmlFor={id} className="block text-sm font-medium">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avançados — colapsado por padrão, com contagem do que está aplicado.
// ---------------------------------------------------------------------------

export function FilterAdvanced({
  open,
  onToggle,
  toggleLabel,
  activeCount,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  toggleLabel: string;
  activeCount: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        aria-expanded={open}
        className="gap-1.5 px-2 text-muted-foreground"
      >
        <Funnel size={14} aria-hidden />
        {toggleLabel}
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-medium text-primary-foreground">
            {activeCount}
          </span>
        )}
        <CaretDown
          size={14}
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 border-t pt-3 md:flex-row md:items-end md:gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chips — o que está aplicado, com remoção individual e limpar tudo.
// ---------------------------------------------------------------------------

export interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export function FilterChips({
  chips,
  onClearAll,
  clearLabel,
}: {
  chips: ActiveChip[];
  onClearAll: () => void;
  clearLabel: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/60 py-1 pr-1.5 pl-2.5 text-xs hover:bg-muted"
          title={c.label}
        >
          <span className="truncate">{c.label}</span>
          <X size={12} aria-hidden className="shrink-0 text-muted-foreground" />
          <span className="sr-only">remover</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {clearLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Salvos — salvar, aplicar, excluir. A persistência é da página.
// ---------------------------------------------------------------------------

export function SavedFilters({
  names,
  onApply,
  onSave,
  onRemove,
  texts,
}: {
  names: string[];
  onApply: (nome: string) => void;
  onSave: (nome: string) => void;
  onRemove: (nome: string) => void;
  texts: { savePlaceholder: string; saveButton: string; applyPlaceholder: string; removeLabel: string };
}) {
  const [nome, setNome] = React.useState("");
  const [aplicado, setAplicado] = React.useState("");

  function salvar() {
    const limpo = nome.trim();
    if (!limpo) return;
    onSave(limpo);
    setNome("");
    setAplicado(limpo);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        className="h-8 w-40"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
        }}
        placeholder={texts.savePlaceholder}
        aria-label={texts.savePlaceholder}
      />
      <Button size="sm" variant="outline" disabled={!nome.trim()} onClick={salvar}>
        {texts.saveButton}
      </Button>
      {names.length > 0 && (
        <>
          <select
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={aplicado}
            onChange={(e) => {
              setAplicado(e.target.value);
              if (e.target.value) onApply(e.target.value);
            }}
            aria-label={texts.applyPlaceholder}
          >
            <option value="">{texts.applyPlaceholder}</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {aplicado && names.includes(aplicado) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onRemove(aplicado);
                setAplicado("");
              }}
              aria-label={`${texts.removeLabel}: ${aplicado}`}
              className="h-8 px-2 text-muted-foreground"
            >
              <X size={14} aria-hidden />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
