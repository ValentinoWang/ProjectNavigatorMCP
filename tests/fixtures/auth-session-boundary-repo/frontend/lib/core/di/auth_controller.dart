import '../auth/auth_session_boundary.dart';
import '../../modules/auth/auth_repository.dart';
import '../../modules/auth/models.dart';

class AuthController {
  AuthController(this._repo, this._boundary);

  final AuthRepository _repo;
  final AuthSessionBoundary _boundary;
  UserProfile? _user;

  Future<void> login(String username, String password) async {
    final previousUser = _user;
    final nextUser = await _repo.login(username, password);
    _boundary.resetForLoginPrincipalChange(previousUser, nextUser);
    _user = nextUser;
  }

  Future<void> logout() async {
    await _repo.logout();
    _boundary.resetForLogoutOrSessionDrop();
    _user = null;
  }

  Future<UserProfile?> syncFromTokenStore() async {
    final previousUser = _user;
    final restored = await _repo.tryRestoreSession();
    if (previousUser != null && restored == null) {
      _boundary.resetForLogoutOrSessionDrop();
    } else {
      _boundary.resetForLoginPrincipalChange(previousUser, restored);
    }
    _user = restored;
    return restored;
  }
}
