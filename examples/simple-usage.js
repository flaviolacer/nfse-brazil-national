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
        console.log(`Using certificate: ${CERTIFICATE_PATH}`);

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
                },
                // Exemplo de uso dos novos campos (opcional)
                // descontos: {
                //     incondicionado: "0.00",
                //     condicionado: "0.00"
                // },
                // deducaoReducao: {
                //     // Escolha um: percentual ou valor
                //     // percentual: "0.00", 
                //     // valor: "0.00"
                // }
            }
        };
        
        console.log("Generating XML...");
        const xmlAssinado = await client.generateDpsXml(dadosDps);

        console.log("Validating XML against XSD...");
        await client.validateDpsXml(xmlAssinado);
        console.log("XML Valid!");

        console.log(`Sending DPS (ID: ${dadosDps.id})...`);
        
        let resultado;
        resultado = await client.issueNfse(xmlAssinado);
        
        if (resultado) {
            console.log("Success! API Response:");
            console.log(JSON.stringify(resultado, null, 2));
        }

        if (resultado && resultado.chaveAcesso) {
            console.log(`\nAttempting to cancel NFS-e: ${resultado.chaveAcesso}`);
            
            const cancelamentoData = {
                id: NfseNationalClient.generateEventId(resultado.chaveAcesso, "101101"),
                ambiente: "2", // 1-Produção, 2-Homologação
                versaoAplicacao: "1.0.0",
                dataHoraEvento: NfseNationalClient.generateDateTime(),
                cnpjAutor: inscricaoFederal, 
                chaveAcesso: resultado.chaveAcesso,
                numeroPedido: "001",
                codigoMotivo: "1", // 1-Erro na Emissão
                descricaoMotivo: "Cancellation test via API"
            };

            console.log("Generating Cancellation XML...");
            const xmlCancelamento = await client.generateCancellationXml(cancelamentoData);

            console.log("Validating Cancellation XML...");
            await client.validateEventXml(xmlCancelamento);
            console.log("Cancellation XML Valid!");

            const resultadoCancelamento = await client.cancelNfse(xmlCancelamento, resultado.chaveAcesso);
            console.log("Cancellation successful!");
            console.log(JSON.stringify(resultadoCancelamento, null, 2));
        }

    } catch (error) {
        console.error("Execution error:");
        if (error.status) {
            console.error(`HTTP Status: ${error.status}`);
            console.error("Details:", JSON.stringify(error.data, null, 2));
        } else {
            console.error("Message:", error.message);
            if (error.cause) {
                console.error("Cause:", error.cause);
            }
            if (error.code) {
                console.error("Error Code:", error.code);
            }
            if (error.originalError && error.originalError.response) {
                 console.error("Response Data:", error.originalError.response.data);
            }
        }
    }
}

main();
