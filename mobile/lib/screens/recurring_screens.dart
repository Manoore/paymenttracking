import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../format.dart';
import '../models.dart';
import '../widgets.dart';

class RecurringListScreen extends StatefulWidget {
  const RecurringListScreen({super.key});
  @override
  State<RecurringListScreen> createState() => _RecurringListScreenState();
}

class _RecurringListScreenState extends State<RecurringListScreen> {
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    final api = context.watch<Api>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recurring payments'),
        actions: [
          IconButton(
            tooltip: 'Add schedule',
            icon: const Icon(Icons.add_alarm_outlined),
            onPressed: () async {
              await context.push('/recurring/new');
              setState(() => _version++);
            },
          ),
        ],
      ),
      body: AsyncView<List<Schedule>>(
        key: ValueKey('rec-${api.workspace?['id']}-$_version'),
        load: () async {
          final data = await api.get('/recurring') as Map<String, dynamic>;
          return (data['items'] as List).map((s) => Schedule.fromJson((s as Map).cast<String, dynamic>())).toList();
        },
        builder: (context, items, reload) {
          if (items.isEmpty) {
            return ListView(children: const [
              EmptyNote('No recurring payments yet. Add HOA dues, insurance or utilities to get reminders.'),
            ]);
          }
          final scheme = Theme.of(context).colorScheme;
          return ListView.separated(
            padding: const EdgeInsets.only(bottom: 96),
            itemCount: items.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final s = items[i];
              final overdue = daysUntil(s.nextDueDate) < 0;
              return ListTile(
                title: Text(s.title),
                subtitle: Text(
                  '${frequencyLabel(s.unit, s.interval)} · ${relativeDue(s.nextDueDate)} (${formatDate(s.nextDueDate)})'
                  '${api.isFamily && s.claimedBy != null ? '\n✋ ${s.claimedBy == api.myId ? 'You are' : '${api.nameOf(s.claimedBy) ?? 'Someone'} is'} paying this' : ''}',
                  style: TextStyle(color: overdue ? scheme.error : null),
                ),
                isThreeLine: api.isFamily && s.claimedBy != null,
                trailing: Text(formatMoney(s.amountMinor, s.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
                onTap: () async {
                  await context.push('/recurring/${s.id}');
                  reload();
                },
              );
            },
          );
        },
      ),
    );
  }
}

class ScheduleDetailScreen extends StatefulWidget {
  const ScheduleDetailScreen({super.key, required this.id, this.openPay = false});
  final String id;
  final bool openPay;
  @override
  State<ScheduleDetailScreen> createState() => _ScheduleDetailScreenState();
}

class _ScheduleDetailScreenState extends State<ScheduleDetailScreen> {
  final _view = GlobalKey<AsyncViewState<Schedule>>();
  bool _payOpened = false;

  Future<void> _claim(Schedule s, {bool release = false}) async {
    final api = context.read<Api>();
    try {
      if (release) {
        await api.delete('/recurring/${s.id}/claim');
      } else {
        await api.post('/recurring/${s.id}/claim');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
    _view.currentState?.reload();
  }

  Future<void> _pay(Schedule s) async {
    final paid = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PaySheet(schedule: s),
    );
    if (paid == true) _view.currentState?.reload();
  }

  Future<void> _confirmThen(String title, Future<void> Function() action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirm')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await action();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<Api>();
    return AsyncView<Schedule>(
      key: _view,
      load: () async => Schedule.fromJson(await api.get('/recurring/${widget.id}') as Map<String, dynamic>),
      builder: (context, s, reload) {
        final overdue = daysUntil(s.nextDueDate) < 0;
        if (widget.openPay && !_payOpened && s.active) {
          _payOpened = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => _pay(s));
        }
        final scheme = Theme.of(context).colorScheme;
        return Scaffold(
          appBar: AppBar(title: Text(s.title)),
          body: ListView(
            padding: const EdgeInsets.only(bottom: 40),
            children: [
              Card(
                margin: const EdgeInsets.all(16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text([s.counterparty, frequencyLabel(s.unit, s.interval), s.property].whereType<String>().join(' · '),
                        style: TextStyle(color: scheme.outline)),
                    const SizedBox(height: 8),
                    Text(s.active ? 'Next due ${formatDate(s.nextDueDate)}' : 'Stopped',
                        style: Theme.of(context).textTheme.titleMedium),
                    if (s.active)
                      Text(relativeDue(s.nextDueDate), style: TextStyle(color: overdue ? scheme.error : scheme.outline)),
                    const SizedBox(height: 8),
                    Text(formatMoney(s.amountMinor, s.currency), style: Theme.of(context).textTheme.headlineSmall),
                  ]),
                ),
              ),
              if (api.isFamily && s.active)
                Card(
                  margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  color: s.claimedBy != null ? scheme.primaryContainer : null,
                  child: ListTile(
                    leading: const Icon(Icons.pan_tool_outlined),
                    title: Text(s.claimedBy != null
                        ? '${s.claimedBy == api.myId ? 'You are' : '${api.nameOf(s.claimedBy) ?? 'Someone'} is'} paying this one'
                        : 'Nobody has said they are paying this yet'),
                    subtitle: s.lastPaidAt == null
                        ? null
                        : Text('Last paid ${formatDate(s.lastPaidAt)}${s.lastPaidBy != null ? ' by ${api.nameOf(s.lastPaidBy) ?? 'a member'}' : ''}'),
                    trailing: s.claimedBy == null
                        ? TextButton(onPressed: () => _claim(s), child: const Text("I'm paying"))
                        : s.claimedBy == api.myId
                            ? TextButton(onPressed: () => _claim(s, release: true), child: const Text('Release'))
                            : null,
                  ),
                ),
              if (s.active)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Wrap(spacing: 8, runSpacing: 8, children: [
                    FilledButton.icon(onPressed: () => _pay(s), icon: const Icon(Icons.check_circle_outline), label: const Text('Mark paid')),
                    OutlinedButton.icon(
                      onPressed: () => _confirmThen('Skip the payment due ${formatDate(s.nextDueDate)}?', () async {
                        await api.post('/recurring/${s.id}/skip');
                        reload();
                      }),
                      icon: const Icon(Icons.skip_next_outlined),
                      label: const Text('Skip'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _confirmThen('Stop this schedule? History is kept.', () async {
                        await api.delete('/recurring/${s.id}');
                        if (context.mounted) context.pop();
                      }),
                      icon: const Icon(Icons.stop_circle_outlined),
                      label: const Text('Stop'),
                    ),
                  ]),
                ),
              if (s.notes != null && s.notes!.isNotEmpty) ...[
                const SectionTitle('Notes'),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: SelectableText(s.notes!)),
              ],
              const SectionTitle('Payment history'),
              if (s.history.isEmpty) const EmptyNote('No payments recorded yet.'),
              for (final c in s.history) CaptureTile(capture: c, onReturn: reload),
            ],
          ),
        );
      },
    );
  }
}

class _PaySheet extends StatefulWidget {
  const _PaySheet({required this.schedule});
  final Schedule schedule;
  @override
  State<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<_PaySheet> {
  late final _amount = TextEditingController(text: minorToInput(widget.schedule.amountMinor));
  late final _method = TextEditingController(text: widget.schedule.method ?? '');
  final _confirmation = TextEditingController();
  DateTime _paidAt = todayUtc();
  String? _paidBy;
  final List<PickedUpload> _files = [];
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _method.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final api = context.read<Api>();
    try {
      final uploaded = await api.upload(_files);
      await api.post('/recurring/${widget.schedule.id}/pay', {
        'paidAt': isoDate(_paidAt),
        'amountMinor': ?parseMoney(_amount.text),
        if (_method.text.trim().isNotEmpty) 'method': _method.text.trim(),
        if (_confirmation.text.trim().isNotEmpty) 'confirmationNumber': _confirmation.text.trim(),
        'attachmentIds': uploaded.map((a) => a['_id']).toList(),
        if (api.isFamily && _paidBy != null) 'paidBy': _paidBy,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Record payment due ${formatDate(widget.schedule.nextDueDate)}', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Paid on'),
            subtitle: Text(formatDate(_paidAt)),
            trailing: const Icon(Icons.calendar_today_outlined),
            onTap: () async {
              final d = await showDatePicker(context: context, initialDate: _paidAt.toLocal(), firstDate: DateTime(2000), lastDate: DateTime(2100));
              if (d != null) setState(() => _paidAt = DateTime.utc(d.year, d.month, d.day));
            },
          ),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: 'Amount (${widget.schedule.currency})', border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(controller: _method, decoration: const InputDecoration(labelText: 'Method', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(controller: _confirmation, decoration: const InputDecoration(labelText: 'Confirmation #', border: OutlineInputBorder())),
          if (context.read<Api>().isFamily) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _paidBy ?? context.read<Api>().myId,
              decoration: const InputDecoration(labelText: 'Paid by', border: OutlineInputBorder()),
              items: [
                for (final m in context.read<Api>().members)
                  DropdownMenuItem(
                    value: m['userId'] as String,
                    child: Text('${m['name']}${m['userId'] == context.read<Api>().myId ? ' (me)' : ''}'),
                  ),
              ],
              onChanged: (v) => setState(() => _paidBy = v),
            ),
          ],
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () async {
                    final picked = await pickUploads(context);
                    if (picked.isNotEmpty) setState(() => _files.addAll(picked));
                  },
            icon: const Icon(Icons.add_a_photo_outlined),
            label: const Text('Attach proof'),
          ),
          PendingUploads(files: _files, onRemove: (i) => setState(() => _files.removeAt(i))),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Save payment'),
          ),
        ]),
      ),
    );
  }
}

class ScheduleFormScreen extends StatefulWidget {
  const ScheduleFormScreen({super.key});
  @override
  State<ScheduleFormScreen> createState() => _ScheduleFormScreenState();
}

class _ScheduleFormScreenState extends State<ScheduleFormScreen> {
  static const _freqs = [
    ('Monthly', 'month', 1),
    ('Quarterly', 'month', 3),
    ('Every 6 months', 'month', 6),
    ('Yearly', 'year', 1),
    ('Weekly', 'week', 1),
    ('Every 2 weeks', 'week', 2),
  ];
  final _title = TextEditingController();
  final _counterparty = TextEditingController();
  final _amount = TextEditingController();
  final _property = TextEditingController();
  final _category = TextEditingController();
  final _notes = TextEditingController();
  int _freq = 0;
  int _remind = 3;
  DateTime _due = todayUtc();
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_title, _counterparty, _amount, _property, _category, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _v(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _save() async {
    setState(() => _busy = true);
    final f = _freqs[_freq];
    try {
      final created = await context.read<Api>().post('/recurring', {
        'title': _v(_title) ?? _v(_counterparty) ?? 'Recurring payment',
        'counterparty': _v(_counterparty),
        'amountMinor': parseMoney(_amount.text),
        'property': _v(_property),
        'category': _v(_category),
        'notes': _v(_notes),
        'frequency': {'unit': f.$2, 'interval': f.$3},
        'nextDueDate': isoDate(_due),
        'reminderDaysBefore': _remind,
      }) as Map<String, dynamic>;
      if (mounted) context.pushReplacement('/recurring/${created['_id']}');
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _busy = false);
      }
    }
  }

  Widget _text(TextEditingController c, String label, {String? hint, TextInputType? keyboard, int lines = 1}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          keyboardType: keyboard,
          maxLines: lines,
          decoration: InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder()),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New recurring payment')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        _text(_title, 'Name', hint: 'e.g. Oak Grove HOA dues'),
        _text(_counterparty, 'Paid to'),
        _text(_amount, 'Usual amount', keyboard: const TextInputType.numberWithOptions(decimal: true)),
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DropdownButtonFormField<int>(
            initialValue: _freq,
            decoration: const InputDecoration(labelText: 'How often', border: OutlineInputBorder()),
            items: [for (var i = 0; i < _freqs.length; i++) DropdownMenuItem(value: i, child: Text(_freqs[i].$1))],
            onChanged: (v) => setState(() => _freq = v ?? 0),
          ),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Next due date'),
          subtitle: Text(formatDate(_due)),
          trailing: const Icon(Icons.calendar_today_outlined),
          onTap: () async {
            final d = await showDatePicker(context: context, initialDate: _due.toLocal(), firstDate: DateTime(2000), lastDate: DateTime(2100));
            if (d != null) setState(() => _due = DateTime.utc(d.year, d.month, d.day));
          },
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DropdownButtonFormField<int>(
            initialValue: _remind,
            decoration: const InputDecoration(labelText: 'Remind me', border: OutlineInputBorder()),
            items: [for (final d in [0, 1, 3, 7, 14]) DropdownMenuItem(value: d, child: Text(d == 0 ? 'On the due date' : '$d days before'))],
            onChanged: (v) => setState(() => _remind = v ?? 3),
          ),
        ),
        _text(_property, 'Property'),
        _text(_category, 'Category'),
        _text(_notes, 'Notes', hint: 'Account #, portal URL…', lines: 3),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Create schedule'),
        ),
      ]),
    );
  }
}
