---
impacto: nada_mudou
secao: alterado
titulo: DANFE leva o logo da empresa, e logo quebrado não derruba o documento
---

O DANFE saía só com o nome do emitente: o `sped-da` aceita imagem, mas ninguém
mandava nenhuma. Agora a rota busca o logo que a **própria organização** subiu
(`settings.branding.logo_path`, bucket público de logos) e manda em base64 para
o sidecar — é o logo do emitente, nunca a marca de quem revende o produto.

Duas correções vieram junto, as duas medidas:

- a imagem `php:8.3-cli` instala `gd` **sem** JPEG (`docker-php-ext-install gd`
  não habilita `imagejpeg`), e o `sped-da` converte o logo com ela — sem
  `--with-jpeg` o DANFE morria em "Call to undefined function imagejpeg".
  Agora o build configura o gd com JPEG e WebP;
- se a imagem ainda assim não puder ser processada (formato exótico, arquivo
  trocado), o DANFE sai **sem** logo em vez de não sair: o documento fiscal é o
  que importa, o logo é enfeite.

Sem logo configurado, o resultado é o de antes — o layout centraliza os dados do
emitente no espaço da imagem.
