// Prova que o Chromium do Playwright ABRE neste runner.
//
// Chamado por `scripts/ci/instalar-chromium.sh` quando o `apt` não conseguiu
// instalar as libs de sistema (mirror fora, DNS quebrado — o que aconteceu em
// 2026-11-11). A pergunta que decide o gate não é "o apt funcionou?", é "o
// browser abre?" — se abre, a suíte roda de verdade e derrubar o CI por causa do
// mirror é ruído.
//
// Sai 0 quando uma página abre e fecha; 1 (com a mensagem do Chromium) quando não.
//
// Deliberadamente sem `--no-sandbox` manual: quem roda é o usuário `runner`, não
// root, e é a mesma configuração dos specs. Um sandbox que só existe aqui não
// provaria nada sobre a suíte.
const { chromium } = require("@playwright/test");

(async () => {
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    await pagina.goto("data:text/html,<title>nexus</title>");
    await pagina.title();
  } finally {
    await navegador.close();
  }
  console.log(`Chromium abriu: ${chromium.executablePath()}`);
})().catch((erro) => {
  console.error(`Chromium não abriu: ${erro && erro.message ? erro.message : erro}`);
  process.exit(1);
});
