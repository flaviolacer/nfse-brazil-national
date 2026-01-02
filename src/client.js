import axios from "axios";
import fs from "fs/promises";
import path from "path";
import https from "https";
import zlib from "zlib";
import {fileURLToPath} from "url";
import Handlebars from "handlebars";
import {SignedXml} from "xml-crypto";
import {exec} from "child_process";
import {promisify} from "util";
import {tmpdir} from "os";
import forge from "node-forge";
import {NfseNationalError} from "./errors.js";

const execAsync = promisify(exec);
const gzipAsync = promisify(zlib.gzip);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class NfseNationalClient {
    constructor({ baseURL, certificate, password, axiosConfig } = {}) {
        if (!baseURL) {
            throw new Error("baseURL is required");
        }

        this.baseURL = baseURL;
        this.certificateSource = certificate;
        this.password = password;
        this.axiosConfig = axiosConfig || {};

        this.http = null;
        this.certData = null;
        this.pemKey = null;
        this.pemCert = null;
    }

    async generateDpsXml(dpsData, options = {}) {
        return this.#generateXml("dps.xml", dpsData, "//*[local-name(.)='infDPS']", dpsData.id, options);
    }

    async validateDpsXml(xmlString, xsdFilename = "DPS_v1.00.xsd", suppressErrors = false) {
        return this.#validateXml(xmlString, xsdFilename, "dps", suppressErrors);
    }

    async validateEventXml(xmlString, xsdFilename = "pedRegEvento_v1.00.xsd", suppressErrors = false) {
        return this.#validateXml(xmlString, xsdFilename, "evento", suppressErrors);
    }

    async issueNfse(dpsData) {
        const xmlPayload = typeof dpsData === "object" ? await this.generateDpsXml(dpsData) : dpsData;
        return this.#sendCompressedXml("nfse", xmlPayload, "dpsXmlGZipB64", "Failed to issue NFS-e");
    }

    async getNfse(chaveAcesso) {
        await this.#ensureInitialized();
        if (!chaveAcesso) {
            throw new Error("chaveAcesso is required");
        }
        try {
            const url = `nfse/${encodeURIComponent(chaveAcesso)}`;
            const response = await this.http.get(url);
            return response.data;
        } catch (err) {
            throw this.#toNfseError(err, "Failed to query NFS-e");
        }
    }

    async getDps(idDps) {
        await this.#ensureInitialized();
        if (!idDps) {
            throw new Error("idDps is required");
        }
        try {
            const url = `dps/${encodeURIComponent(idDps)}`;
            const response = await this.http.get(url);
            return response.data;
        } catch (err) {
            throw this.#toNfseError(err, "Failed to query DPS");
        }
    }

    async checkDps(idDps) {
        await this.#ensureInitialized();
        if (!idDps) {
            throw new Error("idDps is required");
        }
        try {
            const url = `dps/${encodeURIComponent(idDps)}`;
            const response = await this.http.head(url);
            return {
                status: response.status,
                headers: response.headers,
            };
        } catch (err) {
            throw this.#toNfseError(err, "Failed to check DPS");
        }
    }

    async generateCancellationXml(cancelamentoData, options = {}) {
        return this.#generateXml("dps_cancelamento.xml", cancelamentoData, "//*[local-name(.)='infPedReg']", cancelamentoData.id, options);
    }

    async cancelNfse(cancelamentoData, chaveAcesso) {
        let xmlPayload;
        let chave;

        if (typeof cancelamentoData === "string") {
            xmlPayload = cancelamentoData;
            chave = chaveAcesso;
        } else {
            if (!cancelamentoData.chaveAcesso) throw new Error("chaveAcesso is required for cancellation");
            chave = cancelamentoData.chaveAcesso;
            xmlPayload = await this.generateCancellationXml(cancelamentoData);
        }

        if (!chave) throw new Error("chaveAcesso is required for cancellation");

        const url = `nfse/${encodeURIComponent(chave)}/eventos`;
        return this.#sendCompressedXml(url, xmlPayload, "pedidoRegistroEventoXmlGZipB64", "Failed to cancel NFS-e");
    }

    // --- Static Helper Methods ---

    /**
     * Gera o ID do DPS conforme padrão nacional.
     * Formato: DPS + CodMun(7) + TpInsc(1) + InscFed(14) + Serie(5) + Num(15)
     */
    static generateDpsId(municipioEmitente, tipoInscricaoFederal, inscricaoFederal, serie, numero) {
        const seriePad = serie.toString().padStart(5, '0');
        const numeroPad = numero.toString().padStart(15, '0');
        // Remove caracteres não numéricos da inscrição federal (CNPJ/CPF)
        const inscricaoLimpa = inscricaoFederal.replace(/\D/g, '');
        
        return `DPS${municipioEmitente}${tipoInscricaoFederal}${inscricaoLimpa}${seriePad}${numeroPad}`;
    }

    /**
     * Gera o ID do Pedido de Registro de Evento (ex: Cancelamento).
     * Formato: PRE + ChaveAcesso(50) + CodEvento(6)
     * Padrão para cancelamento: 101101
     */
    static generateEventId(chaveAcesso, codigoEvento = "101101") {
        // O ID deve ter exatamente 59 caracteres: PRE(3) + Chave(50) + Tipo(6)
        return `PRE${chaveAcesso}${codigoEvento}`;
    }

    /**
     * Gera a data/hora no formato exigido pelo XSD (UTC ou com Offset).
     * Ex: 2026-01-02T14:30:00-03:00
     */
    static generateDateTime(date = new Date()) {
        const pad = (n) => n.toString().padStart(2, '0');
        
        const ano = date.getFullYear();
        const mes = pad(date.getMonth() + 1);
        const dia = pad(date.getDate());
        const hora = pad(date.getHours());
        const min = pad(date.getMinutes());
        const seg = pad(date.getSeconds());
        
        // Obtém o offset do fuso horário em horas (ex: 180 min -> -03:00)
        const offset = -date.getTimezoneOffset();
        const sign = offset >= 0 ? '+' : '-';
        const padOffset = (n) => Math.abs(Math.floor(n / 60)).toString().padStart(2, '0');
        
        return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}${sign}${padOffset(offset)}:00`;
    }

    // --- Private Methods ---

    async #ensureInitialized() {
        if (this.http) return;

        await this.#loadCertificate();
        await this.#parseCertificate();

        let httpsAgent = this.axiosConfig.httpsAgent;

        if (!httpsAgent && this.pemKey && this.pemCert) {
            httpsAgent = new https.Agent({
                cert: this.pemCert,
                key: this.pemKey,
                // passphrase not needed as we extracted unencrypted PEM
            });
        }

        this.http = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            httpsAgent,
            ...this.axiosConfig,
        });
    }

    async #loadCertificate() {
        if (this.certData) return;
        if (!this.certificateSource) return;

        if (Buffer.isBuffer(this.certificateSource)) {
            this.certData = this.certificateSource;
        } else if (typeof this.certificateSource === 'string') {
            if (this.certificateSource.includes('-----BEGIN')) {
                this.certData = Buffer.from(this.certificateSource);
            } else {
                try {
                    this.certData = await fs.readFile(this.certificateSource);
                } catch (err) {
                    if (err.code === 'ENOENT') {
                        throw new Error(`Certificate not found at path: ${this.certificateSource}`);
                    }
                    throw err;
                }
            }
        }
    }

    async #parseCertificate() {
        if (!this.certData) return;
        if (this.pemKey && this.pemCert) return;

        const certStr = this.certData.toString('utf8');
        
        // Check if already PEM
        if (certStr.includes('-----BEGIN CERTIFICATE') && certStr.includes('PRIVATE KEY')) {
             this.pemCert = certStr;
             this.pemKey = certStr;
             return;
        }

        // Try PFX with node-forge
        try {
            const p12Der = forge.util.createBuffer(this.certData.toString('binary'));
            const p12Asn1 = forge.asn1.fromDer(p12Der);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, this.password);

            // Extract Key
            let keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
            if (!keyBag) {
                keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
            }
            if (keyBag?.key) {
                this.pemKey = forge.pki.privateKeyToPem(keyBag.key);
            }

            // Extract Cert
            const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
            if (certBag?.cert) {
                this.pemCert = forge.pki.certificateToPem(certBag.cert);
            }
        } catch (err) {
            console.warn("Failed to process certificate (PFX/PEM):", err.message);
        }
    }

    async #generateXml(templateName, data, signReference, signId, options = {}) {
        await this.#ensureInitialized();
        
        if (!data) throw new Error("Data for XML generation is required");

        try {
            const templatePath = path.join(__dirname, "templates", templateName);
            const templateContent = await fs.readFile(templatePath, "utf-8");
            const template = Handlebars.compile(templateContent);
            const xmlRaw = this.#minifyXml(template(data));

            if (this.pemKey && this.pemCert) {
                return this.#signXml(xmlRaw, signReference, signId);
            } else {
                if (!options.suppressSigningWarning) {
                    console.warn("Warning: XML not signed (certificate not available).");
                }
                return xmlRaw;
            }
        } catch (err) {
            throw new Error(`Failed to process/sign template: ${err.message}`);
        }
    }

    async #validateXml(xmlString, xsdFilename, tempPrefix, suppressErrors = false) {
        const xsdPath = path.join(__dirname, "templates", "xsd", xsdFilename);
        const tempXmlPath = path.join(tmpdir(), `${tempPrefix}-${Date.now()}-${Math.random().toString(36).substring(7)}.xml`);

        try {
            await fs.writeFile(tempXmlPath, xmlString, 'utf8');
            
            // Executa xmllint (nativo no macOS/Linux)
            const cmd = `xmllint --noout --schema "${xsdPath}" "${tempXmlPath}"`;
            
            await execAsync(cmd);
            return true;
        } catch (error) {
            if (suppressErrors) return false;
            const validationErrors = error.stderr || error.message;
            throw new Error(`XSD validation errors (${xsdFilename}):\n${validationErrors}`);
        } finally {
            try {
                await fs.unlink(tempXmlPath);
            } catch (e) { /* ignore */ }
        }
    }

    #signXml(xml, reference, elementId) {
        const sig = new SignedXml({
            privateKey: this.pemKey,
            // Manual 6.1.4: Must use RSA-SHA1
            signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
            canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
        });

        const referenceOptions = {
            xpath: reference,
            transforms: [
                "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
                "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
            ],
            // Manual 6.1.4: Must use SHA1
            digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1"
        };

        if (elementId) {
            referenceOptions.uri = `#${elementId}`;
        }

        sig.addReference(referenceOptions);

        const certB64 = this.#getCertificateBase64(this.pemCert);

        if (certB64) {
            sig.getKeyInfoContent = function({ prefix }) {
                const p = prefix ? `${prefix}:` : "";
                return (
                    `<${p}X509Data><${p}X509Certificate>` +
                    certB64 +
                    `</${p}X509Certificate></${p}X509Data>`
                );
            };
        }

        sig.computeSignature(xml, {
            attrs: {
                xmlns: "http://www.w3.org/2000/09/xmldsig#"
            }
        });

        let signedXml = sig.getSignedXml();

        if (!signedXml.trim().startsWith("<?xml")) {
            signedXml = '<?xml version="1.0" encoding="UTF-8"?>' + signedXml;
        }

        return signedXml;
    }

    async #sendCompressedXml(endpoint, xmlPayload, jsonKey, errorMessage) {
        await this.#ensureInitialized();
        try {
            const compressedBuffer = await gzipAsync(Buffer.from(xmlPayload, 'utf-8'));
            const base64Payload = compressedBuffer.toString('base64');
            const jsonBody = { [jsonKey]: base64Payload };
            const response = await this.http.post(endpoint, jsonBody);
            return response.data;
        } catch (err) {
            throw this.#toNfseError(err, errorMessage);
        }
    }

    #minifyXml(xml) {
        // Removes line breaks and spaces between tags
        return xml.replace(/>\s+</g, '><').trim();
    }

    #getCertificateBase64(pemStr) {
        if (!pemStr || typeof pemStr !== "string") return null;
        const match = pemStr.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
        if (!match) return null;
        return match[1].replace(/\s+/g, "");
    }

    #toNfseError(err, message) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        
        const errorMessage = status 
            ? `${message} (HTTP ${status})` 
            : `${message}: ${err.message}`;

        return new NfseNationalError(errorMessage, { status, data, originalError: err });
    }
}
