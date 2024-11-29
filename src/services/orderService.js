const AdvancedLeverageTradingBot = require('../leverageTradingBot');

class OrderService {
    constructor(bot, config) {
      this.bot = bot;
      this.config = config;
    }
  
    // 处理补仓订单监控
    async monitorAndPlaceLimitOrder(symbol, targetPrice, amountInUSDT) {
      console.log(`开始监控 ${symbol} 补仓机会，目标价格: ${targetPrice}`);
  
      return new Promise((resolve, reject) => {
        const checkInterval = this.config.checkInterval || 5000;
        const monitorDuration = this.config.monitorDuration || 24 * 60 * 60 * 1000;
        const startTime = Date.now();
  
        const priceMonitor = setInterval(async () => {
          try {
            const currentPrice = await this.bot.getCurrentPrice(symbol);
  
            if (currentPrice <= targetPrice) {
              await this.bot.createLimitOrder(symbol, targetPrice, amountInUSDT, 'BUY');
              clearInterval(priceMonitor);
              resolve(true);
            }
  
            if (Date.now() - startTime > monitorDuration) {
              clearInterval(priceMonitor);
              resolve(false);
            }
          } catch (error) {
            clearInterval(priceMonitor);
            reject(error);
          }
        }, checkInterval);
      });
    }
  
    // 处理止损订单
    async placeStopLossOrder(symbol, stopPrice, quantity) {
      return await this.bot.createLimitOrder(symbol, stopPrice, quantity, 'SELL');
    }
  
    // 处理止盈订单
    async placeTakeProfitOrder(symbol, profitPrice, quantity) {
      return await this.bot.createLimitOrder(symbol, profitPrice, quantity, 'SELL');
    }
  }
  
  module.exports = OrderService;