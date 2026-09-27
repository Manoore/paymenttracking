import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../format.dart';
import '../models.dart';
import '../widgets.dart';

class ReimbursementsScreen extends StatefulWidget {
  const ReimbursementsScreen({super.key});
  @override
  State<ReimbursementsScreen> createState() => _ReimbursementsScreenState();
}

class _ReimbursementsScreenState extends State<ReimbursementsScreen> {
  String _groupBy = 'organization';
  bool _includeDone = false;
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    final api = context.read<Api>();
    return Scaffold(
      appBar: AppBar(title: const Text('Owed to you')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
          child: Row(children: [
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'organization', label: Text('By org')),
                ButtonSegment(value: 'trip', label: Text('By trip')),
              ],
              selected: {_groupBy},
              onSelectionChanged: (s) => setState(() => _groupBy = s.first),
            ),
            const Spacer(),
            FilterChip(
              label: const Text('Include paid'),
              selected: _includeDone,
              onSelected: (v) => setState(() => _includeDone = v),
            ),
          ]),
        ),
        Expanded(
          child: AsyncView<List<Map<String, dynamic>>>(
            key: ValueKey('$_groupBy-$_includeDone-$_version'),
            load: () async {
              final data = await api.get('/reimbursements', {'groupBy': _groupBy, 'includeDone': _includeDone}) as Map<String, dynamic>;
              return (data['groups'] as List).cast<Map<String, dynamic>>();
            },
            builder: (context, groups, reload) {
              if (groups.isEmpty) {
                return ListView(children: const [
                  EmptyNote('Nothing owed. When you save an expense, turn on "Someone owes me for this".'),
                ]);
              }
              return ListView(
                padding: const EdgeInsets.only(bottom: 96),
                children: [
                  for (final g in groups) ...[
                    ListTile(
                      title: Text(g['key'] as String, style: Theme.of(context).textTheme.titleMedium),
                      subtitle: Text(
                          '${formatMoney((g['totalMinor'] as num).toInt(), g['currency'] as String)} spent · '
                          '${formatMoney((g['reimbursedMinor'] as num).toInt(), g['currency'] as String)} repaid'),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text('Outstanding', style: Theme.of(context).textTheme.labelSmall),
                        Text(formatMoney((g['outstandingMinor'] as num).toInt(), g['currency'] as String),
                            style: const TextStyle(fontWeight: FontWeight.w700)),
                      ]),
                    ),
                    for (final i in (g['items'] as List).cast<Map<String, dynamic>>())
                      ListTile(
                        contentPadding: const EdgeInsets.only(left: 32, right: 16),
                        title: Text(i['title'] as String),
                        subtitle: Text([
                          formatDate(i['occurredAt'] == null ? null : DateTime.parse(i['occurredAt'] as String)),
                          statusLabels[(i['reimbursement'] as Map?)?['status']] ?? '',
                        ].where((s) => s.isNotEmpty).join(' · ')),
                        trailing: Text(formatMoney((i['amountMinor'] as num?)?.toInt(), g['currency'] as String)),
                        onTap: () async {
                          await context.push('/captures/${i['_id']}');
                          setState(() => _version++);
                        },
                      ),
                    const Divider(),
                  ],
                ],
              );
            },
          ),
        ),
      ]),
    );
  }
}
