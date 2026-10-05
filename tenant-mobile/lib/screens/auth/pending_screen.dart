import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

/// Shown instead of the dashboard while the owner hasn't approved the account
/// (or decided not to). No room, bill or payment data is loaded here.
class PendingApprovalScreen extends StatefulWidget {
  const PendingApprovalScreen({super.key});
  @override
  State<PendingApprovalScreen> createState() => _PendingApprovalScreenState();
}

class _PendingApprovalScreenState extends State<PendingApprovalScreen> {
  bool _checking = false;

  Future<void> _check() async {
    setState(() => _checking = true);
    try {
      final approved = await context.read<AuthProvider>().checkApproval();
      if (!approved && mounted) showSnack(context, 'Not approved yet. Please check again later.');
    } catch (e) {
      if (mounted) showSnack(context, ApiException.from(e).message, error: true);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _contact(String phone) async {
    final ok = await launchUrl(Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'[^\d+]'), ''))).catchError((_) => false);
    if (!ok && mounted) showSnack(context, 'Call the boarding house at $phone.');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final a = auth.account ?? const {};
    final rejected = auth.status == AuthStatus.rejected;
    final house = (a['house'] as Map?)?.cast<String, dynamic>();
    final phone = house?['phone'] as String?;
    final registered = DateTime.tryParse('${a['registeredAt'] ?? ''}');
    final reason = a['rejectionReason'] as String?;

    final (chipBg, chipDot, chipText, chipLabel) = rejected
        ? (const Color(0xFF1F2937), const Color(0xFF9CA3AF), const Color(0xFFE5E7EB), 'Not Approved')
        : (const Color(0xFF3A2A08), const Color(0xFFFCD34D), const Color(0xFFFDE68A), 'Waiting for Approval');

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Center(child: HouseLogo(size: 64)),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(28), boxShadow: kCardShadow, border: Border.all(color: AppColors.border)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Semantics(
                      header: true,
                      child: Text(rejected ? 'Account Not Approved' : 'Account Pending Approval', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w800)),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      rejected
                          ? 'Your account is currently not approved.'
                          : 'Your account has been created successfully, but the boarding-house owner still needs to approve your account.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.muted, fontSize: 15, height: 1.45),
                    ),
                    const SizedBox(height: 16),
                    // Status: a colored dot AND words.
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                        decoration: BoxDecoration(color: chipBg, borderRadius: BorderRadius.circular(999)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Container(width: 10, height: 10, decoration: BoxDecoration(color: chipDot, shape: BoxShape.circle)),
                          const SizedBox(width: 8),
                          Text(chipLabel, style: TextStyle(color: chipText, fontWeight: FontWeight.w700)),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 18),
                    _Info(label: 'Your Name', value: (a['name'] ?? auth.pendingName ?? '') as String),
                    _Info(label: 'Email', value: (a['email'] ?? '') as String),
                    if (registered != null) _Info(label: 'Registration Date', value: formatLongDate(registered)),
                    if (rejected && reason != null && reason.isNotEmpty) _Info(label: 'Reason', value: reason),
                    const SizedBox(height: 8),
                    Text(
                      rejected
                          ? 'If you think this is a mistake, please contact the boarding house.'
                          : 'You will be able to access your room, bills, payments, and notifications once your account is approved.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.muted, fontSize: 14, height: 1.45),
                    ),
                    const SizedBox(height: 20),
                    if (!rejected)
                      FilledButton.icon(
                        onPressed: _checking ? null : _check,
                        icon: _checking ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: AppColors.navy)) : const Icon(Icons.refresh),
                        label: const Text('Refresh Status'),
                      ),
                    if (phone != null && phone.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      OutlinedButton.icon(onPressed: () => _contact(phone), icon: const Icon(Icons.call_outlined), label: const Text('Contact Boarding House')),
                    ],
                  ]),
                ),
                const SizedBox(height: 16),
                TextButton(onPressed: () => context.read<AuthProvider>().logout(), child: const Text('Sign out')),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    if (value.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: AppColors.field, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 130, child: Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 13.5))),
        Expanded(child: Text(value, style: const TextStyle(color: AppColors.ink, fontSize: 15, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}
