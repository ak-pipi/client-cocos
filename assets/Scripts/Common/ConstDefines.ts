// 常量定义

// 游戏类型
export enum GameType {
    // 无效游戏
    Invalid = 0,
    
    // 空游戏
    Dumb = 1,
    
    // 麻将
    Mahjong = 1021,
    
    // 斗地主
    DouDiZhu = 1022,
    
    // 百人牛牛
    NiuNiu100 = 1023,
    
    // 经典牛牛
    NiuNiu = 1024,
    
    // 红黑大战
    RedBlack = 1025,

    // 炸金花
    ZhaJinHua = 1026,

    // 六安比鸡
    LiuAnBiJi = 1027,

    // 逮狗腿
    Lackey = 1028,

    // 拖拉机
    Tractor = 1029,

    // 掼蛋
    GuanDan = 1030,

    // 桃江麻将
    TaoJiangMahjong = 1031,

    // 红中麻将
    HongZhongMahjong = 1032,

    // 跑得快
    PaoDeKuai = 1033,

    // 长沙麻将
    ChangShaMahjong = 1034,

    // 益阳歪胡子
    YiYangWaiHuZi = 1035,

    // 沅江千分
    YuanJiangQianFen = 1036
};

// 游戏场id
export enum DistrictId {
    // 无效游戏场
    Invalid = 0,

    // 逮狗腿新手房
    LackeyBeginner = 1,

    // 逮狗腿初级房
    LackeyModerate = 2,

    // 逮狗腿高级房
    LackeyAdvanced = 3,

    // 逮狗腿顶级房
    LackeyMaster = 4,

    // 掼蛋初级房
    GuanDanBeginner = 5,

    // 掼蛋中级房
    GuanDanModerate = 6,

    // 掼蛋高级房
    GuanDanAdvanced = 7,

    // 掼蛋顶级房
    GuanDanMaster = 8,

    // 桃江麻将初级房
    TaoJiangBeginner = 9,
    // 桃江麻将中级房
    TaoJiangModerate = 10,
    // 桃江麻将高级房
    TaoJiangAdvanced = 11,
    // 桃江麻将顶级房
    TaoJiangMaster = 12,

    // 红中麻将初级房
    HongZhongBeginner = 13,
    // 红中麻将中级房
    HongZhongModerate = 14,
    // 红中麻将高级房
    HongZhongAdvanced = 15,
    // 红中麻将顶级房
    HongZhongMaster = 16,

    // 跑得快初级房
    PaoDeKuaiBeginner = 17,
    // 跑得快中级房
    PaoDeKuaiModerate = 18,
    // 跑得快高级房
    PaoDeKuaiAdvanced = 19,
    // 跑得快顶级房
    PaoDeKuaiMaster = 20,

    // 长沙麻将初级房
    ChangShaBeginner = 21,
    // 长沙麻将中级房
    ChangShaModerate = 22,
    // 长沙麻将高级房
    ChangShaAdvanced = 23,
    // 长沙麻将顶级房
    ChangShaMaster = 24,

    // 沅江千分初级房
    YuanJiangQianFenBeginner = 25,
    // 沅江千分中级房
    YuanJiangQianFenModerate = 26,
    // 沅江千分高级房
    YuanJiangQianFenAdvanced = 27,
    // 沅江千分顶级房
    YuanJiangQianFenMaster = 28,

    // 益阳歪胡子初级房
    YiYangWaiHuZiBeginner = 29,
    // 益阳歪胡子中级房
    YiYangWaiHuZiModerate = 30,
    // 益阳歪胡子高级房
    YiYangWaiHuZiAdvanced = 31,
    // 益阳歪胡子顶级房
    YiYangWaiHuZiMaster = 32
};

// 网络连接状态
export enum ConnectionState {
    // 未连接
    Disconnect,

    // 正在连接
    Connecting,

    // 已连接
    Connected
};

export enum EnterVenueState {
    // 已离开
    Leaved,

    // 正在进入
    Entering,

    // 已进入
    Entered
};

// 扑克牌点
export enum PokerPoint {
    Invalid = 0,
    Ace = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
    Six = 6,
    Seven = 7,
    Eight = 8,
    Nine = 9,
    Ten = 10,
    Jack = 11,
    Queen = 12,
    King = 13,
    Joker = 14
};

// 扑克花色
export enum PokerSuit {
    Invalid = 0,
    Diamond = 1,
    Club = 2,
    Heart = 3,
    Spade = 4,
    Little = 5,
    Big = 6
};

// 出牌失败原因
export enum PlayCardFailed {
    // 未知错误
    Unknown = 0,   
    
    // 新一轮出牌不能“不要”
    CanNotPass = 1,

    // 找不到指定的牌
    NotFound = 2,

    // 无效牌型
    Invalid = 3,

    // 要不起
    CanNotPlay = 4
};

// 歪胡子操作类型
export enum WaiHuZiAction {
    // 无
    None = 0,
    // 吃
    Chi = 1,
    // 碰
    Peng = 2,
    // 偎
    Wei = 3,
    // 跑
    Pao = 4,
    // 提
    Ti = 5,
    // 胡
    Hu = 6,
    // 过
    Pass = 7,
    // 出牌
    Discard = 8
};

// 歪胡子字牌点数
export enum WaiHuZiPoint {
    Invalid = 0,
    // 小字: 一到十
    Yi = 1, Er = 2, San = 3, Si = 4, Wu = 5, Liu = 6, Qi = 7, Ba = 8, Jiu = 9, Shi = 10,
    // 大字: 壹到拾
    DaYi = 11, DaEr = 12, DaSan = 13, DaSi = 14, DaWu = 15, DaLiu = 16, DaQi = 17, DaBa = 18, DaJiu = 19, DaShi = 20
};
