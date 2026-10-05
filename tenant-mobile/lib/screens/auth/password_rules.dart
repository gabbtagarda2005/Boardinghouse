import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// Mirrors the password policy enforced by the sign-in system and the backend.
const passwordHint = 'At least 8 characters, with an uppercase letter, a lowercase letter and a number';

/// Each rule with a check, in the order shown to the tenant.
final passwordRules = <(String, bool Function(String))>[
  ('At least 8 characters', (p) => p.length >= 8),
  ('At least one uppercase letter', (p) => RegExp(r'[A-Z]').hasMatch(p)),
  ('At least one lowercase letter', (p) => RegExp(r'[a-z]').hasMatch(p)),
  ('At least one number', (p) => RegExp(r'[0-9]').hasMatch(p)),
];

String? passwordValidator(String? v) {
  final p = v ?? '';
  if (p.length < 8) return 'Use at least 8 characters';
  if (!RegExp(r'[A-Z]').hasMatch(p)) return 'Include at least one uppercase letter';
  if (!RegExp(r'[a-z]').hasMatch(p)) return 'Include at least one lowercase letter';
  if (!RegExp(r'[0-9]').hasMatch(p)) return 'Include at least one number';
  return null;
}

/// "Password must contain:" with a tick next to each rule as the tenant types.
class PasswordChecklist extends StatelessWidget {
  const PasswordChecklist({super.key, required this.controller});
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, _) => Semantics(
        container: true,
        child: Padding(
          padding: const EdgeInsets.only(top: 8, left: 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Password must contain:', style: TextStyle(color: AppColors.muted, fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            for (final (label, ok) in passwordRules)
              // Screen readers hear the rule and whether it's met, not just an icon.
              Semantics(
                label: '$label: ${ok(value.text) ? 'done' : 'not yet'}',
                excludeSemantics: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(children: [
                    Icon(ok(value.text) ? Icons.check_circle_rounded : Icons.radio_button_unchecked, size: 18, color: ok(value.text) ? AppColors.success : AppColors.muted),
                    const SizedBox(width: 8),
                    Expanded(child: Text(label, style: TextStyle(color: ok(value.text) ? AppColors.ink : AppColors.muted, fontSize: 13.5))),
                  ]),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}
