import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'api.dart';
import 'screens/activity_screen.dart';
import 'screens/capture_detail_screen.dart';
import 'screens/capture_form_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'screens/recurring_screens.dart';
import 'screens/reimbursements_screen.dart';
import 'screens/shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = Api();
  await api.restore();
  runApp(ChangeNotifierProvider.value(value: api, child: CaptureHubApp(api: api)));
}

class CaptureHubApp extends StatefulWidget {
  const CaptureHubApp({super.key, required this.api});
  final Api api;

  @override
  State<CaptureHubApp> createState() => _CaptureHubAppState();
}

class _CaptureHubAppState extends State<CaptureHubApp> {
  late final GoRouter _router = GoRouter(
    initialLocation: '/',
    refreshListenable: widget.api,
    redirect: (context, state) {
      final atLogin = state.matchedLocation == '/login';
      if (!widget.api.signedIn) return atLogin ? null : '/login';
      if (atLogin) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/', builder: (_, _) => const DashboardScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/activity', builder: (_, _) => const ActivityScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/recurring', builder: (_, _) => const RecurringListScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/owed', builder: (_, _) => const ReimbursementsScreen())]),
        ],
      ),
      GoRoute(path: '/inbox', builder: (_, _) => const ActivityScreen(inbox: true)),
      GoRoute(
        path: '/new',
        builder: (_, state) => CaptureFormScreen(initialType: state.uri.queryParameters['type']),
      ),
      GoRoute(path: '/captures/:id', builder: (_, state) => CaptureDetailScreen(id: state.pathParameters['id']!)),
      GoRoute(path: '/recurring/new', builder: (_, _) => const ScheduleFormScreen()),
      GoRoute(path: '/recurring/:id', builder: (_, state) => ScheduleDetailScreen(id: state.pathParameters['id']!)),
    ],
  );

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF2456D6);
    return MaterialApp.router(
      title: 'Capture Hub',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.light),
      darkTheme: ThemeData(colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.dark),
      routerConfig: _router,
    );
  }
}
