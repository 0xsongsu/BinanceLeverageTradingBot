// src/strategies/TakeProfitStrategies.js

// 基础策略类
class TakeProfitStrategyBase {
    constructor(bot, config) {
      this.bot = bot;
      this.config = config;
    }
  
    isEnabled() {
      return this.config?.trading?.takeProfitStrategy?.enabled || false;
    }
  
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
  
    async formatSellQuantity(symbol, quantity) {
      try {
        const symbolInfo = await this.bot.getSymbolInfo(symbol);
        return Number(quantity.toFixed(symbolInfo.quantityPrecision));
      } catch (error) {
        console.error(`格式化卖出数量失败: ${error.message}`);
        throw error;
      }
    }
  
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
  
  // 增量止盈策略
  class IncrementalTakeProfitStrategy extends TakeProfitStrategyBase {
    constructor(bot, config) {
      super(bot, config);
      this.strategyConfig = config?.trading?.takeProfitStrategy?.strategies?.incrementalTakeProfit || {};
      this.maxAddPositionTimes = config?.trading?.strategy?.maxAddPositionTimes;
    }
  
    async check(symbol, position) {
      if (!this.isEnabled()) return;
  
      try {
        if (position.addPositionCount < this.maxAddPositionTimes) {
          return;
        }
  
        const currentPrice = await this.bot.getCurrentPrice(symbol);
        const lastPrice = position.lastCheckPrice || position.lastAddPrice;
  
        const priceIncrease = ((currentPrice - lastPrice) / lastPrice) * 100;
  
        if (priceIncrease >= (this.strategyConfig.priceIncrementPercent || 1)) {
          const sellPercent = (this.strategyConfig.sellPositionPercent || 2) / 100;
          const sellQuantity = position.quantity * sellPercent;
  
          if (await this.checkMinSellAmount(symbol, sellQuantity, this.strategyConfig.minSellAmount || 10)) {
            await this.executeSell(
              symbol,
              sellQuantity,
              `达到最大加仓次数(${this.maxAddPositionTimes})后，涨幅达到${this.strategyConfig.priceIncrementPercent}%，卖出${this.strategyConfig.sellPositionPercent}%仓位`
            );
  
            position.lastCheckPrice = currentPrice;
            this.bot.lastPositions.set(symbol, position);
          }
        }
      } catch (error) {
        console.error(`${symbol} 增量止盈检查失败:`, error.message);
      }
    }
  }
  
  // 总利润止盈策略
  class TotalProfitTakeProfitStrategy extends TakeProfitStrategyBase {
    constructor(bot, config) {
      super(bot, config);
      this.strategyConfig = config?.trading?.takeProfitStrategy?.strategies?.totalProfitTakeProfit || {};
      this.profitLevels = (this.strategyConfig?.levels || []).sort((a, b) => 
        a.profitPercent - b.profitPercent
      );
    }
  
    async check(symbol, position) {
      if (!this.isEnabled()) return;
  
      try {
        if (this.profitLevels.length === 0) return;
  
        const currentPrice = await this.bot.getCurrentPrice(symbol);
        const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  
        const lastTriggerLevel = position.lastProfitTriggerLevel || 0;
        const nextLevel = this.profitLevels.find(level => 
          level.profitPercent > lastTriggerLevel && profitPercent >= level.profitPercent
        );
  
        if (!nextLevel) return;
  
        const sellPercent = nextLevel.sellPositionPercent / 100;
        const sellQuantity = position.quantity * sellPercent;
        const minSellAmount = this.strategyConfig?.minSellAmount || 10; //每到一个阶段，卖出的比例比上一次增加10%
  
        if (await this.checkMinSellAmount(symbol, sellQuantity, minSellAmount)) {
          const success = await this.executeSell(
            symbol,
            sellQuantity,
            `总利润达到${nextLevel.profitPercent}%，卖出剩余仓位的${nextLevel.sellPositionPercent}%`
          );
  
          if (success) {
            position.lastProfitTriggerLevel = nextLevel.profitPercent;
            this.bot.lastPositions.set(symbol, position);
  
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
  }
  
  module.exports = {
    IncrementalTakeProfitStrategy,
    TotalProfitTakeProfitStrategy
  };