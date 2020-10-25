require('dotenv').config()
const Web3 = require('web3')
const EthTx = require('ethereumjs-tx')
const moment = require('moment')
const fs = require('fs')
const { concat, isUndefined } = require('lodash')

let priceMonitor
let priceMonitorToStopLoss
let monitoringPrice = false
let monitoringPriceBuy = false
let stoplossPrice = 0

const TOKEN_ADDRESS = process.env.REACT_APP_TOKEN_ADDRESS
const EXCHANGE_ADDRESS = process.env.REACT_APP_EXCHANGE_ADDRESS
const TOKEN_ABI = JSON.parse(process.env.REACT_APP_TOKEN_ABI)
const EXCHANGE_ABI = JSON.parse(process.env.REACT_APP_EXCHANGE_ABI)

const web3HD = new Web3(new Web3.providers.HttpProvider(process.env.REACT_APP_RPC_URL))
const tokenContract = new web3HD.eth.Contract(TOKEN_ABI, TOKEN_ADDRESS)
const exchangeContract = new web3HD.eth.Contract(EXCHANGE_ABI, EXCHANGE_ADDRESS)

async function monitorTokenPrice() {
  const oneeth = web3HD.utils.toWei('1', 'Ether')
  const tokenAmountforeth = await exchangeContract.methods.getEthToTokenInputPrice(oneeth).call()
  const tokenPriceforeth = web3HD.utils.fromWei(tokenAmountforeth.toString(), 'Ether')
  calculateMovingAvg(tokenPriceforeth)
}

async function monitorTokenPriceToSell() {
  const ethValue = web3HD.utils.toWei(process.env.REACT_APP_ETH_AMOUNT.toString(), 'Ether')
  const tokenAmountforethValue = await exchangeContract.methods.getEthToTokenInputPrice(ethValue).call()
  const tokenPriceforethValue = web3HD.utils.fromWei(tokenAmountforethValue.toString(), 'Ether')

  console.log('market price - ', tokenPriceforethValue)
  console.log('stop loss    - ', stoplossPrice)
  if (tokenPriceforethValue < stoplossPrice){
    placeSellOrder('stoploss')
  }
}

async function placeBuyOrder() {
  try {
    const ethValue = web3HD.utils.toWei(process.env.REACT_APP_ETH_AMOUNT.toString(), 'Ether')
    const tokenAmountforethValue = await exchangeContract.methods.getEthToTokenInputPrice(ethValue).call()
    const tokenPriceforethValue = web3HD.utils.fromWei(tokenAmountforethValue.toString(), 'Ether')

    stoplossPrice = tokenPriceforethValue - (tokenPriceforethValue * (5 / 100))
    console.log('stop loss price set to -', stoplossPrice)
    console.log('looking for market price every sec for stop loss price..')

    const ETH_SOLD = web3HD.utils.toHex(ethValue)
    const MIN_TOKENS = web3HD.utils.toHex(0.2 * 10 ** 18)
    const now = moment().unix()
    const DEADLINE = now + 60 * 20
    
    const exchangeEncodedABI = exchangeContract.methods.ethToTokenSwapInput(MIN_TOKENS, DEADLINE).encodeABI()

    function sendSignedTx(transactionObject, cb) {
      let transaction = new EthTx(transactionObject);
      const privateKey = new Buffer.from(process.env.REACT_APP_PRIVATE_KEY, "hex");
      transaction.sign(privateKey);
      const serializedEthTx = transaction.serialize().toString("hex");
      web3HD.eth.sendSignedTransaction(`0x${serializedEthTx}`, cb);
    }

    web3HD.eth.getTransactionCount(process.env.REACT_APP_ACCOUNT).then(transactionNonce => {
      const transactionObject = {
        chainId: 3,
        nonce: web3HD.utils.toHex(transactionNonce),
        gasLimit: web3HD.utils.toHex(process.env.REACT_APP_GAS_LIMIT),
        gasPrice: web3HD.utils.toHex(process.env.REACT_APP_GAS_PRICE),
        to: EXCHANGE_ADDRESS,
        from: process.env.REACT_APP_ACCOUNT,
        data: exchangeEncodedABI,
        value: ETH_SOLD
      }
      sendSignedTx(transactionObject, function(error, result){
        if(error) return console.log("error ===>", error);
        console.log("Buy Order transaction Complete ", result);
      })
    })
    clearInterval(priceMonitor)
  } catch (error) {
    console.error(error)
    clearInterval(priceMonitor)
    return
  }

  // check price for stop loss
  const POLLING_INTERVAL = process.env.REACT_APP_POLLING_INTERVAL || 1000 // 1 Second
  priceMonitorToStopLoss = setInterval(async () => { await monitorTokenPriceToSell() }, POLLING_INTERVAL)
}

async function placeSellOrder(type) {
  if(monitoringPriceBuy){
    return
  }

  monitoringPriceBuy = true

  try {
    const TOKENS = web3HD.utils.toHex('115792089237316195423570985008687907853269984665640564039457584007913129639935')
    const approveEncodedABI = tokenContract.methods.approve(EXCHANGE_ADDRESS, TOKENS).encodeABI()
    
    function sendSignedTx(transactionObject, cb) {
      let transaction = new EthTx(transactionObject);
      const privateKey = new Buffer.from(process.env.REACT_APP_PRIVATE_KEY, "hex");
      transaction.sign(privateKey);
      const serializedEthTx = transaction.serialize().toString("hex");
      web3HD.eth.sendSignedTransaction(`0x${serializedEthTx}`, cb);
    }

    web3HD.eth.getTransactionCount(process.env.REACT_APP_ACCOUNT).then(transactionNonce => {
      const transactionObject = {
        chainId: 3,
        nonce: web3HD.utils.toHex(transactionNonce),
        gasLimit: web3HD.utils.toHex(process.env.REACT_APP_GAS_LIMIT),
        gasPrice: web3HD.utils.toHex(process.env.REACT_APP_GAS_PRICE),
        to: TOKEN_ADDRESS,
        from: process.env.REACT_APP_ACCOUNT,
        data: approveEncodedABI
      }
      sendSignedTx(transactionObject, function(error, result){
        if(error) return console.log("error ===>", error);
          console.log("Approve =>", result);
      })
    });
  
    let TOKEN_SOLD
    if(type === 'stoploss'){
      const ethValue = web3HD.utils.toWei(process.env.REACT_APP_ETH_AMOUNT.toString(), 'Ether')
      const tokenAmountforethValue = await exchangeContract.methods.getEthToTokenInputPrice(ethValue).call()
      TOKENS_SOLD = web3HD.utils.toHex(tokenAmountforethValue.toString());
    } else{
      TOKENS_SOLD = web3HD.utils.toHex(process.env.REACT_APP_TOKEN_AMOUNT.toString());
    }
    const MIN_ETH = web3HD.utils.toHex(5000000000000000);
    const now = moment().unix()
    const DEADLINE = now + 60 * 20

    const tokenToEthEncodedABI = exchangeContract.methods.tokenToEthSwapInput(TOKENS_SOLD, MIN_ETH, DEADLINE).encodeABI();

    web3HD.eth.getTransactionCount(process.env.REACT_APP_ACCOUNT).then(transactionNonce => {
      const transactionObject = {
        chainId: 3,
        nonce: web3HD.utils.toHex(transactionNonce + 1),
        gasLimit: web3HD.utils.toHex(process.env.REACT_APP_GAS_LIMIT),
        gasPrice: web3HD.utils.toHex(process.env.REACT_APP_GAS_PRICE),
        to: EXCHANGE_ADDRESS,
        from: process.env.REACT_APP_ACCOUNT,
        data: tokenToEthEncodedABI
      }
      sendSignedTx(transactionObject, function(error, result){
        if(error) return console.log("error ===>", error);
          console.log("Transaction Complete", result);
      })
    });
    clearInterval(priceMonitorToStopLoss)
  }
  catch (error) {
    console.error(error)
    clearInterval(priceMonitorToStopLoss)
    return
  }
}

async function calculateMovingAvg(tokenPrice) {
  if(monitoringPrice) {
    return
  }

  let histPrice
  let ma_50
  let ma_200

  const data = fs.readFileSync(process.env.REACT_APP_HIST_PRICE_FILE_NAME, 'utf8')
  histPrice = data.split(':')

  function addDays(date, days) {
    const copy = new Date(Number(date))
    copy.setDate(date.getDate() + days)
    return copy
  }

  function getMonth(d) {
    let month
    if (d.getMonth() < 9){
      month = '0' + (d.getMonth() + 1).toString()
    } else{
      month = (d.getMonth() + 1).toString()
    }
    return month
  }

  function getDay(d) {
    let day
    if (d.getDate() < 10){
      day = '0' + d.getDate().toString()
    } else{
      day = d.getDate().toString()
    }
    return day
  }

  const d = new Date()
  const today = d.getFullYear().toString() + getMonth(d) + getDay(d)
  const prevD = addDays(d, -1);
  const prevDate = prevD.getFullYear().toString() + getMonth(prevD) + getDay(prevD)
  
  if(isUndefined(histPrice.find(e => e > prevDate))){
    fs.appendFileSync(process.env.REACT_APP_HIST_PRICE_FILE_NAME, ':' + today.toString() + ':' + tokenPrice.toString())  
  }

  const minus50 = addDays(d, -50);
  const minus200 = addDays(d, -200);
  const date50 = minus50.getFullYear().toString() + getMonth(minus50) + getDay(minus50)
  const date200 = minus200.getFullYear().toString() + getMonth(minus200) + getDay(minus200)

  ma_50 = data.toString().split(date50)
  ma_50_1 = ma_50[1].split(':')
  ma_200 = data.toString().split(date200)
  ma_200_1 = ma_200[1].split(':')

  let data50 = 0
  for (i = 1; i < ma_50_1.length; i++) {
    if(i % 2 !== 0){
      data50 = data50 + parseInt(ma_50_1[i])
    }
  }
  ma_50_value = data50 / 50
  
  let data200 = 0
  for (i = 1; i < ma_200_1.length; i++) {
    if(i % 2 !== 0){
      data200 = data200 + parseInt(ma_200_1[i])
    }
  }
  ma_200_value = data200 / 200

  //console.log('50 days moving avg. - ', ma_50_value)
  //console.log('200 days moving avg. - ', ma_200_value)

  if(ma_50_value > ma_200_value){
    monitoringPrice = true
    console.log('50 days moving avg. is greater than 200 days moving avg.')
    console.log('placing buy order..')
    placeBuyOrder()
    clearInterval(priceMonitor)
  } else if (ma_50_value < ma_200_value){
    monitoringPrice = true
    console.log('200 days moving avg. is greater than 50 days moving avg.')
    console.log('placing sell order..')
    placeSellOrder()
    clearInterval(priceMonitor)
  }
}

async function run() {
  const POLLING_INTERVAL = process.env.REACT_APP_POLLING_INTERVAL || 1000 // 1 Second
  priceMonitor = setInterval(async () => { await monitorTokenPrice() }, POLLING_INTERVAL)
}

console.log('process start...')
run()
