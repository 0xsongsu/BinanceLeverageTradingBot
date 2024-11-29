const crypto = require('crypto');

class AccountService {
  constructor(config, httpClient) {
    this.config = config;
    this.axios = httpClient;
    this.baseURL = 'https://api.binance.com';
    
    // 缓存
    this.accountCache = null;
    this.accountCacheTime = 0;
    this.orderCache = new Map();
    this.priceCache = new Map();
    
    // 缓存过期时间
    this.CACHE_TIMEOUT = 30000;  // 30秒
    this.PRICE_CACHE_TIMEOUT = 5000;  // 5秒
  }

  // 获取当前价格
  async getCurrentPrice(symbol) {
    try {
      const now = Date.now();
      const cached = this.priceCache.get(symbol);

      // 使用缓存的价格
      if (cached && (now - cached.time < this.PRICE_CACHE_TIMEOUT)) {
        return cached.price;
      }

      // 获取最新价格
      const response = await this.axios.get('/api/v3/ticker/price', {
        params: { symbol }
      });

      if (!response.data || !response.data.price) {
        throw new Error(`获取${symbol}价格失败`);
      }

      const price = parseFloat(response.data.price);
      
      // 更新缓存
      this.priceCache.set(symbol, {
        time: now,
        price: price
      });

      return price;
    } catch (error) {
      console.error(`获取${symbol}价格失败:`, error.message);
      throw error;
    }
  }

  // 获取账户信息
  async getAccountInfo(printDetails = false) {
    try {
      const timestamp = Date.now();
      const params = { 
        timestamp,
        recvWindow: 5000
      };

      const signature = this._generateSignature(params);
      const response = await this.axios.get('/sapi/v1/margin/account', {
        params: {
          ...params,
          signature
        }
      });

      if (!response.data) {
        throw new Error('获取账户信息失败: 空响应');
      }

      // 处理账户信息
      const accountInfo = {
        riskRatio: parseFloat(response.data.marginLevel || 999),
        totalAssetInBTC: parseFloat(response.data.totalAssetOfBtc),
        totalLiabilityInBTC: parseFloat(response.data.totalLiabilityOfBtc),
        netAssetInBTC: parseFloat(response.data.totalNetAssetOfBtc),
        positions: this._processPositions(response.data.userAssets),
        usdtBalance: this._getUSDTBalance(response.data.userAssets)
      };

      // 更新缓存
      this.accountCache = accountInfo;
      this.accountCacheTime = timestamp;

      return accountInfo;

    } catch (error) {
      console.error('获取账户信息失败:', error.message);
      throw error;
    }
  }

  // 获取保证金账户订单历史
  async getMarginOrders(asset) {
    try {
      const symbol = `${asset}USDT`;
      
      // 检查缓存
      const now = Date.now();
      const cached = this.orderCache.get(symbol);
      if (cached && (now - cached.time < this.CACHE_TIMEOUT)) {
        return cached.data;
      }
  
      // 获取订单历史
      const timestamp = Date.now();
      const params = {
        symbol,
        limit: 500,
        timestamp,
        recvWindow: 5000
      };
  
      const signature = this._generateSignature(params);
      const response = await this.axios.get('/sapi/v1/margin/allOrders', {
        params: {
          ...params,
          signature
        }
      });
  
      if (!response.data) {
        throw new Error('获取订单历史失败: 空响应');
      }
  
      // 处理订单数据，只看已成交的买单
      const buyOrders = response.data
        .filter(order => order.side === 'BUY' && order.status === 'FILLED')
        .sort((a, b) => b.time - a.time); // 按时间降序排序
  
      let totalQuantity = 0;
      let totalCost = 0;
      let addPositionCount = 0;
  
      // 获取最后一次成交的买单价格
      const lastBuyOrder = buyOrders[0]; // 最近的买单
      const lastBuyPrice = lastBuyOrder 
        ? parseFloat(lastBuyOrder.cummulativeQuoteQty) / parseFloat(lastBuyOrder.executedQty)
        : 0;
  
      // 计算开仓均价 (使用所有订单)
      for (const order of buyOrders) {
        const quantity = parseFloat(order.executedQty);
        const cost = parseFloat(order.cummulativeQuoteQty);
        
        if (quantity > 0 && cost > 0) {
          totalQuantity += quantity;
          totalCost += cost;
          addPositionCount++;
        }
      }
  
      const entryPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;
  
      // 获取当前价格计算利润
      const currentPrice = await this.getCurrentPrice(symbol);
      
      // 计算当前利润
      const totalProfit = (currentPrice - entryPrice) * totalQuantity;
      const profitPercentage = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
  
      // 准备返回数据
      const orderInfo = {
        symbol,
        entryPrice,
        currentPrice,
        totalQuantity,
        totalCost,
        addPositionCount,
        profit: totalProfit,
        profitPercentage,
        lastOrderTime: lastBuyOrder ? lastBuyOrder.time : 0,
        lastBuyPrice // 最后成交价格
      };
  
      // 更新缓存
      this.orderCache.set(symbol, {
        time: now,
        data: orderInfo
      });
  
      return orderInfo;
  
    } catch (error) {
      console.error(`获取${asset}订单历史失败:`, error.message);
      throw error;
    }
  }

  // 处理持仓信息
  _processPositions(assets) {
    if (!assets || !Array.isArray(assets)) return [];

    return assets
      .filter(asset => 
        asset.asset !== 'USDT' && 
        (parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0 || parseFloat(asset.borrowed) > 0)
      )
      .map(asset => ({
        asset: asset.asset,
        free: parseFloat(asset.free),
        locked: parseFloat(asset.locked),
        borrowed: parseFloat(asset.borrowed),
        interest: parseFloat(asset.interest),
        quantity: parseFloat(asset.free) + parseFloat(asset.locked),
        netAsset: parseFloat(asset.netAsset)
      }));
  }

  // 获取USDT余额
  _getUSDTBalance(assets) {
    const usdt = assets?.find(asset => asset.asset === 'USDT');
    if (!usdt) return null;

    return {
      free: parseFloat(usdt.free),
      locked: parseFloat(usdt.locked),
      borrowed: parseFloat(usdt.borrowed),
      interest: parseFloat(usdt.interest),
      netAsset: parseFloat(usdt.netAsset)
    };
  }

  // 生成签名
  _generateSignature(params) {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  // 获取持仓利润信息
  async getPositionProfitInfo(asset) {
    try {
      const orderInfo = await this.getMarginOrders(asset);
      if (!orderInfo || !orderInfo.entryPrice) {
        throw new Error('无法获取开仓信息');
      }

      const currentPrice = await this.getCurrentPrice(`${asset}USDT`);
      const accountInfo = await this.getAccountInfo();
      const position = accountInfo.positions.find(p => p.asset === asset);

      if (!position) {
        throw new Error('未找到持仓信息');
      }

      return {
        asset,
        entryPrice: orderInfo.entryPrice,
        lastBuyPrice: orderInfo.lastBuyPrice,
        currentPrice: currentPrice,
        quantity: position.quantity,
        value: position.quantity * currentPrice,
        profit: (currentPrice - orderInfo.entryPrice) * position.quantity,
        profitPercentage: ((currentPrice - orderInfo.entryPrice) / orderInfo.entryPrice) * 100,
        addPositionCount: orderInfo.addPositionCount
      };
    } catch (error) {
      console.error(`获取${asset}利润信息失败:`, error.message);
      throw error;
    }
  }
}

module.exports = AccountService;