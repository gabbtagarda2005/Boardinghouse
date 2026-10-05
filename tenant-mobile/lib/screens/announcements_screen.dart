import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

class AnnouncementsScreen extends StatelessWidget {
  const AnnouncementsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: const Text('Announcements')),
      body: AsyncLoader<List<Map<String, dynamic>>>(
        load: () async => (((await api.get('/me/announcements'))['items'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList(),
        builder: (context, items, _) => items.isEmpty
            ? ListView(children: const [EmptyView(title: 'No announcements', icon: Icons.campaign_outlined)])
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final a = items[i];
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          if (a['pinned'] == true) const Padding(padding: EdgeInsets.only(right: 6), child: Icon(Icons.push_pin, size: 18, color: AppColors.primary)),
                          Expanded(child: Text(a['title'] as String? ?? '', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                        ]),
                        const SizedBox(height: 6),
                        Text(a['body'] as String? ?? '', style: const TextStyle(fontSize: 15, height: 1.4)),
                        const SizedBox(height: 8),
                        Text(formatDateTime(parseDate(a['createdAt'])), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      ]),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
