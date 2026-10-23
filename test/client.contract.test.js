import assert from "node:assert/strict";
import {gunzip} from "node:zlib";
import {promisify} from "node:util";
import {describe, test} from "node:test";
import forge from "node-forge";
import {DOMParser} from "@xmldom/xmldom";
import {SignedXml} from "xml-crypto";
import {
    NfseNationalClient,
    NfseNationalError,
    NFSE_BASE_URLS,
    NFSE_LAYOUT_PROFILES
} from "../src/index.js";

const gunzipAsync = promisify(gunzip);
const baseURL = "https://nfse.example.test/SefinNacional";

const buildDpsData = (overrides = {}) => ({
    id: "DPS330455720000000000019100900000000000000001",
    versaoAplicacao: "1.1.0",
    ambiente: "2",
    dataEmissao: "2026-10-23T10:00:00-03:00",
    serie: "900",
    numero: "1",
    competencia: "2026-10-23",
    tipoEmitente: "1",
    municipioEmissao: "3304557",
    prestador: {
        cnpj: "00000000000191",
        telefone: "21999999999",
        optanteSimplesNacional: "3",
        regimeApuracaoTributacaoSN: "1",
        regimeEspecialTributacao: "0"
    },
    tomador: {
        cpf: "11122233344",
        nome: "Cliente de Teste",
        email: "cliente@example.test"
    },
    servico: {
        municipioPrestacao: "3304557",
        codigoTributacaoNacional: "080201",
        codigoTributacaoMunicipal: "015",
        descricao: "Treinamento online",
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
    },
    ...overrides
});

const buildCancellationData = () => ({
    id: "PRE33260100000000000000000000000000000000000000000101101",
    ambiente: "2",
    versaoAplicacao: "1.1.0",
    dataHoraEvento: "2026-10-23T10:30:00-03:00",
    cnpjAutor: "00000000000191",
    chaveAcesso: "33260100000000000000000000000000000000000000000001",
    codigoMotivo: "1",
    descricaoMotivo: "Cancelamento de teste"
});

const createTestCertificate = () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = "01";
    certificate.validity.notBefore = new Date("2020-01-01T00:00:00Z");
    certificate.validity.notAfter = new Date("2035-01-01T00:00:00Z");
    const attributes = [{name: "commonName", value: "nfse-brazil-national test"}];
    certificate.setSubject(attributes);
    certificate.setIssuer(attributes);
    certificate.setExtensions([{name: "basicConstraints", cA: true}]);
    certificate.sign(keys.privateKey, forge.md.sha256.create());

    const password = "unit-test-password";
    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], password, {
        algorithm: "3des"
    });

    return {
        password,
        pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"),
        certificatePem: forge.pki.certificateToPem(certificate)
    };
};

const buildNfseXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<NFSe>
  <infNFSe Id="NFS123">
    <nNFSe>123</nNFSe>
    <dhProc>2026-10-23T10:05:00-03:00</dhProc>
    <xLocPrestacao>Rio de Janeiro</xLocPrestacao>
    <emit><xNome>Prestador Teste</xNome><CNPJ>00000000000191</CNPJ></emit>
    <valores><vLiq>150.00</vLiq></valores>
  </infNFSe>
  <DPS><infDPS><dCompet>2026-10-23</dCompet><nDPS>1</nDPS><serie>900</serie>
    <dhEmi>2026-10-23T10:00:00-03:00</dhEmi>
    <toma><xNome>Cliente Teste</xNome><CPF>11122233344</CPF></toma>
    <serv><cServ><xDescServ>Treinamento online</xDescServ><cNBS>122051900</cNBS></cServ></serv>
    <valores><vServPrest><vServ>150.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun></trib></valores>
  </infDPS></DPS>
</NFSe>`;

describe("NfseNationalClient contract", () => {
    test("requires a base URL", () => {
        assert.throws(() => new NfseNationalClient(), /baseURL is required/);
    });

    test("exports the official Sefin Nacional base URLs and layout profiles", () => {
        assert.equal(NFSE_BASE_URLS.production, "https://sefin.nfse.gov.br/SefinNacional");
        assert.equal(
            NFSE_BASE_URLS.restricted,
            "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional"
        );
        assert.equal(NFSE_LAYOUT_PROFILES.production.xsdDirectory, "1.01");
        assert.equal(
            NFSE_LAYOUT_PROFILES["restricted-2026-10-20"].xsdDirectory,
            "restricted-2026-10-20"
        );
        assert.throws(
            () => new NfseNationalClient({baseURL, layoutProfile: "unknown"}),
            /Unknown layoutProfile/
        );
        assert.throws(
            () => new NfseNationalClient({
                baseURL,
                layoutProfile: "restricted-2026-10-20",
                xsdVersion: "1.00"
            }),
            /requires XSD 1\.01/
        );
    });

    test("generates stable DPS and event identifiers", () => {
        assert.equal(
            NfseNationalClient.generateDpsId("3304557", "2", "00.000.000/0001-91", "900", "42"),
            "DPS330455720000000000019100900000000000000042"
        );
        assert.equal(
            NfseNationalClient.generateEventId("A".repeat(50)),
            `PRE${"A".repeat(50)}101101`
        );
        assert.equal(
            NfseNationalClient.generateDpsId("3304557", "1", "111.222.333-44", "900", "42"),
            "DPS330455710001112223334400900000000000000042"
        );
        assert.equal(
            NfseNationalClient.generateDpsId("3304557", "2", "12.ABC.345/01DE-35", "900", "42"),
            "DPS3304557212ABC34501DE3500900000000000000042"
        );
    });

    test("keeps the production layout as the default profile", async () => {
        const client = new NfseNationalClient({baseURL});
        const xml = await client.generateDpsXml(buildDpsData(), {suppressSigningWarning: true});

        assert.match(xml, /<DPS[^>]+versao="1\.00"/);
        assert.doesNotMatch(xml, /<finNFSe>/);
        assert.equal(await client.validateDpsXml(xml), true);
    });

    test("generates a DPS valid for the restricted 2026-10-20 layout", async () => {
        const client = new NfseNationalClient({
            baseURL: NFSE_BASE_URLS.restricted,
            layoutProfile: "restricted-2026-10-20"
        });
        const data = buildDpsData({
            id: NfseNationalClient.generateDpsId("3304557", "2", "00000000000191", "900", "1")
        });
        const xml = await client.generateDpsXml(data, {suppressSigningWarning: true});

        assert.match(xml, /<DPS[^>]+versao="1\.01"/);
        assert.match(xml, /<tpEmit>1<\/tpEmit><finNFSe>0<\/finNFSe><cLocEmi>/);
        assert.ok(xml.indexOf("<cNBS>") < xml.indexOf("<xDescServ>"));
        assert.equal(await client.validateDpsXml(xml), true);
    });

    test("validates an alphanumeric CNPJ in the restricted layout", async () => {
        const client = new NfseNationalClient({
            baseURL: NFSE_BASE_URLS.restricted,
            layoutProfile: "restricted-2026-10-20"
        });
        const cnpj = "12ABC34501DE35";
        const base = buildDpsData();
        const data = buildDpsData({
            id: NfseNationalClient.generateDpsId("3304557", "2", cnpj, "900", "1"),
            prestador: {...base.prestador, cnpj}
        });
        const xml = await client.generateDpsXml(data, {suppressSigningWarning: true});

        assert.match(xml, /<CNPJ>12ABC34501DE35<\/CNPJ>/);
        assert.equal(await client.validateDpsXml(xml), true);
    });

    test("uses a single location choice for services outside Brazil", async () => {
        const client = new NfseNationalClient({baseURL});
        const base = buildDpsData();
        const data = buildDpsData({
            servico: {...base.servico, paisPrestacao: "US"}
        });
        const xml = await client.generateDpsXml(data, {suppressSigningWarning: true});

        assert.match(xml, /<locPrest><cPaisPrestacao>US<\/cPaisPrestacao><\/locPrest>/);
        assert.doesNotMatch(xml, /<cLocPrestacao>/);
        assert.equal(await client.validateDpsXml(xml), true);
    });

    test("maps legacy deduction data to vAjusteBC in the restricted layout", async () => {
        const client = new NfseNationalClient({
            baseURL: NFSE_BASE_URLS.restricted,
            layoutProfile: "restricted-2026-10-20"
        });
        const base = buildDpsData();
        const data = buildDpsData({
            id: NfseNationalClient.generateDpsId("3304557", "2", "00000000000191", "900", "1"),
            valores: {
                ...base.valores,
                deducaoReducao: {valor: "10.00"}
            }
        });
        const xml = await client.generateDpsXml(data, {suppressSigningWarning: true});

        assert.match(xml, /<vAjusteBC><vAjusteBCISSQN>10\.00<\/vAjusteBCISSQN><\/vAjusteBC>/);
        assert.doesNotMatch(xml, /<vDedRed>/);
        assert.equal(await client.validateDpsXml(xml), true);
    });

    test("formats dates with the host timezone offset", () => {
        const date = new Date(2026, 9, 23, 10, 20, 30);
        const offset = -date.getTimezoneOffset();
        const sign = offset >= 0 ? "+" : "-";
        const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");

        assert.equal(
            NfseNationalClient.generateDateTime(date),
            `2026-10-23T10:20:30${sign}${hours}:00`
        );
    });

    test("escapes XML-sensitive customer and service values", async () => {
        const client = new NfseNationalClient({baseURL});
        const data = buildDpsData({
            tomador: {...buildDpsData().tomador, nome: "Cliente & Filhos <Teste>"},
            servico: {...buildDpsData().servico, descricao: "Curso & consultoria <online>"}
        });

        const xml = await client.generateDpsXml(data, {suppressSigningWarning: true});

        assert.match(xml, /Cliente &amp; Filhos &lt;Teste&gt;/);
        assert.match(xml, /Curso &amp; consultoria &lt;online&gt;/);
        assert.doesNotMatch(xml, /Cliente & Filhos/);
    });

    test("loads a PKCS#12 certificate and creates a verifiable XML signature", async () => {
        const fixture = createTestCertificate();
        const client = new NfseNationalClient({
            baseURL,
            certificate: fixture.pfx,
            password: fixture.password
        });

        const xml = await client.generateDpsXml(buildDpsData());
        const document = new DOMParser().parseFromString(xml, "text/xml");
        const signature = document.getElementsByTagName("Signature")[0];

        assert.ok(signature, "the generated XML must contain an XMLDSIG signature");
        assert.match(xml, /<X509Certificate>[^<]+<\/X509Certificate>/);

        const verifier = new SignedXml({publicCert: fixture.certificatePem});
        verifier.loadSignature(signature);
        assert.equal(verifier.checkSignature(xml), true);
    });

    test("compresses raw DPS XML before posting it", async () => {
        const client = new NfseNationalClient({baseURL});
        const sourceXml = "<DPS><infDPS Id=\"DPS1\"/></DPS>";
        let request;
        client.http = {
            post: async (url, body) => {
                request = {url, body};
                return {data: {chaveAcesso: "NFS1"}};
            }
        };

        const result = await client.issueNfse(sourceXml);
        const postedXml = await gunzipAsync(Buffer.from(request.body.dpsXmlGZipB64, "base64"));

        assert.deepEqual(result, {chaveAcesso: "NFS1"});
        assert.equal(request.url, "nfse");
        assert.equal(postedXml.toString("utf8"), sourceXml);
    });

    test("generates and sends DPS XML when issueNfse receives structured data", async (context) => {
        context.mock.method(console, "warn", () => {});
        const client = new NfseNationalClient({baseURL});
        let request;
        client.http = {
            post: async (url, body) => {
                request = {url, body};
                return {data: {chaveAcesso: "NFS2"}};
            }
        };

        const result = await client.issueNfse(buildDpsData());
        const postedXml = await gunzipAsync(Buffer.from(request.body.dpsXmlGZipB64, "base64"));

        assert.deepEqual(result, {chaveAcesso: "NFS2"});
        assert.equal(request.url, "nfse");
        assert.match(postedXml.toString("utf8"), /<infDPS Id="DPS3304557/);
        assert.match(postedXml.toString("utf8"), /<xDescServ>Treinamento online<\/xDescServ>/);
    });

    test("queries NFS-e and DPS resources using encoded identifiers", async () => {
        const client = new NfseNationalClient({baseURL});
        const calls = [];
        client.http = {
            get: async (url) => {
                calls.push(["get", url]);
                return {data: {url}};
            },
            head: async (url) => {
                calls.push(["head", url]);
                return {status: 204, headers: {etag: "test"}};
            }
        };

        assert.deepEqual(await client.getNfse("NFS/1"), {url: "nfse/NFS%2F1"});
        assert.deepEqual(await client.getDps("DPS/1"), {url: "dps/DPS%2F1"});
        assert.deepEqual(await client.checkDps("DPS/1"), {status: 204, headers: {etag: "test"}});
        assert.deepEqual(calls, [
            ["get", "nfse/NFS%2F1"],
            ["get", "dps/DPS%2F1"],
            ["head", "dps/DPS%2F1"]
        ]);
    });

    test("queries NFS-e events using the official resource variants", async () => {
        const client = new NfseNationalClient({baseURL});
        const calls = [];
        client.http = {
            get: async (url) => {
                calls.push(url);
                return {data: {url}};
            }
        };

        assert.deepEqual(await client.getEvents("NFS/1"), {url: "nfse/NFS%2F1/eventos"});
        assert.deepEqual(
            await client.getEventsByType("NFS/1", "101101"),
            {url: "nfse/NFS%2F1/eventos/101101"}
        );
        assert.deepEqual(
            await client.getEvent("NFS/1", "101101", "001"),
            {url: "nfse/NFS%2F1/eventos/101101/001"}
        );
        assert.deepEqual(calls, [
            "nfse/NFS%2F1/eventos",
            "nfse/NFS%2F1/eventos/101101",
            "nfse/NFS%2F1/eventos/101101/001"
        ]);
    });

    test("compresses cancellation XML and posts it to the encoded invoice resource", async () => {
        const client = new NfseNationalClient({baseURL});
        const sourceXml = "<pedRegEvento><infPedReg Id=\"PRE1\"/></pedRegEvento>";
        let request;
        client.http = {
            post: async (url, body) => {
                request = {url, body};
                return {data: {evento: "cancelado"}};
            }
        };

        const result = await client.cancelNfse(sourceXml, "NFS/1");
        const postedXml = await gunzipAsync(Buffer.from(request.body.pedidoRegistroEventoXmlGZipB64, "base64"));

        assert.deepEqual(result, {evento: "cancelado"});
        assert.equal(request.url, "nfse/NFS%2F1/eventos");
        assert.equal(postedXml.toString("utf8"), sourceXml);
    });

    test("generates and sends cancellation XML from structured data", async (context) => {
        context.mock.method(console, "warn", () => {});
        const client = new NfseNationalClient({baseURL});
        const data = buildCancellationData();
        let request;
        client.http = {
            post: async (url, body) => {
                request = {url, body};
                return {data: {evento: "registrado"}};
            }
        };

        const result = await client.cancelNfse(data);
        const postedXml = await gunzipAsync(Buffer.from(request.body.pedidoRegistroEventoXmlGZipB64, "base64"));

        assert.deepEqual(result, {evento: "registrado"});
        assert.equal(request.url, `nfse/${data.chaveAcesso}/eventos`);
        assert.match(postedXml.toString("utf8"), /<xMotivo>Cancelamento de teste<\/xMotivo>/);
    });

    test("generates cancellation XML from structured data", async () => {
        const client = new NfseNationalClient({baseURL});
        const data = buildCancellationData();
        const xml = await client.generateCancellationXml(data, {suppressSigningWarning: true});

        assert.match(xml, new RegExp(`<infPedReg Id="${data.id}">`));
        assert.match(xml, new RegExp(`<chNFSe>${data.chaveAcesso}</chNFSe>`));
        assert.match(xml, /<xMotivo>Cancelamento de teste<\/xMotivo>/);
    });

    test("maps HTTP failures to NfseNationalError", async () => {
        const client = new NfseNationalClient({baseURL});
        client.http = {
            get: async () => {
                throw {response: {status: 404, data: {codigo: "nao_encontrada"}}};
            }
        };

        await assert.rejects(
            client.getNfse("missing"),
            (error) => {
                assert.ok(error instanceof NfseNationalError);
                assert.equal(error.status, 404);
                assert.deepEqual(error.data, {codigo: "nao_encontrada"});
                assert.match(error.message, /HTTP 404/);
                return true;
            }
        );
    });

    test("validates required identifiers before making requests", async () => {
        const client = new NfseNationalClient({baseURL});

        await assert.rejects(client.getNfse(), /chaveAcesso is required/);
        await assert.rejects(client.getDps(), /idDps is required/);
        await assert.rejects(client.checkDps(), /idDps is required/);
        await assert.rejects(client.cancelNfse("<xml/>", ""), /chaveAcesso is required/);
        await assert.rejects(client.getEvents(), /chaveAcesso is required/);
        await assert.rejects(client.getEventsByType("NFS1"), /tipoEvento is required/);
        await assert.rejects(client.getEvent("NFS1", "101101"), /numSeqEvento is required/);
    });

    test("returns false or throws for XML that violates the XSD", async () => {
        const client = new NfseNationalClient({baseURL});

        assert.equal(await client.validateDpsXml("<DPS/>", true), false);
        await assert.rejects(client.validateDpsXml("<DPS/>"), /XSD validation errors/);
    });

    test("generates a PDF buffer and a gzip-base64 PDF", async () => {
        const client = new NfseNationalClient({baseURL});
        const xml = buildNfseXml();

        const pdf = await client.generateNfsePdf(xml);
        const zippedBase64 = await client.generateNfsePdf(xml, {gZipB64: true});
        const unzippedPdf = await gunzipAsync(Buffer.from(zippedBase64, "base64"));

        assert.ok(Buffer.isBuffer(pdf));
        assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
        assert.equal(unzippedPdf.subarray(0, 5).toString("ascii"), "%PDF-");
    });
});
