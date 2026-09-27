import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../format.dart';
import '../models.dart';
import '../widgets.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _view = GlobalKey<AsyncViewState<Dashboard>>();

  @override
  Widget build(BuildContext context) {
    final api = context.read<Api>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Capture Hub'),
        actions: [
          IconButton(tooltip: 'Inbox', icon: const Icon(Icons.inbox_outlined), onPressed: () => context.push('/inbox')),
          IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: api.logout),
        ],
      ),
      body: AsyncView<Dashboard>(
        key: _view,
        load: () async => Dashboard.fromJson(await api.get('/dashboard') as Map<String, dynamic>),
        builder: (context, d, reload) {
          final due = [...d.overdue, ...d.upcoming];
          final scheme = Theme.of(context).colorScheme;
          return ListView(
            padding: const EdgeInsets.only(bottom: 96),
            children: [
              if (d.inboxCount > 0)
                Card(
                  margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  color: scheme.tertiaryContainer,
                  child: ListTile(
                    leading: const Icon(Icons.inbox),
                    title: Text('${d.inboxCount} item${d.inboxCount == 1 ? '' : 's'} waiting to be filed'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await context.push('/inbox');
                      reload();
                    },
                  ),
                ),
              SectionTitle('Bills due',
                  action: TextButton(onPressed: () => context.go('/recurring'), child: const Text('All recurring'))),
              if (due.isEmpty) const EmptyNote('Nothing due in the next two weeks.'),
              for (final s in due)
                ListTile(
                  leading: Icon(
                    daysUntil(s.nextDueDate) < 0 ? Icons.warning_amber_rounded : Icons.event_outlined,
                    color: daysUntil(s.nextDueDate) < 0 ? scheme.error : scheme.primary,
                  ),
                  title: Text(s.title),
                  subtitle: Text('${relativeDue(s.nextDueDate)} · ${formatDate(s.nextDueDate)}',
                      style: TextStyle(color: daysUntil(s.nextDueDate) < 0 ? scheme.error : null)),
                  trailing: Text(formatMoney(s.amountMinor, s.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
                  onTap: () async {
                    await context.push('/recurring/${s.id}');
                    reload();
                  },
                ),
              const SectionTitle('Owed to you'),
              if (d.owed.isEmpty) const EmptyNote('No reimbursements pending.'),
              for (final g in d.owed)
                ListTile(
                  title: Text(g.organization),
                  subtitle: Text('${g.count} expense${g.count == 1 ? '' : 's'}'),
                  trailing: Text(formatMoney(g.outstandingMinor, g.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
                  onTap: () => context.go('/owed'),
                ),
              if (d.unclearedDeposits.isNotEmpty) ...[
                const SectionTitle('Deposits not cleared'),
                for (final c in d.unclearedDeposits) CaptureTile(capture: c, onReturn: reload),
              ],
              SectionTitle('Recently saved',
                  action: TextButton(onPressed: () => context.go('/activity'), child: const Text('See all'))),
              if (d.recent.isEmpty) const EmptyNote('Nothing saved yet. Tap + to snap a receipt or upload a screenshot.'),
              for (final c in d.recent) CaptureTile(capture: c, onReturn: reload),
            ],
          );
        },
      ),
    );
  }
}
