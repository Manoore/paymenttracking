import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../widgets.dart';

/// Profile → Document reading: pick an AI provider, paste its key, choose a model.
class ReaderSettingsScreen extends StatefulWidget {
  const ReaderSettingsScreen({super.key});
  @override
  State<ReaderSettingsScreen> createState() => _ReaderSettingsScreenState();
}

class _ReaderSettingsScreenState extends State<ReaderSettingsScreen> {
  List<Map<String, dynamic>> _providers = const [];
  Map<String, dynamic>? _settings;
  String _provider = 'openai';
  final _key = TextEditingController();
  final _model = TextEditingController();
  final _baseUrl = TextEditingController();
  final _limit = TextEditingController(text: '200');
  bool _autoRead = true;
  bool _busy = false;
  String? _testMsg;
  bool? _testOk;

  static const _other = '__other__';
  bool _customModel = false;
  List<String> get _models => ((_info['models'] as List?) ?? const []).cast<String>();

  Map<String, dynamic> get _info => _providers.firstWhere((p) => p['id'] == _provider, orElse: () => const {});

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_key, _model, _baseUrl, _limit]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.read<Api>();
    try {
      final p = await api.get('/reader/providers') as Map<String, dynamic>;
      final s = await api.get('/workspaces/current/reader') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _providers = (p['providers'] as List).cast<Map<String, dynamic>>();
        _settings = s;
        _provider = s['provider'] as String? ?? 'openai';
        _model.text = s['model'] as String? ?? (_info['defaultModel'] as String? ?? '');
        _customModel = _model.text.isNotEmpty && !_models.contains(_model.text);
        _baseUrl.text = s['baseUrl'] as String? ?? '';
        _limit.text = '${s['monthlyLimit'] ?? 200}';
        _autoRead = s['autoRead'] as bool? ?? true;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  void _pickProvider(String id) {
    setState(() {
      _provider = id;
      _model.text = id == _settings?['provider'] ? (_settings?['model'] as String? ?? '') : (_info['defaultModel'] as String? ?? '');
      _customModel = _model.text.isNotEmpty && !_models.contains(_model.text);
      _testMsg = null;
    });
  }

  Map<String, dynamic> _body() => {
        'provider': _provider,
        if (_model.text.trim().isNotEmpty) 'model': _model.text.trim(),
        if (_info['needsBaseUrl'] == true) 'baseUrl': _baseUrl.text.trim().isEmpty ? null : _baseUrl.text.trim(),
        if (_key.text.trim().isNotEmpty) 'apiKey': _key.text.trim(),
        'autoRead': _autoRead,
        'monthlyLimit': int.tryParse(_limit.text) ?? 200,
      };

  Future<void> _test() async {
    setState(() => _busy = true);
    try {
      final r = await context.read<Api>().post('/workspaces/current/reader/test', _body()) as Map<String, dynamic>;
      setState(() {
        _testOk = r['ok'] == true;
        _testMsg = r['message'] as String?;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final api = context.read<Api>();
    try {
      await api.put('/workspaces/current/reader', _body());
      await api.refreshContext();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Document reading is on')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    final api = context.read<Api>();
    try {
      await api.delete('/workspaces/current/reader');
      await api.refreshContext();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _settings;
    InputDecoration dec(String l, {String? h}) => InputDecoration(labelText: l, helperText: h, helperMaxLines: 2, border: const OutlineInputBorder());
    return Scaffold(
      appBar: AppBar(title: const Text('Document reading (AI)')),
      body: s == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 40), children: [
              Text('Applies to the space “${context.watch<Api>().workspace?['name'] ?? ''}”. Each space has its own key.',
                  style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              const SizedBox(height: 8),
              const Text('When you attach a receipt or bill, your chosen AI provider reads the amount, date, payee and confirmation '
                  'number, and you check before saving. Files go to that provider using your own API key.'),
              if (s['configured'] == true) ...[
                const SizedBox(height: 12),
                Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: const Icon(Icons.check_circle, color: Colors.green),
                    title: Text('${s['providerLabel']} · ${s['model']}'),
                    subtitle: Text('${s['keyHint']} · ${s['usedThisMonth']}/${s['monthlyLimit']} reads this month'),
                  ),
                ),
              ],
              if (s['canManage'] != true) ...[
                const SizedBox(height: 16),
                Text(s['configured'] == true ? 'Only the owner of this space can change these settings.' : 'Not set up. Ask the owner of this space to add an API key.'),
              ] else ...[
                const SectionTitle('Provider'),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final p in _providers)
                    ChoiceChip(label: Text(p['label'] as String), selected: _provider == p['id'], onSelected: (_) => _pickProvider(p['id'] as String)),
                ]),
                const SizedBox(height: 16),
                TextField(
                  controller: _key,
                  obscureText: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: dec(
                    'API key',
                    h: _provider == s['provider'] && s['keyHint'] != null ? 'Saved: ${s['keyHint']}. Leave blank to keep it.' : _info['keyHint'] as String?,
                  ),
                ),
                const SizedBox(height: 12),
                if (_models.isNotEmpty)
                  DropdownButtonFormField<String>(
                    key: ValueKey('model-$_provider'),
                    initialValue: _customModel ? _other : (_models.contains(_model.text) ? _model.text : _models.first),
                    isExpanded: true,
                    decoration: dec('Model', h: 'Choose “Other” to use a model that isn’t in the list'),
                    items: [
                      for (final m in _models)
                        DropdownMenuItem(value: m, child: Text(m == _info['defaultModel'] ? '$m (recommended)' : m)),
                      const DropdownMenuItem(value: _other, child: Text('Other… (type a model name)')),
                    ],
                    onChanged: (v) => setState(() {
                      _customModel = v == _other;
                      _model.text = _customModel ? '' : (v ?? '');
                      _testMsg = null;
                    }),
                  ),
                if (_customModel || _models.isEmpty) ...[
                  if (_models.isNotEmpty) const SizedBox(height: 12),
                  TextField(
                    controller: _model,
                    autocorrect: false,
                    decoration: dec('Model name', h: 'Exact model name at your provider, e.g. gpt-5.1'),
                  ),
                ],
                if (_info['needsBaseUrl'] == true) ...[
                  const SizedBox(height: 12),
                  TextField(controller: _baseUrl, keyboardType: TextInputType.url, decoration: dec('Service URL', h: 'e.g. https://openrouter.ai/api/v1')),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: _limit,
                  keyboardType: TextInputType.number,
                  decoration: dec('Monthly limit (reads)', h: 'Protects against surprise bills. Re-reading the same file is free.'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Read automatically when I attach a file'),
                  value: _autoRead,
                  onChanged: (v) => setState(() => _autoRead = v),
                ),
                if (_testMsg != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(_testMsg!, style: TextStyle(color: _testOk == true ? Colors.green : Theme.of(context).colorScheme.error)),
                  ),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  FilledButton(onPressed: _busy ? null : _save, child: const Text('Save')),
                  OutlinedButton(onPressed: _busy ? null : _test, child: const Text('Test key')),
                  if (s['configured'] == true) TextButton(onPressed: _busy ? null : _remove, child: const Text('Remove key')),
                ]),
                const SizedBox(height: 8),
                Text('Your key is encrypted on the server and never shown again in full.', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              ],
            ]),
    );
  }
}
