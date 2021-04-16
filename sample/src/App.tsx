import CheckBox from '@react-native-community/checkbox';
import { Formik } from 'formik';
import humanizeString from 'humanize-string';
import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, TextInput, View, Text, Button, ScrollView, KeyboardAvoidingView, Modal, ActivityIndicator } from 'react-native';
import { IoTCCredentials, IoTCClient, IOTC_CONNECT, IIoTCClient, IIoTCLogger, IOTC_LOGGING, IIoTCProperty, IOTC_EVENTS, IIoTCCommand, IIoTCCommandResponse } from 'react-native-azure-iotcentral-client';

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

const initialValues: Partial<IoTCCredentials> & { connectionString: string, groupKey: string, newDevice: boolean } = {
    scopeId: '',
    deviceId: '',
    connectionString: '',
    newDevice: false,
    deviceKey: '',
    modelId: '',
    groupKey: ''
}


class Logger implements IIoTCLogger {

    constructor(private append: Setter<string>) {

    }
    setLogLevel(logLevel: string | IOTC_LOGGING): void {
        return; // no-op
    }
    log(message: string, tag?: string): void | Promise<void> {
        this.append(message);
    }
    debug(message: string, tag?: string): void | Promise<void> {
        return;
    }

}


const onProperties = async (prop: IIoTCProperty, append: Setter<string>) => {
    append(`Received property '${prop.name}' with value '${prop.value}'`);
    await prop.ack();
};

const onCommands = async (cmd: IIoTCCommand, append: Setter<string>) => {
    append(`Received command '${cmd.name}'${cmd.requestPayload ? ` with payload '${cmd.requestPayload}'` : '.'}`);
    await cmd.reply(IIoTCCommandResponse.SUCCESS, 'Command received');
}


export default function App() {
    const [iotc, setIotc] = useState<IIoTCClient | null>(null);
    const [logs, setLogs] = useState('');

    useEffect(() => {
        if (iotc && iotc.isConnected()) {
            iotc.on(IOTC_EVENTS.Properties, (prop) => onProperties(prop, (s) => setLogs(c => `${c}\n${s}`)));
            iotc.on(IOTC_EVENTS.Commands, (cmd) => onCommands(cmd, (s) => setLogs(c => `${c}\n${s}`)));
        }
    }, [iotc])

    return (
        <SafeAreaView style={{ flex: 1 }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30, fontWeight: 'bold' }}>IoTCentral Client Sample</Text>
            </View>
            <View style={{ flex: 3 }}>
                {(iotc && iotc.isConnected()) ?
                    <>
                        <DeviceInfo iotc={iotc} />
                        <TelemetryForm iotc={iotc} append={(s) => setLogs(c => `${c}\n${s}`)} />
                        <PropertyForm iotc={iotc} append={(s) => setLogs(c => `${c}\n${s}`)} />
                        <LogWindow logs={logs} /></>
                    : <ConnectForm setIotc={setIotc} append={(s) => setLogs(c => `${c}\n${s}`)} />}
            </View>
        </SafeAreaView>
    )
}


function ConnectForm(props: { setIotc: Setter<IIoTCClient | null>, append: Setter<string> }) {
    const { setIotc, append } = props;
    const defaultSubmit = 'Connecting ...';
    const [submitting, setSubmitting] = useState(false);
    const [submitMsg, setSubmitMsg] = useState(defaultSubmit);
    const [isDps, setIsDps] = useState(true);

    return (
        <Formik initialValues={initialValues}
            onSubmit={async (values) => {
                const { deviceId, deviceKey, scopeId, groupKey, modelId, connectionString } = values;
                setSubmitting(true);
                try {
                    let iotc;
                    if (connectionString) {
                        iotc = IoTCClient.getFromConnectionString(connectionString);
                    }
                    else if (deviceId && scopeId && (deviceKey || (modelId && groupKey))) {
                        if (deviceKey) {
                            iotc = new IoTCClient(deviceId, scopeId, IOTC_CONNECT.DEVICE_KEY, deviceKey, new Logger(append));
                        }
                        else {
                            iotc = new IoTCClient(deviceId, scopeId, IOTC_CONNECT.SYMM_KEY, groupKey, new Logger(append));
                            iotc.setModelId(modelId as string);
                        }
                    }
                    else {
                        return;
                    }
                    await iotc.connect();
                    setSubmitting(false);
                    setIotc(iotc);
                }
                catch (e) {
                    setSubmitMsg('Error connecting device');
                    setTimeout(() => {
                        setSubmitMsg(defaultSubmit);
                        setSubmitting(false);
                    }, 3000);
                }
            }}
        >

            {({ handleChange, handleBlur, handleSubmit, values, setFieldValue }) => (
                <KeyboardAvoidingView style={{ flex: 1, paddingHorizontal: 30 }} behavior={'padding'}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <CheckBox disabled={false} value={isDps} onValueChange={() => setIsDps(true)} />
                        <Text>Use DPS</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <CheckBox disabled={false} value={!isDps} onValueChange={() => setIsDps(false)} />
                        <Text>Use Connection String</Text>
                    </View>
                    {(Object.keys(values) as (keyof typeof initialValues)[]).map((k) => {
                        if (!isDps && k !== 'connectionString') {
                            return (null)
                        }
                        if (k === 'newDevice') {
                            return (<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginEnd: 50 }} key={k}>
                                <Text>Create new device</Text>
                                <CheckBox disabled={false} value={values[k]} onValueChange={v => setFieldValue(k, v)} />
                            </View>)
                        }

                        if ((values.newDevice && k === 'deviceKey') || (!values.newDevice && k === 'modelId') || (!values.newDevice && k === 'groupKey')) {
                            return (null)
                        }
                        return (<TextInput
                            style={{ height: 40, borderBottomColor: 'gray', borderBottomWidth: 1, marginBottom: 20 }}
                            onChangeText={handleChange(k)}
                            onBlur={handleBlur(k)}
                            key={k}
                            placeholder={humanizeString(k)}
                            value={values[k]}
                        />)
                    })}

                    <Button onPress={handleSubmit as any} title="Connect" />
                    <Modal visible={submitting}
                        transparent={true}
                        animationType='slide'
                    >
                        <View style={{
                            flex: 1,
                            justifyContent: 'center',
                            alignItems: 'center',
                            backgroundColor: '#00000080'
                        }}>
                            <View style={{ backgroundColor: '#fff', padding: 60, justifyContent: 'space-evenly' }}>
                                <Text>{submitMsg}</Text>
                                {submitMsg === defaultSubmit && <ActivityIndicator size={40} />}
                            </View>
                        </View>
                    </Modal>
                </KeyboardAvoidingView>
            )
            }
        </Formik >
    )
}

function LogWindow(props: { logs: string }) {
    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollToEnd();
        }
    }, [props.logs]);

    return (<ScrollView ref={scrollRef} style={{ marginHorizontal: 20, borderWidth: 1, borderColor: 'gray', padding: 5, flex: 1 }}
        contentContainerStyle={{ paddingBottom: 10 }}
    >
        <Text selectable={true}>{props.logs}</Text>
    </ScrollView>)
}

function TelemetryForm(props: { iotc: IIoTCClient, append: Setter<string> }) {
    const { iotc, append } = props;
    const [input, setInput] = useState('');
    return (
        <>
            <Text style={{ marginHorizontal: 20, marginVertical: 5 }}>Telemetry</Text>
            <View style={{ flexDirection: 'row', paddingHorizontal: 20 }}>
                <TextInput style={{ flex: 1, height: 30, borderWidth: .5, borderColor: 'gray' }} value={input} onChangeText={setInput} />
                <Button title='Send' onPress={async () => {
                    let payloadStr = input;
                    // iOS hack: revert Smart Punctuation
                    payloadStr = payloadStr.replace(/”/g, '"').replace(/“/g, '"').replace(/--/g, '—');

                    append(`Sending telemetry '${payloadStr}'`);
                    await iotc.sendTelemetry(JSON.parse(payloadStr));
                }} />
            </View>
        </>)
}

function PropertyForm(props: { iotc: IIoTCClient, append: Setter<string> }) {
    const { iotc, append } = props;
    const [input, setInput] = useState('');
    return (
        <>
            <Text style={{ marginHorizontal: 20, marginVertical: 5 }}>Property</Text>
            <View style={{ flexDirection: 'row', paddingHorizontal: 20 }}>
                <TextInput style={{ flex: 1, height: 30, borderWidth: .5, borderColor: 'gray' }} value={input} onChangeText={setInput} />
                <Button title='Send' onPress={async () => {
                    let payloadStr = input;
                    // iOS hack: revert Smart Punctuation
                    payloadStr = payloadStr.replace(/”/g, '"').replace(/“/g, '"').replace(/--/g, '—');

                    append(`Sending property '${payloadStr}'`);
                    await iotc.sendProperty(JSON.parse(payloadStr));
                }} />
            </View>
        </>)
}

function DeviceInfo(props: { iotc: IIoTCClient }) {
    return (<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 }}>
        <Text style={{ flex: 1 }}>Device: {props.iotc.id}</Text>
        <Button title='Disconnect' onPress={() => props.iotc.disconnect()} />
    </View>)
}

