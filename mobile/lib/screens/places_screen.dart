import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../format.dart';
import '../widgets.dart';

const _placeKinds = {'restaurant': '🍽️ Food', 'stay': '🏨 Stays', 'sight': '📸 Sights', 'shop': '🛍️ Shops', 'other': 'Other'};
const _ideaKinds = {'product': 'Products', 'design': 'Design', 'gift': 'Gifts', 'other': 'Other'};

/// Places (restaurants, stays, sights) and ideas (products, designs, gifts) in one screen.
class PlacesScreen extends StatefulWidget {
  const PlacesScreen({super.key, this.initialTab = 0});
  final int initialTab;
  @override
  State<PlacesScreen> createState() => _PlacesScreenState();
}

class _PlacesScreenState extends State<PlacesScreen> {
  late int _tab = widget.initialTab;
  String? _kind;
  String _state = 'all'; // all | open | done
  int _version = 0;

  bool get _places => _tab == 0;

  @override
  Widget build(BuildContext context) {
    final api = context.watch<Api>();
    final kinds = _places ? _placeKinds : _ideaKinds;
    return Scaffold(
      appBar: AppBar(title: const Text('Places & ideas')),
      floatingActionButton: api.canWrite
          ? FloatingActionButton.extended(
              icon: const Icon(Icons.add),
              label: Text(_places ? 'Add place' : 'Add idea'),
              onPressed: () async {
                await context.push('/new?type=${_places ? 'place' : 'idea'}');
                setState(() => _version++);
              },
            )
          : null,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, icon: Icon(Icons.place_outlined), label: Text('Places')),
              ButtonSegment(value: 1, icon: Icon(Icons.lightbulb_outline), label: Text('Ideas')),
            ],
            selected: {_tab},
            onSelectionChanged: (s) => setState(() {
              _tab = s.first;
              _kind = null;
              _state = 'all';
            }),
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: ChoiceChip(label: const Text('All'), selected: _kind == null, onSelected: (_) => setState(() => _kind = null)),
            ),
            for (final e in kinds.entries)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(label: Text(e.value), selected: _kind == e.key, onSelected: (_) => setState(() => _kind = _kind == e.key ? null : e.key)),
              ),
          ]),
        ),
        SizedBox(
          height: 44,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
            for (final s in const ['all', 'open', 'done'])
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(
                  label: Text(s == 'all' ? 'Any' : _places ? (s == 'open' ? 'Want to go' : 'Been there') : (s == 'open' ? 'Want' : 'Done')),
                  selected: _state == s,
                  onSelected: (_) => setState(() => _state = s),
                ),
              ),
          ]),
        ),
        Expanded(
          child: AsyncView<List<Map<String, dynamic>>>(
            key: ValueKey('places-$_tab-$_version-${api.workspace?['id']}'),
            load: () async {
              final data = await api.get('/captures', {'type': _places ? 'place' : 'idea', 'thumbs': 1, 'limit': 100}) as Map<String, dynamic>;
              return (data['items'] as List).cast<Map<String, dynamic>>();
            },
            builder: (context, all, reload) {
              final items = all.where((i) {
                final sub = (_places ? i['place'] : i['idea']) as Map?;
                if (_kind != null && (sub?['kind'] ?? 'other') != _kind) return false;
                if (_state != 'all') {
                  final done = _places ? (sub?['visited'] == true) : (sub?['status'] == 'done');
                  if ((_state == 'done') != done) return false;
                }
                return true;
              }).toList();
              if (items.isEmpty) {
                return ListView(padding: const EdgeInsets.all(16), children: [
                  EmptyNote(all.isEmpty
                      ? (_places
                          ? 'No places yet. Save restaurants, hotels and spots to visit: a screenshot, map link, or just a name.'
                          : 'No ideas yet. Save products, designs and gift ideas with a photo or link.')
                      : 'Nothing matches these filters.'),
                ]);
              }
              return ListView.separated(
                padding: const EdgeInsets.only(bottom: 96),
                itemCount: items.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, n) => _ItemTile(item: items[n], places: _places, onReturn: reload),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item, required this.places, required this.onReturn});
  final Map<String, dynamic> item;
  final bool places;
  final VoidCallback onReturn;

  @override
  Widget build(BuildContext context) {
    final api = context.read<Api>();
    final scheme = Theme.of(context).colorScheme;
    final sub = ((places ? item['place'] : item['idea']) as Map?)?.cast<String, dynamic>() ?? const {};
    final thumb = item['thumbUrl'] as String?;
    final rating = (sub['rating'] as num?)?.toInt();
    final subtitle = places
        ? [sub['address'], item['trip']].whereType<String>().join(' · ')
        : [item['counterparty'], item['amountMinor'] == null ? null : formatMoney((item['amountMinor'] as num).toInt(), item['currency'] as String? ?? 'USD')]
            .whereType<String>()
            .join(' · ');
    final status = places
        ? (sub['visited'] == true ? 'Been there${rating != null ? ' · ${'★' * rating}' : ''}' : 'Want to go')
        : {'done': 'Done / bought', 'dropped': 'Dropped'}[sub['status']] ?? 'Want';
    return ListTile(
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          width: 56,
          height: 56,
          child: thumb != null
              ? Image.network(api.fileUrl(thumb), fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined))
              : Container(color: scheme.surfaceContainerHighest, child: Icon(places ? Icons.place_outlined : Icons.lightbulb_outline)),
        ),
      ),
      title: Text(item['title'] as String),
      subtitle: Text([if (subtitle.isNotEmpty) subtitle, status].join('\n')),
      isThreeLine: subtitle.isNotEmpty,
      onTap: () async {
        await context.push('/captures/${item['_id']}');
        onReturn();
      },
    );
  }
}
