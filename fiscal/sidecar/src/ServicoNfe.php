<?php
/**
 * ServicoNfe — a ponte fina entre o contrato JSON do app e o sped-nfe.
 *
 * Magro de propósito: TODO dado fiscal (emitente, itens, impostos) chega
 * pronto no payload; aqui só se monta, assina e transmite. Imposto NÃO é
 * deduzido nem presumido — item sem configuração tributária volta 422 com o
 * nome do campo, porque alíquota errada é crime fiscal e alíquota ausente é
 * só um 422.
 *
 * CRT 1 (Simples): CSOSN 102 por item, sem destaque (o padrão honesto de quem
 * não informou tributação). CRT 2/3: exige por item {cst, aliquota_pct} —
 * sem isso, recusa em vez de chutar 18%.
 */

declare(strict_types=1);

namespace FiscalSidecar;

use NFePHP\Common\Certificate;
use NFePHP\NFe\Complements;
use NFePHP\NFe\Make;
use NFePHP\NFe\Tools;

class ServicoNfe
{
    /**
     * tPag aceitos — espelho de `FORMAS_DE_PAGAMENTO` em lib/schemas/fiscal.ts.
     * Mudou lá, muda aqui: é o mesmo leiaute.
     */
    private const FORMAS_DE_PAGAMENTO = [
        '01', '02', '03', '04', '05', '10', '11', '12', '13', '15', '16', '17',
        '18', '19', '20', '21', '22', '90', '99',
    ];

    /** modFrete — espelho de `MODALIDADES_DE_FRETE`. */
    private const MODALIDADES_DE_FRETE = ['0', '1', '2', '3', '4', '9'];

    /** `dup` no XSD do leiaute 4.00 — espelho de `MAX_DUPLICATAS`. */
    private const MAX_DUPLICATAS = 120;

    /** @var array<string,mixed> */
    private array $config;
    /** @var array<string,mixed> */
    private array $pedido;
    /** @var array<int,array<string,mixed>> */
    private array $itens;
    /**
     * Grupos da emissão que não vêm do pedido (transporte, cobrança,
     * adicionais, entrega). Vazio quando a nota sai com o que o pedido traz.
     *
     * @var array<string,mixed>
     */
    private array $extras;
    private string $certPath;
    private string $certSenha;

    /**
     * @param array<string,mixed> $payload Contrato documentado no README (seção Contrato).
     */
    public function __construct(array $payload)
    {
        $this->config = $payload['config'] ?? [];
        $this->pedido = $payload['pedido'] ?? [];
        $this->itens = $payload['itens'] ?? [];
        $extras = $payload['extras'] ?? null;
        $this->extras = is_array($extras) ? $extras : [];
        $this->certPath = (string)($payload['certificado_arquivo'] ?? '');
        $this->certSenha = (string)($payload['certificado_senha'] ?? '');
    }

    /** @return array<string,mixed> */
    public function emitir(): array
    {
        $erro = $this->validar();
        if ($erro !== null) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => $erro];
        }
        try {
            $pfx = @file_get_contents($this->certPath);
            if ($pfx === false) {
                return ['ok' => false, 'codigo' => 'CERT_NAO_LIDO', 'mensagem' => 'Arquivo de certificado não legível no volume /certs.'];
            }
            $cert = Certificate::readPfx($pfx, $this->certSenha);

            $tools = new Tools($this->montarConfigTools(), $cert);
            $tools->model(55);

            $make = new Make();
            $this->montarNFe($make);
            $xml = $make->montaNFe();
            // O render() do sped-nfe engole a exceção em getErrors(): preenchimento
            // faltando chega aqui como erro, não como XML pela metade.
            $erros = $make->getErrors();
            if (!empty($erros)) {
                return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => $this->resumir($erros)];
            }
            if ($xml === '') {
                return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Montagem do XML não produziu nada (Make::render sem saída).'];
            }
            try {
                // signNFe assina E valida contra schemes/PL_009_V4/nfe_v4.00.xsd:
                // XML fora do leiaute volta como exceção nomeando o campo.
                $xmlAssinado = $tools->signNFe($xml);
            } catch (\Throwable $e) {
                return ['ok' => false, 'codigo' => 'XML_INVALIDO', 'mensagem' => $this->resumir([$e->getMessage()])];
            }

            // Uma nota por lote → envio SÍNCRONO (indSinc = 1): o protocolo volta
            // na mesma resposta (cStat 104 + protNFe), que é o que o app grava.
            // Os dois primeiros argumentos são idLote (dígitos, ≤15) e indSinc (int).
            $lote = (string)(time() % 1000000000);
            $resp = $tools->sefazEnviaLote([$xmlAssinado], $lote, 1);

            $ret = $this->lerRetornoEmissao($resp);
            if ($ret === null) {
                return ['ok' => false, 'codigo' => 'RESPOSTA_ILEGIVEL', 'mensagem' => 'A SEFAZ respondeu fora do leiaute esperado.'];
            }
            $cstat = $ret['cstat'];
            // 104 = lote processado (no síncrono, o protocolo vem junto).
            if ($cstat === '104' && $ret['cstat_prot'] !== '') {
                // 100/120/150 = uso autorizado — a mesma lista que o Complements
                // aceita para protocolar. Denegadas (110, 205, 301…) caem no erro.
                if (in_array($ret['cstat_prot'], ['100', '120', '150'], true)) {
                    try {
                        $xmlAutorizado = Complements::toAuthorize($xmlAssinado, $resp);
                    } catch (\Throwable $e) {
                        return ['ok' => false, 'codigo' => 'EXCECAO', 'mensagem' => $this->resumir([$e->getMessage()])];
                    }
                    return [
                        'ok' => true,
                        'chave' => $ret['chave'],
                        'protocolo' => $ret['protocolo'],
                        'numero' => (int)($this->pedido['numero_nota'] ?? 0) ?: null,
                        'serie' => (string)($this->config['serie'] ?? '1'),
                        'xml' => $xmlAutorizado,
                        'cstat' => $ret['cstat_prot'],
                        'xmotivo' => $ret['xmotivo_prot'],
                    ];
                }
                return ['ok' => false, 'codigo' => 'SEFAZ_' . $ret['cstat_prot'], 'mensagem' => $ret['xmotivo_prot']];
            }
            if ($cstat === '103') {
                return ['ok' => false, 'codigo' => 'LOTE_RECEBIDO', 'mensagem' => 'Lote recebido, recibo pendente de consulta.', 'recibo' => $ret['recibo']];
            }
            return ['ok' => false, 'codigo' => 'SEFAZ_' . $cstat, 'mensagem' => $ret['xmotivo']];
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'EXCECAO', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
    }

    /**
     * Lê o retorno da autorização (<retEnviNFe>): cStat do lote + protNFe quando
     * o envio é síncrono. A resposta da SEFAZ é XML (SOAP), nunca JSON.
     *
     * @return array{cstat:string,xmotivo:string,cstat_prot:string,xmotivo_prot:string,chave:string,protocolo:string,recibo:string}|null
     */
    private function lerRetornoEmissao(string $resp): ?array
    {
        $dom = new \DOMDocument();
        if (@$dom->loadXML($resp) === false) {
            return null;
        }
        $ret = $dom->getElementsByTagName('retEnviNFe')->item(0);
        if ($ret === null) {
            return null;
        }
        $infProt = $ret->getElementsByTagName('infProt')->item(0);
        return [
            'cstat' => $this->texto($ret, 'cStat'),
            'xmotivo' => $this->texto($ret, 'xMotivo'),
            'cstat_prot' => $this->texto($infProt, 'cStat'),
            'xmotivo_prot' => $this->texto($infProt, 'xMotivo'),
            'chave' => $this->texto($infProt, 'chNFe'),
            'protocolo' => $this->texto($infProt, 'nProt'),
            'recibo' => $this->texto($ret->getElementsByTagName('infRec')->item(0), 'nRec'),
        ];
    }

    /** Texto da primeira tag dentro do nó (documento inteiro, se o nó for nulo). */
    private function texto(\DOMDocument|\DOMElement|null $no, string $tag): string
    {
        if ($no === null) {
            return '';
        }
        $n = $no->getElementsByTagName($tag)->item(0);
        return $n === null ? '' : trim($n->nodeValue ?? '');
    }

    /** Mensagens de erro do Make: as 5 primeiras, curtas o bastante para a UI. */
    private function resumir(array $erros): string
    {
        $limpo = array_values(array_filter(array_map(static fn($e) => trim((string)$e), $erros)));
        return mb_substr(implode(' | ', array_slice($limpo, 0, 5)), 0, 500);
    }

    /**
     * cStat/xMotivo/nProt de um retorno de evento (cancelamento, CC-e,
     * inutilização). O resultado do evento vive DENTRO de `infEvento` (ou
     * `infInut`): ler o primeiro cStat do documento pegaria o do envelope SOAP e
     * mentiria sobre o resultado. Quando a SEFAZ recusa no nível do lote,
     * o nó interno não existe e o cStat vem do próprio envelope.
     *
     * @return array{cstat:string,xmotivo:string,protocolo:string}|null null = XML ilegível
     */
    private function lerRetornoEvento(string $resp, string $interno): ?array
    {
        $dom = new \DOMDocument();
        if (@$dom->loadXML($resp) === false) {
            return null;
        }
        $no = $dom->getElementsByTagName($interno)->item(0);
        return [
            'cstat' => $this->texto($no, 'cStat') ?: $this->texto($dom, 'cStat'),
            'xmotivo' => $this->texto($no, 'xMotivo') ?: $this->texto($dom, 'xMotivo'),
            'protocolo' => $this->texto($no, 'nProt'),
        ];
    }

    /** @return array<string,mixed> */
    public function cancelar(array $payload): array
    {
        $chave = (string)($payload['chave'] ?? '');
        $protocolo = (string)($payload['protocolo'] ?? '');
        $justificativa = (string)($payload['justificativa'] ?? '');
        if ($chave === '' || $protocolo === '' || mb_strlen($justificativa) < 15) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Chave, protocolo e justificativa (15+ letras) são obrigatórios.'];
        }
        try {
            $pfx = @file_get_contents($this->certPath);
            if ($pfx === false) {
                return ['ok' => false, 'codigo' => 'CERT_NAO_LIDO', 'mensagem' => 'Arquivo de certificado não legível no volume /certs.'];
            }
            $cert = Certificate::readPfx($pfx, $this->certSenha);
            $tools = new Tools($this->montarConfigTools($payload['config'] ?? null), $cert);
            $tools->model(55);
            $resp = $tools->sefazCancela($chave, $justificativa, $protocolo);
            $ret = $this->lerRetornoEvento($resp, 'infEvento');
            if ($ret === null) {
                return ['ok' => false, 'codigo' => 'RESPOSTA_ILEGIVEL', 'mensagem' => 'A SEFAZ respondeu fora do leiaute esperado.'];
            }
            if ($ret['cstat'] === '135') {
                return ['ok' => true, 'protocolo_cancelamento' => $ret['protocolo']];
            }
            return ['ok' => false, 'codigo' => 'SEFAZ_' . $ret['cstat'], 'mensagem' => $ret['xmotivo']];
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'EXCECAO', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
    }

    /**
     * Carta de Correção (evento 110110). Sequência 1..20 por nota — a ordem de
     * chegada é quem conta, e a SEFAZ recusa a 21ª.
     *
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    public function cartaCorrecao(array $payload): array
    {
        $chave = (string)($payload['chave'] ?? '');
        $correcao = trim((string)($payload['correcao'] ?? ''));
        $sequencia = (int)($payload['sequencia'] ?? 0);
        if ($chave === '' || $correcao === '') {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Chave e texto da correção são obrigatórios.'];
        }
        if ($sequencia < 1 || $sequencia > 20) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Sequência da carta deve estar entre 1 e 20.'];
        }
        if (mb_strlen($correcao) < 15) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Texto da correção: mínimo de 15 caracteres.'];
        }
        try {
            $pfx = @file_get_contents($this->certPath);
            if ($pfx === false) {
                return ['ok' => false, 'codigo' => 'CERT_NAO_LIDO', 'mensagem' => 'Arquivo de certificado não legível no volume /certs.'];
            }
            $cert = Certificate::readPfx($pfx, $this->certSenha);
            $tools = new Tools($this->montarConfigTools($payload['config'] ?? null), $cert);
            $tools->model(55);
            $resp = $tools->sefazCCe($chave, $correcao, $sequencia);
            $ret = $this->lerRetornoEvento($resp, 'infEvento');
            if ($ret === null) {
                return ['ok' => false, 'codigo' => 'RESPOSTA_ILEGIVEL', 'mensagem' => 'A SEFAZ respondeu fora do leiaute esperado.'];
            }
            if ($ret['cstat'] === '135') {
                return [
                    'ok' => true,
                    'cstat' => $ret['cstat'],
                    'xmotivo' => $ret['xmotivo'],
                    'protocolo' => $ret['protocolo'],
                    'sequencia' => $sequencia,
                ];
            }
            return ['ok' => false, 'codigo' => 'SEFAZ_' . $ret['cstat'], 'mensagem' => $ret['xmotivo'] !== '' ? $ret['xmotivo'] : 'Sem retorno da SEFAZ.'];
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'EXCECAO', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
    }

    /**
     * Inutilização de numeração (evento 110111): número que nunca virou nota.
     * xJust de 15 a 255 caracteres, faixa fechada, série do emissor.
     *
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    public function inutilizar(array $payload): array
    {
        $serie = (int)($payload['serie'] ?? -1);
        $numeroInicial = (int)($payload['numero_inicial'] ?? 0);
        $numeroFinal = (int)($payload['numero_final'] ?? 0);
        $justificativa = trim((string)($payload['justificativa'] ?? ''));
        $ano = ($payload['ano'] ?? null) !== null && $payload['ano'] !== '' ? (string)$payload['ano'] : null;
        $modelo = (string)($payload['modelo'] ?? '55');
        if ($serie < 0 || $numeroInicial < 1 || $numeroFinal < $numeroInicial) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Série e faixa (inicial ≤ final, ≥ 1) são obrigatórias.'];
        }
        if (mb_strlen($justificativa) < 15 || mb_strlen($justificativa) > 255) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Justificativa deve ter de 15 a 255 caracteres.'];
        }
        if (!in_array($modelo, ['55', '65'], true)) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Modelo deve ser 55 (NF-e) ou 65 (NFC-e).'];
        }
        if ($ano !== null && !preg_match('/^\d{2}$/', $ano)) {
            return ['ok' => false, 'codigo' => 'VALIDACAO', 'mensagem' => 'Ano deve ter 2 dígitos (ex.: 26).'];
        }
        try {
            $pfx = @file_get_contents($this->certPath);
            if ($pfx === false) {
                return ['ok' => false, 'codigo' => 'CERT_NAO_LIDO', 'mensagem' => 'Arquivo de certificado não legível no volume /certs.'];
            }
            $cert = Certificate::readPfx($pfx, $this->certSenha);
            $tools = new Tools($this->montarConfigTools($payload['config'] ?? null), $cert);
            $tools->model((int)$modelo);
            $resp = $tools->sefazInutiliza($serie, $numeroInicial, $numeroFinal, $justificativa, null, $ano);
            $ret = $this->lerRetornoEvento($resp, 'infInut');
            if ($ret === null) {
                return ['ok' => false, 'codigo' => 'RESPOSTA_ILEGIVEL', 'mensagem' => 'A SEFAZ respondeu fora do leiaute esperado.'];
            }
            if ($ret['cstat'] === '1002') {
                return [
                    'ok' => true,
                    'cstat' => $ret['cstat'],
                    'xmotivo' => $ret['xmotivo'],
                    'protocolo' => $ret['protocolo'],
                ];
            }
            return ['ok' => false, 'codigo' => 'SEFAZ_' . $ret['cstat'], 'mensagem' => $ret['xmotivo'] !== '' ? $ret['xmotivo'] : 'Sem retorno da SEFAZ.'];
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'EXCECAO', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
    }

    /** @return array<string,mixed> */
    public static function danfe(string $xml): array
    {
        if (!class_exists('NFePHP\\DA\\NFe\\Danfe')) {
            return ['ok' => false, 'codigo' => 'DANFE_INDISPONIVEL', 'mensagem' => 'Pacote sped-da não instalado. Rode composer require nfephp-org/sped-da.'];
        }
        try {
            $danfe = new \NFePHP\DA\NFe\Danfe($xml);
            $danfe->debugMode(false);
            $pdf = $danfe->render();
            return ['ok' => true, 'pdf_base64' => base64_encode($pdf)];
        } catch (\Throwable $e) {
            return ['ok' => false, 'codigo' => 'EXCECAO', 'mensagem' => substr($e->getMessage(), 0, 500)];
        }
    }

    private function validar(): ?string
    {
        foreach (['cnpj', 'razao', 'ie', 'crt', 'serie'] as $campo) {
            if (empty($this->config[$campo])) {
                return 'config.' . $campo . ' é obrigatório.';
            }
        }
        $uf = strtoupper(trim((string)($this->config['uf'] ?? '')));
        if (preg_match('/^[A-Z]{2}$/', $uf) !== 1 || $this->codigoUf($uf) === '') {
            return 'config.uf é obrigatória (sigla de 2 letras, ex.: SP).';
        }
        if ($this->certPath === '' || $this->certSenha === '') {
            return 'certificado_arquivo e certificado_senha são obrigatórios.';
        }
        if (strpos($this->certPath, '/certs/') !== 0) {
            return 'certificado_arquivo deve estar dentro de /certs/.';
        }
        if (empty($this->itens)) {
            return 'Ao menos 1 item é obrigatório.';
        }
        $crt = (string)$this->config['crt'];
        foreach ($this->itens as $i => $item) {
            if (empty($item['codigo']) || empty($item['descricao']) || empty($item['quantidade'])) {
                return 'Item ' . ($i + 1) . ': codigo, descricao e quantidade são obrigatórios.';
            }
            if (($crt === '2' || $crt === '3') && (empty($item['cst']) || !isset($item['aliquota_pct']))) {
                return 'Item ' . ($i + 1) . ': CRT 2/3 exige cst e aliquota_pct — sem isso, recuso em vez de chutar alíquota.';
            }
        }
        if ((int)($this->pedido['numero_nota'] ?? 0) < 1) {
            return 'pedido.numero_nota é obrigatório (a API grava antes de chamar o sidecar).';
        }
        if (mb_strlen(trim((string)($this->pedido['nome'] ?? ''))) < 2) {
            return 'pedido.nome é obrigatório (mínimo de 2 caracteres) para o destinatário.';
        }
        // <dest> é um xs:choice no XSD: sem CNPJ, CPF ou idEstrangeiro o
        // signNFe() devolve "XML inválido" lá na frente, com o certificado já
        // aberto. Recusamos aqui, com o nome do campo.
        $docPedido = preg_replace('/\D/', '', (string)($this->pedido['documento'] ?? ''));
        if (!in_array(strlen($docPedido), [11, 14], true)) {
            return 'pedido.documento (CPF com 11 ou CNPJ com 14 dígitos) é obrigatório: sem ele o XSD recusa o destinatário.';
        }
        return $this->validarExtras();
    }

    /**
     * Valida `extras` (transporte/cobrança/adicionais/entrega) — o lado direito do
     * contrato lido do `extrasFiscaisSchema` em lib/schemas/fiscal.ts. Recusar aqui
     * antes do Tools evita um erro XSD com o certificado já aberto.
     */
    private function validarExtras(): ?string
    {
        $e = $this->extras;
        $transporte = $e['transporte'] ?? null;
        $cobranca = $e['cobranca'] ?? null;
        $adicionais = $e['adicionais'] ?? null;
        $entrega = $e['entrega'] ?? null;
        if ($transporte !== null && !is_array($transporte)) {
            return 'extras.transporte precisa ser um objeto.';
        }
        if ($cobranca !== null && !is_array($cobranca)) {
            return 'extras.cobranca precisa ser um objeto.';
        }
        if ($adicionais !== null && !is_array($adicionais)) {
            return 'extras.adicionais precisa ser um objeto.';
        }
        if ($entrega !== null && !is_array($entrega)) {
            return 'extras.entrega precisa ser um objeto.';
        }

        $transporte = is_array($transporte) ? $transporte : [];
        $cobranca = is_array($cobranca) ? $cobranca : [];
        $adicionais = is_array($adicionais) ? $adicionais : [];
        $entrega = is_array($entrega) ? $entrega : [];

        // --- transporte ---
        if (isset($transporte['modalidade_frete'])
            && !in_array((string)$transporte['modalidade_frete'], self::MODALIDADES_DE_FRETE, true)) {
            return 'extras.transporte.modalidade_frete deve ser ' . implode('/', self::MODALIDADES_DE_FRETE) . '.';
        }
        $doc = preg_replace('/\D/', '', (string)($transporte['transportador']['documento'] ?? ''));
        if ($doc !== '' && !in_array(strlen($doc), [11, 14], true)) {
            return 'extras.transporte.transportador.documento deve ter 11 (CPF) ou 14 dígitos (CNPJ).';
        }
        $nomeTransportador = trim((string)($transporte['transportador']['nome'] ?? ''));
        if ($nomeTransportador !== '' && (mb_strlen($nomeTransportador) < 2 || mb_strlen($nomeTransportador) > 60)) {
            return 'extras.transporte.transportador.nome deve ter de 2 a 60 caracteres.';
        }
        $qVol = $transporte['volumes']['quantidade'] ?? null;
        if ($qVol !== null && (int)$qVol < 1) {
            return 'extras.transporte.volumes.quantidade deve ser ao menos 1.';
        }

        // --- cobrança ---
        $forma = (string)($cobranca['forma_pagamento'] ?? '');
        if ($forma !== '' && !in_array($forma, self::FORMAS_DE_PAGAMENTO, true)) {
            return 'extras.cobranca.forma_pagamento "' . $forma . '" fora do leiaute da NF-e.';
        }
        $descricao = trim((string)($cobranca['descricao'] ?? ''));
        if ($descricao !== '' && (mb_strlen($descricao) < 2 || mb_strlen($descricao) > 60)) {
            return 'extras.cobranca.descricao deve ter de 2 a 60 caracteres.';
        }
        if ($forma === '99' && $descricao === '') {
            return 'extras.cobranca.descricao é obrigatória quando forma_pagamento = 99.';
        }
        $parcelas = (int)($cobranca['parcelas'] ?? 1);
        if ($parcelas < 1 || $parcelas > self::MAX_DUPLICATAS) {
            return 'extras.cobranca.parcelas deve ficar entre 1 e ' . self::MAX_DUPLICATAS . '.';
        }
        if ($parcelas > 1) {
            if (empty($cobranca['primeiro_vencimento'])) {
                return 'extras.cobranca.primeiro_vencimento é obrigatório com parcelas > 1.';
            }
            if (!$this->dataValida((string)$cobranca['primeiro_vencimento'])) {
                return 'extras.cobranca.primeiro_vencimento precisa ser AAAA-MM-DD.';
            }
            if (!array_key_exists('dias_entre', $cobranca)) {
                return 'extras.cobranca.dias_entre é obrigatório com parcelas > 1.';
            }
            if ((int)$cobranca['dias_entre'] < 0 || (int)$cobranca['dias_entre'] > 365) {
                return 'extras.cobranca.dias_entre deve ficar entre 0 e 365.';
            }
        }

        // --- adicionais ---
        if (mb_strlen((string)($adicionais['informacoes_complementares'] ?? '')) > 5000) {
            return 'extras.adicionais.informacoes_complementares passa de 5000 caracteres (limite da SEFAZ).';
        }
        if (mb_strlen((string)($adicionais['informacoes_fisco'] ?? '')) > 2000) {
            return 'extras.adicionais.informacoes_fisco passa de 2000 caracteres (limite da SEFAZ).';
        }

        // --- entrega (TLocal: xLgr, nro, xBairro, cMun, xMun e UF obrigatórios) ---
        if ($entrega !== []) {
            foreach (['logradouro', 'numero', 'bairro', 'municipio', 'uf'] as $campo) {
                if (trim((string)($entrega[$campo] ?? '')) === '') {
                    return 'extras.entrega.' . $campo . ' é obrigatório quando há endereço de entrega.';
                }
            }
            if (preg_match('/^[A-Z]{2}$/', (string)($entrega['uf'] ?? '')) !== 1) {
                return 'extras.entrega.uf deve ser a sigla de 2 letras.';
            }
            if (preg_match('/^\d{7}$/', (string)($entrega['codigo_municipio'] ?? '')) !== 1) {
                return 'extras.entrega.codigo_municipio (7 dígitos, IBGE) é obrigatório.';
            }
            $cep = preg_replace('/\D/', '', (string)($entrega['cep'] ?? ''));
            if ($cep !== '' && strlen($cep) !== 8) {
                return 'extras.entrega.cep deve ter 8 dígitos.';
            }
        }
        return null;
    }

    /** AAAA-MM-DD que sobrevive a DateTimeImmutable (01/02/2026 não vira 03/02). */
    private function dataValida(string $data): bool
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $data, $m)) {
            return false;
        }
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $data);
        return $d !== false && $d->format('Y-m-d') === $data;
    }

    /** @return string */
    private function montarConfigTools(?array $config = null): string
    {
        $c = $config ?? $this->config;
        $tpAmb = (($c['ambiente'] ?? 'homologacao') === 'producao') ? 1 : 2;
        return json_encode([
            'atualizacao' => date('Y-m-d H:i:s'),
            // tpAmb é integer no config.schema do sped-nfe: string derruba o
            // JSON-schema antes de qualquer webservice ser chamado.
            'tpAmb' => $tpAmb,
            // siglaUF é obrigatório no Config do sped-nfe: é ele que roteia os
            // webservices (NfeInutilizacao inclusa) — sem ele, inutilizar quebra.
            'siglaUF' => strtoupper(trim((string)($c['uf'] ?? ''))),
            'razaosocial' => (string)($c['razao'] ?? ''),
            'cnpj' => preg_replace('/\D/', '', (string)($c['cnpj'] ?? '')),
            'ie' => preg_replace('/\D/', '', (string)($c['ie'] ?? '')),
            'crt' => (string)($c['crt'] ?? ''),
            // O campo é `schemes` (plural) no config.schema e define qual pasta
            // de XSD o signNFe() usa. PL_009_V4 é a que acompanha a v5.x.
            'schemes' => 'PL_009_V4',
            'versao' => '4.00',
        ]);
    }

    /**
     * Monta o XML. Tudo aqui é `stdClass`: com declare(strict_types=1) o
     * sped-nfe recusa array onde pede stdClass — e o equilizeParameters() dele
     * não converte.
     *
     * Ordem dos grupos = a que o render() espera montar (ide, emit, dest,
     * entrega, det, total, transp, cobr, pag, infAdic).
     */
    private function montarNFe(Make $make): void
    {
        $c = $this->config;
        $p = $this->pedido;
        $serie = (int)($c['serie'] ?? 1);
        $tpAmb = (($c['ambiente'] ?? 'homologacao') === 'producao') ? 1 : 2;
        $frete = ((float)($p['frete_cents'] ?? 0)) / 100;
        $vProd = $this->somaDosProdutos();
        $vNF = round($vProd + $frete, 2);

        $make->taginfNFe((object)['versao' => '4.00']);
        $make->tagide((object)[
            'cUF' => $this->codigoUf((string)($c['uf'] ?? '')),
            // Nulos de propósito: o Make gera um cNF válido (Keys::random —
            // rejeita repetido e sequencial) e o checkNFeKey() monta a chave e
            // corrige o cDV. time() truncado em 8 dígitos podia ser um deles.
            'cNF' => null,
            'natOp' => (string)($c['natureza'] ?? 'VENDA'),
            'mod' => '55',
            'serie' => (string)$serie,
            'nNF' => (string)($p['numero_nota'] ?? 1),
            // Nulo: o Make datat no fuso da UF, não no do servidor.
            'dhEmi' => null,
            'tpNF' => '1',
            'idDest' => '1',
            'cMunFG' => (string)($c['codigo_municipio'] ?? ''),
            'tpImp' => '1',
            'tpEmis' => '1',
            'cDV' => null,
            'tpAmb' => (string)$tpAmb,
            'finNFe' => '1',
            'indFinal' => '1',
            // indPres 9 = não presencial, outros. indPag NÃO entra aqui: no
            // leiaute 4.00 ele só existe dentro de detPag (o XSD tem um único
            // indPag, filho de detPag) — em ide ele rejeita.
            'indPres' => '9',
            'procEmi' => '0',
            'verProc' => 'deskcomm-fiscal-sidecar/1.0',
        ]);
        $make->tagemit((object)[
            'xNome' => (string)$c['razao'],
            'CNPJ' => preg_replace('/\D/', '', (string)$c['cnpj']),
            'IE' => preg_replace('/\D/', '', (string)$c['ie']),
            'CRT' => (string)$c['crt'],
        ]);
        $make->tagenderEmit((object)[
            'xLgr' => (string)($c['logradouro'] ?? ''),
            'nro' => (string)($c['numero_end'] ?? 'S/N'),
            'xBairro' => (string)($c['bairro'] ?? ''),
            'cMun' => (string)($c['codigo_municipio'] ?? ''),
            'xMun' => (string)($c['municipio'] ?? ''),
            'UF' => strtoupper(trim((string)($c['uf'] ?? ''))),
            'CEP' => preg_replace('/\D/', '', (string)($c['cep'] ?? '')),
        ]);
        $this->montarDest($make);

        $crt = (string)($c['crt'] ?? '');
        $n = 0;
        foreach ($this->itens as $item) {
            $n++;
            $qtd = (float)$item['quantidade'];
            $unit = ((float)($item['preco_cents'] ?? 0)) / 100;
            $descPct = (float)($item['desconto_pct'] ?? 0);
            $unitLiquido = round($unit * (1 - $descPct / 100), 2);
            $vItem = round($qtd * $unitLiquido, 2);
            $make->tagprod((object)[
                // A chave do item é `item` (int). `nItem` não está em possible:
                // passar ele deixa item nulo e o render() colapsa todos os
                // produtos num único <det>.
                'item' => $n,
                'cProd' => (string)$item['codigo'],
                'cEAN' => 'SEM GTIN',
                'xProd' => (string)$item['descricao'],
                'NCM' => preg_replace('/\D/', '', (string)($item['ncm'] ?? '00000000')),
                'CFOP' => (string)($item['cfop'] ?? $c['cfop'] ?? '5102'),
                'uCom' => (string)($item['unidade'] ?? 'UN'),
                'qCom' => $this->moeda($qtd, 4),
                'vUnCom' => $this->moeda($unitLiquido),
                'vProd' => $this->moeda($vItem),
                'cEANTrib' => 'SEM GTIN',
                'uTrib' => (string)($item['unidade'] ?? 'UN'),
                'qTrib' => $this->moeda($qtd, 4),
                'vUnTrib' => $this->moeda($unitLiquido),
                'indTot' => '1',
            ]);
            if ($crt === '1') {
                // Simples Nacional: CSOSN do item, sem destaque de ICMS.
                $make->tagICMSSN((object)[
                    'item' => $n,
                    'CSOSN' => (string)($item['csosn'] ?? '102'),
                    'orig' => '0',
                ]);
            } else {
                $aliq = (float)($item['aliquota_pct'] ?? 0);
                $make->tagICMS((object)[
                    'item' => $n,
                    'CST' => (string)($item['cst'] ?? '00'),
                    'modBC' => '3',
                    'vBC' => $this->moeda($vItem),
                    'pICMS' => $this->moeda($aliq),
                    'vICMS' => $this->moeda(round($vItem * $aliq / 100, 2)),
                    'orig' => '0',
                ]);
            }
            $make->tagPIS((object)['item' => $n, 'CST' => '07']);
            $make->tagCOFINS((object)['item' => $n, 'CST' => '07']);
        }

        // Totais: o Make já soma vProd/vBC/vICMS a partir das tags de item e
        // recalcula vNF (buildTotalICMS). Só vFrete não tem de onde vir — o
        // acumulador dele enche pelo tagprod, que não recebe frete —, então é o
        // único valor que entra explícito. Assim total e det batem por
        // construção, e não por dois arredondamentos paralelos.
        $make->tagICMSTot((object)['vFrete' => $this->moeda($frete)]);

        $this->montarTransporte($make);
        $this->montarPagamento($make, $vNF);
        $this->montarAdicionais($make);
        $this->montarEntrega($make);
    }

    /**
     * Destinatário. O XSD exige UM de CNPJ/CPF/idEstrangeiro dentro de <dest>
     * (é um xs:choice): sem documento o signNFe() derruba o XML — por isso
     * validar() recusa antes de abrir o certificado. Em homologação o próprio
     * Make troca o xNome pela frase obrigatória da SEFAZ.
     */
    private function montarDest(Make $make): void
    {
        $p = $this->pedido;
        $doc = preg_replace('/\D/', '', (string)($p['documento'] ?? ''));
        $dest = (object)[
            'xNome' => trim((string)($p['nome'] ?? '')),
            'indIEDest' => '9',
        ];
        if (strlen($doc) === 14) {
            $dest->CNPJ = $doc;
        } elseif (strlen($doc) === 11) {
            $dest->CPF = $doc;
        }
        $make->tagdest($dest);
    }

    /** Soma de vProd — a MESMA fórmula do tagprod, para o total fechar. */
    private function somaDosProdutos(): float
    {
        $total = 0.0;
        foreach ($this->itens as $item) {
            $qtd = (float)$item['quantidade'];
            $unit = ((float)($item['preco_cents'] ?? 0)) / 100;
            $descPct = (float)($item['desconto_pct'] ?? 0);
            $total += round($qtd * round($unit * (1 - $descPct / 100), 2), 2);
        }
        return round($total, 2);
    }

    /** transp → transporta → vol, na ordem em que o leiaute os aceita. */
    private function montarTransporte(Make $make): void
    {
        $t = $this->extras['transporte'] ?? [];
        $t = is_array($t) ? $t : [];
        $modFrete = (string)($t['modalidade_frete'] ?? '9');
        if (!in_array($modFrete, self::MODALIDADES_DE_FRETE, true)) {
            $modFrete = '9';
        }
        $make->tagtransp((object)['modFrete' => $modFrete]);

        $tr = $t['transportador'] ?? null;
        if (is_array($tr)) {
            $doc = preg_replace('/\D/', '', (string)($tr['documento'] ?? ''));
            $nome = trim((string)($tr['nome'] ?? ''));
            if ($nome !== '' || $doc !== '') {
                $ie = trim((string)($tr['ie'] ?? ''));
                $uf = strtoupper(trim((string)($tr['uf'] ?? '')));
                $make->tagtransporta((object)[
                    'xNome' => $nome !== '' ? $nome : null,
                    'CNPJ' => strlen($doc) === 14 ? $doc : null,
                    'CPF' => strlen($doc) === 11 ? $doc : null,
                    'IE' => $ie !== '' ? preg_replace('/\D/', '', $ie) : null,
                    'xEnder' => ($e = trim((string)($tr['endereco'] ?? ''))) !== '' ? $e : null,
                    'xMun' => ($m = trim((string)($tr['municipio'] ?? ''))) !== '' ? $m : null,
                    'UF' => preg_match('/^[A-Z]{2}$/', $uf) === 1 ? $uf : null,
                ]);
            }
        }

        $v = $t['volumes'] ?? null;
        if (!is_array($v) || $v === []) {
            return;
        }
        $vol = ['item' => 1];
        if (isset($v['quantidade'])) {
            $vol['qVol'] = (string)(int)$v['quantidade'];
        }
        foreach (['especie' => 'esp', 'marca' => 'marca', 'numeracao' => 'nVol'] as $origem => $destino) {
            $valor = trim((string)($v[$origem] ?? ''));
            if ($valor !== '') {
                $vol[$destino] = $valor;
            }
        }
        foreach (['peso_liquido_kg' => 'pesoL', 'peso_bruto_kg' => 'pesoB'] as $origem => $destino) {
            if (isset($v[$origem]) && is_numeric($v[$origem])) {
                $vol[$destino] = (float)$v[$origem];
            }
        }
        if (count($vol) > 1) {
            $make->tagvol((object)$vol);
        }
    }

    /**
     * pag → detPag (obrigatório) → cobr/dup.
     *
     * Sem `extras.cobranca` nenhuma forma de pagamento veio do pedido — a nota
     * sai com tPag 99 (outros) e xPag "Não informada", em vez de ser recusada.
     * É o padrão que mantém o fluxo de venda de pé enquanto o app não tiver
     * forma de pagamento por pedido. INFERIDO — documentado no README.
     */
    private function montarPagamento(Make $make, float $vNF): void
    {
        $cob = $this->extras['cobranca'] ?? [];
        $cob = is_array($cob) ? $cob : [];
        $parcelas = max(1, (int)($cob['parcelas'] ?? 1));
        $forma = (string)($cob['forma_pagamento'] ?? '');
        if (!in_array($forma, self::FORMAS_DE_PAGAMENTO, true)) {
            $forma = '99';
        }
        $descricao = trim((string)($cob['descricao'] ?? ''));
        // indPag 0 = à vista (1 parcela), 1 = a prazo. Só existe em detPag.
        $indPag = $parcelas > 1 ? '1' : '0';

        $make->tagpag((object)['vTroco' => null]);
        $make->tagdetPag((object)[
            'indPag' => $indPag,
            'tPag' => $forma,
            'xPag' => $descricao !== ''
                ? mb_substr($descricao, 0, 60)
                : ($forma === '99' ? 'Não informada' : null),
            'vPag' => $this->moeda($vNF),
        ]);

        if ($parcelas > 1) {
            $this->montarDuplicatas(
                $make,
                $vNF,
                $parcelas,
                (string)($cob['primeiro_vencimento'] ?? ''),
                (int)($cob['dias_entre'] ?? 0)
            );
        }
    }

    /**
     * <cobr/dup> — uma por parcela, com vDup somando exatamente vNF.
     *
     * INFERIDO (sem forma de pagamento gravada por pedido, não há de onde
     * copiar): o total é dividido em N parcelas iguais de 2 casas e o resto da
     * divisão, em centavos, vai para a ÚLTIMA — é o jeito de a soma bater sem
     * quebrar a casa decimal. nDup = 3 dígitos; dVenc = 1º vencimento + i × dias.
     * Sem tagfat: o ERP antigo não emitia e o XSD dispensa o grupo.
     */
    private function montarDuplicatas(Make $make, float $vNF, int $parcelas, string $primeiro, int $diasEntre): void
    {
        $base = $this->dataValida($primeiro)
            ? \DateTimeImmutable::createFromFormat('!Y-m-d', $primeiro)
            : false;
        if ($base === false || $diasEntre < 0) {
            return;
        }
        $totalCents = (int)round($vNF * 100);
        $porParcela = intdiv($totalCents, $parcelas);
        if ($porParcela <= 0) {
            return;
        }
        $resto = $totalCents - $porParcela * $parcelas;
        for ($i = 0; $i < $parcelas; $i++) {
            $cents = $porParcela + ($i === $parcelas - 1 ? $resto : 0);
            $venc = $base->modify('+' . ($i * $diasEntre) . ' days');
            if ($venc === false) {
                continue;
            }
            $make->tagdup((object)[
                'nDup' => str_pad((string)($i + 1), 3, '0', STR_PAD_LEFT),
                'dVenc' => $venc->format('Y-m-d'),
                'vDup' => $this->moeda($cents / 100),
            ]);
        }
    }

    /** infAdic (infAdFisco + infCpl). Só emite se houver texto. */
    private function montarAdicionais(Make $make): void
    {
        $a = $this->extras['adicionais'] ?? [];
        $a = is_array($a) ? $a : [];
        $infCpl = trim((string)($a['informacoes_complementares'] ?? ''));
        $infFisco = trim((string)($a['informacoes_fisco'] ?? ''));
        if ($infCpl === '' && $infFisco === '') {
            return;
        }
        $make->taginfAdic((object)[
            'infAdFisco' => $infFisco !== '' ? mb_substr($infFisco, 0, 2000) : null,
            'infCpl' => $infCpl !== '' ? mb_substr($infCpl, 0, 5000) : null,
        ]);
    }

    /**
     * <entrega> — endereço de entrega diferente do destinatário.
     *
     * O tagentrega() escreve CNPJ quando não há CPF, e o CNPJ é obrigatório
     * naquele ramo: sem documento do pedido ele derruba a montagem, por isso
     * validar() já recusou antes.
     */
    private function montarEntrega(Make $make): void
    {
        $e = $this->extras['entrega'] ?? [];
        if (!is_array($e) || $e === []) {
            return;
        }
        $doc = preg_replace('/\D/', '', (string)($this->pedido['documento'] ?? ''));
        if (strlen($doc) !== 11 && strlen($doc) !== 14) {
            return;
        }
        $nome = trim((string)($this->pedido['nome'] ?? ''));
        $cep = preg_replace('/\D/', '', (string)($e['cep'] ?? ''));
        $make->tagentrega((object)[
            'CPF' => strlen($doc) === 11 ? $doc : null,
            'CNPJ' => strlen($doc) === 14 ? $doc : null,
            'xNome' => $nome !== '' ? mb_substr($nome, 0, 60) : null,
            'xLgr' => (string)($e['logradouro'] ?? ''),
            'nro' => (string)($e['numero'] ?? ''),
            'xCpl' => ($x = trim((string)($e['complemento'] ?? ''))) !== '' ? $x : null,
            'xBairro' => (string)($e['bairro'] ?? ''),
            'cMun' => (string)($e['codigo_municipio'] ?? ''),
            'xMun' => (string)($e['municipio'] ?? ''),
            'UF' => strtoupper((string)($e['uf'] ?? '')),
            'CEP' => strlen($cep) === 8 ? $cep : null,
        ]);
    }

    /** Dinheiro no leiaute da NF-e: ponto como separador, N casas. */
    private function moeda(float $v, int $casas = 2): string
    {
        return number_format($v, $casas, '.', '');
    }

    private function codigoUf(string $uf): string
    {
        $mapa = [
            'RO' => '11', 'AC' => '12', 'AM' => '13', 'RR' => '14', 'PA' => '15',
            'AP' => '16', 'TO' => '17', 'MA' => '21', 'PI' => '22', 'CE' => '23',
            'RN' => '24', 'PB' => '25', 'PE' => '26', 'AL' => '27', 'SE' => '28',
            'BA' => '29', 'MG' => '31', 'ES' => '32', 'RJ' => '33', 'SP' => '35',
            'PR' => '41', 'SC' => '42', 'RS' => '43', 'MS' => '50', 'MT' => '51',
            'GO' => '52', 'DF' => '53',
        ];
        $uf = strtoupper(trim($uf));
        return $mapa[$uf] ?? '';
    }
}
