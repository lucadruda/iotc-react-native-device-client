import IoTCClient from './client';
import {IOTC_CONNECT} from './types/constants'

const iotc=new IoTCClient('dev1', '0ne00052362', IOTC_CONNECT.SYMM_KEY, '68p6zEjwVNB6L/Dz8Wkz4VhaTrYqkndPrB0uJbWr2Hc/AmB+Qxz/eJJ9MIhLZFJ6hC0RmHMgfaYBkNTq84OCNQ==')
iotc.connect();