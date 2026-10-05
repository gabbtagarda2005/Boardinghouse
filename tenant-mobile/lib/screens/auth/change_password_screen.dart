import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';
import 'password_rules.dart';

/// Change password. When [forced] (first sign-in with a temporary password) the
/// tenant must set a new password before using the app.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, this.forced = false});
  final bool forced;
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await context.read<AuthProvider>().changePassword(_current.text, _next.text);
      if (!mounted) return;
      showSnack(context, 'Your password was changed.');
      if (!widget.forced) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.forced ? 'Set a new password' : 'Change password'),
        automaticallyImplyLeading: !widget.forced,
        actions: [
          if (widget.forced) TextButton(onPressed: () => context.read<AuthProvider>().logout(), child: const Text('Sign out')),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _form,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (widget.forced)
                const Padding(
                  padding: EdgeInsets.only(bottom: 20),
                  child: Text('You signed in with a temporary password. Please choose your own password to continue.', style: TextStyle(color: AppColors.muted, fontSize: 15)),
                ),
              TextFormField(
                controller: _current,
                obscureText: true,
                decoration: InputDecoration(labelText: widget.forced ? 'Temporary password' : 'Current password'),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(controller: _next, obscureText: true, decoration: const InputDecoration(labelText: 'New password', helperText: passwordHint), validator: passwordValidator),
              const SizedBox(height: 16),
              TextFormField(
                controller: _confirm,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Confirm new password'),
                validator: (v) => v != _next.text ? 'Passwords do not match' : null,
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Save Password'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
