import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../format.dart';
import '../widgets.dart';

/// This month's shared bills (paid / being paid / due) and who paid how much.
class HouseholdScreen extends StatefulWidget {
  const HouseholdScreen({super.key});
  @override
  State<HouseholdScreen> createState() => _HouseholdScreenState();
}

class _HouseholdScreenState extends State<HouseholdScreen> {
  DateTime _month = DateTime.utc(DateTime.now().year, DateTime.now().month);
  int _version = 0;

  String get _monthKey => DateFormat('yyyy-MM').format(_month);

  void _shift(int delta) => setState(() => _month = DateTime.utc(_month.year, _month.month + delta));

  Future<void> _claim(Api api, String scheduleId, {bool release = false}) async {
    try {
      if (release) {
        await api.delete('/recurring/$scheduleId/claim');
      } else {
        await api.post('/recurring/$scheduleId/claim');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
    setState(() => _version++);
  }

  @override
  Widget build(BuildContext context) {
    final api = context.watch<Api>();
    final scheme = Theme.of(context).colorScheme;
    if (!api.isFamily) {
      return Scaffold(
        appBar: AppBar(title: const Text('Household')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Household is for shared family spaces. Create or switch to one to see who paid which bills.'),
          const SizedBox(height: 12),
          FilledButton(onPressed: () => context.push('/family'), child: const Text('Family & sharing')),
        ]),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Household'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(44),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            IconButton(tooltip: 'Previous month', icon: const Icon(Icons.chevron_left), onPressed: () => _shift(-1)),
            SizedBox(
              width: 160,
              child: Text(DateFormat.yMMMM().format(_month), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
            ),
            IconButton(tooltip: 'Next month', icon: const Icon(Icons.chevron_right), onPressed: () => _shift(1)),
          ]),
        ),
      ),
      body: AsyncView<Map<String, dynamic>>(
        key: ValueKey('$_monthKey-$_version-${api.workspaceId}'),
        load: () async => await api.get('/household', {'month': _monthKey}) as Map<String, dynamic>,
        builder: (context, h, reload) {
          final bills = ((h['bills'] as List?) ?? const []).cast<Map<String, dynamic>>();
          final paid = ((h['paidByMember'] as List?) ?? const []).cast<Map<String, dynamic>>();
          final items = ((h['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
          final memberCount = ((h['members'] as List?) ?? const []).length;
          final paidCount = bills.where((b) => b['status'] == 'paid').length;
          DateTime? d(Object? v) => v == null ? null : DateTime.parse(v as String);

          return ListView(
            padding: const EdgeInsets.only(bottom: 96),
            children: [
              SectionTitle('Shared bills · $paidCount/${bills.length} paid'),
              if (bills.isEmpty) const EmptyNote('No shared bills this month. Add recurring bills while this space is selected.'),
              for (final b in bills)
                Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(4, 4, 8, 8),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      ListTile(
                        leading: Icon(
                          b['status'] == 'paid'
                              ? Icons.check_circle
                              : b['status'] == 'claimed'
                                  ? Icons.pan_tool_outlined
                                  : Icons.radio_button_unchecked,
                          color: b['status'] == 'paid' ? Colors.green : b['status'] == 'claimed' ? scheme.primary : scheme.tertiary,
                        ),
                        title: Text(b['title'] as String),
                        subtitle: Text(switch (b['status']) {
                          'paid' => 'Paid by ${b['paidByName']} · ${formatDate(d(b['paidAt']))}',
                          'claimed' =>
                            '${b['claimedBy'] == api.myId ? 'You are' : '${b['claimedByName']} is'} paying this · ${relativeDue(d(b['dueDate'])!)}',
                          _ => 'Nobody has paid yet · ${relativeDue(d(b['dueDate'])!)}',
                        }),
                        trailing: Text(formatMoney((b['amountMinor'] as num?)?.toInt(), b['currency'] as String),
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                        onTap: () => context.push(b['captureId'] != null ? '/captures/${b['captureId']}' : '/recurring/${b['scheduleId']}'),
                      ),
                      if (api.canWrite && b['status'] != 'paid')
                        Wrap(spacing: 8, children: [
                          if (b['status'] == 'due')
                            OutlinedButton.icon(
                              icon: const Icon(Icons.pan_tool_outlined, size: 18),
                              label: const Text("I'm paying this"),
                              onPressed: () => _claim(api, b['scheduleId'] as String),
                            ),
                          if (b['status'] == 'claimed' && b['claimedBy'] == api.myId)
                            TextButton(onPressed: () => _claim(api, b['scheduleId'] as String, release: true), child: const Text('Release')),
                          FilledButton(
                            onPressed: () async {
                              await context.push('/recurring/${b['scheduleId']}?pay=1');
                              setState(() => _version++);
                            },
                            child: const Text('Mark paid'),
                          ),
                        ]),
                    ]),
                  ),
                ),
              const SectionTitle('Paid by each person'),
              if (paid.isEmpty) const EmptyNote('Nothing paid yet this month.'),
              for (final p in paid)
                ListTile(
                  leading: CircleAvatar(child: Text((p['name'] as String).substring(0, 1))),
                  title: Text(p['name'] as String),
                  subtitle: Text('${p['count']} payment${p['count'] == 1 ? '' : 's'}${memberCount > 1 ? ' · even split ${formatMoney(_fairShare(paid, p['currency'] as String, memberCount), p['currency'] as String)}' : ''}'),
                  trailing: Text(formatMoney((p['totalMinor'] as num).toInt(), p['currency'] as String),
                      style: Theme.of(context).textTheme.titleMedium),
                ),
              if (items.isNotEmpty) ...[
                const SectionTitle('All shared payments & expenses'),
                for (final i in items)
                  ListTile(
                    title: Text(i['title'] as String),
                    subtitle: Text('${formatDate(d(i['occurredAt']))} · paid by ${i['paidByName']}'),
                    trailing: Text(formatMoney((i['amountMinor'] as num?)?.toInt(), i['currency'] as String)),
                    onTap: () => context.push('/captures/${i['_id']}'),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }

  static int _fairShare(List<Map<String, dynamic>> paid, String currency, int members) {
    final total = paid.where((p) => p['currency'] == currency).fold<int>(0, (n, p) => n + (p['totalMinor'] as num).toInt());
    return (total / members).round();
  }
}
