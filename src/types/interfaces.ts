// Copyright (c) Luca Druda. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { IOTC_EVENTS, IOTC_LOGGING } from "./constants";

export class Result {
    constructor(public code?: any) {

    }
}

export interface X509 {
    certFile: string,
    certKey: string,
    certPassword?: string
}

export interface IIoTCClient {

    /**
     * 
     * @param modelId IoT Central model Id for automatic approval process
     */
    setModelId(modelId: string): void,
    /**
     * Set global endpoint for DPS provisioning
     * @param endpoint hostname without protocol
     */
    setGlobalEndpoint(endpoint: string): void,
    /**
     * Disconnect device. Client cannot be reused after disconnect!!!
     */
    disconnect(): Promise<void>,
    /**
     * Connect the device
     */
    connect(cleanSession?: boolean): Promise<void>,
    /**
     * 
     * @param payload Message to send: can be any type (usually json) or a collection of messages
     * @param properties Properties to be added to the message (JSON format)
     * @returns void or Promise<Result>
     */
    sendTelemetry(payload: any, properties?: any): Promise<void>,
    /**
    * 
    * @param payload Property to send: can be any type (usually json) or a collection of properties
    * @param [callback] Function to execute when property gets set
    * @returns void or Promise<Result>
    */
    sendProperty(payload: any): Promise<void>,
    /**
     * 
     * @param eventName name of the event to listen
     * @param callback function to execute when event triggers
     */
    on(eventName: string | IOTC_EVENTS, callback: (data: IIoTCCommand | IIoTCProperty) => void | Promise<void>): void,

    setLogging(logLevel: string | IOTC_LOGGING): void,

    isConnected(): boolean,

    fetchTwin(): Promise<void>

}

export interface IIoTCLogger {
    setLogLevel(logLevel: string | IOTC_LOGGING): void;
    log(message: string, tag?: string): void;
    debug(message: string, tag?: string): void;
}

export interface IIoTCProperty {
    name: string,
    value: any,
    version: number,
    ack: () => Promise<void>
}

export enum IIoTCCommandResponse {
    SUCCESS,
    ERROR
}

export interface IIoTCCommand {
    name: string,
    requestPayload: any,
    requestId: string,
    reply: (status: IIoTCCommandResponse, message: string) => Promise<void>
}

