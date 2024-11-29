// 废弃策略


const BaseTakeProfitStrategy = require('./TakeProfitStrategyBase');

class IncrementalTakeProfitStrategy extends BaseTakeProfitStrategy {
  constructor(bot, config) {
    super(bot, config);
    this.strategyConfig = config?.trading?.takeProfitStrategy?.strategies?.incrementalTakeProfit || {};
    this.maxAddPositionTimes = config?.trading?.strategy?.maxAddPositionTimes;
  }

  async check(symbol, position) {
    if (!this.strategyConfig.enabled) return;

    try {
      // 检查加仓次数是否达到最大值
      if (position.addPositionCount < this.maxAddPositionTimes) {
        return;
      }

      const currentPrice = await this.bot.getCurrentPrice(symbol);
      const lastPrice = position.lastCheckPrice || position.lastAddPrice;

      // 计算价格涨幅
      const priceIncrease = ((currentPrice - lastPrice) / lastPrice) * 100;

      // 检查是否达到卖出条件
      if (priceIncrease >= this.strategyConfig.priceIncrementPercent) {
        // 计算卖出数量
        const sellPercent = this.strategyConfig.sellPositionPercent / 100;
        const sellQuantity = position.quantity * sellPercent;

        // 检查最小卖出金额
        if (await this.checkMinSellAmount(symbol, sellQuantity, this.strategyConfig.minSellAmount)) {
          // 执行卖出
          await this.executeSell(
            symbol,
            sellQuantity,
            `达到最大加仓次数(${this.maxAddPositionTimes})后，涨幅达到${this.strategyConfig.priceIncrementPercent}%，卖出${this.strategyConfig.sellPositionPercent}%仓位`
          );

          // 更新最后检查价格
          position.lastCheckPrice = currentPrice;
          this.bot.lastPositions.set(symbol, position);
        }
      }
    } catch (error) {
      console.error(`${symbol} 增量止盈检查失败:`, error.message);
    }
  }
}

module.exports = IncrementalTakeProfitStrategy;