class AthleteDetailPage {
  AthleteDetailPage({required this.athleteId});
  final String athleteId;

  void build() {
    ActiveViewSelectionBar(mode: ActiveViewSelectionMode.singleAthlete);
  }
}

class ActiveViewSelectionBar {
  ActiveViewSelectionBar({required Object mode});
}

class ActiveViewSelectionMode {
  static const singleAthlete = 'singleAthlete';
}
