import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';
import 'password_rules.dart';

/// New tenants create their own account. It stays "waiting for approval" until the owner
/// approves it in the admin portal; only then can they see their room, bills and payments.
class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});
  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _room = TextEditingController();
  DateTime? _moveIn;
  // Optional details (help the owner recognise the tenant).
  final _school = TextEditingController();
  final _address = TextEditingController();
  final _ecName = TextEditingController();
  final _ecRelation = TextEditingController();
  final _ecPhone = TextEditingController();
  DateTime? _birthday;
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _room, _password, _confirm, _school, _address, _ecName, _ecRelation, _ecPhone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthProvider>().register(
            name: _name.text.trim(),
            email: _email.text.trim(),
            phone: _phone.text.trim(),
            password: _password.text,
            requestedRoom: _room.text.trim(),
            requestedMoveIn: _moveIn,
            occupation: _school.text.trim(),
            address: _address.text.trim(),
            birthDate: _birthday,
            emergencyName: _ecName.text.trim(),
            emergencyRelationship: _ecRelation.text.trim(),
            emergencyPhone: _ecPhone.text.trim(),
          );
      // The app now shows the "waiting for approval" screen; close this one.
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    } catch (e) {
      if (mounted) setState(() => _error = ApiException.from(e).message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create an account')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      const HouseLogo(size: 52),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text('Join your boarding house', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: AppColors.ink)),
                      ),
                    ]),
                    const SizedBox(height: 10),
                    const Text(
                      'Choose your own password and fill in your details. The owner will review and approve your account, then you can see your room, bills and payments.',
                      style: TextStyle(color: AppColors.muted, fontSize: 15, height: 1.4),
                    ),
                    const SizedBox(height: 20),
                    if (_error != null)
                      Container(
                        margin: const EdgeInsets.only(bottom: 16),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
                        child: Row(children: [
                          const Icon(Icons.info_outline, color: AppColors.danger),
                          const SizedBox(width: 10),
                          Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w500))),
                        ]),
                      ),
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.name],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Full name', prefixIcon: Icon(Icons.person_outline)),
                      validator: (v) => (v ?? '').trim().length < 2 ? 'Please enter your full name' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline), helperText: 'You will sign in with this email'),
                      validator: (v) => v == null || !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v.trim()) ? 'Please enter a valid email' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Phone number', prefixIcon: Icon(Icons.phone_outlined), hintText: '09xx xxx xxxx'),
                      validator: (v) => !RegExp(r'^[0-9+()\-\s]{7,20}$').hasMatch((v ?? '').trim()) ? 'Please enter your phone number' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscure,
                      autofillHints: const [AutofillHints.newPassword],
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: passwordValidator,
                    ),
                    PasswordChecklist(controller: _password),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _confirm,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Confirm password', prefixIcon: Icon(Icons.lock_outline)),
                      validator: (v) => v != _password.text ? 'The passwords do not match' : null,
                    ),
                    const SizedBox(height: 8),
                    const Text('Only you know your password. The owner can never see it.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
                    const SizedBox(height: 24),
                    const _SectionLabel('About you (optional)'),
                    TextFormField(
                      controller: _school,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'School or workplace', prefixIcon: Icon(Icons.school_outlined)),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _address,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Home address', prefixIcon: Icon(Icons.home_outlined)),
                    ),
                    const SizedBox(height: 16),
                    InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () async {
                        final now = DateTime.now();
                        final picked = await showDatePicker(context: context, initialDate: _birthday ?? DateTime(now.year - 20), firstDate: DateTime(now.year - 100), lastDate: now);
                        if (picked != null) setState(() => _birthday = picked);
                      },
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: 'Birthday', prefixIcon: Icon(Icons.cake_outlined), suffixIcon: Icon(Icons.expand_more)),
                        child: Text(_birthday == null ? 'Tap to choose' : formatLongDate(_birthday), style: TextStyle(color: _birthday == null ? AppColors.muted : AppColors.ink, fontSize: 16)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _ecName,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Emergency contact name', prefixIcon: Icon(Icons.emergency_outlined)),
                    ),
                    const SizedBox(height: 16),
                    Row(children: [
                      Expanded(
                        child: TextFormField(
                          controller: _ecRelation,
                          textCapitalization: TextCapitalization.words,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Relationship', hintText: 'e.g. Parent'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          controller: _ecPhone,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Their phone'),
                          validator: (v) => (v ?? '').trim().isNotEmpty && !RegExp(r'^[0-9+()\-\s]{7,20}$').hasMatch(v!.trim()) ? 'Check the number' : null,
                        ),
                      ),
                    ]),
                    const SizedBox(height: 24),
                    const _SectionLabel('If you already live here (optional)'),
                    // Helps the owner confirm you really board here.
                    TextFormField(
                      controller: _room,
                      textInputAction: TextInputAction.done,
                      decoration: const InputDecoration(labelText: 'Your room number', prefixIcon: Icon(Icons.meeting_room_outlined), hintText: 'e.g. 101'),
                    ),
                    const SizedBox(height: 16),
                    InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () async {
                        final now = DateTime.now();
                        final picked = await showDatePicker(context: context, initialDate: _moveIn ?? now, firstDate: DateTime(now.year - 3), lastDate: DateTime(now.year + 1));
                        if (picked != null) setState(() => _moveIn = picked);
                      },
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: 'When you moved in', prefixIcon: Icon(Icons.event_outlined), suffixIcon: Icon(Icons.expand_more)),
                        child: Text(_moveIn == null ? 'Tap to choose' : formatLongDate(_moveIn), style: TextStyle(color: _moveIn == null ? AppColors.muted : AppColors.ink, fontSize: 16)),
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.navy)) : const Text('Create Account'),
                    ),
                    const SizedBox(height: 12),
                    TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('I already have an account')),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Semantics(header: true, child: Text(text, style: const TextStyle(color: AppColors.ink, fontSize: 15, fontWeight: FontWeight.w800))),
      );
}
