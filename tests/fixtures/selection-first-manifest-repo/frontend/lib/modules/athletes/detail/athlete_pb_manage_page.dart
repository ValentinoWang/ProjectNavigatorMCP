class AthletePbManagePage {
  AthletePbManagePage({required this.athleteId});
  final String athleteId;
}

class _AthletePbSelectionFirstGate {
  void build() {
    const key = 'athlete_pb_selection_first_gate';
    ActiveViewSelectionBar(mode: ActiveViewSelectionMode.singleAthlete);
  }
}

class ActiveViewSelectionBar {
  ActiveViewSelectionBar({required Object mode});
}

class ActiveViewSelectionMode {
  static const singleAthlete = 'singleAthlete';
}
