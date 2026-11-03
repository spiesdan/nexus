<?php
/**
 * ServicoEntrada — o outro lado do fisco: NF-e que EMITIRAM contra o CNPJ.
 *
 * Distribuição de DF-e (Ambiente Nacional) + manifestação do destinatário,
 * via nfephp-org/sped-nfe. Regras que não são nossas, são da SEFAZ:
 *
 *  - O XML COMPLETO (procNFe) só vem depois de manifestar a nota (ciência,
 *    confirmação ou operação não realizada). Antes disso, só o resumo
 *    (resNFe: chave, emitente, valor, data). Sem manifestação, sem itens —
 *    e sem itens não há entrada no estoque.
 *  - Só produção distribui (homologação não tem DF-e de terceiro).
 *  - cStat 137 (nada novo) ou 656 (consumo indevido) = parar por 1h. O
 *    retorno traz `aviso: AGUARDAR_1H` e o app mostra, em vez de insistir
 *    e tomar bloqueio.
 *  - Cada chamada faz no máximo 3 consultas (até 50 docs cada). O cursor
 *    (ultNSU) mora no banco do app — a próxima sincronização continua
 *    daqui, nunca do zero.
 */

declare(strict_types=1);

namespace FiscalSidecar;

use NFePHP\Common\Certificate;
use NFePHP\NFe\Tools;

class ServicoEntrada
{
    /** @var array<string,mixed> */
    private array $config;
    private string $certPath;
    private string $certSenha;

    /** @param array<string,mixed> $payload */
    public function __construct(array $payload)
    {
        $this->config = $payload['config'] ?? [];
        $this->certPath = (string)($payload['certificado_arquivo'] ?? '');
        $this->certSenha = (string)($payload['certificado_senha'] ?? '');
    }

    /** @return array<string,mixed> */
    public function distribuir(array $payload): array
    {
        $ultNsu = (int)($payload['ult_nsu'] ?? 0);
        if ($ultNsu < 0) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'ult_nsu não pode ser negativo.'];
        }
        // O `ferramentas()` DENTRO do try de proposito: a validacao do config
        // do sped-nfe joga `DocumentsException` (ex.: UF vazia reprova o
        // schema) — fora do try isso vira fatal HTML, o app recebe
        // nao-JSON e responde "inalcancavel" para um erro de configuracao.
        try {
            $tools = $this->ferramentas();
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'CONFIG_INVALIDA', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
        if ($tools === null) {
            return ['ok' => false, 'codigo' => 'CERT_NAO_LIDO', 'mensagem' => 'Arquivo de certificado não legível no volume /certs ou senha vazia.'];
        }
        try {
            $documentos = [];
            $cstat = '';
            $xmotivo = '';
            $maxNsu = $ultNsu;
            $aviso = null;
            // 3 consultas por chamada: HTTP curto, cursor no banco continua depois.
            for ($i = 0; $i < 3; $i++) {
                $resp = $tools->sefazDistDFe($ultNsu);
                $ret = $this->lerRetorno($resp);
                if ($ret === null) {
                    return ['ok' => false, 'codigo' => 'RESPOSTA_ILEGIVEL', 'mensagem' => 'A SEFAZ respondeu fora do leiaute esperado.'];
                }
                $cstat = $ret['cstat'];
                $xmotivo = $ret['xmotivo'];
                $ultNsu = (int)$ret['ultNSU'];
                $maxNsu = (int)$ret['maxNSU'];
                foreach ($ret['documentos'] as $doc) {
                    $documentos[] = $doc;
                }
                if (in_array($cstat, ['137', '656'], true)) {
                    // 137 = nada novo · 656 = consumo indevido: parar por 1h.
                    $aviso = 'AGUARDAR_1H';
                    break;
                }
                if ($ultNsu >= $maxNsu) {
                    break;
                }
                sleep(2);
            }
            return [
                'ok' => true,
                'ultNSU' => $ultNsu,
                'maxNSU' => $maxNsu,
                'cstat' => $cstat,
                'xmotivo' => $xmotivo,
                'aviso' => $aviso,
                'documentos' => $documentos,
            ];
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'EXCECAO', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
    }

    /** @return array<string,mixed> */
    public function manifestar(array $payload): array
    {
        $chave = preg_replace('/\D/', '', (string)($payload['chave'] ?? ''));
        $evento = (string)($payload['evento'] ?? '');
        $justificativa = trim((string)($payload['justificativa'] ?? ''));
        $validos = ['210200' => 'confirmacao', '210210' => 'ciencia', '210220' => 'desconhecimento', '210240' => 'nao_realizada'];
        if (strlen($chave) !== 44 || !isset($validos[$evento])) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Chave (44 dígitos) e evento válido (210200, 210210, 210220, 210240) são obrigatórios.'];
        }
        if ($evento === '210240' && mb_strlen($justificativa) < 15) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Operação não realizada exige justificativa (15+ letras).'];
        }
        // O `ferramentas()` DENTRO do try de proposito: a validacao do config
        // do sped-nfe joga `DocumentsException` (ex.: UF vazia reprova o
        // schema) — fora do try isso vira fatal HTML, o app recebe
        // nao-JSON e responde "inalcancavel" para um erro de configuracao.
        try {
            $tools = $this->ferramentas();
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'CONFIG_INVALIDA', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
        if ($tools === null) {
            return ['ok' => false, 'codigo' => 'CERT_NAO_LIDO', 'mensagem' => 'Arquivo de certificado não legível no volume /certs ou senha vazia.'];
        }
        try {
            $resp = $tools->sefazManifesta($chave, $evento, $justificativa, 1);
            $dom = new \DOMDocument();
            if (@$dom->loadXML($resp) === false) {
                return ['ok' => false, 'codigo' => 'RESPOSTA_ILEGIVEL', 'mensagem' => 'A SEFAZ respondeu fora do leiaute esperado.'];
            }
            $cstat = $this->texto($dom, 'cStat');
            $xmotivo = $this->texto($dom, 'xMotivo');
            // 135 = evento registrado e vinculado · 136 = registrado, sem vínculo.
            if (in_array($cstat, ['135', '136'], true)) {
                return [
                    'ok' => true,
                    'cstat' => $cstat,
                    'xmotivo' => $xmotivo,
                    'protocolo' => $this->texto($dom, 'nProt'),
                    'manifestacao' => $validos[$evento],
                ];
            }
            return ['ok' => false, 'codigo' => 'SEFAZ_' . $cstat, 'mensagem' => $xmotivo];
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'EXCECAO', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
    }

    private function ferramentas(): ?Tools
    {
        if ($this->certPath === '' || $this->certSenha === '' || strpos($this->certPath, '/certs/') !== 0) {
            return null;
        }
        $pfx = @file_get_contents($this->certPath);
        if ($pfx === false) {
            return null;
        }
        $c = $this->config;
        $tpAmb = (($c['ambiente'] ?? 'homologacao') === 'producao') ? 1 : 2;
        $cert = Certificate::readPfx($pfx, $this->certSenha);
        $tools = new Tools(json_encode([
            'atualizacao' => date('Y-m-d H:i:s'),
            'tpAmb' => $tpAmb,
            'razaosocial' => $c['razao'] ?? '',
            'cnpj' => preg_replace('/\D/', '', (string)($c['cnpj'] ?? '')),
            'ie' => preg_replace('/\D/', '', (string)($c['ie'] ?? '')),
            'siglaUF' => strtoupper((string)($c['uf'] ?? '')),
            // `schemes` no plural: o schema do sped-nfe (`storage/config.schema`)
            // exige `schemes`, e `scheme` no singular reprova a validação com
            // `wrongDocument(8)` — medido em 10/10/2026, com o app recebendo
            // HTML 500 e respondendo "inalcançável" para um erro de config.
            'schemes' => 'PL_010',
            'versao' => '4.00',
        ]), $cert);
        // `55` int, e não `'55'` string: a versão atual do sped-nfe tipa
        // `model(?int)`, e string derruba com TypeError dentro do try — que
        // voltaria como CONFIG_INVALIDA apontando para o lugar certo.
        $tools->model(55);
        return $tools;
    }

    /** @return array{cstat:string,xmotivo:string,ultNSU:string,maxNSU:string,documentos:array<int,array<string,mixed>>}|null */
    private function lerRetorno(string $resp): ?array
    {
        $dom = new \DOMDocument();
        if (@$dom->loadXML($resp) === false) {
            return null;
        }
        $ret = $dom->getElementsByTagName('retDistDFeInt')->item(0);
        if ($ret === null) {
            return null;
        }
        $pegar = function (string $tag) use ($ret): string {
            $n = $ret->getElementsByTagName($tag)->item(0);
            return $n === null ? '' : trim($n->nodeValue ?? '');
        };
        $documentos = [];
        $lote = $ret->getElementsByTagName('loteDistDFeInt')->item(0);
        if ($lote !== null) {
            foreach ($lote->getElementsByTagName('docZip') as $doc) {
                /** @var \DOMElement $doc */
                $nsu = $doc->getAttribute('NSU');
                $schema = $doc->getAttribute('schema');
                $cru = gzdecode(base64_decode($doc->nodeValue ?? ''));
                if ($cru === false) {
                    continue;
                }
                $tipo = substr($schema, 0, 6);
                if ($tipo === 'resNFe') {
                    $d = $this->lerResumo($cru);
                    if ($d !== null) {
                        $d['nsu'] = $nsu;
                        $documentos[] = $d;
                    }
                } elseif ($tipo === 'procNF') {
                    $d = $this->lerCompleta($cru);
                    if ($d !== null) {
                        $d['nsu'] = $nsu;
                        $documentos[] = $d;
                    }
                } elseif ($tipo === 'procEv' || $tipo === 'resEve') {
                    $d = $this->lerEvento($cru, $tipo);
                    if ($d !== null) {
                        $d['nsu'] = $nsu;
                        $documentos[] = $d;
                    }
                }
            }
        }
        return [
            'cstat' => $pegar('cStat'),
            'xmotivo' => $pegar('xMotivo'),
            'ultNSU' => $pegar('ultNSU'),
            'maxNSU' => $pegar('maxNSU'),
            'documentos' => $documentos,
        ];
    }

    /** @return array<string,mixed>|null */
    private function lerResumo(string $xml): ?array
    {
        $dom = new \DOMDocument();
        if (@$dom->loadXML($xml) === false) {
            return null;
        }
        return [
            'tipo' => 'resumo',
            'chave' => $this->texto($dom, 'chNFe'),
            'emitente_cnpj' => $this->texto($dom, 'CNPJ') !== '' ? $this->texto($dom, 'CNPJ') : $this->texto($dom, 'CPF'),
            'emitente_nome' => $this->texto($dom, 'xNome'),
            'emitente_ie' => $this->texto($dom, 'IE'),
            'numero' => (int)$this->texto($dom, 'nNF') ?: null,
            'serie' => $this->texto($dom, 'serie') !== '' ? $this->texto($dom, 'serie') : null,
            'dh_emi' => $this->texto($dom, 'dhEmi') !== '' ? $this->texto($dom, 'dhEmi') : null,
            'valor_cents' => $this->reaisParaCents($this->texto($dom, 'vNF')),
            'xml' => null,
            'itens' => [],
            'cobranca' => [],
        ];
    }

    /** @return array<string,mixed>|null */
    private function lerCompleta(string $xml): ?array
    {
        $dom = new \DOMDocument();
        if (@$dom->loadXML($xml) === false) {
            return null;
        }
        $inf = $dom->getElementsByTagName('infNFe')->item(0);
        $chave = '';
        if ($inf instanceof \DOMElement) {
            $chave = substr((string)$inf->getAttribute('Id'), 3);
        }
        $primeiro = function (string $pai, string $filho) use ($dom): string {
            $p = $dom->getElementsByTagName($pai)->item(0);
            if ($p === null) {
                return '';
            }
            foreach ($p->childNodes as $f) {
                if ($f instanceof \DOMElement && $f->tagName === $filho) {
                    return trim($f->nodeValue ?? '');
                }
            }
            return '';
        };
        // Caminho de tags aninhadas (protNFe > infProt > nProt). `$primeiro` só
        // olha filho direto, e o protocolo não é filho direto de nada óbvio.
        $caminho = function (array $tags) use ($dom): string {
            $no = $dom->documentElement;
            foreach ($tags as $tag) {
                if (!$no instanceof \DOMElement) {
                    return '';
                }
                $achado = null;
                foreach ($no->childNodes as $f) {
                    if ($f instanceof \DOMElement && $f->tagName === $tag) {
                        $achado = $f;
                        break;
                    }
                }
                if ($achado === null) {
                    return '';
                }
                $no = $achado;
            }
            return $no instanceof \DOMElement ? trim($no->nodeValue ?? '') : '';
        };
        // Endereço do emitente: <enderEmit> é um grupo de filhos diretos, e o
        // mesmo conjunto de tags (xLgr, nro…) aparece em <enderDest>. Buscar
        // pelo grupo, não pela tag solta, evita pegar o endereço de entrega.
        $doEndereco = function (string $tag) use ($dom): string {
            $e = $dom->getElementsByTagName('enderEmit')->item(0);
            if (!($e instanceof \DOMElement)) {
                return '';
            }
            foreach ($e->childNodes as $f) {
                if ($f instanceof \DOMElement && $f->tagName === $tag) {
                    return trim($f->nodeValue ?? '');
                }
            }
            return '';
        };
        $itens = [];
        foreach ($dom->getElementsByTagName('det') as $det) {
            /** @var \DOMElement $det */
            $prod = null;
            foreach ($det->childNodes as $f) {
                if ($f instanceof \DOMElement && $f->tagName === 'prod') {
                    $prod = $f;
                    break;
                }
            }
            if ($prod === null) {
                continue;
            }
            $campo = function (string $tag) use ($prod): string {
                foreach ($prod->childNodes as $f) {
                    if ($f instanceof \DOMElement && $f->tagName === $tag) {
                        return trim($f->nodeValue ?? '');
                    }
                }
                return '';
            };
            $qtd = (float)str_replace(',', '.', $campo('qCom'));
            $unit = $this->reaisParaCents($campo('vUnCom')) / 100;

            // Impostos do item: a SEFAZ agrupa por tributo (ICMS00, IPITrib,
            // PISAliq…), então o valor mora dois níveis abaixo de <imposto>.
            // Buscar por tag no descendente cobre todos os CST/CSOSN sem
            // enumerar os ~20 grupos do leiaute — e devolve 0 quando o grupo
            // não existe (Simples sem IPI, por exemplo), que é o valor certo.
            $imposto = null;
            foreach ($det->childNodes as $f) {
                if ($f instanceof \DOMElement && $f->tagName === 'imposto') {
                    $imposto = $f;
                    break;
                }
            }
            $tributoCents = function (string $grupo, string $valor) use ($imposto): int {
                if ($imposto === null) {
                    return 0;
                }
                $g = $imposto->getElementsByTagName($grupo)->item(0);
                if (!$g instanceof \DOMElement) {
                    return 0;
                }
                $v = $g->getElementsByTagName($valor)->item(0);
                return $v === null ? 0 : $this->reaisParaCents(trim($v->nodeValue ?? ''));
            };
            $cst = '';
            if ($imposto !== null) {
                $grupoIcms = $imposto->getElementsByTagName('ICMS')->item(0);
                if ($grupoIcms instanceof \DOMElement) {
                    foreach (['CST', 'CSOSN'] as $tag) {
                        $n = $grupoIcms->getElementsByTagName($tag)->item(0);
                        if ($n !== null) {
                            $cst = trim($n->nodeValue ?? '');
                            break;
                        }
                    }
                }
            }

            $itens[] = [
                'codigo' => $campo('cProd'),
                'ean' => $campo('cEAN') !== 'SEM GTIN' ? $campo('cEAN') : null,
                'descricao' => $campo('xProd'),
                'ncm' => $campo('NCM'),
                'cfop' => $campo('CFOP'),
                'unidade' => $campo('uCom') !== '' ? $campo('uCom') : 'UN',
                'quantidade' => $qtd,
                'preco_cents' => (int)round($unit * 100),
                'total_cents' => $this->reaisParaCents($campo('vProd')),
                'icms_cents' => $tributoCents('ICMS', 'vICMS'),
                'ipi_cents' => $tributoCents('IPI', 'vIPI'),
                'pis_cents' => $tributoCents('PIS', 'vPIS'),
                'cofins_cents' => $tributoCents('COFINS', 'vCOFINS'),
                'cst' => $cst !== '' ? $cst : null,
            ];
        }
        $cobranca = [];
        foreach ($dom->getElementsByTagName('dup') as $dup) {
            /** @var \DOMElement $dup */
            $g = function (string $tag) use ($dup): string {
                foreach ($dup->childNodes as $f) {
                    if ($f instanceof \DOMElement && $f->tagName === $tag) {
                        return trim($f->nodeValue ?? '');
                    }
                }
                return '';
            };
            $cobranca[] = [
                'numero' => $g('nDup'),
                'vencimento' => $g('dVenc'),
                'valor_cents' => $this->reaisParaCents($g('vDup')),
            ];
        }
        return [
            'tipo' => 'completa',
            'chave' => $chave,
            'emitente_cnpj' => $primeiro('emit', 'CNPJ') !== '' ? $primeiro('emit', 'CNPJ') : $primeiro('emit', 'CPF'),
            'emitente_nome' => $primeiro('emit', 'xNome'),
            'emitente_ie' => $primeiro('emit', 'IE'),
            'numero' => (int)$primeiro('ide', 'nNF') ?: null,
            'serie' => $primeiro('ide', 'serie') !== '' ? $primeiro('ide', 'serie') : null,
            'dh_emi' => $primeiro('ide', 'dhEmi') !== '' ? $primeiro('ide', 'dhEmi') : null,
            'valor_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vNF')),
            'xml' => $xml,
            'itens' => $itens,
            'cobranca' => $cobranca,
            // O que a spec 21 precisa e o parser antigo jogava fora: totais,
            // endereço do emitente e protocolo de autorização. Sem eles as
            // abas Impostos/Totais e o relatório fiscal não têm dado.
            'natureza_operacao' => $primeiro('ide', 'natOp') !== '' ? $primeiro('ide', 'natOp') : null,
            'protocolo' => $caminho(['protNFe', 'infProt', 'nProt']) !== ''
                ? $caminho(['protNFe', 'infProt', 'nProt'])
                : null,
            'endereco' => [
                'logradouro' => $doEndereco('xLgr'),
                'numero' => $doEndereco('nro'),
                'complemento' => $doEndereco('xCpl'),
                'bairro' => $doEndereco('xBairro'),
                'municipio' => $doEndereco('xMun'),
                'codigo_municipio' => $doEndereco('cMun'),
                'uf' => $doEndereco('UF'),
                'cep' => $doEndereco('CEP'),
                'pais' => $doEndereco('xPais'),
                'telefone' => $doEndereco('fone'),
            ],
            'totais' => [
                'produtos_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vProd')),
                'frete_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vFrete')),
                'seguro_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vSeg')),
                'desconto_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vDesc')),
                'outras_despesas_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vOutro')),
                'icms_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vICMS')),
                'ipi_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vIPI')),
                'pis_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vPIS')),
                'cofins_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vCOFINS')),
                'total_cents' => $this->reaisParaCents($primeiro('ICMSTot', 'vNF')),
            ],
        ];
    }

    /** @return array<string,mixed>|null */
    private function lerEvento(string $xml, string $tipo): ?array
    {
        $dom = new \DOMDocument();
        if (@$dom->loadXML($xml) === false) {
            return null;
        }
        return [
            'tipo' => 'evento',
            'schema' => $tipo,
            'chave' => $this->texto($dom, 'chNFe'),
            'tp_evento' => $this->texto($dom, 'tpEvento'),
            'desc_evento' => $this->texto($dom, 'descEvento') !== '' ? $this->texto($dom, 'descEvento') : $this->texto($dom, 'xEvento'),
            // Quando o evento aconteceu e a sequência (CC-e usa nSeqEvento
            // para ordenar as cartas); o protocolo é o que a tela mostra como
            // comprovante. Sem isso o histórico fica sem data nem recibo.
            'dh_evento' => $this->texto($dom, 'dhEvento') !== '' ? $this->texto($dom, 'dhEvento') : null,
            'sequencia' => (int)$this->texto($dom, 'nSeqEvento') ?: null,
            'protocolo' => $this->texto($dom, 'nProt') !== '' ? $this->texto($dom, 'nProt') : null,
            'xml' => $tipo === 'procEv' ? $xml : null,
            'emitente_cnpj' => '',
            'emitente_nome' => '',
            'valor_cents' => 0,
            'itens' => [],
            'cobranca' => [],
        ];
    }

    /**
     * Metadados do A1 sem revelar o arquivo nem a senha.
     *
     * O app grava `sha256`, autor e data no upload, mas `titular` e `validade`
     * só existem DENTRO do PKCS#12 — abrir é trabalho do PHP, que já tem o
     * certificado no volume `/certs` e o `openssl` do runtime. A tela usa isso
     * para avisar "vence em N dias" sem nunca devolver o `.pfx`.
     *
     * `CN` de e-CNPJ costuma vir como "RAZAO SOCIAL:CNPJ"; o CNPJ sai por
     * regex de 14 dígitos. e-CPF (11 dígitos) simplesmente não casa — e a
     * ausência de CNPJ é resposta válida, não erro.
     *
     * @return array<string,mixed>
     */
    public function metadados(): array
    {
        if ($this->certPath === '' || $this->certSenha === '' || strpos($this->certPath, '/certs/') !== 0) {
            return ['ok' => false, 'codigo' => 'CERT_NAO_LIDO', 'mensagem' => 'Arquivo de certificado não legível no volume /certs ou senha vazia.'];
        }
        $pfx = @file_get_contents($this->certPath);
        if ($pfx === false) {
            return ['ok' => false, 'codigo' => 'CERT_NAO_LIDO', 'mensagem' => 'Arquivo de certificado não legível no volume /certs.'];
        }
        $certs = [];
        if (!@openssl_pkcs12_read($pfx, $certs, $this->certSenha) || empty($certs['cert'])) {
            return ['ok' => false, 'codigo' => 'CERT_ILEGIVEL', 'mensagem' => 'Não consegui abrir o PKCS#12 — senha incorreta ou arquivo corrompido.'];
        }
        $parsed = @openssl_x509_parse($certs['cert']);
        if ($parsed === false) {
            return ['ok' => false, 'codigo' => 'CERT_ILEGIVEL', 'mensagem' => 'O certificado abriu, mas o conteúdo não pôde ser lido.'];
        }
        $subject = is_array($parsed['subject'] ?? null) ? $parsed['subject'] : [];
        $titular = trim((string)($subject['CN'] ?? ''));
        if ($titular === '') {
            $titular = trim((string)($subject['O'] ?? ''));
        }
        $cnpj = null;
        if (preg_match('/(\d{14})/', $titular, $m) === 1) {
            $cnpj = $m[1];
        }
        $validade = isset($parsed['validTo_time_t']) ? gmdate('Y-m-d\TH:i:s\Z', (int)$parsed['validTo_time_t']) : null;
        $inicio = isset($parsed['validFrom_time_t']) ? gmdate('Y-m-d\TH:i:s\Z', (int)$parsed['validFrom_time_t']) : null;
        return [
            'ok' => true,
            'titular' => $titular !== '' ? $titular : null,
            'cnpj' => $cnpj,
            'validade' => $validade,
            'inicio' => $inicio,
        ];
    }

    private function texto(\DOMDocument $dom, string $tag): string
    {
        $n = $dom->getElementsByTagName($tag)->item(0);
        return $n === null ? '' : trim($n->nodeValue ?? '');
    }
    private function reaisParaCents(string $v): int
    {
        $v = trim(str_replace(',', '.', $v));
        if ($v === '' || !is_numeric($v)) {
            return 0;
        }
        return (int)round((float)$v * 100);
    }
}
