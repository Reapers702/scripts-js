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
 * 将类型描述转换为 PB 类型
 * @param {string} type 类型描述, number, string, object, double, float
 * @returns {number} PB 类型
 */
typeToTag = (type) => ({'number': 0, 'double': 1, 'string': 2, 'object': 2, 'float': 5}[type]);

/**
 * 将 Protobuf 字节流的 Base64 形式转换为对象
 * @param {string} input Base64 编码的字节流
 * @returns {object} 对象
 */
function decodeFromBase64(input) {
    let binaryString = atob(input);
    let uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }

    let arr = Array.from(uint8Array, o => o.toString(16).padStart(2, '0'))
    console.log(arr.join(''))

    return decodeProto(uint8Array);
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
    // let result = uintToString(buffer);
    let result = new TextDecoder().decode(buffer);
    return [result, input.subarray(length, input.length)]
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
        let result = null;
        if (length > 1) {
            result = decodeProto(buffer);
        } else {
            result = decodeString(input, length)[0];
        }
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


/**
 * 解析元数据信息
 * 以下开始为对象转 PB 的相关方法
 * @param {string} input 元数据信息
 * @returns [类型描述, PB类型, 字段序号]
 */
function parseFieldMetaData(input) {
    let parts = input.split('/'); 
    return [parts[1], typeToTag(parts[1]), parseInt(parts[0])];
}

/**
 * 将字段序号和 PB 类型 Tag 转换为 PB 字段元数据
 * @param {number} fieldIndex 字段序号
 * @param {number} wireType PB 类型 Tag
 * @returns {Uint8Array} PB 字段元数据字节流
 */
function encodeToFieldMetaData(fieldIndex, wireType) {
    if (fieldIndex <= 0b1111) {
        return [wireType | fieldIndex << 3];
    }

    let byteArray = [wireType | (fieldIndex << 3 & 0b01111000) | 0b10000000];
    fieldIndex >>= 4;
    do {
        let continueTag = fieldIndex > 0b01111111 ? 0b10000000 : 0;
        byteArray.push((fieldIndex & 0b01111111) | continueTag);
        fieldIndex >>= 7;
    } while (fieldIndex != 0);
    return byteArray;
}

/**
 * 将整数以 VARINT 编码，可能会在 LEN 长度、VARINT 数据中使用
 * 此方法存在漏洞，负数序列化时，会使用 32 位长，导致数据缺失
 * @param {number} value 整数
 * @returns VARINT 字节流
 */
function encodeVarint(value) {
    let byteArray = [];
    do {
        let continueTag = value > 0b01111111 ? 0b10000000 : 0;
        byteArray.push((value & 0b01111111) | continueTag);
        value = value >> 7;
    } while (value > 0);
    return byteArray;
}

/**
 * 将对象序列化为 PB 字节流
 * @param {any} val 待序列化内容, 可支持对象、数字、字符串 
 * @param {number} wireTag 序列化类型，参考 protobuf 文档
 * @param {number} fieldIndex 序列化字段序号，当值为 -1 时，表明为根对象
 * @returns {Uint8Array} PB 字节流
 */
function encodeToByte(val, wireTag, fieldIndex) {
    let byteArray = [];
    if (wireTag == 2 && typeof val == 'string') {
        byteArray = byteArray.concat(encodeToFieldMetaData(fieldIndex, 2));
        var utf8 = unescape(encodeURIComponent(val));
        byteArray = byteArray.concat(encodeVarint(utf8.length));

        for (var i = 0; i < utf8.length; i++) {
            byteArray.push(utf8.charCodeAt(i));
        }
        return byteArray;
    }
    if (wireTag == 0) {
        // varint
        byteArray = byteArray.concat(encodeToFieldMetaData(fieldIndex, wireTag));
        byteArray = byteArray.concat(encodeVarint(val));
        return byteArray;
    }
    if (wireTag == 1) {
        // double
        byteArray = byteArray.concat(encodeToFieldMetaData(fieldIndex, wireTag));
        let buffer = new Float64Array(val);
        return byteArray.push(buffer.buffer);
    }
    if (wireTag == 5) {
        // float
        byteArray = byteArray.concat(encodeToFieldMetaData(fieldIndex, wireTag));
        let buffer = new Float32Array(val);
        return byteArray.push(buffer.buffer);
    }

    if (wireTag == 2) {
        // object
        for (let key of Object.keys(val)) {
            let value = val[key];
            let metaData = parseFieldMetaData(key);
            if (!['string', 'object', 'number', 'double', 'float'].includes(metaData[0])) {
                throw ('Unsupported Type ' + metaData[0]);
            }

            if (Array.isArray(value)) {
                for (let ele of value) {
                    byteArray = byteArray.concat(encodeToByte(ele, metaData[1], metaData[2]));
                }
            } else {
                byteArray = byteArray.concat(encodeToByte(value, metaData[1], metaData[2]));
            }
        }

        if (fieldIndex == -1) {
            return byteArray;
        }
        let metaData = encodeToFieldMetaData(fieldIndex, 2);
        metaData = metaData.concat(encodeVarint(byteArray.length));
        return metaData.concat(byteArray);
    }

    throw ('Unsupported Type ' + type + val);
}

/**
 * 将解析后的对象序列化为 PB 字节流
 * @param {any} obj PB 对象
 * @returns {Uint8Array} PB 字节流
 */
function encodeProto(obj) {
    return encodeToByte(obj, 2, -1);
}


// json = '{"1/string":"","2/number":1,"3/string":"","4/string":"2024-07-29 01:17:11 8000","5/string":"2250101","7/object":{"1/object":{"1/object":[{"1/string":"7","2/string":"1","3/string":"","4/string":"测试节日","5/string":"2024","8/number":0,"9/number":0,"10/number":1}],"2/number":15,"10000/number":0,"10001/string":"成功"},"2/number":0,"4/number":0}}';
// obj = JSON.parse(json);
// let byteArray = new Uint8Array(encodeToByte(obj, 2, -1));
// console.log(byteArray);

// obj = decodeProto(byteArray);
// console.log(JSON.stringify(obj));

let json = `{
  "1/string": "15035082783"
}`;

let ba = encodeProto(JSON.parse(json));
console.log(JSON.stringify(ba));

obj = decodeProto(new Uint8Array(ba));
console.log(JSON.stringify(obj,'',4));
