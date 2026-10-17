# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Se você roda o DeskcommCRM numa VPS, **leia a seção da versão para a qual está atualizando antes de rodar `bash update.sh`**. Mudanças que exigem ação manual aparecem sob **⚠️ Requer atenção**.

## [Não lançado]

## [1.29.0] — 2026-10-17

### Adicionado

- **Campanha usa o cadastro que você já tem, e não manda para cliente próprio** A aba Campanhas ganhou a opção de tirar o público de onde ele já está, sem
  gastar API: escolha "Base já coletada" na hora de criar a campanha, e ela passa
  a usar as empresas que você já tem nas mesmas cidades e categorias. Na card, o
  botão passa a dizer "Ver público" e mostra a lista pronta.

  **O que sai da fila, e por quê** (a tela mostra, não esconde):
  - **Empresas que a loja já atende** — nome comparado por semelhança, não por
    igualdade, porque cadastro tem letra trocada ("Salomon" por "Salomón",
    "Mecânica" por "Mecanica", "X Ltda" e "X"). Medido nesta instalação: 103
    empresas da base já eram clientes. Mandar proposta comercial para cliente
    próprio não aparece como erro em lugar nenhum — é por isso que a checagem
    acontece antes, e não depois.
  - **Duplicatas** — a mesma empresa cadastrada duas vezes (933 grupos nesta
    base). A segunda ocorrência sai: duas mensagens para a mesma empresa é o
    erro que o cliente vê.
  - **Nomes parecidos** (entre 0.80 e 0.90 de semelhança) ficam na fila marcados
    para você decidir, porque essa decisão é sua.

  Nada disso envia mensagem: o público é apenas preparado, e o envio continua
  saindo pelo Disparo, que começa em simulação.

## [1.28.0] — 2026-10-17

### Adicionado

- **Assistente sabe o que cada produto é antes de responder** Cada produto do catálogo passa por uma ficha lida por máquina: se é produto
  único, conjunto (com quais itens) ou peça de reposição, além de medida,
  concentração e quantidade por embalagem. Tudo sai do que a loja cadastrou —
  nome, categoria, marca — e nada é inventado.

  Efeito na conversa: "vassoura" não volta mais com cabo de vassoura avulso nem
  com pá com coletor + vassoura, porque esses dois chegam marcados como peça e
  como conjunto. O assistente também passa a responder "vende em caixa fechada?"
  com o número real da embalagem.

  Em installs com produto sem descrição cadastrada, a descrição passa a ser
  preenchida a partir da ficha. Quem quiser revisar antes pode rodar
  `pnpm tsx scripts/estudar-catalogo.ts --org=<uuid>`: ele imprime o estudo
  completo de todos os produtos e o SQL, sem gravar nada.

### Alterado

- **Assistente lê material, tamanho, cor e uso de cada produto** Além de separar produto único, conjunto e peça de reposição, o assistente passa a
  ler do nome do produto o que a loja registrou: material (cerlon, inox, nitrílo,
  látex, microfibra), comprimento em cm/mm, cor, a característica que muda o
  produto dentro da categoria (com pedal, com tampa, basculante, interfolha) e o
  que ele serve para (cozinha, vidrarias, mãos, industrial).

  O vocabulário foi medido nos 1141 produtos do catálogo real — 41 categorias — em
  vez de vir de léxico pronto, que erra justamente nas palavras que esta loja não
  tem. Regra que não se nega: entra só o que está escrito no nome. Produto cujo
  nome é só o nome continua sem atributo inventado.

  Efeito na conversa: "vassoura de cerlon 40 cm" e "vassoura de nylon" deixam de
  ser a mesma frase, e "qual a diferença?" tem resposta.

- **Agente aceita 30 capacidades em vez de 28** A tela de Capacidades agora deixa o agente chegar a 30 capacidades marcadas
  (antes 28). Motivo medido: em instalações reais o `tool_ids` vai acumulando
  capacidades de versões antigas — várias delas já nem entram mais por pacote — e
  o dono ficava sem vaga para marcar qualquer coisa nova, com os checkboxes
  desabilitados e sem explicação.

  Nenhuma instalação quebra: os agentes que já estão configurados continuam
  válidos, e a contagem de capacidades do painel passa a contar com a folga nova.

### Corrigido

- **O playbook de plataforma versãoado agora chega ao banco** A camada de playbook que o assistente lê na conversa (as regras de plataforma,
  versionadas em `lib/agent-engine/playbooks/platform.md`) só era lida no
  primeiro boot de uma instalação nova. Em instalação já existente, editar o
  arquivo não mudava nada em campo — foi assim que a regra que separa vassoura
  de cabo de vassoura ficou no código e não chegou a nenhum agente. É defeito de
  entrega, não de conteúdo: agora existe caminho para aplicar a versão nova.

  Para levar a versão nova à sua instância, com o antes/depois na tela:

      pnpm tsx scripts/atualizar-playbook-plataforma.ts
      pnpm tsx scripts/atualizar-playbook-plataforma.ts --aplicar

  O primeiro comando só mostra a diferença; o segundo grava. A versão anterior
  continua no histórico, então dá para voltar.

## [1.27.0] — 2026-10-17

### Adicionado

- **Atendente busca e envia foto do produto no WhatsApp** Quando o cliente pede foto ("tem foto?", "manda foto"), o atendente busca a
  foto cadastrada do produto e manda na conversa, com o nome do produto como
  legenda. Sem foto cadastrada, ele avisa em vez de inventar.

  Para ligar: no Agente, abra Capacidades e marque "Pegar foto do produto" e
  "Enviar foto do produto". A segunda aparece marcada como "efeito que não dá
  para desfazer" e nunca entra por pacote — é o mesmo cuidado do envio de
  mensagem.

  A foto é uma cópia do arquivo do catálogo feita para a pasta da conversa: o
  arquivo original não é mexido, e a foto some da org se o produto for removido.

## [1.26.4] — 2026-10-16

### Corrigido

- **Combos e kits não lideram como se fossem o produto** "PÁ COM COLETOR + VASSOURA" aparecia como vassoura: o pedido vinha como
  complemento (depois de "+" ou "para"), e a busca não distinguia. Agora kit e
  combo voltam marcados como alternativa, como já acontecia com acessórios.
  Nada precisa ser feito na atualização.

## [1.26.3] — 2026-10-16

### Corrigido

- **Tela de teste do agente não estoura mais o timeout** A tela de Teste abortava a chamada em 10 segundos enquanto o turno real leva
  dezenas de segundos: cada retry rodava o agente de novo no servidor e a tela
  terminava em "Erro inesperado". O timeout da chamada passou para 120 segundos.
  Nada precisa ser feito na atualização.

## [1.26.2] — 2026-10-16

### Corrigido

- **Validação de produto também no runtime legado + fallback honesto** O gate de identidade do catálogo não alcançava o runtime legado (que atende
  via `ai_agent_runs`, sem cadeia before_send): a validação agora roda antes do
  envio também lá, com fallback honesto ("vou conferir") em vez de resposta
  incorreta. Nada precisa ser feito na atualização.

## [1.26.1] — 2026-10-16

### Corrigido

- **Atendente não troca mais o produto por acessório** O atendente respondia "cabo de vassoura avulso" para quem pedia vassoura: a
  busca pontuava o acessório igual ao produto e o desempate alfabético o punha
  em primeiro. Agora a busca marca acessórios como alternativa (nunca como
  resposta), o envio valida nome, preço e código contra o que a busca devolveu
  e a intenção do produto atravessa turnos. Nada precisa ser feito na atualização.

## [1.26.0] — 2026-10-16

### Alterado

- **Auditoria visual completa — 40 telas refinadas, erros com retry, deep-links** A interface passou por auditoria página por página (129 rotas) e 40 telas foram
  refinadas sem mudar nenhuma regra de negócio: cabeçalhos padronizados, erros que
  antes eram frase cinza agora têm botão "Tentar novamente", radar com link direto
  para cada seção, gráfico com eixo legível, prioridades visíveis no Meu Dia, valores
  em formato brasileiro onde se digita, datas no idioma do usuário e tabelas que
  rolam no celular. Nada precisa ser feito na atualização — só aproveitar.

## [1.25.53] — 2026-10-15

### Alterado

- **Busca aceita limite até 60 para pergunta ampla** **Lista cortada.** Pergunta de categoria ("saco de lixo", 47 opções)
  precisava da lista inteira de uma vez e o teto 20 não deixava. Teto 60,
  default segue 8 para pergunta específica.

## [1.25.52] — 2026-10-15

### Corrigido

- **Busca informa total antes do corte para pergunta ampla** **Amostra tratada como catálogo.** Pergunta ampla ("saco de lixo", 47
  opções) voltava 8 e o agente afirmava "tem 10 e 100 litros". O retorno
  agora traz `total_encontrados` (antes do corte do limite) com a regra na
  descrição: com amostra parcial, resumir por tamanho e perguntar — nunca
  decretar.

## [1.25.51] — 2026-10-15

### Adicionado

- **Busca entende apelido do balcão (solupa, intercap)** **Fim do "quis dizer".** Apelido que o cliente fala vira nome de catálogo
  na tokenização: "solupa" sempre casa Solubill, "intercap" sempre casa
  Billcap — sem perguntar, sem empate fantasma com marca parecida.

## [1.25.50] — 2026-10-15

### Corrigido

- **Busca do agente mostra variação sem estoque em vez de esconder** **Variação sumida.** Com o filtro de disponíveis ligado por padrão, a busca
  devolvia só o item com saldo — "solupa" trazia o 20L e escondia 2L/5L/60L
  que a loja tem, e o agente respondia um item só. Agora a busca devolve todas
  as variações com o sinal `disponivel` explícito, e o agente apresenta as
  opções avisando o que confirma de estoque antes de prometer.

## [1.25.49] — 2026-10-15

### Alterado

- **Consolidação das sessões paralelas (APIs, workers, prospecção, testes)** **Lote de deploy das abas paralelas.** Reúne o trabalho em andamento das
  sessões: APIs (ai, canais, contatos, saúde), workers (rag, mídia, lgpd,
  sentiment, respostas), telas de prospecção, testes novos e scripts de
  importação (prospecção maps, produtos odivix, fotos mercos). Nenhum item
  exige ação do operador — `gov:verify` verde na hora do corte (806 arquivos,
  8525 testes).

## [1.25.48] — 2026-10-15

### Alterado

- **Imprimir o dia passa para o primeiro botão do cabeçalho de pedidos** **Ordem pedida pelo dono.** Nada muda no funcionamento dos três botões —
  só a posição: "Imprimir o dia" abre a fila, "Criar pedido / orçamento" vem
  em seguida. Travado por teste de ordem no DOM.

- **Catálogo ganha aba Sem fotos e conta exata na paginação** **Aba Sem fotos (?sem_foto=1).** Filtra no banco os produtos sem nenhuma
  imagem, com busca e paginação funcionando juntas — antes, a contagem da tela
  vinha de amostra e produto além da página sumia do filtro. O total agora é
  exato (lista de ids, sem depender do `count`) e a troca de página preserva
  busca e aba na URL.

## [1.25.47] — 2026-10-15

### Adicionado

- **Botão Imprimir o dia, ao lado do Imprimir pedidos** **Um clique imprime todos os pedidos do dia.** O botão zera o filtro para
  hoje, busca os ids direto na API e abre a impressão — porque a lista na tela
  pode estar paginada ou filtrada, e o "todos do dia" não pode depender do que
  por acaso está visível. A tela passa a mostrar o dia impresso: o que sai no
  papel é o que fica na tela, sem surpresa.

  Dia vazio avisa e não navega — abrir a tela de impressão vazia pareceria bug.
  Acima de 50, trunca pelo lote e avisa — nunca em silêncio. Medido em 90 dias:
  o dia com mais pedidos teve 41, então o teto quase nunca aparece, mas o
  código não conta com isso.

  **Mutações provadas:** fetch sem `de`/`ate` (imprimiria tudo sem filtro)
  reprova 2 testes; push sem `idsDoLote` (sem teto) reprova 1.

### Alterado

- **Filtros de pedidos num painel só, com rótulo e sem controle morto** **Os filtros eram quatro zonas espalhadas com um controle que mentia.** Busca
  solta com link falso ("Pesquise por nota fiscal..." só abria os avançados),
  frase com selects de 13px sem rótulo, um select "Envio" que não filtrava nada
  — clicável, sério e morto — e avançados com o "meus" duplicado.

  Agora é um painel só: busca, Status, Vendedor, Origem e Período, cada um com
  rótulo, mesma altura, mesma borda. Chips e avançados continuam onde estavam.
  Comportamento 100% preservado — inclusive o atalho "meus" (vive no select de
  vendedor) e a contagem dos avançados.

  **Mutações provadas:** nenhuma nova — a prova aqui é visual (Playwright
  contra dev local com banco semeado, desktop 1440 e mobile 390) mais os 19
  testes de render/filtro existentes, que passam sem tocar.

## [1.25.46] — 2026-10-14

### Adicionado

- **Criar venda automática abre a seleção com mensagem padrão e cooldown de 60s** O botão "Criar venda automática" criava a campanha direto, sem texto e sem
  lista. A mensagem era gerada pela IA a cada envio, a fila era preenchida
  pelo filtro a cada tick, e os envios saíam em rajada — limitados só por cota e
  janela. O "criar" era um ato de fé: o dono só descobria o que saiu quando o
  cliente recebia.

  Agora o botão leva para uma aba com **as empresas do filtro** (cidade,
  categoria, ou a marcação manual): a lista, a **mensagem padrão**, o **cooldown**
  e o limite — e só então cria. A campanha nasce com lista fechada: o motor só
  enfileira aqueles prospects (passando pela mesma elegibilidade de telefone,
  WhatsApp e duplicidade) e nunca preenche pelo filtro.

  **Com mensagem padrão, sem IA.** Quando preenchida, o texto sai como está —
  inclusive em instalação sem LLM configurado, que antes falhava tudo com
  `ia_indisponivel`. Sem mensagem, a IA gera como antes. O cliente recebe
  exatamente o que foi escrito na tela.

  **60 segundos entre um envio e outro.** O espaçamento que já existia
  (`espacarEnvio`) é um Map em memória: morre no restart e não vale entre
  processos. O cooldown novo é carimbo no banco (`ultimo_envio_at`): antes de
  cada envio o motor confere, e a fila que não coube espera o próximo tick (o
  cron roda a cada minuto). O carimbo anda em toda tentativa, não só no sucesso
  — sem isso, uma sequência de falhas mandaria em rajada.

  Abaixo de 10 segundos não é cooldown, é rajada com outro nome — e rajada
  contra o canal é ban. O piso é 10 no schema, no CHECK e no teste, os três.

  **Mutações provadas:** `ids` fora da rota listaria o catálogo inteiro (2
  testes); coluna esquecida no insert criaria campanha muda (1 teste); CHECK com
  piso 1 liberaria rajada (invariante com insert de verdade); sanitizador
  removido quebraria o filtro (1 teste); off-by-one no range (1 teste).

### Corrigido

- **Banner da carga flutuava sobre a lista ao rolar** **O banner com totais e ações pairava 80px abaixo do topo, por cima das linhas.**
  Ao abrir uma carga e rolar para baixo, o cabeçalho (total em mercadorias, a
  cobrar, paradas, botões) ficava flutuando no meio da tela, com linhas da lista
  visíveis acima e abaixo dele e o texto vazando por trás.

  Duas causas, as duas no mesmo `className`:

  1. **`sticky top-14`.** Foi escrito como se a TopBar rolasse junto ("gruda
     logo abaixo da TopBar (h-14)") — mas a TopBar é irmã do `main`, fora da
     área rolável (AppShell). O `top-14` não encostava em nada: suspendia o
     banner 80px abaixo do topo visível (medido no browser). O correto dentro do
     `main` é encostar: `sticky -top-6`, onde o `-top-6` compensa o `p-6` do
     `main`. Gap 0, medido no mesmo repro.
  2. **Fundo translúcido (`bg-background/95`).** Com o banner sobre o conteúdo
     rolando, 5% de transparência é o suficiente para as linhas vazarem por
     trás. Fundo sólido.

  O banner continua fixo ao rolar — voltar e ações acompanhando a rolagem era a
  intenção original, e continua valendo. O que mudou é que ele agora é um
  sub-cabeçalho encostado, não uma barra flutuante.

  **Mutações provadas:** voltar a `top-14` reprova 2 testes do banner.

## [1.25.45] — 2026-10-14

### Adicionado

- **Ensaio do agente vira conversa — dá para testar resposta com memória** **O "Testar agente" aceitava uma mensagem só.** Cada envio era um primeiro
  contato: o agente nunca lembrava do que já foi dito, e o teste mentia sobre
  memória — aprovava um agente que, numa conversa real, esqueceria tudo no
  segundo turno.

  O painel agora é uma conversa: cada envio manda os turnos anteriores em
  `historico`, e o runtime usa como passado do ensaio. A mensagem atual continua
  indo em `sample_message`; o histórico mora no navegador e morre com a conversa
  de teste. Nada dele é gravado no banco — o único registro por turno continua
  sendo a linha de `ai_agent_runs` em dry-run, que já existia.

  **O passado do ensaio só vale no ensaio.** Fora do dry-run o `override` é
  ignorado: numa execução real o histórico vem da conversa, e aceitar histórico
  do chamador seria deixar quem chama reescrever o passado do cliente.

  **Limites honestos.** Teto de 20 turnos no schema: cada turno vira 2 mensagens
  no prompt, e sem teto o ensaio de uma conversa longa estouraria a janela do
  modelo sem dizer por quê. Papel inventado e turno vazio são 422 antes de tocar
  no runtime.

  **Mutações provadas:** papel trocado no mapeamento (`assistente` lido como
  `user`) reprova 2 testes; rota sem repassar o histórico reprova 1.

## [1.25.44] — 2026-10-14

### Corrigido

- **A busca do catálogo achava só os 500 primeiros — o resto não existia para a tela** **"Saco de lixo" mora nas posições 904–958 de 1141, e a busca respondia vazio.**
  A tela de produtos entregava os 500 primeiros e filtrava no navegador. Tudo
  além do 500º não era filtrável: a busca dizia que não existia produto que
  existe. É o mesmo "afirmar ausência sobre amostra" que já apareceu no agente —
  agora na tela, onde o dono vê.

  A busca filtra no **servidor**, com o mesmo predicado da rota `GET
  /api/v1/products` — nome, código ou marca como substring. A página pede a
  fatia ao banco (`range` + `count`) e entrega 50 por vez, com o número da
  página na URL. Nova busca recomeça da página 1; trocar de página preserva o
  termo já confirmado, não o que está meio digitado.

  **Sem `count` não há total, e a tela não chuta.** Quando o `Content-Range` não
  vem, a paginação mostra "Página N" sem "de Y". Página além do fim (digitada à
  mão) volta para a última em vez de mostrar lista vazia sem saída.

  A vírgula separa termos no `or()` do PostgREST e a barra invertida é escape
  do LIKE. Qualquer uma das duas na busca quebra o filtro ou vira erro. As
  duas viram espaço antes de interpolar — o resto passa como substring, igual à
  rota da API.

  **Mutações provadas:** `range` com off-by-one (51 itens por página) reprova o
  teste da faixa; sanitizador removido reprova o teste da vírgula.

## [1.25.43] — 2026-10-14

### Adicionado

- **Fechamento de caixa da carga sai do papel e vive na tela da expedição** **O PDF de romaneio imprimia a conferência de caixa como oito linhas vazias.**
  Dinheiro, PIX, cartão, cheques, boletos, menos vale ao motorista, menos
  combustível e menos outras despesas — mais total líquido e diferença. O papel
  era preenchido à mão, guardado em arquivo físico, e a diferença era conferida
  de olho.

  A rota `/romaneio` agora imprime **só o romaneio**, que é o que o motorista
  leva. O fechamento vive na tela da carga, com todas as opções que o PDF tinha:
  resumo financeiro, cobrança por parada com ☐, a cobrar por condição (prepare
  troco e maquininha), as oito linhas de caixa com a conta feita, ocorrências e
  devoluções, e quem conferiu — em nome e hora gravados, não em assinatura no
  papel.

  **A conta é a mesma do PDF, com o sinal certo.** Entradas menos saídas dá o
  líquido; líquido menos o a cobrar dá a diferença, positiva quando sobrou e
  negativa quando faltou. O caso mais perigoso — as três despesas entrando com
  sinal positivo, o que faria o caixa "bater" com dinheiro que nunca entrou —
  está travado por teste com a mutação aplicada.

  **O que o PUT grava, e o que ele calcula.** O corpo informa o que foi contado
  e o que foi conferido; as somas são calculadas pelo servidor, nunca aceitas do
  corpo. O conferente informa o que contou — aceitar o total dele seria o oposto
  de conferir.

  **O que impede o fechamento, e o que só avisa.** Nenhuma parada conferida é
  erro que impede gravar: sem conferência, o "fechou" é uma declaração. Diferença
  diferente de zero é só aviso — troco a menos acontece todo dia, e o que não
  pode é passar sem ninguém ver. Quem pode fechar e qual diferença é aceitável
  não estão escritos neste repositório, então não foram inventados: o código
  exige só o que é verdade física, uma linha conferida.

  **Gravar não dá baixa.** Fechar caixa é conferir dinheiro; dar baixa é outra
  decisão, com regra própria no `POST /conciliar`. Juntar as duas num ato só
  seria a mistura entre operação e dinheiro que a regra proíbe, e a tela diz
  isso ao lado do botão.

  **O schema**

  Migration 0268, com apêndice idempotente no baseline e linha no MANIFEST, os
  três. Tabela `shipment_closings` (uma linha por carga, somas calculadas no
  servidor) e `shipment_orders.conferido` (o ☐ do papel, independente do status:
  status diz o que aconteceu na rota, conferido diz se alguém olhou).

  Duas coisas que o caminho achou. A primeira teria quebrado o `update.sh` na
  VPS: o apêndice concedia privilégio numa sequência que não existe, porque a
  tabela usa `id uuid` e não serial. A segunda é regra de segurança: o apêndice é
  escrito DEPOIS do bloco de varredura `anon` do baseline, então o `revoke` ficou
  dentro do apêndice — reordenar os dois reabre a tabela para a anon key, e isso
  está comentado no arquivo e travado por invariante.

  **Mutações provadas**

  | mutação | reprova |
  |---|---|
  | despesa com sinal trocado na conta | 6 testes |
  | duplicata de linha descartada em vez de somada | 4 testes |
  | esperado aceito do corpo em vez do banco | 2 testes da rota |
  | gate de "nada conferido" removido | 1 teste da rota |
  | diferença virando erro em vez de aviso | 1 teste da rota |
  | `isolate`/`z-0` fora de qualquer mapa | o teste de pilha |

## [1.25.42] — 2026-10-14

### Adicionado

- **Imprimir os pedidos de um dia, com o período em filtros de tela** **Dá para escolher o dia e imprimir o lote.** Os campos "de" e "até" entraram
  na linha de filtros da tela de pedidos, com atalhos para Hoje, Ontem e Últimos
  7 dias. Escolher um dia preenche os dois campos — "todos os pedidos do dia
  14/10" não é "de 14/10 até 14/10", é um dia, e escrever a mesma data nos dois
  lugares é um erro silencioso quando se faz pela metade.

  **O filtro de período já existia, e estava no fuso errado.** A tela enviava
  `de`/`ate` para o servidor, e o servidor montava a janela em UTC:
  `T00:00:00Z` a `T23:59:59.999Z`. Em Brasília isso cobre de 13/10 21:00 até 14/10
  20:59 — traz três horas do dia anterior e perde três do dia pedido.

  Não havia campo na tela para acionar isso, então ninguém tinha aparecido ainda.
  Mas o dia em que alguém usasse — pelo drill-down do dashboard, pela URL — o
  total não bateria, e nada indicava por quê: a lista abre, tem pedidos, tem data.

  A janela agora sai de `lib/comercial/janela-do-dia.ts`, que converte a parede
  local do dono no instante UTC correspondente, no fuso de `user.timezone`
  (caindo para `America/Sao_Paulo`). Sem biblioteca nova: `Intl.DateTimeFormat` com
  `timeZone`, que o repo já usa em `lib/lgpd/holidays-br.ts` e
  `lib/lgpd/sla-alarm.ts`.

  **O `ate` é exclusivo** — o primeiro instante do dia seguinte, em vez de
  `23:59:59.999`. Um pedido gravado no último milissegundo do dia entra; o
  `23:59:59.999` o deixaria de fora, e esse tipo de "quase" só aparece em
  produção.

  **O teto de 50 não é mais mudo**

  O botão de imprimir continua levando no máximo 50 pedidos — é deliberado, e está
  escrito em `lib/comercial/ids-do-lote.ts`: um PDF com 50 páginas é um arquivo;
  500 é um arquivo que o navegador não fecha a tempo. O que mudou é que a tela
  **diz**. Antes, um dia com 87 pedidos imprimia 50 e o dono não tinha como saber
  que 37 ficaram de fora. Agora aparece "imprimindo os 50 mais recentes de 87".

  E o `50` saiu de um literal solto na tela: agora vem de `idsDoLote`, a mesma
  função que a página de impressão e a rota de PDF aplicam. Repetir o número é
  como as duas pontas divergem — um dia o teto sobe para 60 e a tela continua
  mandando 50, sem erro nenhum.

  **Mutações provadas**

  | mutação | reprova |
  |---|---|
  | a janela voltando a ser UTC | 8 testes do helper |
  | a fronteira antiga na página, em código | 3 testes de arquivo |

  Um detalhe sobre o teste de arquivo: a página tem um comentário que **cita** a
  fronteira antiga ao explicar o conserto, e a primeira versão do teste reprovava
  por causa da própria explicação — o que obrigaria a apagar a documentação para
  o teste passar. O leitor tira comentário antes de buscar, e há um teste que
  trava essa leitura.

### Alterado

- **@types/jest sai do projeto — o repositório usa vitest** O Dependabot propôs bumpar `@types/jest` de 29 para 30 (PR #3), e a resposta
  certa era remover o pacote. Este repositório roda **vitest**: não existe um
  único `import` de `@jest/globals` ou `jest.` em `app/`, `lib/`, `components/` ou
  `tests/`, e nenhum `tsconfig` referencia o pacote.

  Bumpar dependência morta é manutenção de nada — e deixa o Dependabot com um PR
  aberto para sempre, porque a próxima major chega do mesmo jeito. Removendo, o
  PR se fecha na raiz: não havendo pacote, não há bump a propor.

  A remoção é segura porque os testes importam do vitest explicitamente.
  `describe`, `it` e `expect` vêm de `import { ... } from "vitest"` em cada
  arquivo, e não de globais injetadas pelos types do jest. Se algum teste
  dependesse das globais, o typecheck DIRIA o arquivo inteiro — e é por isso que
  `tsc` limpo aqui é a prova, e não um detalhe.

  Medido depois da remoção: `tsc --noEmit` limpo, `pnpm lint` com 0 erros,
  `pnpm test:unit` com **792 arquivos e 8.398 testes verdes** — os mesmos números
  de antes, com um pacote a menos instalado.

  O que o Dependabot ainda propõe por aqui é legítimo e fica para o próximo ciclo:
  o PR #134, com 52 bumps incluindo o minor do próprio `next` (16.3.3 → 16.4.0) e
  do `react` (19.2.8 → 19.3.0). Esse precisou de conserto antes de passar, e o
  conserto está na seção de correções desta versão.

## [1.25.41] — 2026-10-13

### Adicionado

- **Editar os itens de um pedido — inclusive depois de pronto** **Não dava para alterar os itens de um pedido. Nunca.** Não depois de pronto,
  não antes: em nenhum status. A rota `PATCH /api/v1/commercial-orders/[id]/itens`
  não existia, e o `itensPatchSchema` estava escrito em `lib/schemas/pedidos.ts`
  desde antes sem nada o consumindo.

  O sintoma era "não consigo alterar o pedido depois que ele ficou pronto", e a
  leitura natural disso está certa na consequência e errada na causa: nunca deu,
  porque a rota nunca foi escrita. Havia até um teste — `pedido-itens-route.test.ts`
  — que importava um `PATCH` inexistente, e por isso não rodava.

  **A regra que o teste afirmava foi mudada de propósito.** Era *"só rascunho/
  em_analise"*, com 422 para o resto. Você pediu para corrigir o pedido depois de
  pronto, que é exatamente essa regra. A rota agora aceita e **avisa**: devolve
  `avisos` dizendo o que a troca **não** estorna — comissão apurada, expedição,
  nota emitida.

  A rota não inventa a política de comissão, expedição e NF porque essa regra não
  está escrita neste repositório. O que está escrito é o comportamento, e
  quem decide a consequência é quem lê o aviso. Se um dia existir a regra, ela
  entra aqui — com nome, com migration se precisar de coluna, com teste que a
  nomeie.

  **Um PATCH, não um por linha.** Adicionar, remover e ajustar vão num único
  `PATCH`, num único "Salvar". PATCH item a item deixa o pedido com item novo e
  total velho no meio da operação, e "total velho com item novo" é a forma mais
  cara de errar num pedido comercial. Se o servidor recusar, nada foi gravado.

  **`ajustar` mantém o id do item.** Trocar o conjunto inteiro criaria ids novos e
  deixaria o `ajustar` da tela apontando para o nada, com tudo que guarde id de
  item órfão.

  **O que o editor faz pela tela:** botão "Editar itens" na própria lista de
  produtos da ficha, quantidade/preço/desconto editáveis, remoção por linha, e
  busca de produto para acrescentar — com o preço do catálogo como sugestão
  editável, não como verdade. Preço de venda é da linha, e quem decide é quem
  está na tela.

  **Um bug que os testes acharam no caminho**

  Remover o item 0 de uma lista de 2 fazia o item novo nascer no `posicao` 2 e o
  `filter` de gravação o deixava de fora: a lista ficava `1,2` com um buraco no
  `0`. Numa tela ordenada por posição, isso aparece como "o primeiro item sumiu",
  sem erro nenhum. O teste de reindexação pegou; o serviço foi corrigido
  para gravar a reindexação de todas as linhas, novas inclusive.

  **Junto: o catálogo tinha teto escondido**

  `GET /api/v1/products` cortava em **500** linhas com um `.limit(500)` solto. A
  instalação tem **635 produtos**, e o editor de itens precisa do catálogo inteiro
  para o seletor — com 500 fixos, os produtos acima do 500º **não apareceriam**,
  sem erro e sem aviso. O limite virou parâmetro explícito (`limite`, padrão 500,
  teto 2000). Falha silenciosa é a pior das três, e nenhuma delas é aceitável num
  produto vendido como código.

  **Mutações provadas:** `ajustar` sem recalcular subtotal reprova 6 testes; sem
  reindexação reprova o de posição; a rota voltando a recusar pedido pronto
  reprova 2; o `.limit()` voltando a 500 fixo reprova 5.

### Corrigido

- **A tela de expedição desenhava por cima do cabeçalho — e o mapa da prospecção nunca foi consertado de fato** **Elementos por cima do mapa ou por trás dele na tela de expedição.** Os dois
  sintomas são o mesmo defeito: o contêiner do mapa não tinha stacking context
  próprio.

  O Leaflet escreve z-index nos próprios panes — 400 overlay, 600 marcadores, 700
  popup, 800/1000 controle — em pixels, na **mesma pilha da página**. O cabeçalho
  da ficha de expedição é `sticky top-14 z-10`: popup e marcadores (600/700) ficam
  **acima** dele, e o mapa invade o cabeçalho ao rolar. E `Dialog`/`Sheet`, que
  usam `z-50`, ficam **atrás** do mapa.

  **O mapa da prospecção já tinha `isolate` — e nunca foi conserto de verdade.**
  Foi aplicado numa tela e esquecido na outra: mesmo sintoma, outra tela, mesma
  causa. Pior, medindo no browser, `isolate` e `z-0` chegam ao mesmo resultado
  por caminhos independentes:

      sem nada → MAPA por cima do cabeçalho   ❌
      isolate  → CABEÇALHO por cima            ✅
      z-0      → CABEÇALHO por cima            ✅

  `z-0` cria o stacking context pelo caminho mais fundamental — elemento
  posicionado com `z-index` diferente de `auto` — e não depende do apelido da
  propriedade. Os dois mapas agora levam `relative isolate z-0`: se um deixar de
  funcionar por qualquer motivo, o outro segura.

  **Um detalhe que quase virou diagnóstico errado.** O utilitário `isolate` do
  Tailwind 4.3.3 gera `isolation: isolate` — repare no NOME DA PROPRIEDADE, que é
  o apelido antigo. Escrever `isolate:` (o nome novo da padronização) à mão em CSS
  é outra coisa: o browser de verificação não reconhece e descarta a
  declaração em silêncio, sem aviso. A primeira leitura desse bug foi essa, e
  levou ao comentario errado no código — medir no browser, e não de olho no nome
  da classe, foi o que corrigiu.

  **O teste trava os dois juntos** (`leaflet-isolado-em-contexto-de-stack.test.ts`)
  e vale para qualquer mapa novo: varre o repo, acha quem instancia `L.map()` e
  exige `isolate` ou `z-0`. O leitor de `className` remove comentários antes de
  buscar, porque a primeira versão dele achava `z-0` **dentro do comentário** que
  explica o conserto — e a mutação que tirava a classe do JSX passava verde. Um
  teste que lê o próprio texto explicativo mede a documentação.

  **Mutações provadas:** tirar `isolate` e `z-0` do mapa de expedição reprova;
  tirar do mapa de prospecção reprova; e o leitor ler o className em vez do
  comentário está coberto por teste próprio.

- **Criar venda automática devolvia 500 — a rota escrevia uma coluna que não existe** **O botão "Criar venda automática" devolvia 500 em toda tentativa.** A rota
  `POST /api/v1/automatic-sales/campaigns` escrevia `created_by` no insert — e
  essa coluna **não existe** em `automatic_sales_campaigns`, nem no banco de
  produção (medido em 13/10/2026) nem em `lib/database.types.ts`.

  O Postgres responde `column not found` e a rota devolve 500. Nenhuma campanha
  foi criada, nenhuma mensagem saiu.

  **Por que o typecheck não pegou.** O `.insert()` do cliente Supabase não é
  estrito o bastante para reclamar de uma chave a mais. A pista é que `created_by`
  existe em outras tabelas, como `commercial_orders` — então ler uma rota que usa
  e concluir que o padrão vale para todas parece certo, e não é.

  **O teste agora é geral, não desta coluna.** `rotas-nao-escrevem-coluna-
  inexistente.test.ts` compara **toda** chave escrita no insert com as colunas
  que o tipo gerado declara — e tem duas guardas de vácuo, porque um `Set` vazio
  faz todo `expect` passar. É a mesma classe do `comando_da_conversa` (que é
  função, não coluna), e as duas apareceram na mesma semana.

  Quem criou a campanha continua registrado em `api_audit_log`. Adicionar a
  coluna de verdade, se um dia for preciso, é decisão de schema — e entra por
  migration + apêndice do baseline + MANIFEST, com as três.

  **Mutação provada:** readicionar uma coluna inexistente no insert reprova o
  teste `toda coluna escrita existe no tipo gerado do schema`.

## [1.25.40] — 2026-10-13

### Adicionado

- **Cargo "Vendedor", e a tela de equipe em português** **A tela de equipe mostrava "Role" e o valor cru do enum.** O operador lia
  `agent`, `viewer`, `manager`. O rótulo estava hardcoded em inglês, sem passar
  pelo `t()`, e as opções mostravam o enum em vez do nome.

  O produto **já tinha** o mapa: `PAPEIS_HUMANOS` e `ROTULO_DO_PAPEL` existem em
  `lib/auth/types.ts` e ninguém usava. Por isso três telas mostravam o enum cru.
  Ligar o que existia foi o conserto.

  **Cargo novo: `vendedor`.** Entra no nível 2, o mesmo do `agent`. Quem vende
  precisa de pedido, prospect, inbox e conversa — que é o que o atendente já tem.
  Cargo novo com nível novo seria decisão de segurança disfarçada de rótulo:
  subir o vendedor acima do atendente daria a ele o que o gerente tem sem
  ninguém pedir. Este papel é um **nome** para o que o atendente já podia.
  Consequência deliberada: `requireRole("agent")` libera o vendedor.

  **Duas portas no banco, e as duas importam.** O CHECK de `role` impede gravar
  papel desconhecido; `fn_role_at_least` é a escada que a RLS consulta. Sem a
  segunda, o vendedor cai em `false` em **toda** política — "entra na empresa" e
  não vê nada, sem erro nenhum.

  **Quatro cópias do vocabulário de cargos** era a origem da divergência:
  `lib/auth/types.ts`, o CHECK do banco, `lib/schemas/team.ts` e
  `sendOnboardingInvites.ts`. As três de código agora derivam de
  `PAPEIS_HUMANOS`, e um invariante compara com o CHECK do banco — é ele que
  impede alguém de acrescentar um papel no TypeScript e esquecer o banco, o que
  faria o convite aceitar algo que o INSERT recusa.

  `ai_operator` **não** entra, e está certo: é o papel do agente publicado e
  nunca é gravado em `user_organizations`. Um teste afirma isso, para que a
  próxima pessoa não "conserte" a escada acrescentando um papel que não pertence
  a ela.

  **Produtos.** `fotosIniciais={fotosPorProduto[p.id] ?? []}` criava um array
  novo a cada render, e o efeito do filho compara **identidade**. Com 641
  produtos, abrir a edição fazia o ciclo inteiro rodar de novo.

  **Quatro correções que os testes exigiram, e que estavam certas:**

  - meu comentário **dentro do corpo** da função ia para o `prosrc` e quebrava
    `papel-do-agente-publicado`, que afirma que `ai_operator` não aparece ali;
  - o apêndice do baseline foi para **depois** do bloco da varredura de anon,
    que é auto-curativo e só cura o que foi criado **antes** dele;
  - criei o teste de invariante em `tests/invariantes/` em vez de
    `tests/invariants/`, e ele rodava na suíte unitária sem banco;
  - meu próprio teste lia só a **primeira linha** do `pg_get_functiondef` — o
    corpo vem depois — e buscava `search_path = 'public'` num texto que o
    Postgres normaliza para `SET search_path TO 'public'`. O banco estava certo;
    o teste é que não media.

  Suíte: **8.352 unitários** e **148 arquivos de invariante** (1.353 testes).

## [1.25.39] — 2026-10-13

### Corrigido

- **Categorias da prospecção em português — e a busca que estava quebrada** **O filtro de categoria estava em inglês, e a busca não funcionava.** As duas
  coisas são o mesmo defeito.

  **O inglês.** O valor gravado em `business_prospects.categoria` é o rótulo que
  a API do Google Maps devolve. Medido nesta instalação: 533 categorias distintas, todas em inglês.
  "Auto repair shop" tem 154 empresas, "Gas station" 107, "Real estate agency"
  97, "Car wash" 93.

  Um seletor que oferece "Auto repair shop" está em inglês, por mais que o resto
  da tela esteja em português. E o operador que quer "apenas mecânicas" não sabe
  qual das 533 opções é a oficina dele.

  **A busca quebrada — e era um erro meu.** O filtro comparava
  `categoria ilike '%termo%'` contra o valor gravado. Digitar "mecanica" não
  trazia "Auto repair shop": `ilike` compara letra a letra, e "mecanica" não é
  substring de "auto repair shop". Eu anunciei o contrário no PR do filtro. A
  correção é `categoriasQueCasam` converter o termo português nos valores em
  inglês que ele descreve — 533 traduções, medidas uma a uma contra o banco.

  Agora **"mecanica" traz "Auto repair shop"**, e funciona sem acento e com
  flexão de gênero: "mecanica" acha "Mecânico" também, porque em português a
  flexão mais comum é a de gênero e ela é tratada.

  **O que continua em inglês é o valor, não a tela.** O select mostra "Oficina
  mecânica (154)" e envia "Auto repair shop" — porque é assim que o dado está
  gravado. Inverter os dois faria a tela aparecer filtrada e a lista vir vazia,
  sem erro nenhum; por isso o `nome` e o `rotulo` são campos separados na
  resposta da API, e o chip de filtro ativo mostra o português.

  **Uma palavra igual em português fica igual.** "Hotel" traduz para "Hotel", e
  está certo. O teste que garante que nenhum rótulo do filtro sai em inglês tem
  uma lista explícita dessas palavras — inventar "Pousada" para "Hotel" seria
  traduzir o produto errado, e teste que obriga a fazer isso ensina a fazer.

  **Testes:** 19 casos, e **7 mutações provadas** por
  `scripts/provar-mutacoes-categoria-pt.py` — desligar a substring em português,
  desligar a busca no valor gravado, devolver vazio em vez do original, desligar
  a flexão, desligar o `semAcento`, deixar termo vazio trazer tudo, e apagar uma
  tradução: todas reprovaram.

  Uma mutação **não reprovou na primeira rodada**, e foi o que valeu: ela
  mostrou que um passo de "tradução exata" que eu tinha escrito era **redundante**
  — o conjunto que ele produzia já era subconjunto do seguinte. O passo foi
  removido e o comentário que atribuía a ele aéri o de "filtrar só uma
  categoria" estava errado: quem segura a lista curta é o filtro ser por
  categoria, não a ordem dos passos.

  Suíte: **8.352 verdes**, `tsc`, lint e `lint:channels` limpos.

## [1.25.38] — 2026-10-13

### Corrigido

- **Arquivar o inbox não quebrava com 500 — `comando_da_conversa` é função** **A rota de arquivar o inbox escrevia um campo que não existe.** Ela mandava
  `comando_da_conversa: "encerrada"` no update, mas esse campo não é coluna: em
  `supabase/baseline.sql:17146` é a **função**
  `public.comando_da_conversa(c public.conversations)`, que o PostgREST resolve
  no `?select=`. Escrever nela dá `column does not exist`, e o arquivamento
  inteiro caía com 500 sem ter arquivado nada — em qualquer instalação, porque a
  rotina é a mesma em todas.

  Medido nesta instalação: `pg_proc` tem as duas funções, `pg_attribute` não tem
  a coluna.

  **O que torna isso enganoso:** `lib/database.types.ts` lista
  `comando_da_conversa` como campo da Row de `conversations`. Lista porque
  `supabase gen types` inclui função exposta pelo PostgREST no shape do schema —
  o PostgREST devolve a função como coluna virtual. Então o TypeScript aceita, o
  gerador concorda, e só o banco discorda. Conferir coluna lendo os tipos é o
  caminho natural, e está errado.

  **Por isso a defesa ficou em duas frentes.** Um teste de unidade proíbe a rota
  de escrever o nome e checa que ela escreve as três colunas que "zerar o inbox"
  significa. E um invariante pergunta ao Postgres de verdade: `pg_attribute`
  confirma que a coluna não existe, `pg_proc` confirma que as funções existem, e
  a função devolve um dos quatro valores do CHECK numa linha real.

  O teste de unidade tem uma asserção de vácuo de propósito: um `for` sobre lista
  vazia faz todo `expect` passar, então há um caso exigindo que a leitura das
  colunas ache colunas conhecidas. Sem ele, o teste passaria verde com o parser
  quebrado.

  **Efeito colateral em produção:** o inbox foi zerado com a mesma regra da rota
  (8 conversas arquivadas, 3 que já estavam fechadas preservadas, nenhuma
  não-lida), e o ato ficou registrado em `api_audit_log` com a nota de que foi
  SQL direto — a rota exige sessão autenticada.

## [1.25.37] — 2026-10-13

### Adicionado

- **Disparo em lote com simulação por padrão, e arquivamento do inbox** **A mesma mensagem para as empresas marcadas — e o plano antes do envio.**

  Em `/app/prospeccao` → Empresas, a barra de seleção ganha **"Enviar mensagem"**.

  **O botão de enviar só existe depois que a simulação voltou**, e vem escrito
  com o número dela: *"Enviar para 312 empresas"*. Não é etapa de confirmação: é
  o que segura a tela, porque enviar mensagem de WhatsApp é das poucas coisas em
  que o erro não aparece como erro — o número é banido e o dano só se vê semanas
  depois, como "não recebo mais mensagem".

  A simulação responde três perguntas: **quantos vão sair** (e quantos não, e por
  quê, um a um); quanto tempo leva no ritmo configurado; e se dá para enviar
  agora — isto é, se há número de WhatsApp conectado.

  Sem a terceira, o operador descobre que mandou 300 mensagens para lugar nenhum:
  com a sessão parada, o envio **não devolve erro** — joga a linha em `queued` e,
  no caminho humano, ninguém reagenda. Medido nesta instalação: 6 sessões de
  canal, todas em `STOPPED`, e a única real com `archived_at` preenchido.

  `dry_run` é `true` **no schema**, não na tela: quem chama tem que pedir o envio.

  **O ritmo faz parte do plano.** Mensagem fixa para centenas de números é o
  padrão que derruba um número, e o repositório já tem o gate que pega isso. Por
  isso o plano carrega cota do dia (padrão 50, teto 500) e intervalo entre
  envios (1,2s + jitter). O envio usa o intervalo que o plano prometeu — e não o
  espaçador fixo da automação, que faria a simulação mentir sobre o tempo.

  **Quem não recebe, e a tela diz o motivo:** pediu para não ser contatado ·
  bloqueado · **já é cliente** · pediu para parar (opt-out) · recusa registrada ·
  sem telefone · fixo ou país sem WhatsApp · já tem conversa aberta · recebeu
  mensagem há pouco · **cota do dia esgotada**.

  Duas decisões. A primeira: **"já é cliente" vem antes da canalização**,
  porque mandar oferta para quem já compra não pode aparecer como "sem WhatsApp".
  A segunda: **cota esgotada fica separado**, porque quem ficou fora por cota
  não é lead ruim — é lead para amanhã. Se a tela dissesse "não pode mandar", o
  operador descartaria.

  **Arquivar o inbox.** `POST /api/v1/conversations/arquivar-todas`, `manager`+
  e exigindo `{"confirmar": true}`. **Arquiva, não apaga:** sai das abas Fila,
  Minhas e Todas, zera as não-lidas, e o histórico continua para quando alguém
  perguntar o que foi mandado em outubro. Apagar para limpar a tela troca um
  problema pequeno por um que não tem volta.

  **Testes.** 32 do planejador, 9 do contrato, e **10 mutações provadas** por
  `scripts/provar-mutacoes-disparo.py` — desligar o opt-out, inverter o
  bloqueado, tirar o "já é cliente", ignorar a recusa registrada, abrir a cota em
  um, liberar envio sem sessão, mandar colado, ignorar a coluna de WhatsApp
  potencial, ignorar a regex de celular, deixar telefone nulo passar: todas
  reprovaram.

  Uma delas **falhou na primeira rodada** e foi o que valeu: o teste da coluna
  usava um telefone fixo, que a regex barrava sozinha — a coluna podia ser lida
  sem ser lida e o teste continuaria verde. O caso em que só a coluna barra foi
  acrescentado.

## [1.25.36] — 2026-10-13

### Corrigido

- **Mapa da prospecção clusteriza de verdade (Leaflet.markercluster)** **O mapa desenhava um marcador Leaflet por empresa — e são 4.734.** Era o
  travamento que o operador viu ao arrastar a lista.

  Pior: havia **duas** clusterizações rodando juntas no modo "marcadores".
  `clusterizar` (`lib/prospeccao/geo.ts`, grade por zoom) criava um marcador
  "falso" por célula, e esse marcador entrava no `markerClusterGroup` do Leaflet
  como se fosse **uma** empresa:

  ```
  4.734 pontos → clusterizar → ~300 células → Leaflet agrupa as células
               → o agregado contava células, não empresas
  ```

  A tela mentia sem quebrar build nem tipo. Agora:

  - **Modo "marcadores"** entrega a lista crua ao `markerClusterGroup`
    (`chunkedLoading`, `disableClusteringAtZoom: 17`, `maxClusterRadius: 70`) —
    proximidade geográfica real, zoom real, pontos só viram DOM quando o zoom
    pede.
  - **Modo "densidade"** continua usando `clusterizar`, onde o agregado serve
    para dimensionar o círculo, não para virar marcador.
  - O círculo do raio e o pino do centro foram para o **mapa**, não para a camada
    clusterizada: contariam como empresas no agregado.
  - O ícone do agregado é o disco escuro que a tela já usava, não o azul-claro
    padrão do plugin.

  A decisão de "quem agrupa" mora em `itensParaDesenho`
  (`lib/prospeccao/geo.ts`), com 5 testes — **mutação provada**: trocar a
  retorna por `clusterizar(...)` sempre reprova 3 deles.

## [1.25.35] — 2026-10-13

### Corrigido

- **Erro do Overpass com status 200 não pode virar "zero empresas"** O Overpass responde **HTTP 200 com um XML de erro** quando a instância recusa a
  consulta — `duplicate_query`, `timeout`, "server too busy". O parser aceitava
  esse corpo como se fosse resultado.

  O desfecho medido em 12/10/2026, na instalação real: uma varredura de 210
  células em Calmon terminou com `encontradas: 0 · novas: 0 · erros: 0` e status
  `completed`. Não existia empresa nenhuma porque o espelho estava recusando —
  mas nada disso era visível.

  O pior do modo de falha não é o zero, é o zero **sem erro**: o painel mostra
  "Encontradas 0 · Erros 0", indistinguível de "essa cidade não tem empresas". O
  operador conclui que o dado não existe, não que a fonte estava fora. É o
  mesmo silêncio que o arquivo de embedding descreve em `lib/ai/embeddings/chave.ts`:
  sintoma invisível que se disfarça de ausência de dado.

  Agora o corpo é inspecionado antes do parse: XML de erro vira exceção com o
  motivo que o espelho escreveu (`erroDoOverpass`), e a busca é marcada como
  `falhou` — com o motivo visível — em vez de completar com zero.

- **Mapa não cobre mais o modal, e a tela de Empresas ganha categoria, estado e data** **O mapa cobria a UI que abria sobre ele.** O Leaflet escreve z-index nos
  próprios panes — 400 na overlay, 600 nos marcadores, 800 no popup, 1000 no
  controle — e esses valores são em pixels, na MESMA pilha da página. O `Dialog`
  e o `Sheet` deste repo usam `z-50` (50), que é MENOR que qualquer pane: abrir a
  ficha de uma empresa deixava o mapa inteiro por cima do modal, e o popup por
  cima de tudo. O `isolate` na caixa do mapa cria um stacking context próprio — os
  z-index do Leaflet passam a valer só dentro dele.

  **Filtros que a tela não tinha, com o dado já gravado:**

  - **Categoria** — seletor com as categorias REAIS e a contagem de cada uma,
    vindas de `GET /prospects/categorias`. Não são as 83 subcategorias do Radar:
    aquelas são termos de busca em português, e o campo gravado é o rótulo da
    API do Google ("Auto repair shop", "Building materials store"). Um seletor
    com as 83 devolveria vazio para quase tudo.
  - **Busca por categoria passou a ser parcial** (`ilike` em vez de `eq`):
    assim "mecanica" traz "Auto repair shop" em vez de exigir a string exata.
  - **Estado** — campo de 2 letras, com o valor em maiúsculas.
  - **Prospectada há** — corta por `discovered_at`: hoje, 7, 30 ou 90 dias.

  Os três viram chip removível, e o contador de filtros ativos passou a contá-los
  — sem isso, um filtro aplicado ficava invisível depois de fechar "Filtros
  avançados".

## [1.25.34] — 2026-10-12

### Adicionado

- **Importação da nomenclatura federal pelo Siscomex** Uma segunda porta de importação do catálogo de NCM, além do CSV do IBPT que já
  existia. As duas convivem porque dão coisas diferentes: o IBPT traz a
  descrição do IBGE (boa para casar nome de produto) e o ICMS de cada estado; o
  Siscomex é a nomenclatura federal pura, com endpoint público e atualizada por
  ato.

  O que a fonte oficial entrega não serve como vem. O JSON traz a descrição de
  **um nível só** — o `28289011` vem como `"De sódio"`, sem nenhuma palavra que
  case com "ÁGUA SANITARIA" na tela. A descrição útil está no caminho até ele:

  ```
  28      Produtos químicos inorgânicos…
  2828    Hipocloritos; hipoclorito de cálcio comercial…
  28289011  De sódio
  ```

  "Hipocloritos" é exatamente o termo de água sanitária. Sem remontar a
  hierarquia, a fonte seria population de 10 mil linhas com zero acerto — e o
  sintoma seria o pior possível: tabela cheia, rota respondendo 200, nada
  preenchido.

  A remontagem não assume passo fixo porque a hierarquia é irregular (existem
  níveis de 5 e 7 dígitos): ela varre todos os prefixos do código e usa os que
  existem.

  Porta: `POST /api/v1/fiscal-ibpt/importar-siscomex` (manager+), recebendo o
  JSON no corpo como o `/importar` recebe o CSV. A importação não busca o
  arquivo sozinha: depender da rede de um terceiro tornaria a operação
  irreprodutível, e é preciso reimportar o mesmo arquivo quando algo der errado.

  Fonte: https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json

## [1.25.33] — 2026-10-12

### Corrigido

- **A chave de IA cadastrada pela tela agora liga o passe de NCM** A chave do Google cadastrada em **IA › Credenciais** não habilitava o passe de
  IA do botão "Completar NCM". O código lia só a chave da instalação (o
  `GEMINI_API_KEY` do `.env`) e mais nada — ou seja, quem cadastrava a chave pela
  tela via o nome dela na lista, com a validação em dia, e o recurso continuava
  desligado.

  É o mesmo defeito que a base de conhecimento já teve com a OpenAI, e que a
  própria tela promete não repetir: oferecer uma chave que o motor ignora.

  Agora o passe de NCM resolve a chave na ordem do mais específico ao mais
  genérico: primeiro a credencial Google da organização (ativa e validada), depois
  a chave da instalação. Com mais de uma chave Google ativa, vale a mais antiga —
  e a tela avisa qual está em uso e quantas existem, porque o desempate
  silencioso faria o dono achar que a chave nova está valendo.

  A tela de produtos passou a dizer qual chave o passe usou (ou que não houve
  chave e o lote foi só por regra), para ninguém descobrir por que a IA não liga
  só rodando o lote e olhando o resultado.

- **O assistente interno passa a ser configurável em IA › Provedores** O assistente interno (`/api/v1/assistente/chat`) resolvia o modelo por um
  propósito — `assistente` — que **não estava no registro de pontos de IA**. Três
  consequências, todas silenciosas:

  - A tela de provedores não oferecia o ponto, então ninguém conseguia apontá-lo
    para uma credencial.
  - A API recusava a configuração com `ponto_desconhecido`.
  - Sem binding, o assistente caía no modelo padrão da instalação, ignorando as
    credenciais cadastradas pela tela.

  Medido em 12/10/2026 na instalação real: a chave do Google estava cadastrada,
  ativa e validada, e o assistente seguia chamando `anthropic/claude-sonnet-5`
  pelo OpenRouter — porque nada o ligava àquela chave.

  Agora `assistente` está no registro, com a exigência de tools declarada (é o
  que separa "responde" de "faz"), então a tela passa a oferecer e a API passa a
  aceitar a configuração.

  O teste de completude ganhou a entrada do ponto. Ele não pegaria sozinho: o
  assistente não passa pelo seam, então não há `purpose: 'x'` literal para a
  varredura encontrar — sem a entrada explícita ele continuaria invisível, que é
  como passou despercebido até agora.

## [1.25.32] — 2026-10-12

### Adicionado

- **Pedido offline no celular, com envio automático ao voltar o sinal** O vendedor sem área de cobertura agora captura o pedido no celular mesmo assim:
  escolhe o cliente e os produtos do catálogo já baixado, confere o total e salva
  na fila do aparelho — cada pedido com um número provisório para acompanhar.

  Quando o sinal volta e o sistema é aberto, tudo o que estava na fila é enviado
  sozinho, na ordem em que foi capturado. O número definitivo da empresa aparece
  no lugar do provisório. Se o servidor recusar algum item (crédito, preço ou
  estoque), ele fica marcado com o motivo para ser resolvido — nunca some em
  silêncio.

  O catálogo de produtos e clientes é baixado com um toque quando há internet, e
  a tela mostra há quantos dias ele foi atualizado — preço antigo pode ser
  recusado no envio, e quem vende precisa saber disso antes de prometer.

  Detalhe técnico para quem opera: o envio usa uma chave que impede o pedido
  duplicado quando a conexão cai no meio da transmissão. Sem ela, cada retry
  criaria um pedido novo igual ao anterior.

## [1.25.31] — 2026-10-12

### Adicionado

- **Desempate do NCM por IA (Gemini) no preenchimento em lote** O botão "Completar NCM" ganhou um passe de IA na zona cinzenta. Onde o
  casamento por regra é duvidoso (empate ou nota abaixo do limiar), o produto
  vai para o Gemini escolher entre os candidatos que a própria regra separou.

  A IA NÃO escolhe o código: ela recebe a lista de candidatos e a resposta só é
  aceita se o código vier de dentro dela. Fora da lista é invenção — e NCM
  inventado em nota é autuação, então a resposta é descartada.

  Só o nível mais alto de confiança grava sozinho: quando a IA escolhe o mesmo
  primeiro colocado da regra com confiança alta, dois sistemas independentes
  dizendo a mesma coisa. Discordância, confiança baixa ou falha de rede vão
  para revisão humana — com a opinião da IA anexada no item, para acelerar
  quem revisa em vez de substituir a revisão.

  Sem chave do Gemini configurada (`GEMINI_API_KEY`, gratuita no Google AI
  Studio) nada muda: o lote usa só a regra e o resto continua indo para revisão.
  Cada falha vira "vai para revisão", nunca "aplica qualquer coisa".

- **Completar o NCM dos produtos em lote** Um botão novo na tela de produtos preenche o NCM de tudo que está sem código
  de uma vez: para cada produto, o sistema compara o nome com a tabela oficial
  do IBPT e grava sozinho só quando o casamento é certo e sem empate. O resto
  volta listado para revisar na edição de cada produto, que já mostrava
  sugestão individual.

  Sem a tabela do IBPT importada (Notas → IBPT), o botão explica em vez de
  rodar e devolver zero em silêncio. Tudo que a máquina preenche fica marcado
  como sugerido, separado do que foi digitado à mão.

- **Nome de exibição editável na tela de Equipe** O nome que a Equipe lista, o inbox mostra e a assinatura usa agora pode ser
  alterado na própria tela de Equipe, por quem administra. É um nome só para
  todos os lugares: trocar aqui troca na assinatura junto.

  Vale para o caso comum que motivou: conta criada sem nome, que assinava com
  o começo do e-mail. Dois toques e a assinatura sai com o nome certo.

## [1.25.30] — 2026-10-11

### Adicionado

- **Laboratório do agente e Raio-X do site do prospect** **Laboratório.** Seis clientes simulados testam a campanha antes dela falar
  com gente de verdade: o decidido, o perguntão de preço, o irritado, o que
  pergunta o que não sabemos, o que exige humano e o que escreve errado. A
  conversa roda em sandbox — nada é enviado — com o mesmo gerador de mensagem
  da produção, e um juiz dá nota de 0 a 100 com os achados e a evidência. O
  histórico mostra se a mudança na campanha melhorou ou piorou a nota.

  **Raio-X do site.** Na ficha do prospect, um botão analisa o site: ele abre a
  página e verifica se existe, se tem HTTPS, se funciona no celular, se é rápido
  e se tem WhatsApp e contato à mostra. O resultado entra na prioridade da fila —
  um site cuidado conta mais do que um endereço que não abre.

- **Ramal do atendente com assinatura visível para o cliente** Cada membro da equipe agora tem um ramal — Faturamento, Vendas, Expedição —
  definido na tela de Equipe. A transferência de conversa entre atendentes já
  existia e continua igual.

  O que muda para o cliente: toda mensagem escrita por uma pessoa termina com
  quem escreveu, como "Bill Higiene e Limpeza - Faturamento Ana". Mensagens do
  robô e automáticas não levam assinatura. Quem ainda não tem ramal definido
  continua enviando normalmente, sem assinatura.

## [1.25.29] — 2026-10-10

### Corrigido

- **Importar da SEFAZ mostra o erro nomeado em vez de "sidecar inalcançável"** Três defeitos pequenos que juntos quebravam o botão Importar sem dizer o porquê:

  **O sidecar montava o config com a chave errada.** A biblioteca fiscal exige
  `schemes` no plural; o código mandava `scheme` no singular e a validação
  derrubava tudo antes de falar com a SEFAZ.

  **Exceção fora do try virava página de erro.** Quando a montagem falhava, o
  PHP devolvia HTML em vez de resposta, e o aplicativo traduzia isso como
  "sidecar inalcançável" — apontando para rede quando o problema era
  configuração. Agora a falha volta nomeada com o motivo.

  **A UF faltante não era pedida.** A biblioteca exige a sigla do estado, e a
  tela só pedia CNPJ e certificado. Agora a verificação pede os três de uma vez,
  em português, antes de chamar a SEFAZ.

## [1.25.28] — 2026-10-10

### Corrigido

- **Importar notas da SEFAZ não exige mais provedor de emissão** O botão "Importar" respondia com erro em instalações que tinham certificado
  válido só porque o provedor fiscal não era o de emissão. Baixar notas da SEFAZ
  não é emitir: a consulta autentica pelo certificado e filtra pelo CNPJ, e
  nada além disso entra na chamada.

  Agora a verificação prévia pede só o que o download usa — CNPJ, certificado e
  senha — e diz exatamente qual dos três falta. Quem já tinha o certificado
  instalado passa a importar sem mexer em mais nada.

## [1.25.27] — 2026-10-10

### Corrigido

- **A correção da reabertura chega à instalação que já existe** Correção de um erro de entrega: a correção pronta na versão anterior só existia
  na pasta de migrações, que o atualizador da instalação não executa — ele
  reaplica o esquema base. Por isso a coluna nova nunca chegava e a correção não
  funcionava.

  O acréscimo ao esquema base leva a mesma correção para quem já está em
  produção: fechar um aviso que continua valendo reabre o mesmo registro em vez
  de criar outro a cada verificação.

## [1.25.26] — 2026-10-10

### Corrigido

- **Três problemas que só apareciam com os dados reais da instalação** **Fechar um alerta não resolvia e o aviso voltava.** Um item marcado como tratado
  que continuava valendo era registrado de novo a cada verificação — a cada dez
  minutos. Além de encher a tela, a pessoa fechava o aviso e ele voltava, e a lição
  que fica é que não adianta fechar nada.

  **O aviso de pedido fora da carga nunca aparecia.** A comparação de cidade olhava o
  endereço do cliente em vez do endereço de entrega do pedido — e o mesmo cliente pode
  receber em outro lugar. Onde as duas informações existiam, a rotina não comparava as
  cidades certas; onde o endereço de entrega estava preenchido, ela passava a comparar.

  **O aviso de nota fiscal pendente apontava para o problema errado.** Ele dizia que
  faltava configurar o provedor, mas o que impedia a emissão era o cadastro do
  emitente incompleto. Quem seguia a indicação arrumava o provedor e a emissão
  continuava barrada, sem explicação.

  Agora o aviso lista tudo o que falta de uma vez, na ordem em que cada item
  libera o próximo, e diz onde cada informação é obtida.

## [1.25.25] — 2026-10-10

### Adicionado

- **O Meu Dia passa a avisar sobre nota pendente, carga incompleta e vencimento** O Meu Dia ganhou três avisos que antes só existiam na cabeça de quem atendia:

  **Nota fiscal pendente** — pedidos marcados como "é com NF" que ainda não têm nota
  emitida. Quando a instalação não tem provedor que confirme emissão, o aviso diz
  isso em vez de afirmar que a nota não saiu.

  **Pedido fora da carga** — quando uma carga atende uma cidade e fica outro pedido
  da mesma cidade de fora, aparece no dia seguinte. É um aviso, não uma cobrança: a
  cidade em comum é sinal, não prova.

  **Vencimento** — aviso preventivo no 30º dia do prazo de 45 dias, e o aviso
  normal perto do vencimento. Pedido sem nota emitida continua sem data — o valor
  nasce quando a nota é emitida, nunca antes.

  Quem paga e o que fica pendente aparece nos três lugares ao mesmo tempo, e um só
  registro: resolver em um resolve nos outros.

### Corrigido

- **A IA de prospecção parou de continuar atendendo** A IA de prospecção mandava a primeira mensagem e depois seguia atendendo como se
  fosse o atendente humano. Agora, assim que o cliente responde mostrando interesse,
  a IA se cala e a conversa vai para a equipe.

  O sistema continua de pé para o resto do atendimento, e o CRM guarda o que
  mandou, quando, por qual canal, para quem e o que respondeu — nada se perde.

  Quem não teve interesse não vê mudança: a IA não se cala por uma resposta de
  "boa tarde", e recusa explícita ("não tenho interesse") não conta como interesse.

## [1.25.24] — 2026-10-09

### Corrigido

- **O instalador não encontrava o banco em installs próprios** Em instalações com Supabase próprio, o script de atualização não conseguia falar
  com o banco: o nome do banco aparece dentro da string de conexão como se fosse
  um endereço de internet, e o programa temporário usado para falar com ele não
  conhecia esse nome.

  O passo de atualização do banco não era executado, e aparecia um aviso. Pior: o
  script de restauração — justamente o usado quando o banco quebrou — falhava com
  um erro que não parecia com "não consegui restaurar", e o arquivo de backup
  continuava inteiro sem ter sido restaurado.

  Agora todos os scripts que falam com o banco entram no container dele quando o
  banco é um container, e sobem um programa temporário só quando o endereço é
  público (Supabase na nuvem). Os dois caminhos já existiam e já eram testados; o
  que faltava era os scripts usarem.

  Quem já instalou recebe a correção na atualização normal: o script faz backup
  antes de mexer em qualquer coisa, e não há passo manual.

## [1.25.23] — 2026-10-09

### Corrigido

- **Dois testes que pararam de descrever a tela** A verificação automática falhou em dois passos depois da tela mudar, e a causa
  não era defeito: eram os testes que descreviam a versão antiga das telas.

  O caminho do certificado passou a ser somente leitura, porque quem escreve o
  caminho é o servidor e não a pessoa. O teste ainda tentou digitá-lo e ficou
  esperando.

  O botão de criar carga mostra entre parênteses quantos pedidos estão marcados.
  O teste exigia o nome sem esse número, que só aparece quando nada está
  marcado — ou seja, quando o botão não faz nada.

  Nada mudou para quem usa o sistema.

## [1.25.22] — 2026-10-09

### Adicionado

- **O serviço que conversa com a SEFAZ entra no conjunto de serviços** O serviço que emite a nota fiscal na SEFAZ nunca foi executado nesta instalação.
  Ele era mantido fora do conjunto de serviços, com a instrução de subir à mão — e
  essa subida nunca aconteceu.

  Agora ele é um serviço do conjunto, como os outros: sobe junto, volta sozinho
  depois de reinício da máquina, e é Health-checkado. O certificado é montado
  **somente para leitura**, e o serviço não tem porta exposta — ele só responde
  na rede interna e exige uma senha.

  O caminho do certificado também foi corrigido. O serviço exigia o caminho
  completo do arquivo e o sistema mandava só o nome; o resultado seria a nota ser
  recusada sem dizer que o caminho estava errado.

  A emissão continua desligada por enquanto: ainda falta a Inscrição Estadual do
  emitente e a troca do provedor para o emissor oficial. A tela mostra o que falta.

### Corrigido

- **A Agenda não abre mais com aviso de erro** Ao abrir a Agenda, aparecia um aviso vermelho dizendo que a disponibilidade do
  responsável ainda não estava configurada.

  A informação estava certa e o aviso, errado: quem-configura é um estado normal,
  não uma falha. Quem abriu a Agenda no primeiro dia de uso viu um aviso vermelho
  antes de qualquer pedido.

  Agora a Agenda mostra essa situação na cor de aviso, com a explicação de onde
  configurar. O mesmo vale para os outros dois casos de aviso que jáexistiam
  prontos no sistema, mas que nunca eram usados.

  Para encontrar isso foi preciso abrir a tela em produção: a suíte de testes
  passava sem perceber.

## [1.25.21] — 2026-10-09

### Corrigido

- **A evidência do certificado passou a mostrar o certificado** A verificação do envio do certificado digital passava, mas a imagem gravada
  registrava a tela ainda carregando, e depois o topo da página — que mostra o
  título e o aviso de teste, e não o certificado.

  A imagem agora é tirada depois de a tela confirmar o texto e o valor do campo, e
  com a rolagem até a seção do certificado. É a prova de que o arquivo foi
  gravado, e não de que a página abriu.

## [1.25.20] — 2026-10-09

### Corrigido

- **A tela parou de negar o certificado que estava no servidor** Depois de o certificado passar a ser enviado de verdade, a tela continuava
  avisando que não havia certificado — mesmo com o arquivo gravado no servidor e
  o envio confirmado.

  O motivo era a tela e a consulta usarem cada uma a sua conferência, e só a
  consulta ter sido atualizada. A tela de Notas lê a configuração direto do banco,
  sem passar pela rota, e por isso recebia a resposta incompleta.

  A conferência agora é feita em um único lugar, usado pelas duas. Um teste
  verifica que ela está nesse lugar único, porque duas cópias de uma regra é como
  elas divergem sem ninguém perceber — foi o que aconteceu aqui, e o que já tinha
  acontecido antes com o caminho do certificado, escrito à mão em três arquivos.

  Cada empresa tem a sua pasta: em uma instalação com mais de uma empresa
  cadastrada, uma não sobrescreve o certificado da outra.

## [1.25.19] — 2026-10-08

### Corrigido

- **O certificado passou a ficar guardado por empresa** Depois de passar a ser enviado de verdade, o certificado era gravado num único
  arquivo compartilhado por toda a instalação. Em uma instalação com mais de uma
  empresa cadastrada — e esta tem — uma segunda empresa que enviasse certificado
  sobrescreveria o da primeira, e a primeira passaria a assinar com o certificado
  errado.

  Agora cada empresa tem a sua pasta, e o caminho é montado a partir da sessão de
  quem enviou, nunca a partir de um valor vindo do banco.

  A tela também passou a mostrar o caminho que o servidor gravou, em vez do nome
  do arquivo que estava no computador de quem enviou — são nomes diferentes de
  propósito, e a tela não pode discordar do servidor sobre o próprio estado.

## [1.25.18] — 2026-10-08

### Corrigido

- **O backup do banco passava a ser salvo vazio, sem avisar** O backup diário do banco falhava e escrevia mesmo assim um arquivo — vazio. A
  pasta de backups mostrava arquivos de 20 bytes, que é um arquivo comprimido sem
  nenhum conteúdo dentro, e a tela confirmava "banco: 20" como se estivesse tudo
  certo.

  Na medição, cinco backups seguidos estavam vazios. Nenhum deles serviria para
  restaurar nada, e nada indicava o problema.

  O motivo era o mesmo que já affects as consultas ao banco nesta instalação: o
  nome do banco só existe dentro da rede de contêineres, e o backup subia um
  contêiner temporário fora dessa rede. A conexão falhava e o erro ficava perdido
  no meio do comando.

  Agora o backup usa o mesmo caminho que as demais consultas — dentro do contêiner
  do banco, quando o banco é um contêiner — e, antes de dar o backup por bom,
  confere que o arquivo tem conteúdo. Um arquivo vazio é recusado com erro claro e
  não é guardado, para não dar a impressão de que existe uma cópia.

  Foi acrescentado também um aviso no capítulo de operação do manual sobre como
  confirmar que o backup tem conteúdo.

## [1.25.17] — 2026-10-08

### Corrigido

- **O certificado digital passa a ser enviado de verdade** Na tela de configuração fiscal havia um botão para escolher o certificado
  digital. Escolhido o arquivo, o sistema anotava o nome dele e mostrava tudo como
  configurado — mas o arquivo em si nunca era enviado: saía do computador de quem
  configurou e não chegava ao servidor.

  Na medição, a instalação tinha o nome de um certificado gravado e nenhum arquivo
  de certificado em toda a máquina. Nada avisava.

  Agora o arquivo é enviado e fica gravado no servidor, e a tela passa a dizer a
  verdade: mostra "certificado gravado" só quando o arquivo existe, e avisa
  quando não existe. O caminho do certificado também deixou de ser um campo em
  que se escreve — quem define é o envio do arquivo.

  O certificado é guardado em uma pasta protegida do servidor, fora do
  armazenamento público, e os arquivos aceitos são verificados no servidor: um
  arquivo com outro formato, mesmo que renomeado para `.pfx`, é recusado com
  explicação.

  Isso deixa a emissão de nota pronta para o próximo passo, que é configurar o
  serviço que fala com a SEFAZ.

## [1.25.16] — 2026-10-08

### Corrigido

- **Os pedidos passam a ter vendedor, e o nome aparece na tela** Um pedido criado na tela não ficava com o nome de quem criou. Com isso, o filtro
  por vendedor não filtrava nada e o nome não aparecia no PDF do pedido, mesmo que
  o sistema tivesse o campo pronto.

  Medido antes da correção: dos 10.769 pedidos da instalação, nenhum tinha
  vendedor registrado.

  Agora:

  - pedido feito na mão fica com o nome de quem criou;
  - pedido que entra pelo WhatsApp, pela IA ou pelo portal B2B continua sem dono,
    porque não foi uma pessoa que vendeu;
  - o filtro por vendedor mostra o nome da pessoa, e não um código interno;
  - o nome passa a sair no PDF do pedido.

  Pedidos que já existiam continuam como estão — este recurso vale para os novos.
  Para o histórico, é preciso atribuir o vendedor a partir de quem criou cada um.

## [1.25.15] — 2026-10-08

### Corrigido

- **A busca de pedidos para montar a carga passa a ser verificada na tela** A busca para achar o pedido que vai embarcar foi entregue, mas a primeira
  entrega não trazia a ligação com a tela: o programa avisava que a busca estava
  disponível e não havia campo para digitar.

  Agora a entrega passa por uma verificação que semeia pedidos de verdade, digita
  na busca e exige o campo na tela. É essa verificação que teria barrado a
  entrega anterior, porque ela passava com a tela desconectada da busca.

  A verificação também limpa os pedidos que cria, para não deixar a lista de
  embarque suja para o uso real.

## [1.25.14] — 2026-10-08

### Corrigido

- **A busca de pedidos para montar a carga não aparecia na tela** A busca para achar o pedido que vai embarcar foi anunciada na versão anterior,
  mas o campo não apareceu na tela: a versão subia, os pedidos apareciam na fila e
  não havia onde digitar.

  O motivo foi uma entrega incompleta — a parte que faz a comparação do texto
  havia sido publicada, e a ligação dela com a tela não.

  A busca funciona por número do pedido, nome do cliente, cidade e CNPJ, com ou
  sem acento. Os pedidos já marcados continuam sempre visíveis, mesmo com a
  busca apertada.

## [1.25.13] — 2026-10-08

### Adicionado

- **Busca de pedidos para montar a carga** Ao preparar uma nova carga, a lista de pedidos para embarcar não tinha busca:
  era preciso rolar e ler item por item até achar o pedido certo.

  Agora há um campo de busca na tela de nova carga. Ele encontra o pedido pelo
  número, pelo nome do cliente, pelo CNPJ ou CPF e pela cidade.

  A busca funciona com ou sem acento: o sistema guarda "São Paulo" e a pessoa
  digita "sao paulo" no celular, e o pedido é encontrado do mesmo jeito.

  Os pedidos já marcados ficam sempre visíveis, mesmo com a busca apertada. Sem
  isso, os pedidos escolhidos sumiriam da tela durante a busca e a carga seria
  montada sem a pessoa perceber o que tinha marcado.

## [1.25.12] — 2026-10-08

### Corrigido

- **Importar notas da SEFAZ deixa de aparecer como falha do sistema** Ao pedir para importar notas da SEFAZ, aparecia um erro vermelho na tela.

  A instalação não transmite notas para a SEFAZ — as notas são emitidas apenas
  dentro do sistema — e a mensagem estava certa: não havia o que importar. O que
  estava errado era o aviso: uma situação de configuração da instalação era
  mostrada com a cor de algo que quebrou, e o motivo ficava escondido.

  Agora a situação é mostrada na cor de aviso, com a explicação de que a SEFAZ não
  está configurada. Falhas reais da SEFAZ continuam aparecendo em vermelho, para
  não se confundirem com a configuração.

  Esta distinção vale também para as outras duas operações fiscais que passavam
  pelo mesmo caminho: exportar os XMLs e cancelar uma nota.

## [1.25.11] — 2026-10-08

### Corrigido

- **As fotos enviadas aparecem na lista de produtos** Depois de passarem a vir junto com a lista, as imagens ainda não apareciam: as
  fotos enviadas pelo próprio sistema ficam guardadas em disco no servidor, e a
  lista tentava buscá-las no serviço de arquivos, que não as conhece.

  Agora as fotos guardadas em disco são servidas pelo caminho certo, e aparecem
  na lista. A regra que decide qual caminho usar ficou em um único lugar, em vez
  de repetida em três arquivos — que era como as versões divergiam sem ninguém
  perceber.

## [1.25.10] — 2026-10-08

### Corrigido

- **As fotos do catálogo aparecem de verdade na lista** As imagens dos produtos foram trazidas para a tela, mas chegavam vazias: a
  lista abria completa, sem nenhuma foto, e o problema se repetia em toda linha.

  O motivo era uma regra de segurança que vale no caminho da tela e não valia no
  caminho da página: a lista de fotos era lida com as permissões de quem estava
  conectado, e a página não enxergava essa tabela. A consulta passou a usar a
  permissão do servidor, mantendo a verificação de que as fotos são da mesma
  empresa de quem está pedido.

## [1.25.9] — 2026-10-08

### Corrigido

- **A busca de empresas volta a encontrar resultados** A busca de empresas ficava parada em "Progresso 0%", sem encontrar nada e sem
  mostrar erro, mesmo com o resto do sistema funcionando.

  O serviço público de mapas que responde a essas buscas estava indisponível, e o
  sistema insistia no mesmo serviço em vez de tentar os outros. Agora ele passa
  para o próximo serviço quando um deixa de responder, e foi incluído um serviço
  reserva que está no ar.

## [1.25.8] — 2026-10-08

### Corrigido

- **As fotos dos produtos aparecem junto com a lista, sem piscar** A lista de produtos aparecia primeiro sem nenhuma foto, e as imagens só
  apareciam alguns segundos depois, quando a página já estava aberta. Parecia que
  o sistema estava quebrado, mesmo estando certo.

  Agora as fotos são preparadas junto com os produtos, antes de a página ser
  desenhada. A lista aparece completa de primeira, e o trabalho foi tirado do
  navegador — o que também deixa a tela mais leve de carregar.

- **Aba Radar deixa de dar erro ao listar clientes inativos** A aba Radar mostrava um erro ao abrir a lista de clientes que pararam de
  comprar, mesmo com o sistema funcionando normalmente.

  O motivo era o tamanho da pergunta: a lista de clientes ia inteira em um único
  pedido ao banco de dados. Quando passava de certo tamanho, o banco recusava por
  limite de tamanho e a tela recebia um erro genérico, sem dizer o que era.

  A lista agora é dividida em partes menores, e cada parte é buscada por conta
  própria.

## [1.25.7] — 2026-10-08

### Corrigido

- **As telas abrem mais rápido ao navegar pelo menu** Navegar pelo menu lateral demorava alguns segundos para a tela ficar pronta.
  Ao clicar em um destino, o sistema baixava antecipadamente o conteúdo de todas
  as telas do menu, mesmo as que ninguém ia abrir — mais de trinta arquivos e uma
  espera de quase quatro segundos.

  Agora cada tela é carregada quando é pedida, e a navegação corresponde ao tempo
  real de abrir a tela.

## [1.25.6] — 2026-10-08

### Corrigido

- **O assistente do inbox volta a responder mensagens** O assistente automático estava ligado, mas não processava nada desde o dia em
  que a instalação foi mudada para a própria máquina. A tela continuava mostrando
  o robô como ativo e nenhuma mensagem era respondida.

  O motivo era um gerador de documentos: o trecho do sistema que monta o arquivo
  de dados do titular era carregado junto com o registro dos processadores
  automáticos, e esse arquivo não abria nesse ambiente. Quando o registro inteiro
  caía, caíam juntos o assistente do inbox, os retornos programados e as
  automações. As conversas que estavam em processamento ficaram travadas.

  Agora o documento só é carregado quando alguém pede a exportação, e o registro
  dos processadores sobe de pé — o assistente do inbox, os retornos e as
  automações voltam a processar. As conversas presas foram liberadas.

## [1.25.5] — 2026-10-08

### Corrigido

- **O painel inicial deixa de levar vários segundos para abrir** O painel inicial demorava vários segundos para mostrar os números, e em alguns
  momentos voltava vazio porque o aplicativo era reiniciado no meio do
  carregamento.

  A causa era a forma como as datas eram convertidas para o calendário: a cada
  linha de pedido o sistema criava um novo conversor, em vez de reaproveitar o
  mesmo. Com muitos pedidos isso consumia o espaço de memória do aplicativo e o
  servidor era reiniciado enquanto a página ainda carregava.

  Os números agora são calculados reaproveitando o conversor, e o painel abre
  com os valores.

## [1.25.4] — 2026-10-08

### Corrigido

- **As fotos dos produtos voltam a aparecer no catálogo** As imagens dos produtos estavam cadastradas e continuam no banco, mas a coluna
  de fotos aparecia vazia na tela do catálogo. Nada indicava a causa: todas as
  consultas respondiam normalmente.

  O motivo era o pedido da imagem. O aplicativo pedia as fotos por um endereço de
  serviço que só existe na versão hospedada do Supabase; em uma instalação própria
  esse endereço não existe e a imagem não carregava. Agora o aplicativo usa o
  arquivo como ele está, e a imagem aparece.

  Enviar uma foto nova também passa a funcionar em instalações próprias.

## [1.25.3] — 2026-10-08

### Corrigido

- **As fotos dos produtos aparecem na tela do catálogo** As imagens que já estavam cadastradas sumiam da lista de produtos: a tela
  carregava os dados, mas não mostrava nenhuma foto. Ao enviar uma foto nova,
  também aparecia um erro — a pasta onde as imagens são guardadas ficava
  pertencente a outro usuário do sistema e o aplicativo não conseguia escrever
  nela.

  Agora as fotos aparecem como devem, e o envio de novas fotos funciona.

## [1.25.2] — 2026-10-08

### Corrigido

- **Lote de fotos dos produtos deixa de devolver erro 500** A tela de catálogo pede as fotos de toda a lista em uma única chamada. Com
  centenas de produtos, essa chamada ultrapassava o limite de tamanho de URL do
  serviço de dados e a tela recebia erro 500. Agora a consulta é feita em partes,
  e um teste novo garante que nenhuma delas fique grande demais.

## [1.25.1] — 2026-10-08

### Corrigido

- **Fotos da lista de produtos não quebram mais a página no navegador** A tela de catálogo buscava as fotos de cada produto em uma requisição
  separada. Com centenas de produtos, a rajada derrubava o serviço de
  autenticação e o navegador recebia 401 mesmo com a sessão válida. Agora a
  lista inteira vem em uma única chamada, e os identificadores vão no corpo da
  requisição — mandá-los na URL passava de 18 KB e quebrava a conexão HTTP/2,
  levando junto as outras chamadas da tela.

## [1.25.0] — 2026-10-07

### Adicionado

- **SPED com Bloco H (estoque por entradas e saídas) e arquivo editável** O arquivo EDF ICMS/IPI mensal (SPED Fiscal) agora inclui o Bloco H
  (inventário): por produto, o saldo = entradas das notas de compra (positivas)
  menos saídas das notas autorizadas. O arquivo gerado passou a aparecer em uma
  caixa de texto editável na tela de SPED, para ajustes manuais antes do
  download.

### Corrigido

- **Fotos de produtos passam a usar thumbnails otimizados** A foto de capa do produto agora cai no endpoint `/storage/v1/render/image/public/...` do Supabase (width=96, quality=70) em vez de baixar o arquivo original (até 2 MB), reduzindo o tempo até a primeira imagem visível na lista de produtos.

## [1.24.0] — 2026-10-07

### Adicionado

- **SPED com Bloco H (estoque por entradas e saídas) e arquivo editável** O arquivo EDF ICMS/IPI mensal (SPED Fiscal) agora inclui o Bloco H
  (inventário): por produto, o saldo = entradas das notas de compra (positivas)
  menos saídas das notas autorizadas. O arquivo gerado passou a aparecer em uma
  caixa de texto editável na tela de SPED, para ajustes manuais antes do
  download.

### Corrigido

- **Fotos de produtos passam a usar thumbnails otimizados** A foto de capa do produto agora cai no endpoint `/storage/v1/render/image/public/...` do Supabase (width=96, quality=70) em vez de baixar o arquivo original (até 2 MB), reduzindo o tempo até a primeira imagem visível na lista de produtos.

## [1.23.0] — 2026-10-07

### Adicionado

- **SPED com Bloco H (estoque por entradas e saídas) e arquivo editável** O arquivo EDF ICMS/IPI mensal (SPED Fiscal) agora inclui o Bloco H
  (inventário): por produto, o saldo = entradas das notas de compra (positivas)
  menos saídas das notas autorizadas. O arquivo gerado passou a aparecer em uma
  caixa de texto editável na tela de SPED, para ajustes manuais antes do
  download.

### Corrigido

- **Fotos de produtos passam a usar thumbnails otimizados** A foto de capa do produto agora cai no endpoint `/storage/v1/render/image/public/...` do Supabase (width=96, quality=70) em vez de baixar o arquivo original (até 2 MB), reduzindo o tempo até a primeira imagem visível na lista de produtos.

## [1.22.0] — 2026-10-06

### Adicionado

- **SPED com Bloco H (estoque por entradas e saídas) e arquivo editável** O arquivo EDF ICMS/IPI mensal (SPED Fiscal) agora inclui o Bloco H
  (inventário): por produto, o saldo = entradas das notas de compra (positivas)
  menos saídas das notas autorizadas. O arquivo gerado passou a aparecer em uma
  caixa de texto editável na tela de SPED, para ajustes manuais antes do
  download.

## [1.21.1] — 2026-10-06

### Corrigido

- **A barra de ferramentas das notas fiscais aparece mesmo sem nota** A barra de ferramentas da tela de NF-e (Emitir nota, Exportar CSV, Importar
  histórico do SEFAZ, NSU, modelo, Exporta XMLs, busca e filtros de período e
  status) ficava dentro do ramo que só renderizava quando existia ao menos uma
  nota fiscal.

  Medido em produção em 06/10/2026: as tabelas fiscais estavam todas com zero
  linhas, então a tela caía no estado vazio e escondia a barra inteira — os
  botões eram invisíveis não por permissão nem por versão, mas porque não havia
  nota nenhuma para exportar ou filtrar. Quem olhava a tela não tinha como
  saber que as ferramentas existiam.

  A barra agora renderiza sempre. O condicional passou a decidir só o corpo:
  sem nota (estado vazio), sem resultado de filtro, ou a tabela.

## [1.21.0] — 2026-10-06

### Adicionado

- **O healthcheck confere se a versão está bem fixada** O diagnóstico ganhou uma seção "Âncora de versão (drift)", com cinco checagens:
  a tag da imagem no `.env` (recusando canais móveis como `main`, `latest` e
  `stable`), se as três imagens estão na mesma tag, se há branch local no
  repositório, se há mais de um remote e se o HEAD está solto numa tag publicada.

  Medido numa VPS real em 06/10/2026: o `.env` saiu de `:1.20.2` para `:main` às
  22h15 e o site foi trocado sozinho às 00h48, sem ninguém pedir — `:main` é
  reconstruída a cada merge, então quem aponta para ela instala o topo do
  repositório sobre o banco da versão instalada. Na mesma noite o repositório
  ficou com quatro branches locais (uma 239 commits atrás da remota) e dois
  remotes para a mesma URL, e nada disso aparecia em lugar nenhum.

## [1.20.2] — 2026-10-05

### Alterado

- **O alerta de orçamento de IA não assina mais com o nome do produto** O e-mail de aviso de orçamento de IA saía com o assunto `Alerta IA: orçamento
  atingiu X% — DeskcommCRM`. Numa instalação self-host isso é o nome de outra
  empresa na cara de quem recebeu o aviso.

  O assunto passa a assinar com a organização sobre a qual o alarme disparou
  (`orgName`) e, quando esse campo vem vazio, sai sem assinatura nenhuma — silencioso
  é melhor do que mentir sobre quem escreveu.

  Era a última dívida da catraca de marca (`tests/unit/branding.test.ts`), que fica
  agora zerada: o gate que tranca o conjunto pelo nome passou a esperar o vazio, de
  modo que a dívida não reapareça trocando de arquivo.

## [1.20.1] — 2026-10-05

### Alterado

- **A logo da barra lateral ficou maior e no meio** A marca que o dono da instalação sobe pelo painel aparecia pequena demais e
  encostada na esquerda da barra lateral. A arte foi de `h-7` (28px) para `h-10`
  (40px) e a barra de `h-14` (56px) para `h-16` (64px), com a largura máxima
  subindo de 10rem para 13rem — era ela que segurava marcas mais largas que a
  barra antiga comportava.

  O cabeçalho deixou de alternar entre `justify-start` e `justify-center`
  conforme o estado colapsado: agora é sempre centrado, e o `<img>` ganhou
  `mx-auto` para centralizar também quando a arte é mais estreita que a barra.
  Antes, com o logo carregado ele encostava na esquerda enquanto o texto caído
  ficava no meio — a marca se movia sozinha quando a barra dobrava.

## [1.20.0] — 2026-10-05

### Adicionado

- **Manual de uso do DeskcommCRM, com as telas do produto** O manual que faltava: um PDF com as telas do produto (dashboard, meu dia,
  radar, inbox, follow-ups, pedidos, contatos, produtos, kanban, prospecção,
  estoque) e o passo a passo do dono do negócio que instalou na VPS. Vive em
  `manual/`, gerado por `scripts/manual-pdf.ts` — quem muda a tela regenera o
  manual em vez de descrever uma tela que não existe mais.

- **NF-e com paridade Odivix - extras da emissao, historico DF-e, IBPT e NCM sugerido** O módulo fiscal ganhou a cadeia inteira que faltava, item a item medido contra
  o sistema antigo: emissão de NF-e com os **extras da própria nota**
  (transporte, cobrança com parcelas, adicionais e local de entrega) gravados em
  `invoices.extras_fiscais`, histórico do que a SEFAZ já autorizou (distribuição
  DF-e com cursor por organização, para o clique seguinte não rebaixar tudo),
  importação por XML e por SEFAZ, inutilizações e carta de correção em PDF,
  tabela de IBPT por organização com importação do CSV oficial e busca de NCM na
  hora de cadastrar o produto. O cabeçalho do pedido impresso passou a levar
  telefone e endereço da emitente, tirados da tela de Configurações.

- **O radar passa a dizer o que fazer, nao so quem esfriou** O radar de risco já avisava **quem** esfriou; agora guarda **o que fazer** a
  respeito. A cada travessia fria o motor local (o `laya-serve` que roda na mesma
  VPS) responde uma decisão por negócio — reativar, aguardar ou encerrar — com a
  confiança e o modelo que respondeu. A sugestão é avaliação, não estado: fica
  **fora** da publicação realtime de propósito, porque regravá-la a cada tick
  publicaria evento sem mudança visível. A tela do radar lê junto, por request.
  A escrita exige `manager+` (migration 0259): um `agent` falando direto com o
  PostgREST não encerra o próprio lead.

### Alterado

- **O assistente flutuante ganhou um rosto novo — o bloub** O rostinho do ajudante (o botão redondo que flutua no canto de todas as
  telas) passou do Strobi para o bloub, a bolota do x.ai recriada em SVG. O
  que muda é só a cara: ele respira, pisca e segue o seu mouse com os olhos
  em graus contínuos, dá um `wink` quando você clica e fica atento com o
  chat aberto. As cores acompanham o tema (claro/escuro) sozinhas.

  **Como usar:** nada de novo para fazer — é só olhar para o cantinho de
  sempre. Quem preferir menos movimento continua sendo respeitado: com
  `prefers-reduced-motion` (ou tela de toque), o rosto vira uma imagem fixa.

  Por dentro, a engine do bloub agora é código versionado aqui no repo
  (licença MIT, sem dependência baixada em runtime) — offline e self-host
  continuam funcionando sem nada extra.

## [1.19.0] — 2026-10-03

### Alterado

- **Meu Dia — a linha do tempo do seu dia, com o contexto ao lado** A tela **Meu Dia** deixou de ser três listas iguais e virou a linha do
  tempo do seu dia: **ATRASADO → HOJE → AMANHÃ → MAIS TARDE**, com as
  tarefas e os compromissos do dia em ordem certa. Cada tarefa traz os
  botões **Concluir** e **Amanhã** direto na linha — adiar empurra para o
  próximo dia útil e a tela se recompõe sozinha.

  **Como usar:** menu **Meu Dia**. Em cima, a saudação muda conforme o
  relógio (Bom dia / Boa tarde / Boa noite), a data por extenso e o
  resumo do dia — "N atrasadas · N hoje · N amanhã". O filtro de tarefas
  passou a ser **minhas + sem dono**: o que é seu entra, o que ninguém
  assumiu também (é a fila da equipe), e o resto da organização fica
  para quem tem de ver.

  A coluna da direita é o contexto de quem trabalha em cima do dia:
  **Mensagens** (as não lidas atribuídas a você, com atalho para o
  Inbox), **Follow-ups ativos**, **Recomendações** da inteligência e os
  **Pedidos e atalhos** com o total de pedidos de hoje. Quando não há
  nada pendente, a tela diz **Dia limpo** em vez de mostrar listas vazias.

  Nada de configuração para começar — é só abrir a tela.

## [1.18.1] — 2026-10-02

### Corrigido

- **Tela de atualização — falha antiga não esconde mais o estado atual** A **Atualização do sistema** deixou de ser sequestrada por uma falha antiga.
  Quando uma tentativa de atualização falha, a tela passa a mostrar o erro — e
  fica assim enquanto o sistema continua onde a tentativa o deixou. Mas se a
  instalação foi adiante por conta própria (um update rodado direto no servidor,
  por exemplo), aquela tela de falha não descreve mais nada: ela ficava no caminho
  do botão de atualizar, escondendo o estado real da sua versão.

  **O que muda:** a falha que já não descreve a instalação desce para um aviso
  dentro da tela normal — a tentativa antiga, o log e o comando de saída seguem
  à mão, mas o estado atual ("você está na versão X", "versão Y disponível") volta
  a mandar na tela, com o botão de atualizar de volta. A falha que AINDA descreve
  o host continua com a mesma tela de saída de sempre.

## [1.18.0] — 2026-10-02

### Adicionado

- **Prospecção — encontrar, abordar e acompanhar novos clientes do zero** A **Prospecção** entra no produto: você diz o que vende (categorias) e
  onde (cidade), o sistema busca empresas reais, mostra quem vale a pena
  abordar e acompanha cada contato até o pedido — sem planilha e sem
  adivinhação.

  **Como usar:** menu **Prospecção → aba Empresas** (ou "Encontrar
  empresas"). Escolha cidade, categoria e clique em buscar: os
  resultados vêm como **cards comerciais sobre o mapa** (a tabela é o
  modo secundário, para ações em lote). Cada card traz nota, telefone,
  site, distância e um placar de prioridade; os chips no topo cortam por
  alta prioridade, novos, já abordados e a sua fila.

  **Fila de prospecção:** dentro da página de cada empresa você assume o
  prospect, anota a próxima ação e o status comercial (novo, contatado,
  respondeu, qualificado, oportunidade, perdido, ganho). "Minha fila"
  agora filtra **no servidor** e o número em cima fala de todo o recorte,
  com **"Carregar mais"** para descer na lista inteira. Cada prospect
  abre o **Inbox** com o contexto da empresa já junto — mesma conversa de
  sempre, só muda o ponto de partida.

  **Campanhas:** a aba **Campanhas** monta campanhas de descoberta por
  cidade/categoria e mostra o funil completo (encontrados → … →
  faturamento) de todas as campanhas numa tela só, com pedidos e
  faturamento contados dos **pedidos reais** do CRM (pedido anterior à
  campanha não conta). O **Radar** ganhou a seção **"Novos prospects"**
  com as ações em um clique: abrir o prospect, adicionar à fila e iniciar
  conversa. O que é de "Meu Dia" entra no seu dia como tarefa, com o
  nome da empresa e a próxima ação no título.

  **Custo sob controle:** a busca usa o provedor que você escolher na aba
  Config (o grátis OSM por padrão; Google Places se você colocar a
  chave). O painel **Consumo de Prospecção** mostra consultas, hits de
  cache, custo e o teto do mês; atingindo 100% do orçamento a busca é
  recusada com aviso literal — reduções de 90% seguem deixando você
  buscar manualmente. Cache de 30 dias por padrão: repetir a mesma busca
  no período não custa nada.

  **Para a equipe:** quem pode (papéis viewer/agent/manager) enxerga o
  que o papel permite; tudo que muda dono ou status gera evento de
  auditoria. Nada de configuração extra para começar — é só abrir a aba
  e buscar.

## [1.17.0] — 2026-09-30

### Adicionado

- **Venda Automática — campanhas de abordagem com cota diária, janela de horário e follow-ups** A **Venda Automática** entra no produto: você monta uma campanha por
  cidade (e categorias da prospecção), o sistema escolhe os candidatos do dia
  dentro de uma cota diária, manda a primeira mensagem pela IA dentro da
  janela de horário que você definiu, faz os follow-ups (24h e 48h por
  padrão), classifica as respostas e encaminha interessados como lead —
  tudo com fila visível e ações humanas.

  **Como usar:** Prospecção → aba Empresas → filtre pela cidade e as
  categorias → botão **“Criar venda automática”** (usa o filtro atual, a
  lista ou a seleção de prospects como cota). A tela abre em
  **Venda Automática** no menu lateral: campanhas, painel do dia, fila
  com status e timeline de cada contato. Também dá para criar e editar
  campanhas por lá, com cidade, categorias, cota (1 a 500), janela de
  horário e horários de follow-up.

  **No Inbox:** o filtro de tag vira **filtro de assunto** com atalhos
  prontos — Venda Automática, Radar, Interessados, Sem resposta e
  Oportunidades — e segue aceitando as tags da sua organização. Nenhuma
  aba nova.

  **Duplicidade e cota:** cada prospect entra uma vez por campanha; duas
  campanhas nunca abordam o mesmo contato ao mesmo tempo; a cota diária
  conta só quem foi contatado como **novo** no dia (follow-ups não consomem
  cota). Contatos com opt-out, sem WhatsApp potencial ou fora da cidade
  são descartados automaticamente, com o motivo registrado.

  **Auditoria:** cada ação humana da fila (assumir, ignorar, bloquear,
  reenfileirar) e cada transição do motor geram evento de auditoria e
  linha na timeline. Bloquear ativa o opt-out de verdade.

  **Operação:** o motor roda a cada minuto pelo cron
  `api/v1/cron/automatic-sales` (mesma chave interna dos demais crons);
  pausar uma campanha corta o envio no mesmo minuto. Nada a configurar.

## [1.16.8] — 2026-09-30

### Alterado

- **Previsão de vendas vira linha de ritmo do mês inteiro — atravessa o último dia e meses fechados** A linha de projeção do gráfico "Evolução de Vendas" deixou de existir só nos
  dias futuros e passou a ser o RITMO médio do mês: a taxa diária
  (vendido ÷ dias decorridos) projetada do dia 1 ao último. Por construção ela
  passa exatamente pelo acumulado realizado de hoje e termina na própria
  previsão do mês — no último dia do mês corrente a linha continua lá, e em
  meses fechados vira a régua do ritmo médio até o total final.

  Mês que ainda não começou continua sem projeção: a legenda "Previsão de
  vendas" fica desabilitada e explica "Sem previsão para este mês" no hover, e
  o KPI "Projeção" cai para a previsão em vez de mostrar R$ 0.

  Também conserta um efeito colateral em meses fechados: a linha realizada era
  truncada no dia de número igual a "hoje" (um agosto de 31 dias visto em 30 de
  setembro perdia o dia 31 do desenho) e o tooltip escondia "No dia" dos últimos
  dias. A trava de mês corrente agora vale para isso também; o tooltip passou a
  mostrar "Projeção do dia" também nos dias passados, junto do realizado.

  Validação: typecheck e lint zerados, gov:verify na régua da 1.16.7 (15
  falhas pré-existentes, 0 novas), 19 testes do gráfico e 6 novos da grade em
  lib/comercial/visao-do-mes.test.ts.

## [1.16.7] — 2026-09-30

### Corrigido

- **KPI Projeção não mostra mais R$ 0 em mês fechado e a legenda desligada explica o motivo** No último dia do mês e em qualquer mês fechado a série de projeção vem vazia —
  não sobra amanhã para projetar — e o card **Projeção** interpretava isso como
  zero: o dono via **R$ 0,00** do lado da Previsão com o valor certo. O card
  agora cai para a previsão do mês, que é exatamente a projeção quando ela
  existe, e nunca mais exibe zero por falta de dado. A legenda de previsão de
  vendas, quando não há o que ligar, passa a dizer o motivo no hover ("Sem dias
  futuros no mês para projetar") em vez de ficar muda; com dias futuros no mês
  corrente ela acende e some como sempre.

## [1.16.6] — 2026-09-30

### Corrigido

- **Legenda da Evolução de Vendas funciona na Home — mês/ano passado chegam aos dados** A Home pedia só o mês corrente, então "Mês passado" e "Ano passado" da legenda
  ficavam permanentemente desabilitados ali, enquanto os Indicadores funcionavam.
  A página e o endpoint de troca de mês agora buscam a mesma janela de 14 meses
  dos Indicadores, e as séries de comparação saem das linhas da própria janela —
  sem query nova — com o mesmo acumulado (`acumuladoDiario`) nas três telas. O
  painel direito do gráfico ganhou a alavanca "Comparar" na Home, e clicar num
  item de comparação com ela desligada acende a comparação, pela regra que o
  próprio gráfico já aplicava. Nenhum número do mês corrente mudou.

## [1.16.5] — 2026-09-30

### Alterado

- **Legenda do Evolução de Vendas vira botão — cada item liga e desliga a própria série** Os cinco itens da legenda do gráfico (Vendas no mês, Objetivo, Previsão de
  vendas, Mês passado e Ano passado) agora são botões: clicar esconde e volta a
  mostrar aquela linha, e a linha correspondente some/do tooltip acompanha o
  clique. Os itens de comparação acendem o botão "Comparar" dos Indicadores
  quando ele está desligado — depois disso cada um some isoladamente. Item sem
  dado nenhum (meta inexistente, ou comparação num mês que a fonte não preenche)
  fica desabilitado em vez de fingir que o clique fez efeito. Nenhum número ou
  regra de negócio mudou.

## [1.16.4] — 2026-09-30

### Alterado

- **Telas mais rápidas — abas, filas e o seletor de mês param de recarregar a casca do app** Trocar de aba (Estoque, Compras, funis, Conexões), mudar a fila do Inbox e navegar o
  mês do gráfico da Home agora atualizam a URL sem pedir um novo render ao servidor: o
  clique passa a ser estado local do navegador + gravação no histórico, e o mês da Home
  busca um endpoint leve em vez de recarregar a página inteira. Em produção, cada um
  desses cliques custava de 1 a 2 segundos — agora é imediato, com o mesmo link
  compartilhável e o mesmo deep-link de antes.

  As consultas que rodavam em série sem depender uma da outra (permissões do usuário,
  fuso/janela/contatos da Carteira, as quatro leituras da Agenda, itens dos Relatórios e
  a grade dos Indicadores) passam a correr em paralelo, e a verificação em duas etapas
  deixa de repetir a mesma pergunta que a tela de Segurança acabou de receber do layout.
  Recolher a barra lateral também ficou instantâneo. Nenhum número, tela ou regra de
  negócio mudou.

## [1.16.3] — 2026-09-29

### Corrigido

- **Bolha de entrada branca no tema claro do inbox** No tema claro, a bolha da mensagem recebida saía preta, com o texto invisível
  por cima. A causa era uma alavanca do design system: o tema claro aponta
  `--color-white` para `#111118` de propósito (para os tints `bg-white/10`
  virarem sombra), e a bolha usava `bg-white`, que o Tailwind v4 compila para
  `var(--color-white)`. A bolha passou a usar o branco literal `bg-[#ffffff]` —
  branca nos dois temas, como a referência —, e o mesmo vale para os três
  containers de QR code que também queriam branco de verdade (onboarding do
  WhatsApp, modal de MFA e conexões), que antes ficavam escuros no tema claro.
  Ninguém precisa fazer nada para receber isto.

## [1.16.2] — 2026-09-29

### Alterado

- **Telas mais rápidas: home, inbox e indicadores** Abrir a home, a caixa de entrada e os indicadores ficou mais rápido. A moldura
  da home deixou de esperar seis consultas em fila (agora correm em paralelo), os
  indicadores parou de varrer até 25 mil linhas e de perguntar o nome de cada
  membro da organização fora do ranking — o que cortou o tempo de renderização da
  tela de 11,8–17,1s para cerca de 0,5s na medição local — e a fila do inbox
  ganhou um índice parcial no par (organização, last_inbound_at) que casa com a
  ordenação que ela já usava. A navegação entre telas reaproveita o cache do
  roteador por 30s, os polls de conexão passaram de 10s para 30s (e o de versão
  de 5s para 60s enquanto não há atualização em andamento), e o Sentry parou de
  enviar traços de performance (erros e replays de erro continuam). Nada muda em
  regra, atalho ou permissão e ninguém precisa fazer nada para receber isto — é só
  mais rápido.

### Corrigido

- **Abas do inbox param de colidir em coluna estreita** Os filtros do inbox — Fila, Minhas, Todas, Fechadas, Automático — apareciam espremidos na coluna da lista, com o texto de uma aba invadindo a vizinha ("FechadasAutomático" colado, o contador grudado no rótulo seguinte). A causa era a geometria da faixa: ela dividia a largura em partes iguais que ficavam menores que o próprio rótulo — "Automático" mede mais que a coluna que lhe coube no xl, de 272px — e o texto centralizado transbordava para os dois lados. Agora a faixa usa a mesma estrutura da referência visual do produto: divisão igual em flex, com piso no tamanho do conteúdo, de modo que nenhuma aba encolhe abaixo do que ela escreve; e se um dia faltar largura, a faixa rola em vez de espremer o texto. O aperto horizontal também fechou para as cinco abas caberem sem rolagem na coluna mais estreita. É conserto visual apenas — nada muda em regra, atalho ou permissão, e ninguém precisa fazer nada para receber isto.

## [1.16.1] — 2026-09-28

### Alterado

- **Inbox alinhado ao padrão visual do produto** O **inbox** foi ajustado para seguir a mesma linguagem visual do restante do CRM: as abas Fila / Minhas / Todas / Fechadas / Automático agora são um controle segmentado com destaque sólido e contadores na cor da marca, a busca vem primeiro e sem ícone, os itens da lista respiram na mesma grade, e o cabeçalho da conversa, o composer e todos os botões de ação passaram a usar a geometria padrão (raio 8, altura 34, peso 600).

  No meio da conversa, o divisor de datas virou pílula de fundo sólido, as bolhas perderam a cauda assimétrica em favor de raio uniforme, e a nota interna segue o card âmbar tracejado da referência. O painel lateral ganhou seções separadas por filete, títulos na caixa normal (sem caixa alta) e cartões de raio 10.

  Nada muda em atalho, regra ou permissão — só a cara. Ninguém precisa fazer nada para receber isto.

## [1.16.0] — 2026-09-28

### Alterado

- **Modo claro no topo, seletor de mês na Evolução de Vendas e inbox redesenhado** O CRM ganhou um **alternador de tema no cabeçalho** (ao lado do sino): um clique passa do modo escuro para o claro e lembra a escolha. O modo claro foi refinado de ponta a ponta — fundo cinza-frio onde os cards brancos saltam, bordas e sombras em camadas —, e agora nenhum canto do produto ignora mais o tema.

  A seção **Evolução de Vendas** (home e indicadores) ganhou **seletor de mês**: as setas ao lado do título voltam e avançam no tempo, mostram o mês escolhido e param no mês corrente; o filtro de vendedor é mantido ao navegar. No gráfico, **passe o mouse sobre qualquer dia** para ver o dia, o acumulado, a meta do dia, a projeção e como foi o mesmo dia no mês e no ano passado — e em meses já encerrados nada mais finge que ainda acontece.

  O **inbox foi redesenhado** para a mesma linguagem visual do restante: o fundo da conversa agora acompanha o tema (acabou o bege fixo no modo escuro), a lista de conversas vira linhas de chat com filete de destaque, o divisor de datas e o selo de status viraram pílulas, e o campo de escrito e as abas do composer seguem o padrão do produto. Nada muda em atalho, regra ou permissão — só a cara. Ninguém precisa fazer nada para receber isto.

## [1.15.1] — 2026-09-28

### Corrigido

- **A limpeza das autorizações de agenda usadas volta a rodar** A limpeza diária das autorizações de agenda já usadas e vencidas — a que impede que uma autorização capturada seja reaproveitada — falhava todos os dias e não apagava nada, e a tabela só crescia. A causa era um nome: a rotina pedia a limpeza por `p_retencao_dias`/`p_limite`, como faz com as outras podas, e a função do banco tinha sido criada com outro nome de parâmetro, então o banco não encontrava a função e devolvia erro antes de apagar. De quebra, a rodada inteira de limpeza era registrada como falha no histórico, escondendo as contagens do que já tinha sido apagado logo antes. Agora os dois lados falam a mesma língua, e a instalação que já existe recebe o conserto na atualização — não só as novas. Nada muda na tela e ninguém precisa fazer nada: o que passa a acontecer é a limpeza que a instalação já tinha contratado.

## [1.15.0] — 2026-09-28

### Alterado

- **NEXUS 2.0 — redesign das telas, Evolução de Vendas nova e nome do cliente nas recomendações** A interface passou por uma varredura completa (fases 0 a 8): cabeçalhos, abas, KPIs, gráficos, formulários e barra de filtros agora seguem um padrão único em todas as telas do CRM e do admin, com estados de erro consistentes e a navegação medida em 207 combinações de tela sem estourar o layout. A auditoria de rotas confirma 106 rotas varridas sem violações.

  A seção "Evolução de Vendas" da home e de /app/indicadores foi redesenhada: coluna de KPIs com Meta, Projeção e Previsão (com régua da meta e o quanto falta no dia), gráfico com marcador de hoje, projeção só para o futuro, painel de resumo do mês e faixas de 1 dia, 1 semana, 1 mês e tudo. O botão "Comparar" do painel liga as séries de mês e ano anteriores quando há base, com o mesmo estado do filtro das telas.

  As Recomendações do Sales Brain agora mostram o nome do cliente ao lado de cada sugestão (no meu dia e na inteligência), e a tela de produtos recuperou os botões "Importar planilha" e "Novo produto" que a navegação em abas escondia.

## [1.14.0] — 2026-09-23

### Adicionado

- **Importar leads de uma planilha** A lista de clientes que já está no Excel agora entra no funil sem digitação. Em
  **Funis**, o botão "Importar planilha" pede um arquivo CSV e cria um negócio por
  linha, na primeira etapa do funil escolhido.

  O importador reconhece os cabeçalhos usuais — nome, telefone, e-mail, valor,
  origem, tags, observação — em português, com ou sem acento, e aceita o
  ponto-e-vírgula que o Excel brasileiro usa. Valor escrito como "R$ 1.200,00"
  entra certo.

  Quando a planilha traz telefone, o contato é criado junto e ligado ao negócio —
  e o mesmo número repetido em várias linhas vira um contato só, não vários.

  Nada é aceito no escuro: ao terminar, a tela mostra quantos negócios entraram,
  quantos contatos foram criados, quais colunas o importador não reconheceu e
  quais linhas foram recusadas, com o motivo e o número da linha como você a vê na
  planilha. Uma linha com erro não derruba as outras.

  Há uma planilha modelo para baixar, para quem prefere começar do formato certo.

  Isto veio da contribuição de James, da Clínica Centro do Sorriso
  (**@clinicacentrodosorrisosc-code**).

- **Dashboard home, Financeiro redesenhado e radar com vocabulário restaurado** Entrar no app agora abre uma **home de verdade** em vez de cair direto no Inbox: o logo no topo do menu virou a porta dela. O item ativo do menu ficou mais discreto — um filete ao lado em vez do bloco colorido — e o **Financeiro** ganhou o visual novo.

  No **Radar**, as situações de recompra voltaram a falar a língua do time ("Recompra atrasada", "Em voo") em vez de códigos genéricos, e a lista de alertas ganhou filtro por situação. Na **Agenda**, o histórico e a grade dividem a tela sem uma esmagar a outra, e os marcadores do mapa da **Prospecção** aparecem mesmo quando a lista chega antes do mapa carregar.

  Na parte invisível: a cascata da LGPD agora alcança contatos guardados na prospecção e no fiscal, e a exportação de dados do titular nomeia o controlador e o DPO no PDF.

### Corrigido

- **O painel de IA para de avisar que um modelo não enxerga imagens quando ele enxerga** Duas informações erradas no painel de provedores, e as duas faziam quem opera
  tomar decisão contra o que o sistema realmente faz.

  **A primeira:** o painel avisava que um modelo "não enxerga imagens" e que fotos
  e comprovantes do cliente seriam ignorados — sobre modelos que enxergam, e num
  sistema onde a leitura estava funcionando. Na mesma instalação em que o aviso
  aparecia, o print que o cliente enviou virou descrição correta para o atendente.

  O painel lia uma tabela de catálogo; o atendimento lia outra coisa. Agora os
  dois respondem pela mesma fonte, e o painel não pode mais discordar do que
  acontece de verdade. Onde o sistema não conhece o modelo — o seu, ou um de um
  serviço próprio —, o catálogo continua sendo a resposta, e a falta de informação
  continua sendo dita como falta de informação, não como "não funciona".

  **A segunda:** quem usa a OpenRouter tinha o problema INVERTIDO — e ele é pior,
  porque não tem sintoma. Ali o sistema não sabia dizer se um modelo enxerga: ele
  olhava só o começo do nome. Como `openai/gpt-4o` enxerga e `openai/gpt-3.5-turbo`
  não, e os dois começam igual, um palpite pelo começo do nome erra metade das
  vezes — e a OpenRouter já informa a resposta certa, modelo por modelo, quando o
  catálogo é sincronizado na instalação.

  O efeito prático era duplo. O painel deixava de avisar quando o aviso era
  verdadeiro, então quem opera achava que o comprovante do cliente estava sendo
  lido e não estava. E o atendimento chegava a enviar a imagem para um modelo que
  não a aceita, o que fazia a resposta daquela mensagem falhar. Agora, quando a
  OpenRouter informa a capacidade, é ela que vale — e quando não informa, o
  sistema volta a dizer que não sabe, em vez de afirmar.

  **A terceira:** o ponto "Ouvir o áudio do cliente" mostrava um modelo de
  conversa, com "usando o padrão da organização" — ao lado do próprio texto do
  ponto, que diz que a transcrição usa o padrão da OpenAI. A mesma tela afirmava
  duas coisas incompatíveis, e modelo de conversa não transcreve áudio.

  Agora ele mostra o que de fato transcreve. Trocar o modelo de conversa nunca
  mudou nada ali; o que muda é a tela parar de sugerir que mudaria.

  Para quem opera uma instalação, nada muda no dia a dia: nenhuma configuração
  nova, nenhum passo de atualização. O que muda é que o painel volta a descrever
  o sistema que está rodando.

## [1.13.0] — 2026-09-04

### Alterado

- **O CRM instala em Postgres 15, não só em 17** Até agora a instalação exigia Postgres 17. Quem tentasse usar um banco 15 ou 16
  — o padrão de boa parte dos painéis de VPS e dos templates prontos de Supabase
  — via a montagem do banco parar no meio, e a instalação terminava sem as
  tabelas.

  A exigência nunca foi uma decisão de projeto. O arquivo que monta o banco é
  gerado automaticamente a partir de um servidor de referência, e esse servidor
  rodava a versão 17; ao ser gerado, o arquivo levou junto nove linhas com uma
  permissão que só existe nessa versão. Nenhuma parte do sistema usa essa
  permissão. Bastava o banco não reconhecê-la para o arquivo inteiro ser
  recusado — e um arquivo recusado é um banco vazio, não um banco incompleto.

  As nove linhas saíram. A permissão que sobrou em cada uma é exatamente a mesma
  de antes, então nada muda no comportamento nem na proteção das tabelas de
  auditoria, que continuam não aceitando alteração nem exclusão.

  Quem já roda o CRM não precisa fazer nada: o Postgres 17 segue funcionando
  igual. O que mudou é que 15 e 16 passaram a funcionar também.

### Corrigido

- **A busca do Inbox passa a achar pelo nome e pelo telefone do cliente** Digitar o nome de um cliente na caixa de busca do Inbox não trazia a conversa
  dele — a busca olhava só o texto das mensagens. Na prática, achar uma conversa
  pelo nome só funcionava por acidente: se o nome tivesse sido escrito dentro de
  alguma mensagem.

  Para quem atende, procurar pelo nome é o caso mais comum — bem mais frequente
  que lembrar um trecho exato de mensagem. E com alguns milhares de contatos
  importados, a única alternativa era rolar a lista.

  Agora a busca cobre nome, telefone e o texto das mensagens ao mesmo tempo. O
  campo passa a dizer isso, em vez de prometer só mensagens.

  Contato anonimizado continua fora da busca por nome — anonimizar é definitivo.

- **A inteligência artificial não se cala mais por três horas depois de responder** Sempre que o CRM enviava uma mensagem pelo WhatsApp, o próprio WhatsApp
  devolvia um eco dela de volta. O sistema lia esse eco como se um atendente
  humano tivesse respondido pelo celular, e **desligava a IA por três horas.**

  Ou seja: a IA se calava por ter falado. O cliente ficava sem resposta e a tela
  mostrava **"Automático pausado"** — estado legítimo, que ninguém investiga,
  porque é exatamente o que aparece quando alguém assume a conversa de propósito.

  Atingia qualquer instalação e qualquer conversa, sem depender de configuração.

  Agora o sistema distingue o eco do próprio envio de uma digitação de verdade. E
  a distinção só protege o silêncio: a mensagem continua sendo gravada como
  sempre, porque perder uma mensagem é pior do que registrar uma a mais.

  Quando o atendente responde mesmo pelo celular, a IA continua se calando — essa
  parte não mudou.

- **A proteção de envio volta a salvar sem a data do número** Em **Conexões › Proteção de envio**, ajustar o horário de envio e salvar sem
  preencher "este número é usado desde" devolvia *"Falha ao salvar os knobs."* e
  não gravava nada — nem os campos que você tinha acabado de mudar.

  Isso atingia toda instalação nova, porque essa data começa em branco. E a
  armadilha era dupla: sem os limites salvos, o sistema trata o número como
  recém-criado e libera pouco por dia — exatamente o teto que a pessoa abriu a
  tela para corrigir.

  Agora o campo em branco significa o que a tela sempre prometeu: em número novo,
  ele é tratado como recém-criado. E, se você já tinha informado uma data antes,
  limpar o campo não a apaga — para trocá-la, informe outra. O texto de ajuda da
  tela passa a dizer isso.

  Junto vai um conserto de diagnóstico: quando o banco recusa um campo, o motivo
  passa a viajar junto do erro em vez de virar um "falha ao salvar" sem dono.

- **A atualização volta a chegar quando alguém aprova outra coisa durante o fechamento da versão** Uma versão do sistema é fechada em duas etapas: primeiro o time monta a lista do
  que entrou, depois aprova essa lista. Entre uma coisa e outra, qualquer outra
  melhoria aprovada no meio do caminho fazia o fechamento **desistir em silêncio**
  — a versão aparecia na lista de novidades, mas nunca era publicada de verdade.

  O efeito para quem tem o sistema instalado era o pior tipo: nada de errado
  aparecia em lugar nenhum. O painel não acusava, o histórico de versões mostrava
  a versão nova como se existisse, e a atualização simplesmente nunca chegava. Foi
  o que aconteceu com a versão 1.11.1: ela consta no histórico desde 31 de agosto e
  nunca existiu como pacote — nenhuma instalação a recebeu.

  Agora o fechamento reconhece a si mesmo por outro sinal, que não depende de o
  resto do time parar de trabalhar enquanto a versão fecha. E, se alguma coisa
  estranha acontecer nesse momento, o processo **falha alto** em vez de passar
  batido — que é o que teria feito alguém perceber a 1.11.1 no mesmo dia, e não
  duas semanas depois.

  Para quem opera uma instalação, nada muda no dia a dia: nenhuma configuração
  nova, nenhum passo de atualização. O que muda é que "a versão saiu" volta a
  significar que ela saiu.

- **Áudio que demora para transcrever não faz mais o agente dizer "não entendi"** Um cliente mandou um áudio perguntando sobre troca de peça de uma moto elétrica. A
  transcrição terminou certinha — mas 18 segundos tarde demais: o agente já tinha
  respondido "recebi seu áudio, mas não consegui identificar o conteúdo", e o cliente
  teve que digitar a pergunta de novo.

  A causa era um teto fixo de 45 segundos de espera pela transcrição antes de o turno
  seguir sem o texto. Medindo as transcrições reais desta instalação, 45s não é raro
  de estourar em áudios normais — só é curto demais para a cauda longa (minutos, quando
  há retry por falha transitória), que nenhum teto razoável cobre sem o cliente esperando
  minutos pela primeira resposta.

  O teto passou para 120 segundos, o suficiente para cobrir esse tipo de atraso comum sem
  impor uma espera longa em todo áudio. Para quem opera uma instalação, nada muda no dia
  a dia.

- **Uma instabilidade passageira do provedor de IA deixa de matar o atendimento na primeira rajada** Quando o provedor de IA responde "calma, você está mandando rápido demais" — um
  limite temporário que costuma passar sozinho em menos de um minuto —, o sistema
  tenta de novo. Ele tinha direito a cinco tentativas, e usava as cinco no mesmo
  segundo: a conversa voltava para a fila já liberada, era pega outra vez na
  mesma volta, e assim por diante. O limite não teve um instante sequer para
  ceder, e a conversa ia para a lista de casos que precisam de gente com um aviso
  crítico na Central.

  Medido numa instalação real em 31/08: 49 atendimentos descartados em rajadas de
  poucos segundos, todos pelo mesmo motivo passageiro.

  Agora cada nova tentativa espera mais que a anterior — 10 segundos, depois 20,
  depois 40, depois 80 —, o que dá ao provedor tempo de se recuperar antes da
  próxima. Na prática, a instabilidade que antes queimava as cinco chances em um
  segundo agora tem mais de dois minutos para passar, e o atendimento continua
  sozinho quando ela passa.

  Para quem opera, nada muda: não há configuração nova, nenhum passo de
  atualização e nenhum ajuste no arquivo de ambiente. O que muda é a Central
  ficar com os avisos que importam, em vez de encher de casos que se resolveriam
  sozinhos.

- **O endereço interno do seu servidor deixa de aparecer na página pública de saúde** O sistema tem um endereço público que responde se ele está de pé — usado por
  monitoramento e pelo suporte. Ele já era cuidadoso: escondia de quem não tem a
  chave interna o endereço da conexão do WhatsApp e do serviço de fila, porque
  esse endereço é justamente o que alguém precisaria para tentar bater na porta
  deles.

  O cuidado tinha um furo. Quando o arquivo de configuração ficava com o endereço
  numa forma inválida — sem o `https://` na frente, ou com aspas sobrando, que são
  os dois erros mais comuns de quem instala —, a mensagem técnica da falha vinha
  com o endereço dentro, e essa mensagem **saía por inteiro** para qualquer pessoa
  que abrisse a página. O sistema fechava a porta da frente e deixava a mesma
  informação na janela do lado.

  Agora quem não tem a chave interna vê apenas que a consulta falhou, e **por quê**:
  se não achou o servidor, se foi recusado, se demorou demais, se a
  credencial não passou. Isso é o que serve para monitorar. O texto técnico
  completo continua saindo inteiro para quem tem a chave, que é quem precisa dele
  para consertar.

  Para quem opera, nada muda: nenhuma configuração nova, nenhum passo de
  atualização. Se você tinha algum alerta lendo o texto da mensagem de erro, ele
  passa a ler o motivo em vez do texto.

  O achado é de @prevprocesso-maker, que percebeu o furo instalando o sistema para
  um cliente.

- **Instalar pelo canal padrão não mistura mais versões entre os serviços** O DeskcommCRM roda três serviços que saem do mesmo código — o aplicativo, o
  trabalhador de fundo e o agendador. Quem instala pelo canal padrão espera os
  três na mesma versão.

  Até agora cada um deles avançava o canal por conta própria, ao terminar de ser
  publicado, sem saber se os irmãos tinham conseguido. Quando a publicação de um
  falhava por um problema de infraestrutura, os outros dois seguiam em frente — e
  quem instalasse naquela janela recebia uma instalação **misturada**, com peças
  de versões diferentes. Aconteceu de verdade no fechamento da versão anterior.

  Agora o canal só avança depois que as três imagens estão publicadas e o
  aplicativo provou que sobe. Se qualquer uma falhar, o canal fica onde estava —
  uma versão inteira e velha, em vez de uma nova pela metade.

  E o fechamento de cada versão passa a conferir isso antes de dar por concluído:
  não basta as imagens existirem, o canal precisa apontar para elas.

  Nada muda para quem já tem uma instalação funcionando.

- **Loja com catálogo grande volta a achar o próprio produto** Numa loja com muitos produtos cadastrados, o atendente de IA podia responder
  **"não temos"** para um produto que a loja tem. E não havia como perceber: a
  resposta era educada, o sistema não registrava erro nenhum, e o mesmo produto às
  vezes aparecia na busca seguinte.

  A causa é que a busca consultava um lote do catálogo sem definir a ordem. Sem
  ordem, o banco devolve as linhas que quiser — e o produto pedido podia
  simplesmente não estar no lote que veio. O limite real também era metade do que
  o sistema pedia.

  Agora a busca percorre o catálogo em páginas, na ordem do código, até encontrar
  ou terminar. E, se o catálogo for grande demais para varrer inteiro, o atendente
  **para de dizer que a loja não tem**: ele diz que não encontrou no que
  conseguiu consultar e que vai confirmar com a equipe.

  A diferença importa para quem está comprando: "não temos" encerra a conversa,
  "vou confirmar" não.

- **Fechar um negócio parou de avisar duas vezes, e o card não some mais numa coluna arquivada** Toda vez que alguém marcava um negócio como ganho ou perdido, o sistema
  registrava o acontecimento **duas vezes**: uma pelo banco, que já fazia isso
  sozinho, e outra pelo aplicativo, que não sabia que o banco já tinha feito.
  Enquanto ninguém escutava esse registro, a duplicata era só ruído guardado. Ela
  deixou de ser inofensiva quando as notificações no navegador passaram a escutar
  exatamente esse aviso — daí em diante, um único negócio fechado tocava duas
  vezes no celular de quem estava acompanhando.

  Junto vinham duas coisas menores e do mesmo tipo, do jeito silencioso que
  incomoda mais do que erro barulhento:

  - Um funil cujo estágio de fechamento tinha sido **arquivado** continuava sendo
    usado. O negócio era fechado numa coluna que ninguém mais vê, sem aviso
    nenhum. Agora o sistema recusa e diz que falta um estágio de fechamento no
    funil, que é o que de fato está acontecendo.
  - O card fechado caía em **posição aleatória** na coluna final, em vez de ir para
    o fim dela. Quem trabalha olhando o quadro perdia o negócio de vista.

  Para quem opera, nada muda no dia a dia: nenhuma configuração nova, nenhum passo
  de atualização, nenhum dado a corrigir. O que muda é que o aviso passa a sair uma
  vez, e que fechar num funil mal configurado avisa em vez de sumir.

  O achado é de @prevprocesso-maker, que instalou o sistema para um cliente e
  percebeu a emissão em dobro lendo o próprio código.

- **O atendente de IA passa a enxergar os compromissos já marcados do cliente** O atendente de IA marcava uma reunião e, minutos depois, agia como se ela não
  existisse: dizia que o horário estava ocupado por outra pessoa quando o ocupante
  era a reunião do próprio cliente.

  A causa é simples: o contexto que o agente recebe a cada mensagem trazia o
  histórico, as anotações e o estágio do funil — e **nenhuma agenda**. Ele só
  sabia dos compromissos se fosse consultá-los, e não tinha por que desconfiar de
  que precisava.

  Agora o contexto de cada conversa traz os compromissos futuros daquele contato,
  com data, horário e título. Se houver mais do que cabe, ele diz que a lista está
  incompleta em vez de deixar o agente concluir que aquilo é tudo.

  Compromissos cancelados ficam de fora: um compromisso desmarcado nessa lista
  faria o agente confirmar ao cliente uma reunião que não existe mais.

- **O agente para de dizer que o cliente não tem nada marcado quando tem** O atendente de IA podia marcar uma reunião e, minutos depois, dizer ao próprio
  cliente que **ela não existia** — pedindo desculpas por tê-la marcado. Não havia
  erro em lugar nenhum: a consulta era válida e devolvia "nenhum compromisso", que
  é uma resposta legítima.

  A causa é um nome. Dentro do motor, o campo que identifica **a pessoa** da
  conversa se chama `lead_id` — mas nas ferramentas de agenda esse mesmo nome
  significa **o negócio no funil**, que é outra coisa. O agente passava o
  identificador da pessoa no lugar do negócio, a busca não encontrava vínculo
  nenhum e respondia "nada marcado".

  Agora, quando o identificador não corresponde a um negócio do funil, a resposta
  deixa de ser "nada marcado" e passa a ser uma **recusa que ensina o caminho certo**
  — e que instrui o agente a dizer que vai confirmar com a equipe, nunca
  que o cliente não tem nada.

  Um negócio de verdade sem compromissos continua respondendo "nada marcado", que
  é a resposta certa.

- **O agente para de repetir uma pergunta que o cliente já respondeu** Numa conversa real, o agente pediu o e-mail do cliente **quatro vezes** — com o
  cliente respondendo três. Para quem está do outro lado, isso não parece um
  sistema: parece desatenção.

  Eram duas causas somadas.

  A primeira: ao fechar cada turno, o agente anota qual é a "próxima ação". Como
  essa anotação é escrita logo depois de ele perguntar e antes de a resposta
  chegar, ele anotava como próxima ação **a pergunta que acabara de fazer**. No
  turno seguinte essa anotação voltava no topo das instruções, acima do histórico
  — e mandava perguntar de novo o que o histórico logo abaixo já respondia.

  A segunda: o cadastro do contato aparecia com o e-mail em branco, e o agente lia
  isso como um fato ("não tem e-mail"), com mais autoridade do que a mensagem em
  que o cliente tinha acabado de digitá-lo. E como esse campo nunca é preenchido
  sozinho, o pedido se repetia indefinidamente.

  Agora a anotação diz explicitamente que se refere ao **depois** da resposta, o
  bloco avisa que foi escrito antes da última mensagem do cliente — e que, em caso
  de desacordo, vale o histórico —, e o cadastro em branco vem com a ressalva de
  que a informação pode já ter sido dada na conversa.

- **Os avisos coloridos do sistema voltam a ter cor** Boa parte dos avisos do produto — o fundo avermelhado de um erro, o âmbar de uma
  pendência, a borda suave de um cartão — era escrita para aparecer com transparência
  e simplesmente **não pintava**: a regra nunca chegava a ser gerada, em silêncio.
  Eram 62 marcações distintas, em 252 lugares das telas. Agora pintam.

  Junto vem o respiro entre o rótulo e o campo nos formulários, que havia encolhido
  no mesmo mecanismo, e a sombra da aba selecionada, que passara a usar um preto
  fixo em vez do tom do tema — visível para quem usa o sistema no modo escuro.

  Onde a transparência era aplicada ao TEXTO, ela foi retirada em vez de passar a
  valer: em 20 lugares o texto ficaria claro demais para ser lido com conforto — os
  rótulos de grupo do menu lateral, entre outros. Esses continuam exatamente com a
  aparência que sempre tiveram na tela.

  Quem opera uma VPS não precisa fazer nada: é só atualizar. Nenhuma configuração
  muda, nenhum arquivo precisa ser editado à mão.

- **Um fluxo de retorno publicado não abre mais vazio na tela** Um fluxo de retorno que estava **no ar e funcionando** podia abrir **em branco**
  no construtor. A automação rodava normalmente e conversava com os clientes; a
  tela é que não mostrava nada.

  Acontecia quando o fluxo foi publicado por fora do construtor — restauração de
  backup, instalação assistida, importação de outra instalação. Nesses casos o
  sistema guarda a versão publicada mas não guarda uma cópia de trabalho, e a tela
  só sabia abrir a cópia de trabalho.

  **O risco era maior do que a tela vazia.** Quem abrisse, mexesse em qualquer
  coisa e salvasse estaria salvando por cima — com o desenho vazio que a tela
  mostrou. Um "publicar" depois disso trocaria o fluxo que está funcionando por
  esse vazio, sem aviso nenhum.

  Agora, quando não existe cópia de trabalho, a tela abre **exatamente o que está no ar**.
  Quem nunca editou vê o fluxo publicado; quem tem trabalho salvo e não publicado
  continua vendo o seu trabalho, que segue tendo prioridade.

  Para quem opera uma instalação, nada muda no dia a dia: nenhuma configuração
  nova, nenhum passo de atualização.

- **O limiar de sentimento passa a vir do agente que atende aquela conversa** Quem opera mais de um agente ajustava o campo "limiar de sentimento" de um deles
  e via o comportamento do outro. Os dois campos existiam, os dois aceitavam
  valor, e só um fazia efeito — o do agente mais antigo da organização, porque a
  conversa que disparou o alerta não entrava na conta.

  Com um agente só, o resultado era certo por acidente. Com dois, o limiar em
  vigor dependia da ordem em que eles foram criados, e não havia nada na tela que
  explicasse por quê.

  E o limiar certo é genuinamente diferente por agente: numa clínica, cliente
  triste é sinal de problema; numa assistência técnica, cliente triste é o cliente
  normal. Um número único para os dois erra nos dois sentidos — escala demais num
  caso, de menos no outro.

  Agora vale o limiar do agente que está atendendo aquela conversa. Quando não dá
  para dizer com certeza qual é — dois agentes e nenhum vínculo com a conversa —,
  vale o padrão do sistema, nunca o número do vizinho.

  O alerta gerado passa a registrar qual agente decidiu e por quê, para que a
  pergunta "por que este alerta saiu?" tenha resposta na própria linha.

- **O nome, a descrição e a ordem do agente passam a ser salvos de verdade** Na tela de um agente, trocar o **Nome** não mudava nada. A pessoa digitava,
  salvava, publicava — e o nome continuava o mesmo, no editor e na lista.
  **Descrição** e **Ordem de preferência** sumiam do mesmo jeito.

  O que tornava isso difícil de perceber é que nada falhava: o campo aceitava a
  digitação, o aviso verde dizia "Rascunho salvo", e a publicação respondia com
  sucesso. Todas essas mensagens eram verdadeiras — a respeito da **versão**, que
  era a única coisa realmente gravada. Recarregar a página não ajudava, porque o
  valor nunca chegou a ser gravado.

  Agora os três são salvos junto com o rascunho, e a lista de agentes reflete o
  nome novo na hora.

  Dois detalhes que vêm junto: apagar a descrição realmente a apaga (antes o campo
  vazio seria interpretado como "não mexi"), e uma ordem de preferência fora de
  0 a 1000 é avisada embaixo do campo, em vez de virar erro genérico depois.

- **"Quero 2 iPhone 15" volta a encontrar o iPhone 15** Quando o cliente escrevia um número que não é característica do produto — a
  quantidade que ele quer, quanto pretende gastar —, o atendente de IA respondia
  que **não encontrou nada**. "Quero 2 iPhone 15" e "tenho 3.000 pra gastar num
  iPhone" voltavam vazias, mesmo com o produto no catálogo.

  É o pior momento para dizer "não encontrei": a pessoa estava comprando.

  A causa era a regra que impede o erro mais caro da busca — quem pergunta do
  128GB não pode receber o preço do 256GB. Para isso, o número que o cliente diz
  precisa bater exatamente. Só que **todo** número era tratado assim, inclusive os
  que não descrevem produto nenhum.

  Agora o próprio catálogo decide: um número só restringe a busca se ele existir
  em algum produto. "128" existe, então continua separando os modelos. "2" não
  existe em produto nenhum, então é quantidade — e quantidade não esconde nada.

  A proteção continua inteira no caso que importa: quem pede uma capacidade que a
  loja não tem continua recebendo "não temos", e nunca o modelo parecido com
  preço diferente.

  Para quem opera uma instalação, nada muda no dia a dia.

- **O prompt que você salva passa a ser o que o agente realmente executa** Editar as instruções de um agente **já publicado** e salvar mostrava o texto novo
  na tela — enquanto o agente continuava atendendo no WhatsApp com o texto
  anterior. Não havia erro, nem aviso: quem editava concluía que a mudança estava
  no ar, e ela não estava.

  A causa é que existem dois lugares onde as instruções podem morar: o cadastro do
  agente e a **versão publicada**. Quem atende o cliente é a versão. A tela mandava
  alguns agentes para o editor antigo, que grava no cadastro — o lugar que o
  atendimento não lê quando há versão publicada.

  Agora quem tem versão publicada é levado direto ao editor de versões, que grava
  onde o atendimento lê. E, se alguma outra ferramenta tentar mudar as instruções
  ou o modelo pelo caminho antigo, a resposta passa a ser um erro que explica o
  caminho certo, em vez de um sucesso que não teve efeito.

  Agente sem versão publicada continua exatamente como estava.

- **Título de novidade com aspas no meio chega inteiro à tela de atualização** O texto que descreve cada novidade é lido por quem opera a instalação, na tela
  de atualização, antes de decidir atualizar. Um título que citasse uma frase
  entre aspas chegava lá **torto**: a aspa de abertura sumia e a do meio ficava
  solta, como se o texto estivesse cortado.

  Num sistema de atendimento, citar o que o cliente escreve é o caso natural de um
  título — não a exceção. O primeiro título que precisou disso já saiu errado.

  Agora aspas no meio do texto são preservadas, e só somem quando envolvem o
  título inteiro — que é como alguém escreveria para "escapar" o texto.

  Nada muda no dia a dia de quem opera: nenhuma configuração nova, nenhum passo de
  atualização.

- **Um WhatsApp fora do ar deixa de pendurar a tela até o navegador desistir** Quando o serviço que conversa com o WhatsApp fica indisponível, o CRM ficava
  esperando por ele sem limite. A tela de conexão girava, o envio não voltava, e o
  único desfecho era o navegador ou o servidor desistirem sozinhos, minutos depois
  e sem explicação.

  O caso ruim não é o serviço recusar a conexão — isso já dava erro na hora. É o
  serviço aceitar e nunca responder, que é o que acontece quando ele está
  sobrecarregado ou travando: dali não vinha erro nenhum, só espera.

  Agora toda conversa com esse serviço tem prazo. Passou do prazo, o CRM desiste e
  diz que foi o tempo — em vez de deixar você olhando para uma tela parada sem
  saber se funcionou.

  Envio de áudio e vídeo tem prazo maior, de propósito: eles são convertidos antes
  de sair, e cortá-los no mesmo tempo de uma mensagem de texto faria mensagem
  legítima deixar de ser enviada.

- **Planilha exportada do Excel com acento entra inteira, sem virar caractere estranho** O Excel em português salva planilha num formato de texto antigo, e é o padrão
  dele — quem exporta a lista de produtos ou de contatos quase sempre manda esse
  arquivo. O sistema lia todos como se fossem do formato moderno, e o resultado
  dependia de onde estava o acento.

  Quando o acento estava nos **dados**, era o pior caso: a importação dizia
  "pronto, N produtos importados" e o catálogo ficava com nomes como
  `A��o C�nica` — sem um erro sequer. É esse nome corrompido que o atendente de IA
  lia em voz alta para o cliente, e ninguém confere linha a linha numa lista de
  300 itens.

  Quando o acento estava no **cabeçalho**, o arquivo inteiro era recusado com uma
  mensagem ilegível.

  Agora o sistema identifica o formato pelo próprio conteúdo do arquivo e lê os
  dois corretamente — sem você precisar reexportar nada. Vale para a importação de
  produtos e para a de contatos.

  E um arquivo que não é planilha de texto (um `.xlsx` renomeado, por exemplo)
  passa a ser recusado com a instrução do que fazer, em vez de virar centenas de
  linhas ilegíveis no seu catálogo.

- **Quem não é administrador volta a ver a lista de credenciais de IA** Um membro da equipe que não é administrador abria **IA › Provedores** e via a
  lista **vazia** — concluindo que a organização não tinha nenhuma chave
  cadastrada, quando tinha.

  Não havia erro nem aviso: a tela respondia normalmente, só que sem nenhuma
  linha. É a pior forma de falhar, porque parece uma informação verdadeira.

  A causa foi um ajuste de segurança anterior, que fechou a **escrita** dessas
  credenciais para quem não é administrador — e, sem querer, fechou a **leitura**
  junto. A tela de provedores é somente-leitura para esses papéis e nunca deveria
  ter sido afetada.

  Agora a leitura volta a valer para todo membro da organização, e a escrita
  continua restrita a administrador, como estava.

  A chave em si segue protegida: ela nunca foi exposta por essa tela, e continua
  inalcançável para qualquer papel — inclusive para quem passou a enxergar a
  lista.

- **A tela de chaves de IA explica o que deu errado e mostra quantos modelos a chave alcança** Quem colava uma chave de IA e errava via um código (`auth_failed_401`) no
  lugar de uma explicação, e quem acertava via a lista de modelos inteira colada
  por vírgula onde deveria haver um número. Se o servidor reiniciasse no meio da
  validação, o cartão dizia "Validando…" para sempre.

  Agora o cartão diz em português o que aconteceu ("O provedor recusou a chave.
  Confira se copiou inteira ou gere uma nova."), com o link para gerar outra;
  mostra a contagem de modelos; e, passados dois minutos sem resposta, troca
  "Validando…" por "Não validada" com a dica de revalidar. O diálogo de adicionar
  passa a dizer quando usar cada provedor, onde a chave mora e como ela começa.
  O botão de excluir só fica bloqueado quando a chave está de fato numa versão
  publicada de agente — a mesma regra que a API já usava.

  Nenhuma configuração nova, nenhum passo de atualização.

## [1.12.0] — 2026-09-02

### Adicionado

- **Catálogo de produtos próprio — com o preço que a IA responde ao cliente** Quem vende produto agora tem onde cadastrar o que vende. Antes, o único catálogo
  do sistema era o espelho de uma loja Nuvemshop: quem não usa Nuvemshop — a loja
  de rua, o showroom, quem vende pelo WhatsApp e só — não tinha lugar nenhum para
  pôr preço, e o agente de IA respondia "vou confirmar com a equipe" para a
  pergunta mais comum que existe, que é "quanto custa".

  Há uma tela nova em **Produtos**, no menu do CRM. Dá para cadastrar um a um, e dá
  para **importar a planilha que a loja já tem** — o arquivo do Excel, com os
  nomes de coluna que ela já usa (`código` ou `sku`, `preço` ou `valor`,
  `estoque` ou `qtd`). Reimportar a mesma planilha com preços novos **atualiza** os
  produtos em vez de duplicar, que é o gesto real de quando o custo muda.

  A importação recusa em vez de adivinhar. Uma linha com preço que não dá para ler
  não entra, e o relatório diz qual linha e qual foi o texto encontrado — um chute
  aqui vira preço errado dito a um cliente três dias depois. As linhas boas entram
  mesmo assim: uma planilha de 300 itens não morre inteira por causa da linha 7.

  Para a IA, a diferença é maior do que parece. A busca dela entende o cliente que
  escreve "ifone 15 128" e devolve exatamente o modelo de 128GB — nunca o de
  256GB, mesmo sendo quase o mesmo texto, porque é aí que o preço sai errado. E
  quando dois produtos casam igualmente bem, ela **pergunta** em vez de escolher.

  Só quem é gerente ou administrador altera preço; quem atende lê. Nada muda para
  quem já usa a integração com Nuvemshop — aquele catálogo continua onde estava.

### Corrigido

- **O segundo material que você ensina ao agente volta a funcionar** Ensinar mais de um documento ao mesmo assistente não funcionava, e **não havia como perceber**:
  o primeiro material era lido normalmente, e do segundo em
  diante a tela mostrava "pronto" enquanto o conteúdo nunca ficava disponível para
  a busca. O assistente respondia "não encontrei isso" sobre uma coisa que estava
  escrita num arquivo que você subiu — e nenhum aviso aparecia em lugar nenhum.

  Medido numa instalação real: cinco documentos enviados para o mesmo assistente,
  um funcionou, quatro ficaram parados. Os cinco apareciam como concluídos.

  A causa era interna: a numeração das versões do acervo passou a contar por
  documento, mas a regra do banco continuava contando por assistente — então o
  segundo documento sempre esbarrava no primeiro. Não era intermitente; nunca
  funcionava.

  Agora cada material tem a própria contagem, e os materiais antigos continuam
  válidos como estavam. Se você já subiu documentos que ficaram parados, basta
  reenviá-los depois de atualizar.

  Para quem opera uma instalação, nada muda no dia a dia: nenhuma configuração
  nova, nenhum passo de atualização.

- **O preço da planilha deixa de entrar dez vezes maior no catálogo** O catálogo de produtos aceita uma planilha para a loja não ter de cadastrar item
  por item. A leitura do preço tinha um erro de escala nas duas formas mais comuns
  de uma planilha brasileira chegar.

  **Um centavo escrito com um dígito só.** Quando a célula está formatada como
  número e mostra `1.299,90`, o Excel grava `1299,9` no arquivo — ele corta o zero
  do fim. O sistema lia esse único dígito como separador de milhar e gravava
  **R$ 12.999,00** no lugar de R$ 1.299,90. Dez vezes o preço, sem recusar a linha
  e sem avisar ninguém — e é esse preço que o atendimento automático responderia ao
  cliente.

  **Uma observação escrita ao lado do preço.** Quem escreve `R$ 5.499,00 (promo até
  10)` na mesma célula via os dígitos da observação grudarem no valor, e o produto
  entrava a R$ 54.990.010,00.

  Agora um ou dois dígitos depois da vírgula são sempre centavos — grupo de milhar
  tem sempre três, então um grupo menor não pode ser outra coisa. E célula com
  qualquer texto junto do número passa a ser **recusada**, com a linha apontada no
  relatório e a instrução de como escrever, em vez de virar um número plausível que
  ninguém confere numa lista de 300 itens.

  Para quem opera, nada muda: nenhuma configuração nova, nenhum passo de
  atualização. E nenhum catálogo precisa ser corrigido — o conserto sai na mesma
  versão que traz a importação de planilha, então nenhuma loja chegou a importar
  com o preço errado.

- **O atendimento automático não responde mais por cima de uma conversa entregue a uma pessoa** Quando a IA decide que um caso precisa de gente — cliente irritado, suspeita de
  pedido de descadastro, termo delicado —, ela entrega a conversa e silencia o
  atendimento automático até alguém resolver. A tela mostrava esse estado
  corretamente ("Automático pausado"), mas um segundo motor de resposta, que ainda
  atende instalações sem agente publicado, continuava respondendo assim mesmo.

  O resultado aparecia como o pior tipo de contradição: o painel dizia que uma
  pessoa ia assumir, o cliente recebia mensagem de robô, e ninguém do time ficava
  sabendo. A causa era uma comparação de datas que nunca dava certo para o valor
  "para sempre" que o produto usa nesses casos — a proteção existia no código e
  nunca chegava a agir.

  Agora os dois motores usam a mesma regra, a mesma que move a tela. Para quem
  opera, nada muda no dia a dia: nenhuma configuração nova, nenhum passo de
  atualização. O que muda é que "entreguei para uma pessoa" passa a valer de fato.

## [1.11.1] — 2026-08-31

### Corrigido

- **A Fila mostra quem realmente espera uma pessoa, e a aba do automático deixa de ficar vazia** A Inbox dizia quem estava no comando de cada conversa olhando um campo que o
  atendimento automático nunca consulta. O efeito era grande e silencioso: a aba
  **Fila** listava como "aguardando atendente" conversas que o robô estava
  respondendo naquele instante, e a aba do automático ficava quase vazia mesmo com
  ele atendendo a maior parte da caixa. Numa instalação real, medido: a Fila
  mostrava 83 conversas, a aba do automático mostrava 2, e o robô atendia 47.

  Quem via isso concluía a coisa errada em qualquer direção — ou que havia uma
  montanha de gente esperando, ou que a IA tinha parado de trabalhar.

  Agora as duas abas perguntam a mesma coisa que o motor: quem responde a próxima
  mensagem deste cliente. A Fila passa a listar só o que precisa de uma pessoa de
  verdade — conversas que a IA escalou, contatos travados para atendimento humano —
  e a aba do automático mostra o que ele está de fato conduzindo.

  **O número da Fila vai encolher bastante no primeiro acesso depois de atualizar.**
  Isso é o número certo aparecendo, não trabalho sumindo.

  A mesma correção alcança o "você é o Nº da fila" que o cliente ouve pelo WhatsApp,
  a numeração na tela e o painel de espera do gerente — os três passam a contar a
  mesma fila. Antes eles podiam divergir entre si.

  Para quem opera: nada a fazer. Nenhuma configuração nova, nenhum passo de
  atualização, nenhum dado alterado — só a leitura de quem está no comando.

- **Reclamar de cobrança errada não bloqueia mais o cliente** Quem escrevia "não me mande mais boletos" — ou "no me manden más cobros
  duplicados" — era tratado como se tivesse pedido para sair, e parava de ser
  atendido. É o oposto do que a pessoa quis dizer: ela está reclamando de uma
  cobrança e quer continuar falando com você.

  A regra olhava só o verbo ("mandar"), que é o mesmo de "não me mande mais
  mensagens". Agora ela olha também o que vem depois: quando o objeto é uma
  cobrança, uma fatura, um pedido ou um produto, deixa de ser pedido de saída.

  Pedir para sair de verdade continua funcionando igual, nas duas línguas.

- **O atendente de IA volta a achar horário quando consulta a agenda** Numa clínica, o atendente de IA tentou marcar um procedimento e não conseguiu —
  duas vezes seguidas. Ele fez tudo certo: descobriu o tipo de atendimento,
  resolveu a data que a pessoa pediu e foi consultar os horários. Mesmo assim
  respondeu que a equipe precisava confirmar, e abriu um chamado interno.

  A causa não era a agenda nem o atendente. Quando a IA não tem um dado opcional
  para preencher — no caso, qual profissional atenderia —, alguns modelos escrevem
  um código vazio em vez de simplesmente não mandar o campo. O sistema aceitava
  esse código como se fosse um profissional de verdade, procurava a agenda de
  alguém que não existe, e concluía que não havia horário publicado. Nenhum erro
  aparecia em lugar nenhum: a consulta era registrada como bem-sucedida.

  O sistema agora reconhece esses códigos vazios e os ignora, voltando a usar o
  profissional configurado no tipo de atendimento. Isso valia para dezenas de
  lugares além da agenda — inclusive a busca no acervo de conhecimento, em que o
  efeito era o atendente responder "não sei" com o material publicado ao lado, e o
  cadastro de negócios, em que um responsável inexistente ficava gravado e sumia
  dos filtros por dono.

## [1.11.0] — 2026-08-31

### Adicionado

- **Marcar ou confirmar um agendamento move o lead no funil sozinho** Antes, marcar ou confirmar um horário na agenda não mexia no card do negócio: a
  equipe precisava arrastar o lead manualmente para "Agendamento solicitado" ou
  "Agendado" (ou como quer que a organização tenha nomeado essas etapas).

  Agora, quando um agendamento nasce pendente de confirmação, o lead se move para
  a etapa do funil marcada com o slug `agendamento-solicitado`; quando o
  agendamento é confirmado, ele se move para a etapa `agendado`. É opt-in: quem
  não criou essas etapas no funil não vê nenhuma mudança de comportamento. Cancelar
  ou faltar a um compromisso não move o lead — o negócio pode ter outro horário
  remarcado, e quem decide que ele esfriou continua sendo o agente de IA ou uma
  pessoa da equipe.

- **O atendente de IA passa a marcar consulta pela conversa** Quem instalou e ligou a agenda tinha um atendente de IA que consultava horário e
  não fechava nada: o paciente pedia "quinta às 14h" e a resposta era sempre "vou
  confirmar com a equipe". Faltavam duas coisas, e nenhuma delas era o modelo.

  A primeira: ele não sabia que dia era hoje. Nenhuma informação sobre a data
  chegava até ele, então não tinha como transformar "quinta que vem" ou "amanhã de
  manhã" num horário de verdade. Agora todo atendimento começa sabendo a data, a
  hora e o dia da semana, no fuso que você escolheu nas configurações da empresa.

  A segunda: ele não tinha como descobrir o que a sua empresa atende. Consulta,
  retorno, avaliação, procedimento — a lista está no sistema, e ele não conseguia
  lê-la; tinha que adivinhar o nome exato e errava. Agora existe uma capacidade
  nova, "Ver o que a empresa atende", que mostra a ele os tipos de atendimento com
  a duração de cada um.

  Junto vieram outras duas: confirmar um horário quando a pessoa avisa que vem, e
  registrar depois se ela foi atendida ou não apareceu. E a lista de horários
  livres passou a sair em português — "sexta-feira 04/09 às 14:00" em vez de um
  código de data —, com um número menor de opções por vez, o que também deixa a
  resposta mais rápida.

  O sistema também passou a recusar um registro que antes aceitava calado: marcar
  "faltou" num compromisso que ainda nem começou. Isso devolvia o horário para
  outra pessoa enquanto o cliente original ainda estava contando com ele.

  **As capacidades novas não entram sozinhas nos agentes que já existem.** Para o
  seu atendente usá-las, abra *O que o agente pode fazer*, ligue o pacote
  **Vender** de novo e publique. Agente criado a partir de agora já nasce com elas.

### Corrigido

- **O canal Zernio volta a enviar em quem configurou a partir do arquivo de exemplo** Quem conectou o canal Zernio numa instalação montada a partir do arquivo de
  exemplo não conseguia enviar mensagem nenhuma por ele. As duas credenciais
  estavam certas, o canal aparecia configurado, e o envio falhava assim mesmo —
  tanto para quem deixou as credenciais na configuração quanto para quem as
  cadastrou pela tela.

  A causa estava no endereço do provedor. O arquivo de exemplo traz essa linha
  vazia, e o comentário ao lado dela promete que vazio usa o endereço de produção
  do provedor — a linha só existe para quem precisa apontar o sistema a um
  ambiente de homologação. Não era o que acontecia: o vazio era tratado como se
  fosse um endereço de verdade, e o sistema tentava falar com um lugar que não
  existe.

  Agora vazio significa o que o arquivo sempre disse que significava. Quem
  preencheu a linha para apontar para homologação continua sendo respeitado, e
  espaço sobrando em volta do endereço deixa de atrapalhar.

  Ninguém precisa mexer em nada. Instalações que já enviavam seguem iguais, e as
  que estavam com esse envio quebrado voltam a funcionar sozinhas.

- **Quem pede para sair em espanhol passa a ser atendido** Pedir para sair em espanhol só funcionava numa forma: a palavra sozinha, ou
  "no quiero recibir". As formas que as pessoas realmente escrevem — "deja de
  escribirme", "no quiero más mensajes", "dame de baja" — não casavam padrão
  nenhum, e o pedido se perdia em silêncio.

  O sinal que faz o robô parar de responder e chamar uma pessoa (o nível
  "ambíguo", usado quando o pedido não é claro o bastante para bloquear
  sozinho) também não existia em espanhol: nenhuma frase daquele idioma
  chegava a ativá-lo, então esse cliente nunca era escalado.

  De passagem, corrige um caso em português que só apareceu ao testar os dois
  idiomas juntos: "pare de mandar o pedido nesse endereço" bloqueava um
  cliente que só queria mudar a entrega.

- **O relógio interno do assistente deixa de depender da versão do banco** Quando uma conexão de WhatsApp entra em espera, o sistema marca a fila com uma
  data "infinita" — é assim que ele segura o atendimento até alguém resolver o
  aviso. O cálculo de quanto falta para a próxima tarefa fazia uma conta com essa
  data que **só funciona no Postgres 17**; em Postgres 15 ou 16 o banco recusa a
  conta e o relógio do assistente para.

  Isso nunca afetou quem seguiu a versão recomendada. Passa a importar agora que a
  instalação aceita bancos mais antigos — e é exatamente onde apareceria: numa
  máquina nova, com uma conexão em espera, sem nada na tela explicando.

  A proteção já existia, mas na ordem errada: ela limitava o resultado da conta,
  e a conta estourava antes. Agora limita a data antes de calcular.

## [1.10.2] — 2026-08-30

### Corrigido

- **Quando a IA fica calada, agora dá para ver por quê** Três consertos que atacam o mesmo problema: o sistema fazia a coisa certa em
  silêncio, e de fora parecia quebrado.

  **A ficha de proteção de envio parou de congelar o padrão do dia.** O botão
  "Enviar aos domingos" era o único controle daquela ficha que não sabia dizer
  "não mexi": ele gravava sempre o valor que estava na tela, e o valor na tela,
  sem escolha própria, era o padrão vigente. Quem abriu a ficha para declarar o
  aquecimento do número acabou congelando o padrão daquele dia — e, quando o
  produto passou a liberar domingo, essa instalação ficou para trás com uma
  escolha que ninguém fez. Agora só um valor DIFERENTE do padrão vira escolha.
  Quem desligou o domingo de propósito continua com ele desligado.

  **A espera pela janela de envio virou aviso na Central.** Quando o número está
  fora do horário de envio, as respostas ficam na fila e saem na abertura — isso
  não mudou. O que mudou é que agora existe um aviso dizendo que estão esperando,
  a partir de quando saem e o que fazer. Um aviso por número, e ele se resolve
  sozinho quando o horário reabre.

  **A aba "Execuções" de um agente mostra o que ele realmente fez.** Ela lia uma
  tabela que nenhum motor em uso escreve, e por isso dizia "Nenhuma execução
  ainda" mesmo com o agente respondendo. Passou a ler o registro vivo. Execuções
  anteriores a esta versão não aparecem ali — para o histórico completo, use
  IA › Execuções.

## [1.10.1] — 2026-08-28

### Corrigido

- **A Central de atendimento abre mais rápido quando a equipe é grande** Cada vez que a Central era aberta, o sistema perguntava o nome de cada pessoa
  da equipe que aparecia na página — uma pergunta separada para cada uma, toda
  vez, mesmo quando o nome nem ia ser mostrado na tela.

  Numa equipe pequena isso passava despercebido. Numa equipe grande, não: o
  tempo medido era de cerca de 350 milissegundos com dez pessoas atendendo, e de
  mais de um segundo com cinquenta — só para descobrir nomes que o sistema já
  poderia ter guardado.

  Agora o nome de quem atende fica guardado junto com a conversa, e é atualizado
  sozinho sempre que o atendimento troca de mãos. A Central abre no mesmo tempo
  com uma pessoa ou com cinquenta.

  Nada a fazer: a atualização do banco acontece sozinha quando você roda a
  atualização normal, e os nomes de quem já estava atendendo são preenchidos na
  hora.

- **Quem administra duas empresas entra sempre na mesma** Quem participa de mais de uma empresa na mesma instalação podia entrar numa ou na
  outra sem critério, ao acessar o sistema sem uma escolha anterior guardada — no
  primeiro acesso, numa sessão nova ou depois de a preferência expirar. O sistema
  não tinha regra para decidir qual delas abrir. Agora abre sempre a mais antiga, e
  a escolha feita no seletor de empresa continua valendo por cima disso. Quem tem
  uma empresa só não vê diferença.

- **Agenda sem responsável configurado: o aviso agora diz onde resolver** Numa instalação nova, ou quando um novo tipo de agendamento aponta para alguém
  que ainda não cadastrou horário de atendimento, tentar ver ou marcar um horário
  mostrava "Invalid input: expected object, received undefined" — frase correta
  para quem lê o código e inútil para quem opera a clínica.

  Agora a mensagem diz o que realmente falta e onde resolver: "A disponibilidade
  deste responsável ainda não foi configurada. Configure em Equipe →
  Atendimento." Continua sendo a mesma recusa de antes (nenhum horário é
  oferecido enquanto isso não for configurado) — só a explicação ficou legível.

  Quem já tinha disponibilidade cadastrada não percebe nenhuma diferença.

- **Quem publica o sistema com a própria marca passa a checar a atualização no lugar certo** Se você mantém uma cópia própria do projeto e publica as imagens do sistema com
  o seu próprio endereço, o comando de atualização olhava para o endereço do
  projeto original — e não para o seu — quando a configuração do servidor não
  dizia explicitamente qual imagem usar. Ele então comparava a versão instalada
  com a de outra pessoa, e podia anunciar que havia atualização quando não havia,
  ou o contrário.

  O endereço agora é lido de um ponto único do próprio kit, o mesmo que o resto
  da instalação usa. Quem opera com o projeto original não percebe diferença: o
  endereço lido é exatamente o que já estava escrito antes.

- **Quatro consertos que a versão anterior anunciou e não trouxe chegam agora** A lista de mudanças da versão 1.10.0 anunciou quatro consertos que não estavam
  dentro dela. Foi um erro nosso de ordem: os textos que descrevem os consertos
  entraram no projeto antes do código deles, e a versão foi fechada no meio.

  Se você atualizou para a 1.10.0 esperando alguma destas quatro coisas, elas
  chegam agora:

  - **A instalação nova não obriga mais a verificação em duas etapas.**
    Quem instalava pelo instalador automático era parado por uma tela de
    verificação em duas etapas logo depois do primeiro acesso, sem nunca ter
    sido avisado disso.
  - **Quando a inteligência artificial falha ao responder, o erro deixa de sumir.**
    A falha ficava só no registro técnico do servidor e não chegava a ninguém.
  - **O instalador para de confundir comentário com valor de configuração.**
    No arquivo de exemplo da VPS, um comentário escrito na mesma linha do valor
    era lido como parte do valor.
  - **Uma rede a mais contra vazamento entre empresas.**
    Esta é sobre as próximas versões, não sobre a sua instalação de hoje: uma
    tabela nova que seja criada sem a proteção que separa os dados de cada
    empresa passa a ser recusada na nossa conferência, antes de virar uma
    atualização que chega até você.

  Nada a fazer além de atualizar normalmente. Quem instalar do zero a partir
  desta versão nunca viu o problema.

- **O que você marca no Google passa a aparecer na agenda do CRM** Compromissos criados direto no Google Agenda já bloqueavam o horário — ninguém
  conseguia marcar por cima —, mas não apareciam na tela: a agenda parecia vazia e
  o horário indisponível ao mesmo tempo. Agora eles aparecem como faixa de
  ocupação, com visual próprio e sem clique, porque não são compromissos do CRM:
  não têm cliente, tipo nem responsável, e remarcá-los teria de ser feito no
  Google.

  A faixa mostra apenas o horário ocupado, **não o nome do evento**. A agenda
  conectada é pessoal de quem atende, e esta tela é vista por outras pessoas da
  empresa — o título de um compromisso particular não deve aparecer aí.

- **Os compromissos do CRM voltam a aparecer no Google Agenda** Quem conectou o Google Agenda não via os compromissos marcados no CRM chegarem
  lá — nenhum, nunca. O sistema tentava a cada cinco minutos e o Google recusava
  todas as vezes, porque o pedido usava a operação de "alterar um evento
  existente" para criar um evento que ainda não existia. Agora ele cria com a
  operação certa e só altera o que já está lá. Os compromissos pendentes sobem na
  primeira rodada após a atualização, sem duplicar os que porventura já existam.

  A falha também deixou de ser silenciosa: quando o Google recusar, o motivo passa
  a aparecer no registro do sistema, e não só numa coluna interna que ninguém abre.

## [1.10.0] — 2026-08-28

### Adicionado

- **O sistema inteiro em espanhol, com o idioma trocável em três lugares** Quem instala na América Latina agora escolhe o idioma **na própria instalação**,
  e o sistema abre em espanhol para todo mundo da empresa — inclusive para quem
  for convidado depois e nunca abriu o próprio perfil.

  Antes, o espanhol existia pela metade: só as telas do dia a dia estavam
  traduzidas, e o resto aparecia em português para quem tinha escolhido espanhol.
  Agora a tradução cobre Agenda, Desempenho, Radar, Respostas rápidas, IA e o
  painel de administração, com um teste automático que reprova qualquer texto novo
  que apareça sem tradução.

  O idioma se troca em três lugares, na ordem em que se costuma precisar deles:

  - **No topo de qualquer tela** — o botão `PT`/`ES` ao lado do controle de tema.
    Um clique, sem procurar nada. É onde recorre quem abriu o sistema num idioma
    que não lê.
  - **Na instalação** — o `install.sh` pergunta, e a resposta define o idioma da
    empresa inteira.
  - **Em Configurações** — no seu perfil (só para você) ou em Organização (para
    todo mundo que entrar sem preferência própria).

  Também está consertado um controle que não fazia nada: o seletor de Idioma em
  Configurações › Organização era gravado no banco e nunca era lido. Quem o
  mudasse não via diferença nenhuma. Agora ele vale para toda pessoa da empresa
  que não tenha escolhido um idioma seu.

  **As datas também acompanham o idioma.** "quinta-feira, 3 de março" vira
  "jueves, 3 de marzo" — não sobrou aquele meio-termo em que a tela fala espanhol
  e a data insiste no português.

  Duas exceções, de propósito: os **e-mails** que o sistema envia seguem em
  português (quem recebe um convite ainda não tem conta, então não há preferência
  de idioma para consultar), e o **relatório de LGPD** também — ele responde a uma
  lei brasileira, e mudar a forma dele conforme quem apertou o botão seria errado.

  ---

  A tradução para espanhol é, em boa parte, contribuição de **@JowaniOrantes**, que
  abriu três frentes de trabalho por conta própria: as áreas de IA e administração
  (#352), o módulo de Agenda (#379) e as correções que vieram do QA visual dele.
  São 57 commits e mais de 460 entradas de dicionário que este release não teria
  sem esse trabalho.

### Corrigido

- **Pausar um agente de IA agora o cala de verdade** Pausar o único agente publicado da organização fazia um agente que a tela
  chamava de "Rascunho" voltar a responder no WhatsApp pelo caminho antigo de
  resposta — com o texto do cadastro, sem as ferramentas nem os limites da versão
  publicada.

  Junto disso, a tela passou a dizer a mesma coisa que o motor faz: o seletor de
  dono de negócio deixou de esconder agentes publicados (e de oferecer os
  pausados), e o selo da Inbox só diz "Automático" quando existe mesmo alguém para
  atender.

- **Instalação nova não obriga mais a verificação em duas etapas logo de cara** Quem instalava pelo instalador automático caía, logo depois do primeiro acesso,
  numa tela obrigatória pedindo para cadastrar a verificação em duas etapas — um
  passo que o assistente de instalação nunca anunciou. A verificação é opcional
  desde a versão 1.0 e se liga em Configurações › Segurança, mas o instalador não
  acompanhou essa decisão e deixava o valor obrigatório.

  Quem já instalou e já configurou a verificação não é afetado: nada é desligado
  de quem já tem. A mudança vale só para instalações novas, que passam a nascer
  como sempre foi a intenção — com a escolha nas mãos de quem administra.

- **O mesmo celular escrito das duas formas passa a cair sempre no mesmo cadastro** Quando um celular ainda existia gravado nas duas formas — com e sem o nono
  dígito —, o sistema podia escolher qualquer uma das duas ao reencontrar a
  pessoa. Na prática isso aparecia no pior momento: a resposta do cliente entrava
  no cadastro errado, o follow-up não a reconhecia como resposta, e a mesma
  pergunta era enviada de novo.

  Agora a escolha é sempre a mesma e é sempre a forma com o nono dígito, que é a
  que o CRM guarda e mostra. Você não precisa fazer nada.

- **Quando a IA falha ao responder, o erro deixa de sumir** A peça que faz a IA responder às conversas registrava as próprias falhas apenas
  num log que ninguém lê. Se ela parava de responder por um erro, não havia sinal
  em lugar nenhum — só o silêncio no WhatsApp do cliente. Agora esse erro é
  enviado ao serviço de monitoramento, o mesmo que o resto do sistema já usava.

  Quem opera não precisa fazer nada, e nenhum dado de conversa é enviado: o
  sistema já limpa o conteúdo antes de mandar.

- **O instalador para de confundir comentário com valor de configuração** No arquivo de exemplo que serve de base para a configuração da VPS, as
  explicações ficavam na mesma linha dos valores. O instalador lê esse arquivo
  linha a linha e tratava a explicação como parte do valor — então uma senha, um
  endereço ou uma chave podiam chegar ao servidor com um texto extra colado no
  fim, e o erro só aparecia depois, num lugar sem relação com a causa.

  As explicações passaram para a linha de cima. Quem já tem o servidor rodando não
  precisa refazer nada; a mudança protege quem instala do zero a partir de agora.

- **Quem baixa o projeto no Windows consegue rodar os testes** Isto é do nosso processo de desenvolvimento, não do sistema que você usa. Quem
  baixava o projeto no Windows não conseguia rodar a bateria de testes do banco:
  o sistema operacional alterava os arquivos de banco de dados na cópia, e uma
  conferência de integridade recusava tudo antes de o primeiro teste rodar.

  Para quem opera uma VPS nada muda — o servidor sempre rodou em Linux, onde a
  alteração não acontece.

- **O relógio externo do follow-up passou a ser testado de ponta a ponta** Quem roda o sistema numa hospedagem sem agendador próprio — o plano gratuito da
  Vercel é o caso comum — depende de um serviço de cron externo bater de tempos em
  tempos para os follow-ups andarem. Esse caminho tinha runbook e nunca tinha sido
  exercitado: se ele parasse de funcionar, ninguém receberia erro, e os follow-ups
  simplesmente ficariam parados.

  Agora um teste automático dispara a batida de fora, como o cron real faz, e
  confere que o follow-up de fato anda — e que uma batida sem a chave certa é
  recusada sem mexer em nada. Você não precisa fazer nada: nada mudou no
  comportamento, só passou a existir uma rede que avisa se ele quebrar.

- **Uma rede a mais contra vazamento entre empresas** O sistema separa os dados de cada empresa por uma regra no banco, e essa regra
  precisa ser ligada tabela por tabela. Faltava uma verificação automática que
  recusasse uma tabela nova sem essa proteção — a conferência dependia de alguém
  lembrar. Agora ela é feita a cada mudança, e o que já existe está registrado
  como dívida conhecida, para a lista só diminuir.

  Nada muda para quem opera: é uma proteção contra um erro futuro, não a correção
  de um vazamento existente.

## [1.9.1] — 2026-08-28

### Corrigido

- **O Google Agenda conectado passa a aparecer como conectado** Quem conectava o Google Agenda continuava vendo o botão "Conectar Google" na
  tela, como se nada tivesse acontecido — e ao clicar em desconectar recebia um
  erro dizendo que não havia agenda conectada. Os compromissos marcados no CRM
  também nunca chegavam ao Google Agenda, em silêncio.

  A conexão sempre foi gravada corretamente; o que estava errado era o nome pelo
  qual três partes do sistema a procuravam, e por isso nenhuma delas a encontrava.
  Agora a tela mostra a conta conectada, desconectar funciona, e os compromissos
  sobem para o Google na primeira rodada seguinte. Quem já conectou não precisa
  reconectar: a conexão está lá e passa a ser vista.

- **A lista de horários volta a rolar ao marcar um compromisso** Ao escolher o dia, os últimos horários ficavam abaixo da borda da tela sem
  nenhuma forma de alcançá-los — nem rolando a página, nem a própria lista. Quem
  precisava de um horário do fim da tarde não conseguia marcar. Agora a lista rola
  sozinha, com o calendário e os dados do atendimento parados ao lado, e em telas
  menores o painel inteiro rola.

- **As verificações automáticas do projeto voltaram a caber no tempo** Isto é do nosso processo de desenvolvimento, não do sistema que você usa: a
  bateria de testes que roda antes de cada mudança tinha crescido a ponto de
  estourar o tempo limite e ser cancelada no meio. Ela passou a rodar em duas
  frentes ao mesmo tempo, o que a devolveu para dentro do limite com folga. Para
  quem opera uma VPS nada muda — só a chance de uma correção demorar mais a sair
  porque a verificação foi cancelada por tempo.

- **Áreas de administração passam a exigir a verificação em duas etapas** Quatorze telas e ações de administração conferiam apenas o papel de quem
  acessava, sem cobrar a verificação em duas etapas de quem a tem ativada. Entre
  elas estavam as que conectam o número oficial do WhatsApp, as que trocam a
  credencial do provedor de inteligência artificial e as que alteram os limites de
  segurança do agente — justamente as que mais importam.

  Quem já usa o sistema não precisa fazer nada, e quem não ativou a verificação
  continua entrando como antes. A mudança é que, para quem a tem ativada, ela
  passa a valer também nesses lugares.

- **Trocar para uma organização ainda não configurada deixava você preso** Quem participa de mais de uma organização podia trocar pelo seletor no topo e
  cair no assistente de configuração da organização nova — o que está certo, ela
  não foi configurada ainda. **O que estava errado é que não havia como sair de lá.**
  O seletor de organização some junto com o resto do sistema nessa tela, e sobravam
  só os links de Termos e Privacidade e um botão "Continuar" desabilitado. A saída
  era fechar o navegador e limpar os dados do site.

  Agora o assistente mostra, no topo, o caminho de volta para as outras
  organizações de que você participa — um clique e você está de volta onde estava
  trabalhando.

  Nada muda para quem administra uma organização só: o botão não aparece, porque
  não há para onde voltar.

- **Voltar da autorização do Google não pede login de novo** Ao conectar o Google Agenda, o navegador voltava e caía na tela de login — o que
  se lia como "o sistema me deslogou". A sessão nunca foi encerrada: o navegador é
  que, por segurança, não apresenta a credencial numa página aberta a partir de
  outro site, e a volta do Google era exatamente isso. Agora o retorno passa por
  uma página intermediária do próprio sistema, e a pessoa cai direto na Agenda,
  ainda conectada. Quem já usava não precisa fazer nada.

## [1.9.0] — 2026-08-28

### Adicionado

- **A agenda virou agenda — clicar num horário marca, arrastar um card remarca** A grade da Agenda mostrava a semana e não aceitava nada: clicar num espaço vazio
  não fazia nada, e arrastar um compromisso não fazia nada. Para marcar era preciso
  sair da grade, abrir "Novo agendamento" e escolher a data de novo no
  mini-calendário — mesmo tendo acabado de apontar para o horário na tela.

  Agora a grade responde:

  - **Clicar num horário livre abre a marcação já naquele horário.** Os horários
    que aceitam clique são exatamente os que você publicou em Equipe › Atendimento
    — os mesmos que o agente de IA oferece ao cliente. A tela não inventa horário:
    se não está publicado, não é clicável.
  - **Horário que não aceita marcação diz por quê**, em vez de ficar apagado sem
    explicação: "você ainda não publicou seus horários", "já há um compromisso
    neste horário", "fora dos horários que você publicou".
  - **Arrastar um compromisso para outro horário remarca**, com uma confirmação
    antes — quem foi atendido recebe aviso da mudança, então o gesto não consuma
    sozinho. Soltar fora dos horários publicados é recusado com o motivo, e o
    compromisso volta para onde estava; se o servidor recusar, ele volta também.
  - **Quem usa teclado remarca do mesmo jeito**: com o compromisso em foco,
    `Alt + ↑/↓` salta de vaga em vaga, `Alt + ←/→` muda de dia, `Enter` confirma e
    `Esc` desfaz.

  Nada muda no que já estava marcado, e nada precisa ser configurado para isto
  funcionar — se a sua equipe já publicou os horários de atendimento, a grade já
  está clicável.

### Corrigido

- **Conectar a agenda do Google passa a concluir de verdade** Quem clicava em conectar a conta do Google era levado à tela de autorização,
  autorizava, e voltava para uma página de erro — a conexão nunca se completava.
  Não era problema da conta nem da instalação: a volta da tela de autorização era
  recusada pelo sistema antes de chegar ao lugar certo, em qualquer instalação.
  Se você tentou conectar e desistiu, tente de novo: agora vai até o fim.

  A mesma recusa acontecia na volta da conexão com a Nuvemshop, e também foi
  corrigida.

  Para conectar o Google, quem administra a instalação continua precisando
  cadastrar as credenciais em Administração › Google e registrar o endereço de
  retorno no console do Google — exatamente o endereço que a própria tela mostra,
  terminando em /api/v1/agenda/google/callback. Sem esse endereço registrado, o
  Google recusa a autorização antes de o sistema ser chamado.

- **A coluna de horários volta a caber na tela ao marcar um compromisso** Ao escolher o dia, a lista de horários aparecia cortada pela borda direita e
  saía da tela — não dava para escolher horário nenhum, e nem diminuir o zoom nem
  rolar a página resolvia. As três colunas do painel somavam mais largura do que a
  janela onde ele abre, e o excedente era cortado sem barra de rolagem. Agora o
  painel abre mais largo quando a tela permite, e em telas menores a lista de
  horários aparece embaixo do calendário em vez de ao lado.

- **O botão "Ver na agenda" passa a levar até o compromisso marcado** Depois de marcar, o botão "Ver na agenda" da confirmação não fazia nada: o clique
  caía no vazio. Agora ele fecha o painel e leva a agenda até o dia do compromisso
  — inclusive quando ele foi marcado para outra semana, que era o caso em que
  mesmo fechar o painel não teria adiantado, porque a agenda continuaria mostrando
  a semana atual.

## [1.8.0] — 2026-08-27

### Adicionado

- **A tela diz quem consulta cada material** Um documento que nenhum assistente lê aparece marcado como tal: acervo que ninguém consulta
  é dinheiro gasto sem efeito, e isso era invisível.

- **Avisos de mensagem e de CRM chegam com a aba fechada** Antes, quem minimizava ou fechava a aba parava de ver aviso de mensagem nova e
  de movimento no funil — voltava e descobria tudo de uma vez. Agora o navegador
  mostra o aviso na bandeja do sistema mesmo com o site fechado, e clicar nele
  abre a conversa certa.

  Cada pessoa liga isso em Configurações › Notificações, e o navegador pede
  permissão uma vez. **Nada muda para quem não ligar.**

  Para a instalação inteira poder mandar esses avisos, quem administra a VPS
  gera um par de chaves uma única vez (`npx web-push generate-vapid-keys`) e o
  coloca no `.env`, em `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`.
  **Sem essas chaves o produto continua funcionando exatamente como antes**, com
  os avisos aparecendo só enquanto o site está aberto.

- **As credenciais do Google Agenda passam a ser cadastradas pela tela** Para ligar a sincronização com o Google Agenda era preciso acessar o servidor por
  linha de comando, editar um arquivo de configuração e reiniciar o sistema. Quem
  administra a instalação agora faz isso em Admin › Google Agenda: cola o ID e a
  chave do aplicativo, e o endereço de retorno já vem pronto para copiar no painel
  do Google.

  A chave é guardada cifrada e nunca mais aparece na tela — só é possível
  substituí-la. Quem já tem as credenciais no arquivo de configuração não precisa
  fazer nada: elas continuam valendo, e o que for salvo pela tela passa a valer no
  lugar delas. Ao trocar uma credencial já em uso, quem tinha conectado a agenda
  precisa conectar de novo — é o Google que invalida as autorizações antigas, e a
  tela avisa antes.

- **Dá para ver o que o agente aprendeu de cada material** O botão "Ver o que ele aprendeu" mostra os trechos exatos que ele procura antes de
  responder. Quando ele erra sobre um assunto, é ali que se descobre o porquê — antes a tela
  mostrava só um número.

- **Enviar arquivo passou a funcionar** PDF, Markdown ou texto, até 20 MB — ou cole o texto direto na tela, se preferir. Antes só
  existia o formato pergunta/resposta; quem tentava subir um PDF não tinha por onde.

- **O material do seu negócio agora é da empresa, e cada assistente escolhe o que lê** Antes, o que o agente sabia pertencia a UM assistente: dois times com o mesmo manual de
  trocas precisavam cadastrá-lo duas vezes, indexá-lo duas vezes e pagar por ele duas vezes.
  Agora o acervo é da organização — em **IA › Conhecimento** — e na tela de cada assistente há
  uma seção **"O que ele consulta antes de responder"**, onde você marca o que aquele
  assistente pode ler. O mesmo documento serve a quantos assistentes você quiser.

- **O follow-up anda mesmo em hospedagem sem agendador** Em ambientes que não têm agendador de verdade — o plano gratuito da Vercel é o
  caso comum — os follow-ups e as tarefas de bastidor só andavam quando alguém
  abria o sistema. Um lead que respondia de madrugada ficava esperando.

  Agora existe uma batida de relógio que pode vir de fora: um serviço gratuito de
  cron chama uma vez a cada poucos minutos e o sistema faz o que estava pendente.
  O passo a passo está no runbook do relógio.

  **Quem roda numa VPS com o agendador normal não precisa fazer nada** — ali o
  relógio já existia e continua igual.

### Alterado

- **O agente de IA passa a caber 25 capacidades, e alcança as de agenda** Quem já tinha o agente com a lista cheia lia "20 de 20 capacidades ligadas.
  Limite atingido." e não conseguia ligar as capacidades de agenda — ver horários
  livres, marcar, remarcar, desmarcar —, que aparecem na lista mas ficavam
  desabilitadas. O limite passou de 20 para 25.

  Isso não muda nada no que já está configurado: nenhum agente perde capacidade, e
  quem não estava no limite não vê diferença. Quem estava agora consegue ligar mais
  uma jornada. Agentes criados antes da Agenda não recebem as capacidades novas
  sozinhos — a lista de cada versão é uma foto congelada; é preciso abrir
  "O que o agente pode fazer" e ligá-las.

### Corrigido

- **A Agenda passa a dizer por que os dias estão travados** O calendário abria com o mês inteiro sem clique e nada explicando. Havia estados
  em que nem o aviso aparecia: numa instalação nova, em que ninguém publicou a
  jornada de atendimento, a consulta falhava e a tela concluía que estava tudo
  certo; e avançar dois meses levava a um período que a busca nunca cobriu, também
  em silêncio. Agora o bloco de aviso e os dias apagados saem da mesma conta,
  cada dia diz a causa ao passar o mouse e para quem usa leitor de tela, e o botão
  de avançar mês não leva mais a um período vazio por construção.

- **A tela de marcar mostra o local e o fuso reais, e dá para registrar o desfecho** Ao marcar um horário, o painel dizia "Presencial · Sala 2" e "horários no fuso
  America/Sao_Paulo" para todo mundo — texto de exemplo que nunca era trocado pelo
  que estava configurado no tipo de agendamento. Quem atende em outro fuso via a
  hora errada anunciada. Agora ele mostra o local que você cadastrou e o fuso de
  verdade, e some com a linha quando não há o que mostrar, em vez de inventar.

  No histórico, os botões "Realizado" e "Faltou" ficavam sempre cinzas, dizendo que
  estariam disponíveis quando a agenda estivesse conectada ao Google — o que nunca
  teve relação. Agora funcionam. Marcar "Faltou" devolve o horário para outra
  pessoa poder pegar.

- **Compromissos marcados no CRM passam a aparecer no Google Agenda** Quem conectou o Google Agenda não via os compromissos do CRM chegarem lá — nunca,
  em instalação nenhuma. A tarefa que faz esse envio pedia os pendentes ao banco de
  um jeito que o banco recusava, e ela falhava a cada cinco minutos desde que o
  módulo saiu, deixando só um aviso no registro técnico. Agora ela pede certo, e o
  que já está marcado sobe na primeira rodada depois da atualização. Não é preciso
  reconectar nada nem mexer em arquivo: a atualização já traz a mudança do banco.

- **A tela de Notificações passa a dizer o que falta para o aviso chegar com a aba fechada** A tela dizia que o aviso por Push "já funciona", sem conferir se esta instalação
  tinha como enviá-lo. Quem ligava a opção via o navegador pedir permissão,
  concedia, e depois não recebia nada com a aba fechada — sem nenhuma pista do
  motivo, e sem como descobrir o que fazer.

  Agora, quando faltam as chaves do Web Push, a própria tela avisa que os avisos
  só aparecem com o site aberto e mostra o comando para gerar o par de chaves e
  onde colocá-lo. Quando as chaves já estão no lugar, ela anuncia que o aviso
  chega também com a aba fechada e para de pedir configuração.

  **Você não precisa fazer nada.** A opção de Push continua podendo ser ligada dos
  dois jeitos: mesmo sem as chaves, o aviso na bandeja do sistema já funciona
  enquanto o DeskcommCRM está aberto numa aba.

- **A Agenda passa a mostrar só a organização que está selecionada** Quem administra mais de uma empresa na mesma instalação via a Agenda somando as
  duas: os tipos de agendamento apareciam repetidos, e clicar em metade deles
  respondia que o tipo não foi encontrado. Nada estava duplicado no banco — a tela
  é que mostrava as duas empresas juntas. Agora ela mostra só a que está
  selecionada no alto da página, e trocar de empresa troca a lista. O mesmo valia
  ao abrir um contato, um lead ou um funil pelo endereço direto. Para quem tem uma
  empresa só, nada muda.

- **Arquivar um material não liberava o espaço** Arquivada, a fonte continuava ocupando o lugar e não dava para criar outra do mesmo tipo —
  nunca mais, sem mensagem que explicasse.

- **Cadastrar a chave da OpenAI pela tela não ligava a base de conhecimento** O produto dizia, em duas telas, que a OpenAI é necessária "para indexar o seu material" — e
  o motor só olhava para a chave do arquivo de configuração da instalação. Quem cadastrou a
  chave em IA › Credenciais e viu o material parado estava vendo esse defeito. Agora a chave
  sai da sua organização, e a tela de conhecimento **diz qual está valendo**.

- **O mesmo celular com e sem o nono dígito deixa de virar dois contatos** `+55 32 8479-3302` e `+55 32 98479-3302` são a mesma pessoa, e o CRM tratava as
  duas grafias como contatos diferentes. O efeito aparecia no pior momento: a
  resposta do cliente entrava no cadastro errado, o follow-up não a reconhecia
  como resposta, e a mesma pergunta era enviada de novo.

  Agora o CRM guarda e mostra sempre a forma com o nono dígito, encontra a pessoa
  pelas duas grafias na entrada, e **junta os pares duplicados que já existiam**
  na sua base ao atualizar. Fixo e número estrangeiro não mudam. O envio ao
  WhatsApp continua tentando as duas grafias, como antes.

  E a resposta do lead passa a acordar o follow-up: quem responde antes do prazo
  não fica esperando o relógio para seguir no fluxo.

- **Conversas marcadas como aproveitáveis eram perdidas** A rotina que as prepara gravava zero trechos por um erro de configuração do banco, e mesmo
  assim as marcava como aproveitadas — o que as tirava da fila para sempre.

- **Duplicar um assistente perdia o escopo dele** A cópia nascia sem os funis em que o original mexia — e teria nascido sem os materiais
  também. Criar assistente pela API tinha o mesmo problema: o pedido era aceito e metade dos
  campos, descartada.

- **O botão de aviso na tela de Notificações não aparece mais ligável para depois se desligar sozinho** Quem tem as notificações bloqueadas no próprio navegador via, por um instante,
  o botão de Push disponível — e ele se desabilitava sozinho logo em seguida. Um
  clique naquele intervalo não fazia nada, porque a resposta do navegador já
  estava dada.

  A tela passa a consultar o navegador antes de desenhar o botão, em vez de
  desenhá-lo primeiro e corrigir depois. Você não precisa fazer nada.

- **O agente descartava paráfrases** O corte de semelhança usado no atendimento era mais rígido do que o calibrado com medição:
  "posso trocar se não servir?" era jogado fora mesmo com a resposta escrita no seu material.
  Agora os três lugares que decidiam isso usam o mesmo valor.

- **O aviso de "publique seus horários" agora leva até onde se publica** Quem abria a Agenda numa instalação nova encontrava o aviso de que ainda não
  havia horários publicados — e nenhuma indicação de onde publicá-los. A tela
  sempre existiu, em Equipe › Atendimento, mas se anunciava como "status, carga e
  capacidade" e nada ali dizia "horários". Agora o aviso é um link direto para ela,
  já com a aba certa aberta, e a seção diz para que serve. Nada precisa ser
  reconfigurado: quem já publicou a jornada continua com ela.

- **O conhecimento cadastrado ia parar no assistente errado** Se a sua organização tem mais de um assistente, todo material cadastrado era preparado
  para o *primeiro* deles — sempre. O segundo assistente nunca aprendia nada, sem erro, sem
  aviso, sem nada na tela. E a tela de conhecimento só existia para o assistente que veio
  com a instalação: qualquer assistente criado por você era invisível ali.
  Depois de atualizar, o que cada assistente já lia continua valendo. Mas o material que
  você tinha cadastrado para um assistente que não é o da instalação nunca chegou a ser
  aprendido de verdade — ele aparece no acervo e precisa de um "Preparar de novo" para
  virar consulta. Vale conferir, em cada assistente, o que ele consulta.

- **Preparar um material derrubava o outro** Enquanto havia um único índice por assistente, a rotina de conversas e a de perguntas
  frequentes competiam: a que rodasse por último apagava o acervo da outra, em silêncio. Cada
  material passa a ter o índice dele.

- **A página do projeto passa a anunciar a versão certa sozinha** Quem chega pelo GitHub via a versão anterior anunciada como a mais recente,
  mesmo depois de a nova sair, porque só a etiqueta da versão era criada
  automaticamente e o anúncio na página dependia de alguém publicar à mão. Agora
  os dois saem juntos. Para quem já roda numa VPS nada muda: a atualização sempre
  usou a etiqueta, não o anúncio.

- **Segurança: qualquer pessoa da equipe podia apagar a base de conhecimento** As quatro tabelas do acervo aceitavam escrita de qualquer papel, inclusive o mais restrito,
  por fora das telas do produto. Agora exigem gerente ou administrador, como as telas sempre
  exigiram.

- **Sem chave, o material ficava parado para sempre e ninguém era avisado** Ele nascia como "pronto", nada acontecia, e cadastrar a chave depois não recuperava o que
  ficou para trás. Agora o material mostra **"Esperando a chave"**, um aviso abre na Central,
  a própria tela de conhecimento oferece cadastrar a chave ali mesmo — e a preparação recomeça
  sozinha quando ela chega. Nada do que você enviou é perdido.

- **Tipo de agendamento novo já nasce com um responsável** Quem criava um tipo de agendamento — "Call Estratégica", "Retorno de 15 minutos"
  — recebia de volta o aviso "sem responsável, não aparece para marcar", sem ter
  deixado de preencher nada: a tela é que criava o tipo sem dono. Agora ele nasce
  com quem está criando, e continua sendo possível escolher "Definir depois" de
  propósito. Nesse caso o aviso virou um atalho: clicar nele abre onde se define o
  responsável. O seletor também passou a mostrar o nome das pessoas em vez de um
  pedaço do identificador, e agora é possível remover o responsável depois de
  definido — o que a tela já oferecia e o sistema ignorava.

## [1.7.0] — 2026-08-27

### Adicionado

- **Agenda: marcar, remarcar e cancelar compromissos pela tela** O sistema ganhou uma Agenda. Dá para criar tipos de compromisso, ver a grade da
  semana, marcar um horário e remarcar ou cancelar pela própria tela, com o motivo
  registrado. A IA também consegue consultar os horários livres e marcar durante o
  atendimento, sem ninguém sair da conversa.

  Quem usa Google Agenda pode conectar a sua conta em Configurações, e os
  compromissos passam a aparecer nos dois lados. Isso é opcional: sem conectar, a
  Agenda funciona igual, e quem não mexer em nada não precisa fazer coisa alguma
  depois de atualizar.

### Corrigido

- **A versão só é publicada pelo caminho da release** Uma correção no nosso próprio processo de publicação, feita antes de causar
  problema: o sistema que cria a versão decidia apenas por haver um número novo
  escrito no histórico de mudanças. Bastava alguém escrever esse número junto de
  outra alteração para a versão sair sozinha, sem passar pela aprovação. Agora ele
  exige também a marca de que aquilo foi de fato um fechamento de versão.

- **A tela de atualização mostra tudo o que mudou desde a sua versão** Antes ela mostrava só o texto da versão mais nova. Quem pulava versões — por
  exemplo, quem estava na 1.4.0 e atualizava direto para a 1.6.0 — nunca via o que
  tinha mudado no meio do caminho, e isso incluía os avisos de coisas que exigiam
  a sua ação. Agora a tela lista todas as versões entre a sua e a nova, com os
  avisos reunidos no topo e cada um dizendo de que versão veio.

## [1.6.0] — 2026-08-26

### Adicionado

- **Formulários do Respondi entram como lead, com as respostas na ficha.** Antes, quem ligava
  um formulário do Respondi ao CRM recebia um erro e **nenhum lead era criado** — o webhook
  chegava com as respostas dentro de uma estrutura que o CRM não sabia ler, e a captação era
  recusada inteira. Agora o nome, o telefone, o e-mail e cada pergunta respondida chegam na
  ficha do contato, e o lead nasce no funil como qualquer outro. **Telefone sem código de
  país é lido como brasileiro** (`(11) 99999-8888` vira `+5511999998888`, a mesma regra que o
  WhatsApp já usava); número de fora do Brasil precisa vir com o `+` e o código do país.
- **Quem recusa contato no formulário aparece na linha do tempo.** Se a pessoa marcou que
  **não** aceita receber mensagens, isso vira um evento visível na ficha dela — em vez de a
  equipe descobrir o silêncio depois, sem saber por quê. Recusa é informação, não ausência
  de informação.
- **Todo lead que chega pelo formulário do Respondi já entra triado.** Cada envio é lido na
  hora e ganha, na ficha, uma classe (A, B, C ou D) calculada a partir da pontuação do próprio
  formulário — e, quando falta a pontuação, o valor honesto **"não avaliado"**, nunca uma
  classe chutada. Quem não tem telefone utilizável ou recusou o contato entra marcado como
  **desqualificado**, com o motivo. E o que **precisa de olho humano** — nome que parece spam,
  o mesmo telefone chegando com outro nome, ou um valor de investimento que contradiz o outro —
  fica sinalizado como **aguardando revisão**, sem travar nada: o lead entra no funil do mesmo
  jeito e continua elegível para o primeiro contato. Tudo isso aparece na linha do tempo da
  ficha, então dá para ver **por que** um lead foi parar onde foi parar.

### Corrigido

- **A IA avisa o cliente antes de chamar uma pessoa — antes ela saía de campo calada.**
  Quando o atendimento automático parava e a conversa ia para a fila humana, o cliente
  não recebia mensagem nenhuma: ele falava, e ninguém respondia. Acontecia nos dois
  caminhos que param a IA, e o pior deles era o silencioso — a IA tinha acabado de
  **perguntar o e-mail do cliente**, o sistema detectou insatisfação na mensagem dele e
  desligou o automático; o cliente respondeu a pergunta e ela caiu no vazio. Agora, em
  qualquer um dos caminhos, sai uma mensagem antes do silêncio, e ela é honesta com o
  estado da sua equipe: com gente disponível ela convida a aguardar; sem ninguém livre
  no momento, diz que o pedido ficou registrado; e numa instalação que ainda não
  configurou atendente nenhum, **não promete contato**. Quem pediu para **parar** de
  receber mensagens recebe a confirmação da parada, não uma oferta de atendente.
- **Quem vai assumir a conversa agora sabe se o cliente foi avisado.** O aviso na Central
  passou a dizer, em uma linha, se a pessoa do outro lado já sabe que alguém está vindo —
  é o que muda a primeira frase que o atendente digita.
- **Conversa parada por insatisfação detectada agora abre aviso na Central.** Esse caminho
  devolvia a conversa à fila e calava a IA sem avisar ninguém: o cliente sem resposta e a
  equipe sem sinal de que havia alguém esperando. Agora ele abre o mesmo aviso que os
  outros caminhos já abriam, e sem duplicar quando dois motivos disparam na mesma conversa.
- **O agente voltou a ouvir os áudios que chegam.** Quem mandava um áudio ouvia de volta
  "não consigo ouvir mensagens de voz" — e a transcrição ficava pronta no sistema meio
  minuto depois, sem ninguém para usá-la. A causa era de ritmo: as tarefas de bastidor
  (baixar o áudio, transcrever, tratar mídia) só eram acordadas uma vez por minuto, e a
  resposta ao cliente não espera tanto. Medido numa instalação real: a cadeia levava de
  103 a 188 segundos, e passou a levar 18. A transcrição em si sempre levou 4 segundos —
  o resto era fila. Nada para você fazer: vale assim que atualizar.
- **A caixa de conversas voltou a se atualizar sozinha — antes só recarregando a página.**
  A mensagem do cliente chegava, ficava guardada certinho, e a tela continuava parada: quem
  estava com a conversa aberta, olhando, não via nada até apertar F5. Valia também para o
  funil, o histórico do contato e as telas da IA. A causa veio de fora — uma peça de terceiros
  que o sistema usa mudou de comportamento numa atualização, e o aviso de "chegou coisa nova"
  passou a ser recusado em silêncio, sem erro em lugar nenhum. Agora a tela recebe de novo na
  hora, e ela também se recupera sozinha: se a conexão em tempo real cair, a lista e a
  conversa voltam a se sincronizar em pouco tempo em vez de ficar congeladas num passado que
  parece presente. Nada para você fazer — vale assim que atualizar.
- **A automação parou de dizer "Sucesso" para mensagem que ela nem tentou mandar.** Quando o
  envio era pulado — contato sem telefone, contato bloqueado, contato que recusou receber
  mensagens — a execução aparecia na aba Atividade como bem-sucedida. Pior que o defeito que a
  versão passada corrigiu: aquele pelo menos tinha tentado. Agora aparece como **Falhou**, com
  a razão.
- **Quem recusa receber mensagens no formulário para de receber automação.** A recusa já ficava
  visível na linha do tempo, mas nada no motor a lia — as automações de WhatsApp saíam do
  mesmo jeito. Agora a recusa fica registrada na ficha da pessoa e as duas ações de envio
  automático (mensagem escrita por você e mensagem escrita pela IA) a respeitam. Vale também
  quando a pessoa **já era seu contato** e mudou de ideia num envio novo. **Quem nunca
  respondeu à pergunta continua recebendo normalmente** — não perguntar não é a mesma coisa
  que ouvir "não".

### Alterado

**O Tailwind passou da versão 3 para a 4.** Para quem roda numa VPS, não muda nada:
nenhuma variável nova, nenhum passo manual, o `update.sh` segue igual. O que muda é a
aparência de algumas telas — e para melhor, na maioria dos casos:

- **Avisos e destaques que não apareciam passam a aparecer.** O jeito antigo de escrever
  "esta cor com 10% de opacidade" era descartado em silêncio quando a cor vinha do tema —
  então o fundo rosado do aviso de erro, a borda avermelhada do campo inválido e vários
  realces de seleção simplesmente não pintavam. São 62 marcações assim, em 252 lugares,
  que agora mostram o que sempre deveriam ter mostrado.
- **O respiro entre o rótulo e o campo do formulário foi mantido.** A nova versão mudou de
  que lado o espaço é aplicado, e isso colava o rótulo no campo em todo formulário do
  sistema. Corrigido antes de sair.

### Corrigido

- A lista de opções de um `<select>` nativo perdeu 2px de recuo interno. Efeito visual
  não confirmado — o menu é desenhado pelo sistema operacional, não pelo navegador.

## [1.5.0] — 2026-08-25

O histórico de quem chega pelos seus formulários agora existe — inclusive de quem **não**
entrou. As automações passam a poder responder com uma mensagem escrita pela IA a partir do
que a pessoa preencheu. E a automação parou de marcar "Sucesso" para mensagem que nunca
chegou ao cliente.

O Inbox passa a dizer **quem manda em cada conversa** — e o conserto principal não é de tela:
clicar "Assumir" não parava o atendimento automático, então os dois respondiam o mesmo cliente.

### ⚠️ Requer atenção

**O horário em que as automações mandam mensagem passa a ser o seu, e não o do servidor.**
A proteção de horário da automação era medida pelo relógio da máquina, que roda em UTC —
então a faixa "7h às 22h" era, na prática, **4h às 19h de Brasília**. Duas consequências
que você talvez tenha visto sem saber a causa: uma automação disparada às 19h30 não saía e
ficava esperando até as 4h da manhã seguinte; e uma disparada de madrugada saía, mandando
mensagem para o cliente às 5h. Agora vale o seu fuso, e **vale a faixa que você configurou
em Conexões › Proteção de envio** — a mesma que a IA já respeitava. Se você apertou ou
ampliou esse horário achando que só mexia com a IA, confira: agora ele também rege as
automações. Quem nunca mexeu fica com 7h às 22h no **horário de Brasília**. Se o seu negócio fica em outro
fuso, escolha o seu em **Conexões › Proteção de envio**, no campo "Fuso horário da janela" — e
confira conexão por conexão, porque essa escolha é de cada número, não da instalação inteira.

**Assumir uma conversa agora PARA o atendimento automático nela. Antes não parava, e os dois
respondiam o mesmo cliente.** Quem clicava "Assumir" no Inbox ganhava a conversa na tela, mas o
automático continuava respondendo por baixo — ele só ficava quieto por 5 minutos depois que o
atendente mandava uma mensagem, e voltava a falar sozinho em seguida. Agora assumir e transferir
silenciam o automático naquela conversa, e **"Liberar" ou "Fechar" desfazem o silêncio que a
pessoa pôs**. Há uma exceção que importa: quando foi o próprio automático que passou o caso
para uma pessoa, "Liberar" e "Fechar" **não** o trazem de volta — ali quem devolve é o botão
**"Devolver ao automático"**, no topo da conversa. É justamente o caso das conversas que
aparecem na aba "Fila" (veja o aviso abaixo). Se a sua
equipe se acostumou a assumir a conversa e deixar a IA responder junto, esse hábito muda aqui.

**A distribuição por rodízio NÃO cala o automático** — distribuir é escolher quem cuida se precisar,
não tomar a conversa. Só o clique de uma pessoa silencia.

**A aba "Fila" vai mostrar mais conversas do que mostrava, e o número do badge pode subir de uma
vez.** Não é conversa nova: são as que a IA já tinha passado para uma pessoa e que não apareciam em
aba nenhuma. Se o número saltar depois de atualizar, é isso — e vale olhar, porque são pessoas
esperando resposta há mais tempo do que você imaginava.

Esta versão **mexe no banco de dados**. O `update.sh` aplica sozinho; não há passo
manual — são tabelas e estados novos: o histórico de captação, o estado de espera das
automações e o registro de quem está no comando de cada conversa.

**Se você está vindo da 1.4.0, os dois avisos abaixo são da 1.4.1 e valem para você.** A tela de
atualização mostra só a seção da versão que você está instalando, então eles vão repetidos aqui
para não passarem em branco. Se você já atualizou para a 1.4.1, já os leu — pule.

- **A IA passa a atender aos domingos, e antes não atendia.** O padrão de fábrica da janela
  anti-banimento mudou na 1.4.0: domingo era dia mudo e passou a ser dia normal (a faixa de
  horário continua a mesma). Se o seu negócio depende de silêncio no domingo, desligue em
  **Conexões › Proteção de envio**, na chave "Enviar aos domingos", por canal. Quem já tinha
  mexido ali teve a escolha respeitada. **Novidade desta versão:** essa chave passou a valer
  também para as automações — desligá-la faz o lead que preencher seu formulário no domingo
  só ser abordado na segunda de manhã.
- **Duas conexões oficiais do WhatsApp com a mesma conta da Meta: fica com o identificador a
  conexão MAIS RECENTE**, e a mais antiga recebe o sufixo `-conflito-`. Nada foi apagado. A 1.4.0
  disse o contrário — se você apagou a conexão SEM o sufixo por causa daquela frase, era a que
  estava funcionando; reconecte o número em Conexões.

### Adicionado

- **"Leads recebidos", em Webhooks: quem chegou pelo formulário, com o que preencheu.**
  Até aqui, o formulário do seu site entregava o lead e não sobrava registro nenhum de como
  ele chegou. Agora há uma aba com a lista: nome, data e hora, de qual formulário veio, a
  página em que a pessoa estava, o endereço de internet dela e as etiquetas de campanha
  (`utm_source` e companhia). Clicando na linha, todos os campos do formulário como ela
  preencheu, e um atalho para o lead no funil. Dá para filtrar por busca, por origem, por
  resultado e por período.
  **E aparece também quem NÃO entrou.** Um formulário cujos campos o CRM não reconhece era
  recusado em silêncio: quem colou o endereço no site só sabia que "não chegou nada", sem
  ter onde olhar. Agora a tentativa aparece na lista como *Não entrou*, com o motivo escrito
  em português e os campos crus do jeito que vieram — que é o que permite consertar o
  formulário em vez de adivinhar.
- **Nas automações, no "então": "Mensagem escrita pela IA".**
  Antes só dava para mandar um texto pronto com `{{nome}}` e `{{telefone}}`. Se o seu
  formulário pergunta o segmento, o tamanho da equipe e a maior dificuldade de hoje, quem
  tem 3 funcionários e quem tem 300 recebiam a mesma frase. Agora você escolhe um agente já
  **publicado**, escolhe o número, e escreve no campo *"O que a IA deve fazer com esses
  dados"* — por exemplo, "cite a dificuldade que ela citou e ofereça uma conversa de 15
  minutos". A IA recebe as respostas do formulário e essa sua instrução, e sabe que é a
  primeira mensagem de alguém que acabou de preencher e não está esperando resposta. É o
  mesmo desenho da instrução de um passo de follow-up.
  Quem envia continua sendo a automação — com horário de envio, descadastro e espaçamento
  entre mensagens valendo igual. A IA escreve o texto; ela não fala com ninguém por conta
  própria.

### Corrigido

- **A automação dizia "Sucesso" para mensagem que não chegou ao cliente.** Era o relato que
  originou boa parte desta entrega: automação ligada, lead entrando pelo formulário, a aba
  Atividade mostrando um "Sucesso" verde — e nenhuma mensagem no celular de ninguém. A
  automação só sabia perguntar se tinha dado erro de programa; ela não olhava se a mensagem
  de fato saiu. Agora ela olha: quando o envio falha, o resultado aparece como falha, com o
  motivo em português ("Não conseguimos falar com o serviço de WhatsApp. Confira se ele está
  no ar."), e um aviso é aberto na **Central de avisos** — o menu "Alertas", dentro de IA › Acompanhar o
  agente — **nomeando a regra que falhou**,
  porque um erro que só existe numa aba que ninguém abre é um erro invisível.
- **A automação que estava só esperando o horário parecia não ter rodado.** Ao adiar um
  envio, ela não gravava nada: "não apareceu nada na Atividade" e "a automação não funcionou"
  eram a mesma tela. Agora a espera é um estado visível na aba Atividade — **Aguardando envio** —, com o motivo ao
  lado. Nem sempre é o relógio: o mesmo estado aparece quando o número de WhatsApp está
  desconectado, e aí o que resolve é reconectar em Conexões, não esperar.
- **O agente ficava mudo quando o provedor dele era diferente do provedor padrão da
  organização.** Quem publicou o agente numa IA (por exemplo OpenAI) enquanto a organização
  continuava configurada em outra (Anthropic) tinha TODA mensagem de WhatsApp engolida: a
  conversa ficava sem resposta, sem erro visível na tela do agente. Por baixo, um verificador
  interno saía com o endereço de uma IA e o nome de modelo da outra, tomava "modelo inexistente"
  e derrubava o atendimento inteiro antes de o agente falar. Não era preciso mexer em nada para
  cair nisso — bastava a combinação. O rastro sempre esteve em **IA › Execuções** e o aviso em
  **Central de avisos** ("Job descartado após esgotar tentativas"); o que faltava era o
  atendimento acontecer.
- **O papel Operador mandava o modelo escolhido para o provedor errado**, pela mesma razão, e
  o campo "Modelo do Operador" deixado em branco não fazia o que a tela prometia: ele diz *"A
  mesma que conversa"* e usava o modelo padrão da organização. Agora vazio herda de verdade o
  modelo do Conversador.
- **O painel de Provedores de IA mostrava o modelo errado** nos pontos que herdam do agente
  (classificador de etapa, detector de manipulação, verificador de promessa, resumo de
  conversa, checkpoint, sugestão de resposta e a mensagem escrita pela IA nas automações):
  anunciava o padrão da organização enquanto o sistema usava o do agente. A coluna passa a
  mostrar o que de fato roda, e diz de quem herdou. **A "Mensagem escrita pela IA" desta
  mesma versão caía no primeiro item desta lista** — nas instalações com agente num provedor
  diferente do padrão da organização, ela não sairia.

- **A promessa da 1.4.0 sobre o limite de gasto agora é verdade.** Aquela versão disse que, quando o
  limite para a IA, "as conversas que estavam sendo atendidas vão para a fila de atendimento
  humano". Elas iam — mas a fila na tela não as mostrava: a aba, o contador e o painel do gerente
  procuravam um estado e a conversa escalada ficava em outro. Quem confiou no aviso e foi olhar a
  fila não encontrou nada lá. Vale para toda passagem para humano, não só a do limite.
- **O número da fila que o cliente ouve e o que a equipe vê eram contados de formas diferentes.** O
  "você é o Nº da fila" enviado pelo WhatsApp incluía as conversas escaladas; o número mostrado ao
  atendente não. Agora é a mesma conta dos dois lados.
- **Dava para saber quem atende uma conversa pela IA, mas não pela tela.** O nome do atendente
  chegava ao agente e não ao Inbox, que só tinha o código interno. O cabeçalho e a lista passam a
  mostrar **quem está no comando** — pessoa (com nome e iniciais) ou automático —, e o selo diz o
  **motivo** quando o automático está parado: alguém assumiu, está pausado para aquele cliente, ou
  volta sozinho em instantes.
- **Faltava o botão de desligar.** Havia "Devolver ao automático" e nada para pausá-lo — ele só
  parava por conta própria. Agora o mesmo lugar tem os dois lados.
- **Assumir, transferir e liberar não apareciam no histórico da conversa.** Passavam sem deixar
  rastro no painel lateral; o motivo escrito ao transferir ficava só no registro de auditoria, que
  o atendente não abre. Agora as quatro ações viram linha na atividade, **com o nome de quem fez** —
  antes toda ação humana aparecia como "Você/time".
- **Conversa encerrada deixava de dizer quem a atendeu**, justamente na aba "Fechadas".
- **Numa instalação sem nenhuma IA configurada, a tela dizia "Automático atendendo".** Não havia
  automático nenhum: eram conversas sem ninguém.
- **Quem não enxerga uma conversa conseguia ler o histórico de quem a atendeu.** Com a visibilidade
  restrita por atendente, o registro de troca de responsável não respeitava esse limite.

## [1.4.1] — 2026-08-25

O primeiro acesso passa a **perguntar como você já usa o seu número**, em vez de supor que
todo mundo conecta lendo um código no celular. Instalar numa máquina que já tem o CRM no ar
deixou de derrubar a instalação existente. E a seção da 1.4.0 descreveu errado duas mudanças
que chegam a todo mundo — uma delas invertida: como a tela de atualização lê o texto congelado
na versão, o conserto do texto só alcança você pela publicação de uma versão nova, que é esta.

### Adicionado

- **O primeiro acesso pergunta como você já usa o seu número, em vez de supor.** Existe mais
  de um jeito de ter WhatsApp para empresa, e cada um conecta de um jeito — mas o passo do
  telefone só sabia um: ele mostrava o código para ler no celular e pronto. Quem tem conta
  oficial na Meta, ou contrata o WhatsApp por uma empresa parceira, passava por ali sem nunca
  ser perguntado; o número entrava cadastrado do jeito errado e a pessoa só descobria depois,
  em outra tela, com o funcionário já montado por cima. Agora o passo abre com a pergunta e
  três respostas: **ler um código com o celular** (que é como quase todo mundo faz e segue
  sendo o caminho mais curto), **conta oficial na Meta**, ou **provedor parceiro** — e cada
  uma leva ao formulário certo, ali mesmo, sem sair do passo a passo. Escolher errado não
  tranca nada: dá para voltar e trocar. E nada é criado enquanto você não escolhe — antes, o
  número era cadastrado como "por código" só de você chegar na tela.
- **Quem escolhe a conta oficial é avisado ANTES de ir buscar as credenciais.** Esse caminho
  precisa de duas configurações no servidor que a instalação não cria sozinha, e sem elas o
  número **envia mas nunca recebe** — sem erro em lugar nenhum, que é o pior jeito de falhar.
  A tela diz isso antes de você abrir o painel da Meta, e aponta o caminho que funciona hoje.

### ⚠️ Requer atenção

**A IA passa a atender aos domingos, e antes não atendia. A 1.4.0 fez essa mudança e não
avisou.** O padrão de fábrica da janela anti-banimento mudou: domingo era dia mudo e passou a
ser dia normal (a faixa de horário continua a mesma). Quem nunca mexeu nessa configuração —
que é a maioria — recebeu a mudança na atualização, sem escolher. Se o seu negócio depende de
silêncio no domingo, desligue em **Conexões › Proteção de envio › "Enviar aos domingos"**, por
canal. Se você já tinha mexido ali, a sua escolha foi respeitada e nada mudou.

**Se você tem duas conexões oficiais do WhatsApp com a mesma conta da Meta, a 1.4.0 disse o
contrário do que acontece — confira antes de apagar qualquer uma.** O texto dizia que a
atualização "mantém a mais antiga". É o inverso: **fica com o identificador a conexão MAIS
RECENTE** (criá-la exigiu provar posse da conta na tela), e é a **mais antiga** que recebe o
sufixo `-conflito-`. Nada foi apagado. A conexão com o identificador limpo é a que continua
recebendo; a marcada como conflito aparece como falha na verificação de saúde, e isso é
esperado. **Se você apagou a conexão sem o sufixo por causa daquela frase, é a que estava
funcionando** — reconecte o número pela tela de Conexões.

Fora isso, nada exige ação sua. Não há mudança de banco de dados nesta versão.

### Corrigido

- **Instalar numa VPS que já tem o CRM no ar não derruba mais a instalação existente.**
  O instalador confundia a instalação de outra pasta com ele mesmo sendo rodado de novo e
  subia por cima: o site seguia no ar, mas passando a usar o banco da pasta nova — e o
  primeiro sintoma era a senha "parar de funcionar". Agora ele para antes de tocar em
  nada, diz em que pasta está a instalação que já existe e ensina como atualizá-la. Isso
  vale em qualquer arranjo de servidor — inclusive nas VPS em que o painel da hospedagem
  (Hostinger, Coolify, Dokploy) é quem atende as portas, e nas pastas que já tinham
  concluído uma instalação antes, onde a checagem anterior se desligava sozinha.
- **`salir` sozinho não descadastrava.** A 1.4.0 anunciou que "`baja`, `salir` e
  `no quiero recibir` descadastram"; medido com a função real, `baja` e `no quiero recibir`
  funcionavam e `salir` não — a palavra estava fora da lista. `salir` é o `sair` em espanhol,
  que já estava lá desde sempre. Continua valendo só a palavra **sozinha**: "voy a salir
  ahora" tem três palavras e não bloqueia ninguém.
- **A importação de planilha assume Brasil, e isso não estava escrito em lugar nenhum.**
  Telefone sem código de país entra como brasileiro: `(11) 99999-8888` vira
  `+5511999998888` — a mesma regra que o WhatsApp já usava ao receber mensagem. Se a sua
  planilha tem números de fora do Brasil, escreva-os com o `+` e o código do país (`+351…`),
  que aí são respeitados como estão. O comportamento não mudou; o que faltava era a frase.
- **Um controle citado pelo nome errado.** A 1.4.0 mandava procurar "Parar a IA no limite" na
  tela de orçamento de IA. O rótulo real mostra o seu número: "Parar a IA ao chegar em
  US$ 50,00". Nada mudou na tela — mudou a descrição.

## [1.4.0] — 2026-08-24

Esta versão muda o primeiro acesso. Instalar deixou de ser "configurar uma IA" e passou a ser **montar um funcionário e vê-lo atender antes de terminar**: você diz como ele se chama, o jeito dele falar e as regras da casa, monta o quadro de clientes do **seu** ramo — não o de loja virtual que todo mundo ganhava igual — e, no último passo, conversa com ele como se fosse um cliente. Nada sai pelo WhatsApp; você só confere que ele funciona antes de confiar nele. Junto disso, seis causas diferentes que deixavam uma IA publicada **muda** foram medidas num servidor real e consertadas uma a uma; o sistema passou a ser usável no celular; e você pode pôr o seu nome, o seu logo e a sua cor em tudo — pela tela, sem linha de comando.

### ⚠️ Requer atenção

**Desta vez, rodar o `update.sh` UMA vez basta — a instrução da 1.3.0 não vale mais.** A
versão anterior pedia duas execuções porque a primeira deixava o processo que faz a IA
atender "solto": acompanhando o desenvolvimento em vez de ficar parado na sua versão, como o
resto do sistema. Isso acabou. A atualização agora fixa as três partes do sistema na mesma
versão de uma vez só, e se ainda assim alguma ficar solta — é o caso de quem está vindo de
uma versão anterior à 1.3.0 — o próprio sistema fecha essa ponta sozinho em até 5 minutos,
sem você fazer nada. Rodar duas vezes por hábito não estraga nada: a segunda vez responde
"você já está na versão mais recente" e não toca em nada.

**Antes de ligar a parada automática da IA, confira o número do seu limite.** Ele sempre foi
em dólar, e a tela dizia real (está explicado acima). Quem escreveu "50" pensando em reais
tem, na verdade, um limite de US$ 50 — cerca de cinco vezes maior do que imaginava. Seu
limite não foi alterado; o que mudou é a tela finalmente dizer a verdade. Como a parada
automática nasce desligada em todo mundo, dá tempo de olhar o número com calma antes de
armá-la.

Fora isso, nada exige ação sua. O arquivo de configuração criado na sua instalação continua
valendo como está: tudo que é novo nesta versão já vem com um valor padrão, e a própria
atualização acrescenta o que faltar. O banco de dados também passa a se limpar sozinho a
partir daqui, jogando fora registro técnico velho que ninguém lê — conversa, contato,
mensagem e histórico de atendimento não são tocados, e não há nada para você configurar.

**Se você tem DUAS conexões oficiais do WhatsApp com a mesma conta da Meta, uma delas vai
mudar de nome.** Era possível cadastrar a mesma conta duas vezes — numa agência com dois
clientes, ou num número que trocou de empresa — e, enquanto isso durou, as mensagens
recebidas eram descartadas em silêncio para as **duas**. A atualização mantém a mais antiga e
marca a outra como conflito, acrescentando `-conflito-` ao identificador dela. **Nada é
apagado**: se você encontrar uma conexão com esse nome, é essa a razão — confira qual das duas
deve continuar e apague a que sobra.

**Se você usou o botão "Configurar Catálogo" na tela de conhecimento, confira o que ficou
gravado.** Ele salvava o que você escrevia como se fosse uma pergunta e resposta, não um
catálogo — então o conteúdo está lá, mas na gaveta errada. Vale reabrir e refazer.

**Se o seu sistema ainda chama a sua empresa de "Minha Empresa", troque em Configurações.** A
instalação cria a empresa com esse nome provisório, e o primeiro acesso trazia esse texto já
escrito no campo — quem seguiu adiante sem apagar ficou com ele. Agora o campo vem vazio, mas
quem já passou por ali precisa corrigir à mão.

### Adicionado

- **Instalar deixou de ser "configurar um sistema": agora você monta um funcionário e o vê
  atender antes de terminar.** O passo a passo do primeiro acesso foi de 4 para 6 etapas e
  mudou de assunto. Ele abre mostrando o que a sua instalação já trouxe pronta — servidor e
  banco de pé, qual inteligência artificial foi contratada, se o WhatsApp está pronto para
  parear —, em vez de um formulário em branco. O antigo "Configurar IA" virou **"Treine seu
  funcionário"**: como ele se chama, o jeito dele falar e — o campo que faltava — as regras
  da casa (horário de atendimento, o que nunca prometer, como chamar o cliente). Ali mesmo a
  chave da inteligência artificial é testada de verdade: não "a chave foi aceita", que um
  provedor responde até com a conta zerada, mas uma resposta real, que é a única coisa que
  prova que há crédito. Se a instalação veio sem chave, o campo para colar a sua está nessa
  tela, um clique antes de o funcionário nascer com ela. Entrou o passo **"Onde ele
  organiza"**, que monta o quadro de clientes do **seu ramo**: uma clínica termina com "Quer
  agendar" e "Consulta marcada", em vez do quadro de loja virtual — "Carrinho abandonado",
  "Em separação", "Enviado" — que toda instalação ganhava igual, sem nunca ter sido
  perguntada em que ramo entrou. Você pode renomear, remover e acrescentar colunas antes de
  gravar. E entrou o passo **"Ver ele atender"**: você escreve como se fosse um cliente e lê
  a resposta dele antes de terminar, sem nada sair pelo WhatsApp e sem criar conversa nenhuma
  — antes, o último clique despejava você numa caixa de conversas vazia, depois de montar um
  funcionário que você nunca tinha visto fazer nada. O funcionário que nasce dali também é
  outro: deixou de ser um respondedor de perguntas e já vem sabendo mexer no CRM sozinho —
  procurar o cliente, anotar o que ele informou, criar a oportunidade no funil e mover o
  cliente de etapa —, apontado para o funil certo e sabendo dizer o que o seu negócio faz. E,
  no fim, em vez de te largar numa tela vazia, o sistema se apresenta: as seis partes
  principais, cada uma com uma frase sobre o que ela faz por você.
- **Ponha o seu nome, o seu logo e a sua cor no sistema — pela tela, sem linha de comando e
  sem reiniciar nada.** Em *Administração › Marca*, quem é dono da instalação troca o nome do
  sistema, escolhe a cor da marca e sobe o arquivo do logo (PNG ou JPG, até 512 KB). Salvou,
  recarregou: a barra lateral, os botões, o destaque que aparece ao redor do campo em que você
  está digitando, o título da aba e o ícone do navegador já estão repintados. Até esta versão,
  a única forma de trocar a marca era editar um arquivo no servidor por linha de comando e
  reiniciar o sistema inteiro — e quem editava o código para conseguir isso perdia a mudança
  na atualização seguinte, quase sempre sem perceber. A cor não é aplicada crua: o sistema
  deriva onze tons dela e mostra onde cada coisa vai pousar antes de você salvar; se a cor
  escolhida deixaria o texto do botão ilegível no tema escuro, ele anda os degraus necessários
  sozinho. Nada de escolher amarelo e descobrir depois que o botão ficou branco no branco. E
  cada empresa dentro da mesma instalação pode ter a própria marca, em *Configurações ›
  Marca*, sem depender de quem instalou o sistema: o que ela deixa em branco é herdado da
  instalação.
- **A sua marca sai da tela e alcança o resto do produto.** O ícone da aba do navegador (que
  simplesmente não existia — a aba ficava sem ícone nenhum), o nome que aparece no aplicativo
  autenticador de quem liga a verificação em duas etapas, o nome do remetente dos e-mails e,
  principalmente, os e-mails de confirmação de conta e de recuperação de senha — que até aqui
  chegavam ao seu cliente com o nome do nosso produto, no primeiro contato dele com o sistema.
  O instalador também passou a perguntar a cor da marca: antes ele perguntava só o nome e
  entregava o verde do nosso produto em toda tela e em todo e-mail de acesso, então quem
  instalava para um cliente entregava a marca dele pintada com a cor de outro. Uma ressalva
  que vale conhecer: os e-mails de acesso são lidos de fora do CRM, então trocar a cor pela
  tela depois **não** reescreve esses e-mails — é a resposta dada ao instalador que faz as
  duas pontas nascerem iguais. Uma exceção é deliberada: **o relatório de dados pessoais em
  PDF nunca leva a sua marca.** Ele nomeia a empresa que responde legalmente pelos dados,
  porque é um documento que atende a um direito do titular — pôr ali o nome de quem só
  hospeda inverteria quem responde pelo quê.
- **Dá para usar o sistema pelo celular.** A barra lateral fixa era a única navegação
  existente e nunca sumia: num celular comum ela empurrava o conteúdo para fora da tela, e não
  havia botão nenhum para escondê-la. Agora ela vira uma gaveta que abre pelo topo e fecha
  sozinha ao trocar de tela, e todo botão ganha um alvo de toque de dedo no celular, voltando
  ao tamanho compacto no computador, onde quem aciona é o mouse. Junto veio uma varredura por
  todo o sistema atrás do que empurrava a tela para o lado: os cabeçalhos das páginas, a lista
  de funis, a barra de seleção em massa do quadro de vendas, campos de busca de largura fixa,
  tabelas soltas e os rodapés de "Pular/Continuar" do cadastro inicial. E a página inteira
  nunca mais desliza de lado: quando algo é largo demais — uma tabela, o quadro de vendas —, é
  só aquela parte que rola, e o resto da tela fica parado.
- **A verificação em duas etapas virou escolha, e não uma porta trancada na primeira tela.**
  O botão "Começar a usar" entregava o dono da instalação num bloqueador de tela cheia
  pedindo um aplicativo autenticador — um passo extra que o próprio wizard nunca anunciou,
  bem na hora de finalmente ver o produto funcionando. Agora quem administra decide se ela é
  obrigatória, em Configurações › Segurança, e o padrão é não exigir. Quem já usa a
  verificação continua protegido exatamente como está.
- **O produto passou a falar a sua língua: "Pipeline" e "Kanban" saíram da tela.** Eram cinco
  nomes para a mesma coisa, e três apareciam juntos na mesma tela. Agora o menu tem **Funis**
  (onde você abre o funil) e **Etapas do funil** (onde você configura o que cada coluna
  significa). Nas telas do primeiro acesso, o mesmo: o passo do WhatsApp parou de mostrar
  códigos internos como "Sessão: org_f3d61bc0" e "Status: INIT", e o passo do time deixou de
  listar "viewer, agent, manager, admin" em inglês.
- **Dá para responder "em cima" de uma mensagem, e enviar o contato de alguém, como no
  WhatsApp.** Passe o mouse (ou toque, no celular) sobre a mensagem, escolha *Responder*, e
  ela aparece citada logo acima do campo de texto — com um × para desistir. O cliente recebe a
  sua resposta pendurada na mensagem original, do jeito que ele já conversa no WhatsApp.
  Funciona nas duas formas de conectar o número, e o botão aparece também no celular — antes
  de sair, ele só existia para quem tem mouse, ou seja, sumia justamente onde a maior parte do
  atendimento acontece. Trocar de conversa limpa a citação sozinho, para nenhuma frase sair
  citando a mensagem de outro cliente. E no "+" ao lado do campo de mensagem existe agora a
  opção *Contato*: escolha alguém da sua base ou digite nome e telefone na hora, e chega no
  WhatsApp do cliente como cartão de contato de verdade — ele salva ou chama a pessoa com um
  toque. Quando um cartão de contato chega para você, ele fica clicável dentro do CRM: um
  toque abre a conversa com aquela pessoa, criando o contato se ainda não existir. O telefone
  é conferido antes de sair, para o cartão não levar um número que não existe no WhatsApp (o
  caso clássico do nono dígito).
- **Importar contatos de uma planilha.** Botão *Importar* na tela de Contatos: você sobe um
  arquivo CSV — o que qualquer Excel ou Google Planilhas exporta — e ele entra com nome,
  telefone, e-mail, CPF, aniversário e etiquetas. Os títulos das colunas podem estar em
  português (`nome`, `telefone`, `celular`, `aniversário`, `etiquetas`), e o separador pode
  ser vírgula ou ponto-e-vírgula, que é o que o Excel em português usa. Cada linha tem
  desfecho próprio na tela: importada, já existia, ou recusada com o motivo escrito — uma
  linha errada não derruba a planilha inteira. Até 500 linhas por vez. Arquivo `.xlsx` é
  recusado com a instrução de exportar como CSV, em vez de importar pela metade.
- **De qual anúncio o contato veio.** Quando alguém chega pelo botão "Enviar mensagem" de um
  anúncio do Facebook ou do Instagram, o CRM guarda a campanha e o anúncio na ficha do
  contato, e o negócio nasce etiquetado como vindo de anúncio. É gravado no primeiro contato e
  nunca reescrito depois — o primeiro toque é o que conta. Compartilhar um post normal, sem
  impulsão, não é confundido com anúncio pago. Anúncios do Google ainda não são identificados.
- **O atendimento automático volta a funcionar no domingo.** Até agora a IA ficava calada o
  domingo inteiro, e quem escrevia no domingo só era respondido na segunda-feira. A regra
  existia para reduzir risco de bloqueio, mas o que protege disso é o ritmo de envio, não o
  dia da semana — o custo caía sobre o seu cliente, à toa. Agora o domingo é liberado por
  padrão. A janela da noite continua valendo (nada sai entre 22h e 7h) e, se você faz
  prospecção ativa e prefere não incomodar no fim de semana, dá para desligar o domingo em
  Conexões › **Proteção de envio**, número por número — a chave se chama "Enviar aos
  domingos".
- **O limite de gasto com IA passa a valer de verdade — e nasce desligado.** Até agora a tela
  de Uso de IA › Orçamento deixava você escrever um limite mensal, mas quem barrava a chamada
  olhava para outro lugar: nenhuma instalação estava protegida, e a tela dizia que estava.
  Agora o número que você digita é o número que decide. Para que ligar isso não corte o
  atendimento de ninguém por engano, a proteção **começa desligada em todo mundo** e só liga
  em três passos, na tela: *Só acompanhar* → *Me avisar* → *Parar a IA no limite*. Não dá para
  pular direto para a parada, e quando você a arma ela **só começa a valer 72 horas depois**
  (dá para renunciar a essa espera marcando a caixa). **Você não precisa fazer nada** — quem
  não abrir essa tela continua exatamente como está hoje.
- **Quando o limite para a IA, ninguém fica sem resposta.** As conversas que estavam sendo
  atendidas vão para a fila de atendimento humano, com um aviso na Central de avisos
  explicando o que aconteceu. Cada uma volta ao automático pelo botão "Devolver ao automático"
  no cabeçalho da conversa. Aumentar o limite evita paradas novas, mas não devolve sozinho as
  conversas que já pararam. E, antes de qualquer parada, um aviso na Central de avisos aparece
  quando o gasto passa do ponto que você escolheu — ele se apaga sozinho quando o gasto volta
  para baixo do limite ou o mês vira.
- **O banco de dados passou a se limpar sozinho, todo dia.** Três arquivos internos cresciam
  para sempre e nunca eram podados: o arquivo bruto de tudo o que o WhatsApp envia, a fila de
  tarefas da IA e o registro de auditoria. Numa instalação real, o arquivo do WhatsApp sozinho
  era **86% do banco inteiro** — 468 MB de um total de 545 MB, contra menos de 10 MB de
  mensagens, contatos e leads somados. E o plano gratuito do Supabase acaba em 500 MB, que é
  onde vive a maior parte de quem instala. Agora, a cada dia: o conteúdo pesado dos eventos do
  WhatsApp é esvaziado depois de 7 dias e a linha some depois de 90 (o resumo continua lá,
  para investigar problema antigo); a fila de tarefas já concluídas é apagada depois de 90
  dias; e a auditoria segue a validade definida no arquivo de configuração da sua instalação,
  com 5 anos de padrão e um piso de 90 dias que não dá para furar. Nada que ainda tem dono é
  tocado: tarefa esperando, tarefa rodando agora e tarefa que falhou e virou aviso na Central
  de avisos ficam onde estão. **Você não precisa configurar nada** — já vem ligado com esses
  valores.
- **O agente de atualização passa a fixar sozinho a versão que ficou solta**, em até 5
  minutos, sem você fazer nada — ele grava a versão que já está rodando. O que ele **nunca**
  faz é mexer numa configuração que você escreveu à mão: se você escolheu acompanhar um canal
  de propósito, ele respeita e só avisa.

  Se você veio da 1.3.0 e rodou o `update.sh` uma vez só, é ele que termina o serviço a partir
  desta versão — a instrução de "rodar duas vezes" deixa de ser necessária daqui em diante.
- **Da lista de Contatos direto para a conversa.** Na lista de Contatos e na ficha de cada
  pessoa há agora um botão que leva direto para a conversa dela no Inbox, sem precisar
  procurá-la na lista de conversas.
- **Dá para instalar numa VPS que já tem painel (CloudPanel e similares).** Antes, o
  instalador tentava subir o próprio servidor web nas portas 80 e 443, que já estavam
  ocupadas pelo painel, e a instalação parava ali. Agora existe um passo a passo oficial para
  esse caso, na documentação do projeto, em `docs/runbooks/cloudpanel.md` — contribuição de um
  usuário da comunidade.
- **Quem usa a OpenRouter parou de ter o próprio consumo creditado ao site de outra pessoa.**
  Uma versão anterior levava, fixo dentro do sistema, o endereço de um site de terceiro — e o
  consumo de todo mundo ficava atribuído a um lugar que não é seu. Isso saiu. Se você quiser
  aparecer com o seu próprio nome no painel da OpenRouter, há dois campos no arquivo de
  configuração da instalação (`OPENROUTER_APP_URL` e `OPENROUTER_APP_TITLE`), os dois
  opcionais e vazios por padrão: deixando em branco, nada é enviado junto com as chamadas.

### Corrigido

- **Seis causas diferentes deixavam uma IA publicada muda — e nenhuma aparecia como erro.** Medidas
  uma a uma num servidor real, com o dono dizendo "a IA não responde": em todas, a tela dizia "IA
  atendendo" e a mensagem não chegava.
- **Número de WhatsApp recém-conectado: a IA não respondia a ninguém.** Todo número novo entra com
  uma trava de segurança nos primeiros dias, para não ser banido — e a trava segurava também as
  RESPOSTAS a quem escrevia para você. O cliente mandava "Oi" e passavam horas. Agora ela segura só
  o que o sistema começa sozinho; responder quem escreveu nunca é retido, e as conversas paradas por
  essa causa voltam à fila sozinhas.
- **Uma regra de distribuição vazia sequestrava o atendimento inteiro.** Dá para ligar uma regra em
  dois cliques e não colocar ninguém nela — e aí toda conversa ia para um atendente genérico, sem as
  suas instruções, morrendo em silêncio enquanto o agente certo esperava do outro lado. Agora isso
  não tira a conversa de quem já atendia.
- **Quem escrevia depois das 22h nunca era respondido — nem no dia seguinte.** Fora da faixa em que
  o sistema pode enviar (7h às 22h), a resposta era perdida: o atendimento era dado como concluído e
  nada saía. Agora ela é adiada e entregue quando o horário abre. No mesmo caminho, o **horário de
  funcionamento que você configurava não era lido por ninguém** (medido: 8h às 18h, de segunda a
  sexta, com o agente respondendo às 21:55 de uma terça), e a **retomada de quem sumiu morria em 25
  minutos**, dando o contato como perdido antes das 23h. Agora a espera aguenta a noite inteira e a
  mensagem sai pela manhã.
- **A tela do agente anunciava uma coisa e o motor rodava outra.** O cartão mostrava a inteligência
  escolhida no dia da criação, não a publicada; a mesma tela dizia "Publicado" e "Rascunho" ao mesmo
  tempo, e a resposta tranquilizadora era a errada; e **arquivar um agente antigo não arquivava
  nada** — ele seguia recebendo conversas. Agora as telas mostram quem realmente atende.
- **O que você configurava no agente não chegava ao atendimento.** "Abri o agente e o prompt sumiu"
  era comum: um rascunho antigo vencia a versão publicada, e a tela deixava publicar texto vazio por
  cima do texto bom. O editor **cortava o fim das instruções coladas, sem avisar** — um agente
  atendeu clientes de verdade com as instruções cortadas no meio de uma frase. O **tamanho de
  histórico que você escolhia não valia** (a tela oferecia até 8.000 e o motor usava 1.000), e
  **nada limitava mensagens seguidas**: o funcionário disparava até 8 sem o cliente responder. Agora
  vale o que você configurou, e há um teto por atendimento (3 por padrão).
- **Quem instalou escolhendo a OpenRouter tinha um funcionário que morria em toda mensagem.** Ela é
  a primeira opção do instalador e estava quebrada em quatro pontos: a chave sumia; o agente do
  primeiro acesso nascia pedindo uma chave da Anthropic que você nunca teve; o botão de testar
  recusava justamente o provedor em uso; e o seletor de inteligência abria em branco, trocando o seu
  provedor no primeiro salvamento. Junto, **"sem saldo" aparecia como erro sem nome nem conserto** —
  a chave estava sem crédito e o dono caçou defeito por horas no sistema para um problema de fatura.
  Agora a tela nomeia falta de saldo ou de limite, e quando falta chave ou modelo o agente fica em
  **rascunho honesto** em vez de nascer com selo de "Publicado" e ficar mudo.
- **"Tem como parar a dor?" bloqueava o paciente para sempre — e quem respondia "BAJA" em espanhol
  continuava recebendo.** A regra que reconhece pedido de sair da lista caçava a palavra em qualquer
  posição da frase. Medido numa clínica em uso real: "tem como parar a dor?" e "posso sair antes das
  15h?" bloqueavam o contato, que sumia sem ninguém saber — e o mesmo erro deixava passar "não quero
  mais receber", que é pedido claro. Do outro lado, os modelos em espanhol terminam com "Respondé
  BAJA para no recibir más" e o CRM só entendia português e inglês: o caminho mais curto para uma
  denúncia de spam. Agora só bloqueia a palavra sozinha ou o pedido inequívoco, e `baja`, `salir` e
  `no quiero recibir` descadastram.
- **Tropeços do primeiro acesso.** O aceite de termos era obrigatório e apontava para duas páginas
  que não existiam; elas agora existem e nomeiam **quem instalou** como responsável pelos dados. O
  sistema chamava sua empresa de "Minha Empresa" até você recarregar a página. E a tela do WhatsApp
  mandava escanear "o código abaixo" quando **não havia código nenhum**, ou dizia "Preparando o
  código…" para sempre; agora o código aparece e cada situação responde "e agora?", com botão de
  tentar de novo.
- **A caixa de conversas contava história errada.** O contador de pendentes só subia — responder não
  abaixava nada — e uma conversa com **uma** mensagem nova podia mostrar 6. Agora responder zera,
  abrir marca como lida, e os contadores errados são recalculados na atualização. A coluna *Última
  atividade* dos Contatos ficava parada, e mensagens novas só apareciam recarregando a página —
  agora a tela se reconecta sozinha e recupera o que entrou nesse meio-tempo.
- **A conexão do WhatsApp não voltava sozinha depois de um reinício.** Reiniciar o servidor ou uma
  falta de memória deixava o número parado — nada entrava, nada saía — até alguém abrir Conexões e
  clicar em *Reconectar*, às vezes só no dia seguinte. Agora o sistema religa sozinho o número que
  apenas parou — mas não quando o WhatsApp recusou a conta nem quando o QR Code espera alguém com o
  celular na mão, porque aí insistir piora.
- **O WhatsApp ficou três dias fora do ar dizendo apenas "Não foi possível verificar a conexão".**
  Quando o WhatsApp recusa a credencial, nada entra e nada sai — mas o aviso era a mesma frase
  morna, em amarelo, de uma oscilação de rede. Foram três dias sem uma única mensagem, e o dono só
  descobriu ao tentar conectar um número novo. Agora credencial recusada abre aviso próprio, em
  vermelho, que diz o que fazer — e avisa que escanear o QR Code de novo **não** resolve. A causa
  daqueles três dias também foi consertada: **duas cópias da pasta de instalação na mesma máquina**
  trocavam as credenciais uma da outra; agora a atualização automática percebe isso e para antes de
  estragar. E os **avisos nomeavam o número errado** — o telefone era gravado no primeiro pareamento
  e nunca mais corrigido —, mandando o dono pegar o celular errado.
- **Seu número podia aparecer como conectado enquanto não entregava mais nada.** No caminho oficial
  do WhatsApp, bastava desconectar o aparelho do outro lado: o CRM seguia dizendo "conectado" e o
  atendimento morria calado. Agora a conferência pergunta se dá para enviar por aquele número AGORA
  — e "não consegui verificar" segue sendo tratado como não sei, nunca como queda.
- **O sistema parado gastava mais cota de banco de dados do que o plano gratuito permite.** Uma
  instalação sem nenhum contato e nenhuma conversa consumia **8,09 GB por mês contra uma cota de 5
  GB**, só porque o processo que faz a IA atender perguntava à fila quatro vezes por segundo se
  havia serviço. Agora ele pergunta quando falta pouco para a próxima tarefa vencer e dorme até lá,
  sem deixar o atendimento mais lento. No mesmo esforço: o WhatsApp parou de mandar avisos que o CRM
  já jogava fora, e as tarefas automáticas deixaram de registrar na auditoria quando não fizeram
  nada — num servidor real, **95% da auditoria** era rotina vazia, enterrando o que importa.
- **A versão publicada subia e morria em seguida, num ciclo sem fim.** Faltavam peças dentro do
  pacote pronto e o sistema não mostrava uma única tela — enquanto o painel do servidor dizia que
  estava tudo de pé, porque só conferia se ele atendia o telefone, não se havia alguém do outro
  lado. Agora cada versão é ligada e testada antes de ser publicada.
- **A atualização do banco podia falhar em silêncio e você nunca saber.** Partes de uma mudança não
  chegavam ao seu servidor, o erro era tratado como inofensivo e a tela dizia "atualização
  concluída". Agora, se falhar, você fica sabendo. O instalador também **acusava a sua chave quando
  o problema era a internet**, prendendo você num laço do qual não se saía digitando certo. E **quem
  tem Supabase próprio travava na primeira instalação**, tendo que editar arquivo à mão: agora
  existe um segundo endereço, **opcional**, só para a estrutura do banco — quem não preencher
  continua exatamente como está hoje.
- **Uma leva de correções que você não vai notar — e esse é o ponto.** Uma mensagem preparada de
  propósito podia congelar o sistema inteiro por segundos; agora é recusada na entrada. Falhas de
  segurança em programas de terceiros foram fechadas, e um diagnóstico interno que imprimia a chave
  do seu WhatsApp em texto puro agora mostra só um pedaço. Aviso do WhatsApp fora do formato
  esperado era descartado em silêncio, com a mensagem se perdendo enquanto o WhatsApp achava que
  tinha entregue. Telas apertadas ganharam espaço: a barra lateral não cobre mais a lista de
  conversas, no celular a lista e a conversa não brigam pelo mesmo pedaço de tela, e textos cortados
  sem jeito de ler o resto — eventos do contato, erros de integração, dados de LGPD — abrem por
  inteiro. PDFs da base de conhecimento perdiam os parágrafos e agora chegam como no original. E o
  logo, que demorava meio minuto para aparecer e **aparecia quebrado em toda instalação em Docker**,
  aparece na hora e no lugar.
- **⚠️ Requer atenção — o valor do orçamento de IA sempre foi em DÓLAR, e a tela dizia real.** Quem
  lia "R$ 50,00" tinha, na verdade, um limite de **US$ 50,00** — cerca de cinco vezes maior do que
  imaginava. Nada mudou no seu gasto nem no seu limite: mudou o que a tela confessa. O rótulo agora
  diz US$ nas telas de Uso de IA, Execuções, Evolução e nos painéis de administração. **Confira o
  número antes de ligar a parada automática**: se você escolheu "50" pensando em reais, o que está
  armado é cinco vezes isso.
- **O gasto exibido era o acumulado desde a instalação, não o do mês.** O contador nunca zerava, e
  com alguns meses de uso a tela comparava meses de gasto contra um limite mensal. Agora o número é
  o do mês corrente, e é o mesmo que decide se a IA para. Junto: o seletor "Ação ao atingir 100%"
  oferecia "Pausar" e "Desabilitar" sem que nada os distinguisse, e a escolha não tinha efeito
  nenhum — saiu da tela (quem quiser que a IA pare no limite usa "Parar a IA no limite"). E o alerta
  de "limite atingido" ficava aceso depois de o mês virar ou de você aumentar o limite; agora se
  apaga sozinho.

## [1.3.0] — 2026-08-13

Esta versão mexe em como o sistema **chega e se atualiza** no seu servidor. Em uso, três
coisas mudam para melhor: a instalação deixa de ter uma etapa que podia falhar por falta de
memória no meio (o servidor não compila mais nada — tudo vem pronto), fica bem mais rápida, e
o agente de IA passa a receber as correções de cada versão. A recomendação de servidor
**continua exatamente a mesma**: o que consome memória é operar o sistema no dia a dia — 7
serviços e cerca de 150 MB por número de WhatsApp conectado —, e isso não mudou nem um pouco.

### Corrigido

- **O agente de IA nunca recebia atualização.** O worker — o processo que faz o agente
  atender 24 horas por dia — era compilado dentro do seu servidor no dia da instalação, e
  nenhuma atualização o reconstruía. Na prática: você atualizava o CRM, o site mudava, e o
  agente continuava rodando exatamente o código do dia em que você instalou, para sempre.
  Correções e melhorias do agente não chegavam. Agora ele é uma imagem pronta, publicada
  junto com o resto, e o `update.sh` a traz como traz o app.
- **Duas instalações "na mesma versão" rodavam código diferente.** Uma instalação nova ficava
  apontada para o canal `latest`, que — apesar do nome — acompanha o desenvolvimento em
  andamento, não a última versão lançada. Quem instalou em semanas diferentes tinha software
  diferente, e não havia como dizer qual. Agora o instalador grava o **número da versão**
  (ex.: `1.2.1`), e é essa versão que fica no seu servidor até você decidir atualizar.
- **O CRM podia não subir por causa de um serviço externo fora do ar.** A configuração pedia
  ao Docker que verificasse o registro de imagens a cada subida; se ele não respondesse, o
  contêiner não subia — mesmo com a imagem já baixada no seu disco. Agora que o seu servidor
  fica numa versão fixa, essa verificação deixa de ser feita **na sua instalação** (quem
  acompanha um canal móvel continua com ela, que é onde ela serve para alguma coisa).
- **O agendador de tarefas dependia da internet para voltar.** A cada reinício ele baixava
  dois programas antes de começar. Sem internet no momento do reboot — justo quando a máquina
  está se recuperando de alguma coisa —, as tarefas automáticas não voltavam. Agora já vêm
  dentro da imagem.
- **A versão mostrada em `/api/v1/health` era sempre `0.1.0`**, em qualquer instalação. Agora
  é a versão de verdade.
- O WhatsApp (WAHA) e o serviço de limites deixaram de acompanhar automaticamente qualquer
  versão nova publicada por terceiros. Passam a mudar só quando nós testamos e lançamos.

### ⚠️ Requer atenção

**Se o seu servidor foi instalado antes desta versão, rode o `update.sh` DUAS vezes.**

> **As duas execuções são necessárias nesta versão.** O agente que corrige isso sozinho entrou
> **depois** da 1.3.0 (está em *Não lançado*) — se você está atualizando para a 1.3.0, ele não
> existe no que você vai instalar. Esta nota já disse o contrário, e a frase teria feito você
> esperar cinco minutos por algo que nunca ia acontecer.
Medido em ensaio numa VPS: a primeira execução traz o agente novo, mas deixa a versão dele
"solta" — acompanhando o canal em vez de ficar fixa, como o resto do sistema. Isso faria o
agente saltar sozinho para a versão seguinte num reinício futuro, enquanto o resto do
servidor continuaria onde está. A segunda execução fixa tudo na mesma versão.

Para saber em que pé você está, sem mexer em nada:

```bash
curl -fsSL https://raw.githubusercontent.com/melgarafael/DeskcommCRM/main/hostgator-setup-kit/diagnostico.sh | bash
```

Ele só lê e explica — não escreve, não reinicia, não atualiza. Se disser que está afetada,
o passo a passo (com como voltar atrás) está em `docs/runbooks/remediar-worker-congelado.md`.

Fora isso, nada exige ação sua. Um `.env` antigo continua funcionando: as configurações
novas têm valor padrão e o próprio `update.sh` as acrescenta.

## [1.2.1] — 2026-08-12

**Versão de segurança. Se você roda o DeskcommCRM numa VPS, atualize.**

Um usuário da comunidade auditou o código e mandou um relatório. Parte do que ele apontou já
tinha sido corrigida nas versões seguintes à que ele analisou — mas **seis** problemas estavam
de pé, e um deles deixava dados de uma empresa visíveis para outra. Todos foram corrigidos,
cada um com um teste automático que impede o problema de voltar.

### Corrigido

- **Uma empresa conseguia ler a base de conhecimento de outra, e escrever no histórico dela.**
  Duas funções internas aceitavam o identificador da empresa como se fosse confiável, sem
  conferir se quem pediu era mesmo de lá. O isolamento entre empresas estava de pé em todo o
  resto — o furo era só nessas duas portas, e elas agora conferem.
- **Quem tinha permissão de apenas visualizar conseguia mudar configurações importantes.** Um
  usuário "visualizador" podia reescrever as instruções do agente de IA (o texto que ele fala
  com o seu cliente), desligar o canal de WhatsApp, mexer no limite de gastos e apagar a chave
  do provedor de IA — bastava falar direto com o banco de dados, sem passar pelas telas. Agora
  essas mudanças exigem administrador, como as telas já exigiam.
- **A verificação em duas etapas do administrador valia só na tela.** Quem tinha a senha de um
  administrador, mas não o segundo fator, ficava barrado na interface e mesmo assim alcançava
  as funções sensíveis por fora dela — criar chave de API, convidar gente para a equipe, pedir
  exportação de dados. Agora o servidor confere o segundo fator em todas elas.
- **Link de login podia levar para um site estranho.** Um endereço preparado por terceiros
  fazia você digitar a senha no site certo e, logo depois de entrar, ser jogado para outro
  lugar — o momento em que se confia mais na próxima tela.
- **Envio de arquivo na conversa não conferia permissão.** Era a única ação de escrita da
  conversa sem essa checagem; um usuário "visualizador" podia enviar arquivos de até 50 MB.
- **Automação de webhook podia alcançar a rede interna do servidor.** A checagem olhava só o
  texto do endereço; um domínio preparado para apontar "para dentro" passava, e alcançava
  serviços internos e a área de credenciais do provedor de nuvem. Agora o endereço é resolvido
  de verdade antes de qualquer envio.

### ⚠️ Requer atenção

- **Administradores vão precisar entrar de novo, com o código do aplicativo.** Se você já tem a
  verificação em duas etapas cadastrada e está com a sessão aberta, as ações de administrador
  passam a pedir o segundo fator. Sair e entrar novamente resolve. Quem ainda **não** cadastrou
  o segundo fator não é afetado e continua conseguindo cadastrá-lo normalmente.
- **Usuários "visualizador" e "gerente" perdem a escrita em configuração de IA e canais.** Se
  alguém do seu time mexia nessas telas sem ser administrador, promova a pessoa a
  administrador antes de atualizar — ou ela vai encontrar as ações bloqueadas.
- **Nenhuma ação manual no banco é necessária.** O `update.sh` aplica tudo sozinho.

## [1.2.0] — 2026-08-11

A maior versão até aqui: **126 novidades e 205 correções** desde a 1.1.0 (contadas por commit).
Dois temas.

O primeiro é o **agente de IA deixar de ser um respondedor e virar parte da operação**: ele
ganha papéis separados, capacidades declaradas, um follow-up que não deixa conversa morrer no
silêncio, e um painel onde você escolhe qual inteligência atende cada parte do sistema.

O segundo é o **sistema parar de mentir quando algo dá errado**: falha de IA deixa rastro em
vez de sumir, botão que não controlava nada foi ligado (ou removido), e erro de rede diz onde
mexer em vez de mandar reiniciar o que nunca caiu.

### Adicionado

**O agente ganha papéis**

- **Três papéis em vez de um** — Conversador, Operador e Segurança. Quem fala não é quem
  executa, e o disparo de ação passou a ser imposto pelo sistema, não decidido pelo modelo.
  Efeito medido: a taxa de resposta em que dado interno vazava para o cliente (URL de sistema,
  UUID, jargão de CRM) caiu de **3 em 10 turnos para 1 em 10** — mesmos cenários, ferramentas
  executadas contra dados reais, controle calibrado contra a linha de base.
- **O agente publicado tem lugar próprio**, entre atendente e gerente: assume o lead, devolve
  para uma pessoa quando precisa, e a volta aparece na linha do tempo em vez de sumir.
- **Capacidades declaradas.** Você escolhe o que ele pode fazer, vê quantas vezes usou cada
  uma, e ele avisa quando falta uma capacidade em vez de falhar calado.
- **Roteador de intenção por número** — um WhatsApp só passa a atender vários assuntos — agora
  com escolha do modelo (e do provedor) que identifica a intenção.

**Follow-up: nenhuma conversa morre no silêncio**

- **O follow-up nasce sozinho** quando o negócio entra numa etapa do funil, ou quando o agente
  abre um caso pedindo ajuda — e morre quando o caso fecha.
- **Ramos nomeados no canvas:** cada regra é uma bolinha com nome, e publicar exige cobertura
  por ramo, dizendo qual ramo ficou descoberto.
- **Pausar, retomar, adiar e pular** um follow-up sem matá-lo.
- **Tempo adaptativo** — a IA escolhe o intervalo e a tela mostra qual foi, e se bateu no seu
  limite.
- **Dossiê do follow-up:** o que já foi tentado, com o que o motor realmente fez.
- O painel inteiro fala **português** — UUID saiu da tela.

**Escolher a sua IA**

- **Painel de Provedores** (Agente de IA → Provedores): a tela onde se vê e se escolhe qual
  inteligência atende **cada uma das 23 partes do sistema** que usam IA — conversar, classificar
  sentimento, indexar conhecimento, ouvir áudio. Antes disso a escolha existia só no `.env`.
- **OpenRouter completa** — uma chave só, com catálogo que se atualiza sozinho contra a origem
  (cerca de 400 modelos na sincronização de referência; o número acompanha o que eles publicam).
- **O instalador pergunta qual IA vai atender** (OpenRouter, Anthropic ou OpenAI) e valida a
  chave na hora, em vez de assumir uma e falhar semanas depois.
- **Catálogo de modelos atualizado** nos provedores — quem instala não escolhe mais entre
  modelos de duas gerações atrás, pagando mais caro por pior.

**Ver o que a IA fez**

- **Tela de Execuções** (Agente de IA → Execuções): o que a IA fez e, quando falhou, o que
  aconteceu e o que fazer a respeito.
- **Falha de IA deixa rastro.** Antes, um erro no meio do caminho sumia — o log mentia por
  omissão e a operação não tinha como saber que algo não rodou.

**A conversa vira CRM sozinha**

- **A conversa vira lead** sem alguém transcrever nada à mão.
- **A IA propõe o dado que o cliente disse** — telefone, e-mail, nome — e **não grava nada**:
  o dado espera numa fila até uma pessoa confirmar na tela.
- **Demandas viram entidade de primeira classe:** nascem no ponto de entrada, aparecem no painel
  de quem atende, e o Radar mostra as que estão **sem próximo passo** — o que corre risco de
  morrer sem resposta.
- **Escopo de funil do agente:** você marca em quais funis ele mexe, e ele só escreve nesses.

**Medir a operação**

- **Índice de Atrito** (Desempenho) — o sistema passa a medir o próprio propósito.
- **Abandono, repergunta e espera calada** — as perdas de que ninguém reclama, agora contadas.

**Atendimento**

- **Fila de leads por atendente, com rodízio.** A distribuição deixa de ser combinada por fora
  e vira porta na tela.
- **Colar imagem no composer com Ctrl+V.**
- **Declarar desde quando o número é usado** e poder pular o aquecimento — um número antigo
  não precisa ser tratado como recém-nascido.
- **Aviso de mensagem presa.** Uma tarefa automática detecta mensagem que ficou "enviando" e
  abre um aviso na Central, em vez de deixar o cliente sem resposta em silêncio.

### Corrigido

- **Duas partes do sistema respondiam à mesma mensagem do cliente.** Agora há um dono só.
- **"O WhatsApp está fora do ar" quando o serviço estava de pé.** Toda falha de rede caía na
  mesma frase, mandando reiniciar um container que nunca havia caído. Agora a mensagem
  distingue endereço errado de serviço parado e diz onde mexer.
- **Escolher OpenRouter ou OpenAI no instalador tornava a instalação impossível** — e, num
  segundo defeito, a escolha era decorativa: aceita na pergunta e ignorada depois.
- **O instalador perdia a chave que você tinha configurado à mão** no `.env`, e a segunda
  execução desfazia a entrevista já respondida.
- **O papel Operador escrevia no CRM depois de o humano assumir a conversa** — era o único
  turno sem a guarda.
- **A telemetria da IA voltou a dizer a verdade** (5 defeitos de uma unificação anterior), e a
  troca de modelo voltou a ser auditada — o registro era engolido em silêncio.
- **Duas mutações perdiam a auditoria caladas** por chave natural gravada em coluna `uuid`.
- **A aba "Minhas" mostrava tudo que o atendente já tinha fechado.**
- **O filtro por tag da tela não filtrava** — a rota ignorava o parâmetro.
- **O menu passava da dobra em telas de 900px** depois que as telas novas entraram.
- **O roteador recusava um número que existia**, com a mensagem "não encontrado nesta
  organização", quando na verdade a consulta é que havia falhado.
- **A tela de funis misturava organizações** do mesmo usuário.
- **Excluir um canal** apagava o roteador junto, sem avisar, e deixava a Meta ainda entregando
  mensagens. Reconectar dizia "conectado" com a linha ainda arquivada.
- **Erro ao publicar o agente no onboarding criava um agente novo a cada clique.**
- **O custo de IA sem agente dono sumia da auditoria** — as telas de consumo mostravam zero
  numa instalação com tráfego real e provedor pago.
- **Mover um lead pelo assistente** deixou de pular o que mover pela mão aciona.
- **Telefone descoberto depois estourava a restrição de unicidade** e a mensagem do cliente
  sumia.
- **O `update.sh` inventava gasto de IA** e podia pausar o agente de quem estava atualizando.
- **Uma migration anterior apagou três tipos de aviso da Central** — corrigido, e agora há um
  gate que compara.

### Segurança

- **8 de 25 funções internas do banco estavam executáveis pela chave pública** que vai para o
  navegador, incluindo uma que escreve recebendo a organização por parâmetro, sem checar se
  você pertence a ela. Todas fechadas, com uma varredura que reprova a próxima.
- **Desligar uma camada de proteção do agente era escrita de qualquer membro** da organização —
  agora exige papel de gestão.
- **Expressão regular vulnerável a ReDoS** na leitura do telefone dentro da conversa.
- **O limitador de requisições vazava uma chave por janela** em memória.
- **O Sentry da comunidade recebia sessão além de erro** — agora recebe só o relatório de erro,
  como o README sempre descreveu.

**⚠️ Requer atenção**

Esta versão traz **51 mudanças de banco** (migrations 0087 a 0148). O `update.sh` aplica tudo
sozinho e **faz backup antes** — você não precisa rodar nada à mão. Se a sua instalação está há
muito tempo sem atualizar, é normal a etapa do banco demorar mais e imprimir vários avisos de
"já existe": eles são esperados, e o script só destaca o que não for.

Se você instalou entre 30/07 e hoje, seu servidor já roda este código (a instalação acompanha a
`main`) — esta tag existe para que a atualização pela tela e o `update.sh` voltem a ter um alvo
publicado para comparar.

## [1.1.0] — 2026-07-30

### Adicionado

- **Atualização pela própria tela.** O dono da instalação vê a versão instalada no rodapé do menu
  e, quando há versão nova, atualiza com um clique — sem abrir terminal. A tela mostra o que muda,
  avisa quanto tempo o sistema fica fora do ar e faz uma cópia de segurança antes.

### Alterado

- **A atualização passa a instalar a última versão publicada, não o topo do código em
  desenvolvimento.** O `update.sh` recusa instalar uma versão anterior à que já está no servidor
  (voltar no tempo continua possível com `--force`) e grava a imagem escolhida no `.env` — assim um
  `docker compose up -d` rodado depois não traz o app de volta para a `latest`.

**⚠️ Requer atenção**

Quem já tem o CRM instalado precisa rodar `bash hostgator-setup-kit/update.sh` **duas vezes** pelo
terminal para ativar o botão. Não é engano: a primeira execução ainda é a do programa antigo, que
baixa o novo mas não sabe ligar o agente da tela; a segunda já roda o programa atualizado e liga.
Depois disso, nunca mais é preciso o terminal.

## [1.0.0] — 2026-07-27

Primeira versão marcada do DeskcommCRM. O projeto vinha sendo desenvolvido publicamente desde abril de 2026 sem tags; esta release estabelece o ponto a partir do qual toda mudança passa a ser versionada e descrita — porque quem hospeda o próprio sistema precisa saber o que muda antes de atualizar.

### Plataforma

- Multi-tenancy com RLS em toda tabela tenant-aware, resolvida por `fn_user_org_ids()`.
- RBAC de 4 papéis (`viewer` < `agent` < `manager` < `admin`), aplicado no servidor.
- Autenticação via Supabase Auth com MFA TOTP obrigatório para administradores.
- Log de auditoria append-only com retenção de 5 anos.
- Onboarding de organização e ciclo completo de convite de membros.

### Atendimento WhatsApp

- Inbox de 3 painéis em tempo real, com múltiplos números via WAHA.
- Mídia servida por Storage com URLs assinadas; transcrição de áudio.
- Proteção anti-banimento: ritmo com variação, teto por número, janela de horário, aquecimento gradual e variação de texto.
- Detecção de pedido de descadastro (STOP) no inbound, com bloqueio automático.

### CRM

- Funil kanban com indexação fracionária de posição.
- Vocabulário configurável por funil — o mesmo núcleo atende e-commerce, clínica, imobiliária, infoproduto e serviços.
- Customer 360, contatos, etiquetas e linha do tempo unificada.
- Integração com Nuvemshop para a vertical de e-commerce.

### Agentes de IA

- Agentes com RAG por organização (pgvector), análise de sentimento e controle de orçamento por organização.
- IA como responsável de primeira classe, sujeita às mesmas regras de governança de um humano.
- Handoff IA→humano auditado, entregando resumo contextual (não a conversa crua).
- Cadeia de 7 verificações antes de cada envio, em ordem fixa: descadastro, LGPD, anti-banimento, variação de texto, promessa determinística, promessa semântica e disclosure. Cada avaliação vira registro durável e auditável — inclusive as que barram o envio.
- Servidor MCP interno.

### Governança de atendimento

- Atribuição e transferência auditadas, fila com posição e roteamento automático.
- Escopo de visualização por papel, aplicado via RLS.
- Métricas por atendente.

### Automação

- Fontes de captação: endpoint público por organização que recebe leads de landing pages, formulários e ferramentas externas.
- Regras QUANDO/SE/ENTÃO, que nascem pausadas até revisão.
- Webhooks de saída com proteção contra SSRF.
- Nenhum trigger de banco faz HTTP: eventos vão para `event_log` e são drenados por rota agendada.

### LGPD

- Exportação e anonimização em cascata via workers, com anonimização preferida sobre exclusão.
- Consentimento auditado.

### Self-host

- `hostgator-setup-kit`: instalação completa (app + WAHA + banco) com um comando.
- `baseline.sql` idempotente e auto-curativo — atualização não quebra clone com dados legados.
- 8 scripts de operação: `install`, `update`, `backup`, `restore`, `reset-password`, `reset-mfa`, `healthcheck` e o assistente de instalação em IA.
- Imagem publicada em `ghcr.io/melgarafael/deskcommcrm` — a VPS não compila nada.

### Qualidade

- CI com dois portões obrigatórios: `verify` (typecheck, lint, testes unitários) e `invariants`.
- O portão `invariants` sobe um Postgres limpo, aplica o `baseline.sql` em modo install e update, e roda **364 testes de invariante** em 56 arquivos — incluindo o teste de isolamento entre organizações, que prova que um usuário de uma organização não enxerga nenhuma linha de outra.
- Suíte end-to-end em Playwright dirigindo o frontend.

### ⚠️ Requer atenção

- **Node 22 é obrigatório para desenvolvimento.** A suíte de invariantes instancia o cliente do Supabase, que exige o `WebSocket` global — nativo apenas a partir do Node 22. Isso não afeta quem apenas hospeda: a VPS roda a imagem pronta.

[Não lançado]: https://github.com/melgarafael/DeskcommCRM/compare/v1.29.0...HEAD
[1.29.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.28.0...v1.29.0
[1.28.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.27.0...v1.28.0
[1.27.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.26.4...v1.27.0
[1.26.4]: https://github.com/melgarafael/DeskcommCRM/compare/v1.26.3...v1.26.4
[1.26.3]: https://github.com/melgarafael/DeskcommCRM/compare/v1.26.2...v1.26.3
[1.26.2]: https://github.com/melgarafael/DeskcommCRM/compare/v1.26.1...v1.26.2
[1.26.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.26.0...v1.26.1
[1.26.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.53...v1.26.0
[1.25.53]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.52...v1.25.53
[1.25.52]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.51...v1.25.52
[1.25.51]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.50...v1.25.51
[1.25.50]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.49...v1.25.50
[1.25.49]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.48...v1.25.49
[1.25.48]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.47...v1.25.48
[1.25.47]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.46...v1.25.47
[1.25.46]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.45...v1.25.46
[1.25.45]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.44...v1.25.45
[1.25.44]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.43...v1.25.44
[1.25.43]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.42...v1.25.43
[1.25.42]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.41...v1.25.42
[1.25.41]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.40...v1.25.41
[1.25.40]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.39...v1.25.40
[1.25.39]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.38...v1.25.39
[1.25.38]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.37...v1.25.38
[1.25.37]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.36...v1.25.37
[1.25.36]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.35...v1.25.36
[1.25.35]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.34...v1.25.35
[1.25.34]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.33...v1.25.34
[1.25.33]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.32...v1.25.33
[1.25.32]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.31...v1.25.32
[1.25.31]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.30...v1.25.31
[1.25.30]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.29...v1.25.30
[1.25.29]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.28...v1.25.29
[1.25.28]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.27...v1.25.28
[1.25.27]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.26...v1.25.27
[1.25.26]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.25...v1.25.26
[1.25.25]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.24...v1.25.25
[1.25.24]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.23...v1.25.24
[1.25.23]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.22...v1.25.23
[1.25.22]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.21...v1.25.22
[1.25.21]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.20...v1.25.21
[1.25.20]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.19...v1.25.20
[1.25.19]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.18...v1.25.19
[1.25.18]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.17...v1.25.18
[1.25.17]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.16...v1.25.17
[1.25.16]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.15...v1.25.16
[1.25.15]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.14...v1.25.15
[1.25.14]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.13...v1.25.14
[1.25.13]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.12...v1.25.13
[1.25.12]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.11...v1.25.12
[1.25.11]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.10...v1.25.11
[1.25.10]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.9...v1.25.10
[1.25.9]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.8...v1.25.9
[1.25.8]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.7...v1.25.8
[1.25.7]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.6...v1.25.7
[1.25.6]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.5...v1.25.6
[1.25.5]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.4...v1.25.5
[1.25.4]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.3...v1.25.4
[1.25.3]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.2...v1.25.3
[1.25.2]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.1...v1.25.2
[1.25.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.25.0...v1.25.1
[1.25.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.24.0...v1.25.0
[1.24.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.23.0...v1.24.0
[1.23.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.22.0...v1.23.0
[1.22.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.21.1...v1.22.0
[1.21.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.21.0...v1.21.1
[1.21.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.20.2...v1.21.0
[1.20.2]: https://github.com/melgarafael/DeskcommCRM/compare/v1.20.1...v1.20.2
[1.20.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.20.0...v1.20.1
[1.20.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.19.0...v1.20.0
[1.19.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.18.1...v1.19.0
[1.18.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.18.0...v1.18.1
[1.18.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.8...v1.17.0
[1.16.8]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.7...v1.16.8
[1.16.7]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.6...v1.16.7
[1.16.6]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.5...v1.16.6
[1.16.5]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.4...v1.16.5
[1.16.4]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.3...v1.16.4
[1.16.3]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.2...v1.16.3
[1.16.2]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.1...v1.16.2
[1.16.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.16.0...v1.16.1
[1.16.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.15.1...v1.16.0
[1.15.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.15.0...v1.15.1
[1.15.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.11.1...v1.12.0
[1.11.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.10.2...v1.11.0
[1.10.2]: https://github.com/melgarafael/DeskcommCRM/compare/v1.10.1...v1.10.2
[1.10.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.9.1...v1.10.0
[1.9.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.6.0...v1.7.0
[1.5.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/melgarafael/DeskcommCRM/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/melgarafael/DeskcommCRM/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/melgarafael/DeskcommCRM/releases/tag/v1.0.0
