import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../providers/auth_provider.dart';
import 'forgot_password_screen.dart';
import 'inquiry_screen.dart';
import 'signup_screen.dart';

/// Development-only shortcut (sample data). Shown only in debug builds.
const _devPassword = 'Tenant@123';
const _devAccounts = [
  ('Maria Santos', 'maria@example.com', 'Room 101 · waiting for verification'),
  ('Juan Dela Cruz', 'juan@example.com', 'Room 101 · all paid'),
  ('Jose Ramos', 'jose@example.com', 'Room 101 · overdue bills'),
  ('Ana Reyes', 'ana@example.com', 'Room 102 · waiting for verification'),
  ('Carlo Mendoza', 'carlo@example.com', 'Room 102 · unpaid'),
  ('Liza Gomez', 'liza@example.com', 'Room 201 · unpaid'),
  ('Mark Villanueva', 'mark@example.com', 'Room 201 · partially paid'),
  ('Paolo Cruz', 'paolo@example.com', 'Room 202 · unpaid'),
  ('Grace Tan', 'grace@example.com', 'Room 301 · unpaid'),
];

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;
  String? _logoUrl;
  String? _houseName;

  @override
  void initState() {
    super.initState();
    // The owner's logo and boarding house name (public; shown before signing in).
    context.read<ApiClient>().get('/public/branding').then((b) {
      if (mounted) setState(() => (_logoUrl = b['logoUrl'] as String?, _houseName = b['houseName'] as String?));
    }).catchError((_) {});
    context.read<AuthProvider>().lastEmail().then((e) {
      if (mounted && e != null && _email.text.isEmpty) setState(() => _email.text = e);
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthProvider>().login(_email.text.trim(), _password.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final notice = context.watch<AuthProvider>().notice;
    final message = _error ?? notice;
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    // Brand panel: the owner's logo and boarding house name.
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(24),
                        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.primary, AppColors.navy, AppColors.navyDeep]),
                        boxShadow: const [BoxShadow(color: Color(0x4014224A), blurRadius: 24, spreadRadius: -8, offset: Offset(0, 12))],
                      ),
                      child: Row(children: [
                        HouseLogo(logoUrl: _logoUrl, size: 60),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(_houseName ?? 'Boarding House', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                            const SizedBox(height: 2),
                            const Text('Tenant app', style: TextStyle(color: Colors.white70, fontSize: 14)),
                          ]),
                        ),
                      ]),
                    ),
                    const SizedBox(height: 20),
                    Text('Welcome back', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const SizedBox(height: 6),
                    const Text('Sign in to see your room, bills and payments.', style: TextStyle(color: AppColors.muted, fontSize: 16)),
                    const SizedBox(height: 28),
                    if (message != null)
                      Container(
                        margin: const EdgeInsets.only(bottom: 16),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
                        child: Row(children: [
                          const Icon(Icons.info_outline, color: AppColors.danger),
                          const SizedBox(width: 10),
                          Expanded(child: Text(message, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w500))),
                        ]),
                      ),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
                      validator: (v) => v == null || !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v.trim()) ? 'Please enter your email' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscure,
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) => v == null || v.isEmpty ? 'Please enter your password' : null,
                    ),
                    Align(
                      alignment: Alignment.center,
                      child: TextButton(
                        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ForgotPasswordScreen(initialEmail: _email.text.trim()))),
                        child: const Text('Forgot password?'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.navy)) : const Text('Sign In'),
                    ),
                    if (kDebugMode) ...[const SizedBox(height: 24), _DevAccounts(selected: _email.text, onPick: (e) => setState(() {
                          _email.text = e;
                          _password.text = _devPassword;
                          _error = null;
                        }))],
                    const SizedBox(height: 20),
                    Row(children: [
                      const Expanded(child: Divider()),
                      Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('New here?', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600))),
                      const Expanded(child: Divider()),
                    ]),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SignupScreen())),
                      icon: const Icon(Icons.person_add_alt_1_outlined),
                      label: const Text('Create an account'),
                    ),
                    const SizedBox(height: 8),
                    const Text('For tenants who already live here. The owner approves new accounts.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.muted, fontSize: 13)),
                    const SizedBox(height: 20),
                    // Not a tenant yet (e.g. a student looking for a room).
                    Material(
                      color: AppColors.navySoft,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: const BorderSide(color: AppColors.border)),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(24),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InquiryScreen())),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                              child: const Icon(Icons.search_rounded, color: Colors.white),
                            ),
                            const SizedBox(width: 14),
                            const Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('Looking for a room?', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink)),
                                SizedBox(height: 2),
                                Text('Students and new boarders: ask the owner. No account needed.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
                              ]),
                            ),
                            const Icon(Icons.arrow_outward_rounded, color: AppColors.ink),
                          ]),
                        ),
                      ),
                    ),
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

class _DevAccounts extends StatelessWidget {
  const _DevAccounts({required this.selected, required this.onPick});
  final String selected;
  final ValueChanged<String> onPick;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFF221A07), borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFF5C4410))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('DEVELOPMENT ACCOUNTS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.warning)),
        const Text('Tap an account, then press Sign In. Password: $_devPassword', style: TextStyle(fontSize: 12.5, color: AppColors.warning)),
        const SizedBox(height: 6),
        for (final (name, email, note) in _devAccounts)
          ListTile(
            dense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 8),
            selected: selected == email,
            selectedTileColor: AppColors.navySoft,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            leading: Icon(selected == email ? Icons.radio_button_checked : Icons.person_outline, size: 22),
            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('$email · $note'),
            onTap: () => onPick(email),
          ),
      ]),
    );
  }
}
