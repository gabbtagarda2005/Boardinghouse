import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/branding_provider.dart';
import '../widgets/common.dart';
import '../widgets/profile_photo.dart';
import 'announcements_screen.dart';
import 'auth/change_password_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _photo = GlobalKey<ProfilePhotoState>();
  /// Set right after the tenant adds or removes a photo (until the profile reloads).
  bool? _hasPhoto;

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: const BrandTitle('Profile'), actions: const [NotificationBell()]),
      body: AsyncLoader<Map<String, dynamic>>(
        reloadOnNotifications: false,
        load: () => api.get('/me/profile'),
        builder: (context, d, reload) {
          final user = (d['user'] as Map).cast<String, dynamic>();
          final profile = (d['profile'] as Map).cast<String, dynamic>();
          final ec = (profile['emergencyContact'] as Map?)?.cast<String, dynamic>() ?? {};
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.primary, AppColors.navy, AppColors.navyDeep]),
                  boxShadow: const [BoxShadow(color: Color(0x3314224A), blurRadius: 20, spreadRadius: -8, offset: Offset(0, 10))],
                ),
                child: Row(children: [
                  ProfilePhoto(key: _photo, name: user['name'] as String? ?? '', photoUrl: user['photoUrl'] as String?, onChanged: reload, onPhoto: (v) => setState(() => _hasPhoto = v), radius: 32),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(user['name'] as String? ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
                      Text(user['email'] as String? ?? '', style: const TextStyle(color: Colors.white70)),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
                        child: Text('Tenant ID ${profile['tenantCode'] ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
                      ),
                      const SizedBox(height: 10),
                      // A clear button for the photo (the camera badge on the picture does the same).
                      OutlinedButton.icon(
                        onPressed: () => _photo.currentState?.openMenu(),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white54),
                          minimumSize: const Size(0, 40),
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          shape: const StadiumBorder(),
                          visualDensity: VisualDensity.compact,
                        ),
                        icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                        label: Text((_hasPhoto ?? user['photoUrl'] != null) ? 'Change Photo' : 'Add Photo'),
                      ),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 12),
              Consumer<BrandingProvider>(
                builder: (context, b, _) => Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    leading: const HouseLogo(size: 44),
                    title: const Text('Your boarding house', style: TextStyle(fontSize: 13, color: AppColors.muted)),
                    subtitle: Text(b.houseName ?? '—', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink)),
                  ),
                ),
              ),
              const SectionTitle('Personal information'),
              Card(
                child: Column(children: [
                  _info(Icons.phone_outlined, 'Contact number', user['phone'] as String?),
                  _info(Icons.home_outlined, 'Home address', profile['address'] as String?),
                  _info(Icons.school_outlined, 'School / workplace', profile['occupation'] as String?),
                  _info(Icons.emergency_outlined, 'Emergency contact',
                      ec['name'] == null ? null : '${ec['name']}${ec['relationship'] != null ? ' (${ec['relationship']})' : ''}${ec['phone'] != null ? '\n${ec['phone']}' : ''}'),
                  _info(Icons.event_outlined, 'Move-in date', formatLongDate(parseDate(profile['moveInDate']))),
                ]),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Edit contact details'),
                onPressed: () async {
                  final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => EditProfileScreen(user: user, profile: profile)));
                  if (saved == true) reload();
                },
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(4, 8, 4, 0),
                child: Text('To change your name or email, please contact the boarding house owner.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
              ),
              const SectionTitle('More'),
              Card(
                child: Column(children: [
                  ListTile(
                    leading: const Icon(Icons.campaign_outlined),
                    title: const Text('Announcements'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AnnouncementsScreen())),
                  ),
                  ListTile(
                    leading: const Icon(Icons.lock_outline),
                    title: const Text('Change password'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ChangePasswordScreen())),
                  ),
                  ListTile(
                    leading: const Icon(Icons.logout, color: AppColors.danger),
                    title: const Text('Sign out', style: TextStyle(color: AppColors.danger)),
                    onTap: () async {
                      final ok = await showConfirmationDialog(context, title: 'Sign out?', message: 'You will need your email and password to sign in again.', confirmLabel: 'Sign Out');
                      if (ok && context.mounted) await context.read<AuthProvider>().logout();
                    },
                  ),
                ]),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _info(IconData icon, String label, String? value) => ListTile(
        leading: Icon(icon, color: AppColors.primary),
        title: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
        subtitle: Text(value == null || value.isEmpty ? '—' : value, style: const TextStyle(fontSize: 15.5, color: AppColors.ink)),
      );
}

/// Tenants may edit contact details only.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key, required this.user, required this.profile});
  final Map<String, dynamic> user;
  final Map<String, dynamic> profile;
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _form = GlobalKey<FormState>();
  late final _phone = TextEditingController(text: widget.user['phone'] as String? ?? '');
  late final _address = TextEditingController(text: widget.profile['address'] as String? ?? '');
  late final _occupation = TextEditingController(text: widget.profile['occupation'] as String? ?? '');
  late final Map<String, dynamic> _ec = (widget.profile['emergencyContact'] as Map?)?.cast<String, dynamic>() ?? {};
  late final _ecName = TextEditingController(text: _ec['name'] as String? ?? '');
  late final _ecPhone = TextEditingController(text: _ec['phone'] as String? ?? '');
  late final _ecRel = TextEditingController(text: _ec['relationship'] as String? ?? '');
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_phone, _address, _occupation, _ecName, _ecPhone, _ecRel]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await context.read<ApiClient>().patch('/me/profile', data: {
        'phone': _phone.text.trim(),
        'address': _address.text.trim(),
        'occupation': _occupation.text.trim(),
        'emergencyContact': {'name': _ecName.text.trim(), 'phone': _ecPhone.text.trim(), 'relationship': _ecRel.text.trim()},
      });
      if (!mounted) return;
      context.read<AuthProvider>().updateUser({'phone': _phone.text.trim()});
      showSnack(context, 'Your details were saved.');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _phoneValidator(String? v) => v != null && v.trim().isNotEmpty && !RegExp(r'^[0-9+()\-\s]{7,20}$').hasMatch(v.trim()) ? 'Enter a valid phone number' : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit contact details')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            TextFormField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Contact number'), validator: _phoneValidator),
            const SizedBox(height: 16),
            TextFormField(controller: _address, maxLines: 2, decoration: const InputDecoration(labelText: 'Home address')),
            const SizedBox(height: 16),
            TextFormField(controller: _occupation, decoration: const InputDecoration(labelText: 'School / workplace')),
            const SectionTitle('Emergency contact'),
            TextFormField(controller: _ecName, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 16),
            TextFormField(controller: _ecPhone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone'), validator: _phoneValidator),
            const SizedBox(height: 16),
            TextFormField(controller: _ecRel, decoration: const InputDecoration(labelText: 'Relationship')),
            const SizedBox(height: 24),
            FilledButton(onPressed: _saving ? null : _save, child: _saving ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Save')),
          ]),
        ),
      ),
    );
  }
}
