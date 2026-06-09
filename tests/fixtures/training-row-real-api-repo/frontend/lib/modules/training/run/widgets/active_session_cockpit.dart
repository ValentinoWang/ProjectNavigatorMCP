class ActiveSessionCockpit {
  ActiveSessionCockpit({required this.onActionSaved});

  final Future<void> Function(SessionActionTimingDraft draft) onActionSaved;

  Future<void> saveActionTiming() {
    return onActionSaved(SessionActionTimingDraft(rowId: 'row-1', metricId: 'pace'));
  }
}

class SessionActionTimingDraft {
  const SessionActionTimingDraft({required this.rowId, required this.metricId});

  final String rowId;
  final String metricId;
}
