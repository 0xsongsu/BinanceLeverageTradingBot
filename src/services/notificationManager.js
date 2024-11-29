const TelegramService = require('./telegramService');
const WeChatService = require('./wechatService');

class NotificationManager {
  constructor(config) {
    this.config = config;
    this.services = {};

    // 初始化通知服务
    this.initServices();
  }

  // 初始化通知服务
  initServices() {
    const enabledServices = [];
  
    if (this.config.notification?.telegram?.enabled) {
      try {
        this.services.telegram = new TelegramService(this.config);
        enabledServices.push('Telegram');
      } catch (error) {
        console.error('❌ Telegram服务初始化失败:', error.message);
      }
    }
  
    if (this.config.notification?.wechat?.enabled) {
      try {
        this.services.wechat = new WeChatService(this.config);
        enabledServices.push('微信');
      } catch (error) {
        console.error('❌ 微信服务初始化失败:', error.message);
      }
    }
  
    if (enabledServices.length > 0) {
    } else {
      console.log('⚠️ 未启用任何通知服务');
    }
  }

  // 测试所有启用的服务
  async testAllServices() {
    const results = {};
    
    for (const [serviceName, service] of Object.entries(this.services)) {
      try {
        await service.test();
        results[serviceName] = { success: true };
      } catch (error) {
        results[serviceName] = { 
          success: false, 
          error: error.message 
        };
      }
    }

    return results;
  }

  // 发送交易通知
  async sendTradingNotification(data) {
    const errors = [];
    
    for (const [serviceName, service] of Object.entries(this.services)) {
      try {
        await service.sendTradeMessage(data);
      } catch (error) {
        errors.push(`${serviceName}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      console.error('发送交易通知失败:', errors.join(', '));
    }
  }

  // 发送系统通知
  async sendSystemNotification(type, message) {
    const errors = [];
    
    for (const [serviceName, service] of Object.entries(this.services)) {
      try {
        await service.sendSystemMessage(type, message);
      } catch (error) {
        errors.push(`${serviceName}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      console.error('发送系统通知失败:', errors.join(', '));
    }
  }

  // 发送价格警报
  async sendPriceAlert(symbol, price, message) {
    const errors = [];
    
    for (const [serviceName, service] of Object.entries(this.services)) {
      try {
        await service.sendPriceAlert(symbol, price, message);
      } catch (error) {
        errors.push(`${serviceName}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      console.error('发送价格警报失败:', errors.join(', '));
    }
  }

  // 获取已启用的服务列表
  getEnabledServices() {
    return Object.keys(this.services);
  }

  // 检查是否有启用的服务
  hasEnabledServices() {
    return Object.keys(this.services).length > 0;
  }
}

module.exports = NotificationManager;