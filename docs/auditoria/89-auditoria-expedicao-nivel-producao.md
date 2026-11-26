# 89 — Expedição: o que falta para nível de produção global

> Auditoria de 26/11/2026, medida contra a instalação real (org `4bc721ce`),
> não contra opinião. Cada item abaixo tem o número que o sustenta.

## O que a instalação mostra hoje

```
cargas ......................... 31 (27 concluídas · 3 montando · 1 em rota)
média de paradas por carga ..... 8,4
cargas sem nenhuma parada ...... 3
cargas com parada SEM destino .. 13
paradas ativas sem coordenada .. 27 de 28
destinos: pendente 117 · ok 68 · não encontrado 3  (87 nunca tentados)
pedidos aguardando embarque .... 482
carga em montagem mais antiga .. 388 h (16 dias)
```

## P0 — o que mente ou trava

### 1. "Aguardando embarque" subconta a fila

`app/app/expedicao/page.tsx` carrega a fila com `.limit(200)` e passa esse
array para `calcularSituacaoDaExpedicao`. Com **482** pedidos elegíveis, a faixa
mostra **200** — e `valorAguardandoCents` soma só os 200.

Número que mente é pior que número ausente: o despachante planeja o dia por ele.
Correção: contagem e soma por consulta agregada (ou RPC), não pelo array paginado.

### 2. Mapa sem coordenada na maioria das paradas

**27 de 28** paradas ativas não têm pino; **87** destinos nunca foram
geocodificados. A geocodificação existe (`POST /shipments/[id]/rota/geocodificar`,
lotes de 10, ritmo de 1,1 s), mas só é oferecida **dentro da carga**, na aba de
rota. No painel de despacho — onde a exceção "sem localização" aparece com um
número — **não há a ação**.

Resultado medido: a carga 052 tem 4 paradas e 0 pinos; a 053 está em rota há 23 h
sem rota desenhada.

Correção: a exceção "sem localização" abre a carga já na aba de rota com o lote
pronto, e um botão de geocodificar em lote no painel (com o progresso visível e
o motivo por endereço).

### 3. Carga aberta para sempre

```
carga 34 ... montando há 388 h (16 dias)
carga 44 ... montando há 245 h (10 dias)
carga 50 ... montando há  69 h (3 dias)
```

Não existe prazo, alerta nem expiração. Em produção, carga parada é pedido que
não saiu e cliente que não recebeu — e o painel de exceções não a nomeia.

Correção: envelhecimento por etapa na linha (e exceção "montagem parada há mais
de X h"), com o mesmo desenho do "sem localização": contagem + link que filtra.

## P1 — o que separa "funciona" de "produção global"

### 4. SLA por etapa, não só estado

Hoje a tela diz o **estado** (montando, em rota). Falta **há quanto tempo** e
**contra qual promessa**: montagem > 2 h, rota atrasada contra o ETA da parada,
entrega sem desfecho há N horas. Sem isso, "em rota" é a mesma coisa para a carga
de 20 minutos e para a de 23 horas.

### 5. Filas sem paginação

Cargas (200) e pedidos elegíveis (200) têm teto fixo e sem "próxima página".
Numa operação de 1.000 pedidos/dia, o teto vira perda silenciosa — o mesmo
defeito que o seletor de catálogo tinha.

### 6. Montagem sem leitor de código

O catálogo tem busca por código (leitor de barras). A montagem da carga não:
conferir 8–12 paradas é procura visual. Um campo único que aceita código/número
do pedido e marca "separado" fecha o ciclo com o leitor que a doca já usa.

### 7. Romaneio por veículo, não por carga

Depois da distribuição, uma carga pode sair em dois veículos. O romaneio é da
carga inteira; falta o do veículo (é o papel que cada motorista leva).

## P2 — UI/UX e acessibilidade

8. **Cabeçalho fixo com `sticky -top-6`** compensando o `p-6` do AppShell. É
   acoplamento frágil: mexer no padding do shell desalinha a ficha inteira.
   Trocar por layout com altura de topo declarada.
9. **Barra de páginas em 390 px**: "Motorista" esconde o rótulo e sobra só o
   ícone. Funciona (aria-label existe), mas o alvo de 44 px fica no limite.
10. **Erro de leitura ≠ lista vazia**: a lição do catálogo (que dizia "catálogo
    vazio" quando o GET falhava) precisa ser aplicada nas listas de cargas e de
    pedidos — hoje uma falha vira "Nenhuma carga ainda".
11. **Sem atalhos de teclado** no despacho (o operador monta carga com uma mão
    no mouse e outra no papel).
12. **Feedback de otimização**: "Otimizar" não diz quantos segundos, nem o que
    mudou (distância antes/depois). Sem isso o ganho é invisível e ninguém usa.

## O que NÃO vale fazer agora

- **Navegação curva a curva** (SDK nativo): decidido, custo por evento e
  rastreamento em segundo plano. Maps/Waze cobrem o dia a dia.
- **Rastreamento ao vivo com WebSocket**: o GPS já é gravado; falta SLA de
  atualização, não transporte novo.
- **Frota como entidade**: hoje há um motorista; placa validada + sugestão de
  combinação recente resolve sem tabela nova.

## Ordem sugerida

```
1. P0-1 (fila subcontada) ...... meia hora, é consulta agregada
2. P0-2 (geocodificar em lote no despacho) ... a maior dor operacional
3. P0-3 (carga parada há X) ..... exceção nova, mesmo desenho das existentes
4. P1-4 (SLA por etapa) ......... depende de decidir o alvo de cada etapa
5. P1-6 (leitor na montagem) .... ganho imediato na doca
```
