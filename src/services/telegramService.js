const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

class TelegramService {
  constructor(config) {
    const telegramConfig = config.notification?.telegram;
    if (!telegramConfig?.enabled) {
      return;
    }

    // 使用与主程序相同的代理设置
    const proxyUrl = 'http://127.0.0.1:7897';
    this.proxyAgent = new HttpsProxyAgent(proxyUrl);

    this.enabled = true;
    this.token = telegramConfig.botToken;
    this.chatId = telegramConfig.chatId;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;

    // 创建带代理的axios实例
    this.axios = axios.create({
      timeout: 10000,  // 增加超时时间到10秒
      httpsAgent: this.proxyAgent,
      proxy: false     // 禁用axios的默认代理
    });

    // 添加重试机制
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2秒后重试
  }

  // 发送消息（带重试机制）
  async sendMessage(message) {
    if (!this.enabled) return false;

    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const url = `${this.baseUrl}/sendMessage`;
        const response = await this.axios.post(url, {
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });

        return response.data;
      } catch (error) {
        retries++;
        if (retries === this.maxRetries) {
          console.error('Telegram发送消息失败:', error.message);
          if (error.response?.data) {
            console.error('Telegram API错误:', error.response.data);
          }
          throw error;
        }
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
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

    return this.sendMessage(`${emoji} <b>${type}</b>\n\n${message}\n\n🕒 ${new Date().toLocaleString()}`);
  }

  // 发送交易消息
  async sendTradeMessage(data) {
    let message = '';
    switch (data.type) {
      case 'ADD_POSITION':
        message = this._formatAddPositionMessage(data);
        break;
      case 'CLOSE_POSITION':
        message = this._formatClosePositionMessage(data);
        break;
      case 'PROFIT_UPDATE':
        message = this._formatProfitUpdateMessage(data);
        break;
      default:
        message = this._formatDefaultMessage(data);
    }

    return this.sendMessage(message);
  }

  // 发送价格警报
  async sendPriceAlert(symbol, price, message) {
    return this.sendMessage(
      `⚠️ <b>价格警报</b>\n\n` +
      `币对: ${symbol}\n` +
      `价格: ${price} USDT\n` +
      `说明: ${message}\n\n` +
      `🕒 ${new Date().toLocaleString()}`
    );
  }

  // 测试连接
  async test() {
    if (!this.enabled) {
      throw new Error('Telegram通知未启用');
    }

    try {
      await this.sendMessage('🤖 交易机器人通知测试');
      return true;
    } catch (error) {
      throw new Error(`Telegram发送测试消息失败: ${error.message}`);
    }
  }

  // 格式化加仓消息
  _formatAddPositionMessage(data) {
    return `🔵 <b>加仓通知</b>\n\n` +
           `币对: ${data.symbol}\n` +
           `买入数量: ${data.quantity} ${data.symbol.replace('USDT', '')}\n` +
           `成交价格: ${Number(data.price).toFixed(6)} USDT\n` +
           `成交金额: ${Number(data.amount).toFixed(2)} USDT\n` +
           `加仓次数: ${data.addPositionCount}\n` +
           `时间: ${new Date().toLocaleString()}`;
  }

  // 格式化平仓消息
  _formatClosePositionMessage(data) {
    return `🔴 <b>平仓通知</b>\n\n` +
           `币对: ${data.symbol}\n` +
           `数量: ${data.quantity}\n` +
           `价格: ${data.price} USDT\n` +
           `盈亏: ${data.profit} USDT (${data.profitPercentage}%)\n\n` +
           `🕒 ${new Date().toLocaleString()}`;
  }

  // 格式化盈亏更新消息
  _formatProfitUpdateMessage(data) {
    return `💰 <b>盈亏更新</b>\n\n` +
           `币对: ${data.symbol}\n` +
           `当前价格: ${data.currentPrice} USDT\n` +
           `开仓均价: ${data.entryPrice} USDT\n` +
           `未实现盈亏: ${data.profit} USDT (${data.profitPercentage}%)\n\n` +
           `🕒 ${new Date().toLocaleString()}`;
  }

  // 格式化默认消息
  _formatDefaultMessage(data) {
    return `📊 <b>${data.type}</b>\n\n` +
           `币对: ${data.symbol}\n` +
           Object.entries(data)
             .filter(([key]) => !['type', 'symbol'].includes(key))
             .map(([key, value]) => `${key}: ${value}`)
             .join('\n') +
           `\n\n🕒 ${new Date().toLocaleString()}`;
  }
}

module.exports = TelegramService;