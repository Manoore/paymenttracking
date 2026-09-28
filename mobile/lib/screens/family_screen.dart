import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../widgets.dart';

const _roleLabels = {'owner': 'Owner', 'editor': 'Can add & edit', 'viewer': 'View only'};

/// Shared family space: create it, invite a spouse, manage members, or join by link.
class FamilyScreen extends StatefulWidget {
  const FamilyScreen({super.key});
  @override
  State<FamilyScreen> createState() => _FamilyScreenState();
}

class _FamilyScreenState extends State<FamilyScreen> {
  final _name = TextEditingController(text: 'Our home');
  final _joinLink = TextEditingController();
  String _inviteRole = 'editor';
  String? _inviteUrl;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _joinLink.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _create(Api api) => _run(() async {
        final ws = await api.post('/workspaces', {'name': _name.text.trim()}) as Map<String, dynamic>;
        await api.refreshContext();
        await api.switchWorkspace(ws['id'] as String);
      });

  Future<void> _invite(Api api) => _run(() async {
        final r = await api.post('/workspaces/current/invites', {'role': _inviteRole}) as Map<String, dynamic>;
        setState(() => _inviteUrl = r['url'] as String);
      });

  Future<void> _confirm(String title, Future<void> Function() action) async {
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
    if (ok == true) await _run(action);
  }

  @override
  Widget build(BuildContext context) {
    final api = context.watch<Api>();
    final ws = api.workspace;
    final isOwner = ws?['role'] == 'owner';
    final familySpaces = api.workspaces.where((w) => w['kind'] == 'family').toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Family & sharing')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
        children: [
          if (!api.isFamily) ...[
            if (familySpaces.isNotEmpty) ...[
              const SectionTitle('Your shared spaces'),
              for (final w in familySpaces)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.family_restroom),
                    title: Text(w['name'] as String),
                    trailing: const Text('Switch'),
                    onTap: () => _run(() => api.switchWorkspace(w['id'] as String)),
                  ),
                ),
            ],
            const SectionTitle('Share bills with your family'),
            const Text(
              'A shared space shows everyone the same recurring bills, who paid what this month, and who is about to pay, '
              'so nobody pays the same bill twice. Your personal space stays private.',
            ),
            const SizedBox(height: 12),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name of the shared space', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _busy ? null : () => _create(api),
              icon: const Icon(Icons.group_add_outlined),
              label: const Text('Create family space'),
            ),
            const SectionTitle('Got an invite link?'),
            TextField(
              controller: _joinLink,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Paste the invite link', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _busy || _joinLink.text.trim().isEmpty ? null : () => _run(() => api.acceptInvite(_joinLink.text)),
              child: const Text('Join'),
            ),
          ],
          if (api.isFamily) ...[
            SectionTitle('Members of ${ws?['name']}'),
            for (final m in api.members)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(child: Text((m['name'] as String).substring(0, 1).toUpperCase())),
                title: Text('${m['name']}${m['userId'] == api.myId ? ' (you)' : ''}'),
                subtitle: Text(m['email'] as String? ?? ''),
                trailing: isOwner && m['role'] != 'owner'
                    ? PopupMenuButton<String>(
                        onSelected: (v) {
                          if (v == 'remove') {
                            _confirm('Remove ${m['name']}?', () async {
                              await api.delete('/workspaces/current/members/${m['userId']}');
                              await api.refreshContext();
                            });
                          } else {
                            _run(() async {
                              await api.patch('/workspaces/current/members/${m['userId']}', {'role': v});
                              await api.refreshContext();
                            });
                          }
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: 'editor', child: Text('Can add & edit')),
                          PopupMenuItem(value: 'viewer', child: Text('View only')),
                          PopupMenuItem(value: 'remove', child: Text('Remove')),
                        ],
                        child: Chip(label: Text(_roleLabels[m['role']] ?? '')),
                      )
                    : Chip(label: Text(_roleLabels[m['role']] ?? '')),
              ),
            if (isOwner) ...[
              const SectionTitle('Invite someone'),
              const Text('A one-time link for your spouse or family member. Works for 7 days, for one person.'),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _inviteRole,
                decoration: const InputDecoration(labelText: 'They can', border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'editor', child: Text('Add & edit')),
                  DropdownMenuItem(value: 'viewer', child: Text('View only')),
                ],
                onChanged: (v) => setState(() => _inviteRole = v ?? 'editor'),
              ),
              const SizedBox(height: 12),
              FilledButton(onPressed: _busy ? null : () => _invite(api), child: const Text('Create invite link')),
              if (_inviteUrl != null) ...[
                const SizedBox(height: 12),
                SelectableText(_inviteUrl!, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                TextButton.icon(
                  icon: const Icon(Icons.copy),
                  label: const Text('Copy link'),
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: _inviteUrl!));
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied. Send it by text or WhatsApp.')));
                    }
                  },
                ),
              ],
            ],
            const SectionTitle('How sharing works'),
            const Text('• Everything added while this space is selected is visible to all members, unless you choose “Only me”.\n'
                '• Each payment shows who paid it. Tap “I’m paying this” on a bill so others know.\n'
                '• Household shows this month’s bills and how much each of you paid.\n'
                '• Switch spaces from the Home screen. Your personal space is never shared.'),
            if (!isOwner) ...[
              const SizedBox(height: 20),
              OutlinedButton.icon(
                icon: const Icon(Icons.logout),
                label: Text('Leave ${ws?['name']}'),
                onPressed: () => _confirm('Leave ${ws?['name']}?', () async {
                  await api.delete('/workspaces/current/members/me');
                  await api.switchWorkspace(null);
                }),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
