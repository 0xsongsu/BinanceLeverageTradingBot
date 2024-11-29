# Binance Leverage Trading Bot 🤖

一个支持多币种监控、智能加仓和风险控制的币安全仓杠杆交易机器人。

## ✨ 核心功能

### 🎯 交易策略
- **加仓策略**
  - 价格上涨触发自动加仓
  - 基于盈利比例计算加仓金额
  - 双重价格确认机制
  - 灵活的加仓限制条件

- **止盈策略**
  - 策略A: 增量止盈 - 达到最大加仓次数后，每涨1%卖出2%仓位
  - 策略B: 多级止盈 - 根据总盈利设置多个止盈等级，分批获利了结

- **风险控制**
  - 实时风险率监控
  - 持仓价值限制
  - 加仓间隔控制
  - 自动风险预警

### 🛠️ 辅助功能
- **实时通知**
  - Telegram通知
  - 加仓/止盈提醒
  - 风险预警
  - 持仓状态更新

- **完整日志**
  - 交易记录
  - 持仓变动
  - 系统状态

## 🚀 快速开始

### 1. 安装
```bash
git clone <repository-url>
cd binance-leverage-trading-bot
npm install
pip install -r requirements.txt  # 如需微信通知
```

### 2. 配置
```bash
cp config.example.json config/config.json
```
编辑config/config.json配置文件，下面有配置说明

### 3. 启动
```bash
npm start
```

## ⚙️ 配置说明

```json
{
  "apiKey": "币安API Key",
  "apiSecret": "币安API Secret",
  "trading": {
    "scanning": {
      "positionInterval": 30000,      // 持仓扫描间隔(ms)
      "minPositionValue": 100,        // 最小持仓价值(USDT)
      "excludedPairs": ["BTCUSDT"]    // 排除的币对
    },
    "strategy": {
      "addPositionPricePercent": 1,   // 加仓涨幅(%)
      "addPositionProfitRatio": 0.15, // 加仓利润比例，0.15为利润的15%
      "maxAddPositionTimes": 100,     // 最大加仓次数
      "minAddPositionAmount": 10      // 最小加仓金额，不能比10低
    },
    "takeProfitStrategy": {
      "enabled": true,                // true为启用止盈，false为不启用
      "strategyType": "A",           // 策略类型：A或B
      "strategies": {
        "incrementalTakeProfit": {    // 策略A配置
          "priceIncrementPercent": 1,
          "sellPositionPercent": 2
        },
        "totalProfitTakeProfit": {    // 策略B配置
          "levels": [
            {
              "profitPercent": 100,     //涨幅100%
              "sellPositionPercent": 20 // 卖出20%
            },
            {
              "profitPercent": 150, //同上
              "sellPositionPercent": 30 //同上
            }
          ]
        }
      }
    }
  }
}
```

## 📱 设置通知

### Telegram配置
1. 创建机器人：
   - 联系 @BotFather
   - 发送 /newbot
   - 保存获取的token

2. 获取Chat ID：
   - 向机器人发送 /start
   - 访问：`https://api.telegram.org/bot<YourToken>/getUpdates`
   - 复制返回的chat.id

## ⚠️ 注意事项

### API权限设置
- 仅开启现货和杠杆交易权限
- 禁用提现功能
- 限制IP
- 使用独立的交易账户

### 加仓条件
- 价格达到设定涨幅
- 持仓处于盈利状态
- 符合时间间隔要求
- 未超过最大次数限制

### 风险控制
- 全局风险率监控
- 价值和时间限制
- 自动暂停机制

## 🔒 安全建议
1. 使用专用的交易账户
2. 定期检查日志和通知
3. 合理设置风险参数
4. 安全保管API密钥

## 🛟 支持
如有问题，请通过以下方式获取帮助：
- 提交Issue

## ⚖️ 免责声明
本项目仅供学习交流，作者不承担使用过程中的任何风险和损失。交易有风险，投资需谨慎。