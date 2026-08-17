// 登录和注册界面
// Author wujian
// Email 393817707@qq.com
// Date 2025.10.22

import { _decorator, Component, EditBox, Node, sys, Toggle, AudioClip } from 'cc';
import { ResourceLoader } from '../Manager/ResourceLoader';
import { AesUtils } from '../Utils/AesUtils';
import { CommonUtils } from '../Utils/CommonUtils';
import { Client } from './Client';
import { GameManager } from '../Manager/GameManager';
const { ccclass, property } = _decorator;

@ccclass('Login')
export class Login extends Component {
    @property({ type: EditBox })
    private editName: EditBox = null;
        
    @property({ type: EditBox })
    private editPassword: EditBox = null;

    @property({ type: EditBox })
    private editNicknameReg: EditBox = null;

    @property({ type: EditBox })
    private editNameReg: EditBox = null;
        
    @property({ type: EditBox })
    private editPasswordReg1: EditBox = null;

    @property({ type: EditBox })
    private editPasswordReg2: EditBox = null;

    @property({ type: Toggle })
    private toggleMale: Toggle = null;

    @property({ type: Toggle })
    private toggleFemale: Toggle = null;

    @property({ type: Node })
    private loginGroup: Node = null;

    @property({ type: Node })
    private registerGroup: Node = null;

    private sex: number = 1;

    private loginSubmitting: boolean = false;

    start() {
        let text = sys.localStorage.getItem('userData');
        let userData = null;
        if (text) {
            text = AesUtils.decrypt2(text);
            userData = JSON.parse(text);
        }
        if (userData) {
            this.editName.string = userData.username;
            this.editPassword.string = userData.password;
            // 先校验 token，通过后再写入 GameManager，避免过期 token 触发心跳弹窗
            this.getPlayerInfo(userData.token);
        }
        this.playBackgroundMusic();
    }

    update(deltaTime: number) { }
    
    public playBackgroundMusic() {
        ResourceLoader.Instance.loadAsset("Login", "bg_login", AudioClip, (clip: AudioClip) => {
            Client.Instance.playBackgroundMusic(clip);
        });
    }
    
    public onLoginClicked() {
        if (this.loginSubmitting) {
            Client.Instance.showPromptTip("正在登录，请稍候");
            return;
        }
        const username = this.editName.string.trim();
        const password = this.editPassword.string;
        if (CommonUtils.isStringEmpty(username)) {
            Client.Instance.showPromptTip("请输入登录用户名");
            //Client.Instance.showPromptDialog("请输入登录用户名");
            return;
        }
        if (CommonUtils.isStringEmpty(password)) {
            Client.Instance.showPromptTip("请输入密码");
            return;
        }
        let data = {
            name: AesUtils.encrypt1(username),
            password: AesUtils.encrypt1(password)
        };
        this.loginSubmitting = true;
        GameManager.Instance.post("/player/login", data).then((dto) => {
            if (dto.code === '00000000') {
                GameManager.Instance.Token = dto.token;
                let userData = {
                    username: username,
                    password: password,
                    token: dto.token
                };
                let text: string = JSON.stringify(userData);
                text = AesUtils.encrypt2(text);
                sys.localStorage.setItem('userData', text);
                this.getPlayerInfo();
            } else {
                const errMsg = this.getLoginErrorMessage(dto);
                console.warn("Login failed: ", dto);
                Client.Instance.showPromptDialog("登录失败：" + errMsg);
            }
        }, (err) => {
            const errMsg = this.getLoginErrorMessage(err);
            console.warn("Login request error: ", err);
            Client.Instance.showPromptDialog("登录失败：" + errMsg);
        }).then(() => {
            this.loginSubmitting = false;
        });
    }

    private getLoginErrorMessage(err: any): string {
        if (!err) return "未知错误";
        if (typeof err === "string") return err;
        const msg = err.msg || err.message;
        if (msg === "Player already logined" || msg === "Player already logged in") {
            return "当前账号仍在线，请稍等几秒后重试，或先退出当前游戏";
        }
        return msg || "未知错误";
    }
    
    public onRegisterClicked1() {
        this.loginGroup.active = false;
        this.registerGroup.active = true;
    }

    public onRegisterClicked2() {
        if (CommonUtils.isStringEmpty(this.editNicknameReg.string)) {
            Client.Instance.showPromptTip("请输入昵称");
            return;
        }
        if (!CommonUtils.isUsernameValid(this.editNameReg.string)) {
            Client.Instance.showPromptTip("请输入合法用户名，用户名只能包含英文字母、数字、\"_\"及\"-\"，且长度至少为6个字符", 3);
            return;
        }
        if (CommonUtils.isStringEmpty(this.editPasswordReg1.string)) {
            Client.Instance.showPromptTip("请输入密码");
            return;
        }
        let errMsg: string = CommonUtils.isPasswordValid(this.editPasswordReg1.string);
        if (!CommonUtils.isStringEmpty(errMsg)) {
            Client.Instance.showPromptTip(errMsg);
            return;
        }
        let data: any = {
            nickname: this.editNicknameReg.string,
            name: AesUtils.encrypt1(this.editNameReg.string),
            password: AesUtils.encrypt1(this.editPasswordReg1.string),
            sex: this.sex
        };
        GameManager.Instance.post("/player/register", data).then((dto) => {
            if (dto.code === '00000000') {
                GameManager.Instance.Token = dto.token;
                Client.Instance.showPromptTip("注册成功");
                this.editName.string = this.editNameReg.string;
                this.editPassword.string = this.editPasswordReg1.string;
                this.onBackClicked();
            } else {
                Client.Instance.showPromptDialog("注册失败：" + dto.msg);
            }
        }).catch((err) => {
            console.log("Register error: ", err);
            Client.Instance.showPromptDialog("注册失败：" + err.toString());
        });
    }

    public onBackClicked() {
        this.loginGroup.active = true;
        this.registerGroup.active = false;
    }

    public onMaleToggle(event: Event) {
        if (!this.toggleMale.isChecked) return;
        this.sex = 1;
    }

    public onFemaleToggle(event: Event) {
        if (!this.toggleFemale.isChecked) return;
        this.sex = 2;
    }

    private getPlayerInfo(token?: string) {
        GameManager.Instance.authGet("/player/info", token).then((dto) => {
            let errMsg: string = null;
            if (dto) {
                if (dto.code !== "00000000") {
                    errMsg = dto.msg;
                    if (!errMsg) {
                        errMsg = "unknown error";
                    }
                }
            } else {
                errMsg = "unknown error";
            }
            if (errMsg) {
                sys.localStorage.removeItem('userData');
                console.log("Get player info error: ", errMsg);
                return;
            }
            if (token) {
                GameManager.Instance.Token = token;
            }
            GameManager.Instance.setPlayerInfo(dto);
            Client.Instance.onLoginSucceed();
        }).catch((err) => {
            sys.localStorage.removeItem('userData');
            console.log("Get player info error: ", err);
        });
    }
}
