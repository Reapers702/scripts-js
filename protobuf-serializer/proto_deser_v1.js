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
        default: return null;
    }
}

class Range {
    constructor(left, right) {
        this.left = left;
        this.right = right;
    }
}

class ProtobufDecoderV1 {

    /**
     * 构造方法
     * @param {Uint8Array} data 待解析数据
     */
    constructor(data) {
        this.data = data;
        this.exception = null;
        this.objStack = [{}];
        this.objIdxStack = [];
        this.offsetRangeStack = [new Range(0, data.length)];
    }

    lastObj = () => this.objStack.length != 0 ? this.objStack[this.objStack.length - 1] : null;
    lastRange = () => this.offsetRangeStack.length != 0 ? this.offsetRangeStack[this.offsetRangeStack.length - 1] : null;
    popRange = () => this.offsetRangeStack.pop();
    pushEx = (exception) => this.exception = exception;
    popEx = () => {
        let ex = this.exception;
        this.exception = null;
        return ex;
    }
    throwEx = () => this.exception != null;

    decode() {
        let currOffset = this.lastRange().left;
        let currEnd = this.lastRange().right;
        while (currOffset < currEnd) {
            let ex = this.popEx();
            if (ex != null) {
                let offsetRange = this.popRange();
                this.objStack.pop();
                let [val, offset] = this.decodeString(this.data, offsetRange.left, offsetRange.right - offsetRange.left);
                if (this.throwEx()) {
                    this.offsetRangeStack.pop();
                    this.objStack.pop();
                    this.objIdxStack.pop();
                    continue;
                } else {
                    let fieldKey = '' + this.objIdxStack.pop() + '/' + tagToType(2, val);
                    let result = this.lastObj();
                    if (result[fieldKey] == null) {
                        result[fieldKey] = val;
                    } else if (Array.isArray(result[fieldKey])) {
                        result[fieldKey].push(val);
                    } else {
                        result[fieldKey] = [result[fieldKey], val];
                    }
                    currOffset = offset;
                    continue;
                }
            }

            if (currOffset >= this.lastRange().right) {
                this.popRange();
                let val = this.objStack.pop();
                let fieldKey = '' + this.objIdxStack.pop() + '/' + tagToType(2, val);
                let result = this.lastObj();
                if (result[fieldKey] == null) {
                    result[fieldKey] = val;
                } else if (Array.isArray(result[fieldKey])) {
                    result[fieldKey].push(val);
                } else {
                    result[fieldKey] = [result[fieldKey], val];
                }
                continue;
            }

            let {wireTag, index, offset} = this.decodeTag(this.data, currOffset);
            if (this.throwEx()) {
                continue;
            }

            currOffset = offset;
            let currVal = null;

            if (wireTag == 0) {
                // varint
                let [val, offset] = this.decodeVarint(this.data, currOffset);
                if (this.throwEx()) {
                    continue;
                }
                currOffset = offset;
                currVal = val;
            } else if (wireTag == 2) {
                // string or object
                let [objLen, offset] = this.decodeVarint(this.data, currOffset);
                if (this.throwEx() || objLen > this.lastRange().right - currOffset) {
                    continue;
                }
                currOffset = offset;
                if (objLen == 0) {
                    // zero length, parse as empty string
                    currVal = '';
                } else {
                    this.offsetRangeStack.push(new Range(currOffset, currOffset + objLen));
                    this.objStack.push({});
                    this.objIdxStack.push(index);
                    continue;
                }
            } else if (wireTag == 1) {
                // 64 bit floating number
                let [val, offset] = this.decodeDouble(this.data, currOffset);
                if (this.throwEx()) {
                    continue;
                }
                currOffset = offset;
                currVal = val;
            } else if (wireTag == 5) {
                // 32 bit floating number
                let [val, offset] = this.decodeFloat(this.data, currOffset);
                if (this.throwEx()) {
                    continue;
                }
                currOffset = offset;
                currVal = val;
            } else {
                this.pushEx('only support wire type [0, 1, 2, 5], [3, 4] group field has been deprecated, current wire type is ' + wireTag + ", fieldIndex is " + index);
                continue;
            }

            let fieldKey = '' + index + '/' + tagToType(wireTag, currVal);
            let result = this.lastObj();
            if (result[fieldKey] == null) {
                result[fieldKey] = currVal;
            } else if (Array.isArray(result[fieldKey])) {
                result[fieldKey].push(currVal);
            } else {
                result[fieldKey] = [result[fieldKey], currVal];
            }
        }
        return this.lastObj();
    }

    decodeTag(input, offset) {
        if (input.length == 0) {
            this.pushEx('Decode Tag Input Length Must More Than 0');
            return [null, null, null];
        }
    
        let wireTag = input[offset] & 0b00000111;
        if (tagToType(wireTag) == null) {
            this.pushEx('wireTag ' + wireTag + ' not supported');
            return [null, null, null];
        }

        if ((input[offset] & 0b10000000) == 0) {
            return {
                "wireTag": wireTag,
                "index": (input[offset] & 0b01111111) >> 3,
                "offset": offset + 1,
            };
        }
    
        let fieldIndex = (input[offset] & 0b01111111) >> 3;
        let bit = 4;
        offset = offset + 1;
        do {
            let byte = input[offset] & 0b01111111;
            fieldIndex = fieldIndex | (byte << bit);
            bit += 7;
            offset += 1;
        } while (offset >= input.length || (input[offset] & 0b10000000) != 0);
        
        return {
            "wireTag": wireTag,
            "index": fieldIndex,
            "offset": offset,
        };
    }

    decodeVarint(input, offset) {
        if (input.length == 0) {
            this.pushEx('Decode Varint Input Length Must More Than 0');
            return [null, offset];
        }
    
        try {
            let i = offset - 1, numStr = '';
            do {
                i++;
                if (i >= this.lastRange().right) {
                    this.pushEx('Decode To Index Border');
                    return [null, offset];
                }
        
                let byte = input[i] & 0b01111111;
                numStr = byte.toString(2).padStart(7, '0') + numStr;
            } while ((input[i] & 0b10000000) != 0);
        
            let bigint = BigInt.asIntN(64, '0b' + numStr)
            let result = (bigint >= Number.MIN_SAFE_INTEGER && bigint <= Number.MAX_SAFE_INTEGER) ? Number(bigint) : bigint.toString();
            return [result, i + 1];
        } catch (error) {
            this.pushEx('Decode Varint Exception');
            return [null, offset];
        }
    }
    
    /**
     * UTF8 字节流转字符串，参考 https://stackoverflow.com/questions/17191945/conversion-between-utf-8-arraybuffer-and-string
     * @param {data} Uint8Array UTF8 字节流
     * @param {offset} number 起始字节数
     * @param {length} number 字符串长度
     * @returns {string} 字符串
     */
    decodeString(data, offset, length) {
        try {
            var encodedString = String.fromCharCode.apply(null, data.slice(offset, offset + length)),
                decodedString = decodeURIComponent(escape(encodedString));
            return [decodedString, offset + length];
        } catch (error) {
            this.pushEx('decode string exception');
            return [null, offset + length];
        }
    }

    decodeDouble(input, offset) {
        if (this.lastRange().right - offset < 8) {
            this.pushEx('I64 Buffer Length ' + input.length + ', Less Than 8');
            return [null, offset + 8];
        }
        let buffer = new ArrayBuffer(64);
        let view = new DataView(buffer);
        for (let i = 0; i < 8; i++) {
            view.setUint8(i, input[offset + i]);
        }
        try {
            let result = Number(view.getFloat64(0, true).toFixed(5));
            return [result, offset + 8];    
        } catch (error) {
            this.pushEx('Parse Float 64 Exception');
            return [null, offset + 8];    
        }
    }

    decodeFloat(input, offset) {
        if (this.lastRange().right - offset < 4) {
            this.pushEx('I32 Buffer Length ' + input.length + ', Less Than 4');
            return [null, offset + 4];
        }
        let buffer = new ArrayBuffer(4);
        let view = new DataView(buffer);
        for (let i = 0; i < 4; i++) {
            view.setUint8(i, input[offset + i]);
        }
        try {
            let result = Number(view.getFloat32(0, true).toFixed(5));
            return [result, offset + 4];    
        } catch (error) {
            this.pushEx('Parse Float 32 Exception');
            return [result, offset + 4];
        }
    }
    
}


function base64ToArrayBuffer(base64) {
    var binaryString = atob(base64);
    var bytes = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// let base64 = 'CgtIZWxsbyBXb3JsZBIPCGQQoJwBGgdHdWFuWGluGR+F61G4HglA';
// let u8a = base64ToArrayBuffer(base64);
let u8a = new Uint8Array([10,0,16,1,26,0,34,24,50,48,50,52,45,48,56,45,49,53,32,49,51,58,48,56,58,53,57,32,56,48,48,48,42,7,49,48,48,48,48,49,53,58,144,2,10,137,2,10,36,117,109,101,95,50,57,55,57,100,97,48,101,51,50,102,57,52,50,100,53,97,101,48,98,51,102,48,101,55,56,54,97,101,98,98,52,18,9,231,129,171,232,189,166,231,165,168,26,11,116,114,97,105,110,84,105,99,107,101,116,34,32,52,50,57,52,99,55,54,97,102,100,99,48,102,49,54,57,98,49,102,100,57,48,54,50,53,101,101,53,99,100,100,100,42,57,104,116,116,112,58,47,47,103,114,97,121,46,117,109,101,116,114,105,112,46,99,111,109,47,119,101,101,120,47,116,114,97,105,110,84,105,99,107,101,116,47,116,114,97,105,110,84,105,99,107,101,116,46,119,117,109,101,50,0,56,0,72,154,79,82,12,231,167,187,229,138,168,231,167,145,230,138,128,90,15,231,129,171,232,189,166,231,165,168,233,148,128,229,148,174,96,168,175,180,128,5,106,5,55,46,53,46,57,114,57,104,116,116,112,58,47,47,103,114,97,121,46,117,109,101,116,114,105,112,46,99,111,109,47,119,101,101,120,47,116,114,97,105,110,84,105,99,107,101,116,47,116,114,97,105,110,84,105,99,107,101,116,46,104,117,109,101,16,0,32,0]);
let obj = new ProtobufDecoderV1(u8a).decode();
console.log(JSON.stringify(obj, '', 4));