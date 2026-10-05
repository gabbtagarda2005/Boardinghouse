import 'package:flutter/material.dart';

import 'bills_screen.dart';
import 'home_screen.dart';
import 'payments_screen.dart';
import 'profile_screen.dart';
import 'room_screen.dart';

/// Bottom-navigation shell. Tabs keep their state while switching.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  static AppShellState? of(BuildContext context) => context.findAncestorStateOfType<AppShellState>();

  @override
  State<AppShell> createState() => AppShellState();
}

class AppShellState extends State<AppShell> {
  int _index = 0;

  static const tabHome = 0;
  static const tabRoom = 1;
  static const tabBills = 2;
  static const tabPayments = 3;
  static const tabProfile = 4;

  void goTo(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _index == tabHome,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) goTo(tabHome);
      },
      child: Scaffold(
        body: IndexedStack(index: _index, children: const [HomeScreen(), RoomScreen(), BillsScreen(), PaymentsScreen(), ProfileScreen()]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: goTo,
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.bed_outlined), selectedIcon: Icon(Icons.bed), label: 'My Room'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Bills'),
            NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Payments'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
