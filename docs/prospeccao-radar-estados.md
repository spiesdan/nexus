# Radar de prospecção — hierarquia, estados e aceite visual

Spec curta da aba **Pesquisas** (`/app/campanhas?subtela=prospeccao&aba=pesquisas`).
Fonte de dados: `docs/prospeccao-maps-contrato.md`. A tela **lê** o contrato; não
deduz estado que o banco não tem.

Alinhada com `radar-estados-canonicos.md` (Design UX, 27/11/2026): **5 estados
semânticos, 6 estados visuais, 12 capturas**.

## Hierarquia (de cima para baixo)

1. **Título + contagem** — "Buscas no mapa", quantas, e a frase que explica a
   unidade: a busca avança termo por termo e o achado não some se ela parar.
2. **Faixa de erro de leitura** (só quando a última atualização falhou) — diz que
   a lista pode estar velha e oferece "Tentar de novo". Nunca toast por cima.
3. **Cartão da busca** — a unidade da tela. Ordem interna fixa:
   1. identidade: categorias · cidade/UF · raio · máximo;
   2. selos: no máximo dois + status do banco (o resto vira texto no bloco);
   3. progresso: `N de M termos` + barra `role=progressbar` com nome;
   4. termos: concluído / falhou / em execução com tentativas 0..3 / na fila;
   5. números: encontradas, novas, duplicadas;
   6. **um** bloco explicativo, na ordem `parando` → `degradada` → `parcial` →
      `zero`;
   7. ações.

Um cartão = uma busca. A tela não tem tabela: são poucas buscas e cada uma tem
história própria.

## Estado × ação

| Estado | O que aparece | Ação oferecida |
|---|---|---|
| Em andamento (`carregando`) | "0 de N termos"; `queued` usa badge **"Na fila"** | Cancelar; Pausar **só** em `running` |
| Em andamento (`resultado`) | termo atual, tentativas, achados | Pausar, Cancelar, Ver empresas |
| Parando | selo "Parando…", prazo de até 125 s, resultado preservado | Cancelar; **não** oferece Pausar de novo |
| Parcial | motivo legível + "Resultado parcial" | Ver empresas (o que achou vale) |
| Zero | "0 encontrados em {cidade}" + por que | Ampliar para 2× km e repetir; OSM; Places |
| Degradada | selo "Descoberta degradada" + `degradacao_motivo` | OSM; Places; caminho para a Configuração |

Regra de ouro: **estado é leitura, ação é escolha**. Nenhum provedor é trocado
sozinho. O contrário — fallback automático — esconde do operador que a descoberta
mudou de fonte.

### Um bloco por cartão — e a precedência

Os selos podem coexistir; o **bloco explicativo é um só**. Quando mais de um
estado for verdadeiro, vence o primeiro nesta ordem: `parando` → `degradada` →
`parcial` → `zero`.

Decisão de design (27/11): **degradada suprime zero**. Se o Maps não executou a
busca (`degradada=true`), "0 encontrados" é uma afirmação falsa — não houve
busca, só ausência de execução. O cartão mostra o motivo da degradação e as
saídas (OSM/Places), não a linha de zero. Pelo mesmo motivo, degradada também
suprime o bloco de parcial.

### Provider e a chave (atualizado 27/11)

`POST /prospecting/searches` **já aceita provider explícito** entre os
habilitados: OSM sempre; Places quando a instalação tem o flag e existe chave
(tenant primeiro, fallback instalação); sem `provider`, vale o ativo. Auditoria
registra a origem.

- **Places desabilitado** (sem flag ou sem chave): o botão fica desabilitado com
  o motivo visível ao lado ("Places indisponível: falta a chave do Google nesta
  instalação" / "…e a organização não cadastrou a chave"). Não some sem
  explicação.
- **De quem é a chave**: a tela diz se a consulta usa a **chave da organização**
  ou a **chave da instalação**. O dado existe no servidor (`resolverChaveGoogle`
  devolve `origem`); falta chegar à tela.
  **Lacuna de contrato:** `capacidade_places.origem_chave` = `"tenant" |
  "instalacao" | null` no payload do server component.
- **OSM** sempre disponível. **maps_browser** não aparece antes de 12/12.

### Repetir na mesma coordenada

Zero/parcial/degradada repetem com a **mesma latitude/longitude** que o GET da
lista devolve, em um clique. **Lat/lng vencem a cidade** quando existirem; a
cidade é só o fallback de busca antiga sem coordenada. A tela não abre a aba
Buscar preenchida nem pede a cidade de novo.

## Lista canônica (para captura e aceite)

| # | Estado semântico | Estado visual | Condição no contrato | Nome exato na tela |
|---|---|---|---|---|
| 1 | `em_andamento` | **carregando** | `queued`, ou `running` sem termo concluído | "Na fila" (`queued`) / "Procurando" (`running`); sem selo |
| 2 | `em_andamento` | **resultado** | `running`, ≥1 termo concluído, `encontradas > 0` | "Procurando" |
| 3 | `parando` | **parando** | `running` + `estado_parada=parando`, `parada_maxima_s=125` | "Procurando" + selo "Parando…" |
| 4 | `parcial` | **parcial** | `completed`/`paused` com cobertura incompleta ou termo falho | selo "Parcial" + "Resultado parcial" |
| 5 | `zero` | **zero** | `completed` + `motivo_zero=sem_resultados` + `encontradas=0` | "Nenhum resultado nesta região" + "0 encontrados em {cidade}" |
| 6 | `degradada` | **degradada** | `degradada=true` + `degradacao_motivo` | selo "Descoberta degradada" + motivo integral |

**12 imagens**: os seis nomes visuais × as larguras 1440 e 390 px (sufixos
`-1440` e `-390`), em `evidence/radar-estados/`. Mesmo seed e mesmo filtro nas
duas larguras.

`carregando` é **nome de captura**, não texto de tela: o QA não deve procurar
essa palavra no DOM.

**Parando tem prova própria** (captura 3). Ele não é subestado de "parcial":
status continua `running` e o prazo de 125 s é o que separa "pedi para parar" de
"parou". Sem essa captura, o estado não está provado.

## Checklist de aceite (12 imagens: 6 estados × 2 larguras)

**Comum a todos**
- [ ] Nenhum nome de produto/revendedor hardcoded; cor vem do tema.
- [ ] Contraste: texto ≥ 4,5:1; controle ≥ 3:1; foco visível em toda ação.
- [ ] Um `h2` por seção; cartões em lista (`ul`/`li`).
- [ ] Barra de progresso com `role=progressbar`, `aria-valuenow` e nome que
      inclui a cidade.
- [ ] Alvos de toque ≥ 44 px; nenhuma ação só por hover.
- [ ] 390 px: zero rolagem horizontal, nada truncado; 1440 px: conteúdo não
      estica além da coluna.
- [ ] Loading, vazio e erro desenhados; erro de leitura não vira toast.
- [ ] Um bloco explicativo só, na ordem da precedência.

**Carregando (1)**
- [ ] Esqueleto com a forma do cartão, não bloco liso.
- [ ] "0 de N termos" — nunca "0 de 0 células".
- [ ] `queued`: sem Pausar; Cancelar disponível. Sem "Ver empresas".

**Resultado (2)**
- [ ] Termo atual + tentativas 0..3; concluídos/falhos/na fila visíveis.
- [ ] Progresso por termo × cidade; encontradas/novas/duplicadas batem.
- [ ] "Ver empresas", Pausar e Cancelar disponíveis.

**Parando (3)**
- [ ] Status continua "Procurando"; selo "Parando…" separado.
- [ ] Diz o prazo de 125 s e que o termo em curso termina antes.
- [ ] Não oferece Pausar de novo; Cancelar disponível.
- [ ] Achado preservado e linkado; **sem** selo/bloco "Parcial" enquanto corre.

**Parcial (4)**
- [ ] `parcial_motivo` legível (não código), com "Resultado parcial".
- [ ] Resultado preservado e linkado.
- [ ] Só em `completed`/`paused`/parada já solicitada.
- [ ] Degradada não repete o bloco de parcial.

**Zero (5)**
- [ ] Frase congelada: **"0 encontrados em {cidade}"**.
- [ ] Três saídas: ampliar 2× (com o número), OSM, Places.
- [ ] Places desabilitado mostra o motivo; nenhum fallback automático.
- [ ] Nunca lista vazia muda: o cartão diz por que zerou.

**Degradada (6)**
- [ ] Selo "Descoberta degradada" + `degradacao_motivo` na íntegra.
- [ ] Diz que a escolha de provedor é humana; nenhuma busca nasce sem clique.
- [ ] OSM e Places visíveis; Places com estado habilitado/desabilitado correto.
- [ ] Zero suprimido: não afirma "0 encontrados" quando a busca não rodou.

## Fora de escopo (fases seguintes)

Grade por região, e-mail e avaliações. O cartão não promete o que não existe.
