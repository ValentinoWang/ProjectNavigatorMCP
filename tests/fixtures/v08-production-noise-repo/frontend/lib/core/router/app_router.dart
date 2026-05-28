import '../../modules/user_core/dashboard/athlete_dashboard_page.dart';

class GoRoute {
  const GoRoute({required this.path, required this.name, required this.builder});
  final String path;
  final String name;
  final Object Function() builder;
}

final routes = [
  GoRoute(
    path: '/athlete/dashboard',
    name: 'athlete-dashboard',
    builder: () => const AthleteDashboardPage(),
  ),
];
