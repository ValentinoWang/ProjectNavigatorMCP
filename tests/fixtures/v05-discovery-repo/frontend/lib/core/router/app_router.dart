import 'package:app/modules/user_core/dashboard/athlete_dashboard_page.dart';

final routes = [
  GoRoute(
    path: '/athlete/dashboard',
    name: 'athleteDashboard',
    builder: (context, state) => const AthleteDashboardPage(),
  ),
];
