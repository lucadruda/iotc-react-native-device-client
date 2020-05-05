// Copyright (c) Luca Druda. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { IIoTCClient, X509, IIoTCLogger, Result } from "./types/interfaces";
import { IOTC_CONNECT, DPS_DEFAULT_ENDPOINT, IOTC_EVENTS, IOTC_CONNECTION_OK, IOTC_CONNECTION_ERROR, IOTC_LOGGING, DeviceTransport } from "./types/constants";
import { ConsoleLogger } from "./consoleLogger";
import ProvisioningClient, { HubCredentials } from "./provision";
import { Client as MqttClient, Message } from 'react-native-paho-mqtt';
import { v4 as uuidv4 } from 'uuid'


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

export default class IoTCClient implements IIoTCClient {
    isConnected(): boolean {
        return this.connected;
    }


    private events: {
        [s in IOTC_EVENTS]?: {
            callback: (message: string | any) => void,
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
    }

    setGlobalEndpoint(endpoint: string): void {
        this.endpoint = endpoint;
        this.logger.log(`Endpoint set to ${endpoint}.`);
    }

    setModelId(modelId: string): void {
        this.modelId = modelId;
    }

    sendTelemetry(payload: any, properties?: any, callback?: (err?: Error) => void): void | Promise<void> {
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
        if (callback) {
            this.mqttClient.send(msg).then(() => callback());
            return;
        }
        return this.mqttClient.send(msg);

    }

    sendProperty(payload: any, callback?: (err: Error, result: void) => void): void | Promise<void> {
        // payload = JSON.stringify(payload);
    }

    disconnect(callback?: (err: Error, result: Result) => void): void | Promise<Result> {
        this.logger.log(`Disconnecting client...`);
    }

    async connect(): Promise<any> {
        this.logger.log(`Connecting client...`);
        this.credentials = await this.deviceProvisioning.register(this.modelId);
        this.mqttClient = new MqttClient({
            uri: `wss://${this.credentials.host}:443/mqtt`,
            clientId: this.id,
            storage: myStorage
        });
        this.mqttClient.on('messageReceived', this.onMessageReceived);
        await this.mqttClient.connect({
            userName: `${this.credentials.host}/${this.id}/?api-version=2018-06-30`,
            password: this.credentials.password
        });
        this.connected = true;
        await this.mqttClient.subscribe(`devices/${this.id}/messages/devicebound/#`);
        await this.mqttClient.subscribe(`${TOPIC_TWIN}/#`);
        let twinMsg = new Message('');
        twinMsg.destinationName = `$iothub/twin/GET/?$rid=${uuidv4()}`;
        await this.mqttClient.send(twinMsg);

    }

    private onMessageReceived(message: Message) {
        if (message.destinationName.startsWith(TOPIC_TWIN)) {
            // twin
            this.logger.log(`Received twin message: ${message.payloadString}`);
        }
        else if (message.destinationName.startsWith(TOPIC_PROPERTIES)) {
            // desired properties


        }
        else if (message.destinationName.startsWith(TOPIC_COMMANDS)) {
            // commands
        }
    }


    on(eventName: string | IOTC_EVENTS, callback: (message: string | any) => void): void {
        if (typeof (eventName) == 'number') {
            eventName = IOTC_EVENTS[eventName];
        }
        const properties = eventName.match(/^Properties$|Properties\.([\S]+)/); // matches "Properties" or "Properties.propertyname"
        const commands = eventName.match(/^Commands$|Commands\.([\S]+)/);
        if (properties) {
            this.events[IOTC_EVENTS.Properties] = {
                callback,
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
            listener.callback(JSON.stringify({
                name: prop,
                value: properties[prop],
                version: properties['$version']
            }));
        });
    }


    public setLogging(logLevel: string | IOTC_LOGGING) {
        this.logger.setLogLevel(logLevel);
        this.logger.log(`Log level set to ${logLevel}`);
    }


}