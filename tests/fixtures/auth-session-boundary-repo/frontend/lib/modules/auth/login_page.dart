import '../../core/di/auth_controller.dart';

class LoginPage {
  LoginPage(this._authController);

  final AuthController _authController;

  Future<void> submit() async {
    await _authController.login('coach', 'secret');
  }
}
