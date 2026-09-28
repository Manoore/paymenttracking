// Plain data classes mirroring the API. Money is always integer minor units (cents).

DateTime? _date(dynamic v) => v == null ? null : DateTime.parse(v as String);
int? _int(dynamic v) => v == null ? null : (v as num).toInt();

const captureTypes = ['payment', 'expense', 'deposit', 'document', 'place', 'idea', 'note', 'link'];
const typeLabels = {
  'note': 'Note',
  'link': 'Link',
  'payment': 'Payment',
  'expense': 'Expense',
  'deposit': 'Check deposit',
  'document': 'Document',
  'place': 'Place',
  'idea': 'Idea',
};
const docKindLabels = {
  'warranty': 'Warranty',
  'insurance': 'Insurance policy',
  'passport': 'Passport',
  'license': "Driver's license",
  'registration': 'Vehicle registration',
  'lease': 'Lease',
  'contract': 'Contract',
  'id': 'ID card',
  'other': 'Other',
};
const statusLabels = {
  'to_submit': 'To submit',
  'submitted': 'Submitted',
  'partial': 'Partially reimbursed',
  'reimbursed': 'Reimbursed',
};

class Attachment {
  Attachment.fromJson(Map<String, dynamic> j)
      : id = j['_id'] as String,
        filename = j['filename'] as String,
        mimeType = j['mimeType'] as String,
        size = _int(j['size']) ?? 0,
        url = j['url'] as String?;

  final String id;
  final String filename;
  final String mimeType;
  final int size;
  final String? url;

  bool get isImage => mimeType.startsWith('image/');
}

class Reimbursement {
  Reimbursement.fromJson(Map<String, dynamic> j)
      : organization = j['organization'] as String?,
        status = (j['status'] as String?) ?? 'to_submit',
        submittedAt = _date(j['submittedAt']),
        amountOwedMinor = _int(j['amountOwedMinor']),
        amountReimbursedMinor = _int(j['amountReimbursedMinor']),
        reimbursedAt = _date(j['reimbursedAt']);

  final String? organization;
  final String status;
  final DateTime? submittedAt;
  final int? amountOwedMinor;
  final int? amountReimbursedMinor;
  final DateTime? reimbursedAt;
}

class Capture {
  Capture.fromJson(Map<String, dynamic> j)
      : id = j['_id'] as String,
        type = j['type'] as String,
        filed = j['filed'] as bool? ?? true,
        title = j['title'] as String,
        notes = j['notes'] as String?,
        tags = ((j['tags'] as List?) ?? const []).cast<String>(),
        category = j['category'] as String?,
        url = j['url'] as String?,
        counterparty = j['counterparty'] as String?,
        amountMinor = _int(j['amountMinor']),
        currency = (j['currency'] as String?) ?? 'USD',
        occurredAt = _date(j['occurredAt']),
        createdAt = _date(j['createdAt']) ?? DateTime.now(),
        property = j['property'] as String?,
        trip = j['trip'] as String?,
        organization = (j['organization'] ?? j['expense']?['reimbursement']?['organization']) as String?,
        method = (j['payment']?['method'] ?? j['expense']?['paymentMethod']) as String?,
        confirmationNumber = j['payment']?['confirmationNumber'] as String?,
        scheduleId = j['payment']?['scheduleId'] as String?,
        project = j['expense']?['project'] as String?,
        reimbursable = j['expense']?['reimbursable'] as bool? ?? false,
        reimbursement = j['expense']?['reimbursement'] == null
            ? null
            : Reimbursement.fromJson((j['expense']['reimbursement'] as Map).cast<String, dynamic>()),
        checkNumber = j['deposit']?['checkNumber'] as String?,
        bankAccount = j['deposit']?['bankAccount'] as String?,
        cleared = j['deposit']?['cleared'] as bool? ?? false,
        returnBy = _date(j['returnBy']),
        warrantyUntil = _date(j['warrantyUntil']),
        docKind = j['document']?['kind'] as String?,
        docReference = j['document']?['reference'] as String?,
        expiresAt = _date(j['document']?['expiresAt']),
        address = j['place']?['address'] as String?,
        mapUrl = j['place']?['mapUrl'] as String?,
        visited = j['place']?['visited'] as bool? ?? false,
        rating = _int(j['place']?['rating']),
        ideaStatus = j['idea']?['status'] as String?,
        attachmentCount = ((j['attachmentIds'] as List?) ?? const []).length,
        paidBy = (j['paidBy'] ?? (j['type'] == 'payment' || j['type'] == 'expense' ? j['createdBy'] : null)) as String?,
        isPrivate = j['visibility'] == 'private',
        attachments = ((j['attachments'] as List?) ?? const [])
            .map((a) => Attachment.fromJson((a as Map).cast<String, dynamic>()))
            .toList();

  final String id;
  final String type;
  final bool filed;
  final String title;
  final String? notes;
  final List<String> tags;
  final String? category;
  final String? url;
  final String? counterparty;
  final int? amountMinor;
  final String currency;
  final DateTime? occurredAt;
  final DateTime createdAt;
  final String? property;
  final String? trip;
  final String? organization;
  final String? method;
  final String? confirmationNumber;
  final String? scheduleId;
  final String? project;
  final bool reimbursable;
  final Reimbursement? reimbursement;
  final String? checkNumber;
  final String? bankAccount;
  final bool cleared;
  final DateTime? returnBy;
  final DateTime? warrantyUntil;
  final String? docKind;
  final String? docReference;
  final DateTime? expiresAt;
  final String? address;
  final String? mapUrl;
  final bool visited;
  final int? rating;
  final String? ideaStatus;
  final int attachmentCount;
  final String? paidBy;
  final bool isPrivate;
  final List<Attachment> attachments;

  DateTime get date => occurredAt ?? createdAt;
}

class Schedule {
  Schedule.fromJson(Map<String, dynamic> j)
      : id = j['_id'] as String,
        title = j['title'] as String,
        counterparty = j['counterparty'] as String?,
        amountMinor = _int(j['amountMinor']),
        currency = (j['currency'] as String?) ?? 'USD',
        category = j['category'] as String?,
        property = j['property'] as String?,
        method = j['method'] as String?,
        notes = j['notes'] as String?,
        unit = j['frequency']['unit'] as String,
        interval = _int(j['frequency']['interval']) ?? 1,
        nextDueDate = _date(j['nextDueDate'])!,
        reminderDaysBefore = _int(j['reminderDaysBefore']) ?? 3,
        active = j['active'] as bool? ?? true,
        claimedBy = j['claimedBy'] as String?,
        lastPaidBy = j['lastPaidBy'] as String?,
        lastPaidAt = _date(j['lastPaidAt']),
        history = ((j['history'] as List?) ?? const [])
            .map((c) => Capture.fromJson((c as Map).cast<String, dynamic>()))
            .toList();

  final String id;
  final String title;
  final String? counterparty;
  final int? amountMinor;
  final String currency;
  final String? category;
  final String? property;
  final String? method;
  final String? notes;
  final String unit;
  final int interval;
  final DateTime nextDueDate;
  final int reminderDaysBefore;
  final bool active;
  final String? claimedBy;
  final String? lastPaidBy;
  final DateTime? lastPaidAt;
  final List<Capture> history;
}

class OwedGroup {
  OwedGroup.fromJson(Map<String, dynamic> j)
      : organization = j['organization'] as String,
        currency = j['currency'] as String,
        count = _int(j['count']) ?? 0,
        outstandingMinor = _int(j['outstandingMinor']) ?? 0;

  final String organization;
  final String currency;
  final int count;
  final int outstandingMinor;
}

class Dashboard {
  Dashboard.fromJson(Map<String, dynamic> j)
      : overdue = _schedules(j['overdue']),
        upcoming = _schedules(j['upcoming']),
        recent = _captures(j['recent']),
        unclearedDeposits = _captures(j['unclearedDeposits']),
        inboxCount = _int(j['inboxCount']) ?? 0,
        expiring = ((j['expiring'] as List?) ?? const []).cast<Map<String, dynamic>>(),
        owed = ((j['reimbursementsOwed'] as List?) ?? const [])
            .map((g) => OwedGroup.fromJson((g as Map).cast<String, dynamic>()))
            .toList();

  final List<Schedule> overdue;
  final List<Schedule> upcoming;
  final List<Capture> recent;
  final List<Capture> unclearedDeposits;
  final int inboxCount;
  final List<OwedGroup> owed;
  final List<Map<String, dynamic>> expiring;
}

List<Schedule> _schedules(dynamic v) =>
    ((v as List?) ?? const []).map((s) => Schedule.fromJson((s as Map).cast<String, dynamic>())).toList();
List<Capture> _captures(dynamic v) =>
    ((v as List?) ?? const []).map((c) => Capture.fromJson((c as Map).cast<String, dynamic>())).toList();
List<Capture> capturesFrom(dynamic v) => _captures(v);
