const { IncrementalTakeProfitStrategy, TotalProfitTakeProfitStrategy } = require('./TakeProfitStrategies');

class StrategyManager {
    constructor(bot, config) {
      this.bot = bot;
      this.config = config;
      const takeProfitConfig = config?.trading?.takeProfitStrategy;
      this.enabled = false;
      this.strategyType = null;
      this.strategies = {};
  
      if (takeProfitConfig) {
        this.enabled = takeProfitConfig.enabled || false;
        this.strategyType = takeProfitConfig.strategyType;
  
        if (this.enabled && this.strategyType) {
          try {
            const { IncrementalTakeProfitStrategy, TotalProfitTakeProfitStrategy } = require('./TakeProfitStrategies');
            this.strategies = {
              'A': new IncrementalTakeProfitStrategy(bot, config),
              'B': new TotalProfitTakeProfitStrategy(bot, config)
            };
            // 移除这里的日志输出
          } catch (error) {
            console.error('❌ 初始化止盈策略失败:', error.message);
            this.enabled = false;
          }
        }
      }
    }

  // 检查止盈策略
  async checkStrategies(symbol, position) {
    try {
      // 如果策略未启用，直接返回
      if (!this.enabled) return;

      // 检查策略类型是否有效
      if (!this.strategyType || !this.strategies[this.strategyType]) {
        return;
      }

      // 执行策略检查
      const strategy = this.strategies[this.strategyType];
      await strategy.check(symbol, position);
    } catch (error) {
      console.error(`${symbol} 止盈策略检查失败:`, error.message);
    }
  }

  // 获取策略描述
  getStrategyDescription() {
    if (!this.enabled) {
      return '止盈策略未启用';
    }

    try {
      if (this.strategyType === 'A') {
        return `策略A: 达到最大加仓次数${this.config.trading.strategy.maxAddPositionTimes}次后，` +
               `每涨${this.config.trading.takeProfitStrategy.strategies.incrementalTakeProfit.priceIncrementPercent}%` +
               `卖出${this.config.trading.takeProfitStrategy.strategies.incrementalTakeProfit.sellPositionPercent}%仓位`;
      } else if (this.strategyType === 'B') {
        const levels = this.config.trading.takeProfitStrategy.strategies.totalProfitTakeProfit.levels;
        if (!levels || levels.length === 0) {
          return '策略B: 未配置止盈级别';
        }
        return '策略B: 多级止盈\n' + levels.map(level => 
          `   • 利润达到${level.profitPercent}%时卖出${level.sellPositionPercent}%仓位`
        ).join('\n');
      }
      return '未知策略类型';
    } catch (error) {
      return '止盈策略配置异常';
    }
  }

  // 获取策略信息
  getStrategyInfo() {
    if (this.enabled) {
      return `止盈策略: ${this.getStrategyDescription()}`;  // 简化输出格式
    }
    return '止盈策略: 未启用';
  }

  // 打印策略信息
  printStrategyInfo() {
    console.log(this.getStrategyInfo());
  }
}

module.exports = StrategyManager;