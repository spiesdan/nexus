import { stat } from "node:fs/promises";
import path from "node:path";

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

/**
 * O mesmo lugar visto de dentro do contêiner do app.
 *
 * `/fiscal-certs` é um caminho de RAZ do sistema, e ele só existe porque o
 * compose monta `/srv/fiscal/certs` ali. Fora do contêiner — `pnpm dev` na
 * máquina de quem desenvolve, e o Playwright local — o caminho não existe e o
 * `mkdir` precisa de privilégio de root.
 *
 * `FISCAL_CERTS_DIR` existe para esses dois casos e **não** para mudar produção:
 * o compose não define a variável, e sem ela o valor é exatamente o de antes.
 * A e2e `jornada-fiscal` subia o app fora do contêiner e recebia 500 em toda
 * execução, com a mensagem "Verifique se o diretório existe no servidor" — que
 * é verdade e não ajuda: o diretório que falta é o do contêiner, não o do
 * servidor.
 */
export const DIRETORIO_DE_CERTIFICADOS_NO_APP =
  process.env.FISCAL_CERTS_DIR?.trim() || "/fiscal-certs";

/**
 * Nome fixo do certificado dentro do diretório da organização.
 *
 * Fixo por três motivos: o cliente manda nome próprio (entrada não confiável),
 * dois certificados com o mesmo nome sobrescreveriam um ao outro em silêncio,
 * e o sidecar precisa de um caminho estável para ler.
 */
export const NOME_DO_CERTIFICADO = "certificado.pfx";

/** UUID canônico. Aceitar só isto impede que um id-PA atravessando vire caminho. */
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O diretório de UMA organização.
 *
 * ─── Por que por organização, e não um arquivo só ────────────────────────────
 *
 * Medido nesta instalação: `fiscal_settings` tem **duas** linhas — a organização
 * real (`4bc721ce…`) e a organização de teste do e2e (`16f950b8…`). Com um
 * arquivo único em `/srv/fiscal/certs/certificado.pfx`, a segunda organização
 * que enviasse certificado **sobrescreveria o da primeira** — e o sidecar da
 * primeira passaria a assinar com o certificado da outra.
 *
 * Não é teoria de multi-inquilino: é a instalação real, com o e2e criando
 * organização a cada rodada. E o custo de isolar é uma pasta a mais.
 */
export function diretorioDoCertificado(
  organizationId: string,
  base = DIRETORIO_DE_CERTIFICADOS_NO_APP,
): string | null {
  if (!UUID_CANONICO.test(organizationId)) return null;
  return `${base}/${organizationId}`;
}

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
  organizationId: string,
  base = DIRETORIO_DE_CERTIFICADOS_NO_APP,
): ResultadoDoCertificado {
  const diretorio = diretorioDoCertificado(organizationId, base);
  if (!diretorio) {
    // Só acontece com organização malformada, o que `requireRole` já impede.
    // A checagem fica de novo porque `decidirCertificado` é pública e
    // testável: uma função que constrói caminho a partir de string precisa
    // validar a string, mesmo que hoje o chamador já valide.
    return { ok: false, status: 422, motivo: "Organização inválida para o certificado." };
  }
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

/**
 * O certificado DESTA organização está no disco?
 *
 * ─── Por que esta função mora AQUI, e não em cada rota ───────────────────────
 *
 * Porque a tela de Notas lê a config fiscal direto do banco, na página de
 * servidor — NÃO pela API. A primeira versão desta checagem vivia só na API, e
 * o `certificado_presente` chegava `undefined` na tela: com o arquivo no disco,
 * a tela continuava dizendo "não está no servidor".
 *
 * Duas cópias de uma regra é como as duas divergem sem ninguém ver — foi
 * exatamente o que aconteceu com `certificado_path`, escrito à mão em três
 * arquivos e divergindo. A regra mora num lugar e as duas pontas chamam.
 *
 * O caminho vem do `organization_id` da sessão, nunca do `certificado_path` do
 * banco: um valor forjado ali apontaria para o certificado de outra
 * organização.
 */
export async function certificadoPresenteNoServidor(
  organizationId: string,
  base = DIRETORIO_DE_CERTIFICADOS_NO_APP,
): Promise<boolean> {
  const diretorio = diretorioDoCertificado(organizationId, base);
  if (!diretorio) return false;
  try {
    const st = await stat(path.join(diretorio, NOME_DO_CERTIFICADO));
    return st.isFile() && st.size > 0;
  } catch {
    // Sem diretório é o estado normal de quem não enviou certificado — não é
    // erro, e transformar isso em exceção faria a tela de Notas quebrar.
    return false;
  }
}

/** `/certs` é o ponto de montagem DENTRO do sidecar (o `VOLUME` do Dockerfile). */
export const DIRETORIO_DE_CERTIFICADOS_NO_SIDECAR = "/certs";

/**
 * O caminho do certificado COMO O SIDECAR VÊ.
 *
 * ─── Por que é separado do `certificado_path` do banco ───────────────────────
 *
 * O sidecar valida o caminho antes de abrir o certificado
 * (`ServicoNfe::validar`): `certificado_arquivo` tem de estar **dentro de
 * `/certs/`**. O `certificado_path` que o app guarda é só o nome do arquivo —
 * e a tela de configuração precisa dele assim, para mostrar o que existe.
 *
 * Com o certificado por organização, o nome sozinho deixa de bastar: o arquivo
 * está em `/certs/{organization_id}/certificado.pfx`. Mandar `certificado.pfx`
 * faria o sidecar recusar com "deve estar dentro de /certs/", e o erro apareceria
 * como "nota não transmitida", sem dizer que o caminho está errado.
 *
 * Uma função só, chamada pelos dois envelopes (`sped-payload` e `entrada`),
 * porque dois jeitos de montar o mesmo caminho é como eles divergem.
 */
export function caminhoDoCertificadoNoSidecar(organizationId: string): string | null {
  const diretorio = diretorioDoCertificado(organizationId, DIRETORIO_DE_CERTIFICADOS_NO_SIDECAR);
  return diretorio ? `${diretorio}/${NOME_DO_CERTIFICADO}` : null;
}
