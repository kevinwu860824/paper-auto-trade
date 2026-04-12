// lib/widgets/asset_pie_chart.dart
import 'package:flutter/material.dart';
import 'package:pie_chart/pie_chart.dart';

class AssetPieChart extends StatelessWidget {
  final double cashValue;
  final double stockValue;

  const AssetPieChart({
    super.key,
    required this.cashValue,
    required this.stockValue,
  });

  @override
  Widget build(BuildContext context) {
    final Map<String, double> dataMap = {
      '現金 (Cash)': cashValue,
      '股票 (Stocks)': stockValue,
    };

    final colorList = <Color>[
      Colors.blueGrey[700]!,
      Theme.of(context).primaryColor,
    ];

    return PieChart(
      dataMap: dataMap,
      animationDuration: const Duration(milliseconds: 800),
      chartLegendSpacing: 32,
      chartRadius: MediaQuery.of(context).size.width / 3.2,
      colorList: colorList,
      initialAngleInDegree: 0,
      chartType: ChartType.ring,
      ringStrokeWidth: 32,
      legendOptions: const LegendOptions(
        showLegendsInRow: false,
        legendPosition: LegendPosition.right,
        showLegends: true,
        legendTextStyle: TextStyle(fontWeight: FontWeight.bold),
      ),
      chartValuesOptions: const ChartValuesOptions(
        showChartValueBackground: true,
        showChartValues: true,
        showChartValuesInPercentage: true,
        showChartValuesOutside: false,
        decimalPlaces: 1,
      ),
    );
  }
}