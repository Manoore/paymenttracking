import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../models.dart';
import '../widgets.dart';

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key, this.inbox = false});
  final bool inbox;
  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  String _q = '';
  String? _type;
  final List<Capture> _items = [];
  int _page = 1;
  int _total = 0;
  bool _loading = false;
  String? _error;
  int _seq = 0;
  Object? _workspace;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reload when the user switches between personal and family spaces.
    final ws = context.watch<Api>().workspace?['id'];
    if (_workspace != null && ws != _workspace) _load(reset: true);
    _workspace = ws;
  }

  @override
  void initState() {
    super.initState();
    _load(reset: true);
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300 && !_loading && _items.length < _total) {
        _load();
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    final id = ++_seq;
    if (reset) _page = 1;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await context.read<Api>().get('/captures', {
        'q': _q,
        'type': _type,
        if (widget.inbox) 'filed': 'false',
        'page': _page,
        'limit': 30,
      }) as Map<String, dynamic>;
      if (id != _seq || !mounted) return;
      setState(() {
        if (reset) _items.clear();
        _items.addAll(capturesFrom(data['items']));
        _total = (data['total'] as num).toInt();
        _page++;
      });
    } catch (e) {
      if (id == _seq && mounted) setState(() => _error = e.toString());
    } finally {
      if (id == _seq && mounted) setState(() => _loading = false);
    }
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _q = v.trim();
      _load(reset: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.inbox ? 'Inbox' : 'Activity')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: SearchBar(
            controller: _search,
            hintText: 'Search payee, property, confirmation #…',
            leading: const Icon(Icons.search),
            elevation: const WidgetStatePropertyAll(0),
            onChanged: _onSearch,
            trailing: [
              if (_search.text.isNotEmpty)
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () {
                    _search.clear();
                    _onSearch('');
                  },
                ),
            ],
          ),
        ),
        if (!widget.inbox)
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (final t in [null, ...captureTypes])
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(t == null ? 'All' : typeLabels[t]!),
                      selected: _type == t,
                      onSelected: (_) {
                        setState(() => _type = t);
                        _load(reset: true);
                      },
                    ),
                  ),
              ],
            ),
          ),
        if (widget.inbox)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('Quick captures not filed yet. Open one and tap "File it".',
                style: TextStyle(color: Theme.of(context).colorScheme.outline)),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _load(reset: true),
            child: _error != null && _items.isEmpty
                ? ListView(children: [EmptyNote(_error!)])
                : _items.isEmpty && !_loading
                    ? ListView(children: [EmptyNote(_q.isEmpty ? 'Nothing here yet.' : 'No matches for "$_q".')])
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.only(bottom: 96),
                        itemCount: _items.length + (_loading ? 1 : 0),
                        itemBuilder: (context, i) => i == _items.length
                            ? const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
                            : CaptureTile(capture: _items[i], onReturn: () => _load(reset: true)),
                      ),
          ),
        ),
      ]),
    );
  }
}
