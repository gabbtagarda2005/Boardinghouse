import 'package:boarding_house_tenant/core/format.dart';
import 'package:boarding_house_tenant/models/models.dart';
import 'package:boarding_house_tenant/screens/auth/password_rules.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('en_PH'));

  test('peso formatting uses ₱ and two decimals', () {
    expect(peso(3520.83), '₱3,520.83');
    expect(peso(0), '₱0.00');
    expect(peso(null), '₱0.00');
    expect(peso(1234567.5), '₱1,234,567.50');
  });

  test('period labels and method labels', () {
    expect(periodLabel(2026, 10), 'October 2026');
    expect(methodLabel('GCASH'), 'GCash');
    expect(methodLabel('BANK_TRANSFER', 'BDO'), 'BDO (bank transfer)');
    expect(methodLabel('CASH'), 'Cash');
    expect(methodLabel('UNKNOWN'), 'Other');
  });

  test('password rules mirror the backend policy', () {
    expect(passwordValidator('short1'), isNotNull);
    expect(passwordValidator('allletters'), isNotNull);
    expect(passwordValidator('12345678'), isNotNull);
    expect(passwordValidator('Tenant123'), isNull);
  });

  test('Bill parses the API payload', () {
    final b = Bill.fromJson({
      '_id': 'b1',
      'billNumber': 'BILL-202610-0001',
      'billingYear': 2026,
      'billingMonth': 10,
      'roomNumber': '101',
      'bedNumber': 2,
      'rent': 2500,
      'electricity': 770.84,
      'water': 150,
      'otherCharges': [
        {'label': 'Wi-Fi', 'amount': 100},
      ],
      'adjustments': [
        {'label': 'Promo', 'amount': -50},
      ],
      'discount': 50,
      'totalAmount': 3470.84,
      'amountPaid': 1000,
      'remainingBalance': 2470.84,
      'previousBalance': 0,
      'dueDate': '2026-10-10T15:59:59.000Z',
      'state': 'PUBLISHED',
      'status': 'PARTIALLY_PAID',
      'electricityDetail': {'consumption': 185, 'rate': 12.5, 'sharingMethod': 'PRORATED', 'days': 31, 'roomTotal': 2312.5},
    });
    expect(b.period, 'October 2026');
    expect(b.adjustments.single.amount, -50);
    expect(b.electricityDays, 31);
    expect(b.dueDate!.isUtc, isTrue);
    expect(b.isVoid, isFalse);
    expect(b.status, 'PARTIALLY_PAID');
    expect(b.totalAmount, 3470.84);
    expect(b.remainingBalance, 2470.84);
    expect(b.otherTotal, 100);
  });

  test('Payment distinguishes pending and confirmed', () {
    final p = Payment.fromJson({
      '_id': 'p1',
      'amount': 500,
      'paymentMethod': 'BANK_TRANSFER',
      'status': 'PENDING_VERIFICATION',
      'source': 'TENANT',
      'hasProof': true,
      'allocations': [],
    });
    expect(p.isPending, isTrue);
    expect(p.isConfirmed, isFalse);
    final c = Payment.fromJson({
      '_id': 'p2',
      'amount': 500,
      'paymentMethod': 'CASH',
      'status': 'CONFIRMED',
      'source': 'ADMIN',
      'receiptNumber': 'OR-2026-00001',
      'allocations': [
        {'billId': 'b1', 'billingYear': 2026, 'billingMonth': 9, 'amount': 500, 'billNumber': 'BILL-1'},
      ],
    });
    expect(c.isConfirmed, isTrue);
    expect(c.allocations.single.billId, 'b1');
    expect(c.paymentMethod, 'CASH');
  });
}
