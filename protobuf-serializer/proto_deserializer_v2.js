/**
 * Protocol Buffer byte array deserializer, work without proto definition.
 * @author guanxin
 * @version 2.0
 * @see https://protobuf.dev/programming-guides/encoding/
 */
class ProtobufDecoderV2 {

    constructor(input) {
        this.objStack = [{}];
        this.rangeStack = [[0, input.length]];
        this.indexStack = [0];
        this.input = input;
        this.pos = 0;
    }

    pushField(index, wireTag, value) {
        let currObj = this.objStack[this.objStack.length - 1];
        let fieldKey = '' + index + '/' + tagToType(wireTag, value);
        if (currObj[fieldKey] == null) {
            currObj[fieldKey] = value;
        } else if (Array.isArray(currObj[fieldKey])) {
            currObj[fieldKey].push(value);
        } else {
            currObj[fieldKey] = [currObj[fieldKey], value];
        }
    }
    pushObject(index, start, end) {
        this.objStack.push({});
        this.rangeStack.push([start, end]);
        this.indexStack.push(index);
    }
    popObject() {
        this.objStack.pop();
        this.rangeStack.pop();
        this.indexStack.pop();
    }

    /**
     * 将 PB 类型转换为类型描述 
     * @param {number} tag PB 类型
     * @param {any} data 数据内容, 主要用于区分字符串及对象
     * @returns {string} 类型描述, number, string, object, double, float
     */
    tagToType(tag, data) {
        switch (tag) {
            case 0: return 'number';
            case 1: return 'double';
            case 2: return typeof data == 'string' ? 'string' : 'object';
            case 5: return 'float';
            default: throw ('Unsupported Wire Type ' + tag);
        }
    }


    nextTag() {
        let input = this.input;
        if (this.pos >= input.length) {
            throw ('Decode Tag Input Length Must More Than 0');
        }
    
        let wireTag = input[0] & 0b00000111;
        let fieldIndex = 0 | (input[0] & 0b01111111) >> 3;
        if (input[0] & 0b10000000 == 0) {
            this.pos += 1;
            return [wireTag, fieldIndex];
        }
    
        let bit = 4;
        while ((input[this.pos] & 0b10000000) != 0) {
            this.pos += 1;
    
            let byte = 0 | (input[i] & 0b01111111);
            byte = byte << bit;
            fieldIndex = fieldIndex | byte;
    
            bit += 7;
        }
    
        this.pos += 1;
        return [wireTag, fieldIndex];
    }

    decode(input) {
        let input = new Uint8Array();
        let appendString = false;
        while (this.pos < this.data.length) {
            try {
                if (appendString) {
                    // 下级解析异常, 改为字符串解析
                    
                }    
            } catch (error) {
                
            }
            
            
            let [wireTag, index] = this.nextTag();
            if (index <= 0) {
                throw ('Field Index ' + fieldIndex + ' Less Than 1')
            }


        }
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