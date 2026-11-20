/**
 * O QUE O BOTÃO DE PUBLICAR PODE FAZER — e o que ele NÃO pode.
 *
 * Publicar a rota é o gesto irreversível da tela: a carga sai de `montando`,
 * vira `em_rota` e os clientes são avisados (a rota também passa a existir no
 * aparelho do entregador). Hoje esse gesto mora numa tela vizinha, como botão
 * de STATUS ("Iniciar rota"), e a tela da rota — onde o operador está quando
 * termina de ordenar — só tem "Salvar ordem".
 *
 * A decisão de O QUE mostrar não é de componente: é uma tabela pequena, e é
 * ela que este módulo publica, testável sem browser. Quatro respostas:
 *
 *   - `publicar`   — há proposta a salvar e/ou a carga está montando;
 *   - `publicada`  — já está na rua: não se publica duas vezes;
 *   - `encerrada`  — concluída: o gesto não existe mais;
 *   - `vazia`      — sem parada, publicar não teria o que enviar.
 *
 * A ordem dos testes importa: `concluida` vence `em_rota` (uma carga concluída
 * já esteve em rota), e "sem parada" vence "publicar" — um botão que promete
 * publicar uma rota vazia é promessa que o servidor recusa (422 "Carga sem
 * pedidos").
 */

export type EstadoDaPublicacao =
  | { tipo: "publicar"; precisaSalvar: boolean }
  | { tipo: "publicada" }
  | { tipo: "encerrada" }
  | { tipo: "vazia" };

export function estadoDaPublicacao(entrada: {
  statusDaCarga: string;
  /** A ordem na tela difere da salva (proposta pendente). */
  ordemMudou: boolean;
  paradas: number;
}): EstadoDaPublicacao {
  if (entrada.statusDaCarga === "concluida") return { tipo: "encerrada" };
  if (entrada.paradas === 0) return { tipo: "vazia" };
  if (entrada.statusDaCarga === "em_rota") return { tipo: "publicada" };
  // `montando` (e qualquer estado anterior à rua que o produto venha a ter):
  // publicar é o caminho. Se a ordem na tela ainda não foi salva, publicar
  // primeiro salva — senão o entregador receberia a ordem anterior.
  return { tipo: "publicar", precisaSalvar: entrada.ordemMudou };
}
