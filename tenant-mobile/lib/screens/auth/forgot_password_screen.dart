import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

/// Sends a password reset link to the tenant's email (handled by Firebase).
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});
  final String initialEmail;
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  late final _email = TextEditingController(text: widget.initialEmail);
  bool _sent = false;
  bool _loading = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await context.read<AuthProvider>().sendPasswordReset(_email.text.trim());
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot Password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: _sent
              ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Icon(Icons.mark_email_read_outlined, size: 64, color: AppColors.success),
                  const SizedBox(height: 16),
                  const Text('Check your email', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text('If an account exists for ${_email.text.trim()}, we sent a link to choose a new password. Open it, then come back and sign in.', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 15)),
                  const SizedBox(height: 24),
                  FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back to Sign In')),
                ])
              : Form(
                  key: _form,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Text('Enter your account email and we will send you a link to choose a new password.', style: TextStyle(color: AppColors.muted, fontSize: 15)),
                    const SizedBox(height: 20),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (v) => v == null || !v.contains('@') ? 'Please enter your email' : null,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Send Reset Link'),
                    ),
                  ]),
                ),
        ),
      ),
    );
  }
}
