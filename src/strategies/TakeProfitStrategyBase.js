const TakeProfitStrategyBase = require('./TakeProfitStrategyBase');

class TakeProfitStrategyBase {
  constructor(bot, config) {
    this.bot = bot;
    this.config = config;
  }

  // 基础方法：检查策略是否启用
  isEnabled() {
    return this.config?.trading?.takeProfitStrategy?.enabled || false;
  }

  // 检查是否满足最小卖出金额要求
  async checkMinSellAmount(symbol, amount, minAmount) {
    try {
      const currentPrice = await this.bot.getCurrentPrice(symbol);
      const sellValue = amount * currentPrice;
      return sellValue >= minAmount;
    } catch (error) {
      console.error(`检查最小卖出金额失败: ${error.message}`);
      return false;
    }
  }

  // 格式化卖出数量
  async formatSellQuantity(symbol, quantity) {
    try {
      const symbolInfo = await this.bot.getSymbolInfo(symbol);
      return Number(quantity.toFixed(symbolInfo.quantityPrecision));
    } catch (error) {
      console.error(`格式化卖出数量失败: ${error.message}`);
      throw error;
    }
  }

  // 执行卖出操作
  async executeSell(symbol, quantity, reason) {
    if (!this.isEnabled()) return false;

    try {
      const formattedQuantity = await this.formatSellQuantity(symbol, quantity);
      
      const params = {
        symbol: symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: formattedQuantity.toString(),
        timestamp: Date.now(),
        isIsolated: 'FALSE',
        sideEffectType: 'MARGIN_BUY'
      };

      // 发送卖出订单
      const response = await this.bot.executeOrder(params);
      if (response?.orderId) {
        await this.bot.notificationManager.sendSystemNotification(
          'SUCCESS',
          `🔴 ${symbol} 止盈卖出成功\n\n` +
          `数量: ${formattedQuantity}\n` +
          `原因: ${reason}\n` +
          `订单ID: ${response.orderId}`
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error(`${symbol} 止盈卖出失败:`, error.message);
      return false;
    }
  }
}

module.exports = TakeProfitStrategyBase;