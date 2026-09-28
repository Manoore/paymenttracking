import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../format.dart';
import '../models.dart';
import '../widgets.dart';

/// Add or edit a property. Returns the saved property name, or null if cancelled.
Future<String?> showPropertySheet(BuildContext context, {Map<String, dynamic>? property}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _PropertySheet(property: property),
  );
}

class _PropertySheet extends StatefulWidget {
  const _PropertySheet({this.property});
  final Map<String, dynamic>? property;
  @override
  State<_PropertySheet> createState() => _PropertySheetState();
}

class _PropertySheetState extends State<_PropertySheet> {
  late final _name = TextEditingController(text: widget.property?['name'] as String? ?? '');
  late final _address = TextEditingController(text: widget.property?['address'] as String? ?? '');
  late final _notes = TextEditingController(text: widget.property?['notes'] as String? ?? '');
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final api = context.read<Api>();
    final body = {
      'name': _name.text.trim(),
      'address': _address.text.trim().isEmpty ? null : _address.text.trim(),
      'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
    };
    try {
      final id = widget.property?['id'];
      final saved = (id != null ? await api.patch('/properties/$id', body) : await api.post('/properties', body)) as Map<String, dynamic>;
      if (mounted) Navigator.pop(context, saved['name'] as String);
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    InputDecoration dec(String l, {String? h}) => InputDecoration(labelText: l, helperText: h, border: const OutlineInputBorder());
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(widget.property?['id'] != null ? 'Edit property' : 'Add property', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          TextField(
            controller: _name,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
            decoration: dec('Property name', h: 'Short name you pick on bills, e.g. “Oak Grove”'),
          ),
          const SizedBox(height: 12),
          TextField(controller: _address, keyboardType: TextInputType.streetAddress, decoration: dec('Address (optional)')),
          const SizedBox(height: 12),
          TextField(controller: _notes, maxLines: 3, decoration: dec('Notes (optional)', h: 'HOA contact, parcel #, insurance…')),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy || _name.text.trim().isEmpty ? null : _save,
            child: _busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(widget.property?['id'] != null ? 'Save' : 'Add property'),
          ),
        ]),
      ),
    );
  }
}

String _totalLabel(Map<String, dynamic> p) {
  final totals = ((p['totals'] as List?) ?? const []).cast<Map<String, dynamic>>();
  if (totals.isEmpty) return '–';
  return totals.map((t) => formatMoney((t['totalMinor'] as num).toInt(), t['currency'] as String)).join(' · ');
}

class PropertiesScreen extends StatefulWidget {
  const PropertiesScreen({super.key});
  @override
  State<PropertiesScreen> createState() => _PropertiesScreenState();
}

class _PropertiesScreenState extends State<PropertiesScreen> {
  int _version = 0;

  Future<void> _add() async {
    final name = await showPropertySheet(context);
    if (name == null || !mounted) return;
    setState(() => _version++);
    context.push('/properties/${Uri.encodeComponent(name)}');
  }

  @override
  Widget build(BuildContext context) {
    final api = context.watch<Api>();
    return Scaffold(
      appBar: AppBar(title: const Text('Properties')),
      floatingActionButton: api.canWrite
          ? FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add_home_outlined), label: const Text('Add property'))
          : null,
      body: AsyncView<List<Map<String, dynamic>>>(
        key: ValueKey('props-$_version-${api.workspace?['id']}'),
        load: () async => (((await api.get('/properties')) as Map)['items'] as List).cast<Map<String, dynamic>>(),
        builder: (context, items, reload) {
          if (items.isEmpty) {
            return ListView(padding: const EdgeInsets.all(16), children: const [
              EmptyNote('No properties yet. Add your home or rental (like “Oak Grove”) to keep its HOA, utilities, insurance and repairs together.'),
            ]);
          }
          return ListView.separated(
            padding: const EdgeInsets.only(bottom: 96),
            itemCount: items.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final p = items[i];
              return ListTile(
                leading: const CircleAvatar(child: Icon(Icons.home_work_outlined)),
                title: Text(p['name'] as String),
                subtitle: Text(p['address'] as String? ?? '${p['count']} records · ${p['schedules']} recurring'),
                trailing: Text(_totalLabel(p), style: const TextStyle(fontWeight: FontWeight.w600)),
                onTap: () async {
                  await context.push('/properties/${Uri.encodeComponent(p['name'] as String)}');
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

class PropertyDetailScreen extends StatefulWidget {
  const PropertyDetailScreen({super.key, required this.name});
  final String name;
  @override
  State<PropertyDetailScreen> createState() => _PropertyDetailScreenState();
}

class _PropertyDetailScreenState extends State<PropertyDetailScreen> {
  late String _name = widget.name;
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    final api = context.watch<Api>();
    final q = Uri.encodeComponent(_name);
    return Scaffold(
      appBar: AppBar(title: Text(_name)),
      body: AsyncView<(Map<String, dynamic>?, List<Capture>)>(
        key: ValueKey('prop-$_name-$_version'),
        load: () async {
          final all = (((await api.get('/properties')) as Map)['items'] as List).cast<Map<String, dynamic>>();
          final match = all.where((p) => (p['name'] as String).toLowerCase() == _name.toLowerCase());
          final recs = await api.get('/captures', {'property': _name, 'limit': 100}) as Map<String, dynamic>;
          return (match.isEmpty ? null : match.first, capturesFrom(recs['items']));
        },
        builder: (context, data, reload) {
          final (p, records) = data;
          return ListView(
            padding: const EdgeInsets.only(bottom: 40),
            children: [
              if (p?['address'] != null)
                ListTile(leading: const Icon(Icons.place_outlined), title: Text(p!['address'] as String)),
              if (p?['notes'] != null)
                ListTile(leading: const Icon(Icons.notes), title: Text(p!['notes'] as String)),
              ListTile(title: const Text('Spent (all time)'), trailing: Text(p == null ? '–' : _totalLabel(p))),
              if (api.canWrite)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Wrap(spacing: 8, runSpacing: 8, children: [
                    FilledButton.icon(
                      icon: const Icon(Icons.add),
                      label: const Text('Add payment'),
                      onPressed: () async {
                        await context.push('/new?type=payment&property=$q');
                        setState(() => _version++);
                      },
                    ),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.build_outlined),
                      label: const Text('Expense / repair'),
                      onPressed: () async {
                        await context.push('/new?type=expense&property=$q');
                        setState(() => _version++);
                      },
                    ),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.repeat),
                      label: const Text('Recurring bill'),
                      onPressed: () => context.push('/recurring/new?property=$q'),
                    ),
                    TextButton.icon(
                      icon: const Icon(Icons.edit_outlined),
                      label: Text(p?['id'] != null ? 'Edit details' : 'Add address & notes'),
                      onPressed: () async {
                        final name = await showPropertySheet(context, property: p ?? {'name': _name});
                        if (name != null) {
                          setState(() {
                            _name = name;
                            _version++;
                          });
                        }
                      },
                    ),
                  ]),
                ),
              const SectionTitle('Records'),
              if (records.isEmpty) const EmptyNote('Nothing recorded for this property yet.'),
              for (final c in records) CaptureTile(capture: c, onReturn: reload),
            ],
          );
        },
      ),
    );
  }
}
