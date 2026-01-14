# nfse-brazil-national

[![NPM version](https://img.shields.io/npm/v/nfse-brazil-national)](https://www.npmjs.com/package/nfse-brazil-national)

Biblioteca cliente para integração com a API Nacional da NFS-e (Nota Fiscal de Serviço Eletrônica) do Brasil.

Esta biblioteca facilita a geração, assinatura, validação e transmissão de documentos XML (DPS e Eventos) para o ambiente nacional da NFS-e.

## Funcionalidades

*   **Geração de XML**: Criação de XMLs de DPS e Cancelamento baseados em templates.
*   **Assinatura Digital**: Assinatura XMLDSIG (padrão ICP-Brasil) utilizando certificados A1 (PFX/PKCS#12 ou PEM).
*   **Validação XSD**: Validação local dos XMLs gerados contra os schemas oficiais antes do envio.
*   **Comunicação API**: Métodos para emissão síncrona, consulta e cancelamento.
*   **Geração de PDF (DANFSe)**: Geração do Documento Auxiliar da NFS-e em PDF a partir do XML.
*   **Helpers**: Utilitários para geração de IDs (DPS/Eventos) e formatação de datas no padrão exigido.

## Instalação

```bash
npm install nfse-brazil-national
```

Para melhor qualidade do QR Code na geração de PDF, recomenda-se instalar também a biblioteca `qrcode`:

```bash
npm install qrcode
```

## Uso

### Configuração

Importe a classe e instancie o cliente com as credenciais e o certificado digital.

```javascript
import { NfseNationalClient } from "nfse-brazil-national";

const client = new NfseNationalClient({
    // URL do ambiente (Homologação ou Produção)
    baseURL: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional", 
    // Caminho para o certificado PFX ou Buffer
    certificate: "./certificado.pfx",
    // Senha do certificado
    password: "sua-senha-aqui"
});
```

### Emissão de NFS-e (Envio de DPS)

Para emitir uma nota, utilize os métodos estáticos para gerar IDs e datas no formato correto.

```javascript
// 1. Gerar ID e Data formatada
const idDps = NfseNationalClient.generateDpsId(
    "3304557",        // Código Município Emitente (ex: Rio de Janeiro)
    "2",              // Tipo Inscrição Federal (2=CNPJ)
    "00000000000191", // CNPJ Emitente
    "900",            // Série
    "1"               // Número DPS
);

const dataEmissao = NfseNationalClient.generateDateTime(); // Data atual formatada

// 2. Montar dados (exemplo simplificado)
const dadosDps = {
    id: idDps,
    ambiente: "2", // 2-Homologação
    dataEmissao: dataEmissao,
    // ... demais campos (prestador, tomador, servico, valores)
};

// 3. Emitir (Gera XML, Assina, Valida XSD e Envia)
try {
    const resultado = await client.issueNfse(dadosDps);
    console.log("NFS-e emitida com sucesso!");
    console.log("Chave de Acesso:", resultado.chaveAcesso);
} catch (error) {
    console.error("Erro na emissão:", error.message);
}
```

### Geração de PDF (DANFSe)

Você pode gerar o PDF da NFS-e a partir do XML da nota.

```javascript
// Gerar PDF (Buffer)
const pdfBuffer = await client.generateNfsePdf(xmlString, {
    logo: "data:image/png;base64,..." // Opcional: Logo em Base64
});

// Gerar PDF comprimido (GZIP Base64)
const pdfGzipBase64 = await client.generateNfsePdf(xmlString, {
    gZipB64: true
});
```

### Cancelamento de NFS-e

```javascript
const chaveAcesso = "332601..."; // Chave da nota a cancelar

// 1. Gerar ID do Evento (101101 = Cancelamento)
const idEvento = NfseNationalClient.generateEventId(chaveAcesso, "101101");

const dadosCancelamento = {
    id: idEvento,
    ambiente: "2",
    versaoAplicacao: "1.0.0",
    dataHoraEvento: NfseNationalClient.generateDateTime(),
    chaveAcesso: chaveAcesso,
    codigoMotivo: "1", // 1-Erro na Emissão
    descricaoMotivo: "Cancelamento solicitado via API"
};

// 2. Enviar Cancelamento
const resultado = await client.cancelNfse(dadosCancelamento, chaveAcesso);
```

## API Reference

*   `issueNfse(dpsData)`: Gera o XML do DPS, assina e envia para a API.
*   `cancelNfse(cancelamentoData, chaveAcesso)`: Gera o XML do evento, assina e envia.
*   `getNfse(chaveAcesso)`: Retorna os dados de uma NFS-e específica.
*   `getDps(idDps)`: Consulta status de um DPS.
*   `generateDpsXml(dpsData)`: Apenas gera o XML assinado (sem enviar).
*   `validateDpsXml(xmlString)`: Valida XML contra o XSD.
*   `generateNfsePdf(xmlString, options)`: Gera o PDF da NFS-e. Opções: `logo` (Base64), `gZipB64` (boolean).
