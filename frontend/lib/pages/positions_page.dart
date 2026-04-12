// lib/pages/positions_page.dart (最終完整版)

import 'package:flutter/material.dart';
import '../models/unified_position.dart';
import '../services/api_service.dart';
import '../widgets/sortable_positions_table.dart';
import '../models/schwab_models.dart';
import '../main.dart';

class PositionsPage extends StatefulWidget {
  const PositionsPage({super.key});
  @override
  State<PositionsPage> createState() => _PositionsPageState();
}

class _PositionsPageState extends State<PositionsPage> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _apiService = ApiService();

  List<UnifiedPosition> _realPositions = [];
  List<UnifiedPosition> _simulatedPositions = [];
  bool _isLoading = true;
  String? _errorMessage;

  int _realSortColumnIndex = 4;
  bool _realSortAscending = false;
  int _simSortColumnIndex = 4;
  bool _simSortAscending = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadAllPositions();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // 在 lib/pages/positions_page.dart 中，取代舊的 _loadAllPositions 函數

// ✨ 核心修改：加入了 isRetry 參數和完整的 try-catch-refresh 邏輯 ✨
Future<void> _loadAllPositions({bool isRetry = false}) async {
  if (!mounted) return;
  // 只有在不是重試的情況下，才顯示載入動畫
  if (!isRetry) {
    setState(() { _isLoading = true; _errorMessage = null; });
  }

  try {
    // 我們保持循序執行，以便精準定位問題
    final realPositionsData = await _apiService.getSchwabPositions();
    final schwabAccount = await _apiService.getSchwabAccountSummary();
    final simPortfolio = await _apiService.getSimulationPortfolio();
    
    // --- 後續的數據處理邏輯不變 ---
    final realTotalValue = schwabAccount.securitiesAccount.currentBalances.liquidationValue;
    final simTotalValue = (simPortfolio['totalPortfolioValue'] as num?)?.toDouble() ?? 0.0;
    final simPositionsData = simPortfolio['positions'] as List<UnifiedPosition>;
    
    if (mounted) {
      setState(() {
        _realPositions = _calculatePortfolioPercentage(realPositionsData, realTotalValue);
        _simulatedPositions = _calculatePortfolioPercentage(simPositionsData, simTotalValue);
        _onSort(_realSortColumnIndex, _realSortAscending, isReal: true);
        _onSort(_simSortColumnIndex, _simSortAscending, isReal: false);
        // 成功載入後，清除任何舊的錯誤訊息
        _errorMessage = null; 
      });
    }
  } catch (e) {
    // 檢查錯誤是否是因為 Token 過期 (通常後端會回傳 401)
    // 並且確保我們不是在一次失敗的重試中無限循環
    if (e.toString().contains('401') && !isRetry) {
      print('[PositionsPage] 偵測到 Token 過期，正在嘗試刷新...');
      try {
        // 嘗試刷新 Session
        await supabase.auth.refreshSession();
        print('[PositionsPage] Session 刷新成功，正在重試數據載入...');
        // 刷新成功後，再次呼叫 _loadAllPositions，並標記為重試
        _loadAllPositions(isRetry: true);
        // 因為我們要重試，所以暫時不設定錯誤訊息
        return; // 直接返回，等待重試完成
      } catch (refreshError) {
        print('[PositionsPage] Session 刷新失敗，強制登出: $refreshError');
        if (mounted) setState(() => _errorMessage = '連線階段已過期，請重新登入。');
        // 刷新失敗，登出使用者
        await supabase.auth.signOut();
      }
    } else {
      // 如果是其他錯誤，或重試後依然失敗，則顯示錯誤訊息
      final errorString = '載入持股頁面失敗: $e';
      print('❌ $errorString');
      if(mounted) setState(() => _errorMessage = errorString);
    }
  } finally {
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }
}
  
  List<UnifiedPosition> _calculatePortfolioPercentage(List<UnifiedPosition> positions, double totalValue) {
    if (totalValue == 0) return positions;
    return positions.map((p) {
      final percentage = (p.currentValue / totalValue) * 100;
      return UnifiedPosition(
          symbol: p.symbol, shares: p.shares, avgCost: p.avgCost, currentPrice: p.currentPrice,
          currentValue: p.currentValue, assetType: p.assetType, dailyChange: p.dailyChange,
          dailyChangePercent: p.dailyChangePercent, totalGainLoss: p.totalGainLoss,
          dayHigh: p.dayHigh, dayLow: p.dayLow,
          portfolioPercentage: percentage);
    }).toList();
  }

  void _onSort(int columnIndex, bool ascending, {required bool isReal}) {
    final targetList = isReal ? _realPositions : _simulatedPositions;
    
    targetList.sort((a, b) {
        final aValue = _getComparableValue(a, columnIndex);
        final bValue = _getComparableValue(b, columnIndex);
        final compareResult = ascending ? Comparable.compare(aValue, bValue) : Comparable.compare(bValue, aValue);
        if (compareResult == 0) return a.symbol.compareTo(b.symbol);
        return compareResult;
    });

    setState(() {
      if (isReal) {
        _realSortColumnIndex = columnIndex;
        _realSortAscending = ascending;
      } else {
        _simSortColumnIndex = columnIndex;
        _simSortAscending = ascending;
      }
    });
  }

  Comparable _getComparableValue(UnifiedPosition pos, int index) {
    switch (index) {
      case 0: return pos.symbol;
      case 1: return pos.shares;
      case 2: return pos.avgCost;
      case 3: return pos.currentPrice;
      case 4: return pos.currentValue;
      case 5: return pos.portfolioPercentage;
      case 6: return pos.dailyChange;
      case 7: return pos.totalGainLoss;
      case 8: return pos.assetType;
      case 9: return pos.dayHigh;
      case 10: return pos.dayLow;
      default: return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('持股列表 (Positions)'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.account_balance), text: '真實持股 (Schwab)'),
            Tab(icon: Icon(Icons.science_outlined), text: '模擬持股 (Paper)'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text('載入失敗: $_errorMessage', style: const TextStyle(color: Colors.red)))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    SortablePositionsTable(
                      positions: _realPositions,
                      sortColumnIndex: _realSortColumnIndex,
                      sortAscending: _realSortAscending,
                      onSort: (col, asc) => _onSort(col, asc, isReal: true),
                    ),
                    SortablePositionsTable(
                      positions: _simulatedPositions,
                      sortColumnIndex: _simSortColumnIndex,
                      sortAscending: _simSortAscending,
                      onSort: (col, asc) => _onSort(col, asc, isReal: false),
                    ),
                  ],
                ),
    );
  }
}