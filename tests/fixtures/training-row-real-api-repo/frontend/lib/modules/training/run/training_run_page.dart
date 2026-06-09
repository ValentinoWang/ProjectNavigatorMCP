import 'widgets/active_session_cockpit.dart';
import 'training_run_controller.dart';

class TrainingRunPage {
  TrainingRunPage(this.controller);

  final TrainingRunController controller;

  ActiveSessionCockpit buildCockpit() {
    return ActiveSessionCockpit(onActionSaved: controller.persistActionTiming);
  }
}
