import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8'
import HmacSHA256 from 'crypto-js/hmac-sha256'
import { stringify as base64stringify, parse as base64parse } from 'crypto-js/enc-base64';

export type IoTCCredentials = {

    deviceId: string,
    modelId: string,
    patientId: string,
    deviceKey: string,
    scopeId: string
}

export function DecryptCredentials(value: string, pass: string): IoTCCredentials {
    const decrypted = AES.decrypt(value, pass);
    const words = base64parse(decrypted.toString(Utf8));
    return JSON.parse(Utf8.stringify(words));
}

export function generateHubCredentials(assignedHub: string, registrationId: string, deviceKey: string) {
    const expiry = Math.floor(Date.now() / 1000) + 21600;
    const uri = encodeURIComponent(`${assignedHub}/devices/${registrationId}`);
    const sig = encodeURIComponent(computeKey(deviceKey, `${uri}\n${expiry}`));
    return {
        host: assignedHub,
        password: `SharedAccessSignature sr=${uri}&sig=${sig}&se=${expiry}`
    }
}

export function computeKey(key: string, data: string): string {
    return base64stringify(HmacSHA256(data, base64parse(key)));
}