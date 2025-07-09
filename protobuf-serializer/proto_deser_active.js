/**
 * 供 Proxyman 使用的 onResponse 函数
 * @param {any} context 
 * @param {string} url 
 * @param {object} request 
 * @param {object} response 
 * @returns 
 */
async function onResponse(context, url, request, response) {
  // Update or Add new headers
  if (response.headers['Content-Serialize'] === 'pb') {
    response.headers["Content-Type"] = "application/octet-stream";
    // console.log(response.body);
    let bodyObj = decodeProto(new Uint8Array(response.body));
    response.customPreviewerTabs["Native"] = JSON.stringify(bodyObj, null, 2);
  }
  
  return response;
}

/**
 * 将 PB 类型转换为类型描述 
 * @param {number} tag PB 类型
 * @param {any} data 数据内容, 主要用于区分字符串及对象
 * @returns {string} 类型描述, number, string, object, double, float
 */
function tagToType(tag, data) {
    switch (tag) {
        case 0: return 'number';
        case 1: return 'double';
        case 2: return typeof data == 'string' ? 'string' : 'object';
        case 5: return 'float';
        default: throw ('Unsupported Wire Type ' + tag);
    }
}

/**
 * 将 PB 字节流转换为对象
 * @param {Uint8Array} input PB 字节流
 * @returns {object} 对象
 */
function decodeProto(input) {
    let result = {}
    while (input.length != 0) {
        let [wireType, fieldIndex, tempInput] = decodeTag(input);
        input = tempInput;

        if (fieldIndex <= 0) {
            throw ('Field Index ' + fieldIndex + ' Less Than 1')
        }

        let fieldValue = null;
        if (wireType == 0) {
            let [varint, tempInput] = decodeVarint(input);
            input = tempInput;
            fieldValue = varint;
        } else if (wireType == 2) {
            let [messageLen, tempInput1] = decodeVarint(input);
            input = tempInput1;

            let [embeddedMessage, tempInput2] = decodeEmbeddedMessage(input, messageLen);
            input = tempInput2;
            fieldValue = embeddedMessage;
        } else if (wireType == 1) {
            let [val, tempInput] = decodeDouble(input);
            input = tempInput;
            fieldValue = val;
        } else if (wireType == 5) {
            let [val, tempInput] = decodeFloat(input);
            input = tempInput;
            fieldValue = val;
        } else {
            throw ('only support wire type [0, 1, 2, 5], [3, 4] group field has been deprecated, current wire type is ' + wireType + ", fieldIndex is " + fieldIndex)
        }

        fieldIndex = '' + fieldIndex + '/' + tagToType(wireType, fieldValue);
        if (result[fieldIndex] == null) {
            result[fieldIndex] = fieldValue;
        } else if (Array.isArray(result[fieldIndex])) {
            result[fieldIndex].push(fieldValue);
        } else {
            result[fieldIndex] = [result[fieldIndex], fieldValue];
        }
    }

    return result;
}

function decodeTag(input) {
    if (input.length == 0) {
        throw ('Decode Tag Input Length Must More Than 0');
    }

    let wireType = input[0] & 0b00000111;
    let fieldIndex = 0 | (input[0] & 0b01111111) >> 3;
    if (input[0] & 0b10000000 == 0) {
        input = input.subarray(1, input.length);
        return [wireType, fieldIndex, input];
    }

    let i = 0,
        bit = 4;
    while ((input[i] & 0b10000000) != 0) {
        i++;

        let byte = 0 | (input[i] & 0b01111111);
        byte = byte << bit;
        fieldIndex = fieldIndex | byte;

        bit += 7;
    }

    input = input.subarray(i + 1, input.length);
    return [wireType, fieldIndex, input];
}

function decodeVarint(input) {
    if (input.length == 0) {
        throw ('Decode Varint Input Length Must More Than 0');
    }

    let i = -1,
        numStr = '';
    do {
        i++;

        let byte = input[i] & 0b01111111;
        numStr = byte.toString(2).padStart(7, '0') + numStr;
    } while ((input[i] & 0b10000000) != 0);

    let bigint = BigInt.asIntN(64, '0b' + numStr)
    let result = (bigint >= Number.MIN_SAFE_INTEGER && bigint <= Number.MAX_SAFE_INTEGER) ? Number(bigint) : bigint.toString();
    return [result, input.subarray(i + 1, input.length)];
}

function decodeString(input, length) {
    if (input.length == 0) {
        throw ('Decode String Input Length Must More Than 0');
    }

    let buffer = input.subarray(0, length);
    let result = Utf8ArrayToStr(buffer);
    return [result, input.subarray(length, input.length)]
}

/* utf.js - UTF-8 <=> UTF-16 convertion
 * http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt
 *
 * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
 * Version: 1.0
 * LastModified: Dec 25 1999
 * This library is free.  You can redistribute it and/or modify it.
 */

function Utf8ArrayToStr(array) {
    var out, i, len, c;
    var char2, char3;

    out = "";
    len = array.length;
    i = 0;
    while(i < len) {
    c = array[i++];
    switch(c >> 4)
    { 
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12: case 13:
        // 110x xxxx   10xx xxxx
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
        break;
      case 14:
        // 1110 xxxx  10xx xxxx  10xx xxxx
        char2 = array[i++];
        char3 = array[i++];
        out += String.fromCharCode(((c & 0x0F) << 12) |
                       ((char2 & 0x3F) << 6) |
                       ((char3 & 0x3F) << 0));
        break;
    }
    }

    return out;
}

/**
 * UTF8 字节流转字符串，参考 https://stackoverflow.com/questions/17191945/conversion-between-utf-8-arraybuffer-and-string
 * @param {uint8Array} uintArray UTF8 字节流
 * @returns {string} 字符串
 */
function uintToString(uintArray) {
    var encodedString = String.fromCharCode.apply(null, uintArray),
        decodedString = decodeURIComponent(escape(encodedString));
    return decodedString;
}

function decodeEmbeddedMessage(input, length) {
    if (input.length < length) {
        throw ('LEN Buffer Length ' + input.length + ', Less Than ' + length);
    }

    let buffer = input.subarray(0, length);
    try {
        /*
        let result = null;
        if (length > 1) {
            result = decodeProto(buffer);
        } else {
            result = decodeString(input, length)[0];
        }
        */
        let result = decodeProto(buffer);
        return [result, input.subarray(length, input.length)];
    } catch (error) {
        // console.log('decode embedded message error ', buffer)
        return decodeString(input, length);
    }
}

function decodeFloat(input) {
    if (input.length < 4) {
        throw ('I32 Buffer Length ' + input.length + ', Less Than 4');
    }
    let buffer = new ArrayBuffer(4);
    let view = new DataView(buffer);
    for (let i = 0; i < 4; i++) {
        view.setUint8(i, input[i]);
    }
    let result = Number(view.getFloat32(0, true).toFixed(5));
    return [result, input.subarray(4, input.length)];
}

function decodeDouble(input) {
    if (input.length < 8) {
        throw ('I64 Buffer Length ' + input.length + ', Less Than 8');
    }
    let buffer = new ArrayBuffer(64);
    let view = new DataView(buffer);
    for (let i = 0; i < 8; i++) {
        view.setUint8(i, input[i]);
    }
    let result = Number(view.getFloat64(0, true).toFixed(5));
    return [result, input.subarray(8, input.length)];
}