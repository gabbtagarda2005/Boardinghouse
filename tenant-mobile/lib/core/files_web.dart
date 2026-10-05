import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

/// Triggers a browser download of the PDF.
Future<void> saveAndSharePdf(Uint8List bytes, String filename, {String? text}) async {
  final blob = web.Blob([bytes.toJS].toJS, web.BlobPropertyBag(type: 'application/pdf'));
  final url = web.URL.createObjectURL(blob);
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = filename;
  web.document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  Future<void>.delayed(const Duration(seconds: 2), () => web.URL.revokeObjectURL(url));
}
