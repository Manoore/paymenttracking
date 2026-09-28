import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../format.dart';
import '../models.dart';
import '../widgets.dart';
import 'capture_form_screen.dart';

class CaptureDetailScreen extends StatefulWidget {
  const CaptureDetailScreen({super.key, required this.id});
  final String id;
  @override
  State<CaptureDetailScreen> createState() => _CaptureDetailScreenState();
}

class _CaptureDetailScreenState extends State<CaptureDetailScreen> {
  final _view = GlobalKey<AsyncViewState<Capture>>();
  bool _busy = false;

  Api get _api => context.read<Api>();

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      await _view.currentState?.reload();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(Capture c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Move to trash?'),
        content: Text(c.title),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _api.delete('/captures/${c.id}');
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AsyncView<Capture>(
      key: _view,
      load: () async => Capture.fromJson(await _api.get('/captures/${widget.id}') as Map<String, dynamic>),
      builder: (context, c, reload) {
        final r = c.reimbursement;
        const next = {'to_submit': 'submitted', 'submitted': 'reimbursed', 'partial': 'reimbursed'};
        final nextStatus = c.reimbursable && r != null ? next[r.status] : null;
        final details = <(String, String?)>[
          if (c.type == 'document') ...[
            ('Kind', docKindLabels[c.docKind]),
            ('Expires', formatDate(c.expiresAt)),
            ('Reference', c.docReference),
          ],
          if (c.type == 'place') ...[
            ('Address', c.address),
            ('Map', c.mapUrl),
            ('Visited', c.visited ? 'Yes${c.rating != null ? ' · ${'★' * c.rating!}' : ''}' : 'Not yet'),
          ],
          if (c.type == 'idea') ('Status', {'want': 'Want / open', 'done': 'Bought / done', 'dropped': 'Dropped'}[c.ideaStatus ?? 'want']),
          ('Date', formatDate(c.occurredAt)),
          if (_api.isFamily) ('Paid by', _api.nameOf(c.paidBy)),
          if (_api.isFamily && c.isPrivate) ('Visible to', 'Only you'),
          ('Return by', formatDate(c.returnBy)),
          ('Warranty until', formatDate(c.warrantyUntil)),
          (c.type == 'deposit' ? 'Payer' : c.type == 'expense' ? 'Merchant' : 'Paid to', c.counterparty),
          ('Category', c.category),
          ('Property', c.property),
          ('Trip / project', c.trip),
          ('Organization', c.organization),
          ('Method', c.method),
          ('Confirmation #', c.confirmationNumber),
          if (r != null) ...[
            ('Reimbursement', statusLabels[r.status]),
            ('Amount reimbursed', r.amountReimbursedMinor == null || r.amountReimbursedMinor == 0 ? null : formatMoney(r.amountReimbursedMinor, c.currency)),
          ],
          ('Check #', c.checkNumber),
          ('Deposited to', c.bankAccount),
          if (c.type == 'deposit') ('Cleared', c.cleared ? 'Yes' : 'Not yet'),
          ('Link', c.url),
          ('Tags', c.tags.isEmpty ? null : c.tags.map((t) => '#$t').join('  ')),
        ].where((d) => d.$2 != null && d.$2!.isNotEmpty).toList();

        return Scaffold(
          appBar: AppBar(
            title: Text(typeLabels[c.type] ?? ''),
            actions: [IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline), onPressed: () => _delete(c))],
          ),
          body: ListView(
            padding: const EdgeInsets.only(bottom: 40),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (!c.filed) const Chip(label: Text('Inbox')),
                  Text(c.title, style: Theme.of(context).textTheme.headlineSmall),
                  if (c.amountMinor != null)
                    Text(formatMoney(c.amountMinor, c.currency), style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    FilledButton.icon(
                      onPressed: _busy
                          ? null
                          : () async {
                              final changed = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(builder: (_) => CaptureFormScreen(capture: c)),
                              );
                              if (changed == true) reload();
                            },
                      icon: const Icon(Icons.edit_outlined),
                      label: Text(c.filed ? 'Edit' : 'File it'),
                    ),
                    if (nextStatus != null)
                      OutlinedButton.icon(
                        onPressed: _busy
                            ? null
                            : () => _run(() => _api.patch('/captures/${c.id}', {
                                  'expense': {
                                    'reimbursement': {
                                      'status': nextStatus,
                                      if (nextStatus == 'submitted') 'submittedAt': isoDate(todayUtc()),
                                      if (nextStatus == 'reimbursed') ...{
                                        'reimbursedAt': isoDate(todayUtc()),
                                        'amountReimbursedMinor': c.amountMinor ?? 0,
                                      },
                                    },
                                  },
                                })),
                        icon: const Icon(Icons.check_circle_outline),
                        label: Text('Mark ${statusLabels[nextStatus]!.toLowerCase()}'),
                      ),
                    if (c.type == 'deposit' && !c.cleared)
                      OutlinedButton.icon(
                        onPressed: _busy
                            ? null
                            : () => _run(() => _api.patch('/captures/${c.id}', {
                                  'deposit': {'cleared': true},
                                })),
                        icon: const Icon(Icons.check_circle_outline),
                        label: const Text('Mark cleared'),
                      ),
                  ]),
                ]),
              ),
              SectionTitle('Proof & attachments',
                  action: TextButton.icon(
                    onPressed: _busy
                        ? null
                        : () async {
                            final picked = await pickUploads(context);
                            if (picked.isNotEmpty) await _run(() => _api.upload(picked, captureId: c.id));
                          },
                    icon: const Icon(Icons.add),
                    label: const Text('Add'),
                  )),
              if (c.attachments.isEmpty) const EmptyNote('No attachments yet.'),
              if (c.attachments.isNotEmpty)
                SizedBox(
                  height: 180,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: c.attachments.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, i) => _AttachmentThumb(
                      attachment: c.attachments[i],
                      onDelete: () => _run(() => _api.delete('/attachments/${c.attachments[i].id}')),
                    ),
                  ),
                ),
              if (c.notes != null && c.notes!.isNotEmpty) ...[
                const SectionTitle('Notes'),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: SelectableText(c.notes!)),
              ],
              const SectionTitle('Details'),
              for (final d in details)
                ListTile(dense: true, title: Text(d.$1), subtitle: SelectableText(d.$2!, style: Theme.of(context).textTheme.bodyLarge)),
              if (c.scheduleId != null)
                ListTile(
                  leading: const Icon(Icons.repeat),
                  title: const Text('View recurring schedule'),
                  onTap: () => context.push('/recurring/${c.scheduleId}'),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _AttachmentThumb extends StatelessWidget {
  const _AttachmentThumb({required this.attachment, required this.onDelete});
  final Attachment attachment;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final url = context.read<Api>().fileUrl(attachment.url);
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: 150,
      child: Card(
        clipBehavior: Clip.antiAlias,
        margin: EdgeInsets.zero,
        child: Column(children: [
          Expanded(
            child: InkWell(
              onTap: attachment.isImage
                  ? () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => Scaffold(
                          backgroundColor: Colors.black,
                          appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white, title: Text(attachment.filename)),
                          body: InteractiveViewer(maxScale: 6, child: Center(child: Image.network(url))),
                        ),
                      ))
                  : null,
              child: attachment.isImage
                  ? Image.network(url, fit: BoxFit.cover, width: double.infinity,
                      errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined))
                  : Container(
                      color: scheme.surfaceContainerHighest,
                      alignment: Alignment.center,
                      child: const Icon(Icons.picture_as_pdf_outlined, size: 40),
                    ),
            ),
          ),
          Row(children: [
            const SizedBox(width: 8),
            Expanded(child: Text(attachment.filename, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12))),
            IconButton(
              iconSize: 18,
              visualDensity: VisualDensity.compact,
              tooltip: 'Remove',
              icon: const Icon(Icons.delete_outline),
              onPressed: onDelete,
            ),
          ]),
        ]),
      ),
    );
  }
}
