import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../providers/branding_provider.dart';
import '../../widgets/common.dart';

/// For people who don't live here yet (e.g. students): ask the owner about a room.
/// No account needed; the owner gets the inquiry in the admin portal and contacts them.
class InquiryScreen extends StatefulWidget {
  const InquiryScreen({super.key});
  @override
  State<InquiryScreen> createState() => _InquiryScreenState();
}

class _InquiryScreenState extends State<InquiryScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _school = TextEditingController();
  final _moveIn = TextEditingController();
  final _message = TextEditingController();
  String _type = 'Bed space';
  bool _sending = false;
  bool _sent = false;
  String? _error;

  static const _types = ['Bed space', 'Whole room', 'Not sure yet'];

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _school, _moveIn, _message]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await context.read<ApiClient>().post('/public/inquiries', data: {
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
        if (_school.text.trim().isNotEmpty) 'school': _school.text.trim(),
        if (_moveIn.text.trim().isNotEmpty) 'moveIn': _moveIn.text.trim(),
        'roomType': _type,
        if (_message.text.trim().isNotEmpty) 'message': _message.text.trim(),
      });
      if (mounted) setState(() => _sent = true);
    } catch (e) {
      if (mounted) setState(() => _error = ApiException.from(e).message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final house = context.watch<BrandingProvider>().houseName;
    return Scaffold(
      appBar: AppBar(title: const Text('Looking for a room?')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: _sent ? _done(house) : _formView(house),
            ),
          ),
        ),
      ),
    );
  }

  Widget _done(String? house) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: 24),
        Center(
          child: Container(
            width: 84,
            height: 84,
            decoration: const BoxDecoration(color: Color(0xFF0A3D31), shape: BoxShape.circle),
            child: const Icon(Icons.check_rounded, color: Color(0xFF6EE7B7), size: 46),
          ),
        ),
        const SizedBox(height: 20),
        Text('Thank you, ${_name.text.trim().split(' ').first}!', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(
          'Your inquiry was sent${house == null ? '' : ' to $house'}. The owner will call or text you at ${_phone.text.trim()} soon.',
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.muted, fontSize: 15, height: 1.45),
        ),
        const SizedBox(height: 28),
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
      ]);

  Widget _formView(String? house) => Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const HouseLogo(size: 52),
            const SizedBox(width: 14),
            Expanded(child: Text(house ?? 'Ask about a room', style: Theme.of(context).textTheme.titleLarge)),
          ]),
          const SizedBox(height: 10),
          const Text('Tell us a little about you. The owner will contact you about available rooms. No account needed.', style: TextStyle(color: AppColors.muted, fontSize: 15, height: 1.4)),
          const SizedBox(height: 20),
          if (_error != null)
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)),
              child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            ),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Your name', prefixIcon: Icon(Icons.person_outline)),
            validator: (v) => (v ?? '').trim().length < 2 ? 'Please enter your name' : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Mobile number', prefixIcon: Icon(Icons.phone_outlined), hintText: '09xx xxx xxxx'),
            validator: (v) => !RegExp(r'^[0-9+()\-\s]{7,20}$').hasMatch((v ?? '').trim()) ? 'Please enter a valid mobile number' : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Email (optional)', prefixIcon: Icon(Icons.mail_outline)),
            validator: (v) => (v ?? '').trim().isNotEmpty && !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v!.trim()) ? 'Please enter a valid email' : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _school,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'School or workplace (optional)', prefixIcon: Icon(Icons.school_outlined)),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _moveIn,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'When do you want to move in? (optional)', prefixIcon: Icon(Icons.event_outlined), hintText: 'e.g. next month, June 2027'),
          ),
          const SizedBox(height: 16),
          const Text('What are you looking for?', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in _types) ChoiceChip(label: Text(t), selected: _type == t, onSelected: (_) => setState(() => _type = t)),
          ]),
          const SizedBox(height: 16),
          TextFormField(
            controller: _message,
            minLines: 3,
            maxLines: 5,
            maxLength: 1000,
            decoration: const InputDecoration(labelText: 'Message (optional)', alignLabelWithHint: true, hintText: 'Questions about price, curfew, Wi-Fi…'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _sending ? null : _submit,
            icon: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: AppColors.navy)) : const Icon(Icons.send_rounded),
            label: const Text('Send Inquiry'),
          ),
        ]),
      );
}
