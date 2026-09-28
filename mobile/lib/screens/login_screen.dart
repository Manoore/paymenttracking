import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _invite = TextEditingController();
  bool _register = false;
  bool _signupOpen = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    context.read<Api>().signupStatus().then((s) {
      if (!mounted) return;
      setState(() {
        _signupOpen = s == 'open';
        if (s == null) _error = "Can't reach the server.";
      });
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _invite.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = context.read<Api>();
    try {
      if (_register) {
        final invite = _invite.text.trim();
        await api.register(_name.text.trim(), _email.text.trim(), _password.text,
            inviteToken: invite.isEmpty ? null : Api.inviteTokenFrom(invite));
      } else {
        await api.login(_email.text.trim(), _password.text);
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: AutofillGroup(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('Capture Hub', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 4),
                  Text('Your private place for payment proof, expenses and everything worth keeping.',
                      style: TextStyle(color: Theme.of(context).colorScheme.outline)),
                  const SizedBox(height: 20),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: false, label: Text('Sign in')),
                      ButtonSegment(value: true, label: Text('Create account')),
                    ],
                    selected: {_register},
                    onSelectionChanged: (v) => setState(() {
                      _register = v.first;
                      _error = null;
                    }),
                  ),
                  const SizedBox(height: 20),
                  if (_register && !_signupOpen && _invite.text.trim().isEmpty) ...[
                    const Text('New sign-ups are closed. Sign in, or paste a family invite link below to join.'),
                    const SizedBox(height: 12),
                  ],
                  if (_register) ...[
                    TextField(
                      controller: _invite,
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Family invite link (optional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (_register) ...[
                    TextField(
                      controller: _name,
                      autofillHints: const [AutofillHints.name],
                      decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    autofillHints: [_register ? AutofillHints.newPassword : AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Password',
                      helperText: _register ? 'At least 10 characters' : null,
                      border: const OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _submit(),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy || (_register && !_signupOpen && _invite.text.trim().isEmpty) ? null : _submit,
                    child: _busy
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(_register ? 'Create account' : 'Sign in'),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
