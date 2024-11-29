const { spawn } = require('child_process');
const path = require('path');

class WeChatService {
  constructor(config) {
    const wechatConfig = config.notification?.wechat;
    if (!wechatConfig?.enabled) {
      return;
    }

    this.enabled = true;
    this.receiverName = wechatConfig.receiverName;
    this.pythonPath = process.env.VIRTUAL_ENV 
      ? path.join(process.env.VIRTUAL_ENV, 'bin', 'python3')
      : 'python3';
    this.scriptPath = path.join(__dirname, '..', 'wx_notifier.py');
  }

  // 发送消息
  async _sendMessage(msgType, content) {
    if (!this.enabled) return false;

    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, [
        this.scriptPath,
        this.receiverName,
        msgType,
        JSON.stringify(content)
      ]);

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('微信发送错误:', data.toString());
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(errorOutput || '发送消息失败'));
        }
      });
    });
  }

  // 测试连接
  async test() {
    if (!this.enabled) {
      throw new Error('微信通知未启用');
    }

    try {
      await this._sendMessage('test', '🤖 交易机器人通知测试');
      return true;
    } catch (error) {
      throw new Error(`微信连接测试失败: ${error.message}`);
    }
  }

  // 发送系统消息
  async sendSystemMessage(type, message) {
    const emoji = {
      'SUCCESS': '✅',
      'ERROR': '❌',
      'WARNING': '⚠️',
      'INFO': 'ℹ️'
    }[type] || 'ℹ️';

    return this._sendMessage('system', 
      `${emoji} ${type}\n\n${message}\n\n时间: ${new Date().toLocaleString()}`
    );
  }

  // 发送交易消息
  async sendTradeMessage(data) {
    const message = this._formatTradeMessage(data);
    return this._sendMessage('trade', message);
  }

  // 发送价格警报
  async sendPriceAlert(symbol, price, message) {
    return this._sendMessage('alert',
      `⚠️ 价格警报\n\n` +
      `币对: ${symbol}\n` +
      `价格: ${price} USDT\n` +
      `说明: ${message}\n\n` +
      `时间: ${new Date().toLocaleString()}`
    );
  }

  // 格式化交易消息
  _formatTradeMessage(data) {
    let emoji, content;
    
    switch (data.type) {
      case 'ADD_POSITION':
        emoji = '🔵';
        content = `加仓通知\n\n` +
                 `币对: ${data.symbol}\n` +
                 `数量: ${data.quantity}\n` +
                 `金额: ${data.amount} USDT\n` +
                 `价格: ${data.price} USDT\n` +
                 `次数: ${data.addPositionCount}`;
        break;

      case 'CLOSE_POSITION':
        emoji = '🔴';
        content = `平仓通知\n\n` +
                 `币对: ${data.symbol}\n` +
                 `数量: ${data.quantity}\n` +
                 `价格: ${data.price} USDT\n` +
                 `盈亏: ${data.profit} USDT (${data.profitPercentage}%)`;
        break;

      case 'PROFIT_UPDATE':
        emoji = '💰';
        content = `盈亏更新\n\n` +
                 `币对: ${data.symbol}\n` +
                 `当前价格: ${data.currentPrice} USDT\n` +
                 `开仓均价: ${data.entryPrice} USDT\n` +
                 `未实现盈亏: ${data.profit} USDT (${data.profitPercentage}%)`;
        break;

      default:
        emoji = '📊';
        content = `${data.type}\n\n` +
                 `币对: ${data.symbol}\n` +
                 Object.entries(data)
                   .filter(([key]) => !['type', 'symbol'].includes(key))
                   .map(([key, value]) => `${key}: ${value}`)
                   .join('\n');
    }

    return `${emoji} ${content}\n\n时间: ${new Date().toLocaleString()}`;
  }
}

module.exports = WeChatService;