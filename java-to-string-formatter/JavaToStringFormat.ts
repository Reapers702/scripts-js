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

let javaStr = 'OrderServiceInfo(icon=http://oss.umetrip.com/fs/train/static/799,2e15f002a33184d2, serviceName=优享预订, price=16, serviceInstructionList=[ServiceInstruction(formValueList=[FormValue(color=#B57E47, desc=免登12306, icon=https://oss.umetrip.com/fs/train/static/1944,43cffcfd72d19d1d), FormValue(color=#B57E47, desc=7X24⼩时预订, icon=https://oss.umetrip.com/fs/train/static/1944,43cffcfd72d19d1d)]), ServiceInstruction(formValueList=[FormValue(color=#B57E47, desc=购票享六大权益, icon=https://oss.umetrip.com/fs/train/static/1944,43cffcfd72d19d1d)])], shortDesc=优享预订服务费, priceDetailTitle=优享预订服务费, checkTip=您选择的优享预订服务⽀持⼀次在线代为退票/改签服务, displayPrice=￥16, issueServiceId=8, orderDetailServiceDesc=ImageBannerInfo(imageUrl=http://oss.umetrip.com/fs/train/static/912,309ac4362c763ac5, text=优享预订-支持一次在线退票或改签服务, color=#333333), source=MEISHU, canSaleMark=true, loginOfficial=false, loginOfficialUrl=null, grabFlag=false, buttonText=购买, issueServiceDesc=[ColoredText(color=#000000, text=优享预订, weight=600)], windowWarnDialog=null, lineUpFlag=false, umeRecommendTag=https://oss.umetrip.com/fs/train/static/2043,3f8fd0b1c591f087, frontendStyleType=false, subServiceBlock=SubServiceBlock(bgImage=http://oss.umetrip.com/fs/train/static/2057,439fc10fc0dec56e, titleImage=http://oss.umetrip.com/fs/train/static/2788,4560df27e6cacb0b, subServiceInfoList=[SubServiceInfo(serviceImage=https://oss.umetrip.com/fs/train/static/2474,439fb2cb8561e7c5, leftTopIcon=http://oss.umetrip.com/fs/train/static/2187,439f966a53b8f264, serviceTitle=免登录, serviceSubTitle=无需登录，极速购票, detailDescList=[SubServiceDetailDesc(titleImage=null, content=[无需登陆12306账号，订票更高效；, 专人购票更安心；]), SubServiceDetailDesc(titleImage=https://oss.umetrip.com/fs/train/static/2017,439fc2838c8e39a8, content=[券不可累加，不可找零，不能兑换现金。, 对于以不正当获取权益包的用户，包括但不限于恶意套现、恶意下单、利用程序漏洞等，航旅纵横有权在不事先通知的情况下取消其权益包获取资格。, 解释权归航旅纵横所有，如有问题可在【首页】-【更多服务】-【我的客服】输入框中输入"客服"，点击【问题留言】，将问题描述等信息提交，我们将第一时间处理您的问题。])]), SubServiceInfo(serviceImage=http://oss.umetrip.com/fs/train/static/1785,439fb2cde0103585, leftTopIcon=http://oss.umetrip.com/fs/train/static/2406,439f966bf46020ea, serviceTitle=7X24小时预订, serviceSubTitle=随时预订，专人出票, detailDescList=[SubServiceDetailDesc(titleImage=null, content=[7X24小时，随时预订，快速出票；, 出行更方便，旅行更随心；]), SubServiceDetailDesc(titleImage=https://oss.umetrip.com/fs/train/static/2017,439fc2838c8e39a8, content=[券不可累加，不可找零，不能兑换现金。, 对于以不正当获取权益包的用户，包括但不限于恶意套现、恶意下单、利用程序漏洞等，航旅纵横有权在不事先通知的情况下取消其权益包获取资格。, 解释权归航旅纵横所有，如有问题可在【首页】-【更多服务】-【我的客服】输入框中输入"客服"，点击【问题留言】，将问题描述等信息提交，我们将第一时间处理您的问题。])]), SubServiceInfo(serviceImage=http://oss.umetrip.com/fs/train/static/2436,439fb2ca191b09c8, leftTopIcon=http://oss.umetrip.com/fs/train/static/2452,439f96d8fc9517a2, serviceTitle=专人退改, serviceSubTitle=退改保障，享受一次专人跑腿退票或改签, detailDescList=[SubServiceDetailDesc(titleImage=null, content=[退改保障，享受一次专人跑腿退票或改签；]), SubServiceDetailDesc(titleImage=https://oss.umetrip.com/fs/train/static/2017,439fc2838c8e39a8, content=[券不可累加，不可找零，不能兑换现金。, 对于以不正当获取权益包的用户，包括但不限于恶意套现、恶意下单、利用程序漏洞等，航旅纵横有权在不事先通知的情况下取消其权益包获取资格。, 解释权归航旅纵横所有，如有问题可在【首页】-【更多服务】-【我的客服】输入框中输入"客服"，点击【问题留言】，将问题描述等信息提交，我们将第一时间处理您的问题。])]), SubServiceInfo(serviceImage=http://oss.umetrip.com/fs/train/static/2353,439fb36635ca7012, leftTopIcon=http://oss.umetrip.com/fs/train/static/1887,439f96daa3d77e8d, serviceTitle=接送车, serviceSubTitle=延误免费等 误机必赔偿, detailDescList=[SubServiceDetailDesc(titleImage=null, content=[获得接送车10元无门槛优惠券；, 仅航旅纵横APP内接送车订单可用；, 有效期7天；]), SubServiceDetailDesc(titleImage=https://oss.umetrip.com/fs/train/static/2017,439fc2838c8e39a8, content=[券不可累加，不可找零，不能兑换现金。, 对于以不正当获取权益包的用户，包括但不限于恶意套现、恶意下单、利用程序漏洞等，航旅纵横有权在不事先通知的情况下取消其权益包获取资格。, 解释权归航旅纵横所有，如有问题可在【首页】-【更多服务】-【我的客服】输入框中输入"客服"，点击【问题留言】，将问题描述等信息提交，我们将第一时间处理您的问题。])]), SubServiceInfo(serviceImage=http://oss.umetrip.com/fs/train/static/2650,439fb368a475de8d, leftTopIcon=http://oss.umetrip.com/fs/train/static/2215,439f96d99eee59c9, serviceTitle=酒店, serviceSubTitle=航旅订酒店 享特惠礼包, detailDescList=[SubServiceDetailDesc(titleImage=null, content=[获得酒店预定95折折扣券；, 仅航旅纵横APP内酒店订单可用；, 有效期7天；]), SubServiceDetailDesc(titleImage=https://oss.umetrip.com/fs/train/static/2017,439fc2838c8e39a8, content=[券不可累加，不可找零，不能兑换现金。, 对于以不正当获取权益包的用户，包括但不限于恶意套现、恶意下单、利用程序漏洞等，航旅纵横有权在不事先通知的情况下取消其权益包获取资格。, 解释权归航旅纵横所有，如有问题可在【首页】-【更多服务】-【我的客服】输入框中输入"客服"，点击【问题留言】，将问题描述等信息提交，我们将第一时间处理您的问题。])]), SubServiceInfo(serviceImage=http://oss.umetrip.com/fs/train/static/1829,439fb367588c34fd, leftTopIcon=http://oss.umetrip.com/fs/train/static/1833,439f96db725a5293, serviceTitle=会员, serviceSubTitle=出行体验全方位升级, detailDescList=[SubServiceDetailDesc(titleImage=null, content=[航旅纵横plus会员¥10优惠券；, 在航旅纵横APP内开通任意版本的PLUS会员可用；, 有效期7天；]), SubServiceDetailDesc(titleImage=https://oss.umetrip.com/fs/train/static/2017,439fc2838c8e39a8, content=[券不可累加，不可找零，不能兑换现金。, 对于以不正当获取权益包的用户，包括但不限于恶意套现、恶意下单、利用程序漏洞等，航旅纵横有权在不事先通知的情况下取消其权益包获取资格。, 解释权归航旅纵横所有，如有问题可在【首页】-【更多服务】-【我的客服】输入框中输入"客服"，点击【问题留言】，将问题描述等信息提交，我们将第一时间处理您的问题。])])]), serviceTagDesc=(赠免登录12306), serviceTagIcon=http://oss.umetrip.com/fs/train/static/2026,4469cd591a4e98f0)';
let formatter = new LombokToStringDeser(javaStr);
formatter.tokenize();
console.log(JSON.stringify(formatter.tokens));

let o = formatter.toJson();
console.log(JSON.stringify(o, null, 4));