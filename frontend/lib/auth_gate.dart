// lib/auth_gate.dart (已整合閒置登出)
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'pages/login_page.dart';
import 'main.dart';
import 'widgets/idle_timeout_manager.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: supabase.auth.onAuthStateChange,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final session = snapshot.data?.session;
        if (session != null) {
          return const IdleTimeoutManager(
            // 先用 5 分鐘來進行測試
            timeoutDuration: Duration(minutes: 5),
            // 未來可以改為：timeoutDuration: Duration(hours: 24),
            child: DashboardPage(),
          );
        } else {
          return const LoginPage();
        }
      },
    );
  }
}