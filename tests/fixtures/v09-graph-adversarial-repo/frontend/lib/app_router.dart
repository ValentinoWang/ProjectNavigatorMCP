import 'dashboard_page.dart';

final appRouterProvider = GoRoute(
  path: '/dashboard',
  name: 'dashboard',
  builder: (context, state) => DashboardPage(),
);
