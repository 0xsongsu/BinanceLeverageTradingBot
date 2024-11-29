const TelegramService = require('./telegramService');

class NotificationService {
  constructor(config) {
    this.config = config;
    this.services = [];

    // 初始化Telegram通知服务
    if (config.notification?.telegram?.enabled) {
      this.telegram = new TelegramService(config);
      this.services.push('telegram');
    }
  }

  // 发送系统通知
  async sendSystemNotification(type, message) {
    try {
      const promises = [];

      // Telegram通知
      if (this.telegram) {
        promises.push(this.telegram.sendSystemMessage(type, message));
      }

      // 如果添加了其他通知服务，也在这里处理

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      // 同时在控制台显示
      const prefix = {
        'SUCCESS': '✅',
        'ERROR': '❌',
        'WARNING': '⚠️',
        'INFO': 'ℹ️'
      }[type] || 'ℹ️';

      console.log(`\n${prefix} ${message}`);
      return true;
    } catch (error) {
      console.error('发送系统通知失败:', error.message);
      return false;
    }
  }

  // 发送交易通知
  async sendTradingNotification(data) {
    try {
      const promises = [];

      // Telegram通知
      if (this.telegram) {
        promises.push(this.telegram.sendTradeMessage(data));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      // 在控制台显示
      let emoji = '';
      switch (data.type) {
        case 'ADD_POSITION': emoji = '🔵'; break;
        case 'CLOSE_POSITION': emoji = '🔴'; break;
        case 'PROFIT_UPDATE': emoji = '💰'; break;
        default: emoji = '📊';
      }

      console.log(`\n${emoji} ${data.type}:`, data);
      return true;
    } catch (error) {
      console.error('发送交易通知失败:', error.message);
      return false;
    }
  }

  // 发送价格警报
  async sendPriceAlert(symbol, price, message) {
    try {
      const promises = [];

      if (this.telegram) {
        promises.push(this.telegram.sendPriceAlert(symbol, price, message));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      console.log(`\n⚠️ 价格警报 ${symbol}: ${price} USDT - ${message}`);
      return true;
    } catch (error) {
      console.error('发送价格警报失败:', error.message);
      return false;
    }
  }

  // 测试通知服务
  async testNotification() {
    try {
      const results = [];

      if (this.telegram) {
        try {
          await this.telegram.test();
          results.push({ service: 'telegram', success: true });
        } catch (error) {
          results.push({ service: 'telegram', success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('测试通知服务失败:', error.message);
      return [];
    }
  }

  // 获取已启用的服务
  getEnabledServices() {
    return this.services;
  }

  // 检查是否有启用的服务
  hasEnabledServices() {
    return this.services.length > 0;
  }
}

module.exports = NotificationService;