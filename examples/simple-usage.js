import { NfseNationalClient } from "../src/index.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// --- CONFIGURAÇÃO ---
const CERTIFICATE_PATH = "...";
const CERTIFICATE_PASSWORD = "---";
const SEQUENCE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "sequence.json");
// --------------------

async function getNextSequence() {
    try {
        const data = await fs.readFile(SEQUENCE_FILE, 'utf8');
        const json = JSON.parse(data);
        const next = json.lastSequence + 1;
        await fs.writeFile(SEQUENCE_FILE, JSON.stringify({ lastSequence: next }, null, 2));
        return next;
    } catch (error) {
        // Se o arquivo não existir, começa do 1
        const initial = 1;
        await fs.writeFile(SEQUENCE_FILE, JSON.stringify({ lastSequence: initial }, null, 2));
        return initial;
    }
}

async function main() {
    const baseURL = "https://sefin.producaorestrita.nfse.gov.br/SefinNacional";
    //const baseURL = "https://sefin.nfse.gov.br/SefinNacional";

    try {
        console.log(`Usando certificado: ${CERTIFICATE_PATH}`);

        const client = new NfseNationalClient({
            baseURL: baseURL,
            certificate: CERTIFICATE_PATH,
            password: CERTIFICATE_PASSWORD
        });

        // Dados para geração do ID da DPS
        const municipioEmitente = "3304557"; // Rio de Janeiro
        const tipoInscricaoFederal = "2"; // 2-CNPJ
        const inscricaoFederal = "38027543000175"; // CNPJ
        const serieDps = "900"; // Série do XML exemplo
        
        // Obtém o próximo número sequencial
        const seq = await getNextSequence();
        const numeroDps = seq.toString();
        
        // Gera o ID utilizando o helper da biblioteca
        const idDps = NfseNationalClient.generateDpsId(
            municipioEmitente, 
            tipoInscricaoFederal, 
            inscricaoFederal, 
            serieDps, 
            numeroDps
        );

        const dadosDps = {
            // --- Informações do DPS ---
            id: idDps,
            versaoAplicacao: "1.0.0",
            ambiente: "2", // 1-Produção, 2-Homologação
            dataEmissao: NfseNationalClient.generateDateTime(),
            serie: serieDps,
            numero: numeroDps,
            competencia: "2026-01-01", // Competência do XML exemplo
            tipoEmitente: "1", // 1-Prestador
            municipioEmissao: municipioEmitente,

            // --- Prestador ---
            prestador: {
                cnpj: inscricaoFederal,
                telefone: "5121026080",
                optanteSimplesNacional: "3", // 1-Não Optante, 2-MEI, 3-ME/EPP
                regimeApuracaoTributacaoSN: "1", // 1-Recolhimento pelo SN
                regimeEspecialTributacao: "0" // 0-Nenhum
            },

            // --- Tomador ---
            tomador: {
                cpf: "...",
                nome: "...",

                /*endereco: {
                    codigoMunicipio: "...",
                    cep: "...",
                    logradouro: "...",
                    numero: "...",
                    bairro: "...",
                    complemento: "...",
                },
                telefone: "...",
                email: "..."*/
            },

            // --- Serviço ---
            servico: {
                municipioPrestacao: municipioEmitente,
                codigoTributacaoNacional: "080201",
                codigoTributacaoMunicipal: "015",
                descricao: "...",
                codigoNbs: "122051900",
                codigoInterno: "0"
            },

            valores: {
                valorServicos: "10.00",
                tributacaoIssqn: "1",
                tipoRetencaoIssqn: "1", 
                //aliquotaIssqn: "0.00",
                tributosDetalhado: {
                    federal: "0.00",
                    estadual: "0.00",
                    municipal: "0.00"
                }
            }
        };
        
        console.log("Gerando XML...");
        const xmlAssinado = await client.generateDpsXml(dadosDps);

        console.log("Validando XML contra XSD...");
        await client.validateDpsXml(xmlAssinado);
        console.log("XML Válido!");

        console.log(`Enviando DPS (ID: ${dadosDps.id})...`);
        
        let resultado;
        resultado = await client.issueNfse(xmlAssinado);
        
        if (resultado) {
            console.log("Sucesso! Resposta da API:");
            console.log(JSON.stringify(resultado, null, 2));
        }

        if (resultado && resultado.chaveAcesso) {
            console.log(`\nTentando cancelar a NFS-e: ${resultado.chaveAcesso}`);
            
            const cancelamentoData = {
                id: NfseNationalClient.generateEventId(resultado.chaveAcesso, "101101"),
                ambiente: "2", // 1-Produção, 2-Homologação
                versaoAplicacao: "1.0.0",
                dataHoraEvento: NfseNationalClient.generateDateTime(),
                cnpjAutor: inscricaoFederal, 
                chaveAcesso: resultado.chaveAcesso,
                numeroPedido: "001",
                codigoMotivo: "1", // 1-Erro na Emissão
                descricaoMotivo: "Teste de cancelamento via API"
            };

            console.log("Gerando XML de Cancelamento...");
            const xmlCancelamento = await client.generateCancellationXml(cancelamentoData);

            console.log("Validando XML de Cancelamento...");
            await client.validateEventXml(xmlCancelamento);
            console.log("XML de Cancelamento Válido!");

            const resultadoCancelamento = await client.cancelNfse(xmlCancelamento, resultado.chaveAcesso);
            console.log("Cancelamento realizado com sucesso!");
            console.log(JSON.stringify(resultadoCancelamento, null, 2));
        }

    } catch (error) {
        console.error("Erro na execução:");
        if (error.status) {
            console.error(`Status HTTP: ${error.status}`);
            console.error("Detalhes:", JSON.stringify(error.data, null, 2));
        } else {
            console.error("Mensagem:", error.message);
            if (error.cause) {
                console.error("Causa:", error.cause);
            }
            if (error.code) {
                console.error("Código de Erro:", error.code);
            }
            if (error.originalError && error.originalError.response) {
                 console.error("Dados da Resposta:", error.originalError.response.data);
            }
        }
    }
}

main();
