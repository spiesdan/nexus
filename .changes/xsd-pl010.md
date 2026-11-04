---
impacto: nada_mudou
secao: corrigido
titulo: A validação do XML passa a usar o XSD do PL_010, o único que conhece IBS/CBS
---

A primeira emissão depois de incluir o IBS/CBS foi recusada pelo **próprio
sidecar**, antes de sair para a SEFAZ:

```
XML_INVALIDO: Element 'IBSCBS': This element is not expected.
Expected is one of ( COFINSST, ICMSUFDest )
```

O `signNFe` valida o XML contra a pasta de XSD configurada em `schemes`, e ela
estava em **`PL_009_V4`** — leiaute anterior à reforma. O grupo existia no XML, e
o validador não o conhecia. Agora a pasta é **`PL_010_V1.30`**, que é a que
acompanha o `sped-nfe` 5.2.9 com IBS/CBS. Medido: o mesmo XML prévia, validado
manualmente conta o PL_009, acusa exatamente o `IBSCBS`; contra o PL_010 a única
falta é a `<Signature>`, que o `signNFe` acrescenta ao assinar.

Junto, a rota **`POST /previa`** entra na imagem (ela tinha ficado só no código
local): monta e devolve o XML sem transmitir, para conferir o leiaute antes de
consumir um número.
