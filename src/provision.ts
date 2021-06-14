import { DPS_API_VERSION, IOTC_CONNECT } from "./types/constants";
import { HubCredentials, X509 } from "./types/interfaces";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { Client as MqttClient, Message } from "react-native-paho-mqtt";
import { generateHubCredentials, computeKey } from "./utils";

const REGISTRATIONTOPIC = "$dps/registrations/res";

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

export default class ProvisioningClient {
  private deviceKey: string = "";
  private certificate: X509 | null = null;

  private mqttClient: MqttClient;
  private mqttUser: string;
  private mqttPassword: string;
  private subscriptions: {
    [x: string]: (
      topic: string,
      message: string,
      resolve: any,
      reject: any
    ) => void;
  } = {};
  private requestId: string;

  private retry: number;
  private connected: boolean;

  static createKeyClient(
    endpoint: string,
    registrationId: string,
    scopeId: string,
    connType: IOTC_CONNECT,
    key: string
  ) {
    if (
      connType != IOTC_CONNECT.SYMM_KEY &&
      connType != IOTC_CONNECT.DEVICE_KEY
    ) {
      throw new Error(
        "Can't create a key client with a different credential method"
      );
    }
    if (connType == IOTC_CONNECT.SYMM_KEY) {
      key = computeKey(key, registrationId);
    }
    return new ProvisioningClient(endpoint, registrationId, scopeId, key);
  }

  static createCertificateClient(
    endpoint: string,
    registrationId: string,
    scopeId: string,
    connType: IOTC_CONNECT,
    key: X509
  ) {
    if (
      connType == IOTC_CONNECT.SYMM_KEY ||
      connType == IOTC_CONNECT.DEVICE_KEY
    ) {
      throw new Error(
        "Can't create a certificate client with a different credential method"
      );
    }
    return new ProvisioningClient(endpoint, registrationId, scopeId, key);
  }

  private constructor(
    private readonly endpoint: string,
    private readonly registrationId: string,
    private readonly scopeId: string,
    deviceKey: any
  ) {
    if (typeof deviceKey === "string") {
      this.deviceKey = deviceKey;
    } else {
      this.certificate = deviceKey;
    }

    const clientId = registrationId;
    this.mqttUser = `${scopeId}/registrations/${registrationId}/api-version=${DPS_API_VERSION}`;
    const resourceUri = `${scopeId}/registrations/${registrationId}`;
    const expiry = Math.floor(Date.now() / 1000) + 21600; // 6 hours
    const signature = encodeURIComponent(
      computeKey(this.deviceKey, `${resourceUri}\n${expiry}`)
    );
    this.mqttPassword = `SharedAccessSignature sr=${resourceUri}&sig=${signature}&se=${expiry}&skn=registration`;
    this.requestId = uuidv4();
    this.mqttClient = new MqttClient({
      uri: `wss://${this.endpoint}:443/mqtt`,
      clientId,
      storage: myStorage,
      webSocket: WebSocket,
    });
    this.retry = 0;
    this.connected = false;
  }

  private async onRegistrationResult(
    topic: string,
    message: string,
    resolve: any,
    reject: any
  ): Promise<void> {
    const match = topic.match(
      /\$dps\/registrations\/res\/(\d+)\/\?\$rid=([\w\d\-]+)(&retry-after=(\d))?$/
    );
    if (match && match.length > 1) {
      const status = +match[1];
      const requestId = match[2];
      const retry = +match[4];
      if (requestId === this.requestId) {
        switch (status) {
          case 202:
            // poll
            const operationId = JSON.parse(message).operationId;
            const msg = new Message("");
            msg.destinationName = `$dps/registrations/GET/iotdps-get-operationstatus/?$rid=${requestId}&operationId=${operationId}`;
            await new Promise<void>((r) =>
              setTimeout(async () => {
                await this.mqttClient.send(msg);
                r();
              }, (retry + 2) * 1000)
            ); // add 2 seconds to retry to give more time
            break;
          case 200:
            // get result
            const res = JSON.parse(message);
            await this.mqttClient.disconnect();
            if (res.status === "failed") {
              reject(message);
            }
            resolve(
              generateHubCredentials(
                res.registrationState.assignedHub,
                this.registrationId,
                this.deviceKey
              )
            );
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
      payload["payload"] = {
        iotcModelId: modelId,
        modelId: modelId,
      };
    }
    return new Promise<HubCredentials>(async (resolve, reject) => {
      this.subscriptions[REGISTRATIONTOPIC] = this.onRegistrationResult.bind(
        this
      );

      const onMessageReceived = function (
        this: ProvisioningClient,
        message: Message
      ) {
        if (message.destinationName.startsWith(REGISTRATIONTOPIC)) {
          this.subscriptions[REGISTRATIONTOPIC](
            message.destinationName,
            message.payloadString,
            resolve,
            reject
          );
        }
      };
      this.mqttClient.on("messageReceived", onMessageReceived.bind(this));
      try {
        await this.clientConnect();
        await this.mqttClient.subscribe(`${REGISTRATIONTOPIC}/#`);
        let msg = new Message(JSON.stringify(payload));
        msg.destinationName = `$dps/registrations/PUT/iotdps-register/?$rid=${this.requestId}`;
        await this.mqttClient.send(msg);
      } catch (ex) {
        reject(ex);
      }
    });
  }

  private async clientConnect() {
    if (this.retry == 5) {
      throw new Error("No connection after multiple retries");
    }

    if (!this.mqttClient || this.connected) {
      return;
    }
    try {
      await this.mqttClient.connect({
        userName: this.mqttUser,
        password: this.mqttPassword,
      });
    } catch (ex) {
      // retry
      this.retry++;
      await this.clientConnect();
    }
    this.connected = true;
  }
}
