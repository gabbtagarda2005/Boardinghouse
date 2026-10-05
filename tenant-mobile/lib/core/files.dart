import 'dart:typed_data';

import 'files_io.dart' if (dart.library.js_interop) 'files_web.dart' as impl;

/// Mobile: saves [bytes] to a temporary file and opens the share sheet (save to Files/Drive,
/// send via Messenger/email…). Web: downloads the PDF in the browser.
Future<void> saveAndSharePdf(Uint8List bytes, String filename, {String? text}) {
  final safe = filename.replaceAll(RegExp(r'[^\w\-.]'), '_');
  return impl.saveAndSharePdf(bytes, safe, text: text);
}
