import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/favicon.dart';

/// The boarding house name and logo the owner set in the admin portal (Settings).
/// Loaded once at start (public; works before signing in) and refreshed by the home screen.
class BrandingProvider extends ChangeNotifier {
  BrandingProvider(this.api);
  final ApiClient api;

  String? houseName;
  String? logoUrl;

  Future<void> load() async {
    try {
      final b = await api.get('/public/branding');
      update(name: b['houseName'] as String?, logo: b['logoUrl'] as String?);
    } catch (_) {
      // Offline or backend not reachable: keep the plain house icon.
    }
  }

  void update({String? name, String? logo}) {
    if (name == houseName && logo == logoUrl) return;
    houseName = name;
    logoUrl = logo;
    setFavicon(logo == null ? null : AppConfig.fileUrl(logo)); // browser tab icon = the owner's logo
    notifyListeners();
  }
}
