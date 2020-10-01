// Copyright (c) Luca Druda. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { IIoTCClient, X509, IIoTCLogger, Result, IIoTCProperty, IIoTCCommand, IIoTCCommandResponse, PropertyCallback, CommandCallback, FileRequestMetadata, FileResponseMetadata, FileUploadResult } from "./types/interfaces";
import { IOTC_CONNECT, DPS_DEFAULT_ENDPOINT, IOTC_EVENTS, IOTC_CONNECTION_OK, IOTC_CONNECTION_ERROR, IOTC_LOGGING, DeviceTransport, CancellationException } from "./types/constants";
import { ConsoleLogger } from "./consoleLogger";
import ProvisioningClient, { HubCredentials } from "./provision";
import { Client as MqttClient, Message } from 'react-native-paho-mqtt';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid'
import { parse as base64parse } from 'crypto-js/enc-base64';
import CryptoJS from "crypto-js";
import { CryptJsWordArrayToUint8Array, promiseTimeout } from "./utils";
import CancellationToken from "./cancellationToken";


const myStorage: any = {
    setItem: (key: string, item: string) => {
        myStorage[key] = item;
    },
    getItem: (key: string) => myStorage[key],
    removeItem: (key: string) => {
        delete myStorage[key];
    },
};

const TOPIC_TWIN = '$iothub/twin/res';
const TOPIC_PROPERTIES = '$iothub/twin/PATCH/properties/desired'
const TOPIC_COMMANDS = '$iothub/methods/POST';
const HTTPS_API_VERSION = '2018-06-30';

export default class IoTCClient implements IIoTCClient {
    isConnected(): boolean {
        return this.connected;
    }


    private events: {
        [s in IOTC_EVENTS]?: {
            callback: PropertyCallback | CommandCallback,
            filter?: string
        }
    }
    private endpoint: string = DPS_DEFAULT_ENDPOINT;
    private credentials: HubCredentials | undefined;
    private deviceProvisioning: ProvisioningClient;
    private connected: boolean = false;
    private logger: IIoTCLogger;
    private modelId: string | undefined;
    private mqttClient: MqttClient | undefined;
    private twin: any;

    private retry: number;
    private receivedDisconnession: boolean;

    constructor(readonly id: string, readonly scopeId: string, readonly authenticationType: IOTC_CONNECT | string, readonly options: X509 | string, logger?: IIoTCLogger) {
        if (typeof (authenticationType) == 'string') {
            this.authenticationType = IOTC_CONNECT[authenticationType.toUpperCase() as keyof typeof IOTC_CONNECT];
        }
        if (logger) {
            this.logger = logger;
        }
        else {
            this.logger = new ConsoleLogger();
        }
        this.deviceProvisioning = ProvisioningClient.createKeyClient(this.endpoint, id, scopeId, authenticationType as IOTC_CONNECT, options as string);
        this.events = {};
        this.retry = 0;
        this.receivedDisconnession = false;
    }

    setGlobalEndpoint(endpoint: string): void {
        this.endpoint = endpoint;
        this.logger.log(`Endpoint set to ${endpoint}.`);
    }

    setModelId(modelId: string): void {
        this.modelId = modelId;
    }

    async sendTelemetry(payload: any, properties?: any): Promise<void> {
        if (!this.mqttClient || !this.isConnected()) {
            throw new Error('Device not connected');
        }
        let topic = `devices/${this.id}/messages/events/`;
        if (properties) {
            Object.keys(properties).forEach((prop, index) => {
                topic = `${topic}${encodeURIComponent(prop)}=${encodeURIComponent(properties[prop])}`
                if (index < (properties.length - 1)) {
                    topic = `${topic}&`
                }
            });
        }
        let msg = new Message(JSON.stringify(payload));
        msg.destinationName = topic;
        return this.mqttClient.send(msg);

    }

    async sendProperty(property: any): Promise<void> {
        if (!this.mqttClient || !this.isConnected()) {
            throw new Error('Device not connected');
        }
        let msg = new Message(JSON.stringify(property));
        msg.destinationName = `$iothub/twin/PATCH/properties/reported/?$rid=${uuidv4()}`;
        return this.mqttClient.send(msg);
    }

    async disconnect(): Promise<void> {
        // immediately flag disconnession, 'onconnectionlost' callbacks won't fire and reconnection won't happen
        this.receivedDisconnession = true;

        await this.logger.log(`Disconnecting client...`);
        await this.mqttClient?.disconnect();
        delete this.mqttClient;
        this.mqttClient = undefined;
        this.connected = false;
    }

    async connect(opts: { cleanSession?: boolean, timeout?: number, cancellationToken?: CancellationToken }): Promise<any> {
        const config = { ...{ cleanSession: false, timeout: 30 }, ...opts };
        await this.logger.log(`Connecting client...`);
        config.cancellationToken?.throwIfCancelled('Start connection');

        this.credentials = await promiseTimeout(this.deviceProvisioning.register.bind(this.deviceProvisioning, this.modelId), config.timeout * 1000);
        config.cancellationToken?.throwIfCancelled('Provisioning');

        await this.logger.debug(`Got credentials from DPS\n${JSON.stringify(this.credentials)}`);
        this.mqttClient = new MqttClient({
            uri: `wss://${this.credentials.host}:443/$iothub/websocket`,
            clientId: this.id,
            storage: myStorage,
            webSocket: WebSocket,
        });
        config.cancellationToken?.throwIfCancelled('Hub client init');
        this.mqttClient.on('connectionLost', async (responseObject) => {
            if (this.receivedDisconnession) { // if disconnect was called from outside, don't try reconnection
                return;
            }
            this.connected = false;
            if (responseObject.errorCode !== 0) {
                await this.logger.debug(responseObject.errorMessage);
            }
            // restart retry
            this.retry = 0;

            await promiseTimeout(this.clientConnect.bind(this, config), config.timeout * 1000);
            await this.subscribe();
        });

        this.mqttClient.on('messageReceived', this.onMessageReceived.bind(this));
        config.cancellationToken?.throwIfCancelled('Connection callbacks applied');
        await promiseTimeout(this.clientConnect.bind(this, config), config.timeout * 1000);
        config.cancellationToken?.throwIfCancelled('Hub connection completed');
        await this.subscribe();
        config.cancellationToken?.throwIfCancelled('Hub topic subscriptions');
        await this.fetchTwin();
        config.cancellationToken?.throwIfCancelled('Fetch Twin');
    }

    public async fetchTwin() {
        if (this.mqttClient && this.connected) {
            let twinMsg = new Message('');
            twinMsg.destinationName = `$iothub/twin/GET/?$rid=${uuidv4()}`;
            await this.mqttClient.send(twinMsg);
        }
    }

    private async onMessageReceived(message: Message) {
        if (message.destinationName.startsWith(`${TOPIC_TWIN}/200`)) {
            // twin
            await this.logger.debug(`Received twin message: ${message.payloadString}`);
            try {
                this.twin = JSON.parse(message.payloadString);
                if (this.twin.desired) {
                    this.onPropertiesUpdated(this.twin.desired);
                }
            }
            catch (e) {
                this.twin = null;
            }
        }
        else if (message.destinationName.startsWith(TOPIC_PROPERTIES)) {
            // desired properties
            await this.logger.log(`Received desired property message: ${message.payloadString}`);
            this.onPropertiesUpdated(JSON.parse(message.payloadString));

        }
        else if (message.destinationName.startsWith(TOPIC_COMMANDS)) {
            // commands
            await this.logger.log(`Received command message: ${message.payloadString}`);
            const match = message.destinationName.match(/\$iothub\/methods\/POST\/(.+)\/\?\$rid=(.+)/)
            if (match && match.length === 3) {
                let cmd: Partial<IIoTCCommand> = {
                    name: match[1],
                    requestId: match[2]
                };
                if (message.payloadString) {
                    cmd['requestPayload'] = message.payloadString;
                }
                this.onCommandReceived(cmd);
            }

        }
    }


    on(eventName: string | IOTC_EVENTS, callback: PropertyCallback | CommandCallback): void {
        if (typeof (eventName) == 'number') {
            eventName = IOTC_EVENTS[eventName];
        }
        const properties = eventName.match(/^Properties$|Properties\.([\S]+)/); // matches "Properties" or "Properties.propertyname"
        const commands = eventName.match(/^Commands$|Commands\.([\S]+)/);
        if (properties) {
            this.events[IOTC_EVENTS.Properties] = {
                callback: callback as PropertyCallback,
                filter: properties[1] ? properties[1] : undefined
            }
        }
        else if (commands) {
            this.events[IOTC_EVENTS.Commands] = {
                callback,
                filter: commands[1] ? commands[1] : undefined
            }
        }
    }

    private async clientConnect(config: { cleanSession: boolean, timeout: number }) {
        const { cleanSession, timeout } = config;
        if (this.retry == 5) {
            throw new Error('No connection after multiple retries');
        }

        if (!this.mqttClient || this.connected || !this.credentials) {
            return;
        }
        try {
            await this.mqttClient.connect({
                userName: `${this.credentials.host}/${this.id}/?api-version=2019-03-30`,
                password: this.credentials.password,
                delay: 5,
                cleanSession,
                timeout: timeout * 1000
            });
        }
        catch (ex) {
            // retry
            this.retry++;
            await new Promise(r => setTimeout(r, 2000)); // give 2 seconds before retrying
            await this.clientConnect(config);
        }
        this.connected = true;
        await this.logger.debug('Reconnection: success');
    }

    private async subscribe() {
        if (!this.mqttClient || !this.connected) {
            return;
        }
        await this.mqttClient.subscribe(`devices/${this.id}/messages/devicebound/#`);
        await this.mqttClient.subscribe(`${TOPIC_TWIN}/#`);
        await this.mqttClient.subscribe(`${TOPIC_PROPERTIES}/#`);
        await this.mqttClient.subscribe(`${TOPIC_COMMANDS}/#`);
    }



    private onPropertiesUpdated(properties: {
        [x: string]: any,
        '$version': number
    }) {
        const listener = this.events[IOTC_EVENTS.Properties];
        if (!listener) {
            return;
        }
        Object.keys(properties).forEach(prop => {
            if ((listener.filter && listener.filter != prop) || prop === '$version') {
                return;
            }
            const propVersion = properties['$version'];
            let value = properties[prop];
            let wrapped = false;
            const valueType = typeof properties[prop];
            if (valueType !== 'string' && valueType !== 'number' && properties[prop].value) {
                value = properties[prop].value;
                wrapped = true;
            }
            (listener.callback as PropertyCallback)({
                name: prop,
                value,
                version: propVersion,
                ack: async function (this: IoTCClient, message?: string) {
                    if (wrapped) {
                        await this.sendProperty({
                            [prop]: {
                                ac: 200,
                                ad: message ? message : `Property applied`,
                                av: propVersion,
                                value
                            }
                        });
                    }
                    else {
                        await this.sendProperty({
                            [prop]: value
                        });
                    }
                }.bind(this)
            });
        });
    }

    private onCommandReceived(command: Partial<IIoTCCommand>) {
        const listener = this.events[IOTC_EVENTS.Commands];
        if (!listener) {
            return;
        }
        if ((listener.filter && listener.filter != command.name)) {
            return;
        }
        // confirm reception first
        (listener.callback as CommandCallback)({
            name: command.name as string,
            requestPayload: command.requestPayload as any,
            requestId: command.requestId as string,
            reply: async function (this: IoTCClient, status: IIoTCCommandResponse, message: string) {
                await this.ackCommand(command.requestId as string, status);
                await this.sendProperty({
                    [command.name as string]: {
                        value: message
                    }
                });
            }.bind(this)
        });
    }

    private async ackCommand(requestId: string, status?: IIoTCCommandResponse) {
        if (!this.mqttClient || !this.connected) {
            return;
        }
        let msg = new Message('');
        let responseStatus = 200;
        if (status && status == IIoTCCommandResponse.ERROR) {
            responseStatus = 500;
        }
        msg.destinationName = `$iothub/methods/res/${responseStatus}/?$rid=${requestId}`;
        await this.mqttClient.send(msg);
    }


    public setLogging(logLevel: string | IOTC_LOGGING) {
        this.logger.setLogLevel(logLevel);
        this.logger.log(`Log level set to ${logLevel}`);
    }

    public async uploadFile(fileName: string, contentType: string, fileData: any, encoding?: string): Promise<FileUploadResult> {
        if (!this.mqttClient || !this.connected || !this.credentials) {
            return { status: -1, errorMessage: 'Client is not connected!' };
        }
        let filereq: FileRequestMetadata;
        //init upload
        const res = await fetch(`https://${this.credentials.host}/devices/${this.id}/files?api-version=${HTTPS_API_VERSION}`, {
            method: 'POST',
            body: JSON.stringify({
                blobName: fileName
            }),
            headers: {
                Authorization: this.credentials.password,
                'Content-Type': 'application/json'
            }
        });
        if (res && res.status >= 200 && res.status < 300) {
            filereq = await res.json();
            if (encoding && encoding === 'base64') {
                fileData = CryptJsWordArrayToUint8Array(base64parse.bind(CryptoJS.enc.Base64)(fileData));
            }
            const uploadRes = await fetch(`https://${filereq.hostName}/${filereq.containerName}/${filereq.blobName}${filereq.sasToken}`, {
                method: 'PUT',
                headers: {
                    'x-ms-version': '2015-02-21',
                    'x-ms-date': new Date().toUTCString(),
                    'Content-Type': contentType,
                    'Content-Length': `${fileData.length}`,
                    'x-ms-blob-content-disposition': `attachment; filename="${fileName}"`,
                    'x-ms-blob-type': 'BlockBlob'
                },
                body: fileData.buffer
            });
            if (uploadRes) {
                const notif: FileResponseMetadata = {
                    correlationId: filereq.correlationId,
                    isSuccess: uploadRes.status >= 200 && uploadRes.status < 300,
                    statusCode: uploadRes.status,
                    statusDescription: uploadRes.statusText
                };
                // file has been created
                await fetch(`https://${this.credentials.host}/devices/${this.id}/files/notifications?api-version=${HTTPS_API_VERSION}`, {
                    method: 'POST',
                    body: JSON.stringify(notif),
                    headers: {
                        Authorization: this.credentials.password,
                        'Content-Type': 'application/json'
                    }
                });
                return { status: uploadRes.status, errorMessage: (uploadRes.status >= 200 && uploadRes.status < 300) ? undefined : await uploadRes.text() };
            }
        }
        return { status: res.status, errorMessage: await res.text() };
    }


}