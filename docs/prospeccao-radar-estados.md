# Radar de prospecção — hierarquia, estados e aceite visual

Spec curta da aba **Pesquisas** (`/app/campanhas?subtela=prospeccao&aba=pesquisas`).
Fonte de dados: `docs/prospeccao-maps-contrato.md`. A tela **lê** o contrato; não
deduz estado que o banco não tem.

## Hierarquia (de cima para baixo)

1. **Título + contagem** — "Buscas no mapa", quantas, e a frase que explica a
   unidade: a busca avança termo por termo e o achado não some se ela parar.
2. **Faixa de erro de leitura** (só quando a última atualização falhou) — diz que
   a lista pode estar velha e oferece "Tentar de novo". Nunca toast por cima.
3. **Cartão da busca** — a unidade da tela. Ordem interna fixa:
   1. identidade: categorias · cidade/UF · raio · máximo;
   2. selos: estado de descoberta (degradada), parada (parando) e cobertura
      (parcial), sempre **antes** do status do banco;
   3. progresso: `N de M termos` + barra `role=progressbar` com nome;
   4. termos: concluído / falhou / em execução com tentativas 0..3 / na fila;
   5. números: encontradas, novas, duplicadas;
   6. bloco do estado (um só, na ordem parando → degradada → parcial → zero);
   7. ações.

Um cartão = uma busca. A tela não tem tabela: são poucas buscas e cada uma tem
história própria.

## Estado × ação

| Estado | O que aparece | Ação oferecida |
|---|---|---|
| Em andamento | "N de M termos", termo atual, tentativas | Pausar, Cancelar, Ver empresas (se encontrou) |
| Parando | selo "Parando…", prazo de até 125 s, resultado preservado | Cancelar; **não** oferece Pausar de novo |
| Parcial | motivo legível + "Resultado parcial" | Ver empresas (o que achou vale) |
| Zero | "0 encontrados em {cidade}" + por que | Ampliar para 2× km e repetir; OSM; Places |
| Degradada | selo "Descoberta degradada" + `degradacao_motivo` | OSM; Places; caminho para a Configuração |

Regra de ouro: **estado é leitura, ação é escolha**. Nenhum provedor é trocado
sozinho. O contrário — fallback automático — esconde do operador que a descoberta
mudou de fonte.

### Limite do contrato (atualizado 27/11)

`POST /prospecting/searches` **passa a aceitar provider explícito** entre os
habilitados (decisão do CTO): OSM sempre; Places quando a instalação tem o flag
e o tenant tem a chave; sem `provider`, vale o ativo. Auditoria registra a
origem. Até o Backend entregar (05/12), a tela mostra a mensagem da rota e o
link da Configuração — nunca troca em silêncio.

- **Places desabilitado** (sem flag ou sem chave): o botão fica desabilitado com
  o motivo visível ao lado ("Places indisponível: falta a chave do Google nesta
  instalação" / "…e a organização não cadastrou a chave"). Não some sem
  explicação.
- **Chave do Google**: vale a do tenant primeiro, com fallback para a chave da
  instalação. A tela diz de quem é a chave em uso — quem opera precisa saber
  qual conta paga a consulta.
- **OSM** sempre disponível.
- **maps_browser** não aparece como opção antes de 12/12: é esqueleto.

### Repetir na mesma coordenada

Zero/parcial/degradada repetem com a **mesma latitude/longitude** que o GET da
lista devolve (Backend 05/12), em um clique. A tela não abre a aba Buscar
preenchida nem pede a cidade de novo.

## Lista canônica dos estados (para captura e aceite)

Cinco estados semânticos; **seis capturas**, porque "em andamento" tem duas
leituras visuais obrigatórias. O gate do QA usa carregando/resultado/zero/
degradada/parcial — este mapa fecha com ele.

| # | Estado canônico | Dado / condição | Nome do arquivo de captura | O que o aceite verifica |
|---|---|---|---|---|
| 1 | **Carregando** (em andamento, sem achado) | `queued`, ou `running` sem termo concluído | `carregando-{1440,390}.png` | Esqueleto com a forma do cartão; "0 de N termos"; sem números inventados; sem CTA de pausa em `queued` |
| 2 | **Resultado** (em andamento, com achado) | `running`, ≥1 termo concluído, `encontradas > 0` | `resultado-{1440,390}.png` | Termo atual + tentativas 0..3; progresso termo×cidade; encontradas/novas/duplicadas; "Ver empresas" |
| 3 | **Parando** | `running` + `estado_parada=parando`, `parada_maxima_s=125` | `parando-{1440,390}.png` | Status "Procurando" + selo "Parando…" separado; prazo de 125 s; sem Pausar duplicado; achado preservado |
| 4 | **Parcial** | `completed`/`paused` com cobertura incompleta ou termo falho | `parcial-{1440,390}.png` | `parcial_motivo` legível; resultado preservado; busca ainda correndo NÃO ganha o selo |
| 5 | **Zero** | `completed` + `motivo_zero=sem_resultados` + `encontradas=0` | `zero-{1440,390}.png` | "0 encontrados em {cidade}"; três saídas (2× raio, OSM, Places) com estado habilitado/desabilitado correto |
| 6 | **Degradada** | `degradada=true` + `degradacao_motivo` | `degradada-{1440,390}.png` | Motivo na íntegra; "a descoberta está degradada"; OSM/Places; nenhum fallback automático |

**Parando tem prova própria** (captura 3). Ele não é subestado de "parcial":
status continua `running` e o prazo é o que separa "pedi para parar" de "parou".
Se a captura 3 faltar, o estado não está provado.

## Checklist de aceite (por estado, 1440 e 390)

**Comum a todos**
- [ ] Nenhum nome de produto/revendedor hardcoded; cor vem do tema.
- [ ] Um `h2` por seção; cartões em lista ordenada.
- [ ] Barra de progresso com `role=progressbar`, `aria-valuenow` e nome que
      inclui a cidade.
- [ ] Alvos de toque ≥ 44 px; nenhuma ação só por hover.
- [ ] Loading (esqueleto com a forma), vazio (com ação "Encontrar empresas") e
      erro (com "Tentar de novo") desenhados.
- [ ] 390 px: nenhuma rolagem horizontal; números não truncam.

**Carregando (sem achado) e Resultado (com achado)**
- [ ] Carregando desenha esqueleto com a forma do cartão, não tela vazia.
- [ ] Diz quantos termos fecharam, qual roda e em que tentativa (0..3).
- [ ] Percentual bate com termos fechados ÷ total — nunca com células.
- [ ] Pausar desabilita durante a chamada e o cartão não "pula".

**Parando**
- [ ] Status continua **Procurando**; existe selo "Parando…" separado.
- [ ] Diz o prazo máximo (125 s) e que o termo em curso termina antes.
- [ ] Não oferece Pausar de novo; Cancelar continua disponível.
- [ ] O que já foi encontrado continua visível e linkado.

**Parcial**
- [ ] `parcial_motivo` legível (não código) e resultado preservado.
- [ ] Busca que ainda corre **não** ganha selo "Parcial".
- [ ] Degradada não repete o bloco de parcial.

**Zero**
- [ ] Texto "0 encontrados…" com termos e cidade; nunca lista vazia muda.
- [ ] Três saídas visíveis: ampliar raio (mostra o número), OSM, Places.
- [ ] Se a troca de provedor for recusada, a mensagem da rota + link da
      Configuração aparecem no cartão.

**Degradada**
- [ ] `degradacao_motivo` na íntegra, sem resumir para "erro".
- [ ] Diz que a descoberta está degradada e que a escolha é humana.
- [ ] Sem fallback automático: nenhuma busca nova nasce sem clique.

## Fora de escopo (fases seguintes)

Grade por região, e-mail e avaliações. O cartão não promete o que não existe.
