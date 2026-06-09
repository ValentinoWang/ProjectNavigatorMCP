class GoRoute {
  const GoRoute({required Object name, required Object path, required Object builder});
}

class RouteNames {
  static const appDashboardManagement = 'app_dashboard_management';
  static const appDashboardPlatform = 'app_dashboard_platform';
  static const workspaceHub = 'workspace_hub';
  static const workspaceMicroplan = 'workspace_microplan';
  static const workspaceExerciseFactory = 'workspace_exercise_factory';
  static const workspaceExerciseLineageReview = 'workspace_exercise_lineage_review';
  static const workspaceCompetitions = 'workspace_competitions';
  static const workspaceMedical = 'workspace_medical';
}

final routes = [
  GoRoute(
    name: RouteNames.appDashboardManagement,
    path: RoutePaths.dashboardManagement,
    builder: (context, state) => const DashboardPage(),
  ),
  GoRoute(
    name: RouteNames.appDashboardPlatform,
    path: RoutePaths.dashboardPlatform,
    builder: (context, state) => const DashboardPage(),
  ),
  GoRoute(
    name: RouteNames.workspaceHub,
    path: RoutePaths.workspace,
    builder: (context, state) => const WorkspaceHubPage(),
  ),
  GoRoute(
    name: RouteNames.workspaceMicroplan,
    path: RoutePaths.workspaceMicroplan,
    builder: (context, state) => const WorkspaceMicroplanEntryPage(),
  ),
  GoRoute(
    name: RouteNames.workspaceExerciseFactory,
    path: RoutePaths.workspaceExercises,
    builder: (context, state) => const ExerciseFactoryPage(),
  ),
  GoRoute(
    name: RouteNames.workspaceExerciseFactory,
    path: RoutePaths.workspaceExerciseBuild,
    builder: (context, state) => const ExerciseFactoryPage(),
  ),
  GoRoute(
    name: RouteNames.workspaceExerciseLineageReview,
    path: RoutePaths.workspaceExerciseLineageReview,
    builder: (context, state) => const ExerciseLineageReviewPage(),
  ),
  GoRoute(
    name: RouteNames.workspaceCompetitions,
    path: RoutePaths.workspaceCompetitions,
    builder: (context, state) => const CompetitionAnchorSelector(),
  ),
  GoRoute(
    name: RouteNames.workspaceMedical,
    path: RoutePaths.workspaceMedical,
    builder: (context, state) => const MedicalConstraintBroadcaster(),
  ),
  GoRoute(
    name: AthletesRouteNames.detail,
    path: AthletesRoutePaths.detail,
    builder: (context, state) => AthleteDetailPage(athleteId: 'a1'),
  ),
  GoRoute(
    name: AthletesRouteNames.assessment,
    path: AthletesRoutePaths.assessment,
    builder: (context, state) => AssessmentWorkspacePage(athleteId: 'a1'),
  ),
  GoRoute(
    name: AthletesRouteNames.assessmentWorkspace,
    path: AthletesRoutePaths.assessmentWorkspace,
    builder: (context, state) => AssessmentWorkspacePage(athleteId: 'a1'),
  ),
  GoRoute(
    name: AthletesRouteNames.medicalWorkspace,
    path: AthletesRoutePaths.medicalWorkspace,
    builder: (context, state) => MedicalWorkspacePage(athleteId: 'a1'),
  ),
  GoRoute(
    name: AthletesRouteNames.personalBests,
    path: AthletesRoutePaths.personalBests,
    builder: (context, state) {
      if (state == null) return const NotFoundPage();
      return AthletePbManagePage(athleteId: 'a1');
    },
  ),
];

class NotFoundPage {
  const NotFoundPage();
}
