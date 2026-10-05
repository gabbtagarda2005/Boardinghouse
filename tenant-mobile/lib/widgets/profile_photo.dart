import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import 'common.dart';

/// The tenant's profile picture. Tap to take a photo, pick one from the gallery, or remove it.
/// Photos are private: only the tenant and the owner can see them.
class ProfilePhoto extends StatefulWidget {
  const ProfilePhoto({super.key, required this.name, this.photoUrl, this.onChanged, this.onPhoto, this.radius = 34});
  final String name;
  final String? photoUrl;
  final VoidCallback? onChanged;
  /// Told right away when a photo is added (true) or removed (false).
  final ValueChanged<bool>? onPhoto;
  final double radius;

  @override
  State<ProfilePhoto> createState() => ProfilePhotoState();
}

/// Public so a separate "Add Photo" button can open the same choices (openMenu).
class ProfilePhotoState extends State<ProfilePhoto> {
  Uint8List? _bytes;
  String? _loadedFor;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(ProfilePhoto oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.photoUrl != widget.photoUrl) _load();
  }

  Future<void> _load() async {
    final url = widget.photoUrl;
    if (url == null) {
      setState(() => (_bytes = null, _loadedFor = null));
      return;
    }
    if (url == _loadedFor) return;
    try {
      final path = url.replaceFirst('/api/v1', '');
      final b = await context.read<ApiClient>().getBytes(path);
      if (mounted) setState(() => (_bytes = b, _loadedFor = url));
    } catch (_) {
      // Keep the initials if the photo can't be loaded.
    }
  }

  String get _initials => widget.name.trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty).take(2).map((s) => s[0].toUpperCase()).join();

  String _mime(String name, String? reported) {
    if (reported != null && reported.startsWith('image/')) return reported;
    final n = name.toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  Future<void> _pick(ImageSource source) async {
    final api = context.read<ApiClient>();
    try {
      final f = await ImagePicker().pickImage(source: source, maxWidth: 900, imageQuality: 85, preferredCameraDevice: CameraDevice.front);
      if (f == null) return;
      final bytes = await f.readAsBytes();
      if (bytes.length > 5 * 1024 * 1024) {
        if (mounted) showSnack(context, 'That photo is larger than 5 MB. Please choose a smaller one.', error: true);
        return;
      }
      setState(() => _busy = true);
      final form = FormData.fromMap({'photo': MultipartFile.fromBytes(bytes, filename: f.name, contentType: DioMediaType.parse(_mime(f.name, f.mimeType)))});
      await api.post('/me/profile/photo', data: form);
      if (!mounted) return;
      setState(() => _bytes = bytes); // show it right away
      widget.onPhoto?.call(true);
      showSnack(context, 'Profile photo saved.');
      widget.onChanged?.call();
    } catch (e) {
      if (mounted) showSnack(context, e is ApiException ? e.message : 'Could not open the ${source == ImageSource.camera ? 'camera' : 'gallery'}.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    final ok = await showConfirmationDialog(context, title: 'Remove your photo?', message: 'Your initials will be shown instead.', confirmLabel: 'Remove', danger: true);
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<ApiClient>().delete('/me/profile/photo');
      if (!mounted) return;
      setState(() => (_bytes = null, _loadedFor = null));
      widget.onPhoto?.call(false);
      showSnack(context, 'Profile photo removed.');
      widget.onChanged?.call();
    } catch (e) {
      if (mounted) showSnack(context, ApiException.from(e).message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Whether a photo is set (for the button text: Add / Change).
  bool get hasPhoto => _bytes != null;

  void openMenu() => _busy ? null : _menu();

  void _menu() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('Profile photo', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink)),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () {
                Navigator.pop(ctx);
                _pick(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pick(ImageSource.gallery);
              },
            ),
            if (_bytes != null)
              ListTile(
                leading: const Icon(Icons.delete_outline, color: AppColors.danger),
                title: const Text('Remove photo', style: TextStyle(color: AppColors.danger)),
                onTap: () {
                  Navigator.pop(ctx);
                  _remove();
                },
              ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.radius;
    return Semantics(
      button: true,
      label: _bytes == null ? 'Add a profile photo' : 'Change profile photo',
      child: GestureDetector(
        onTap: _busy ? null : _menu,
        child: SizedBox(
          width: r * 2 + 6,
          height: r * 2 + 6,
          child: Stack(clipBehavior: Clip.none, children: [
            Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
              child: CircleAvatar(
                radius: r,
                backgroundColor: AppColors.navySoft,
                backgroundImage: _bytes == null ? null : MemoryImage(_bytes!),
                child: _busy
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                    : _bytes == null
                        ? Text(_initials, style: TextStyle(color: AppColors.ink, fontSize: r * 0.62, fontWeight: FontWeight.w800))
                        : null,
              ),
            ),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                child: const Icon(Icons.photo_camera, color: Colors.white, size: 15),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
