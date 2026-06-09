import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../di/providers.dart';
import '../identity/identity_controller.dart';
import '../../modules/auth/models.dart';

final authSessionBoundaryProvider = Provider<AuthSessionBoundary>(
  AuthSessionBoundary.new,
);

class AuthSessionBoundary {
  const AuthSessionBoundary(this._ref);

  final Ref _ref;

  void resetForLogoutOrSessionDrop() {
    _ref.read(identityControllerProvider.notifier).resetForAuthBoundary();
    _ref.read(authSessionInvalidationProvider.notifier).bump();
  }

  void resetForLoginPrincipalChange(
    UserProfile? previousUser,
    UserProfile? nextUser,
  ) {
    if (previousUser == null || nextUser == null) return;
    if (previousUser.id == nextUser.id) return;
    resetForLogoutOrSessionDrop();
  }

  void resetForIdentitySwitch() {
    _ref.read(identityControllerProvider.notifier).resetForIdentitySwitch();
  }
}
