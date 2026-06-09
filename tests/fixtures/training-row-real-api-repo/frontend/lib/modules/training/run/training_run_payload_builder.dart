import 'widgets/active_session_cockpit.dart';

class TrainingRunPayloadBuilder {
  Map<String, Object?> buildActionTimingPayload(SessionActionTimingDraft draft) {
    return {
      'training_row_logs': [
        {'row_id': draft.rowId, 'started_at_ms': 1000, 'ended_at_ms': 2000}
      ],
      'training_row_metrics': [
        {'row_id': draft.rowId, 'metric_id': draft.metricId, 'value': 12.4}
      ],
    };
  }
}
