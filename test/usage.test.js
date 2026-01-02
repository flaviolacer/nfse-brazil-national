import assert from "node:assert";
import { test, describe, mock } from "node:test";
import { NfseNationalClient } from "../src/index.js";

// Mock simples para o axios
// Como o axios é usado internamente, podemos usar uma técnica de injeção ou
// interceptar as chamadas se usarmos uma lib como 'nock'.
// Para este exemplo simples sem dependências extras, vamos estender a classe
// ou usar a flexibilidade do JS para mockar a instância interna.

const baseApiUrl = 'https://adn.producaorestrita.nfse.gov.br';

describe("NfseNationalClient Usage", () => {
    test("deve instanciar o cliente corretamente", () => {
        const client = new NfseNationalClient({
            baseURL: baseApiUrl,
        });
        assert.ok(client);
    });

    test("emitirNfse deve chamar o endpoint correto", async () => {
        const client = new NfseNationalClient({
            baseURL: baseApiUrl,
        });

        // Mockando a instância do axios criada internamente
        client.http.post = mock.fn(async (url, data) => {
            assert.strictEqual(url, "/nfse");
            assert.strictEqual(data, "<xml>dps</xml>");
            return { data: "<xml>nfse</xml>" };
        });

        const result = await client.emitirNfse("<xml>dps</xml>");
        
        assert.strictEqual(result, "<xml>nfse</xml>");
        assert.strictEqual(client.http.post.mock.callCount(), 1);
    });

    test("consultarNfse deve formatar a URL corretamente", async () => {
        const client = new NfseNationalClient({
            baseURL: baseApiUrl,
        });

        client.http.get = mock.fn(async (url) => {
            assert.strictEqual(url, "/nfse/12345");
            return { data: "<xml>nfse_consultada</xml>" };
        });

        const result = await client.consultarNfse("12345");
        assert.strictEqual(result, "<xml>nfse_consultada</xml>");
    });
});
