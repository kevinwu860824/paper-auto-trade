// lib/services/simulation_api_service.dart (最終安全版 - 附帶 Supabase JWT)

import 'package:http/http.dart' as http;
import 'dart:convert';
import '../main.dart'; // 為了 supabase client

class SimulationApiService {
  final String _baseUrl = 'https://paper-auto-trade-backend.onrender.com'; 

  // ✨ 新增一個私有方法，用來產生每一次請求都需要的、包含認證資訊的 Headers ✨
  Future<Map<String, String>> _getAuthenticatedHeaders() async {
    // 從 Supabase 獲取當前的 session
    final session = supabase.auth.currentSession;
    
    // 檢查 session 和 access token 是否存在
    if (session == null || session.accessToken.isEmpty) {
      // 如果沒有登入，就拋出一個錯誤，防止發送無效請求
      throw Exception('使用者未登入，無法發送請求。');
    }

    // 回傳一個包含 "Authorization" 標頭的 Map
    // 'Bearer ' 後面跟著的就是 Supabase 發給我們的 JWT
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ${session.accessToken}',
    };
  }

  // ✨ 修改 getPortfolio，讓它使用新的 Headers ✨
  Future<Map<String, dynamic>> getPortfolio() async {
    // 在發送請求前，先獲取 Headers
    final headers = await _getAuthenticatedHeaders();
    
    // 在 http.get 請求中，傳入 headers 參數
    final response = await http.get(
      Uri.parse('$_baseUrl/api/simulation/portfolio'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      // 這裡可以加上更詳細的錯誤處理，例如判斷是否需要重新 Schwab 登入
      print('API Error Body: ${response.body}');
      throw Exception('Failed to load portfolio (Status code: ${response.statusCode})');
    }
  }

  // ✨ 修改 executeTrade，讓它也使用新的 Headers ✨
  Future<Map<String, dynamic>> executeTrade(String ticker, int shares, String tradeType) async {
    final headers = await _getAuthenticatedHeaders();
    final endpoint = tradeType.toUpperCase() == 'BUY' ? '/api/simulation/buy' : '/api/simulation/sell';

    final response = await http.post(
      Uri.parse('$_baseUrl$endpoint'),
      headers: headers,
      body: json.encode({'ticker': ticker, 'shares': shares}),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      print('API Error Body: ${response.body}');
      throw Exception('Failed to execute trade (Status code: ${response.statusCode})');
    }
  }
}