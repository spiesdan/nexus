import { describe, expect, it } from "vitest";

import { aprovacaoExpirada, correcaoSemReversao } from "./regras-correcao";
import { AGORA, correcaoSentinel, ha, MIN, primeiro, snapshot } from "./teste-fixtures";

describe("observabilidade da correção aprovada — só leitura", () => {
  it("correção reversível (pending + run_after gravado) NÃO vira ocorrência", () => {
    const achados = correcaoSemReversao(
      snapshot({ correcoes: [correcaoSentinel()] }),
    );
    expect(achados).toHaveLength(0);
  });

  it("compara instantes, não o texto: '+00:00' e 'Z' do mesmo horário são iguais", () => {
    const mesmoInstante = new Date(AGORA - 10 * MIN).toISOString();
    const comOffset = mesmoInstante.replace("Z", "+00:00");
    const achados = correcaoSemReversao(
      snapshot({
        correcoes: [
          correcaoSentinel({
            job: {
              id: "job-1",
              kind: "watchdog",
              status: "pending",
              run_after: comOffset,
            },
          }),
        ],
      }),
    );
    expect(achados).toHaveLength(0);
  });

  it("job reclamado/alterado/removido vira ocorrência com o motivo certo", () => {
    const rodando = primeiro(
      correcaoSemReversao(
        snapshot({
          correcoes: [
            correcaoSentinel({
              job: { id: "job-1", kind: "watchdog", status: "running", run_after: ha(10 * MIN) },
            }),
          ],
        }),
      ),
    );
    expect(rodando.regra).toBe("operacao.correcao_sem_reversao");
    expect(rodando.severidade).toBe("media");
    expect(rodando.evidencia.motivo).toBe("job_running");
    expect(rodando.evidencia.job_id).toBe("job-1");

    const alterado = primeiro(
      correcaoSemReversao(
        snapshot({
          correcoes: [
            correcaoSentinel({
              job: { id: "job-1", kind: "watchdog", status: "pending", run_after: ha(30 * MIN) },
            }),
          ],
        }),
      ),
    );
    expect(alterado.evidencia.motivo).toBe("run_after_alterado");

    const ausente = primeiro(
      correcaoSemReversao(snapshot({ correcoes: [correcaoSentinel({ job: null })] })),
    );
    expect(ausente.evidencia.motivo).toBe("job_ausente");
  });

  it("não olha aprovação nem correção sem evento de antecipação", () => {
    expect(
      correcaoSemReversao(
        snapshot({ correcoes: [correcaoSentinel({ estado: "aprovada", correcao: null })] }),
      ),
    ).toHaveLength(0);
    expect(
      correcaoSemReversao(snapshot({ correcoes: [correcaoSentinel({ correcao: null })] })),
    ).toHaveLength(0);
  });

  it("aprovação além de 5 min vira ocorrência; dentro da janela não", () => {
    const velha = primeiro(
      aprovacaoExpirada(
        snapshot({
          correcoes: [
            correcaoSentinel({
              estado: "aprovada",
              aprovada_em: ha(6 * MIN),
              correcao: null,
              job: null,
            }),
          ],
        }),
      ),
    );
    expect(velha.regra).toBe("operacao.aprovacao_expirada");
    expect(velha.severidade).toBe("baixa");
    expect(Number(velha.evidencia.idade_min)).toBeGreaterThanOrEqual(5);
    expect(velha.evidencia.janela_min).toBe(5);

    expect(
      aprovacaoExpirada(
        snapshot({
          correcoes: [
            correcaoSentinel({
              estado: "aprovada",
              aprovada_em: ha(4 * MIN),
              correcao: null,
              job: null,
            }),
          ],
        }),
      ),
    ).toHaveLength(0);

    // Exatamente na borda ainda não venceu; 1 ms depois vence.
    expect(
      aprovacaoExpirada(
        snapshot({
          correcoes: [
            correcaoSentinel({
              estado: "aprovada",
              aprovada_em: new Date(AGORA - 5 * MIN).toISOString(),
              correcao: null,
              job: null,
            }),
          ],
        }),
      ),
    ).toHaveLength(0);
    expect(
      aprovacaoExpirada(
        snapshot({
          correcoes: [
            correcaoSentinel({
              estado: "aprovada",
              aprovada_em: new Date(AGORA - 5 * MIN - 1).toISOString(),
              correcao: null,
              job: null,
            }),
          ],
        }),
      ),
    ).toHaveLength(1);
  });

  it("corrigida ou sem data de aprovação não é 'aprovação expirada'", () => {
    expect(aprovacaoExpirada(snapshot({ correcoes: [correcaoSentinel()] }))).toHaveLength(0);
    expect(
      aprovacaoExpirada(
        snapshot({ correcoes: [correcaoSentinel({ estado: "aprovada", aprovada_em: null })] }),
      ),
    ).toHaveLength(0);
  });
});
