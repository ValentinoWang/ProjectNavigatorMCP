import '../../training/widgets/training_trend_card.dart';

class AthleteDashboardHomeWidgets {
  Widget buildTrendCard() {
    final card = TrainingTrendCard();
    return card.buildCard('weekly load', 42);
  }

  Widget duplicatedSummaryCard(String title, int value) {
    return Card(
      child: Column(
        children: [
          Text(title),
          Text('$value'),
        ],
      ),
    );
  }
}
