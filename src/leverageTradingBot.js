const { Spot } = require('@binance/connector');
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const crypto = require('crypto');

const AccountService = require('./services/accountService');
const NotificationManager = require('./services/notificationManager');
const LogManager = require('./services/logManager');
const RiskControlService = require('./services/riskControlService');
const StrategyManager = require('./strategies/StrategyManager');

class AdvancedLeverageTradingBot {
  constructor(config) {
    this.config = config;
    this.baseURL = 'https://api.binance.com';
    
    // 设置代理
    const proxyUrl = 'http://127.0.0.1:7897';
    this.proxyAgent = new HttpsProxyAgent(proxyUrl);

    // 初始化HTTP客户端
    this.axios = axios.create({
      baseURL: this.baseURL,
      timeout: 5000,
      httpsAgent: this.proxyAgent,
      headers: {
        'X-MBX-APIKEY': config.apiKey
      }
    });

    // 初始化币安官方SDK客户端
    this.client = new Spot(
      config.apiKey, 
      config.apiSecret, 
      {
        baseURL: this.baseURL,
        timeout: 5000,
        httpsAgent: this.proxyAgent,
        wsClientConfig: {
          agent: this.proxyAgent
        }
      }
    );

    // 初始化各个服务
    this.accountService = new AccountService(config, this.axios);
    this.notificationManager = new NotificationManager(config);
    this.logManager = new LogManager();
    this.riskControl = new RiskControlService(this, config);
    this.strategyManager = new StrategyManager(this, config);

    // 持仓管理
    this.lastPositions = new Map(); // 用于存储上一次的持仓信息
    this.minTrackingValue = config.trading.scanning.minPositionValue || 100;
    this.priceCache = new Map(); // 用于缓存价格数据
    this.priceCacheTimeout = 5000; // 价格缓存5秒
    this.addingPosition = new Set(); //加仓锁，防止订单重复加仓
    this.strategyManager = new StrategyManager(this, config); //止盈策略管理

    // 初始化排除的币对集合
    this.excludedPairs = new Set(
      (config.trading.scanning.excludedPairs || []).map(pair => pair.toUpperCase())
    );
  }

  // 初始化系统
  async initialize() {
    try {
      console.log('\n=== 系统启动检查 ===');
      
      await this._validateApiConfig();
      console.log('• API配置验证通过');
      
      const accountInfo = await this.accountService.getAccountInfo();
      if (!accountInfo) throw new Error('无法获取账户信息');
      console.log('• 账户连接正常');
      
      // 验证通知服务
      await this._validateNotificationService();
      console.log('• 通知服务就绪');
  
      console.log('\n=== 初始化交易系统 ===');
      
      await this.initializePositionData();
      await this._initializePositionMonitoring();
      await this._initializeRiskControl();
      
      // 打印系统配置（简化版）
      this._printSystemConfig();
  
      console.log('=== 系统初始化完成 ===\n');
      return true;
  
    } catch (error) {
      console.error('\n❌ 系统初始化失败:', error.message);
      throw error;
    }
  }


  // 验证API配置
  async _validateApiConfig() {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error('API密钥配置缺失');
    }
    return true;
  }

  // 初始化持仓监控
  async _initializePositionMonitoring() {
    try {
      // 初始化持仓状态
      await this.checkPositionChanges();

      // 设置定时检查
      this.positionCheckInterval = setInterval(async () => {
        await this.checkPositionChanges();
      }, this.config.trading.scanning.positionInterval || 30000);

      return true;
    } catch (error) {
      console.error('初始化持仓监控失败:', error);
      throw error;
    }
  }

  // 初始化风险控制
  async _initializeRiskControl() {
    try {
      await this.riskControl.startMonitoring();
      return true;
    } catch (error) {
      console.error('初始化风险控制失败:', error);
      throw error;
    }
  }

  isExcludedPair(symbol) {
    return this.excludedPairs.has(symbol.toUpperCase());
  }

  // 检查持仓变化
  async checkPositionChanges() {
    try {
      const accountInfo = await this.accountService.getAccountInfo(false);
      if (!accountInfo?.positions) return;
  
      for (const position of accountInfo.positions) {
        const symbol = `${position.asset}USDT`;
        
        // 检查是否是被排除的币对
        if (this.isExcludedPair(symbol)) {
          continue;
        }
  
        try {
          const currentPrice = await this.getCurrentPrice(symbol);
          const positionValue = position.quantity * currentPrice;
  
          // 检查加仓条件
          if (positionValue >= this.minTrackingValue) {
            await this.checkAndExecuteAddPosition(position, currentPrice);
          }
  
          // 检查是否是新增持仓或持仓增加
          if (positionValue >= this.minTrackingValue) {
            const lastPosition = this.lastPositions.get(symbol);
            
            // 只在首次持仓或数量真实增加时发送通知
            if (!lastPosition || position.quantity > lastPosition.quantity) {
              // 发送持仓变化通知
              await this.notificationManager.sendSystemNotification(
                'INFO',
                `🔵 持仓变动通知\n\n` +
                `币对: ${symbol}\n` +
                `当前数量: ${position.quantity.toFixed(8)}\n` +
                `${lastPosition ? '原数量: ' + lastPosition.quantity.toFixed(8) + '\n' : ''}` +
                `当前价格: ${currentPrice.toFixed(6)} USDT\n` +
                `持仓价值: ${positionValue.toFixed(2)} USDT\n` +
                `变动类型: ${lastPosition ? '加仓' : '新增持仓'}`
              );
  
              // 更新lastPositions中的数量
              if (!lastPosition) {
                // 新增持仓
                this.lastPositions.set(symbol, {
                  asset: position.asset,
                  quantity: position.quantity,
                  price: currentPrice,
                  lastAddPrice: currentPrice,
                  nextAddPrice: currentPrice * (1 + this.config.trading.strategy.addPositionPricePercent / 100),
                  value: positionValue,
                  updateTime: Date.now()
                });
              } else {
                // 更新持仓信息
                lastPosition.quantity = position.quantity;
                lastPosition.value = positionValue;
                lastPosition.price = currentPrice;
                lastPosition.updateTime = Date.now();
                this.lastPositions.set(symbol, lastPosition);
              }
            } else if (lastPosition) {
              // 仅更新价格相关信息，不发送通知
              lastPosition.value = positionValue;
              lastPosition.price = currentPrice;
              lastPosition.updateTime = Date.now();
              this.lastPositions.set(symbol, lastPosition);
            }
  
            // 检查止盈策略
            if (this.lastPositions.has(symbol)) {
              await this.strategyManager.checkStrategies(
                symbol,
                this.lastPositions.get(symbol)
              );
            }
  
          } else if (this.lastPositions.has(symbol)) {
            // 如果持仓价值低于阈值且之前在跟踪列表中，发送通知并移除
            const lastPosition = this.lastPositions.get(symbol);
            await this.notificationManager.sendSystemNotification(
              'INFO',
              `⚪️ 移除持仓监控\n\n` +
              `币对: ${symbol}\n` +
              `数量: ${position.quantity.toFixed(8)}\n` +
              `价格: ${currentPrice.toFixed(6)} USDT\n` +
              `价值: ${positionValue.toFixed(2)} USDT\n` +
              `原因: 持仓价值低于 ${this.minTrackingValue} USDT`
            );
            this.lastPositions.delete(symbol);
          }
        } catch (error) {
          console.error('检查持仓变化失败:', error.message);
        }
      }
  
      // 检查已移除的持仓
      for (const [symbol, lastPosition] of this.lastPositions.entries()) {
        const currentPosition = accountInfo.positions.find(p => `${p.asset}USDT` === symbol);
        if (!currentPosition) {
          await this.notificationManager.sendSystemNotification(
            'INFO',
            `⚪️ 持仓移除通知\n\n` +
            `币对: ${symbol}\n` +
            `原数量: ${lastPosition.quantity.toFixed(8)}\n` +
            `最后价格: ${lastPosition.price.toFixed(6)} USDT\n` +
            `最后价值: ${lastPosition.value.toFixed(2)} USDT`
          );
          this.lastPositions.delete(symbol);
        }
      }
    } catch (error) {
      console.error('检查持仓变化失败:', error.message);
    }
  }

  // 检查并执行加仓
  async checkAndExecuteAddPosition(position, currentPrice) {
    const symbol = `${position.asset}USDT`;
    
    try {
      const lastPosition = this.lastPositions.get(symbol);
          
      if (!lastPosition) {
        return;
      }
  
      // 检查加仓锁
      if (this.addingPosition?.has(symbol)) {
        console.log(`${symbol} 正在执行加仓，跳过此次检查`);
        return;
      }
  
      // 使用最后一次加仓价格来计算下次加仓价格
      const nextAddPrice = lastPosition.lastAddPrice * (1 + this.config.trading.strategy.addPositionPricePercent / 100);
  
      // 检查当前价格是否达到加仓条件
      if (currentPrice <= nextAddPrice) {
        console.log(`${symbol} 当前价格 ${currentPrice.toFixed(6)} 未达到加仓价格 ${nextAddPrice.toFixed(6)}`);
        return;
      }
  
      // 检查是否可以加仓
      const canAdd = await this._canAddPosition(symbol, lastPosition);
      if (!canAdd) {
        return;
      }
  
      // 设置加仓锁
      if (!this.addingPosition) {
        this.addingPosition = new Set();
      }
      this.addingPosition.add(symbol);
  
      try {
        // 第一次价格确认已完成，等待第二次确认
        console.log(`\n${symbol} 第一次价格确认完成，等待第二次价格确认...`);
        await new Promise(resolve => setTimeout(resolve, this.config.trading.scanning.priceCheckInterval || 60000));
        
        // 第二次价格检查
        const confirmPrice = await this.getCurrentPrice(symbol);
        if (confirmPrice <= nextAddPrice) {
          console.log(`${symbol} 二次价格确认未通过，当前价格: ${confirmPrice.toFixed(6)}, 目标价格: ${nextAddPrice.toFixed(6)}`);
          return;
        }
  
        // 计算盈利和加仓金额
        const positionProfit = (confirmPrice - lastPosition.entryPrice) * position.quantity;
        let addAmount;
        
        if (positionProfit <= 0) {
          // 亏损情况：使用亏损额的15%作为加仓金额
          addAmount = Math.abs(positionProfit) * 0.15;
          console.log(`${symbol} 当前亏损 ${Math.abs(positionProfit).toFixed(2)} USDT，使用15%作为加仓金额: ${addAmount.toFixed(2)} USDT`);
        } else {
          // 盈利情况：使用配置的比例计算加仓金额
          addAmount = positionProfit * this.config.trading.strategy.addPositionProfitRatio;
        }

        // 检查最小加仓金额
        const minAddAmount = this.config.trading.strategy.minAddPositionAmount || 10;
        if (addAmount < minAddAmount) {
          console.log(`${symbol} 计算的加仓金额 ${addAmount.toFixed(2)} USDT 小于最小要求，使用最小加仓金额 ${minAddAmount} USDT`);
          addAmount = minAddAmount;
        }
  
        // 计算买入数量
        const quantity = await this._calculateAddPositionQuantity(symbol, addAmount, confirmPrice, position.asset);
  
        if (isNaN(quantity) || quantity <= 0) {
          throw new Error(`计算买入数量无效: ${quantity}`);
        }
  
        const actualAmount = quantity * confirmPrice;
  
        // 执行前再次检查价格条件
        if (confirmPrice <= nextAddPrice) {
          console.log(`${symbol} 最终价格确认未通过，当前价格: ${confirmPrice.toFixed(6)}, 目标价格: ${nextAddPrice.toFixed(6)}`);
          return;
        }
  
        console.log(`\n${symbol} 准备加仓:`);
        console.log(`- 当前价格: ${confirmPrice.toFixed(6)} USDT`);
        console.log(`- 开仓均价: ${lastPosition.entryPrice.toFixed(6)} USDT`);
        console.log(`- 当前利润: ${positionProfit.toFixed(2)} USDT`);
        console.log(`- 计算加仓: ${addAmount.toFixed(2)} USDT`);
        console.log(`- 买入数量: ${quantity} ${position.asset}`);
        console.log(`- 实际金额: ${actualAmount.toFixed(2)} USDT`);
  
        // 执行加仓订单
        const orderResult = await this._executeAddPosition(symbol, quantity, confirmPrice, lastPosition);
  
        if (orderResult) {
          console.log(`${symbol} 加仓订单执行成功，订单ID: ${orderResult.orderId}`);
        }
  
      } catch (error) {
        console.error(`${symbol} 加仓执行失败:`, error.message);
      } finally {
        // 无论成功与否，都确保释放加仓锁
        this.addingPosition.delete(symbol);
      }
  
    } catch (error) {
      console.error(`${symbol} 加仓检查失败:`, error.message);
      if (this.addingPosition?.has(symbol)) {
        this.addingPosition.delete(symbol);
      }
    }
  }

  // 检查是否可以加仓
  async _canAddPosition(symbol, position) {
    try {
      // 检查时间间隔
      const now = Date.now();
      const timeSinceLastAdd = now - position.lastAddTime;
      const minInterval = this.config.trading.strategy.minAddPositionInterval;

      if (timeSinceLastAdd < minInterval) {
        console.log(`${symbol} 距离上次加仓时间不足 ${minInterval/1000} 秒`);
        return false;
      }

      // 检查加仓次数
      if (position.addPositionCount >= this.config.trading.strategy.maxAddPositionTimes) {
        console.log(`${symbol} 已达到最大加仓次数: ${position.addPositionCount}`);
        return false;
      }

      // 检查风险率
      const riskOk = await this.riskControl.checkGlobalRisk();
      if (!riskOk) {
        console.log(`${symbol} 全局风险检查未通过`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`检查加仓条件失败: ${symbol}`, error.message);
      return false;
    }
  }

  async _calculateAddPositionQuantity(symbol, addAmount, currentPrice, asset) {
    try {
      // 根据币种获取精度信息
      const symbolInfo = await this.getSymbolInfo(symbol);
      if (!symbolInfo) {
        throw new Error(`无法获取${symbol}的精度信息`);
      }
  
      // 使用币种的实际精度计算数量
      const quantity = Number((addAmount / currentPrice).toFixed(symbolInfo.quantityPrecision));
      
      console.log(`${symbol} 计算买入数量:`, {
        addAmount,
        currentPrice,
        quantity,
        precision: symbolInfo.quantityPrecision
      });
  
      if (isNaN(quantity) || quantity <= 0) {
        throw new Error(`计算得到的买入数量无效: ${quantity}`);
      }
  
      return quantity;
    } catch (error) {
      throw new Error(`计算买入数量失败: ${error.message}`);
    }
  }

  async _executeAddPosition(symbol, quantity, currentPrice, position) {
    if (!symbol || !quantity || isNaN(quantity) || quantity <= 0) {
      throw new Error(`无效的加仓参数: symbol=${symbol}, quantity=${quantity}`);
    }
  
    try {
      // 获取币对精度信息
      const symbolInfo = await this.getSymbolInfo(symbol);
      
      // 格式化数量为字符串，使用正确的精度
      const formattedQuantity = quantity.toFixed(symbolInfo.quantityPrecision);
  
      // 生成订单参数
      const timestamp = Date.now();
      const params = {
        symbol: symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: formattedQuantity,  // 使用格式化后的数量
        timestamp: timestamp,
        isIsolated: 'FALSE',
        sideEffectType: 'MARGIN_BUY'
      };
  
      // 生成签名
      const signature = this._generateSignature(params);
  
      console.log(`${symbol} 发送加仓订单 (数量精度: ${symbolInfo.quantityPrecision})...`);
      console.log('订单参数:', params);
  
      // 发送加仓订单
      const response = await this.axios.post('/sapi/v1/margin/order', null, {
        params: {
          ...params,
          signature
        }
      });
  
      if (!response.data || !response.data.orderId) {
        throw new Error('订单响应异常: ' + JSON.stringify(response.data));
      }
  
      // 更新持仓信息
      const newQuantity = position.quantity + quantity;
      const newAvgPrice = ((position.entryPrice * position.quantity) + (currentPrice * quantity)) / newQuantity;
  
      this.lastPositions.set(symbol, {
        ...position,
        quantity: newQuantity,
        entryPrice: newAvgPrice,
        lastAddPrice: currentPrice,
        addPositionCount: position.addPositionCount + 1,
        lastAddTime: Date.now(),
        nextAddPrice: currentPrice * (1 + this.config.trading.strategy.addPositionPricePercent / 100)
      });
  
      // 发送加仓成功通知
      await this.notificationManager.sendTradingNotification({
        type: 'ADD_POSITION',
        symbol: symbol,
        price: currentPrice,
        quantity: formattedQuantity, // 使用格式化后的数量
        amount: quantity * currentPrice,
        avgPrice: newAvgPrice,
        addPositionCount: position.addPositionCount + 1
      });
  
      console.log(`\n${symbol} 加仓成功:`);
      console.log(`- 买入数量: ${formattedQuantity} ${symbol.replace('USDT', '')}`);
      console.log(`- 成交价格: ${currentPrice.toFixed(6)} USDT`);
      console.log(`- 成交金额: ${(quantity * currentPrice).toFixed(2)} USDT`);
      console.log(`- 新均价: ${newAvgPrice.toFixed(6)} USDT`);
      console.log(`- 加仓次数: ${position.addPositionCount + 1}`);
      console.log(`- 下次加仓价格: ${this.lastPositions.get(symbol).nextAddPrice.toFixed(6)} USDT\n`);
  
      return response.data;
  
    } catch (error) {
      console.error(`${symbol} 加仓执行失败:`, error.message);
      if (error.response?.data) {
        console.error('API错误:', error.response.data);
      }
      throw error;
    }
  }

  async getSymbolInfo(symbol) {
    try {
      // 从缓存获取
      if (this.symbolInfoCache?.get(symbol)) {
        return this.symbolInfoCache.get(symbol);
      }
  
      const response = await this.axios.get('/api/v3/exchangeInfo', {
        params: { symbol }
      });
  
      const symbolInfo = response.data.symbols.find(s => s.symbol === symbol);
      if (!symbolInfo) {
        throw new Error(`未找到交易对 ${symbol} 的信息`);
      }
  
      // 获取数量精度和最小数量
      const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
      const minQty = parseFloat(lotSizeFilter.minQty);
      const stepSize = parseFloat(lotSizeFilter.stepSize);
      
      // 计算精度
      const quantityPrecision = Math.max(0, -Math.log10(stepSize));
  
      const info = {
        quantityPrecision,
        minQty,
        stepSize
      };
  
      // 缓存信息
      if (!this.symbolInfoCache) {
        this.symbolInfoCache = new Map();
      }
      this.symbolInfoCache.set(symbol, info);
  
      console.log(`${symbol} 精度信息:`, info);
      return info;
    } catch (error) {
      console.error(`获取交易对信息失败: ${symbol}`, error);
      throw error;
    }
  }

  // 添加通知服务验证方法
async _validateNotificationService() {
  if (this.notificationManager.hasEnabledServices()) {
    const services = this.notificationManager.getEnabledServices();
    const results = await this.notificationManager.testAllServices();
    const failedServices = Object.entries(results)
      .filter(([, result]) => !result.success)
      .map(([service]) => service);
    
    if (failedServices.length > 0) {
      throw new Error(`通知服务验证失败: ${failedServices.join(', ')}`);
    }
  }
}

// 初始化持仓数据
async initializePositionData() {
  try {
    const accountInfo = await this.accountService.getAccountInfo(false);
    if (!accountInfo?.positions) return;

    for (const position of accountInfo.positions) {
      const symbol = `${position.asset}USDT`;
      
      // 检查是否是被排除的币对
      if (this.isExcludedPair(symbol)) {
        console.log(`💡 ${symbol} 在排除列表中，不��始化监控`);
        continue;
      }

      try {
        const currentPrice = await this.getCurrentPrice(symbol);
        if (!currentPrice) continue;

        const positionValue = position.quantity * currentPrice;
        if (positionValue >= this.minTrackingValue) {
          // 获取订单历史，使用最后一次买入价格
          const orderInfo = await this.accountService.getMarginOrders(position.asset);
          const entryPrice = orderInfo?.entryPrice || currentPrice;
          const lastBuyPrice = orderInfo?.lastBuyPrice || currentPrice;

          this.lastPositions.set(symbol, {
            asset: position.asset,
            quantity: position.quantity,
            entryPrice: entryPrice,
            lastAddPrice: lastBuyPrice, // 使用最后一次买入价格
            addPositionCount: orderInfo?.addPositionCount || 0,
            lastAddTime: orderInfo?.lastOrderTime || Date.now(),
            nextAddPrice: lastBuyPrice * (1 + this.config.trading.strategy.addPositionPricePercent / 100) // 基于最后买入价格计算下次加仓价格
          });

          // 打印初始化信息
          console.log(`✅ ${symbol} 初始化完成:`);
          console.log(`   持仓数量: ${position.quantity.toFixed(8)}`);
          console.log(`   当前价格: ${currentPrice.toFixed(6)} USDT`);
          console.log(`   持仓价值: ${positionValue.toFixed(2)} USDT`);
          console.log(`   加仓次数: ${orderInfo?.addPositionCount || 0}\n`);
        }
      } catch (error) {
        console.error(`初始化${symbol}持仓数据失败:`, error.message);
      }
    }
  } catch (error) {
    console.error('初始化持仓数据失败:', error.message);
  }
}

async _getMarginPosition(symbol) {
  try {
    const timestamp = Date.now();
    const params = {
      symbol,
      timestamp,
      recvWindow: 5000
    };

    const signature = this._generateSignature(params);
    const response = await this.axios.get('/sapi/v1/margin/isolated/pair', {
      params: {
        ...params,
        signature
      }
    });

    return response.data;
  } catch (error) {
    console.error(`获取${symbol}保证金账户信息失败:`, error.message);
    return null;
  }
}

// 打印系统配置
_printSystemConfig() {
  console.log('\n📊 系统配置');
  console.log('------------------------');
  
  // 基本配置
  console.log('• 最小持仓价值:', this.minTrackingValue, 'USDT');
  console.log('• 扫描间隔:', this.config.trading.scanning.positionInterval / 1000, '秒');
  console.log('• 风险监控:', this.config.trading.globalSettings.monitorInterval / 1000, '秒');

  // 加仓策略
  console.log('\n• 加仓设置:');
  console.log(`  - 价格涨幅: ${this.config.trading.strategy.addPositionPricePercent}%`);
  console.log(`  - 最大次数: ${this.config.trading.strategy.maxAddPositionTimes}次`);
  console.log(`  - 最小金额: ${this.config.trading.strategy.minAddPositionAmount || 10} USDT`);
  console.log(`  - 最小间隔: ${this.config.trading.strategy.minAddPositionInterval / 1000}秒`);

  // 止盈策略（只打印一次）
  console.log('\n•', this.strategyManager.getStrategyInfo());
  
  console.log('------------------------');
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

// 获取当前价格（带缓存）
async getCurrentPrice(symbol) {
  try {
    // 检查缓存
    const now = Date.now();
    const cached = this.priceCache.get(symbol);

    // 如果有缓存且未过期，使用缓存价格
    if (cached && (now - cached.time < this.priceCacheTimeout)) {
      return cached.price;
    }

    // 获取最新价格
    const response = await this.axios.get('/api/v3/ticker/price', {
      params: { symbol }
    });

    if (!response.data || !response.data.price) {
      throw new Error(`无法获取${symbol}价格`);
    }

    const price = parseFloat(response.data.price);
    if (isNaN(price)) {
      throw new Error(`${symbol}价格格式无效`);
    }

    // 更新缓存
    this.priceCache.set(symbol, {
      price,
      time: now
    });

    return price;
  } catch (error) {
    console.error(`获取${symbol}价格失败:`, error.message);
    // 返回缓存的最后价格，如果有的话
    const lastPrice = this.priceCache.get(symbol);
    if (lastPrice) {
      console.log(`使用${symbol}缓存价格:`, lastPrice.price);
      return lastPrice.price;
    }
    throw error;
  }
}

// 停止系统
async stop() {
  try {
    console.log('\n正在停止交易系统...');

    // 停止定时器
    if (this.positionCheckInterval) {
      clearInterval(this.positionCheckInterval);
      console.log('✅ 持仓监控已停止');
    }

    // 停止风险控制
    if (this.riskControl) {
      await this.riskControl.stopMonitoring();
      console.log('✅ 风险控制已停止');
    }

    // 清理数据
    this.lastPositions.clear();
    this.priceCache.clear();

    // 发送一次性停止通知
    await this.notificationManager.sendSystemNotification(
      'INFO',
      '🛑 交易系统已安全停止\n\n' +
      '- 持仓监控已停止\n' +
      '- 风险控制已停止\n' +
      '- 系统状态已清理'
    ).catch(error => {
      // 如果发送通知失败，只记录错误但不影响停止流程
      console.error('发送停止通知失败:', error.message);
    });

    console.log('\n=== 交易系统已安全停止 ===\n');
    return true;
  } catch (error) {
    console.error('停止系统时发生错误:', error);
    throw error;
  }
}

// 获取跟踪的持仓列表
getTrackedPositions() {
  return Array.from(this.lastPositions.values());
}
}

module.exports = AdvancedLeverageTradingBot;