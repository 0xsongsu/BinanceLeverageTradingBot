// 废弃策略


const BaseTakeProfitStrategy = require('./TakeProfitStrategyBase');

class TotalProfitTakeProfitStrategy extends BaseTakeProfitStrategy {
  constructor(bot, config) {
    super(bot, config);
    this.strategyConfig = config?.trading?.takeProfitStrategy?.strategies?.totalProfitTakeProfit || {};
    this.profitLevels = (this.strategyConfig?.levels || []).sort((a, b) => 
      a.profitPercent - b.profitPercent
    );
  }

  async check(symbol, position) {
    // 首先检查策略是否启用
    if (!this.isEnabled()) return;

    try {
      if (this.profitLevels.length === 0) return;

      const currentPrice = await this.bot.getCurrentPrice(symbol);
      const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      // 获取尚未触发的最低利润水平
      const lastTriggerLevel = position.lastProfitTriggerLevel || 0;
      const nextLevel = this.profitLevels.find(level => 
        level.profitPercent > lastTriggerLevel && profitPercent >= level.profitPercent
      );

      if (!nextLevel) return;

      // 计算卖出数量
      const sellPercent = nextLevel.sellPositionPercent / 100;
      const sellQuantity = position.quantity * sellPercent;
      const minSellAmount = this.strategyConfig?.minSellAmount || 10;

      // 检查最小卖出金额
      if (await this.checkMinSellAmount(symbol, sellQuantity, minSellAmount)) {
        const success = await this.executeSell(
          symbol,
          sellQuantity,
          `总利润达到${nextLevel.profitPercent}%，卖出剩余仓位的${nextLevel.sellPositionPercent}%`
        );

        if (success) {
          // 更新最后触发的利润水平
          position.lastProfitTriggerLevel = nextLevel.profitPercent;
          this.bot.lastPositions.set(symbol, position);

          // 发送详细通知
          await this.bot.notificationManager.sendSystemNotification(
            'INFO',
            `🎯 ${symbol} 止盈策略触发\n\n` +
            `当前利润: ${profitPercent.toFixed(2)}%\n` +
            `触发水平: ${nextLevel.profitPercent}%\n` +
            `卖出比例: ${nextLevel.sellPositionPercent}%\n` +
            `卖出数量: ${sellQuantity.toFixed(8)}\n` +
            `成交价格: ${currentPrice.toFixed(6)} USDT`
          );
        }
      }
    } catch (error) {
      console.error(`${symbol} 止盈策略检查失败:`, error.message);
    }
  }

  getDescription() {
    if (!this.isEnabled()) return '止盈策略未启用';
    
    return this.profitLevels.map(level => 
      `利润达到${level.profitPercent}%时卖出${level.sellPositionPercent}%`
    ).join('\n');
  }
}

module.exports = TotalProfitTakeProfitStrategy;