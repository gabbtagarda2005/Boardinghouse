import 'package:intl/intl.dart';

final _peso = NumberFormat.currency(locale: 'en_PH', symbol: '₱', decimalDigits: 2);
final _date = DateFormat('MMM d, yyyy');
final _dateTime = DateFormat('MMM d, yyyy • h:mm a');
const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/// Philippine peso, e.g. ₱3,520.83
String peso(num? value) => _peso.format(value ?? 0);

/// Dates are shown in the device's local time zone.
String formatDate(DateTime? d) => d == null ? '—' : _date.format(d.toLocal());
String formatDateTime(DateTime? d) => d == null ? '—' : _dateTime.format(d.toLocal());

String periodLabel(int year, int month) => '${_months[month - 1]} $year';

DateTime? parseDate(dynamic v) => v is String ? DateTime.tryParse(v) : null;

num toNum(dynamic v) => v is num ? v : num.tryParse('$v') ?? 0;

String timeAgo(DateTime d) {
  final diff = DateTime.now().difference(d.toLocal());
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inHours < 1) return '${diff.inMinutes}m ago';
  if (diff.inDays < 1) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return formatDate(d);
}

const methodLabels = {'GCASH': 'GCash', 'MAYA': 'Maya', 'BANK_TRANSFER': 'Bank transfer', 'CASH': 'Cash', 'OTHER': 'Other'};

String methodLabel(String method, [String? provider]) {
  final base = methodLabels[method] ?? 'Other';
  return method == 'BANK_TRANSFER' && provider != null && provider.isNotEmpty ? '$provider (bank transfer)' : base;
}

/// Greeting for the time of day, e.g. "Good morning".
String greeting([DateTime? at]) {
  final h = (at ?? DateTime.now()).hour;
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/// October 10, 2026
String formatLongDate(DateTime? d) => d == null ? '—' : DateFormat('MMMM d, yyyy').format(d.toLocal());

/// Days from today until [due] (negative when overdue).
int daysUntil(DateTime due) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final d = due.toLocal();
  return DateTime(d.year, d.month, d.day).difference(today).inDays;
}
