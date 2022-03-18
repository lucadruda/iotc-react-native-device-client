# Azure IoTCentral device client for React Native

This project provides a react-native compatible version of the IoTCentral device client. The client is Promise-based and written in Typescript.

[![npm version](https://badge.fury.io/js/react-native-azure-iotcentral-client.svg)](https://badge.fury.io/js/react-native-azure-iotcentral-client)

## Getting Started

Install the package and its dependency:

```bash
npm install react-native-azure-iotcentral-client react-native-get-random-values
```

_react-native-get-random-values_ provides a polyfill for random generated numbers. This package is mandatory and needs to be imported in project root (index.js, App,js ...);

<br/>

**App.js**

```js
import "react-native-get-random-values";
```

### Manual installation

<details>
<summary>iOS</summary>

### Install pods

```sh
cd ios && pod install
```

</details>

### Types

Source code is written in Typescript so types are bundled with the package, you don't need to install any additional package

### Connect

#### Symmetric Key

```js
import { IoTCClient } from "react-native-azure-iotcentral-client";

const scopeId = "scopeID";
const deviceId = "deviceID";
const sasKey = "deviceKey";

const iotc = new IoTCClient(deviceId, scopeId, IOTC_CONNECT.DEVICE_KEY, sasKey);

async function main() {
  await iotc.connect();
}

main();
```

It is possible to use both group keys (_SYMM_KEY_) and device keys (_DEVICE_KEY_).
When specifying a device key as _sasKey_ option the connection type must be _IOTC_CONNECT.DEVICE_KEY_

### Operations

After successfull connection, IOTC context is available for further commands.

All the callbacks are optional parameters and are triggered when message has reached the ingestion engine.

### Send telemetry

Send telemetry every 3 seconds

```js
setInterval(async() => {
            await iotc.sendTelemetry({
                field1: value1,
                field2: value2,
                field3: value3
            }, properties)
```

An optional _properties_ object can be included in the send methods, to specify additional properties for the message (e.g. timestamp, content-type etc... ).
Properties can be custom or part of the reserved ones (see list [here](https://github.com/Azure/azure-iot-sdk-csharp/blob/master/iothub/device/src/MessageSystemPropertyNames.cs#L36)).

### Send property update

```js
await iotc.sendProperty({ fieldName: "fieldValue" });
```

### Listen to property updates

```js
iotc.on(IOTC_EVENTS.Properties, callback);
```

The callback is a function accepting a Property object. Once the new value is applied, the operation must be acknoledged to reflect it on IoTCentral app.

```js
iotc.on(IOTC_EVENTS.Properties, async (property) => {
  console.log("Received " + property.name);
  await property.ack("custom message");
});
```

### Listen to commands

```js
iotc.on(IOTC_EVENTS.Commands, callback);
```

The callback is a function accepting a Command object. To reply, just call the reply function.

```js
iotc.on(IOTC_EVENTS.Commands, async (command) => {
  console.log("Received " + command.name);
  await command.reply(status, "custom message");
});
```

_status_ is of type _IIoTCCommandResponse_

```js
enum IIoTCCommandResponse {
    SUCCESS,
    ERROR
}
```

## One-touch device provisioning and approval

A device can send custom data during provision process: if a device is aware of its IoT Central template Id, then it can be automatically provisioned.

### How to set IoTC model ID in your device

Model Id can be found in the device template page.
Select the root node and click on "Edit DTDL". Note down the _@id_ value.
![Img](assets/modelId.png)
![Img](assets/modelId2.png)

Then call this method before connect():

```
iotc.setModelId('<modelId>');
```

### Automatic approval (default)

Device auto-approval is enabled by default in IoT Central. With automatic approval a device can be provisioned without any manual action and can start sending/receiving data after status changes to "Provisioned".

![Img](assets/auto_approval.png)

### Manual approval

To change default behavior, administrator can disable device auto-approval from _Device Connection Groups_ page under the _Permissions_ section.
In manual approval mode, administrator has to approve the device registration to complete the provisioning process. This can be done in the _Devices_ section.

![Img](assets/manual_approval.png)

## Sample

The _sample_ folder contains a sample React Native mobile application to play with the library.

<p align='center'>
<img width='300' src='./assets/sample.gif' style='border:1px solid gray'/>
</p>

## Instructions

```bash
cd ./sample

npm install

# for iOS only
cd ./ios && pod install && cd ..

npm run ios # or 'npm run android'
```

This sample does not use published npm package but compiled code in the parent folder. In this way you can tweak library code and easily test it through the mobile app.
Every time library code changes, you need to re-build and re-install package in the mobile app.

```bash
npm run build

cd ./sample

npm install
```

# License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
