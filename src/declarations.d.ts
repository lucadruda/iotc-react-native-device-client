declare module 'react-native-paho-mqtt' {
    class Client {

        constructor(config: {
            uri: string,
            clientId: string,
            storage?: any,
            webSocket?: typeof WebSocket
        });

        on(event: string, callback: (message: any) => void): void;
        connect(connectOptions?: {
            /**
             * If the connect has not succeeded within this number of seconds, it is deemed to have failed. The default is 30 seconds.
             */
            timeout?: number,
            /**
             * Authentication username for this connection.
             */
            userName?: string,
            /**
             * Authentication password for this connection.
             */
            password?: string,
            /**
             * Message	sent by the server when the client disconnects abnormally.
             */
            willMessage?: Message,
            /**
             * the server disconnects this client if there is no activity for this number of seconds. The default value of 60 seconds is assumed if not set.
             */
            keepAliveInterval?: number,
            /**
             * if true(default) the client and server persistent state is deleted on successful connect.
             */
            cleanSession?: boolean,
            /**
             * if present and true, use an SSL Websocket connection.
             */
            useSSL?: boolean,
            /**
             * passed to the onSuccess callback or onFailure callback.
             */
            invocationContext?: any,
            /**
             * function	called when the connect acknowledgement has been received from the server. 
             * A single response object parameter is passed to the onSuccess callback containing the following fields:
             *  invocationContext as passed in to the onSuccess method in the connectOptions.
             */
            onSuccess?(invocationContext: any): void,
            /**
             * function	called when the connect request has failed or timed out. A single response object parameter is passed to the onFailure callback containing the following fields:
             * invocationContext as passed in to the onFailure method in the connectOptions.
             * errorCode a number indicating the nature of the error.
             * errorMessage text describing the error.
             */
            onFailure?(invocationContext: any, errorCode: number, errorMessage: string): void,
            /**
             *  array	If present this contains either a set of hostnames or fully qualified WebSocket URIs(ws://mqtt.eclipse.org:80/mqtt), that are tried in order in place of the host and port paramater on the construtor. The hosts are tried one at at time in order until one of then succeeds.
             */
            hosts?: string[],
            /**
             * array	If present the set of ports matching the hosts.If hosts contains URIs, this property is not used.
             */
            ports?: number[],
            /**
             * 	Sets whether the client will automatically attempt to reconnect to the server if the connection is lost.
             * If set to false, the client will not attempt to automatically reconnect to the server in the event that the connection is lost.
             * If set to true, in the event that the connection is lost, the client will attempt to reconnect to the server.It will initially wait 1 second before it attempts to reconnect, for every failed reconnect attempt, the delay will double until it is at 2 minutes at which point the delay will stay at 2 minutes.
             */
            reconnect?: boolean,
            /**
             * number	The version of MQTT to use to connect to the MQTT Broker.
             * 3 - MQTT V3.1
             * 4 - MQTT V3.1.1
             */
            mqttVersion?: number,
            /**
             * If set to true, will force the connection to use the selected MQTT Version or will fail to connect.
             */
            mqttVersionExplicit?: boolean,
            /**
             * array	If present, should contain a list of fully qualified WebSocket uris(e.g.ws://mqtt.eclipse.org:80/mqtt), that are tried in order in place of the host and port parameter of the construtor. The uris are tried one at a time in order until one of them succeeds. Do not use this in conjunction with hosts as the hosts array will be converted to uris and will overwrite this property.
             */
            uris?: string[]
        }): Promise<void>;
        subscribe(topic: string): Promise<void>;
        unsubscribe(topic: string): Promise<void>;
        send(message: Message): Promise<void>;
        disconnect(): Promise<void>;
    }

    class Message {
        /**
         * 
         * @param payload The message data to be sent.
         */
        constructor(payload: string);

        /** The payload as a string if the payload consists of valid UTF-8 characters. Read-Only */
        payloadString: string;
        /** The payload as an ArrayBuffer.Read-Only */
        payloadBytes: ArrayBuffer;

        /**
         *  Mandatory!
         *  The name of the destination to which the message is to be sent
         *  (for messages about to be sent) or the name of the destination 
         * from which the message has been received. (for messages received by the onMessage function). */
        destinationName: string;
        /**
         * The Quality of Service used to deliver the message.
            0 Best effort(default ).
            1 At least once.
            2 Exactly once.
         */
        qos: number;

        /**
         * If true, the message is to be retained by the server and delivered to both current and future subscriptions.If false the server only delivers the message to current subscribers, this is the default for new Messages.A received message has the retained boolean set to true if the message was published with the retained boolean set to true and the subscrption was made after the message has been published. 
         * 
         * */
        retained: boolean;
        /**
         * read only If true, this message might be a duplicate of one which has already been received.This is only set on messages received from the server.
         */
        duplicate: boolean;
    }
}

// declare module 'react-native-crypto-js' {
//     interface Cipher {
//         encrypt(data: string, key: string): any,
//         decrypt(data: string, key: string): any
//     }
//     namespace CryptoJS {
//         const SHA256: Cipher;
//         const HmacSHA256: Cipher;
//     }
//     export default CryptoJS;
// }
