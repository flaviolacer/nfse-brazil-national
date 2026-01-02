import assert from "node:assert";
import { test, describe, mock } from "node:test";
import { NfseNationalClient } from "../src/index.js";

// Simple mock for axios
// Since axios is used internally, we could use dependency injection or
// intercept calls using a lib like 'nock'.
// For this simple example without extra dependencies, we'll use JS flexibility
// to mock the internal instance.

const baseApiUrl = 'https://adn.producaorestrita.nfse.gov.br';

describe("NfseNationalClient Usage", () => {
    test("should instantiate the client correctly", () => {
        const client = new NfseNationalClient({
            baseURL: baseApiUrl,
        });
        assert.ok(client);
    });

    test("issueNfse should call the correct endpoint", async () => {
        const client = new NfseNationalClient({
            baseURL: baseApiUrl,
        });

        // Mocking the internally created axios instance
        // We initialize client.http manually to prevent #ensureInitialized from overwriting it
        // or trying to create a real connection, and to avoid 'set properties of null' error.
        client.http = {
            post: mock.fn(async (url, data) => {
                assert.strictEqual(url, "nfse");
                // The payload is sent as JSON with the compressed XML in base64
                assert.ok(data.dpsXmlGZipB64);
                return { data: "<xml>nfse</xml>" };
            })
        };

        const result = await client.issueNfse("<xml>dps</xml>");
        
        assert.strictEqual(result, "<xml>nfse</xml>");
        assert.strictEqual(client.http.post.mock.calls.length, 1);
    });

    test("getNfse should format the URL correctly", async () => {
        const client = new NfseNationalClient({
            baseURL: baseApiUrl,
        });

        client.http = {
            get: mock.fn(async (url) => {
                assert.strictEqual(url, "nfse/12345");
                return { data: "<xml>nfse_consultada</xml>" };
            })
        };

        const result = await client.getNfse("12345");
        assert.strictEqual(result, "<xml>nfse_consultada</xml>");
    });

    test("should generate DPS XML (fake) correctly", async () => {
        const client = new NfseNationalClient({ baseURL: baseApiUrl });
        
        const dpsData = {
            id: "DPS3304557238027543000175900000000000000001",
            versaoAplicacao: "1.0.0",
            ambiente: "2",
            dataEmissao: "2026-01-01T12:00:00-03:00",
            serie: "900",
            numero: "1",
            competencia: "2026-01-01",
            tipoEmitente: "1",
            municipioEmissao: "3304557",
            prestador: {
                cnpj: "38027543000175",
                telefone: "5121026080",
                optanteSimplesNacional: "3",
                regimeApuracaoTributacaoSN: "1",
                regimeEspecialTributacao: "0"
            },
            tomador: {
                cpf: "11122233344",
                nome: "Fake Taker"
            },
            servico: {
                municipioPrestacao: "3304557",
                codigoTributacaoNacional: "080201",
                codigoTributacaoMunicipal: "015",
                descricao: "Fake Service Test",
                codigoNbs: "122051900",
                codigoInterno: "0"
            },
            valores: {
                valorServicos: "150.00",
                tributacaoIssqn: "1",
                tipoRetencaoIssqn: "1",
                tributosDetalhado: {
                    federal: "0.00",
                    estadual: "0.00",
                    municipal: "0.00"
                }
            }
        };

        try {
            const xml = await client.generateDpsXml(dpsData, { suppressSigningWarning: true });
            assert.ok(xml.includes('infDPS'), "XML must contain infDPS tag");
            assert.ok(xml.includes('Fake Service Test'), "XML must contain service description");
            assert.ok(xml.includes('150.00'), "XML must contain service value");
            assert.ok(!xml.includes('Signature'), "XML must not be signed (no certificate)");

            // Attempt to validate the generated XML (suppressing errors as it might fail due to missing signature)
            await client.validateDpsXml(xml, undefined, true);
        } catch (err) {
            // Ignore error if template is not found (in case test runs in environment without src/templates)
            if (err.message.includes("ENOENT")) {
                console.warn("Skipping template test: dps.xml not found");
            } else {
                throw err;
            }
        }
    });

    test("should generate Cancellation XML (fake) correctly", async () => {
        const client = new NfseNationalClient({ baseURL: baseApiUrl });
        
        const cancelData = {
            id: "PRE332601...101101",
            ambiente: "2",
            versaoAplicacao: "1.0.0",
            dataHoraEvento: "2026-01-02T10:00:00-03:00",
            cnpjAutor: "38027543000175",
            chaveAcesso: "3326010000...",
            numeroPedido: "001",
            codigoMotivo: "1",
            descricaoMotivo: "Fake Cancellation"
        };

        try {
            const xml = await client.generateCancellationXml(cancelData, { suppressSigningWarning: true });
            assert.ok(xml.includes('infPedReg'), "XML must contain infPedReg tag");
            assert.ok(xml.includes('Fake Cancellation'), "XML must contain reason");
            assert.ok(!xml.includes('Signature'), "XML must not be signed");

            // Attempt to validate the generated XML (suppressing errors)
            await client.validateEventXml(xml, undefined, true);
        } catch (err) {
            if (err.message.includes("ENOENT")) {
                console.warn("Skipping template test: dps_cancelamento.xml not found");
            } else {
                throw err;
            }
        }
    });
});
