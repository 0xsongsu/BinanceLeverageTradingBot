const NotificationManager = require('./notificationManager');

class CheckService {
  constructor(bot, config) {
    this.bot = bot;
    this.config = config;
    this.notificationManager = new NotificationManager(config);
  }

  // 运行所有检查
  async runAllChecks() {
    console.log('\n=== 系统启动检查 ===');
  
    try {
      // 1. 验证配置
      const configValid = this._validateConfig();
      if (!configValid) {
        throw new Error('配置验证失败');
      }
  
      // 2. 验证API连接
      const accountInfo = await this.bot.accountService.getAccountInfo();
      if (!accountInfo) {
        throw new Error('无法连接到交易所API');
      }
  
      // 3. 验证余额
      await this._validateAccountBalance(accountInfo);
  
      // 4. 验证通知服务
      await this._validateNotificationServices();
  
      // 打印启动成功信息
      console.log('\n✅ 启动检查完成');
      console.log('- 配置文件有效');
      console.log('- API连接正常');
      console.log('- 账户余额充足');
      console.log(`- 通知服务就绪: ${this.notificationManager.getEnabledServices().join(', ')}`);
  
      // 发送启动通知
      if (this.notificationManager.hasEnabledServices()) {
        await this.notificationManager.sendSystemNotification(
          'SUCCESS',
          '🚀 交易机器人启动成功\n系统开始运行...'
        );
      }
  
      return {
        success: true,
        accountInfo
      };
  
    } catch (error) {
      console.error('\n❌ 启动检查失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 验证配置
  _validateConfig() {
    console.log('\n正在验证配置...');
    
    try {
      const requiredFields = {
        apiKey: 'API Key',
        apiSecret: 'API Secret',
        trading: {
          scanning: {
            positionInterval: '持仓扫描间隔',
            priceInterval: '价格采样间隔',
            minPositionValue: '最小持仓价值'
          },
          globalSettings: {
            riskRatioThreshold: '风险率阈值',
            monitorInterval: '风险监控间隔'
          },
          strategy: {
            addPositionPricePercent: '加仓价格百分比',
            addPositionProfitRatio: '加仓利润比例',
            minAddPositionInterval: '最小加仓间隔'
          }
        }
      };

      const missingFields = [];
      
      const checkFields = (obj, fields, prefix = '') => {
        for (const [key, value] of Object.entries(fields)) {
          if (typeof value === 'object') {
            if (!obj[key] || typeof obj[key] !== 'object') {
              missingFields.push(`${prefix}${key}`);
            } else {
              checkFields(obj[key], value, `${prefix}${key}.`);
            }
          } else if (obj[key] === undefined) {
            missingFields.push(`${prefix}${key} (${value})`);
          }
        }
      };

      checkFields(this.config, requiredFields);

      if (missingFields.length > 0) {
        throw new Error(`配置文件缺少必要字段：\n${missingFields.join('\n')}`);
      }

      // 验证通知配置
      if (this.config.notification) {
        if (this.config.notification.telegram?.enabled) {
          if (!this.config.notification.telegram.botToken) {
            missingFields.push('notification.telegram.botToken');
          }
          if (!this.config.notification.telegram.chatId) {
            missingFields.push('notification.telegram.chatId');
          }
        }

        if (missingFields.length > 0) {
          throw new Error(`通知配置缺少必要字段：\n${missingFields.join('\n')}`);
        }
      } else {
        console.log('⚠️ 未配置通知服务');
      }

      return true;
    } catch (error) {
      console.error('配置验证失败:', error.message);
      throw error;
    }
  }

  // 验证账户余额
  async _validateAccountBalance(accountInfo) {
    try {
      const requiredAmount = this._getTotalRequiredFunds();

      // 获取USDT余额
      if (!accountInfo.usdtBalance) {
        throw new Error('无法获取USDT余额信息');
      }

      const availableBalance = accountInfo.usdtBalance.free;

      console.log('\nUSDT余额信息:');
      console.log(`- 可用余额: ${availableBalance.toFixed(2)} USDT`);
      console.log(`- 所需余额: ${requiredAmount.toFixed(2)} USDT`);

      if (availableBalance < requiredAmount) {
        throw new Error(`USDT 余额不足，当前余额: ${availableBalance.toFixed(2)} USDT，需要: ${requiredAmount.toFixed(2)} USDT`);
      }

      return true;
    } catch (error) {
      throw new Error(`检查账户余额失败: ${error.message}`);
    }
  }

  // 验证通知服务
  async _validateNotificationServices() {
    console.log('\n正在验证通知服务...');

    if (!this.notificationManager.hasEnabledServices()) {
      console.log('⚠️ 未启用任何通知服务');
      return true;
    }

    const enabledServices = this.notificationManager.getEnabledServices();
    console.log(`已启用的通知服务: ${enabledServices.join(', ')}`);

    const results = await this.notificationManager.testAllServices();
    
    const failedServices = [];
    for (const [service, result] of Object.entries(results)) {
      if (result.success) {
        console.log(`✅ ${service} 服务连接成功`);
      } else {
        console.error(`❌ ${service} 服务连接失败: ${result.error}`);
        failedServices.push(service);
      }
    }

    if (failedServices.length > 0) {
      throw new Error(`以下通知服务连接失败: ${failedServices.join(', ')}`);
    }

    return true;
  }

  // 计算所需资金
  _getTotalRequiredFunds() {
    try {
      const { trading } = this.config;
      const bufferRatio = 1.2; // 20% 缓冲
      const marginRequirement = trading.scanning.minPositionValue * bufferRatio;
      
      // console.log('\n资金需求计算:');
      // console.log(`- 最小持仓价值: ${trading.scanning.minPositionValue} USDT`);
      // console.log(`- 资金缓冲比例: ${(bufferRatio - 1) * 100}%`);
      // console.log(`- 总需求资金: ${marginRequirement} USDT\n`);
      
      return marginRequirement;
    } catch (error) {
      console.error('计算所需资金失败:', error);
      return 100; // 默认最小值
    }
  }
}

module.exports = CheckService;