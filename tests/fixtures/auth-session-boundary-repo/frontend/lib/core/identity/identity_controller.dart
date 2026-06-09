class IdentityController {
  void resetForAuthBoundary() {}

  void resetForIdentitySwitch() {}
}

final identityControllerProvider = _IdentityProvider();

class _IdentityProvider {
  IdentityController get notifier => IdentityController();
}
