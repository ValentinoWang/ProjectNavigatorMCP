import 'athlete_dashboard_home_widgets.dart';

class AthleteDashboardPage extends StatelessWidget {
  const AthleteDashboardPage({super.key});

  Widget build(BuildContext context) {
    return AthleteDashboardHomeWidgets().buildTrendCard();
  }
}
