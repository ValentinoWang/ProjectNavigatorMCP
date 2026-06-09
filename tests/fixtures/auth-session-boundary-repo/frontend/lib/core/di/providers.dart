class InvalidationCounter {
  void bump() {}
}

final authSessionInvalidationProvider = _Provider();

class _Provider {
  InvalidationCounter get notifier => InvalidationCounter();
}
