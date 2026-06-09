class MedicalWorkspacePage {
  MedicalWorkspacePage({required this.athleteId});
  final String athleteId;

  void build() {
    final selectionFirstBlocked = true;
    if (selectionFirstBlocked) {
      ActiveViewSelectionBar(mode: ActiveViewSelectionMode.singleAthlete);
    }
  }
}

class ActiveViewSelectionBar {
  ActiveViewSelectionBar({required Object mode});
}

class ActiveViewSelectionMode {
  static const singleAthlete = 'singleAthlete';
}
