// lib/portfolio.dart (全新版本)

import 'dart:convert';

// 用於解析來自我們後端 /api/schwab/account 的整個 JSON 陣列
List<SchwabAccount> schwabAccountFromJson(String str) => List<SchwabAccount>.from(json.decode(str).map((x) => SchwabAccount.fromJson(x)));

// 代表一個 Schwab 帳戶的 Class
class SchwabAccount {
    final SecuritiesAccount securitiesAccount;

    SchwabAccount({
        required this.securitiesAccount,
    });

    // Factory constructor: 從 JSON 建立一個 SchwabAccount 物件
    factory SchwabAccount.fromJson(Map<String, dynamic> json) => SchwabAccount(
        securitiesAccount: SecuritiesAccount.fromJson(json["securitiesAccount"]),
    );
}

// 代表帳戶中的證券部分
class SecuritiesAccount {
    final String accountNumber;
    final CurrentBalances currentBalances;

    SecuritiesAccount({
        required this.accountNumber,
        required this.currentBalances,
    });

    factory SecuritiesAccount.fromJson(Map<String, dynamic> json) => SecuritiesAccount(
        accountNumber: json["accountNumber"],
        currentBalances: CurrentBalances.fromJson(json["currentBalances"]),
    );
}

// 代表帳戶的核心餘額數據
class CurrentBalances {
    final double liquidationValue; // 清算價值 (最重要的總資產指標)
    final double availableFunds;   // 可用資金
    final double buyingPower;      // 購買力
    final double longMarketValue;  // 持有多頭倉位的市場價值

    CurrentBalances({
        required this.liquidationValue,
        required this.availableFunds,
        required this.buyingPower,
        required this.longMarketValue,
    });

    factory CurrentBalances.fromJson(Map<String, dynamic> json) => CurrentBalances(
        // 使用 .toDouble() 確保型別正確
        liquidationValue: json["liquidationValue"]?.toDouble() ?? 0.0,
        availableFunds: json["availableFunds"]?.toDouble() ?? 0.0,
        buyingPower: json["buyingPower"]?.toDouble() ?? 0.0,
        longMarketValue: json["longMarketValue"]?.toDouble() ?? 0.0,
    );
}