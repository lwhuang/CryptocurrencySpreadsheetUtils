/**
  MIT License
  
  Copyright (c) 2017 Brad Jasper
  
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  
  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
  
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  
  
  # Cryptocurrency Spreadsheet Utils
  Provides useful functions for Google Sheets to get cryptocurrency prices and information.
  For example, to get the current price of Bitcoin you can enter:
  
      =getCoinPrice("BTC")
      
  You can also change the default price API (currently coinmarketcap, coinbin is also supported):
  
      =getCoinPrice("ETH", "coinbin")
      
  Alternatively you can change the DEFAULT_CRYPTO_SERVICE variable below to change it globally.
  
  Other useful functions include retrieving specific attributes from an API. For example, here's how
  to retrieve the current Litecoin rank from Coinbin:
    
      =getCoinAttr("LTC", "rank", "coinbin")
      
  Or here's how to get the 24 hour volume of Ethereum from CoinMarketCap
  
      =getCoinAttr("ETH", "24h_volume_usd", "coinmarketcap")
      
  You can of course also implement your own crypto API partners if Coinbin and CoinMarketCap don't have what you need.
  
  Review the API documentation below to see specific attributes.
  
  
  Created by Brad Jasper (http://bradjasper.com/)
  v0.6 — 12/13/2017 — Cleaned up code (thanks @jeromedalbert)
  v0.5 — 11/26/2017 — Fixed multi-coin issue by sorting coins (thanks @jeromedalbert)
  v0.4 — 11/09/2017 — Fixed limit with CoinMarketCap API reponses
  v0.3 — 09/24/2017 — Created pluggable API backends, added Coinbin API, cleaned up code & docs.
  v0.2 — 09/07/2017 — Added refresh() and getCoinAttr() functions by John Harding
  v0.1 — 06/29/2017 — Initial release
  
  ## Planned
  - Handle coins with the same symbol
  - 1-click easy archiving to save data over time
  - Historical trade data
  - Functions for managing trades/accounting/taxes
  
**/

/**
 * Change this to coinbin or coinmarketcap (or implement a new CryptoService below and use that)
 */
var DEFAULT_CRYPTO_SERVICE = "coinmarketcap";

/**************************************************************************************/

/**
 CryptoService API Base Class
 
 Responsible for common functionality between APIs. Likely don't need to change anything here.
 
 Class is initialized with a base API URL that can be modified to return the correct URL for fetching coin info.
**/
function CryptoService(url) {
  this.url = url;
  this.coins = {};
  this.name = this.constructor.name.toLowerCase();
}

/**
 * This is a global cache of available providers. They get registered here after being defined
 */
CryptoService.PROVIDERS = {};

/**
 * Generic fetchURL function, to fetch, retrieve, and parse into JSON content
 */
CryptoService.prototype.fetchURL = function(url) {
  Logger.log("Fetching " + url);

  var response = UrlFetchApp.fetch(url);
  var content = response.getContentText();
  try {
    var data = JSON.parse(content);
  } catch (e) {
    Logger.log("Error while parsing response from API: " + content);
  }
  
  return data;
}

/**
 * Fetch and parse all coins
 */
CryptoService.prototype.fetchAllCoinInfo = function(symbol) {
	return this.fetchURL(this.getAllCoinsURL(symbol));
}

/**
 * Update all coin information. API should have at least once function that
 * can get bulk price information—otherwise it'll be too slow.
 */
CryptoService.prototype.updateAllCoinInfo = function(symbol) {
  Logger.log("Updating all coin information");
  var data = this.fetchAllCoinInfo(symbol);
  this.coins = this.parseAllCoinData(data);
  Logger.log("Updated " + Object.keys(this.coins).length + " coins");
}

/**
 * Each API handles responses differently, parse coin data into a reasonable format.
 *
 * Currently we don't normalize data, but might in the future. If you want a coin attr,
 * you have to know how that specific API calls it.
 */
CryptoService.prototype.parseAllCoinData = function(data) {
  return data;
};

/**
 * Get all information for a coin. If a coin doesn't exist, attempt to fetch it.
 */
CryptoService.prototype.getCoin = function(symbol) {
  //symbol = symbol.toLowerCase();
  if (!this.coins[symbol]) this.updateAllCoinInfo(symbol);

  return this.coins[symbol];
}

/**
 * Get a coin attribute, with a potential fallback value
 */
CryptoService.prototype.getCoinAttr = function(symbol, attrName, failValue) {
  var coin = this.getCoin(symbol);
  if (coin) {
    return coin[attrName];
  }
  return failValue;
}

/**
 * Get a float (converted to number) coin attribute, with a potential fallback value
 */
CryptoService.prototype.getCoinFloatAttr = function(symbol, attrName, failValue) {
  if (typeof failValue != "number") {
    failValue = 0;
  }
  
  var coin = this.getCoin(symbol);
  if (coin) {
    return parseFloat(coin[attrName]);
  }
  return failValue;
}

/**
 * Get the coin price
 */
CryptoService.prototype.getCoinPrice = function(symbol) {
  return this.getCoinFloatAttr(symbol, this.getCoinPriceKey());
}

/**
 * Get the coin price key, used in subclasses
 */
CryptoService.prototype.getCoinPriceKey = function(keyAttrName) {
  throw new Error("Implement in sub-class");
}

/**
 * Get the URL for all coin price information, used in subclasses
 */

CryptoService.prototype.getAllCoinsURL = function(symbol) {
  throw new Error("Impelement in sub-class");
}

/**************************************************************************************/

/**
 * Coinbin API (https://coinbin.org/)
 *
 * Partial implementation of Coinbin API so we can use it in Google Sheets
 *
 * API structure looks like this, you can grab any of these attributes with getCoinAttr.
 *
 *    {
 *     "coin": {
 *       "btc": 1.00000000, 
 *       "name": "Bitcoin", 
 *       "rank": 1, 
 *       "ticker": "btc", 
 *       "usd": 3689.71
 *     }
 *   }
 */
function Coinbin() {
  CryptoService.call(this, "https://coinbin.org/");
}

/**
 * Setup prototype inheritence for Coinbin. This lets Coinbin use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
Coinbin.prototype = Object.create(CryptoService.prototype);
Coinbin.prototype.constructor = Coinbin;

CryptoService.PROVIDERS["coinbin"] = new Coinbin();

/**
 * Return URL for all coins
 */
Coinbin.prototype.getAllCoinsURL = function(symbol) {
  return this.url + "coins";
}

/**
 * Parse data from all coins
 */
Coinbin.prototype.parseAllCoinData = function(data) {
  return data.coins;
}

/**
 * Return key for price
 */
Coinbin.prototype.getCoinPriceKey = function(symbol) {
  return "usd";
}

/**************************************************************************************/

/**
 * CoinMarketCap API (https://api.coinmarketcap.com/v1/)
 *
 * Partial implementation of CoinMarketCap API so we can use it in Google Sheets
 *
 * API structure looks like this, you can grab any of these attributes with getCoinAttr.
 *
 *  {
 *       "id": "bitcoin", 
 *       "name": "Bitcoin", 
 *       "symbol": "BTC", 
 *       "rank": "1", 
 *       "price_usd": "3682.84", 
 *       "price_btc": "1.0", 
 *       "24h_volume_usd": "768015000.0", 
 *       "market_cap_usd": "61081971156.0", 
 *       "available_supply": "16585562.0", 
 *       "total_supply": "16585562.0", 
 *       "percent_change_1h": "-0.59", 
 *       "percent_change_24h": "-2.46", 
 *       "percent_change_7d": "1.0", 
 *       "last_updated": "1506297552"
 * },
 */
function CoinMarketCap() {
  CryptoService.call(this, "https://api.coinmarketcap.com/v1/");
}

/**
 * Setup prototype inheritence for CoinMarketCap. This lets CoinMarketCap use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
CoinMarketCap.prototype = Object.create(CryptoService.prototype);
CoinMarketCap.prototype.constructor = CoinMarketCap;

/**
 * Return URL for all coins
 */
CoinMarketCap.prototype.getAllCoinsURL = function(symbol) {
  return this.url + "ticker/?limit=0";
}

/**
 * Parse data from all coins. For CoinMarketCap we have to lowercase the symbol names.
 *
 * If there are coins with the same symbol, only store the one with the highest market cap.
 */
CoinMarketCap.prototype.parseAllCoinData = function(data) {
  var coins = {};
  for (var i in data) {
    var coin = data[i];
    var symbol = coin.symbol;//.toLowerCase();

    if (coins[symbol] == undefined) {
      coins[symbol] = coin;
    }
    else if (parseFloat(coin.market_cap_usd) > parseFloat(coins[symbol].market_cap_usd)) {
      coins[symbol] = coin;
    }
  }
  return coins;
}

/**
 * Return key for price
 */
CoinMarketCap.prototype.getCoinPriceKey = function() {
  return "price_usd";
}


/**************************************************************************************/

/**
 * quoine API (https://api.quoine.com//products/)
 
{"id":"1","product_type":"CurrencyPair","code":"CASH","name":" CASH Trading","market_ask":14540.03957,"market_bid":14528.16041,"indicator":-1,"currency":"USD","currency_pair_code":"BTCUSD","symbol":"$","btc_minimum_withdraw":null,"fiat_minimum_withdraw":null,"pusher_channel":"product_cash_btcusd_1","taker_fee":0.0,"maker_fee":0.0,"low_market_bid":14338.02563,"high_market_ask":15198.99,"volume_24h":1222.425638419999999988,"last_price_24h":15053.10679,"last_traded_price":14530.81604,"last_traded_quantity":0.00889657,"quoted_currency":"USD","base_currency":"BTC","disabled":false,"exchange_rate":1.0}
*/


function quoine() {
  CryptoService.call(this, "https://api.quoine.com//products/");
}

/**
 * Setup prototype inheritence for CoinMarketCap. This lets CoinMarketCap use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
quoine.prototype = Object.create(CryptoService.prototype);
quoine.prototype.constructor = quoine;

//CryptoService.PROVIDERS["quoine"] = new quoine();

/**
 * Return URL for all coins
 */
quoine.prototype.getAllCoinsURL = function(symbol) {
  return this.url;
}

/**
 * Parse data from all coins. For CoinMarketCap we have to lowercase the symbol names.
 *
 * If there are coins with the same symbol, only store the one with the highest market cap.
 */
quoine.prototype.parseAllCoinData = function(data) {
  var coins = {};
  for (var i in data) {
    var coin = data[i];
    var symbol = coin.currency_pair_code;//.toLowerCase();

    if (coins[symbol] == undefined) {
      coins[symbol] = coin;
    }
 //   else if (parseFloat(coin.market_cap_usd) > parseFloat(coins[symbol].market_cap_usd)) {
 //     coins[symbol] = coin;
//    }
  }
  return coins;
}

/**
 * Return key for price
 */
quoine.prototype.getCoinPriceKey = function() {
  return "market_bid";
}


/**************************************************************************************/

/**
 * Kucoin API (https://api.coinmarketcap.com/v1/)
 https://api.kucoin.com/v1/open/tick
 
 {"coinType":"KCS","trading":true,"symbol":"KCS-BTC","lastDealPrice":0.00090988,"buy":0.00090988,"sell":0.0009099,"change":0.00001032,"coinTypePair":"BTC","sort":0,"feeRate":0.001,"volValue":882.50568782,"high":0.0011,"datetime":1516159842000,"vol":986325.7026,"low":0.00072612,"changeRate":0.0115},
 
*/
function Kucoin() {
  CryptoService.call(this, "https://api.kucoin.com/v1/open/tick");
}

/**
 * Setup prototype inheritence for CoinMarketCap. This lets CoinMarketCap use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
Kucoin.prototype = Object.create(CryptoService.prototype);
Kucoin.prototype.constructor = Kucoin;

//CryptoService.PROVIDERS["Kucoin"] = new Kucoin();

/**
 * Return URL for all coins
 */
Kucoin.prototype.getAllCoinsURL = function(symbol) {
  return this.url;
}

/**
 * Parse data from all coins. For CoinMarketCap we have to lowercase the symbol names.
 *
 * If there are coins with the same symbol, only store the one with the highest market cap.
 */
Kucoin.prototype.parseAllCoinData = function(data) {
  var coins = {};
  for (var i in data.data) {
    var coin = data.data[i];
    var symbol = coin.symbol;//.toLowerCase();

    if (coins[symbol] == undefined) {
      coins[symbol] = coin;
    }
 //   else if (parseFloat(coin.market_cap_usd) > parseFloat(coins[symbol].market_cap_usd)) {
 //     coins[symbol] = coin;
//    }
  }
  return coins;
}

/**
 * Return key for price
 */
Kucoin.prototype.getCoinPriceKey = function() {
  return "sell";
}

/**************************************************************************************/

/**
 * cobinhood API (https://api.coinmarketcap.com/v1/)
 https://api.cobinhood.com/v1/market/tickers/BTC-USD
 
 {"success":true,"result":{"ticker":{"trading_pair_id":"BTC-USD","timestamp":1516169220000,"24h_high":"9498.9","24h_low":"6000.2","24h_open":"9351","24h_volume":"1.7163810400000004","last_trade_price":"6800.1","highest_bid":"6800.1","lowest_ask":"6800.1"}}}
 
*/
function cobinhood() {
  CryptoService.call(this, "https://api.cobinhood.com/");
}

/**
 * Setup prototype inheritence for CoinMarketCap. This lets CoinMarketCap use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
cobinhood.prototype = Object.create(CryptoService.prototype);
cobinhood.prototype.constructor = cobinhood;

//CryptoService.PROVIDERS["cobinhood"] = new cobinhood();

/**
 * Return URL for all coins
 */
cobinhood.prototype.getAllCoinsURL = function(symbol) {
  return this.url+"v1/market/tickers/" + symbol;
}

/**
 * Parse data from all coins. For CoinMarketCap we have to lowercase the symbol names.
 *
 * If there are coins with the same symbol, only store the one with the highest market cap.
 */
cobinhood.prototype.parseAllCoinData = function(data) {
  var coins = {};
 // for (var i in data.data) {
    var coin = data.result.ticker;
    var symbol = coin.trading_pair_id;//.toLowerCase();

    if (coins[symbol] == undefined) {
      coins[symbol] = coin;
    }
 //   else if (parseFloat(coin.market_cap_usd) > parseFloat(coins[symbol].market_cap_usd)) {
 //     coins[symbol] = coin;
//    }
 // }
  return coins;
}

/**
 * Return key for price
 */
cobinhood.prototype.getCoinPriceKey = function() {
  return "last_trade_price";
}


/**************************************************************************************/

/**
 * exmo API
 https://api.exmo.com/
 
 {"BTC_USD":{"buy_price":"10778","sell_price":"10778.01","last_trade":"10778","high":"14825.90483508","low":"10410.1","avg":"12533.05328135","vol":"2344.0810234","vol_curr":"25264528.71104372","updated":1516190556},"BTC_EUR":{"buy_price":"9389.94559151","sell_price":"9389.9456","last_trade":"9389.9456","high":"12417.49241748","low":"9311","avg":"10375.79670883","vol":"406.73037614","vol_curr":"3819176.10583429","updated":1516190398},"BTC_RUB":{"buy_price":"611000","sell_price":"614999.99898989","last_trade":"610928.0247164","high":"808808.808","low":"588120.83513","avg":"694887.25288472","vol":"1067.05778646","vol_curr":"656240537.59916138","updated":1516190556}} 
*/
function exmo() {
  CryptoService.call(this, "https://api.exmo.com/");
}

/**
 * Setup prototype inheritence for CoinMarketCap. This lets CoinMarketCap use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
exmo.prototype = Object.create(CryptoService.prototype);
exmo.prototype.constructor = exmo;


/**
 * Return URL for all coins
 */
exmo.prototype.getAllCoinsURL = function(symbol) {
  return this.url+"v1/ticker/";
}

/**
 * Parse data from all coins. For CoinMarketCap we have to lowercase the symbol names.
 *
 * If there are coins with the same symbol, only store the one with the highest market cap.
 */
exmo.prototype.parseAllCoinData = function(data) {
  var coins = {};
  for (var i in data) {
    var coin = data[i];
    var symbol = i;//.toLowerCase();

    if (coins[symbol] == undefined) {
      coins[symbol] = coin;
    }
 //   else if (parseFloat(coin.market_cap_usd) > parseFloat(coins[symbol].market_cap_usd)) {
 //     coins[symbol] = coin;
//    }
  }
  return coins;
}

/**
 * Return key for price
 */
exmo.prototype.getCoinPriceKey = function() {
  return "sell";
}

/**************************************************************************************/

/**
 * exx API
 https://api.exx.com/data/v1/tickers
 
 {
   "btc_usdt" : {
      "vol" : "105.7896",
      "last" : "11548.79",
      "buy" : "11400.42",
      "sell" : "11560.29",
      "weekRiseRate" : -28.26,
      "riseRate" : 4.92,
      "high" : "12532.98",
      "low" : "10000.0",
      "monthRiseRate" : -32.41
   },
   "eth_btc" : {
      "vol" : 0.0,
      "last" : 0,
      "sell" : 0.0,
      "buy" : 0.0,
      "weekRiseRate" : 0.0,
      "riseRate" : 0.0,
      "high" : 0.0,
      "low" : 0,
      "monthRiseRate" : 0.0
   }
}

 */
function exx() {
  CryptoService.call(this, "https://api.exx.com/");
}

/**
 * Setup prototype inheritence for CoinMarketCap. This lets CoinMarketCap use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
exx.prototype = Object.create(CryptoService.prototype);
exx.prototype.constructor = exx;


/**
 * Return URL for all coins
 */
exx.prototype.getAllCoinsURL = function(symbol) {
  return this.url+"data/v1/tickers";
}


/**
 * Parse data from all coins. For CoinMarketCap we have to lowercase the symbol names.
 *
 * If there are coins with the same symbol, only store the one with the highest market cap.
 */
exx.prototype.parseAllCoinData = function(data) {
  var coins = {};
  for (var i in data) {
    var coin = data[i];
    var symbol = i;//.toLowerCase();

    if (coins[symbol] == undefined) {
      coins[symbol] = coin;
    }
 //   else if (parseFloat(coin.market_cap_usd) > parseFloat(coins[symbol].market_cap_usd)) {
 //     coins[symbol] = coin;
//    }
  }
  return coins;
}

/**
 * Return key for price
 */
exx.prototype.getCoinPriceKey = function() {
  return "sell";
}

/**************************************************************************************/

/**
 * tidex API 
 https://api.tidex.com/api/3/ticker/btc_usdt
 
{"btc_usdt":{"high":11719.0159029,"low":9291.40091,"avg":10505.20840645,"vol":75462.5433176016479187,"vol_cur":7.02864737,"last":11678.3453633,"buy":11625.9820184,"sell":11730.7087082,"updated":1516286220}} 
*/
function tidex() {
  CryptoService.call(this, "https://api.tidex.com/");
}

/**
 * Setup prototype inheritence for CoinMarketCap. This lets CoinMarketCap use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
tidex.prototype = Object.create(CryptoService.prototype);
tidex.prototype.constructor = tidex;


/**
 * Return URL for all coins
 */
tidex.prototype.getAllCoinsURL = function(symbol) {
  return this.url+"api/3/ticker/" + symbol;
}

/**
 * Parse data from all coins. For CoinMarketCap we have to lowercase the symbol names.
 *
 * If there are coins with the same symbol, only store the one with the highest market cap.
 */
tidex.prototype.parseAllCoinData = function(data) {
  var coins = {};
  for (var i in data) {
    var coin = data[i];
    var symbol = i;//.toLowerCase();

    if (coins[symbol] == undefined) {
      coins[symbol] = coin;
    }
 //   else if (parseFloat(coin.market_cap_usd) > parseFloat(coins[symbol].market_cap_usd)) {
 //     coins[symbol] = coin;
//    }
  }
  return coins;
}

/**
 * Return key for price
 */
tidex.prototype.getCoinPriceKey = function() {
  return "last";
}


/**************************************************************************************/

/**
 * Register Crypto API providers
 */
var PROVIDERS = [
  new Coinbin(),
  new quoine(),
  new Kucoin(),
  new cobinhood(),
  new exmo(),
  new exx(),
  new tidex(),
  new CoinMarketCap()
];
  
/**
 * Private helper function for finding providers by name
 */
function _provider(name) {
  for (var i in PROVIDERS) {
    if (PROVIDERS[i].name == name) {
      return PROVIDERS[i];
    }
  }
}

/**
 * Private cache of currently used APIs. So we know which ones are being used when we refresh
 */

var _apis = {};

/**
 * Private helper function for finding apis by name (with backup to default service)
 */
function _api(service) {
  var api = _apis[service];
  if (!api) {
    api = _provider(service) || _provider(DEFAULT_CRYPTO_SERVICE);
    if (api) {
      _apis[service] = api;
    }
  }
  
  return api;
}

/**************************************************************************************/

/**
 * getCoinPrice
 *
 * Public function for retrieving crypto coin price, from a specific service
 */
function getCoinPrice(symbol, service) {
  return _api(service).getCoinPrice(symbol);
  
  //test
 // return _api("quoine").getCoinPrice("BTCUSD");
//  return _api("coinmarketcap").getCoinPrice("BTC");
//  return _api("kucoin").getCoinPrice("BTC-USDT");
  //return _api("exmo").getCoinPrice("BTC_USDT");
}

/**
 * getCoinAttr
 *
 * Public function for retrieving a crypto coin attr, from a specific service.
 * You must know the name of the attribute from the API you want.
 */
function getCoinAttr(symbol, attr, service) {
  return _api(service).getCoinAttr(symbol, attr);
}

/**
 * getCoinFloatAttr
 *
 * Public function for retrieving a numeric crypto coin attr, from a specific service.
 * You must know the name of the attribute from the API you want. Will be converted to a number.
 */
function getCoinFloatAttr(symbol, attr, service) {
  return _api(service).getCoinFloatAttr(symbol, attr);
  
  //test
  //return _api("cobinhood").getCoinFloatAttr("BTC-USD", "last_trade_price");
}

/**
 * refresh
 *
 * Refresh all currently used APIs and cache bust all =getCoin* functions
 *
 * Google Sheets makes it hard to update data frequently, so we have to add a random timestamp parameter
 * to the end.
 */
function refresh() {
  
  for (var service in _apis) {
    var api = _apis[service];
    api.updateAllCoinInfo();
  }

  var sheet = SpreadsheetApp.getActiveSheet();
  var data = sheet.getDataRange().getFormulas();
  for (var i = 0; i < data.length; i++) {
    var row = data[i]
    for (var j=0; j<row.length; j++) {
      var formula = row[j];
      if (formula.indexOf("=getCoin")==0) {
        sheet.getRange(i+1,j+1).setFormula(_addTimestampArg(formula));
      }
    }
  }
}

/**
 * Private function to add a random timestamp to an end of a formula. This is needed to cache bust the =getCoin* functions
 */
function _addTimestampArg(formula) {
  var now = new Date();
  var partAfterFunction="";
  var parts = formula.split(")");
  if (parts.length>1) partAfterFunction = parts[1];
  var parts = parts[0].split(",");
  var lastPart = parts[parts.length-1];
  var newLastPart = '"ts='+now.getTime()+'")' + partAfterFunction;
  if (lastPart.indexOf("ts=")>0)
    parts[parts.length-1]=newLastPart;
  else {
    parts.push(newLastPart);
  }
  return parts.join(",");
}

/**
 * Create a cryptocurrency menu item to refresh prices
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Cryptocurrency').addItem('Refresh Prices', 'refresh').addToUi();
}
