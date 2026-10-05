import '../core/format.dart';

class LineItem {
  LineItem(this.label, this.amount);
  final String label;
  final num amount;
  factory LineItem.fromJson(Map<String, dynamic> j) => LineItem(j['label'] as String? ?? '', toNum(j['amount']));
}

class Bill {
  Bill({
    required this.id,
    required this.billNumber,
    required this.billingYear,
    required this.billingMonth,
    required this.roomNumber,
    required this.bedNumber,
    required this.rent,
    required this.electricity,
    required this.water,
    required this.otherCharges,
    required this.adjustments,
    required this.discount,
    required this.totalAmount,
    required this.amountPaid,
    required this.remainingBalance,
    required this.previousBalance,
    required this.dueDate,
    required this.state,
    required this.status,
    this.notes,
    this.electricityConsumption,
    this.electricityRate,
    this.electricityRoomTotal,
    this.electricitySharing,
    this.electricityOccupants,
    this.electricityDays,
    this.voidReason,
  });

  final String id;
  final String billNumber;
  final int billingYear;
  final int billingMonth;
  final String? roomNumber;
  final int? bedNumber;
  final num rent;
  final num electricity;
  final num water;
  final List<LineItem> otherCharges;
  final List<LineItem> adjustments;
  final num discount;
  final num totalAmount;
  final num amountPaid;
  final num remainingBalance;
  final num previousBalance;
  final DateTime? dueDate;
  final String state; // PUBLISHED | VOID
  final String status; // UNPAID | PARTIALLY_PAID | PAID | OVERDUE
  final String? notes;
  final num? electricityConsumption;
  final num? electricityRate;
  final num? electricityRoomTotal;
  final String? electricitySharing;
  final num? electricityOccupants;
  final num? electricityDays;
  final String? voidReason;

  String get period => periodLabel(billingYear, billingMonth);
  bool get isVoid => state == 'VOID';
  num get otherTotal => otherCharges.fold<num>(0, (s, c) => s + c.amount);

  factory Bill.fromJson(Map<String, dynamic> j) {
    final ed = (j['electricityDetail'] as Map?)?.cast<String, dynamic>() ?? const {};
    List<LineItem> lines(dynamic v) => ((v as List?) ?? []).map((e) => LineItem.fromJson((e as Map).cast())).toList();
    return Bill(
      id: j['_id'] as String,
      billNumber: j['billNumber'] as String? ?? '',
      billingYear: (j['billingYear'] as num).toInt(),
      billingMonth: (j['billingMonth'] as num).toInt(),
      roomNumber: j['roomNumber'] as String?,
      bedNumber: (j['bedNumber'] as num?)?.toInt(),
      rent: toNum(j['rent']),
      electricity: toNum(j['electricity']),
      water: toNum(j['water']),
      otherCharges: lines(j['otherCharges']),
      adjustments: lines(j['adjustments']),
      discount: toNum(j['discount']),
      totalAmount: toNum(j['totalAmount']),
      amountPaid: toNum(j['amountPaid']),
      remainingBalance: toNum(j['remainingBalance']),
      previousBalance: toNum(j['previousBalance']),
      dueDate: parseDate(j['dueDate']),
      state: j['state'] as String? ?? 'PUBLISHED',
      status: j['status'] as String? ?? 'UNPAID',
      notes: j['notes'] as String?,
      electricityConsumption: ed['consumption'] as num?,
      electricityRate: ed['rate'] as num?,
      electricityRoomTotal: ed['roomTotal'] as num?,
      electricitySharing: ed['sharingMethod'] as String?,
      electricityOccupants: ed['occupants'] as num?,
      electricityDays: ed['days'] as num?,
      voidReason: j['voidReason'] as String?,
    );
  }
}

class Allocation {
  Allocation({required this.billId, required this.billingYear, required this.billingMonth, required this.amount});
  final String billId;
  final int billingYear;
  final int billingMonth;
  final num amount;
  factory Allocation.fromJson(Map<String, dynamic> j) => Allocation(
        billId: j['billId'] as String,
        billingYear: (j['billingYear'] as num).toInt(),
        billingMonth: (j['billingMonth'] as num).toInt(),
        amount: toNum(j['amount']),
      );
}

class Payment {
  Payment({
    required this.id,
    required this.amount,
    required this.paymentMethod,
    required this.status,
    required this.source,
    required this.allocations,
    required this.hasProof,
    this.provider,
    this.referenceNumber,
    this.paymentDate,
    this.submittedAt,
    this.verifiedAt,
    this.receiptNumber,
    this.rejectionReason,
    this.notes,
    this.billId,
  });

  final String id;
  final num amount;
  final String paymentMethod;
  final String status; // PENDING_VERIFICATION | CONFIRMED | REJECTED | REVERSED
  final String source;
  final List<Allocation> allocations;
  final bool hasProof;
  final String? provider;
  final String? referenceNumber;
  final DateTime? paymentDate;
  final DateTime? submittedAt;
  final DateTime? verifiedAt;
  final String? receiptNumber;
  final String? rejectionReason;
  final String? notes;
  final String? billId;

  bool get isPending => status == 'PENDING_VERIFICATION';
  bool get isConfirmed => status == 'CONFIRMED';

  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: j['_id'] as String,
        amount: toNum(j['amount']),
        paymentMethod: j['paymentMethod'] as String? ?? 'OTHER',
        status: j['status'] as String? ?? 'PENDING_VERIFICATION',
        source: j['source'] as String? ?? 'TENANT',
        allocations: ((j['allocations'] as List?) ?? []).map((e) => Allocation.fromJson((e as Map).cast())).toList(),
        hasProof: j['hasProof'] == true,
        provider: j['provider'] as String?,
        referenceNumber: j['referenceNumber'] as String?,
        paymentDate: parseDate(j['paymentDate']),
        submittedAt: parseDate(j['submittedAt']),
        verifiedAt: parseDate(j['verifiedAt']),
        receiptNumber: j['receiptNumber'] as String?,
        rejectionReason: j['rejectionReason'] as String?,
        notes: j['notes'] as String?,
        billId: j['billId'] as String?,
      );
}

class AppNotification {
  AppNotification({required this.id, required this.type, required this.title, required this.message, required this.createdAt, this.readAt, this.data = const {}});
  final String id;
  final String type;
  final String title;
  final String message;
  final DateTime createdAt;
  final DateTime? readAt;
  final Map<String, dynamic> data;
  bool get isRead => readAt != null;
  AppNotification markRead() => AppNotification(id: id, type: type, title: title, message: message, createdAt: createdAt, readAt: DateTime.now(), data: data);
  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['_id'] as String,
        type: j['type'] as String? ?? 'general',
        title: j['title'] as String? ?? '',
        message: j['message'] as String? ?? '',
        createdAt: parseDate(j['createdAt']) ?? DateTime.now(),
        readAt: parseDate(j['readAt']),
        data: (j['data'] as Map?)?.cast<String, dynamic>() ?? const {},
      );
}

class PaymentChannel {
  PaymentChannel({required this.paymentMethod, this.provider, this.accountName, this.accountNumber, this.instructions});
  final String paymentMethod;
  final String? provider;
  final String? accountName;
  final String? accountNumber;
  final String? instructions;
  factory PaymentChannel.fromJson(Map<String, dynamic> j) => PaymentChannel(
        paymentMethod: j['paymentMethod'] as String? ?? 'OTHER',
        provider: j['provider'] as String?,
        accountName: j['accountName'] as String?,
        accountNumber: j['accountNumber'] as String?,
        instructions: j['instructions'] as String?,
      );
}

class UnpaidBill {
  UnpaidBill({required this.id, required this.label, required this.remainingBalance, this.dueDate, required this.status});
  final String id;
  final String label;
  final num remainingBalance;
  final DateTime? dueDate;
  final String status;
  factory UnpaidBill.fromJson(Map<String, dynamic> j) => UnpaidBill(
        id: j['_id'] as String,
        label: j['label'] as String? ?? '',
        remainingBalance: toNum(j['remainingBalance']),
        dueDate: parseDate(j['dueDate']),
        status: j['status'] as String? ?? 'UNPAID',
      );
}

class PaymentInfo {
  PaymentInfo({required this.instructions, required this.channels, required this.unpaidBills, required this.outstandingBalance});
  final String instructions;
  final List<PaymentChannel> channels;
  final List<UnpaidBill> unpaidBills;
  final num outstandingBalance;
  factory PaymentInfo.fromJson(Map<String, dynamic> j) => PaymentInfo(
        instructions: j['instructions'] as String? ?? '',
        channels: ((j['channels'] as List?) ?? []).map((e) => PaymentChannel.fromJson((e as Map).cast())).toList(),
        unpaidBills: ((j['unpaidBills'] as List?) ?? []).map((e) => UnpaidBill.fromJson((e as Map).cast())).toList(),
        outstandingBalance: toNum(j['outstandingBalance']),
      );
}
