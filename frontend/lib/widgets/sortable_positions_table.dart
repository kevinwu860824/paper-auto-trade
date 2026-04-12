// lib/widgets/sortable_positions_table.dart
import 'package:flutter/material.dart';
import '../models/unified_position.dart';

typedef SortCallback = void Function(int columnIndex, bool ascending);

class SortablePositionsTable extends StatelessWidget {
  final List<UnifiedPosition> positions;
  final int sortColumnIndex;
  final bool sortAscending;
  final SortCallback onSort;

  const SortablePositionsTable({
    super.key,
    required this.positions,
    required this.sortColumnIndex,
    required this.sortAscending,
    required this.onSort,
  });

  @override
  Widget build(BuildContext context) {
    if (positions.isEmpty) {
      return const Center(child: Text('目前沒有任何持股。'));
    }

    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          sortColumnIndex: sortColumnIndex,
          sortAscending: sortAscending,
          columnSpacing: 24,
          columns: _buildColumns(),
          rows: _buildRows(),
        ),
      ),
    );
  }

  List<DataColumn> _buildColumns() {
    final Map<String, String> headers = {
      '代碼': 'Symbol', '股數': 'Shares', '平均成本': 'Avg. Cost', '現價': 'Price',
      '目前總值': 'Mkt. Value', '佔總資產 %': '% of Portfolio', '今日損益': 'Day\'s G/L',
      '總損益': 'Total G/L', '資產類別': 'Asset Type', '當日最高': 'Day High', '當日最低': 'Day Low'
    };
    return headers.entries.map((entry) {
      final int columnIndex = headers.keys.toList().indexOf(entry.key);
      return DataColumn(
        label: Text(entry.key),
        numeric: columnIndex != 0 && columnIndex != 8, 
        onSort: (ci, asc) => onSort(columnIndex, asc),
      );
    }).toList();
  }

  List<DataRow> _buildRows() {
    return positions.map((pos) {
      final totalCost = pos.avgCost * pos.shares;
      final totalGainLossPercent = totalCost > 0 ? (pos.totalGainLoss / totalCost) * 100 : 0.0;
      return DataRow(cells: [
        DataCell(Text(pos.symbol, style: const TextStyle(fontWeight: FontWeight.bold))),
        DataCell(Text(pos.shares.toStringAsFixed(2))),
        DataCell(Text('\$${pos.avgCost.toStringAsFixed(2)}')),
        DataCell(Text('\$${pos.currentPrice.toStringAsFixed(2)}')),
        DataCell(Text('\$${pos.currentValue.toStringAsFixed(2)}')),
        DataCell(Text('${pos.portfolioPercentage.toStringAsFixed(2)}%')),
        DataCell(_buildGainLossText(pos.dailyChange, isPercent: true, percentValue: pos.dailyChangePercent)),
        DataCell(_buildGainLossText(pos.totalGainLoss, isPercent: true, percentValue: totalGainLossPercent)),
        DataCell(Text(pos.assetType)),
        DataCell(Text('\$${pos.dayHigh.toStringAsFixed(2)}')),
        DataCell(Text('\$${pos.dayLow.toStringAsFixed(2)}')),
      ]);
    }).toList();
  }

  Widget _buildGainLossText(double value, {bool isPercent = false, double? percentValue}) {
    final color = value >= 0 ? Colors.greenAccent : Colors.redAccent;
    String text = value.toStringAsFixed(2);
    if (isPercent && percentValue != null) {
      text += '\n(${percentValue.toStringAsFixed(2)}%)';
    }
    return Text(text, style: TextStyle(color: color), textAlign: TextAlign.right);
  }
}