// lib/services/api_service.dart (穩定版 - 移除C部分邏輯)

import 'package:http/http.dart' as http;
import 'dart:convert';
import '../models/schwab_models.dart';
import '../models/unified_position.dart';
import '../main.dart'; // 為了 supabase client

class ApiService {
  final String _baseUrl = 'https://paper-auto-trade-backend.onrender.com'; 

  // 這是一個基礎的、用來獲取認證標頭的輔助函數
  Future<Map<String, String>> _getAuthenticatedHeaders() async {
    final session = supabase.auth.currentSession;
    if (session == null) {
      throw Exception('使用者未登入，無法發送請求。');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ${session.accessToken}',
    };
  }

  // 每個 API 呼叫都直接、清晰地執行
  Future<SchwabAccount> getSchwabAccountSummary() async {
    final headers = await _getAuthenticatedHeaders();
    final response = await http.get(
      Uri.parse('$_baseUrl/api/schwab/account'),
      headers: headers,
    );
    if (response.statusCode == 200) {
      return SchwabAccount.fromJson(json.decode(response.body));
    } else {
      print('getSchwabAccountSummary 失敗: ${response.body}');
      throw Exception('無法載入 Schwab 帳戶總覽 (狀態碼: ${response.statusCode})');
    }
  }

  Future<List<UnifiedPosition>> getSchwabPositions() async {
    final headers = await _getAuthenticatedHeaders();
    final response = await http.get(
      Uri.parse('$_baseUrl/api/schwab/positions'),
      headers: headers,
    );
    if (response.statusCode == 200) {
      final List<dynamic> jsonList = json.decode(response.body);
      return jsonList.map((json) => UnifiedPosition.fromSchwabJson(json)).toList();
    } else {
      print('getSchwabPositions 失敗: ${response.body}');
      throw Exception('無法載入 Schwab 持股列表 (狀態碼: ${response.statusCode})');
    }
  }

  Future<Map<String, dynamic>> getSimulationPortfolio() async {
    final headers = await _getAuthenticatedHeaders();
    final response = await http.get(
      Uri.parse('$_baseUrl/api/simulation/portfolio'),
      headers: headers,
    );
    if (response.statusCode == 200) {
      final Map<String, dynamic> portfolioData = json.decode(response.body);
      final List<dynamic> positionList = portfolioData['positions'] ?? [];
      portfolioData['positions'] = positionList.map((json) => UnifiedPosition.fromSimulationJson(json)).toList();
      return portfolioData;
    } else {
      print('getSimulationPortfolio 失敗: ${response.body}');
      throw Exception('無法載入模擬投資組合 (狀態碼: ${response.statusCode})');
    }
  }
}