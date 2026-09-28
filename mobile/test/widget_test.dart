import 'package:capture_hub/api.dart';
import 'package:capture_hub/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parseMoney converts to integer cents', () {
    expect(parseMoney('325'), 32500);
    expect(parseMoney('1,234.56'), 123456);
    expect(parseMoney('\$0.10'), 10);
    expect(parseMoney(''), isNull);
  });

  test('frequencyLabel', () {
    expect(frequencyLabel('month', 1), 'Monthly');
    expect(frequencyLabel('month', 3), 'Quarterly');
    expect(frequencyLabel('week', 2), 'Every 2 weeks');
  });

  test('formatDate uses UTC so date-only values do not shift', () {
    expect(formatDate(DateTime.utc(2026, 1, 31)), 'Jan 31, 2026');
  });

  test('inviteTokenFrom accepts a full link or a bare token', () {
    expect(Api.inviteTokenFrom('https://paymenttracking.vercel.app/invite/abcDEF_123-xyz'), 'abcDEF_123-xyz');
    expect(Api.inviteTokenFrom('  https://x.app/invite/tok123?utm=1 '), 'tok123');
    expect(Api.inviteTokenFrom('tok456'), 'tok456');
  });
}
