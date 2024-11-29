class PriceSamplingService {
    constructor() {
      this.samples = new Map();  // 存储每个币种的价格样本
    }
  
    // 添加价格样本
    addSample(symbol, price) {
      if (!this.samples.has(symbol)) {
        this.samples.set(symbol, []);
      }
  
      const samples = this.samples.get(symbol);
      samples.push({
        price,
        timestamp: Date.now()
      });
  
      // 只保留最新的 n 个样本
      const maxSamples = 2;  // 保留两个样本用于比较
      if (samples.length > maxSamples) {
        samples.shift();
      }
    }
  
    // 检查是否满足价格条件
    checkPriceCondition(symbol, targetPrice) {
      const samples = this.samples.get(symbol);
      if (!samples || samples.length < 2) {
        return false;
      }
  
      // 检查所有样本是否都高于目标价格
      return samples.every(sample => sample.price > targetPrice);
    }
  
    // 清除币种的采样数据
    clearSamples(symbol) {
      this.samples.delete(symbol);
    }
  
    // 获取最新价格
    getLatestPrice(symbol) {
      const samples = this.samples.get(symbol);
      if (!samples || samples.length === 0) {
        return null;
      }
      return samples[samples.length - 1].price;
    }
  }
  
  module.exports = PriceSamplingService;