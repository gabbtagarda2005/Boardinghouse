import 'favicon_stub.dart' if (dart.library.js_interop) 'favicon_web.dart' as impl;

/// Web: show the owner's logo as the browser tab icon (null = the default house icon).
/// Phones: does nothing (the launcher icon is part of the installed app).
void setFavicon(String? url) => impl.setFavicon(url);
