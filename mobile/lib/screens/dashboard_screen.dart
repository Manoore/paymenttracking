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

  @override
  Widget build(BuildContext context) {
    final api = context.watch<Api>();
    final spaces = api.workspaces;
    return Scaffold(
      appBar: AppBar(
        title: spaces.length < 2
            ? const Text('Capture Hub')
            : PopupMenuButton<String>(
                tooltip: 'Switch space',
                onSelected: (id) => api.switchWorkspace(id),
                itemBuilder: (_) => [
                  for (final w in spaces)
                    PopupMenuItem(
                      value: w['id'] as String,
                      child: Text('${w['kind'] == 'family' ? '👪 ' : '🔒 '}${w['name']}'),
                    ),
                ],
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Flexible(child: Text('${api.isFamily ? '👪 ' : '🔒 '}${api.workspace?['name'] ?? ''}', overflow: TextOverflow.ellipsis)),
                  const Icon(Icons.arrow_drop_down),
                ]),
              ),
        actions: [
          if (api.isFamily)
            IconButton(tooltip: 'Household', icon: const Icon(Icons.event_available_outlined), onPressed: () => context.push('/household')),
          IconButton(tooltip: 'Inbox', icon: const Icon(Icons.inbox_outlined), onPressed: () => context.push('/inbox')),
          PopupMenuButton<String>(
            tooltip: 'More',
            onSelected: (route) => context.push(route),
            itemBuilder: (_) => const [
              PopupMenuItem(value: '/places', child: ListTile(leading: Icon(Icons.place_outlined), title: Text('Places & ideas'))),
              PopupMenuItem(value: '/properties', child: ListTile(leading: Icon(Icons.home_work_outlined), title: Text('Properties'))),
              PopupMenuItem(value: '/family', child: ListTile(leading: Icon(Icons.family_restroom), title: Text('Family & sharing'))),
              PopupMenuItem(value: '/profile', child: ListTile(leading: Icon(Icons.account_circle_outlined), title: Text('Profile'))),
            ],
          ),
        ],
      ),
      body: AsyncView<Dashboard>(
        key: ValueKey('dash-${api.workspace?['id']}'),
        load: () async => Dashboard.fromJson(await api.get('/dashboard') as Map<String, dynamic>),
        builder: (context, d, reload) {
          final due = [...d.overdue, ...d.upcoming];
          final scheme = Theme.of(context).colorScheme;
          return ListView(
            padding: const EdgeInsets.only(bottom: 96),
            children: [
              if (api.isFamily)
                Card(
                  margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: ListTile(
                    leading: const Icon(Icons.event_available_outlined),
                    title: const Text('Household this month'),
                    subtitle: const Text('Who paid which bills, who is paying next'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/household'),
                  ),
                ),
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
              if (d.expiring.isNotEmpty) ...[
                const SectionTitle('Coming up'),
                for (final e in d.expiring)
                  ListTile(
                    leading: Icon(
                      {'expires': Icons.badge_outlined, 'return': Icons.assignment_return_outlined, 'warranty': Icons.verified_user_outlined}[e['kind']],
                      color: daysUntil(DateTime.parse(e['date'] as String)) <= 7 ? scheme.tertiary : scheme.outline,
                    ),
                    title: Text(e['title'] as String),
                    subtitle: Text(
                      '${{'expires': 'Expires', 'return': 'Return by', 'warranty': 'Warranty ends'}[e['kind']]} ${formatDate(DateTime.parse(e['date'] as String))}',
                    ),
                    onTap: () async {
                      await context.push('/captures/${e['id']}');
                      reload();
                    },
                  ),
              ],
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
