enum TOKEN_TYPE {
    CLASS,
    FIELD,
    VALUE,
    OBJ_START,
    OBJ_END,
    LIST_START,
    LIST_END,
}

enum SM_STATE {
    CLASS,
    FIELD,
    VALUE,
    SOME_END,
}

class Token {
    type: TOKEN_TYPE;
    value: string | null;
    constructor(type: TOKEN_TYPE, value: string | null) {
        this.type = type;
        this.value = value;
    }
}

/**
 * Java Lombok 对象 ToString 反序列化类
 * 参考 https://zhuanlan.zhihu.com/p/691104699
 * @author: guanxin
 */
class LombokToStringDeser {

    input: string;
    pos: number = 0;
    tokens: Token[] = [];
    state: SM_STATE | null = SM_STATE.CLASS;

    /**
     * 构造方法
     * @param input 待反序列化字符串
     */
    constructor(input: string) {
        this.input = input;
    }

    next(count: number): string {
        count = Math.min(count, this.input.length - this.pos);
        return this.input.substring(this.pos, this.pos + count);
    }
    move(count: number): void {
        this.pos += count;
    }

    tokenize(): void {
        let containerStack: string[] = ['OBJECT'];
        let currentVal = '';
        let next = '';
        while (this.next(1) != '') {
            switch (this.state) {
                case SM_STATE.CLASS:
                    next = this.next(1);
                    this.move(1);
                    if (next == '(') {
                        this.tokens.push(new Token(TOKEN_TYPE.CLASS, currentVal));
                        this.tokens.push(new Token(TOKEN_TYPE.OBJ_START, null));
                        this.state = SM_STATE.FIELD;
                        currentVal = '';
                        break;
                    }
                    
                    currentVal += next;
                    break;
                case SM_STATE.FIELD:
                    next = this.next(1);
                    this.move(1);
                    if (next == '=') {
                        this.tokens.push(new Token(TOKEN_TYPE.FIELD, currentVal));
                        this.state = SM_STATE.VALUE;
                        currentVal = '';
                        break;
                    }

                    currentVal += next;
                    break;
                case SM_STATE.VALUE:
                    if (currentVal == '' && this.next(1) == '[') {
                        this.move(1);
                        this.tokens.push(new Token(TOKEN_TYPE.LIST_START, null));
                        containerStack.push('ARRAY');
                        break;
                    }

                    if (this.next(1) == '(') {
                        this.tokens.push(new Token(TOKEN_TYPE.CLASS, currentVal));
                        this.tokens.push(new Token(TOKEN_TYPE.OBJ_START, null));
                        this.move(1);
                        this.state = SM_STATE.FIELD;
                        currentVal = '';
                        containerStack.push('OBJECT');
                        break;
                    }

                    next = this.next(2);
                    if (next == ', ' || [', ', ')', ']', '),', '],', '))', ']]', ')]', '])'].indexOf(next) != -1) {
                        this.tokens.push(new Token(TOKEN_TYPE.VALUE, currentVal));
                        this.move(next == ', ' ? next.length : 0);
                        this.state = SM_STATE.SOME_END;
                        currentVal = '';
                        break;
                    }

                    currentVal += this.next(1);
                    this.move(1);
                    break;
                case SM_STATE.SOME_END:
                    while (this.next(1) == ')' || this.next(1) == ']') {
                        next = this.next(1);
                        if (next == ']') {
                            this.tokens.push(new Token(TOKEN_TYPE.LIST_END, null));
                            this.move(1);
                            if (this.next(2) == ', ') {
                                this.move(2);
                            }
                            containerStack.pop();
                        } else if (next == ')') {
                            this.tokens.push(new Token(TOKEN_TYPE.OBJ_END, null));
                            this.move(1);
                            if (this.next(2) == ', ') {
                                this.move(2);
                            }
                            containerStack.pop();
                        }
                    }
                    
                    this.state = containerStack[containerStack.length - 1] == 'OBJECT' ? SM_STATE.FIELD : SM_STATE.VALUE;
                    break;
            }
        }
    }

    toJson(): object{
        let objStack: any[] = [];
        let objCurr: any = null;
        while (this.tokens.length != 0) {
            let token = this.tokens.splice(0, 1)[0];
            if (token.type == TOKEN_TYPE.CLASS) {
                // 移除 OBJ_START 后，新对象入栈
                this.tokens.splice(0, 1);
                objCurr = {};
                objStack.push(objCurr);
                if (Array.isArray(objStack[objStack.length - 2])) {
                    objStack[objStack.length - 2].push(objCurr);
                }
            } else if (token.type == TOKEN_TYPE.OBJ_END) {
                // 旧对象出栈
                if (objStack.length > 1) {
                    objStack.pop();
                    objCurr = objStack[objStack.length - 1];
                }
            } else if (token.type == TOKEN_TYPE.LIST_END) {
                // 旧数组出栈
                objStack.pop();
                objCurr = objStack[objStack.length - 1];
            } else if (token.type == TOKEN_TYPE.FIELD) {
                // 字段类型可能为 String, List, Object
                let valToken = this.tokens.splice(0, 1)[0];
                if (valToken.type == TOKEN_TYPE.VALUE) {
                    objCurr[token.value!] = valToken.value;
                } else if (valToken.type == TOKEN_TYPE.CLASS) {
                    // 移除 OBJ_START，新对象入栈
                    this.tokens.splice(0, 1);
                    let newObj = {};
                    objStack.push(newObj);
                    // 对象赋值
                    objCurr[token.value!] = newObj;
                    objCurr = newObj;
                } else if (valToken.type == TOKEN_TYPE.LIST_START) {
                    // 新数组入栈
                    let newObj = [];
                    objStack.push(newObj);
                    // 对象赋值
                    objCurr[token.value!] = newObj;
                    objCurr = newObj;
                }
            } else if (token.type == TOKEN_TYPE.VALUE) {
                // 直接遇到 VALUE 类型，唯一可能为 List
                if (!Array.isArray(objCurr)) {
                    console.error('Get Value Token When Not in Array');
                    return {};
                }
                objCurr.push(token.value);
            }
        }

        return objCurr;
    }

    format(): object {
        this.tokenize();
        return this.toJson();
    }
}

let javaStr = 'CustomData(l=9223372036854775807, i=100, s=HelloHello, c=null, ss=[Hello, World], innerData=[CustomData.InnerCustomData(str=Hello, number=100), CustomData.InnerCustomData(str=World, number=200)])';
let formatter = new LombokToStringDeser(javaStr);
formatter.tokenize();
console.log(JSON.stringify(formatter.tokens));

let o = formatter.toJson();
console.log(JSON.stringify(o, null, 4));