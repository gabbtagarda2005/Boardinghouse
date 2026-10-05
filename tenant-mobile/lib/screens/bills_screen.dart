import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/cards.dart';
import '../widgets/common.dart';
import 'bill_detail_screen.dart';

class BillsScreen extends StatelessWidget {
  const BillsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: const BrandTitle('My Bills'), actions: const [NotificationBell()]),
      body: AsyncLoader<Map<String, dynamic>>(
        load: () => api.get('/me/bills', query: {'limit': 100}),
        builder: (context, d, reload) {
          final bills = ((d['items'] as List?) ?? []).map((e) => Bill.fromJson((e as Map).cast())).toList();
          final owed = toNum(d['outstandingBalance']);
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    Icon(owed > 0 ? Icons.account_balance_wallet : Icons.verified, color: owed > 0 ? AppColors.warning : AppColors.success, size: 34),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('You still need to pay', style: TextStyle(color: AppColors.muted)),
                        Text(peso(owed), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                      ]),
                    ),
                  ]),
                ),
              ),
              const SectionTitle('Monthly bills'),
              if (bills.isEmpty)
                const Card(child: EmptyView(title: 'No bills yet', message: 'Your monthly bills will appear here.', icon: Icons.receipt_long_outlined))
              else
                for (final b in bills) ...[
                  BillCard(
                    bill: b,
                    onTap: () async {
                      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => BillDetailScreen(billId: b.id)));
                      reload();
                    },
                  ),
                  const SizedBox(height: 10),
                ],
            ],
          );
        },
      ),
    );
  }
}
