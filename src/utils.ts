import AES from "crypto-js/aes";
import Utf8 from "crypto-js/enc-utf8";
import HmacSHA256 from "crypto-js/hmac-sha256";
import {
  stringify as base64stringify,
  parse as base64parse,
} from "crypto-js/enc-base64";
import { IoTCCredentials, HubCredentials } from "./types/interfaces";
import CancellationToken from "./cancellationToken";

export type RegistrationOptions = {
  encryptionKey?: string;
  cancellationToken?: CancellationToken;
};

export function DecryptCredentials(
  value: string,
  pass?: string
): IoTCCredentials {
  try {
    // try decrypting with password if encrypted and passed.
    const decrypted = pass ? AES.decrypt(value, pass) : value;
    const words = base64parse(decrypted.toString(Utf8));
    return JSON.parse(Utf8.stringify(words));
  } catch (e) {
    // try plain even if password is provided otherwise throw
    const words = base64parse(value);
    return JSON.parse(Utf8.stringify(words));
  }
}

export function parseConnectionString(
  connectionString: string
): HubCredentials & { deviceId: string } {
  const fields = connectionString.split(";");
  const cStringInfo = fields.reduce<{ [x: string]: string }>((data, field) => {
    const kv = field.split("=", 2);
    data[kv[0]] = kv[1];
    return data;
  }, {});
  return {
    ...generateHubCredentials(
      cStringInfo["HostName"],
      cStringInfo["DeviceId"],
      cStringInfo["SharedAccessKey"]
    ),
    deviceId: cStringInfo["DeviceId"],
  };
}

export function generateHubCredentials(
  assignedHub: string,
  registrationId: string,
  deviceKey: string
): HubCredentials {
  const expiry = Math.floor(Date.now() / 1000) + 21600;
  const uri = encodeURIComponent(`${assignedHub}/devices/${registrationId}`);
  const sig = encodeURIComponent(computeKey(deviceKey, `${uri}\n${expiry}`));
  return {
    host: assignedHub,
    password: `SharedAccessSignature sr=${uri}&sig=${sig}&se=${expiry}`,
  };
}

export function computeKey(key: string, data: string): string {
  return base64stringify(HmacSHA256(data, base64parse(key)));
}

export function CryptJsWordArrayToUint8Array(wordArray: any) {
  const l = wordArray.sigBytes;
  const words = wordArray.words;
  const result = new Uint8Array(l);
  var i = 0 /*dst*/,
    j = 0; /*src*/
  while (true) {
    // here i is a multiple of 4
    if (i == l) break;
    var w = words[j++];
    result[i++] = (w & 0xff000000) >>> 24;
    if (i == l) break;
    result[i++] = (w & 0x00ff0000) >>> 16;
    if (i == l) break;
    result[i++] = (w & 0x0000ff00) >>> 8;
    if (i == l) break;
    result[i++] = w & 0x000000ff;
  }
  return result;
}

export async function promiseTimeout<T>(
  fn: (...args: any[]) => Promise<T>,
  ms: number
): Promise<T> {
  let id: number;
  let timeout = new Promise<T>((resolve, reject) => {
    id = setTimeout(() => {
      reject("Timed out in " + ms + "ms.");
    }, ms);
  });

  return Promise.race([fn(), timeout])
    .then((result: T) => {
      clearTimeout(id);

      /**
       * ... we also need to pass the result back
       */
      return Promise.resolve(result);
    })
    .catch((err) => {
      clearTimeout(id);
      return Promise.reject(err);
    });
}
