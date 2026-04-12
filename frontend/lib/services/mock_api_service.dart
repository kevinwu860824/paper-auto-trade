import 'dart:async';
import 'dart:math';

class MockApiService {
  final Random _random = Random();

  Future<Map<String, dynamic>> getAccountSummary() async {
    // 模擬網路延遲
    await Future.delayed(Duration(milliseconds: 300 + _random.nextInt(400)));
    
    // 回傳一筆假的帳戶總覽資料
    return {
      'userName': 'Kevin Wu',
      'totalValue': 125680.77,
      'dailyChange': -350.45,
      'dailyChangePercent': -0.28,
    };
  }

  Future<List<Map<String, dynamic>>> getPositions() async {
  // 模擬網路延遲
  await Future.delayed(Duration(milliseconds: 600 + _random.nextInt(500)));
  
  // 回傳一個更詳細的假的持股列表
  return [
    {
      'ticker': 'AAPL', 
      'shares': 50, 
      'value': 8750.00, // 現值
      'type': 'auto', 
      'avgCost': 150.00, // 平均成本
      'dailyChange': 120.50, // 今日漲跌
    },
    {
      'ticker': 'TSLA', 
      'shares': 20, 
      'value': 14800.00, 
      'type': 'manual', 
      'avgCost': 800.00,
      'dailyChange': -250.00,
    },
    {
      'ticker': 'SPY', 
      'shares': 100, 
      'value': 45300.10, 
      'type': 'auto', 
      'avgCost': 420.50,
      'dailyChange': 300.10,
    },
    {
      'ticker': 'GOOG', 
      'shares': 15, 
      'value': 21954.30, 
      'type': 'auto', 
      'avgCost': 1400.00,
      'dailyChange': -45.70,
    },
  ];
}


    Future<List<Map<String, dynamic>>> getRecentTrades() async {
    await Future.delayed(Duration(milliseconds: 400 + _random.nextInt(300)));
    return [
      {'ticker': 'SPY', 'type': 'BUY', 'shares': 10, 'price': 450.00, 'date': '2025-09-26'},
      {'ticker': 'AAPL', 'type': 'SELL', 'shares': 5, 'price': 172.00, 'date': '2025-09-25'},
      {'ticker': 'GOOG', 'type': 'BUY', 'shares': 2, 'price': 1450.00, 'date': '2025-09-24'},
    ];
  }
}