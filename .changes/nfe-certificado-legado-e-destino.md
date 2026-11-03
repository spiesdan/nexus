---
impacto: nada_mudou
secao: corrigido
titulo: NF-e emite: certificado A1 legado abre, nome da empresa sai no DANFE e o CFOP acompanha o destino
---

A primeira nota fiscal real desta instalação parou em **erro**, com a mensagem
"Impossivel ler o certificado: digital envelope routines::unsupported" — e o
arquivo estava no volume, a senha gravada e o certificado válido por mais 358
dias. Nada disso era o problema: o certificado foi emitido com cifra **RC2-40**,
que o OpenSSL 3 tirou do provedor padrão. A imagem passou a carregar também o
provedor **legacy**, então o certificado abre e continua abrindo na renovação
anual, sem converter arquivo nem pedir senha nova ao operador.

Três defeitos que só apareceriam **depois** de o certificado abrir também foram
corrigidos, medidos no XML montado com os dados reais deste pedido:

- o emitente ia com o **CNPJ no lugar da razão social** (`<xNome>`), e era isso
  que sairia impresso no DANFE; agora sai o nome do cadastro da organização;
- toda venda era declarada como **operação interna** (`idDest` fixo em 1) mesmo
  com destinatário em outro estado; agora o destino vem do endereço de entrega;
- o **CFOP** era sempre `5102`; numa venda SC→PR ele passou a sair `6102`, que é
  o mesmo código de operação para venda interestadual.

O que não mudou: NCM, alíquota e CSOSN continuam vindo do cadastro, e item sem
NCM continua recusando a emissão em vez de chutar imposto.
