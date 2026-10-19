---
impacto: nada_mudou
secao: corrigido
titulo: A NF-e era recusada pela SEFAZ antes de ser lida — dois defeitos do emissor
---

A primeira emissão de verdade deste sistema foi feita contra a SEFAZ de
homologação, com o certificado A1 da instalação, e ela nunca chegou a autorizar.
Não era configuração: eram dois defeitos no lado emissor, e o primeiro deles
derrubava qualquer nota, em qualquer instalação, com todos os campos certos.

O XML era recusado por um campo de versão do próprio emissor
(`verProc`), que tinha 27 caracteres onde o leiaute aceita no máximo 20. A SEFAZ
rejeitava o documento inteiro antes de olhar qualquer regra fiscal. A mesma
string carregava o nome do fornecedor — e ela viaja no XML autorizado, visível no
portal da SEFAZ de quem comprou o sistema. Agora ela é neutra e cabe no leiaute.

Passado esse, a SEFAZ recusou por falta do indicador de intermediador, exigido
para a presença de compra que o sistema usa. A nota passa a declarar "operação
sem intermediador", que é o caso da venda pelo canal da própria empresa.

O emissor é um serviço em PHP e não tinha teste nenhum — foi por isso que os dois
defeitos conviveram com uma suíte verde. Agora há um, e ele lê o código do
emissor e cobra as duas invariantes.

**A emissão ainda não funciona**, e é bom que esteja escrito: a terceira recusa da
mesma sessão foi a falta do endereço do destinatário, que a nota exige e que o
sistema ainda não tem por onde receber. Onde esse endereço passa a vir é decisão
de produto, ainda em aberto — até ela ser tomada, nenhuma nota sai.
