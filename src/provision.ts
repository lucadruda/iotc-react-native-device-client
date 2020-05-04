import { IOTC_CONNECT } from "./types/constants";
//@ts-ignore
import CryptoJS from 'react-native-crypto-js'
import base64 from 'base-64';
import utf8 from 'utf8';
import { X509 } from "./types/interfaces";
import { v4 as uuidv4 } from 'uuid'

import { Client as MqttClient, Message } from 'react-native-paho-mqtt';

const REGISTRATIONTOPIC = '$dps/registrations/res';

// Set up an in-memory alternative to global localStorage
const myStorage: any = {
    setItem: (key: string, item: string) => {
        myStorage[key] = item;
    },
    getItem: (key: string) => myStorage[key],
    removeItem: (key: string) => {
        delete myStorage[key];
    },
};

export type HubCredentials = {
    host: string,
    password: string
}

export default class ProvisioningClient {

    private deviceKey: string = '';
    private certificate: X509 | null = null;

    private mqttClient: MqttClient;
    private mqttUser: string;
    private mqttPassword: string;
    private subscriptions: { [x: string]: (topic: string, message: string, resolve: any, reject: any) => void } = {};
    private requestId: string;

    static createKeyClient(endpoint: string, registrationId: string, scopeId: string, connType: IOTC_CONNECT, key: string) {
        if (connType != IOTC_CONNECT.SYMM_KEY && connType != IOTC_CONNECT.DEVICE_KEY) {
            throw new Error('Can\'t create a key client with a different credential method');
        }
        if (connType == IOTC_CONNECT.SYMM_KEY) {
            key = computeKey(key, registrationId);
        }
        return new ProvisioningClient(endpoint, registrationId, scopeId, key);
    }

    static createCertificateClient(endpoint: string, registrationId: string, scopeId: string, connType: IOTC_CONNECT, key: X509) {
        if (connType == IOTC_CONNECT.SYMM_KEY || connType == IOTC_CONNECT.DEVICE_KEY) {
            throw new Error('Can\'t create a certificate client with a different credential method');
        }
        return new ProvisioningClient(endpoint, registrationId, scopeId, key);
    }

    private constructor(private readonly endpoint: string, private readonly registrationId: string, private readonly scopeId: string, deviceKey: any) {
        if (typeof (deviceKey) === 'string') {
            this.deviceKey = deviceKey
        }
        else {
            this.certificate = deviceKey;
        }

        const clientId = registrationId;
        this.mqttUser = `${scopeId}/registrations/${registrationId}/api-version=2019-03-31`;
        const resourceUri = encodeURI(`${scopeId}/registrations/${registrationId}`);
        const expiry = Math.floor(Date.now() / 1000) + 21600; // 6 hours
        const signature = encodeURI(computeKey(this.deviceKey, `${resourceUri}\n${expiry}`));

        this.requestId = uuidv4();

        this.mqttPassword = `SharedAccessSignature sr=${resourceUri}&sig=${signature}&se=${expiry}&skn=registration`;
        this.mqttClient = new MqttClient({ uri: `mqtts://${this.endpoint}:8883`, clientId, storage: myStorage });
    }

    private async onRegistrationResult(topic: string, message: string, resolve: any, reject: any): Promise<void> {
        const match = topic.match(/\$dps\/registrations\/res\/(\d+)\/\?\$rid=([\w\d\-]+)&retry-after=(\d)/);
        if (match && match.length > 1) {
            const status = +match[1];
            const requestId = match[2];
            const retry = match[3];
            if (requestId === this.requestId) {
                switch (status) {
                    case 202:
                        // poll
                        const operationId = JSON.parse(message).operationId;
                        const msg = new Message('');
                        msg.destinationName = `$dps/registrations/GET/iotdps-get-operationstatus/?$rid=${requestId}&operationId=${operationId}`
                        await this.mqttClient.send(msg);
                        break;
                    case 200:
                        // get result
                        const res = JSON.parse(message);
                        await this.mqttClient.disconnect();
                        const expiry = Math.floor(Date.now() / 1000) + 21600;
                        const uri = encodeURI(`${res.registrationState.assignedHub}/devices/${this.registrationId}`);
                        const sig = computeKey(this.deviceKey, `${uri}\n${expiry}`);
                        resolve({
                            host: res.registrationState.assignedHub,
                            password: `SharedAccessSignature sr=${uri}&sig=${sig}&se=${expiry}`
                        });
                        break;
                    default:
                        reject(message);
                }
            }
        }

    }

    async register(modelId?: string): Promise<HubCredentials> {
        let payload: any = {
            registrationId: this.registrationId,

        };
        if (modelId) {
            payload['data'] = {
                iotcModelId: modelId
            }
        }
        return new Promise<HubCredentials>(async (resolve, reject) => {
            this.mqttClient.on('messageReceived', (message: Message) => {
                if (message.destinationName.startsWith(REGISTRATIONTOPIC)) {
                    this.subscriptions[REGISTRATIONTOPIC](message.destinationName, message.payloadString, resolve, reject);
                }
            });
            await this.mqttClient.connect({
                userName: this.mqttUser,
                password: this.mqttPassword
            });
            await this.mqttClient.subscribe(`${REGISTRATIONTOPIC}/#`);
            this.subscriptions[REGISTRATIONTOPIC] = this.onRegistrationResult;
            let msg = new Message(JSON.stringify(payload));
            msg.destinationName = `$dps/registrations/PUT/iotdps-register/?$rid=${this.requestId}`
            await this.mqttClient.send(msg);
        });

    }

}

function computeKey(key: string, data: string): string {
    const decodedKey = base64.decode(utf8.encode(key));
    return base64.encode(CryptoJS.HmacSHA256.encrypt(data, decodedKey));
}