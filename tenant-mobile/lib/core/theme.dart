import 'package:flutter/material.dart';

/// Dark navy theme (matches the owner's admin portal): deep navy background, glassy cards,
/// bright blue accents and white pill buttons.
class AppColors {
  static const primary = Color(0xFF2F6BFF); // bright blue: accents, icons, links
  static const navy = Color(0xFF0A1430); // deep navy (backgrounds, text on white pills)
  static const navyDeep = Color(0xFF050A18);
  static const navySoft = Color(0xFF142650); // tinted backgrounds
  static const surface = Color(0xFF050A18); // page background
  static const card = Color(0xFF0C1630); // cards
  static const field = Color(0xFF08112A); // text fields
  static const border = Color(0xFF1E2B4D);
  static const ink = Color(0xFFEEF3FD); // headings and main text
  static const success = Color(0xFF34D399);
  static const warning = Color(0xFFFBBF24);
  static const danger = Color(0xFFF87171);
  static const muted = Color(0xFF96A6C8);
}

/// Soft, layered shadow used for cards that should stand out.
const kCardShadow = [
  BoxShadow(color: Color(0x66000000), blurRadius: 24, spreadRadius: -10, offset: Offset(0, 12)),
];

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: AppColors.primary, brightness: Brightness.dark).copyWith(
    primary: AppColors.primary,
    onPrimary: Colors.white,
    secondary: AppColors.primary,
    surface: AppColors.card,
    onSurface: AppColors.ink,
    surfaceTint: Colors.transparent,
    outline: AppColors.border,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: Brightness.dark, visualDensity: VisualDensity.standard);
  final text = base.textTheme.apply(bodyColor: const Color(0xFFDDE5F6), displayColor: AppColors.ink);
  const pill = StadiumBorder();
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.surface,
    canvasColor: AppColors.surface,
    textTheme: text.copyWith(
      headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3, color: AppColors.ink),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.2, color: AppColors.ink),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: 16,
      titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink, letterSpacing: -0.2),
    ),
    cardTheme: CardThemeData(
      color: AppColors.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: const BorderSide(color: AppColors.border)),
    ),
    listTileTheme: const ListTileThemeData(iconColor: Color(0xFF9DBBFF), textColor: AppColors.ink, contentPadding: EdgeInsets.symmetric(horizontal: 16)),
    dividerTheme: const DividerThemeData(color: AppColors.border, thickness: 1, space: 1),
    iconTheme: const IconThemeData(color: AppColors.ink),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.field,
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(18)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: Color(0xFF2F4270))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: AppColors.danger)),
      labelStyle: const TextStyle(color: AppColors.muted),
      hintStyle: const TextStyle(color: Color(0xFF5C6F98)),
      prefixIconColor: AppColors.muted,
      suffixIconColor: AppColors.muted,
      helperStyle: const TextStyle(color: AppColors.muted),
    ),
    // Main action: white pill with dark text (like the reference design).
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Colors.white,
        foregroundColor: AppColors.navy,
        disabledBackgroundColor: Colors.white24,
        disabledForegroundColor: Colors.white54,
        minimumSize: const Size.fromHeight(54),
        shape: pill,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        backgroundColor: Colors.white.withValues(alpha: 0.04),
        minimumSize: const Size.fromHeight(50),
        side: const BorderSide(color: Color(0x26FFFFFF)),
        shape: pill,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: const Color(0xFF9DBBFF), textStyle: const TextStyle(fontWeight: FontWeight.w700), minimumSize: const Size(48, 44)),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: AppColors.card,
      shape: const StadiumBorder(side: BorderSide(color: Color(0x26FFFFFF))),
      side: const BorderSide(color: Color(0x26FFFFFF)),
      labelStyle: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: AppColors.ink,
      unselectedLabelColor: AppColors.muted,
      indicatorColor: AppColors.primary,
      dividerColor: AppColors.border,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: const Color(0xFF071025),
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 70,
      indicatorColor: AppColors.primary,
      indicatorShape: const StadiumBorder(),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? Colors.white : AppColors.muted)),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(fontSize: 12, fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600, color: s.contains(WidgetState.selected) ? Colors.white : AppColors.muted),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: const Color(0xFF1A2A52),
      contentTextStyle: const TextStyle(color: AppColors.ink),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    dialogTheme: DialogThemeData(backgroundColor: AppColors.card, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)), surfaceTintColor: Colors.transparent),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: AppColors.card, surfaceTintColor: Colors.transparent),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.primary),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    }),
  );
}
