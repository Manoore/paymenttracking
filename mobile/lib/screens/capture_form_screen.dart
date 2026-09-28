import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../format.dart';
import '../models.dart';
import '../widgets.dart';

const _finance = {'payment', 'expense', 'deposit', 'idea'};
const _purchase = {'payment', 'expense'};
const _counterpartyLabel = {'payment': 'Paid to', 'expense': 'Merchant', 'deposit': 'Payer', 'idea': 'Store / brand'};

/// Create a new capture, or edit/file an existing one (when [capture] is set).
class CaptureFormScreen extends StatefulWidget {
  const CaptureFormScreen({super.key, this.capture, this.initialType, this.initialProperty});
  final Capture? capture;
  final String? initialType;
  final String? initialProperty;
  @override
  State<CaptureFormScreen> createState() => _CaptureFormScreenState();
}

class _CaptureFormScreenState extends State<CaptureFormScreen> {
  late String _type;
  late DateTime _date;
  final _c = <String, TextEditingController>{};
  bool _reimbursable = false;
  String _status = 'to_submit';
  bool _cleared = false;
  DateTime? _returnBy;
  DateTime? _warrantyUntil;
  DateTime? _expiresAt;
  String _docKind = 'other';
  bool _visited = false;
  String _ideaStatus = 'want';
  String? _paidBy;
  bool _private = false;
  final List<PickedUpload> _files = [];
  bool _saving = false;
  Map<String, List<String>> _suggest = {};

  TextEditingController c(String k) => _c.putIfAbsent(k, TextEditingController.new);

  @override
  void initState() {
    super.initState();
    final x = widget.capture;
    _type = x?.type ?? (captureTypes.contains(widget.initialType) ? widget.initialType! : 'payment');
    _date = x?.occurredAt ?? todayUtc();
    c('title').text = x?.title ?? '';
    c('amount').text = minorToInput(x?.amountMinor);
    c('currency').text = x?.currency ?? 'USD';
    c('counterparty').text = x?.counterparty ?? '';
    c('category').text = x?.category ?? '';
    c('property').text = x?.property ?? widget.initialProperty ?? '';
    c('trip').text = x?.trip ?? '';
    c('tags').text = x?.tags.join(', ') ?? '';
    c('notes').text = x?.notes ?? '';
    c('url').text = x?.url ?? '';
    c('method').text = x?.method ?? '';
    c('confirmation').text = x?.confirmationNumber ?? '';
    c('checkNumber').text = x?.checkNumber ?? '';
    c('bankAccount').text = x?.bankAccount ?? '';
    c('organization').text = x?.organization ?? '';
    c('reimbursedAmount').text = minorToInput(x?.reimbursement?.amountReimbursedMinor);
    _reimbursable = x?.reimbursable ?? false;
    _status = x?.reimbursement?.status ?? 'to_submit';
    _cleared = x?.cleared ?? false;
    _returnBy = x?.returnBy;
    _warrantyUntil = x?.warrantyUntil;
    _expiresAt = x?.expiresAt;
    _docKind = x?.docKind ?? 'other';
    _visited = x?.visited ?? false;
    _ideaStatus = x?.ideaStatus ?? 'want';
    _paidBy = x?.paidBy;
    _private = x?.isPrivate ?? false;
    c('docReference').text = x?.docReference ?? '';
    c('address').text = x?.address ?? '';
    c('mapUrl').text = x?.mapUrl ?? '';
    c('owedAmount').text = minorToInput(x?.reimbursement?.amountOwedMinor);
    _loadSuggestions();
  }

  Future<void> _loadSuggestions() async {
    final api = context.read<Api>();
    final fields = ['counterparty', 'category', 'property', 'trip', 'organization', 'method'];
    try {
      final results = await Future.wait(fields.map((f) => api.get('/suggestions', {'field': f})));
      if (!mounted) return;
      setState(() => _suggest = {
            for (var i = 0; i < fields.length; i++) fields[i]: ((results[i] as Map)['values'] as List).cast<String>(),
          });
    } catch (_) {}
  }

  @override
  void dispose() {
    for (final ctrl in _c.values) {
      ctrl.dispose();
    }
    super.dispose();
  }

  String? _blank(String k) => c(k).text.trim().isEmpty ? null : c(k).text.trim();

  String _defaultTitle() {
    final who = c('counterparty').text.trim();
    switch (_type) {
      case 'payment':
        return who.isEmpty ? 'Payment' : 'Payment to $who';
      case 'expense':
        return who.isEmpty ? 'Expense' : 'Expense at $who';
      case 'deposit':
        return who.isEmpty ? 'Check deposit' : 'Check from $who';
      case 'document':
        return docKindLabels[_docKind] ?? 'Document';
      case 'place':
        final addr = c('address').text.trim();
        return addr.isEmpty ? 'Place to remember' : addr.split(',').first;
      case 'idea':
        return 'Idea';
      case 'link':
        final u = c('url').text.trim();
        return u.isEmpty ? 'Saved link' : u.replaceFirst(RegExp(r'^https?://'), '');
      default:
        return _files.isNotEmpty ? 'Screenshot ${formatDate(todayUtc())}' : 'Untitled note';
    }
  }

  Map<String, dynamic> _payload() {
    final isFinance = _finance.contains(_type);
    return {
      'type': _type,
      'title': _blank('title') ?? _defaultTitle(),
      'notes': _blank('notes'),
      'tags': c('tags').text.split(',').map((t) => t.trim()).where((t) => t.isNotEmpty).toList(),
      'category': _blank('category'),
      'property': _blank('property'),
      'trip': _blank('trip'),
      'organization': _blank('organization'),
      'counterparty': _blank('counterparty'),
      'url': _blank('url'),
      'occurredAt': isoDate(_date),
      'amountMinor': isFinance ? parseMoney(c('amount').text) : null,
      'currency': (_blank('currency') ?? 'USD').toUpperCase(),
      'payment': _type == 'payment' ? {'method': _blank('method'), 'confirmationNumber': _blank('confirmation')} : null,
      'expense': _type == 'expense'
          ? {
              'paymentMethod': _blank('method'),
              'reimbursable': _reimbursable,
              'reimbursement': _reimbursable
                  ? {
                      'status': _status,
                      'amountOwedMinor': parseMoney(c('owedAmount').text),
                      'amountReimbursedMinor': parseMoney(c('reimbursedAmount').text) ?? 0,
                    }
                  : null,
            }
          : null,
      'returnBy': _purchase.contains(_type) && _returnBy != null ? isoDate(_returnBy!) : null,
      'warrantyUntil': _purchase.contains(_type) && _warrantyUntil != null ? isoDate(_warrantyUntil!) : null,
      'document': _type == 'document'
          ? {'kind': _docKind, 'reference': _blank('docReference'), 'expiresAt': _expiresAt == null ? null : isoDate(_expiresAt!)}
          : null,
      'place': _type == 'place' ? {'address': _blank('address'), 'mapUrl': _blank('mapUrl'), 'visited': _visited} : null,
      'idea': _type == 'idea' ? {'status': _ideaStatus} : null,
      'paidBy': _purchase.contains(_type) ? _paidBy : null,
      'visibility': _private ? 'private' : 'workspace',
      'deposit': _type == 'deposit'
          ? {'checkNumber': _blank('checkNumber'), 'bankAccount': _blank('bankAccount'), 'cleared': _cleared}
          : null,
    };
  }

  Future<void> _save({bool toInbox = false}) async {
    setState(() => _saving = true);
    final api = context.read<Api>();
    try {
      final body = _payload();
      Map<String, dynamic> saved;
      if (widget.capture == null) {
        body.removeWhere((k, v) => v == null);
        if (toInbox) body['filed'] = false;
        body['source'] = _files.isEmpty ? 'manual' : 'upload';
        saved = await api.post('/captures', body) as Map<String, dynamic>;
      } else {
        body['filed'] = true;
        saved = await api.patch('/captures/${widget.capture!.id}', body) as Map<String, dynamic>;
      }
      if (_files.isNotEmpty) await api.upload(_files, captureId: saved['_id'] as String);
      if (!mounted) return;
      if (widget.capture == null) {
        context.pushReplacement('/captures/${saved['_id']}');
      } else {
        context.pop(true);
      }
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _saving = false);
      }
    }
  }

  Widget _dateField(String label, DateTime? value, void Function(DateTime?) onChanged) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            suffixIcon: value == null ? null : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(() => onChanged(null))),
          ),
          child: InkWell(
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: (value ?? todayUtc()).toLocal(),
                firstDate: DateTime(2000),
                lastDate: DateTime(2100),
              );
              if (d != null) setState(() => onChanged(DateTime.utc(d.year, d.month, d.day)));
            },
            child: Text(value == null ? 'Not set' : formatDate(value)),
          ),
        ),
      );

  Widget _field(String k, String label, {String? hint, TextInputType? keyboard, int maxLines = 1}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c(k),
          keyboardType: keyboard,
          maxLines: maxLines,
          decoration: InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder()),
        ),
      );

  Widget _suggestField(String k, String label, {String? hint, String? suggestKey}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: SuggestField(controller: c(k), label: label, hint: hint, options: _suggest[suggestKey ?? k] ?? const []),
      );

  @override
  Widget build(BuildContext context) {
    final api = context.watch<Api>();
    final isNew = widget.capture == null;
    final isFinance = _finance.contains(_type);
    return Scaffold(
      appBar: AppBar(title: Text(isNew ? 'New capture' : (widget.capture!.filed ? 'Edit' : 'File capture'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in captureTypes)
              ChoiceChip(label: Text(typeLabels[t]!), selected: _type == t, onSelected: (_) => setState(() => _type = t)),
          ]),
          const SizedBox(height: 16),
          if (isNew) ...[
            OutlinedButton.icon(
              onPressed: _saving
                  ? null
                  : () async {
                      final picked = await pickUploads(context);
                      if (picked.isNotEmpty) setState(() => _files.addAll(picked));
                    },
              icon: const Icon(Icons.add_a_photo_outlined),
              label: const Text('Add photo, screenshot or PDF'),
            ),
            PendingUploads(files: _files, onRemove: (i) => setState(() => _files.removeAt(i))),
            const SizedBox(height: 16),
          ],
          if (isFinance) ...[
            Row(children: [
              Expanded(child: _field('amount', 'Amount', keyboard: const TextInputType.numberWithOptions(decimal: true))),
              const SizedBox(width: 8),
              SizedBox(width: 90, child: _field('currency', 'Currency')),
            ]),
            _suggestField('counterparty', _counterpartyLabel[_type]!),
          ],
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'Date', border: OutlineInputBorder()),
              child: InkWell(
                onTap: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: _date.toLocal(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (d != null) setState(() => _date = DateTime.utc(d.year, d.month, d.day));
                },
                child: Text(formatDate(_date)),
              ),
            ),
          ),
          _field('title', 'Title', hint: _defaultTitle()),
          if (_type == 'link') _field('url', 'URL', keyboard: TextInputType.url),
          _suggestField('category', 'Category', hint: 'HOA, Utilities, Travel…'),
          if (_type == 'payment' || _type == 'expense') _suggestField('property', 'Property', hint: 'e.g. Oak Grove'),
          if (_type != 'deposit') _suggestField('trip', 'Trip / project'),
          _suggestField('organization', 'Organization', hint: 'India Club, Work…'),
          if (_type == 'payment' || _type == 'expense') _suggestField('method', 'Payment method', hint: 'ACH, Visa, Zelle…'),
          if (_type == 'payment') _field('confirmation', 'Confirmation #'),
          if (_type == 'document') ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: DropdownButtonFormField<String>(
                initialValue: _docKind,
                decoration: const InputDecoration(labelText: 'Kind of document', border: OutlineInputBorder()),
                items: [for (final e in docKindLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => setState(() => _docKind = v ?? 'other'),
              ),
            ),
            _dateField('Expires / renews on', _expiresAt, (d) => _expiresAt = d),
            _field('docReference', 'Reference', hint: 'Last 4 digits only'),
          ],
          if (_type == 'place') ...[
            _field('address', 'Address or area'),
            _field('mapUrl', 'Map link', keyboard: TextInputType.url),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Been there'),
              value: _visited,
              onChanged: (v) => setState(() => _visited = v),
            ),
          ],
          if (_type == 'idea') ...[
            _field('url', 'Link', keyboard: TextInputType.url),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: DropdownButtonFormField<String>(
                initialValue: _ideaStatus,
                decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'want', child: Text('Want / open')),
                  DropdownMenuItem(value: 'done', child: Text('Bought / done')),
                  DropdownMenuItem(value: 'dropped', child: Text('Dropped')),
                ],
                onChanged: (v) => setState(() => _ideaStatus = v ?? 'want'),
              ),
            ),
          ],
          if (_purchase.contains(_type)) ...[
            _dateField('Return by (optional)', _returnBy, (d) => _returnBy = d),
            _dateField('Warranty until (optional)', _warrantyUntil, (d) => _warrantyUntil = d),
          ],
          if (_type == 'deposit') ...[
            _field('checkNumber', 'Check #'),
            _field('bankAccount', 'Deposited to', hint: 'e.g. Chase checking'),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Cleared in my account'),
              value: _cleared,
              onChanged: (v) => setState(() => _cleared = v),
            ),
          ],
          if (_type == 'expense') ...[
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Someone owes me for this'),
              subtitle: const Text('Track as reimbursable'),
              value: _reimbursable,
              onChanged: (v) => setState(() => _reimbursable = v),
            ),
            if (_reimbursable) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  'Reimbursed by: ${_blank('organization') ?? 'set Organization above'}',
                  style: TextStyle(color: Theme.of(context).colorScheme.outline),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: DropdownButtonFormField<String>(
                  initialValue: _status,
                  decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),
                  items: [for (final e in statusLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                  onChanged: (v) => setState(() => _status = v ?? 'to_submit'),
                ),
              ),
              _field('owedAmount', 'Amount owed to me', hint: 'Blank = full amount', keyboard: const TextInputType.numberWithOptions(decimal: true)),
              if (_status == 'partial' || _status == 'reimbursed')
                _field('reimbursedAmount', 'Amount reimbursed', keyboard: const TextInputType.numberWithOptions(decimal: true)),
            ],
          ],
          if (api.isFamily && _purchase.contains(_type))
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: DropdownButtonFormField<String>(
                initialValue: _paidBy ?? api.myId,
                decoration: const InputDecoration(labelText: 'Paid by', border: OutlineInputBorder()),
                items: [
                  for (final m in api.members)
                    DropdownMenuItem(value: m['userId'] as String, child: Text('${m['name']}${m['userId'] == api.myId ? ' (me)' : ''}')),
                ],
                onChanged: (v) => setState(() => _paidBy = v),
              ),
            ),
          if (api.isFamily)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Only me'),
              subtitle: Text('Hide this from others in ${api.workspace?['name']}'),
              value: _private,
              onChanged: (v) => setState(() => _private = v),
            ),
          _field('tags', 'Tags', hint: 'Comma separated'),
          _field('notes', 'Notes', maxLines: 4),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(children: [
            if (isNew)
              Expanded(
                child: OutlinedButton(onPressed: _saving ? null : () => _save(toInbox: true), child: const Text('Save to inbox')),
              ),
            if (isNew) const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(isNew ? 'Save' : 'Save changes'),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
