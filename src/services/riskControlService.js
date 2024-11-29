const EventEmitter = require('events');

class RiskControlService extends EventEmitter {
  constructor(bot, config) {
    super();
    this.bot = bot;
    this.config = config;
    this.monitorInterval = null;
    this.lastRiskCheck = 0;
    this.riskRatioThreshold = config.trading.globalSettings.riskRatioThreshold;
    this.isMonitoring = false;
  }

  // 启动风险监控
  async startMonitoring() {
    console.log('\n启动风险监控...');
    
    if (this.isMonitoring) {
      console.log('风险监控已在运行中');
      return;
    }

    this.isMonitoring = true;
    this.monitorInterval = setInterval(async () => {
      try {
        await this.checkGlobalRisk();
      } catch (error) {
        console.error('风险检查失败:', error.message);
      }
    }, this.config.trading.globalSettings.monitorInterval || 60000);

    return true;
  }

  // 停止风险监控
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    // console.log('风险监控已停止');
  }

  // 获取全局风险率
  async getGlobalRiskRatio() {
    try {
      const accountInfo = await this.bot.accountService.getAccountInfo();
      return accountInfo.riskRatio;
    } catch (error) {
      console.error('获取风险率失败:', error.message);
      return 999; // 返回一个安全的默认值
    }
  }

  // 检查全局风险
  async checkGlobalRisk() {
    try {
      const riskRatio = await this.getGlobalRiskRatio();
      const now = Date.now();
      const timeSinceLastCheck = now - this.lastRiskCheck;

      // 检查风险率是否低于阈值
      if (riskRatio <= this.riskRatioThreshold) {
        // 风险率过低，每30分钟最多发送一次通知
        const shouldNotify = timeSinceLastCheck >= 1800000; // 10分钟
        
        if (shouldNotify) {
          this.lastRiskCheck = now;
          this.emit('highRisk', {
            riskRatio,
            threshold: this.riskRatioThreshold,
            shouldNotify: true
          });
        } else {
          this.emit('highRisk', {
            riskRatio,
            threshold: this.riskRatioThreshold,
            shouldNotify: false
          });
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('检查风险率失败:', error.message);
      return false;
    }
  }

  // 检查是否可以加仓
  async canAddPosition(symbol) {
    try {
      const riskOk = await this.checkGlobalRisk();
      if (!riskOk) {
        return {
          canAdd: false,
          reason: '全局风险率过低'
        };
      }

      // 获取当前仓位
      const position = this.bot.getPositionInfo(symbol);
      if (!position) {
        return {
          canAdd: false,
          reason: '未找到持仓信息'
        };
      }

      // 检查加仓次数限制
      if (position.addPositionCount >= this.config.trading.strategy.maxAddPositionTimes) {
        return {
          canAdd: false,
          reason: '已达到最大加仓次数'
        };
      }

      return {
        canAdd: true
      };
    } catch (error) {
      console.error('检查加仓条件失败:', error.message);
      return {
        canAdd: false,
        reason: error.message
      };
    }
  }

  // 获取监控状态
  isMonitoring() {
    return this.isMonitoring;
  }
}

module.exports = RiskControlService;