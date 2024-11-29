const AdvancedLeverageTradingBot = require('../leverageTradingBot');

class PositionService {
    constructor(bot, config) {
      this.bot = bot;
      this.config = config;
    }
  
    // 仓位状态检查
    async checkAndInitializePosition(symbol) {
      const existingPosition = await this.bot.checkExistingPosition(symbol);
      if (existingPosition) {
        return {
          exists: true,
          position: existingPosition
        };
      }
  
      return {
        exists: false,
        position: null
      };
    }
  
    // 开仓管理
    async handlePositionOpening(symbol, amountInUSDT, leverage) {
      const { exists, position } = await this.checkAndInitializePosition(symbol);
      
      if (exists) {
        return position;
      }
  
      return await this.bot.openLongPosition(symbol, amountInUSDT, leverage);
    }
  
    // 仓位监控
    async getPositionStatus(symbol) {
      const position = this.bot.getPositionInfo(symbol);
      if (!position) return null;
  
      const currentPrice = await this.bot.getCurrentPrice(symbol);
      const pnl = await this.bot.calculatePnL(symbol);
  
      return {
        ...position,
        currentPrice,
        pnl
      };
    }
  }
  
  module.exports = PositionService;