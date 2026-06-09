import 'models.dart';

class AuthRepository {
  Future<UserProfile> login(String username, String password) async => UserProfile(username);

  Future<void> logout() async {}

  Future<UserProfile?> tryRestoreSession() async => null;
}
