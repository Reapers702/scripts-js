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
