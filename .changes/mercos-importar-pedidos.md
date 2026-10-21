---
impacto: capacidade_nova
secao: adicionado
titulo: Pedidos do Mercos entram sozinhos, todo dia às 17h
---

O histórico de pedidos deixa de depender de alguém abrir o ERP e baixar planilha.
Um worker dedicado entra no Mercos com a sessão da empresa, percorre os pedidos a
partir do maior número já importado e grava pedido, itens, **vendedor** e o
**vínculo com o cliente** que já existe no CRM.

Há dois jeitos de disparar, e os dois usam a mesma fila:

- o botão **Importar pedidos Mercos** na tela de Pedidos;
- o cron das 17h, que enfileira uma execução por organização que já tem histórico.

A fila (`mercos_import_runs`) sobrevive a restart: o tick não abre navegador nem
depende de o worker estar acordado no mesmo instante. Duas execuções simultâneas
para a mesma organização não acontecem — a segunda encontra a primeira em curso.

A sessão do Mercos fica num volume, então o login acontece uma vez. O primeiro
login de um dispositivo novo pede um código por e-mail: o worker espera esse
código até uma hora, em vez de falhar na hora.

O telefone do cliente é normalizado para E.164 (`+55DDDNÚMERO`), porque o mesmo
número chegava em três formatos e cada formato virava um contato diferente.

**Nada é enviado ao cliente por causa da importação** — ela só escreve no CRM.
