import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'format.dart';
import 'models.dart';

const typeIcons = {
  'note': Icons.sticky_note_2_outlined,
  'link': Icons.link,
  'payment': Icons.account_balance_wallet_outlined,
  'expense': Icons.receipt_long_outlined,
  'deposit': Icons.account_balance_outlined,
};

/// Loads data with a Future, shows spinner / error / content, supports pull-to-refresh.
class AsyncView<T> extends StatefulWidget {
  const AsyncView({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;

  @override
  State<AsyncView<T>> createState() => AsyncViewState<T>();
}

class AsyncViewState<T> extends State<AsyncView<T>> {
  late Future<T> _future = widget.load();

  Future<void> reload() async {
    final f = widget.load();
    setState(() => _future = f);
    await f.catchError((_) => null as T);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done && !snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('${snap.error}', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: reload, child: const Text('Try again')),
              ]),
            ),
          );
        }
        return RefreshIndicator(onRefresh: reload, child: widget.builder(context, snap.data as T, reload));
      },
    );
  }
}

class CaptureTile extends StatelessWidget {
  const CaptureTile({super.key, required this.capture, this.onReturn});
  final Capture capture;
  final VoidCallback? onReturn;

  @override
  Widget build(BuildContext context) {
    final c = capture;
    final scheme = Theme.of(context).colorScheme;
    final meta = [formatDate(c.date), c.counterparty, c.organization, c.property, c.trip].whereType<String>().where((s) => s.isNotEmpty).join(' · ');
    final chips = <Widget>[
      if (!c.filed) _Chip('Inbox', scheme.tertiaryContainer, scheme.onTertiaryContainer),
      if (c.reimbursable && c.reimbursement != null)
        _Chip(statusLabels[c.reimbursement!.status] ?? '', scheme.secondaryContainer, scheme.onSecondaryContainer),
      if (c.type == 'deposit')
        _Chip(c.cleared ? 'Cleared' : 'Not cleared', scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    ];
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: scheme.surfaceContainerHighest,
        child: Icon(typeIcons[c.type], color: scheme.onSurfaceVariant, size: 20),
      ),
      title: Row(children: [
        Flexible(child: Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis)),
        if (c.attachmentCount > 0) ...[const SizedBox(width: 4), Icon(Icons.attach_file, size: 14, color: scheme.outline)],
      ]),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis),
        if (chips.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Wrap(spacing: 6, children: chips)),
      ]),
      trailing: c.amountMinor == null
          ? null
          : Text(formatMoney(c.amountMinor, c.currency), style: const TextStyle(fontWeight: FontWeight.w600)),
      onTap: () async {
        await context.push('/captures/${c.id}');
        onReturn?.call();
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.bg, this.fg);
  final String label;
  final Color bg;
  final Color fg;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
        child: Text(label, style: TextStyle(fontSize: 11, color: fg, fontWeight: FontWeight.w500)),
      );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action});
  final String title;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 8, 4),
        child: Row(children: [
          Expanded(
            child: Text(title.toUpperCase(),
                style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Theme.of(context).colorScheme.outline, letterSpacing: 0.8)),
          ),
          ?action,
        ]),
      );
}

class EmptyNote extends StatelessWidget {
  const EmptyNote(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Text(text, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
      );
}

void showError(BuildContext context, Object e) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
}

/// Bottom sheet offering camera / photo library / files; returns picked uploads.
Future<List<PickedUpload>> pickUploads(BuildContext context) async {
  final choice = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('Take photo'), onTap: () => Navigator.pop(ctx, 'camera')),
        ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Photos & screenshots'), onTap: () => Navigator.pop(ctx, 'gallery')),
        ListTile(leading: const Icon(Icons.picture_as_pdf_outlined), title: const Text('PDF or file'), onTap: () => Navigator.pop(ctx, 'file')),
      ]),
    ),
  );
  if (choice == null) return const [];
  final picker = ImagePicker();
  // Downscale large photos on-device; receipts stay legible at 2400px.
  if (choice == 'camera') {
    final x = await picker.pickImage(source: ImageSource.camera, maxWidth: 2400, maxHeight: 2400, imageQuality: 85);
    return x == null ? const [] : [PickedUpload(x.name, await x.readAsBytes())];
  }
  if (choice == 'gallery') {
    final xs = await picker.pickMultiImage(maxWidth: 2400, maxHeight: 2400, imageQuality: 85);
    return [for (final x in xs) PickedUpload(x.name, await x.readAsBytes())];
  }
  final files = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
  );
  return [for (final f in files) PickedUpload(f.name, await f.xFile.readAsBytes())];
}

class PendingUploads extends StatelessWidget {
  const PendingUploads({super.key, required this.files, required this.onRemove});
  final List<PickedUpload> files;
  final void Function(int) onRemove;
  @override
  Widget build(BuildContext context) => Column(children: [
        for (var i = 0; i < files.length; i++)
          ListTile(
            dense: true,
            leading: Icon(files[i].name.toLowerCase().endsWith('.pdf') ? Icons.picture_as_pdf_outlined : Icons.image_outlined),
            title: Text(files[i].name, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${(files[i].bytes.length / 1024).round()} KB'),
            trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => onRemove(i)),
          ),
      ]);
}

/// Text field with suggestions from values used before (payees, properties…).
class SuggestField extends StatefulWidget {
  const SuggestField({super.key, required this.controller, required this.label, required this.options, this.hint});
  final TextEditingController controller;
  final String label;
  final String? hint;
  final List<String> options;

  @override
  State<SuggestField> createState() => _SuggestFieldState();
}

class _SuggestFieldState extends State<SuggestField> {
  final _focus = FocusNode();

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final options = widget.options;
    final label = widget.label;
    final hint = widget.hint;
    return RawAutocomplete<String>(
      textEditingController: widget.controller,
      focusNode: _focus,
      optionsBuilder: (v) {
        final q = v.text.toLowerCase();
        if (q.isEmpty) return const Iterable.empty();
        return options.where((o) => o.toLowerCase().contains(q) && o.toLowerCase() != q).take(6);
      },
      fieldViewBuilder: (context, ctrl, focus, onSubmit) => TextField(
        controller: ctrl,
        focusNode: focus,
        textCapitalization: TextCapitalization.words,
        decoration: InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder()),
      ),
      optionsViewBuilder: (context, onSelected, opts) => Align(
        alignment: Alignment.topLeft,
        child: Material(
          elevation: 4,
          borderRadius: BorderRadius.circular(8),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240, maxWidth: 360),
            child: ListView(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              children: [for (final o in opts) ListTile(dense: true, title: Text(o), onTap: () => onSelected(o))],
            ),
          ),
        ),
      ),
    );
  }
}
