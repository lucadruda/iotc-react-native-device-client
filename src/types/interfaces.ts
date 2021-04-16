// Copyright (c) Luca Druda. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { IOTC_EVENTS, IOTC_LOGGING } from "./constants";

export class Result {
  constructor(public code?: any) {}
}

export type HubCredentials = {
  host: string;
  password: string;
};
export interface X509 {
  certFile: string;
  certKey: string;
  certPassword?: string;
}

export interface IIoTCProperty {
  name: string;
  value: any;
  version: number;
  ack: () => Promise<void>;
}

export enum IIoTCCommandResponse {
  SUCCESS,
  ERROR,
}

export interface IIoTCCommand {
  name: string;
  requestPayload: any;
  requestId?: string;
  reply: (status: IIoTCCommandResponse, message: string) => Promise<void>;
}
export type PropertyCallback = (data: IIoTCProperty) => void | Promise<void>;
export type CommandCallback = (data: IIoTCCommand) => void | Promise<void>;

export type FileRequestMetadata = {
  correlationId: string;
  hostName: string;
  containerName: string;
  blobName: string;
  sasToken: string;
};
export type FileResponseMetadata = {
  correlationId: string;
  isSuccess: boolean;
  statusCode: number;
  statusDescription: string;
};

export type FileUploadResult = {
  status: number;
  errorMessage?: string;
};
export interface IIoTCClient {
  readonly id: string;
  /**
   *
   * @param modelId IoT Central model Id for automatic approval process
   */
  setModelId(modelId: string): void;
  /**
   * Set global endpoint for DPS provisioning
   * @param endpoint hostname without protocol
   */
  setGlobalEndpoint(endpoint: string): void;
  /**
   * Disconnect device. Client cannot be reused after disconnect!!!
   */
  disconnect(): Promise<void>;
  /**
   * Connect the device
   */
  connect(config?: {
    cleanSession?: boolean;
    timeout?: number;
    request?: Object;
  }): Promise<void>;
  /**
   *
   * @param payload Message to send: can be any type (usually json) or a collection of messages
   * @param properties Properties to be added to the message (JSON format)
   * @returns void or Promise<Result>
   */
  sendTelemetry(payload: any, properties?: any): Promise<void>;
  /**
   *
   * @param payload Property to send: can be any type (usually json) or a collection of properties
   * @param [callback] Function to execute when property gets set
   * @returns void or Promise<Result>
   */
  sendProperty(payload: any): Promise<void>;
  /**
   *
   * @param eventName name of the event to listen
   * @param callback function to execute when event triggers
   */
  on(
    eventName: IOTC_EVENTS.Properties | string,
    callback: PropertyCallback
  ): void;
  on(eventName: IOTC_EVENTS.Commands | string, callback: CommandCallback): void;

  setLogging(logLevel: string | IOTC_LOGGING): void;

  isConnected(): boolean;

  fetchTwin(): Promise<void>;

  uploadFile(
    fileName: string,
    contentType: string,
    fileData: any,
    encoding?: string
  ): Promise<FileUploadResult>;
}

export interface IIoTCLogger {
  setLogLevel(logLevel: string | IOTC_LOGGING): void;
  log(message: string, tag?: string): void | Promise<void>;
  debug(message: string, tag?: string): void | Promise<void>;
}

export type IoTCCredentials = {
  deviceId: string;
  modelId: string;
  patientId: string;
  deviceKey: string;
  scopeId: string;
  connectionString?: string;
};
