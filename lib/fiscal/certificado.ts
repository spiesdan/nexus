/**
 * O CERTIFICADO A1 — onde ele fica e como ele chega lá.
 *
 * ─── O defeito que este módulo corrige ───────────────────────────────────────
 *
 * A tela "Configuração fiscal" tinha um botão "Escolher arquivo" que aceitava
 * `.pfx` e fazia exatamente isto (`ConfigFiscal.tsx`):
 *
 * ```tsx
 * onChange={(e) => {
 *   const f = e.target.files?.[0];
 *   if (f) setCertPath(f.name);   // só o NOME
 * }}
 * ```
 *
 * O arquivo **nunca era lido, nunca saía do computador de quem escolheu, e
 * nunca chegava no servidor**. O que gravava era o nome do arquivo, como texto,
 * em `fiscal_settings.certificado_path` — e a tela ficava com cara de
 * configurada: nome do certificado, senha cifrada, ambiente definido.
 *
 * Medido na instalação depois que alguém "configurou" o certificado:
 *
 *   /srv/fiscal/certs .......... NÃO EXISTE
 *   *.pfx / *.p12 no disco ..... nenhum
 *   *.pfx em volume docker ..... nenhum
 *   fiscal_settings.certificado_path = "PATRICIA CNPJ (1).pfx"
 *
 * Um certificado digital é credencial que assina nota fiscal. Uma tela que
 * aceita um seletor de arquivo e não envia nada é pior do que não ter o botão:
 * ela converte "achei que tinha configurado" em silêncio.
 *
 * ─── Onde o arquivo fica, e por que não é o Storage ─────────────────────────
 *
 * `PROTOCOLO`: `/srv/fiscal/certs`, montado no app em `/fiscal-certs` e
 * legível pelo sidecar. O README do sidecar já dizia, antes de a tela existir,
 * que o `.pfx` entra por SCP e **nunca** pelo Storage público — e a tela
 * contradizia exatamente essa regra. Store no bucket público significaria
 * certificado com URL adivinhável.
 *
 * O nome do arquivo é **sempre** `certificado.pfx` dentro do diretório, e não o
 * nome que veio do navegador: além de evitar collision, um nome vindo do
 * cliente é entrada não confiável, e `../../` num nome de arquivo é o começo
 * de uma escrita fora do diretório.
 */

/** Onde o certificado é gravado, no host. Vem do compose — fonte única. */
export const DIRETORIO_DE_CERTIFICADOS_NO_HOST = "/srv/fiscal/certs";

/** O mesmo lugar visto de dentro do contêiner do app. */
export const DIRETORIO_DE_CERTIFICADOS_NO_APP = "/fiscal-certs";

/**
 * Nome fixo do certificado dentro do diretório.
 *
 * Fixo por três motivos: o cliente manda nome próprio (entrada não confiável),
 * dois certificados com o mesmo nome sobrescreveriam um ao outro em silêncio,
 * e o sidecar precisa de um caminho estável para ler.
 */
export const NOME_DO_CERTIFICADO = "certificado.pfx";

/**
 * Teto do arquivo, medido contra certificado A1 real.
 *
 * O `.pfx` é um PKCS#12, que carrega a chave privada **cifrada dentro do
 * arquivo**. Cinco MB é folgado para um A1 e curto o bastante para o upload não
 * virar um disco cheio por requisição — o corpo da requisição também entra na
 * memória do processo antes de qualquer coisa.
 */
export const TAMANHO_MAXIMO_DO_CERTIFICADO = 5 * 1024 * 1024;

/**
 * Reconhece o início de um DER, que é como todo PKCS#12 começa.
 *
 * `0x30` é SEQUENCE; os três bytes seguintes são o tamanho. Um `.pfx` real
 * sempre começa assim. Conferir os bytes vale mais que checar a extensão: o
 * `accept=".pfx"` do `<input type="file">` é dica de interface, e a interface é
 * do cliente — quem decide é o servidor. Um arquivo renomeado de `.exe` passa
 * pelo filtro de extensão e para aqui.
 */
export function parecePkcs12(cabecalho: Uint8Array): boolean {
  if (cabecalho.length < 4) return false;
  return cabecalho[0] === 0x30 && cabecalho[1] === 0x82;
}

/**
 * O que o cliente pode ter enviado, e o que a rota guarda.
 *
 * A assinatura é `File` porque é o que `req.formData()` devolve no runtime
 * Node. Aceitar `string` também deixaria a porta aberta para alguém gravar
 * lixo de propósito — e o valor só é lido para checar os bytes.
 */
export interface CertidoRecebido {
  size: number;
  /** Só o começo — o suficiente para reconhecer o DER, e não o arquivo todo. */
  cabecalho: Uint8Array;
  /** Nome que veio do cliente. Usado SÓ para a mensagem de erro. */
  nomeOriginal: string;
}

/** O que a rota grava, ou o motivo pelo qual recusou. */
export type ResultadoDoCertificado =
  | { ok: true; caminhoNoHost: string; tamanho: number }
  | { ok: false; motivo: string; status: number };

/**
 * Decide o destino do arquivo, ou recusa.
 *
 * Devolve o caminho **para gravar** e não o conteúdo: quem chama decide como
 * escrever. A separação existe porque a checagem é pura (e testável sem disco)
 * enquanto a escrita é efeito de borda.
 */
export function decidirCertificado(
  arquivo: CertidoRecebido,
  diretorio = DIRETORIO_DE_CERTIFICADOS_NO_APP,
): ResultadoDoCertificado {
  if (arquivo.size === 0) {
    return { ok: false, status: 422, motivo: "O certificado enviado está vazio." };
  }
  if (arquivo.size > TAMANHO_MAXIMO_DO_CERTIFICADO) {
    const mb = Math.round(TAMANHO_MAXIMO_DO_CERTIFICADO / 1024 / 1024);
    return {
      ok: false,
      status: 413,
      motivo: `O certificado passa de ${mb} MB.`,
    };
  }
  if (!parecePkcs12(arquivo.cabecalho)) {
    // Diz o que esperava e o que chegou: "arquivo inválido" sozinho deixaria
    // quem opera sem saber se o certificado está ruim ou se o envio saiu errado.
    const nome = arquivo.nomeOriginal || "arquivo";
    return {
      ok: false,
      status: 422,
      motivo: `"${nome}" não parece um certificado A1 (.pfx): o arquivo não começa como PKCS#12.`,
    };
  }

  return {
    ok: true,
    tamanho: arquivo.size,
    caminhoNoHost: `${diretorio}/${NOME_DO_CERTIFICADO}`,
  };
}
