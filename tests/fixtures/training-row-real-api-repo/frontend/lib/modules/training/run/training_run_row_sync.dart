class TrainingRunRowSync {
  TrainingRunRowSync(this.api);

  final TrainingSessionsApi api;

  Future<void> writeTrainingRows(Map<String, Object?> payload) {
    return api.writeActionTiming(payload);
  }
}

class TrainingSessionsApi {
  Future<void> writeActionTiming(Map<String, Object?> payload) async {
    if (!payload.containsKey('training_row_logs') || !payload.containsKey('training_row_metrics')) {
      throw StateError('missing training row write payload');
    }
  }
}
