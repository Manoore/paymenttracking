import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets.dart';

const _currencies = ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', 'JPY'];

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _reminderEmail = TextEditingController();
  final _workspaceName = TextEditingController();
  bool _emailReminders = true;
  String _currency = 'USD';
  bool _isOwner = false;
  String _email = '';
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _reminderEmail, _workspaceName]) {
      c.dispose();
    }
    super.dispose();
  }

  void _apply(Map<String, dynamic> user) {
    final prefs = (user['preferences'] as Map?) ?? const {};
    final workspaces = ((user['workspaces'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final ws = workspaces.firstWhere((w) => w['id'] == user['defaultWorkspaceId'], orElse: () => workspaces.isEmpty ? {} : workspaces.first);
    _email = user['email'] as String? ?? '';
    _name.text = user['name'] as String? ?? '';
    _phone.text = user['phone'] as String? ?? '';
    _emailReminders = prefs['emailReminders'] as bool? ?? true;
    _reminderEmail.text = prefs['reminderEmail'] as String? ?? '';
    _workspaceName.text = ws['name'] as String? ?? '';
    _currency = ws['defaultCurrency'] as String? ?? 'USD';
    _isOwner = ws['role'] == 'owner';
  }

  Future<void> _load() async {
    try {
      final data = await context.read<Api>().get('/auth/me') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _apply(data['user'] as Map<String, dynamic>);
        _loading = false;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final data = await context.read<Api>().patch('/auth/me', {
        'name': _name.text.trim(),
        'phone': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
        'preferences': {
          'emailReminders': _emailReminders,
          'reminderEmail': _reminderEmail.text.trim().isEmpty ? null : _reminderEmail.text.trim(),
        },
        if (_isOwner) 'workspace': {'name': _workspaceName.text.trim(), 'defaultCurrency': _currency},
      }) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() => _apply(data['user'] as Map<String, dynamic>));
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile saved')));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changePassword() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _PasswordSheet(),
    );
    if (changed == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password changed. Other devices were signed out.')));
    }
  }

  InputDecoration _dec(String label, {String? hint, String? helper}) =>
      InputDecoration(labelText: label, hintText: hint, helperText: helper, border: const OutlineInputBorder());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
              children: [
                const SectionTitle('Document reading (AI)'),
                Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: const Icon(Icons.document_scanner_outlined),
                    title: const Text('Fill forms from photos and PDFs'),
                    subtitle: Text(context.watch<Api>().readerOn
                        ? 'On · ${context.watch<Api>().reader?['providerLabel']} · ${context.watch<Api>().reader?['model']}'
                        : 'Off · add an OpenAI, Claude or Gemini API key'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/reader'),
                  ),
                ),
                const SectionTitle('Family & sharing'),
                Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: const Icon(Icons.family_restroom),
                    title: const Text('Share bills with your family'),
                    subtitle: const Text('Shared space, invites, who paid what'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/family'),
                  ),
                ),
                const SectionTitle('Appearance'),
                ThemeModePicker(controller: context.read<ThemeController>()),
                const SizedBox(height: 12),
                AccentPicker(controller: context.read<ThemeController>()),
                const SectionTitle('Your info'),
                TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: _dec('Name')),
                const SizedBox(height: 12),
                InputDecorator(decoration: _dec('Email', helper: 'Your sign-in email'), child: Text(_email)),
                const SizedBox(height: 12),
                TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: _dec('Phone (optional)')),
                const SectionTitle('Reminders'),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Email me when bills are due or overdue'),
                  subtitle: const Text('In-app reminders always appear on Home'),
                  value: _emailReminders,
                  onChanged: (v) => setState(() => _emailReminders = v),
                ),
                if (_emailReminders)
                  TextField(
                    controller: _reminderEmail,
                    keyboardType: TextInputType.emailAddress,
                    decoration: _dec('Send reminders to', hint: _email, helper: 'Leave blank to use your sign-in email'),
                  ),
                const SectionTitle('Workspace'),
                TextField(controller: _workspaceName, enabled: _isOwner, decoration: _dec('Workspace name')),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _currency,
                  decoration: _dec('Default currency'),
                  items: [for (final c in {_currency, ..._currencies}) DropdownMenuItem(value: c, child: Text(c))],
                  onChanged: _isOwner ? (v) => setState(() => _currency = v ?? 'USD') : null,
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Save profile'),
                ),
                const SectionTitle('Security'),
                OutlinedButton.icon(onPressed: _changePassword, icon: const Icon(Icons.lock_outline), label: const Text('Change password')),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () => context.read<Api>().logout(),
                  icon: const Icon(Icons.logout),
                  label: const Text('Sign out'),
                ),
              ],
            ),
    );
  }
}

class _PasswordSheet extends StatefulWidget {
  const _PasswordSheet();
  @override
  State<_PasswordSheet> createState() => _PasswordSheetState();
}

class _PasswordSheetState extends State<_PasswordSheet> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_next.text != _confirm.text) return setState(() => _error = "New passwords don't match");
    if (_next.text.length < 10) return setState(() => _error = 'Use at least 10 characters');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<Api>().changePassword(_current.text, _next.text);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    InputDecoration dec(String l) => InputDecoration(labelText: l, border: const OutlineInputBorder());
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Change password', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 16),
        TextField(controller: _current, obscureText: true, decoration: dec('Current password')),
        const SizedBox(height: 12),
        TextField(controller: _next, obscureText: true, decoration: dec('New password (10+ characters)')),
        const SizedBox(height: 12),
        TextField(controller: _confirm, obscureText: true, decoration: dec('Confirm new password')),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Change password'),
        ),
      ]),
    );
  }
}
