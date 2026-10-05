import 'package:web/web.dart' as web;

void setFavicon(String? url) {
  final links = {'icon': url ?? 'favicon.png', 'apple-touch-icon': url ?? 'icons/Icon-192.png'};
  links.forEach((rel, href) {
    final el = web.document.querySelector('link[rel="$rel"]');
    el?.removeAttribute('type'); // the logo may be JPG, PNG or WEBP
    el?.setAttribute('href', href);
  });
}
