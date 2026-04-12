// lib/models/unified_position.dart

class UnifiedPosition {
  final String symbol;
  final double shares;
  final double avgCost;
  final double currentPrice;
  final double currentValue;
  final String assetType;
  final double dailyChange;
  final double dailyChangePercent;
  final double totalGainLoss;
  final double dayHigh;
  final double dayLow;
  final double portfolioPercentage; // 這個欄位將在前端計算

  UnifiedPosition({
    required this.symbol,
    required this.shares,
    required this.avgCost,
    required this.currentPrice,
    required this.currentValue,
    this.assetType = 'EQUITY', // 模擬數據可能沒有這個欄位，給個預設值
    required this.dailyChange,
    required this.dailyChangePercent,
    required this.totalGainLoss,
    this.dayHigh = 0.0, // 模擬數據可能沒有
    this.dayLow = 0.0,  // 模擬數據可能沒有
    this.portfolioPercentage = 0.0,
  });

  // 從 Schwab API 的 JSON 格式建立物件
  factory UnifiedPosition.fromSchwabJson(Map<String, dynamic> json) {
    return UnifiedPosition(
      symbol: json['symbol'] ?? '',
      shares: (json['shares'] as num?)?.toDouble() ?? 0.0,
      avgCost: (json['avgCost'] as num?)?.toDouble() ?? 0.0,
      currentPrice: (json['currentPrice'] as num?)?.toDouble() ?? 0.0,
      currentValue: (json['currentValue'] as num?)?.toDouble() ?? 0.0,
      assetType: json['assetType'] ?? 'UNKNOWN',
      dailyChange: (json['dailyChange'] as num?)?.toDouble() ?? 0.0,
      dailyChangePercent: (json['dailyChangePercent'] as num?)?.toDouble() ?? 0.0,
      totalGainLoss: (json['totalGainLoss'] as num?)?.toDouble() ?? 0.0,
      dayHigh: (json['dayHigh'] as num?)?.toDouble() ?? 0.0,
      dayLow: (json['dayLow'] as num?)?.toDouble() ?? 0.0,
    );
  }

  // 從 Simulation API 的 JSON 格式建立物件
  factory UnifiedPosition.fromSimulationJson(Map<String, dynamic> json) {
    final double shares = (json['shares'] as num?)?.toDouble() ?? 0.0;
    final double avgCost = (json['avgCost'] as num?)?.toDouble() ?? 0.0;
    final double currentValue = (json['currentValue'] as num?)?.toDouble() ?? 0.0;
    final double totalCost = avgCost * shares;

    return UnifiedPosition(
      symbol: json['ticker'] ?? '',
      shares: shares,
      avgCost: avgCost,
      currentPrice: (json['currentPrice'] as num?)?.toDouble() ?? 0.0,
      currentValue: currentValue,
      dailyChange: (json['dailyChange'] as num?)?.toDouble() ?? 0.0,
      dailyChangePercent: (json['dailyChangePercent'] as num?)?.toDouble() ?? 0.0,
      totalGainLoss: currentValue - totalCost,
    );
  }
}