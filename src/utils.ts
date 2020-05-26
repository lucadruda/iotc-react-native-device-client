import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8'
import { parse as base64parse } from 'crypto-js/enc-base64';

export type IoTCCredentials = {

    deviceId: string,
    modelId: string,
    patientId: string,
    sasKey: string,
    scopeId: string
}

export function DecryptCredentials(value: string, pass: string): IoTCCredentials {
    const decrypted = AES.decrypt(value, pass);
    const words = base64parse(decrypted.toString(Utf8));
    return JSON.parse(Utf8.stringify(words));
}