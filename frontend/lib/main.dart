// lib/main.dart (響應式儀表板 - 最終整合版)

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:async';

// 引入我們所有的頁面、服務和 Widget
import 'auth_gate.dart';
import 'services/api_service.dart';
import 'models/schwab_models.dart';
import 'pages/positions_page.dart';
import 'widgets/asset_pie_chart.dart';


Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: 'https://cpizomofpogtjheguxxk.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaXpvbW9mcG9ndGpoZWd1eHhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNjgwNDksImV4cCI6MjA3NDY0NDA0OX0.1nKalKJRzgOpMjvmwcmv0cw09E_3Nu-TgV89plp--KI',
  );
  runApp(const MyApp());
}

final supabase = Supabase.instance.client;

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Schwab Auto Trader',
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF00A562),
        scaffoldBackgroundColor: const Color(0xFF121212),
        cardColor: const Color(0xFF1E1E1E),
        useMaterial3: true,
      ),
      debugShowCheckedModeBanner: false,
      home: const AuthGate(),
    );
  }
}

// =======================================================================
// DashboardPage
// =======================================================================

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  final ApiService _apiService = ApiService();
  
  SchwabAccount? _schwabAccount;
  Map<String, dynamic>? _simulationPortfolio;
  
  bool _isLoading = true;
  String? _errorMessage;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _loadAllData();
    _timer = Timer.periodic(const Duration(seconds: 30), (timer) {
        _loadAllData(showLoadingIndicator: false);
    });
  }
    
  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  // ✨ 核心修改：為 _loadAllData 加入 Token 刷新與重試邏輯 ✨
  Future<void> _loadAllData({bool showLoadingIndicator = true, bool isRetry = false}) async {
    if (mounted && showLoadingIndicator) setState(() { _isLoading = true; _errorMessage = null; });
    try {
      final results = await Future.wait([
        _apiService.getSchwabAccountSummary(),
        _apiService.getSimulationPortfolio(),
      ]);
      
      if (mounted) {
        setState(() {
          _schwabAccount = results[0] as SchwabAccount;
          _simulationPortfolio = results[1] as Map<String, dynamic>;
        });
      }
    } catch (e) {
      // 檢查錯誤是否是因為 Token 過期 (通常後端會回傳 401)
      // 並且確保我們不是在一次失敗的重試中無限循環
      if (e.toString().contains('401') && !isRetry) {
        print('[DashboardPage] 偵測到 Token 過期，正在嘗試刷新...');
        try {
          // 嘗試刷新 Session
          await supabase.auth.refreshSession();
          print('[DashboardPage] Session 刷新成功，正在重試數據載入...');
          // 刷新成功後，再次呼叫 _loadAllData，並標記為重試
          _loadAllData(showLoadingIndicator: showLoadingIndicator, isRetry: true);
        } catch (refreshError) {
          print('[DashboardPage] Session 刷新失敗，強制登出: $refreshError');
          if (mounted) setState(() => _errorMessage = '連線階段已過期，請重新登入。');
          await supabase.auth.signOut();
        }
      } else {
        // 如果是其他錯誤，或重試後依然失敗，則顯示錯誤訊息
        if (mounted) setState(() => _errorMessage = '載入儀表板資料失敗: $e');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _buildTopNavBar(),
      body: RefreshIndicator(
        onRefresh: _loadAllData,
        child: _buildBody(),
      ),
    );
  }

  AppBar _buildTopNavBar() {
    final double realTotalValue = _schwabAccount?.securitiesAccount.currentBalances.liquidationValue ?? 0.0;
    final double simTotalValue = (_simulationPortfolio?['totalPortfolioValue'] as num?)?.toDouble() ?? 0.0;

    return AppBar(
      backgroundColor: Theme.of(context).cardColor,
      title: const Text('📈 Schwab Auto Trader'),
      actions: [
        // ✨ 在小螢幕上自動隱藏文字，只留金額 ✨
        if (MediaQuery.of(context).size.width > 700)
          const Center(child: Text('真實資產: ')),
        Center(child: Text('\$${realTotalValue.toStringAsFixed(2)}')),
        const SizedBox(width: 20),
        if (MediaQuery.of(context).size.width > 700)
          const Center(child: Text('模擬資產: ')),
        Center(child: Text('\$${simTotalValue.toStringAsFixed(2)}')),
        const SizedBox(width: 20),
        IconButton(
          icon: const Icon(Icons.logout),
          onPressed: () async => await supabase.auth.signOut(),
        ),
        const SizedBox(width: 16),
      ],
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorMessage != null) {
      return Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)));
    }
    if (_schwabAccount == null || _simulationPortfolio == null) {
      return const Center(child: Text('無法載入資料。'));
    }
    
    // 將儀表板下方固定的 Widget 提出來，以便重複使用
    final List<Widget> bottomWidgets = [
      const SizedBox(height: 24),
      GestureDetector(
        onTap: () async {
          await Navigator.push(context, MaterialPageRoute(builder: (context) => const PositionsPage()));
          _loadAllData();
        },
        child: const Card(
          child: ListTile(
            title: Text('查看詳細持股列表 (Positions)'),
            trailing: Icon(Icons.arrow_forward_ios, size: 16),
          ),
        ),
      ),
      const SizedBox(height: 20),
      _buildRecentTradesCard(),
    ];

    // ✨ 使用 LayoutBuilder 來建立響應式排版 ✨
    return LayoutBuilder(
      builder: (context, constraints) {
        // 設定斷點，您可以根據喜好調整這個數字
        const double breakpoint = 800.0;

        // 如果螢幕寬度大於斷點 (網頁版)
        if (constraints.maxWidth > breakpoint) {
          return SingleChildScrollView( // 使用 SingleChildScrollView 避免內容過多時溢出
            padding: const EdgeInsets.all(24.0),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _buildAccountSummaryCard(
                        title: '真實帳戶 (Live Account)',
                        account: _schwabAccount!,
                      ),
                    ),
                    const SizedBox(width: 24),
                    Expanded(
                      child: _buildAccountSummaryCard(
                        title: '模擬帳戶 (Paper Trading)',
                        simulationPortfolio: _simulationPortfolio!,
                      ),
                    ),
                  ],
                ),
                ...bottomWidgets, // 將下方的 Widget 加回來
              ],
            ),
          );
        } 
        // 如果螢幕寬度小於斷點 (手機版)
        else {
          return ListView(
            padding: const EdgeInsets.all(24.0),
            children: [
              _buildAccountSummaryCard(
                title: '真實帳戶 (Live Account)',
                account: _schwabAccount!,
              ),
              const SizedBox(height: 24),
              _buildAccountSummaryCard(
                title: '模擬帳戶 (Paper Trading)',
                simulationPortfolio: _simulationPortfolio!,
              ),
              ...bottomWidgets, // 將下方的 Widget 加回來
            ],
          );
        }
      },
    );
  }

  // 近期交易卡片 (從您原本的 _buildDashboardContent 中提取出來)
  Widget _buildRecentTradesCard() {
    final recentTrades = (_simulationPortfolio!['history'] as List? ?? []).reversed.take(5).toList();
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ListTile(title: Text('近期模擬交易 (Recent Paper Trades)')),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columnSpacing: 28.0,
              columns: const [
                DataColumn(label: Text('日期')),
                DataColumn(label: Text('代碼')),
                DataColumn(label: Text('類型')),
                DataColumn(label: Text('股數')),
                DataColumn(label: Text('價格')),
              ],
              rows: recentTrades.map((trade) {
                final tradeDate = DateTime.parse(trade['date']);
                return DataRow(cells: [
                  DataCell(Text('${tradeDate.month}/${tradeDate.day}')),
                  DataCell(Text(trade['ticker'])),
                  DataCell(Text(trade['type'], style: TextStyle(color: trade['type'] == 'BUY' ? Colors.greenAccent : Colors.redAccent))),
                  DataCell(SizedBox(width: 60, child: Text(trade['shares'].toString()))),
                  DataCell(Text('\$${(trade['price'] as num?)?.toDouble()?.toStringAsFixed(2) ?? '0.00'}')),
                ]);
              }).toList(),
            ),
          ),
        ],
      )
    );
  }
  
  // 帳戶總覽卡片 (內容完全不變)
  Widget _buildAccountSummaryCard({
    required String title,
    SchwabAccount? account,
    Map<String, dynamic>? simulationPortfolio,
  }) {
    double totalValue, stockValue, cashValue;

    if (account != null) {
      totalValue = account.securitiesAccount.currentBalances.liquidationValue;
      stockValue = account.securitiesAccount.currentBalances.longMarketValue;
      cashValue = totalValue - stockValue;
    } else if (simulationPortfolio != null) {
      totalValue = (simulationPortfolio['totalPortfolioValue'] as num?)?.toDouble() ?? 0.0;
      cashValue = (simulationPortfolio['cash'] as num?)?.toDouble() ?? 0.0;
      stockValue = totalValue - cashValue;
    } else {
      return const SizedBox.shrink();
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              '\$${totalValue.toStringAsFixed(2)}',
              style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const Divider(height: 32),
            if (totalValue > 0)
              AssetPieChart(
                cashValue: cashValue,
                stockValue: stockValue,
              ),
          ],
        ),
      ),
    );
  }
}