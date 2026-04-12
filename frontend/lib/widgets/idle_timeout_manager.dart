// lib/widgets/idle_timeout_manager.dart
import 'dart:async';
import 'package:flutter/material.dart';
import '../main.dart'; // 為了 supabase client

class IdleTimeoutManager extends StatefulWidget {
  final Widget child;
  final Duration timeoutDuration;

  const IdleTimeoutManager({
    super.key,
    required this.child,
    required this.timeoutDuration,
  });
  @override
  State<IdleTimeoutManager> createState() => _IdleTimeoutManagerState();
}

class _IdleTimeoutManagerState extends State<IdleTimeoutManager> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer(widget.timeoutDuration, _logout);
  }

  void _logout() {
    if (mounted) {
      print('[IdleTimeout] 使用者閒置已達上限，正在自動登出...');
      supabase.auth.signOut();
    }
  }

  void _onUserActivity(PointerEvent event) {
    _startTimer();
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: _onUserActivity,
      onPointerMove: _onUserActivity,
      onPointerUp: _onUserActivity,
      child: widget.child,
    );
  }
}