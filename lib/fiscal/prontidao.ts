/**
 * O QUE FALTA PARA A INSTALAÇÃO PODER EMITIR NOTA.
 *
 * ─── O problema que este arquivo resolve ────────────────────────────────────
 *
 * O payload da SPED já recusa campo a campo — `Falta Inscrição Estadual`,
 * `Falta CNPJ do emitente`. Mas essa recusa acontece **na hora de emitir**, e
 * para **uma nota por vez**.
 *
 * O alerta do Meu Dia, pelo outro lado, falava só uma coisa:
 * "a instalação não tem provedor que confirme a emissão". E isso era
 * incorreto — medido em produção em 10/10/2026, org `4bc721ce…`:
 *
 *   - `provedor` = `stub`                    (o que o alerta dizia)
 *   - `emitente_documento` vazio             ← CNPJ do emitente
 *   - `ie` vazio                             ← Inscrição Estadual
 *   - `codigo_municipio` vazio               ← código IBGE
 *   - `uf` vazio
 *
 * Quem seguisse a advice à letra configurava o provedor, emissionava, e recebia
 * `Falta CNPJ do emitente`. O alerta apontava para onde não estava o problema — e
 * um alerta que aponta para o lado errado é pior que nenhum, porque leva a pessoa
 * a dichar que resolveu e não resolveu.
 *
 * ─── Por que uma função pura, e não uma consulta na tela ───────────────────
 *
 * Porque a tela precisa **listar tudo de uma vez**. Descobrir uma pendência por
 * tentativa é o que torna a emissão seem meses. E porque a mesma lista serve para
 * o alerta do Meu Dia e para a tela de configuração: dois lugares que dizem a
 * mesma coisa, com a mesma ordem.
 *
 * ─── A ordem das pendências ────────────────────────────────────────────────
 *
 * É a ordem em que a pessoa desbloqueia: documento → IE → município/UF →
 * certificado → provedor. Colocar o provedor primeiro seria repetir o erro do
 * alerta atual — é o que a pessoa pensa em arrumar primeiro e não é o que
 * impede a emissão.
 */

/** O que a consulta de prontidão lê de `fiscal_settings`. */
export interface ConfigFiscalParaProntidao {
  provedor?: string | null;
  emitente_documento?: string | null;
  ie?: string | null;
  uf?: string | null;
  codigo_municipio?: string | null;
  municipio?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero_end?: string | null;
  bairro?: string | null;
  certificado_path?: string | null;
}

export type ChaveDaPendencia =
  | "emitente_documento"
  | "ie"
  | "codigo_municipio"
  | "uf"
  | "municipio"
  | "cep"
  | "logradouro"
  | "numero_end"
  | "bairro"
  | "certificado_path"
  | "provedor";

export interface Pendencia {
  chave: ChaveDaPendencia;
  /** Como aparece para a pessoa — e no botão que abre a tela de configuração. */
  rotulo: string;
  /**
   * Por que este campo é obrigatório, em uma frase.
   *
   * Sem isto a lista vira um formulário de campos vazios e a pessoa não sabe o
   * que procurar. "Inscrição Estadual" é um rótulo; "o número da sua empresa no
   * cadastro do estado" diz onde achar.
   */
  onde: string;
}

/**
 * Os provedores que NÃO/emitem.
 *
 * `stub` grava a nota no sistema e não consulta a SEFAZ. Não é "provedor
 * faltando": é um provedor que funciona, e por isso é o mais perigoso — o
 * sistema registra uma emissão que ninguém fez.
 */
export const PROVEDORES_SEM_CONFERENCIA = new Set(["stub", "", "fake", "nenhum", "null"]);

export function provedorConfereEmissao(provedor: string | null | undefined): boolean {
  return !PROVEDORES_SEM_CONFERENCIA.has((provedor ?? "").trim().toLowerCase());
}

const VAZIO = (v: string | null | undefined): boolean => !(v ?? "").trim();

/**
 * Tudo que falta, na ordem em que desbloqueia.
 *
 * `provedor` fica por último de propósito. Ver a nota do cabeçalho.
 */
export function pendenciasFiscais(config: ConfigFiscalParaProntidao | null): Pendencia[] {
  if (!config) {
    return [
      {
        chave: "emitente_documento",
        rotulo: "Configuração fiscal",
        onde: "A instalação não tem nenhuma configuração fiscal. Notas → Configuração fiscal.",
      },
    ];
  }

  const faltam: Pendencia[] = [];
  const add = (chave: ChaveDaPendencia, rotulo: string, onde: string) => {
    if (VAZIO(config[chave] as string | null | undefined)) faltam.push({ chave, rotulo, onde });
  };

  // O documento primeiro: sem CNPJ da matriz, nada mais é aceito.
  add(
    "emitente_documento",
    "CNPJ do emitente",
    "O CNPJ da empresa que emite. Notas → Configuração fiscal → Dados do emitente.",
  );
  add(
    "ie",
    "Inscrição Estadual",
    "O número da sua empresa no cadastro do estado. Não está no certificado A1 — sai no portal da SEFAZ do seu estado.",
  );
  add(
    "codigo_municipio",
    "Código IBGE do município",
    "O código de 7 dígitos do município do emitente. A mesma tabela do correio serve.",
  );
  add("uf", "UF do emitente", "A sigla do estado, com as duas letras.");
  add("municipio", "Município do emitente", "O nome do município do emitente.");
  add("cep", "CEP do emitente", "O CEP do endereço do emitente.");
  add("logradouro", "Logradouro do emitente", "A rua do endereço do emitente.");
  add("numero_end", "Número do emitente", "O número do endereço do emitente.");
  add("bairro", "Bairro do emitente", "O bairro do endereço do emitente.");

  // O certificado é o que assina. Vem antes do provedor porque é anterior:
  // mesmo com um provedor real, sem certificado não há o que transmitir.
  add(
    "certificado_path",
    "Certificado A1",
    "O arquivo .pfx, enviado em Notas → Configuração fiscal → Certificado.",
  );

  if (!provedorConfereEmissao(config.provedor)) {
    faltam.push({
      chave: "provedor",
      rotulo: "Provedor fiscal que confirme a emissão",
      onde:
        config.provedor && PROVEDORES_SEM_CONFERENCIA.has(config.provedor.trim().toLowerCase())
          ? `O provedor atual é "${config.provedor}", que registra a nota sem consultar a SEFAZ. Nenhuma emissão deste sistema é confirmada enquanto ele estiver assim.`
          : "Nenhum provedor configurado. Sem ele o sistema não transmite nada.",
    });
  }

  return faltam;
}

/**
 * A frase que o alerta do Meu Dia mostra.
 *
 * Lista as DUAS primeiras e diz quantas faltam. Todas as dez transformam o
 * alerta num formulário dentro de um aviso — e o aviso precisa continuar sendo
 * curto para caber na tela do Meu Dia.
 */
export function fraseDasPendencias(pendencias: Pendencia[]): string {
  if (pendencias.length === 0) {
    return "A configuração fiscal está completa e o provedor confere a emissão.";
  }
  const [primeira, segunda] = pendencias;
  const duas = `${primeira!.rotulo} e ${segunda!.rotulo}`;
  const resto = pendencias.length - 2;
  const lista = resto > 0 ? `${duas} (e mais ${resto})` : duas;
  return `A instalação não consegue emitir: falta ${lista}. Notas → Configuração fiscal.`;
}

/** A instalação está pronta para emitir de verdade? */
export function podeEmitirNota(config: ConfigFiscalParaProntidao | null): boolean {
  return pendenciasFiscais(config).length === 0;
}
