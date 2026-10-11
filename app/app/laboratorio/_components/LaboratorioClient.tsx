"use client";

/**
 * O LABORATÓRIO NA TELA — rodar, ver a nota, ver o delta.
 *
 * ─── O que esta tela é ──────────────────────────────────────────────────────
 *
 * Fina de propósito: a inteligência mora na API (simulação + juiz + delta).
 * Aqui há uma lista de campanhas, um botão "Rodar laboratório" (só para quem
 * pode: o servidor barra `agent` com 403 de qualquer jeito), a média da
 * última rodada, o delta e os achados com evidência.
 *
 * Uma rodada custa LLM de verdade (até 36 gerações + 6 juízes) e demora
 * minutos — o botão trava enquanto roda e diz quantas gerações foram, para
 * ninguém clicar duas vezes achando que travou.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";

interface Campanha {
  id: string;
  nome: string;
  status: string;
}

interface LinhaRodada {
  persona: string;
  nota: number | null;
  resumo: string;
  turnos: number;
}

interface Rodada {
  rodada_em: string;
  media: number | null;
  config_hash: string;
  personas: number;
}

interface Delta {
  de: string;
  para: string;
  delta: number | null;
  config_mudou: boolean;
}

const NOMES_PERSONA: Record<string, string> = {
  decidido: "O decidido",
  pregao_preco: "O preguntão de preço",
  irritado: "O irritado",
  pergunta_dificil: "O que pergunta o que não sabemos",
  exige_humano: "O que exige humano",
  escreve_errado: "O que escreve errado",
};

export function LaboratorioClient(): React.JSX.Element {
  const tagDoIdioma = useTagDeIdioma();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [campanhaId, setCampanhaId] = useState("");
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<{
    media: number | null;
    geracoes: number;
    linhas: LinhaRodada[];
  } | null>(null);
  const [rodadas, setRodadas] = useState<Rodada[]>([]);
  const [deltas, setDeltas] = useState<Delta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregarHistorico = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const r = await apiClient.get<{
        data: { rodadas: Rodada[]; deltas: Delta[] };
      }>(`/api/v1/prospecting/campaigns/${id}/laboratorio`);
      setRodadas(r.data.rodadas ?? []);
      setDeltas(r.data.deltas ?? []);
    } catch {
      // Histórico vazio não é erro: é a primeira rodada.
      setRodadas([]);
      setDeltas([]);
    }
  }, []);

  const trocarCampanha = useCallback(
    (id: string) => {
      // Dirigido por evento, não por effect: trocar a campanha limpa o
      // resultado e carrega o histórico em sequência, sem render em cascata.
      setCampanhaId(id);
      setResultado(null);
      void carregarHistorico(id);
    },
    [carregarHistorico],
  );

  const carregarCampanhas = useCallback(async () => {
    try {
      const r = await apiClient.get<{ data: Campanha[] }>("/api/v1/prospecting/campaigns");
      const lista = Array.isArray(r.data) ? r.data : [];
      setCampanhas(lista);
      if (lista.length > 0) trocarCampanha(lista[0]!.id);
    } catch {
      setErro("Não consegui listar as campanhas.");
    }
  }, [trocarCampanha]);

  const iniciado = useRef(false);
  useEffect(() => {
    // Uma vez só: o ref impede a recarga em cascata quando `carregarCampanhas`
    // troca de identidade e o effect rodaria de novo.
    if (iniciado.current) return;
    iniciado.current = true;
    void carregarCampanhas();
  }, [carregarCampanhas]);

  const rodar = useCallback(async () => {
    if (!campanhaId || rodando) return;
    setRodando(true);
    setErro(null);
    try {
      const r = await apiClient.post<{
        data: { media: number | null; geracoes: number; linhas: LinhaRodada[] };
      }>(`/api/v1/prospecting/campaigns/${campanhaId}/laboratorio`, {});
      setResultado({
        media: r.data.media,
        geracoes: r.data.geracoes,
        linhas: r.data.linhas,
      });
      await carregarHistorico(campanhaId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "A rodada falhou.");
    } finally {
      setRodando(false);
    }
  }, [campanhaId, rodando, carregarHistorico]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          Campanha
          <select
            className="rounded-md border border-border bg-surface px-3 py-2"
            value={campanhaId}
            onChange={(e) => trocarCampanha(e.target.value)}
          >
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({c.status})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void rodar()}
          disabled={!campanhaId || rodando}
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        >
          {rodando ? "Rodando as 6 personas…" : "Rodar laboratório"}
        </button>
      </div>

      {erro && (
        <div role="alert" className="rounded-md border border-border bg-surface p-3 text-sm">
          {erro}
        </div>
      )}

      {resultado && (
        <section
          aria-label="Resultado da rodada"
          className="rounded-md border border-border bg-surface p-4"
        >
          <h2 className="text-base font-semibold">
            Nota da rodada: {resultado.media ?? "—"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({resultado.geracoes} gerações de IA)
            </span>
          </h2>
          <ul className="mt-2 space-y-1">
            {resultado.linhas.map((l) => (
              <li key={l.persona} className="text-sm">
                <strong>{NOMES_PERSONA[l.persona] ?? l.persona}:</strong> {l.nota ?? "—"} —{" "}
                {l.resumo}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rodadas.length > 0 && (
        <section aria-label="Histórico" className="rounded-md border border-border bg-surface p-4">
          <h2 className="text-base font-semibold">Histórico</h2>
          <ul className="mt-2 space-y-1">
            {rodadas.map((r) => (
              <li key={r.rodada_em} className="text-sm">
                {new Date(r.rodada_em).toLocaleString(tagDoIdioma)} — média {r.media ?? "—"} (
                {r.personas} personas)
              </li>
            ))}
          </ul>
          {deltas.length > 0 && (
            <>
              <h3 className="mt-3 text-sm font-semibold">Delta</h3>
              <ul className="mt-1 space-y-1">
                {deltas.map((d) => (
                  <li key={`${d.de}-${d.para}`} className="text-sm">
                    {d.delta === null
                      ? "sem comparação possível"
                      : `${d.delta >= 0 ? "+" : ""}${d.delta} pontos`}
                    {d.config_mudou && " (a campanha mudou no meio — comparar com cuidado)"}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
