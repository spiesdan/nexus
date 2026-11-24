# 79 — Selo de origem do Mercos

Pedido que veio do ERP ganha um indicador discreto ao lado do status: ícone decorativo (`aria-hidden`) + **(Mercos)**. O número do Mercos já aparece na linha quando difere do interno (#842), então o selo diz só a **origem** — nunca repete o número. Pedido local (`numero_mercos` nulo) não ganha selo.

Dois lugares, um componente (`app/app/pedidos/_pills.tsx`): lista de pedidos (cartão e mesa) e cabeçalho da ficha, sempre ao lado de `PillDoStatus`. Sem cor como único sinal: "(Mercos)" é texto.

Em 390 a linha de número/status passou a `flex-wrap`: medido com `PED-0249` (Mercos) e `PED-0248` (local) lado a lado, o selo desce para a segunda linha das 390 sem empurrar o status nem o nome do cliente; 1 selo por linha, overflow 0, console limpo.

Foi preciso incluir `numero_mercos` em `COLUNAS_DO_PEDIDO`: o renderizador de dois números estava na main, mas a coluna não vinha na consulta. Sem isso, nem o número nem o selo apareciam.

Capturas: `docs/auditoria/capturas/selo-{lista,ficha}-{light,dark}_{1440,390}.png`. Coluna e valores do fixture criados e removidos no banco local no mesmo comando das capturas.
