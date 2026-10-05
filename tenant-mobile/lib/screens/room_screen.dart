import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// My room: number, bed, capacity, occupancy, rent, amenities and description.
class RoomScreen extends StatelessWidget {
  const RoomScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: const BrandTitle('My Room'), actions: const [NotificationBell()]),
      body: AsyncLoader<Map<String, dynamic>>(
        load: () => api.get('/me/room'),
        builder: (context, d, _) {
          final room = (d['room'] as Map?)?.cast<String, dynamic>();
          if (room == null) {
            return ListView(children: const [EmptyView(title: 'No room assigned yet', message: 'Your room details will appear here once the owner assigns you a room.', icon: Icons.bed_outlined)]);
          }
          final a = (d['assignment'] as Map?)?.cast<String, dynamic>() ?? {};
          final photos = ((room['photos'] as List?) ?? []).cast<Map>();
          final amenities = ((room['amenities'] as List?) ?? []).cast<String>();
          final mates = ((d['roommates'] as List?) ?? []).cast<Map>();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              if (photos.isNotEmpty) ...[
                SizedBox(
                  height: 190,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: photos.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 10),
                    itemBuilder: (_, i) => ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.network(
                        AppConfig.fileUrl(photos[i]['url'] as String),
                        width: photos.length == 1 ? MediaQuery.of(context).size.width - 32 : 260,
                        fit: BoxFit.cover,
                        semanticLabel: 'Room photo ${i + 1}',
                        errorBuilder: (_, _, _) => Container(width: 260, color: AppColors.card, child: const Icon(Icons.image_not_supported_outlined)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              Text('Room ${room['roomNumber']}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
              if (a['bedNumber'] != null) Text('Bed ${a['bedNumber']}', style: const TextStyle(fontSize: 17, color: AppColors.muted)),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(children: [
                    if ((room['building'] as String?)?.isNotEmpty == true) _row(Icons.apartment_outlined, 'Building', room['building'] as String),
                    _row(Icons.groups_outlined, 'Room capacity', '${room['capacity']} people'),
                    _row(Icons.person_outline, 'Current occupancy', '${room['occupiedBeds']} of ${room['capacity']}'),
                    _row(Icons.payments_outlined, 'Your monthly rent', peso(toNum(a['monthlyRent']))),
                    _row(Icons.event_outlined, 'Living here since', formatLongDate(parseDate(a['startDate']))),
                  ]),
                ),
              ),
              if (amenities.isNotEmpty) ...[
                const SectionTitle('Amenities'),
                Wrap(spacing: 8, runSpacing: 8, children: [for (final x in amenities) Chip(label: Text(x), avatar: const Icon(Icons.check, size: 18))]),
              ],
              if ((room['description'] as String?)?.isNotEmpty == true) ...[
                const SectionTitle('About this room'),
                Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(room['description'] as String, style: const TextStyle(fontSize: 15, height: 1.4)))),
              ],
              if (mates.isNotEmpty) ...[
                const SectionTitle('Roommates'),
                Card(child: Column(children: [for (final r in mates) ListTile(leading: const Icon(Icons.person_outline), title: Text(r['firstName'] as String? ?? ''), trailing: Text('Bed ${r['bedNumber']}'))])),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          Icon(icon, color: AppColors.primary, size: 22),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 15))),
          Flexible(child: Text(value, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
        ]),
      );
}
