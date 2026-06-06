// 通用实用工具类
// Author wujian
// Email 393817707@qq.com
// Date 2025.10.24

import * as Base64 from 'js-base64';

export class CommonUtils {
    private static readonly CapitalLetters: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private static readonly LowercaseLetters: string = "abcdefghijklmnopqrstuvwxyz";
    private static readonly Numbers: string = "0123456789";
    private static readonly SpecialLetters: string = "!#$%&()*+,-./";


    public static isStringEmpty(str: string | null | undefined): boolean {
        return !str || str === "";
    }

    public static isUsernameValid(username: string): boolean {
        if (CommonUtils.isStringEmpty(username)) return false;
        if (username.length < 6) return false;
        let lowerA: number = 'a'.codePointAt(0);
        let lowerZ: number = 'z'.codePointAt(0);
        let upperA: number = 'A'.codePointAt(0);
        let upperZ: number = 'Z'.codePointAt(0);
        let zero: number = '0'.codePointAt(0);
        let nine: number = '9'.codePointAt(0);
        for (let i = 0; i < username.length; i++) {
            let charCode: number = username.codePointAt(i);
            if (charCode >= lowerA && charCode <= lowerZ)
                continue;
            if (charCode >= upperA && charCode <= upperZ)
                continue;
            if (charCode >= zero && charCode <= nine)
                continue;
            if (username[i] === '_' || username[i] === '-')
                continue;
            return false;
        }
        return true;
    }

    public static isPasswordValid(password: string): string {
        if (CommonUtils.isStringEmpty(password)) return "密码为空";
        if (password.length < 6) return "密码长度小于6个字符";
        let lowerA = 'a'.charCodeAt(0);
        let lowerZ = 'z'.charCodeAt(0);
        let upperA = 'A'.charCodeAt(0);
        let upperZ = 'Z'.charCodeAt(0);
        let zero = '0'.charCodeAt(0);
        let nine = '9'.charCodeAt(0);
        let specialLetters = {};
        let test1: boolean = false;
        let test2: boolean = false;
        let test3: boolean = false;
        for (let c of CommonUtils.SpecialLetters) {
            specialLetters[c] = true;
        }
        for (let i: number = 0; i < password.length; i++) {
            let charCode = password.charCodeAt(i);
            if ((charCode >= lowerA && charCode <= lowerZ) ||
                (charCode >= upperA && charCode <= upperZ)) {
                test1 = true;
                continue;
            }
            if (charCode >= zero && charCode <= nine) {
                test2 = true;
                continue;
            }
            if (specialLetters[password[i]]) {
                test3 = true;
                continue;
            }
            return "密码包含非法字符";
        }
        let types:number = 0;
        if (test1)
            types++;
        if (test2)
            types++;
        if (test3)
            types++;
        /*if (types < 2) {
            return "密码必须包含字母、数字、特殊符号中的两种";
        }*/
        return null;
    }

    //
    public static readonly CODE_CAPITAL: number = 0x01;

    //
    public static readonly CODE_LOWERCASE: number = 0x02;

    //
    public static readonly CODE_NUMBER: number = 0x04;

    //
    public static readonly CODE_ALL: number = (0x01 | 0x02 | 0x04);

    /**
     * 返回在[min, max)范围内的随机整数
     * @param min 最小值，包含
     * @param max 最大值，不包含
     * @returns 在[min, max)范围内的随机整数
     */
    public static generateRandomInt(min: number, max: number): number | undefined {
        min = Math.floor(min);
        max = Math.floor(max);
        let delta: number = max - min;
        if (delta < 1) return undefined;
        return Math.floor(Math.random() * delta) + min;
    }

    public static generateRandomCode(length: number, codeMask: number = CommonUtils.CODE_ALL): string {
        if (length < 1) {
            return null;
        }
        let types: number = 0;
        let arr: string[] = [];
        if ((codeMask & CommonUtils.CODE_CAPITAL) != 0) {
            arr.push(CommonUtils.CapitalLetters);
            types++;
        }
        if ((codeMask & CommonUtils.CODE_LOWERCASE) != 0) {
            arr.push(CommonUtils.LowercaseLetters);
            types++;
        }
        if ((codeMask & CommonUtils.CODE_NUMBER) != 0) {
            arr.push(CommonUtils.Numbers);
            types++;
        }
        if (types === 0) {
            return null;
        }
        let code: string = "";
        for (let i: number = 0; i < length; i++) {
            let idx1: number = CommonUtils.generateRandomInt(0, types);
            let characters: string = arr[idx1];
            let idx2: number = CommonUtils.generateRandomInt(0, characters.length);
            code += characters.charAt(idx2);
        }
        return code;
    }

    /**
     * 对输入字符串进行MD5编码
     * @param input 输入字符串
     * @param len16 是否为16位长度，否则为32位
     * @param capital 是否返回大写MD5字符串
     * @returns 返回md5字符串
     */
    public static encodeMD5(input: string, len16: boolean = false, capital: boolean = false): string {
        let hash: string = md5(input);
        if (len16) {
            hash = hash.substring(0, 16);
        }
        if (capital) {
            hash = hash.toUpperCase();
        }
        return hash;
    }

    public static encodeBase64(text: string): string {
        if (!text) return null;
        let base64: string = (Base64 as any).Base64.encode(text);
        return base64;
    }

    public static decodeBase64(base64: string): string {
        if (!base64) return null;
        let text: string = (Base64 as any).Base64.decode(base64);
        return text;
    }

    /**
     * 格式化整数到字符串
     * @param num 整数
     * @param digits 位数，不足左边补0
     */
    public static formatInteger(num: number, digits: number | undefined): string {
        let ret = num.toString();
        if (!isNaN(digits)) {
            if (ret.length < digits) {
                let cnt = digits - ret.length;
                for (let i: number = 0; i < cnt; i++) {
                    ret = "0" + ret;
                }
            }
        }
        return ret;
    }
}

// ==================== 纯 JS MD5 实现 ====================
function md5(input: string): string {
    // RFC 1321 MD5 纯 JS 实现
    function safeAdd(x: number, y: number): number {
        const lsw = (x & 0xffff) + (y & 0xffff);
        return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
    }
    function bitRotateLeft(num: number, cnt: number): number {
        return (num << cnt) | (num >>> (32 - cnt));
    }
    function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
        return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
    }
    function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
        return md5cmn((b & c) | (~b & d), a, b, x, s, t);
    }
    function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
        return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
    }
    function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
        return md5cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
        return md5cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    function binlMD5(x: number[], len: number): number[] {
        x[len >> 5] |= 0x80 << (len % 32);
        x[(((len + 64) >>> 9) << 4) + 14] = len;
        let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (let i = 0; i < x.length; i += 16) {
            const oa = a, ob = b, oc = c, od = d;
            a = md5ff(a,b,c,d,x[i],7,-680876936); d = md5ff(d,a,b,c,x[i+1],12,-389564586);
            c = md5ff(c,d,a,b,x[i+2],17,606105819); b = md5ff(b,c,d,a,x[i+3],22,-1044525330);
            a = md5ff(a,b,c,d,x[i+4],7,-176418897); d = md5ff(d,a,b,c,x[i+5],12,1200080426);
            c = md5ff(c,d,a,b,x[i+6],17,-1473231341); b = md5ff(b,c,d,a,x[i+7],22,-45705983);
            a = md5ff(a,b,c,d,x[i+8],7,1770035416); d = md5ff(d,a,b,c,x[i+9],12,-1958414417);
            c = md5ff(c,d,a,b,x[i+10],17,-42063); b = md5ff(b,c,d,a,x[i+11],22,-1990404161);
            a = md5ff(a,b,c,d,x[i+12],7,1804603682); d = md5ff(d,a,b,c,x[i+13],12,-40341101);
            c = md5ff(c,d,a,b,x[i+14],17,-1502002290); b = md5ff(b,c,d,a,x[i+15],22,1236535329);
            a = md5gg(a,b,c,d,x[i+1],5,-165796510); d = md5gg(d,a,b,c,x[i+6],9,-1069501632);
            c = md5gg(c,d,a,b,x[i+11],14,643717713); b = md5gg(b,c,d,a,x[i],20,-373897302);
            a = md5gg(a,b,c,d,x[i+5],5,-701558691); d = md5gg(d,a,b,c,x[i+10],9,38016083);
            c = md5gg(c,d,a,b,x[i+15],14,-660478335); b = md5gg(b,c,d,a,x[i+4],20,-405537848);
            a = md5gg(a,b,c,d,x[i+9],5,568446438); d = md5gg(d,a,b,c,x[i+14],9,-1019803690);
            c = md5gg(c,d,a,b,x[i+3],14,-187363961); b = md5gg(b,c,d,a,x[i+8],20,1163531501);
            a = md5gg(a,b,c,d,x[i+13],5,-1444681467); d = md5gg(d,a,b,c,x[i+2],9,-51403784);
            c = md5gg(c,d,a,b,x[i+7],14,1735328473); b = md5gg(b,c,d,a,x[i+12],20,-1926607734);
            a = md5hh(a,b,c,d,x[i+5],4,-378558); d = md5hh(d,a,b,c,x[i+8],11,-2022574463);
            c = md5hh(c,d,a,b,x[i+11],16,1839030562); b = md5hh(b,c,d,a,x[i+14],23,-35309556);
            a = md5hh(a,b,c,d,x[i+1],4,-1530992060); d = md5hh(d,a,b,c,x[i+4],11,1272893353);
            c = md5hh(c,d,a,b,x[i+7],16,-155497632); b = md5hh(b,c,d,a,x[i+10],23,-1094730640);
            a = md5hh(a,b,c,d,x[i+13],4,681279174); d = md5hh(d,a,b,c,x[i+0],11,-358537222);
            c = md5hh(c,d,a,b,x[i+3],16,-722521979); b = md5hh(b,c,d,a,x[i+6],23,76029189);
            a = md5hh(a,b,c,d,x[i+9],4,-640364487); d = md5hh(d,a,b,c,x[i+12],11,-421815835);
            c = md5hh(c,d,a,b,x[i+15],16,530742520); b = md5hh(b,c,d,a,x[i+2],23,-995338651);
            a = md5ii(a,b,c,d,x[i],6,-198630844); d = md5ii(d,a,b,c,x[i+7],10,1126891415);
            c = md5ii(c,d,a,b,x[i+14],15,-1416354905); b = md5ii(b,c,d,a,x[i+5],21,-57434055);
            a = md5ii(a,b,c,d,x[i+12],6,1700485571); d = md5ii(d,a,b,c,x[i+3],10,-1894986606);
            c = md5ii(c,d,a,b,x[i+10],15,-1051523); b = md5ii(b,c,d,a,x[i+1],21,-2054922799);
            a = md5ii(a,b,c,d,x[i+8],6,1873313359); d = md5ii(d,a,b,c,x[i+15],10,-30611744);
            c = md5ii(c,d,a,b,x[i+6],15,-1560198380); b = md5ii(b,c,d,a,x[i+13],21,1309151649);
            a = md5ii(a,b,c,d,x[i+4],6,-145523070); d = md5ii(d,a,b,c,x[i+11],10,-1120210379);
            c = md5ii(c,d,a,b,x[i+2],15,718787259); b = md5ii(b,c,d,a,x[i+9],21,-343485551);
            a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
        }
        return [a, b, c, d];
    }
    function str2binl(str: string): number[] {
        const bin: number[] = [];
        const mask = (1 << 8) - 1;
        for (let i = 0; i < str.length * 8; i += 8) {
            bin[i >> 5] |= (str.charCodeAt(i / 8) & mask) << (i % 32);
        }
        return bin;
    }
    function binl2hex(binarray: number[]): string {
        const hexTab = '0123456789abcdef';
        let str = '';
        for (let i = 0; i < binarray.length * 4; i++) {
            str += hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf) +
                   hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xf);
        }
        return str;
    }
    // UTF-8 编码
    const utf8 = unescape(encodeURIComponent(input));
    return binl2hex(binlMD5(str2binl(utf8), utf8.length * 8));
}
