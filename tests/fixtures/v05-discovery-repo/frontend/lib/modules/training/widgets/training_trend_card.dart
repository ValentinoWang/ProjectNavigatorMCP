class TrainingTrendCard {
  Widget buildCard(String title, int value) {
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
