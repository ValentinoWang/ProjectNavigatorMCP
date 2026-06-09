import 'training_run_payload_builder.dart';
import 'training_run_row_sync.dart';
import 'widgets/active_session_cockpit.dart';

class TrainingRunController {
  TrainingRunController(this.payloadBuilder, this.rowSync);

  final TrainingRunPayloadBuilder payloadBuilder;
  final TrainingRunRowSync rowSync;

  Future<void> persistActionTiming(SessionActionTimingDraft draft) {
    final payload = payloadBuilder.buildActionTimingPayload(draft);
    return rowSync.writeTrainingRows(payload);
  }
}
