# 75 — Dois números, uma regra

Decisão do dono (23/11): `numero` é o número interno (`PED-0249`); `numero_mercos` é o número que a pessoa vê no ERP. Quando o Mercos é nulo ou igual ao interno, mostra **um** número — não duplica informação. Quando são diferentes (colisão), mostra **os dois**: o interno em destaque, `Mercos 19669` em texto secundário. Sem tooltip: se o número existe, alguém precisa dele.

`components/pedidos/numero-do-pedido.tsx` é o único renderizador, com `flex-wrap`: em 390 a referência desce para a segunda linha se não couber, em vez de empurrar o cliente para fora da linha. Medido com pedido real `PED-0249` + `Mercos 19669`: sem overflow em 390, cliente visível, nenhum console error.

Quatro lugares:
1. lista de pedidos (`app/app/pedidos/_client.tsx`) — célula da tabela e cartão; `aria-label` dos controles nomeia os dois;
2. ficha (`app/app/pedidos/[id]/_detalhe.tsx`) — `h1` interno, subtítulo `Mercos 19669`, linha "Nº do pedido" com os dois;
3. expedição — painel de pedidos disponíveis (`_painel-pedidos.tsx`) e lista de paradas (`[id]/_client.tsx`); a busca do painel também acha pelo número do Mercos;
4. busca — placeholder agora diz "Pedido, cliente, CNPJ ou número do Mercos".

Capturas: `docs/auditoria/capturas/dois-numeros-{lista,ficha}-{light,dark}_{1440,390}.png`. O campo é **opcional** (`numero_mercos?: number | null`) e o componente tolera `undefined` — a migration 0344 é do G (`fix/mercos-colisoes-visiveis`). Quando ela entrar na main, incluir `numero_mercos` em `COLUNAS_DO_PEDIDO` e no SELECT do painel para o dado fluir; a tela já está pronta para recebê-lo. Nenhuma coluna/migration foi alterada neste PR (a coluna usada na captura foi criada e removida no banco local).
