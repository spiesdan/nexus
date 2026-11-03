---
impacto: nada_mudou
secao: alterado
titulo: NF-e puxa nome, CPF/CNPJ, endereço e inscrição estadual do cadastro do cliente
---

Emitir NF-e pedia o **endereço inteiro do destinatário digitado à mão**, mesmo
com o cliente cadastrado — e a nota levava do pedido só o nome e o documento,
que são a foto do dia da importação. Cliente renomeado saía com o nome velho;
quem tinha endereço no cadastro redigitava; e o **código IBGE do município**
não existia em lugar nenhum, que era a razão real do formulário manual.

Agora o destinatário sai do **cadastro do cliente**:

- **nome** — o do contato (o do pedido fica só como reserva);
- **CPF/CNPJ** — o do contato, com a mesma reserva;
- **endereço** — logradouro, número, complemento, bairro, cidade, UF e CEP das
  colunas do cadastro, com o **código IBGE resolvido de cidade/UF** contra a
  tabela oficial do IBGE (5.571 municípios, versionada no repositório — não é
  consulta em tempo de execução, então funciona em VPS sem saída para a internet);
- **inscrição estadual** — o `indIEDest` da NF-e passou a vir do cadastro:
  cliente com IE sai como contribuinte (1, com a IE no XML), "ISENTO" sai como
  isento (2) e sem IE como não contribuinte (9). Antes o emissor gravava 9 para
  todo mundo, então cliente contribuinte saía classificado errado.

Na tela de emissão, o endereço aparece **preenchido** ao escolher o pedido —
e continua editável: o que for digitado ali vence o cadastro. Quando o cadastro
não fecha o endereço, a tela diz **o que falta** (logradouro, número, bairro,
cidade/UF, UF ou CPF/CNPJ) e a emissão recusa com o mesmo nome, em vez de pedir
"o endereço" de novo a quem já cadastrou o cliente.

Cidade escrita como o cadastro escreve ("Mafra", "MAFRA", "Mafra, Santa
Catarina") resolve no mesmo município. Cidade com homônimo em outro estado e
sem UF cadastrada **não é escolhida no chute**: a emissão pede a UF, porque
município errado é rejeição na SEFAZ.
