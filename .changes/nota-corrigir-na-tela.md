---
impacto: nada_mudou
secao: adicionado
titulo: Notas: dá para corrigir a nota rejeitada na própria tela, como no Odivix
---

A nota que a SEFAZ recusava ficava parada no status **"Erro"**, com o motivo ao lado e só dois botões: tentar de novo do mesmo jeito, ou cancelar. Quando a recusa era de cadastro — **232**, IE do destinatário não informada, que foi o caso da OUT SERVICE em 05/11 —, não havia onde preencher a IE: era sair da tela, achar o cliente, abrir a ficha, corrigir e voltar.

Agora cada nota em **erro** (ou pendente) tem o botão **Corrigir**, que abre o documento para edição no lugar onde o erro aparece:

- **Destinatário** — IE, CPF/CNPJ e endereço completo. Com "Salvar também no cadastro do cliente" marcado (o padrão), a correção vai para a ficha do cliente e a próxima nota já sai certa.
- **Itens** — NCM, CFOP, unidade e descrição, item por item. A correção vale para **esta nota**; o cadastro do produto continua sendo a verdade das próximas.
- **Informações complementares** do DANFE.

O botão **Salvar e reenviar** grava e devolve a nota para a fila na mesma ação, sem cancelar e emitir outra — o número já reservado continua sendo o dela. Toda correção fica na timeline da nota como evento **ajuste**, com os campos que mudaram, e no rastro de auditoria como `invoice.adjusted`.
