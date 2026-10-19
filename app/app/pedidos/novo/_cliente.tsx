"use client";

import * as React from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { comoMoeda } from "@/lib/format/moeda";

export interface ContatoOpcao {
  id: string;
  display_name: string | null;
  name: string | null;
  phone_number: string | null;
  email: string | null;
}

export interface ResumoDoCliente {
  limite_cents: number | null;
  condicao: string | null;
  emAberto_cents: number;
  diasSemCompra: number | null;
  ultimoTotal_cents: number | null;
}

/**
 * Seletor de cliente (§5–6): autocomplete rápido + resumo que carrega junto
 * (tabela, condição, limite, em aberto) + alertas contextuais (crédito,
 * dias sem compra). Alertas informam, nunca bloqueiam — o bloqueio mora no
 * backend, que recusa com 422 nomeando o motivo.
 *
 * O nome exibido é `rotuloDoContato` (canônico): identificador técnico não é
 * nome de gente, e o telefone sai formatado — não uma cópia local da cadeia.
 */
export function CustomerSelector({
  contatos,
  contatoId,
  clienteNome,
  aoEscolher,
  aoCriarNovo,
  textos,
}: {
  contatos: ContatoOpcao[];
  contatoId: string | null;
  clienteNome: string;
  aoEscolher: (id: string | null, nome: string) => void;
  /** Abre o cadastro de cliente sem sair do pedido (só quando o pai oferece). */
  aoCriarNovo?: () => void;
  textos: { cliente: string; buscarCliente: string; clienteAvulso: string };
}) {
  const t = useT();
  const [busca, setBusca] = React.useState(clienteNome);
  const [resumo, setResumo] = React.useState<ResumoDoCliente | null>(null);

  // Espelha a prop (restauração de rascunho / escolha externa).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusca(clienteNome);
  }, [clienteNome]);

  React.useEffect(() => {
    if (!contatoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResumo(null);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const [contato, pedidos] = await Promise.all([
          apiClient
            .get<{ data: { limite_credito_cents: number | null; condicao_pagamento: string | null } }>(
              `/api/v1/contacts/${contatoId}`,
            )
            .then((r) => r.data),
          apiClient
            .get<{ data: { total_cents: number; status: string; created_at: string }[] }>(
              `/api/v1/commercial-orders?contact_id=${contatoId}`,
            )
            .then((r) => (Array.isArray(r.data) ? r.data : [])),
        ]);
        if (!vivo) return;
        const validos = pedidos.filter((p) => p.status !== "cancelado");
        const emAberto = validos
          .filter((p) => p.status !== "entregue")
          .reduce((s, p) => s + p.total_cents, 0);
        const ultimo = validos.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
        setResumo({
          limite_cents: contato.limite_credito_cents,
          condicao: contato.condicao_pagamento,
          emAberto_cents: emAberto,
          diasSemCompra: ultimo
            ? Math.floor((Date.now() - new Date(ultimo.created_at).getTime()) / 86400000)
            : null,
          ultimoTotal_cents: ultimo?.total_cents ?? null,
        });
      } catch (e) {
        if (vivo) showApiError(e);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [contatoId]);

  const [remotos, setRemotos] = React.useState<ContatoOpcao[]>([]);
  const [buscando, setBuscando] = React.useState(false);

  // A lista que chega por PROP é a primeira página da organização (500
  // contatos, em ordem alfabética). Numa base de milhares, o cliente
  // recém-cadastrado quase nunca está nela — e era exatamente por isso que ele
  // "não aparecia" no seletor. A busca agora pergunta ao servidor, que procura
  // na base inteira; a lista local continua valendo como resposta imediata.
  React.useEffect(() => {
    const b = busca.trim();
    if (b.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemotos([]);
      return;
    }
    let vivo = true;
    const timer = setTimeout(() => {
      setBuscando(true);
      apiClient
        .get<{ data: ContatoOpcao[] }>(
          `/api/v1/contacts?search=${encodeURIComponent(b)}&limit=12`,
        )
        .then((r) => {
          if (vivo) setRemotos(Array.isArray(r.data) ? r.data : []);
        })
        .catch(() => {
          // A lista local continua valendo: busca remota é reforço, não gate.
        })
        .finally(() => {
          if (vivo) setBuscando(false);
        });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [busca]);

  const filtrados = React.useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return [];
    const locais = contatos.filter((c) =>
      [c.display_name, c.name, c.phone_number, c.email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(b)),
    );
    const vistos = new Set(locais.map((c) => c.id));
    return [...locais, ...remotos.filter((c) => !vistos.has(c.id))].slice(0, 8);
  }, [busca, contatos, remotos]);

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="busca-cliente">{textos.cliente}</Label>
        <Input
          id="busca-cliente"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            aoEscolher(null, e.target.value);
          }}
          placeholder={textos.buscarCliente}
          autoComplete="off"
        />
        {filtrados.length > 0 && (
          <ul className="rounded-lg border bg-background shadow-sm">
            {filtrados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    const nome = rotuloDoContato(c, t);
                    setBusca(nome);
                    aoEscolher(c.id, nome);
                  }}
                >
                  {rotuloDoContato(c, t)}
                  {c.phone_number && (
                    <span className="ml-2 text-xs text-muted-foreground">{c.phone_number}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{textos.clienteAvulso}</p>
        {buscando && (
          <p className="text-xs text-muted-foreground">{t("Buscando…")}</p>
        )}
        {/* O par do Mercos: "Novo cliente" ao lado de "Listar todos clientes".
            O segundo abre a base inteira — é para quem não sabe o nome de
            cor e prefere procurar na lista, em vez de digitar e esperar. */}
        <div className="flex flex-wrap items-center gap-3">
          {aoCriarNovo && (
            // Quem chega aqui com um cliente que ainda não existe não pode ser
            // obrigado a abandonar o pedido, cadastrar em outra tela e voltar:
            // o rascunho se perde no caminho. O diálogo cria e devolve o
            // contato já escolhido (ver `OrderEditor`).
            <Button type="button" variant="outline" size="sm" onClick={aoCriarNovo}>
              {t("Cadastrar novo cliente")}
            </Button>
          )}
          <Link
            href="/app/contacts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent underline underline-offset-4"
          >
            {t("Listar todos os clientes")}
          </Link>
        </div>
      </div>

      {resumo && (
        <dl className="space-y-1 rounded-2xl border bg-muted/40 p-3 text-sm">
          {resumo.limite_cents !== null && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Limite")}</dt>
              <dd>{comoMoeda(resumo.limite_cents, "BRL")}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("Em aberto")}</dt>
            <dd>{comoMoeda(resumo.emAberto_cents, "BRL")}</dd>
          </div>
          {resumo.condicao && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Condição")}</dt>
              <dd>{resumo.condicao}</dd>
            </div>
          )}
          {resumo.diasSemCompra !== null && resumo.diasSemCompra >= 30 && (
            <p className="text-orange-600">
              ⚠ {resumo.diasSemCompra} {t("dias sem comprar")}
            </p>
          )}
          {resumo.limite_cents !== null && resumo.emAberto_cents >= resumo.limite_cents && (
            <p className="text-orange-600">{t("Limite de crédito atingido — o pedido pode ser barrado.")}</p>
          )}
        </dl>
      )}
    </div>
  );
}
