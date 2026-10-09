/**
 * A AGENDA NÃO ABRE EM VERMELHO POR FALTA DE CONFIGURAÇÃO.
 *
 * Medido em produção em 09/10/2026: abrir `/app/agenda` disparava
 *
 *   422 /api/v1/agenda/horarios-livres
 *   "A disponibilidade deste responsável ainda não foi configurada."
 *
 * e a tela pintava VERMELHO.
 *
 * ─── A causa é um desencontro, não um erro de pintura ────────────────────────
 *
 * `agenda_tipo_desativado`, `agenda_sem_responsavel` e `agenda_fora_da_jornada`
 * já existiam no registro de códigos, e o `ApiErrorToast` já lhes dava tom de
 * aviso. A rota só nunca os emitia: devolvia `validation_failed` para os três.
 *
 * O teste abaixo existe porque essa classe de defeito — o código certo escrito
 * e desligado na outra ponta — não tem sintaxe que o compilador acuse. A
 * referência cruzada entre os dois arquivos é o que pega.
 */
import { describe, expect, it } from "vitest";

import { COPY } from "@/components/feedback/ApiErrorToast";
import { ApiErrorCodes } from "@/lib/api/errors";
import fs from "node:fs";
import path from "node:path";

const ROTA = path.join(process.cwd(), "app/api/v1/agenda/horarios-livres/route.ts");

describe("recusas da agenda têm código e tom", () => {
  it("os três casos de 'falta configurar' existem no registro", () => {
    // Faltando no registro, `fail()` nem compila com o código — que é a
    // razão de este teste existir: o registro cresceu (o terceiro código), mas
    // nada garante que continue coerente com quem emite.
    for (const codigo of [
      "agenda_tipo_desativado",
      "agenda_sem_responsavel",
      "agenda_jornada_nao_configurada",
    ]) {
      expect(Object.values(ApiErrorCodes), `${codigo} sumiu do registro`).toContain(codigo);
    }
  });

  it("cada uma tem tom de aviso, não de erro", () => {
    for (const codigo of [
      "agenda_tipo_desativado",
      "agenda_sem_responsavel",
      "agenda_jornada_nao_configurada",
    ]) {
      const entrada = COPY[codigo];
      expect(entrada, `${codigo} sem entrada no COPY → cai no toast.error vermelho`).toBeDefined();
      expect(entrada!.variant, `${codigo} está pintando a tela de vermelho`).toBe("warning");
    }
  });

  it("a rota emite os três — e não `validation_failed` para eles", () => {
    const fonte = fs.readFileSync(ROTA, "utf8");
    // Este é o teste que pega o defeito real: os códigos PODEM existir e ter
    // tom certo, e a rota mesmo assim devolver `validation_failed`.
    for (const codigo of [
      "agenda_tipo_desativado",
      "agenda_sem_responsavel",
      "agenda_jornada_nao_configurada",
    ]) {
      expect(fonte, `a rota não emite ${codigo}`).toContain(`codigo: "${codigo}"`);
    }
    expect(
      fonte.match(/jornada_mal_configurada: \{ codigo: "validation_failed"/),
      "jornada_mal_configurada voltou a validation_failed — e a Agenda abre vermelha",
    ).toBeNull();
  });

  it("nenhum dos três traz `msg`: a rota já diz o que fazer", () => {
    // `toastFor` faz `entry.msg ?? err.message`. Uma `msg` aqui TROCARIA
    // "A disponibilidade deste responsável ainda não foi configurada. Configure em
    // Equipe → Atendimento." — que é o texto que diz o passo — por uma frase
    // genérica. É o mesmo combinado dos outros avisos do arquivo.
    for (const codigo of [
      "agenda_tipo_desativado",
      "agenda_sem_responsavel",
      "agenda_jornada_nao_configurada",
    ]) {
      expect(COPY[codigo]?.msg, `${codigo} com msg própria perde o texto da rota`).toBeUndefined();
    }
  });
});
