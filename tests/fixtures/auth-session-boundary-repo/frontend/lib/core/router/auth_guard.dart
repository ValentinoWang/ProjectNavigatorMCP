class AuthGuard {
  bool canOpenProtectedRoute({required bool loggedIn}) => loggedIn;
}
