// lib/models/schwab_models.dart (完整版)

import 'dart:convert';

// ==================== 用於「帳戶總覽」的模型 ====================

class SchwabAccount {
    final SecuritiesAccount securitiesAccount;
    SchwabAccount({ required this.securitiesAccount });
    factory SchwabAccount.fromJson(Map<String, dynamic> json) => SchwabAccount(
        securitiesAccount: SecuritiesAccount.fromJson(json["securitiesAccount"]),
    );
}

class SecuritiesAccount {
    final String accountNumber;
    final String hashedAccountNumber; // 我們需要這個來查詢持股
    final CurrentBalances currentBalances;
    SecuritiesAccount({ required this.accountNumber, required this.hashedAccountNumber, required this.currentBalances });
    factory SecuritiesAccount.fromJson(Map<String, dynamic> json) => SecuritiesAccount(
        accountNumber: json["accountNumber"],
        hashedAccountNumber: json["hashedAccountNumber"], // 確保解析這個欄位
        currentBalances: CurrentBalances.fromJson(json["currentBalances"]),
    );
}

class CurrentBalances {
    final double liquidationValue;
    final double availableFunds;
    final double buyingPower;
    final double longMarketValue;
    CurrentBalances({ required this.liquidationValue, required this.availableFunds, required this.buyingPower, required this.longMarketValue });
    factory CurrentBalances.fromJson(Map<String, dynamic> json) => CurrentBalances(
        liquidationValue: json["liquidationValue"]?.toDouble() ?? 0.0,
        availableFunds: json["availableFunds"]?.toDouble() ?? 0.0,
        buyingPower: json["buyingPower"]?.toDouble() ?? 0.0,
        longMarketValue: json["longMarketValue"]?.toDouble() ?? 0.0,
    );
}


// ==================== 用於「持股列表」的模型 ====================

List<SchwabPosition> schwabPositionFromJson(String str) => List<SchwabPosition>.from(json.decode(str).map((x) => SchwabPosition.fromJson(x)));

class SchwabPosition {
    final double averagePrice;
    final double longQuantity;
    final double marketValue;
    final PositionInstrument instrument;
    SchwabPosition({ required this.averagePrice, required this.longQuantity, required this.marketValue, required this.instrument });
    factory SchwabPosition.fromJson(Map<String, dynamic> json) => SchwabPosition(
        averagePrice: json["averagePrice"]?.toDouble() ?? 0.0,
        longQuantity: json["longQuantity"]?.toDouble() ?? 0.0,
        marketValue: json["marketValue"]?.toDouble() ?? 0.0,
        instrument: PositionInstrument.fromJson(json["instrument"]),
    );
}

class PositionInstrument {
    final String symbol;
    final String assetType;
    PositionInstrument({ required this.symbol, required this.assetType });
    factory PositionInstrument.fromJson(Map<String, dynamic> json) => PositionInstrument(
        symbol: json["symbol"],
        assetType: json["assetType"],
    );
}