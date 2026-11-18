"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { montarCodigoDePareamento } from "@/lib/offline/credencial";

/**
 * O relógio fora do corpo do componente — `Date.now()` no render é impuro e o
 * lint (`react-hooks/purity`) reprova. Mesma solução da tela de API tokens.
 */
function agoraMs(): number {
  return Date.now();
}

export interface AparelhoOffline {
  id: string;
  user_id: string;
  nome: string;
  token_prefix: string;
  scopes: unknown;
  last_seen_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

interface Membro {
  user_id: string;
  role: string;
  full_name: string | null;
}

interface Criado {
  id: string;
  nome: string;
  plaintext: string;
  expires_at: string;
}

/**
 * A TELA DO PAREAMENTO — o único lugar que emite a credencial do aparelho.
 *
 * O token aparece UMA vez e vira um código (`NEXUS1....`) que o vendedor cola
 * no celular. Perdido, gera outro: não há "ver de novo", e a lista só mostra o
 * prefixo. É o mesmo contrato de `api_tokens`, com uma diferença que importa:
 * aqui a pessoa do aparelho (quem assina o pedido) é escolhida, não herdada de
 * quem criou o código.
 */
export function DevicesClient({ inicial }: { inicial: AparelhoOffline[] }) {
  const tag = useTagDeIdioma();
  const router = useRouter();
  const confirmar = useConfirmar();

  const [aparelhos, setAparelhos] = useState(inicial);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [nome, setNome] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [dias, setDias] = useState(90);
  const [criando, setCriando] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: Membro[] }>("/api/v1/team/assignable")
      .then((r) => {
        if (vivo) setMembros(r.data ?? []);
      })
      .catch(() => {
        // Sem a lista o formulário continua utilizável: o default é o próprio
        // usuário. Falhar a tela inteira por causa do seletor seria pior.
      });
    return () => {
      vivo = false;
    };
  }, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) {
      toast.error("Dê um nome ao aparelho.");
      return;
    }
    setCriando(true);
    try {
      const r = await apiClient.post<{ data: Criado }>("/api/v1/offline-devices", {
        nome: nome.trim(),
        ...(pessoa ? { user_id: pessoa } : {}),
        expires_in_days: dias,
      });
      setCriado(r.data);
      setNome("");
      setPessoa("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a credencial.");
    } finally {
      setCriando(false);
    }
  };

  const revogar = async (aparelho: AparelhoOffline) => {
    const ok = await confirmar({
      title: "Desconectar este aparelho?",
      description: `“${aparelho.nome}” deixa de enviar pedidos na hora. A fila que já está no celular NÃO é apagada — volta a subir quando o aparelho for pareado de novo.`,
      confirmLabel: "Desconectar",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiClient.post(`/api/v1/offline-devices/${aparelho.id}/revoke`, {});
      setAparelhos((lista) =>
        lista.map((a) => (a.id === aparelho.id ? { ...a, revoked_at: new Date().toISOString() } : a)),
      );
      toast.success("Aparelho desconectado.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível desconectar.");
    }
  };

  const codigo = criado ? montarCodigoDePareamento(window.location.origin, criado.plaintext) : "";

  return (
    <div className="flex flex-col gap-6">
      {criado ? (
        <section className="rounded-xl border border-success/40 bg-success-bg p-4 text-sm text-success-fg">
          <h2 className="mb-1 font-medium">Aparelho “{criado.nome}” criado</h2>
          <p className="mb-2">
            Copie o código abaixo e cole no app (tela inicial → “Código de pareamento”).
            Ele <strong>não é mostrado de novo</strong>; perdido, gere outro.
          </p>
          <textarea
            readOnly
            value={codigo}
            aria-label="Código de pareamento"
            className="mb-2 h-24 w-full rounded-md border border-border bg-surface p-2 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => {
                void copyToClipboard(codigo).then((ok) => {
                  toast[ok ? "success" : "error"](ok ? "Código copiado." : "Não deu para copiar.");
                });
              }}
            >
              Copiar código
            </Button>
            <Button type="button" variant="outline" onClick={() => setCriado(null)}>
              Já copiei
            </Button>
            <span className="text-xs opacity-80">Expira em {new Date(criado.expires_at).toLocaleDateString(tag)}</span>
          </div>
        </section>
      ) : null}

      <form onSubmit={criar} className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="font-medium">Novo aparelho</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Nome do aparelho
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Celular do Daniel"
              maxLength={100}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Vendedor que assina os pedidos
            <select
              value={pessoa}
              onChange={(e) => setPessoa(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value="">Eu mesmo</option>
              {membros.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.user_id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Validade
            <select
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={180}>180 dias</option>
              <option value={365}>365 dias</option>
            </select>
          </label>
        </div>
        <div>
          <Button type="submit" disabled={criando}>
            {criando ? "Criando…" : "Gerar código de pareamento"}
          </Button>
        </div>
      </form>

      <section className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Aparelho</th>
              <th className="px-3 py-2">Prefixo</th>
              <th className="px-3 py-2">Visto por último</th>
              <th className="px-3 py-2">Expira</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {aparelhos.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum aparelho pareado. Gere um código acima.
                </td>
              </tr>
            ) : (
              aparelhos.map((a) => {
                const revogado = a.revoked_at != null;
                const expirado = Date.parse(a.expires_at) <= agoraMs();
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{a.nome}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.token_prefix}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {a.last_seen_at ? new Date(a.last_seen_at).toLocaleString(tag) : "nunca"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(a.expires_at).toLocaleDateString(tag)}
                    </td>
                    <td className="px-3 py-2">
                      {revogado ? (
                        <Badge variant="secondary">desconectado</Badge>
                      ) : expirado ? (
                        <Badge variant="secondary">expirado</Badge>
                      ) : (
                        <Badge>ativo</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!revogado ? (
                        <Button type="button" variant="outline" onClick={() => void revogar(a)}>
                          Desconectar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
