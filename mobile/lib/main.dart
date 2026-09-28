import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'api.dart';
import 'screens/activity_screen.dart';
import 'screens/capture_detail_screen.dart';
import 'screens/capture_form_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'screens/family_screen.dart';
import 'screens/household_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/places_screen.dart';
import 'screens/properties_screen.dart';
import 'screens/reader_settings_screen.dart';
import 'screens/recurring_screens.dart';
import 'screens/reimbursements_screen.dart';
import 'screens/shell.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = Api();
  final theme = ThemeController();
  await Future.wait([api.restore(), theme.load()]);
  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider.value(value: api),
      ChangeNotifierProvider.value(value: theme),
    ],
    child: CaptureHubApp(api: api),
  ));
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
      GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
      GoRoute(path: '/family', builder: (_, _) => const FamilyScreen()),
      GoRoute(path: '/reader', builder: (_, _) => const ReaderSettingsScreen()),
      GoRoute(path: '/properties', builder: (_, _) => const PropertiesScreen()),
      GoRoute(
        path: '/places',
        builder: (_, state) => PlacesScreen(initialTab: state.uri.queryParameters['tab'] == 'ideas' ? 1 : 0),
      ),
      GoRoute(path: '/properties/:name', builder: (_, state) => PropertyDetailScreen(name: state.pathParameters['name']!)),
      GoRoute(path: '/household', builder: (_, _) => const HouseholdScreen()),
      GoRoute(path: '/inbox', builder: (_, _) => const ActivityScreen(inbox: true)),
      GoRoute(
        path: '/new',
        builder: (_, state) => CaptureFormScreen(
          initialType: state.uri.queryParameters['type'],
          initialProperty: state.uri.queryParameters['property'],
        ),
      ),
      GoRoute(path: '/captures/:id', builder: (_, state) => CaptureDetailScreen(id: state.pathParameters['id']!)),
      GoRoute(
        path: '/recurring/new',
        builder: (_, state) => ScheduleFormScreen(initialProperty: state.uri.queryParameters['property']),
      ),
      GoRoute(
        path: '/recurring/:id',
        builder: (_, state) => ScheduleDetailScreen(id: state.pathParameters['id']!, openPay: state.uri.queryParameters['pay'] == '1'),
      ),
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
      themeMode: context.watch<ThemeController>().mode,
      routerConfig: _router,
    );
  }
}
