import 'package:intl/intl.dart';

String formatMoney(int? minor, [String currency = 'USD']) {
  if (minor == null) return '';
  return NumberFormat.simpleCurrency(name: currency).format(minor / 100);
}

/// "1,234.50" -> 123450 cents; null for blank/invalid input.
int? parseMoney(String input) {
  final cleaned = input.replaceAll(RegExp(r'[^\d.]'), '');
  if (cleaned.isEmpty) return null;
  final n = double.tryParse(cleaned);
  if (n == null || n < 0) return null;
  return (n * 100).round();
}

String minorToInput(int? minor) => minor == null ? '' : (minor / 100).toStringAsFixed(2);

/// Date-only values are stored at UTC midnight; format in UTC to avoid off-by-one days.
String formatDate(DateTime? d) => d == null ? '' : DateFormat.yMMMd().format(d.toUtc());

/// yyyy-MM-dd for the API.
String isoDate(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

DateTime todayUtc() {
  final n = DateTime.now();
  return DateTime.utc(n.year, n.month, n.day);
}

int daysUntil(DateTime due) => due.toUtc().difference(todayUtc()).inDays;

String relativeDue(DateTime due) {
  final d = daysUntil(due);
  if (d < 0) return '${-d} day${d == -1 ? '' : 's'} overdue';
  if (d == 0) return 'Due today';
  if (d == 1) return 'Due tomorrow';
  return 'Due in $d days';
}

String frequencyLabel(String unit, int interval) {
  if (interval == 1) return {'week': 'Weekly', 'month': 'Monthly', 'year': 'Yearly'}[unit] ?? unit;
  if (unit == 'month' && interval == 3) return 'Quarterly';
  if (unit == 'month' && interval == 6) return 'Every 6 months';
  return 'Every $interval ${unit}s';
}
