export class NfseNationalError extends Error {
    constructor(message, { status, data } = {}) {
        super(message);
        this.name = "NfseNationalError";
        this.status = status;
        this.data = data;
    }
}