// watchlist.js
// 資料整理時間：2025年9月
// 來源：公開ETF持股資訊

const nasdaq100 = [
  'MSFT', 'AAPL', 'NVDA', 'AMZN', 'META', 'AVGO', 'GOOGL', 'GOOG', 'COST', 
  'TSLA', 'AMD', 'NFLX', 'PEP', 'ADBE', 'QCOM', 'INTC', 'TMUS', 'CSCO',
  'AMAT', 'CMCSA', 'INTU', 'TXN', 'HON', 'AMGN', 'BKNG', 'ISRG', 'VRTX',
  'LRCX', 'SBUX', 'GILD', 'ADP', 'MDLZ', 'ADI', 'REGN', 'PYPL', 'PANW',
  'MU', 'SNPS', 'KLAC', 'CDNS', 'ASML', 'CRWD', 'PCAR', 'CSX', 'MAR',
  'ORLY', 'ABNB', 'ROP', 'CTAS', 'MELI', 'FTNT', 'KDP', 'FAST', 'DXCM',
  'AEP', 'PAYX', 'MNST', 'LULU', 'CEG', 'IDXX', 'BIIB', 'EXC', 'MRNA',
  'GEHC', 'CPRT', 'KHC', 'ROST', 'ODFL', 'CSGP', 'ON', 'DDOG', 'BKR',
  'FANG', 'MCHP', 'AZN', 'SIRI', 'EA', 'XEL', 'VRSK', 'DLTR', 'CDW',
  'TTD', 'CTSH', 'PCG', 'ILMN', 'ZS', 'WBD', 'DASH', 'ALGN', 'EBAY',
  'JD', 'WBA', 'SGEN', 'ENPH', 'WDAY', 'TEAM'
];

const phlxSemiconductor = [
  'NVDA', 'AVGO', 'AMD', 'QCOM', 'INTC', 'AMAT', 'LRCX', 'TSM', 'MU', 
  'KLAC', 'ASML', 'ADI', 'TXN', 'MCHP', 'ON', 'SNPS', 'CDNS', 'TER',
  'STM', 'IFX', 'NXPI', 'UMC', 'GFS', 'FSLR', 'SWKS', 'MRVL', 'MPWR',
  'RMBS', 'WOLF', 'QRVO'
];

// 合併兩個列表並移除重複項
const combinedWatchlist = [...new Set([...nasdaq100, ...phlxSemiconductor])];

// 匯出合併後的列表
module.exports = combinedWatchlist;