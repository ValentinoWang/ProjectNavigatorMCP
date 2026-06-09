import '../di/auth_controller.dart';

class RouterNotifier {
  RouterNotifier(this._authController);

  final AuthController _authController;

  Future<void> onUnauthorizedDrop() async {
    await _authController.syncFromTokenStore();
  }
}
