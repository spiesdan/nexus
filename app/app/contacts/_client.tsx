"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Plus, UploadSimple } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import {
  FilterBar,
  FilterChips,
  FilterPrimary,
  FilterSearch,
  FilterSelect,
  type ActiveChip,
} from "@/components/filters/FilterBar";
import { useContactList } from "@/hooks/contacts/useContactList";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { BulkTagBar } from "./_bulkbar";
import { NewContactDialog } from "@/components/contacts/NewContactDialog";
import { ImportContactsDialog } from "@/components/contacts/ImportContactsDialog";
import { EmptyContacts } from "@/components/empty";
import type { ContactOrderBy } from "@/lib/schemas/contacts";

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "nuvemshop", label: "Nuvemshop" },
  { value: "import_csv", label: "Importado (CSV)" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function ContactsListClient() {
  const t = useT();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [source, setSource] = useState<string | undefined>(undefined);
  const [orderBy, setOrderBy] = useState<ContactOrderBy>("last_activity_at");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState<number>(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ search, tag, source, order_by: orderBy, order_dir: orderDir, limit }),
    [search, tag, source, orderBy, orderDir, limit],
  );
  const q = useContactList(filters);

  const allContacts = useMemo(
    () => q.data?.pages.flatMap((p) => p.data) ?? [],
    [q.data],
  );

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of allContacts) for (const tag of c.tags) set.add(tag);
    return Array.from(set).sort();
  }, [allContacts]);

  const handleSort = useCallback(
    (column: ContactOrderBy) => {
      if (column === orderBy) {
        setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setOrderBy(column);
        setOrderDir(column === "display_name" ? "asc" : "desc");
      }
    },
    [orderBy],
  );

  function limparFiltros() {
    setSearchInput("");
    setSearch("");
    setTag(undefined);
    setSource(undefined);
  }

  const chips: ActiveChip[] = [];
  if (search) {
    chips.push({
      key: "busca",
      label: `${t("Buscar")}: ${search}`,
      onRemove: () => {
        setSearchInput("");
        setSearch("");
      },
    });
  }
  if (tag) {
    chips.push({ key: "tag", label: `${t("Tag")}: ${tag}`, onRemove: () => setTag(undefined) });
  }
  if (source) {
    chips.push({
      key: "origem",
      label: `${t("Origem")}: ${t(SOURCE_OPTIONS.find((s) => s.value === source)?.label ?? source)}`,
      onRemove: () => setSource(undefined),
    });
  }

  return (
    <div className="space-y-4 p-6">
      <NexusPageHeader
        title={t("Clientes")}
        subtitle={t("Customer 360 — busque, filtre e gerencie clientes.")}
        actions={
          /*
            A estrutura é a da main (o "Importar CSV" do PR #313); o `shrink-0`
            vem do PR #267, e vale para os DOIS botões agora: numa tela de 390px
            uma linha de dois botões sem isso comprime os rótulos.
          */
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <UploadSimple size={16} weight="bold" aria-hidden />
              <span>{t("Importar CSV")}</span>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} weight="bold" aria-hidden />
              <span>{t("Novo cliente")}</span>
            </Button>
          </div>
        }
      />

      <FilterBar>
        <FilterPrimary>
          <FilterSearch
            id="busca-contatos"
            label={t("Buscar")}
            value={searchInput}
            onChange={setSearchInput}
            placeholder={t("Buscar por nome, email ou telefone…")}
            dataTestId="busca-contatos"
          />
          <FilterSelect
            id="filtro-tag"
            label={t("Tag")}
            value={tag ?? ""}
            onChange={(v) => setTag(v || undefined)}
            options={tagOptions.map((tagOption) => ({ value: tagOption, label: tagOption }))}
            allLabel={t("Todas")}
          />
          <FilterSelect
            id="filtro-origem"
            label={t("Origem")}
            value={source ?? ""}
            onChange={(v) => setSource(v || undefined)}
            options={SOURCE_OPTIONS.map((s) => ({
              value: s.value,
              label: t(s.label),
            }))}
            allLabel={t("Todas as origens")}
          />
          <FilterSelect
            id="filtro-por-pagina"
            label={t("Por página")}
            value={String(limit)}
            onChange={(v) => setLimit(Number(v))}
            options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </FilterPrimary>

        <FilterChips
          chips={chips}
          onClearAll={limparFiltros}
          clearLabel={t("Limpar filtros")}
        />
      </FilterBar>

      {q.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <Card className="hover-raise p-6 text-center">
          <p className="text-sm text-error-fg">{t("Erro ao carregar clientes.")}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => q.refetch()}
          >
            {t("Tentar novamente")}
          </Button>
        </Card>
      ) : allContacts.length === 0 ? (
        <Card className="hover-raise p-2">
          <EmptyContacts />
        </Card>
      ) : (
        <>
          {selecionados.length > 0 ? (
            <BulkTagBar selecionados={selecionados} onLimpar={() => setSelecionados([])} />
          ) : null}
          <Card className="hover-raise overflow-hidden">
            <ContactsTable
              contacts={allContacts}
              orderBy={orderBy}
              orderDir={orderDir}
              onSort={handleSort}
              selecionados={selecionados}
              onSelecaoChange={setSelecionados}
            />
          </Card>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {allContacts.length} {allContacts.length === 1 ? t("cliente") : t("clientes")}
              {q.hasNextPage ? ` ${t("carregados — há mais resultados")}` : ""}
            </p>
            {q.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
              >
                {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais")}
              </Button>
            )}
          </div>
        </>
      )}

      <NewContactDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportContactsDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
