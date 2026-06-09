class AssessmentWorkspacePage {
  AssessmentWorkspacePage({required this.athleteId});
  final String athleteId;

  void build() {
    ActiveViewSelectionBar(mode: ActiveViewSelectionMode.multiAthlete);
  }
}

class ActiveViewSelectionBar {
  ActiveViewSelectionBar({required Object mode});
}

class ActiveViewSelectionMode {
  static const multiAthlete = 'multiAthlete';
}
