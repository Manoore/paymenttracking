import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    // Tabs watch Api themselves and reload when the active space changes.
    final canWrite = context.select<Api, bool>((a) => a.canWrite);
    return Scaffold(
      body: shell,
      floatingActionButton: !canWrite
          ? null
          : FloatingActionButton(
        tooltip: 'New capture',
        onPressed: () => context.push('/new'),
        child: const Icon(Icons.add),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.search), label: 'Activity'),
          NavigationDestination(icon: Icon(Icons.repeat), label: 'Recurring'),
          NavigationDestination(icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments), label: 'Owed'),
        ],
      ),
    );
  }
}
