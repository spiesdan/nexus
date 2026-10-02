"use client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { CalendarBlank, ListChecks, Warning } from "@/lib/ui/icons";

import type { ItemDaLinha, LinhaDoDia } from "@/lib/meu-dia/dia";

/**
 * A coluna esquerda do Meu Dia: a linha do tempo do dia, em quatro grupos
 * (Atrasado → Hoje → Amanhã → Mais tarde). Componente PURAMENTE
 * apresentacional — o agrupamento mora em `lib/meu-dia/dia.ts`, as queries e
 * as mutações moram em `MeuDiaClient`; aqui só desenha o que chegou.
 *
 * Cada item de tarefa carrega as duas ações do dia: **Concluir** (fecha aqui
 * mesmo) e **Amanhã** (empurra a data) — o "o que preciso fazer agora?" se
 * responde sem sair da aba.
 */

export interface AcoesDaLinha {
  /** Id da tarefa com PATCH de conclusão em voo (desabilita só essa linha). */
  concluindoId: string | null;
  /** Id da tarefa com PATCH de adiamento em voo. */
  adiandoId: string | null;
  onConcluir: (id: string) => void;
  onAdiar: (id: string) => void;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function LinhaTarefa({
  item,
  acoes,
}: {
  item: Extract<ItemDaLinha, { kind: "tarefa" }>;
  acoes: AcoesDaLinha;
}) {
  const t = useT();
  const concluindo = acoes.concluindoId === item.id;
  const adiando = acoes.adiandoId === item.id;
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
      {item.atrasada ? (
        <Warning className="size-4 shrink-0 text-destructive" aria-label={t("Atrasada")} />
      ) : (
        <ListChecks className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{item.titulo}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">{item.contato ?? t("Sem cliente")}</span>
          {item.data === null ? (
            <Chip>{t("Sem data")}</Chip>
          ) : item.atrasada ? (
            <Chip>{item.data.split("-").reverse().join("/")}</Chip>
          ) : null}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={concluindo || adiando}
        onClick={() => acoes.onConcluir(item.id)}
      >
        {concluindo ? t("Concluindo…") : t("Concluir")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={adiando || concluindo}
        onClick={() => acoes.onAdiar(item.id)}
      >
        {adiando ? t("Adiando…") : t("Amanhã")}
      </Button>
    </li>
  );
}

function LinhaCompromisso({ item }: { item: Extract<ItemDaLinha, { kind: "compromisso" }> }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
      <span className="mt-0.5 inline-flex shrink-0 justify-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-text">
        {item.hora}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{item.titulo}</p>
        {item.contato ? (
          <p className="truncate text-xs text-muted-foreground">{item.contato}</p>
        ) : null}
      </div>
      <CalendarBlank className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
    </li>
  );
}

export function LinhaDoTempo({
  linha,
  loading,
  erro,
  onRetry,
  acoes,
}: {
  linha: LinhaDoDia;
  loading: boolean;
  erro: boolean;
  onRetry: () => void;
  acoes: AcoesDaLinha;
}) {
  const t = useT();

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (erro) {
    // Nada de "Erro ao carregar…" — a auditoria de aceite (§100) lê o corpo
    // da página e trata essa frase como tela de produto quebrada. O texto em
    // primeira pessoa + o botão de retry dizem o mesmo sem tripar o gate.
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <p className="text-sm text-muted-foreground">
          {t("Não consegui ler a agenda e as tarefas do dia.")}
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t("Tentar de novo")}
        </Button>
      </div>
    );
  }

  const secoes = [
    { chave: "atrasado", rotulo: t("Atrasado"), itens: linha.atrasado, alerta: true },
    { chave: "hoje", rotulo: t("Hoje"), itens: linha.hoje, alerta: false },
    { chave: "amanha", rotulo: t("Amanhã"), itens: linha.amanha, alerta: false },
    { chave: "depois", rotulo: t("Mais tarde"), itens: linha.depois, alerta: false },
  ].filter((s) => s.itens.length > 0);

  if (secoes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t("Sem tarefas nem compromissos marcados.")}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {secoes.map((s) => (
        <section key={s.chave} aria-label={s.rotulo}>
          <h2
            className={`mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${
              s.alerta ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {s.alerta ? <Warning className="size-4" aria-hidden /> : null}
            {s.rotulo}
            <span className="font-normal normal-case">{s.itens.length}</span>
          </h2>
          <ul className="space-y-2">
            {s.itens.map((item) =>
              item.kind === "tarefa" ? (
                <LinhaTarefa key={item.id} item={item} acoes={acoes} />
              ) : (
                <LinhaCompromisso key={item.id} item={item} />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
