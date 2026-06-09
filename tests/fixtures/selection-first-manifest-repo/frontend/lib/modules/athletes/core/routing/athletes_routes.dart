class AthletesRouteNames {
  AthletesRouteNames._();
  static const String detail = 'athlete_detail';
  static const String assessment = 'athlete_assessment';
  static const String assessmentWorkspace = 'athlete_assessment_workspace';
  static const String medicalWorkspace = 'athlete_medical_workspace';
  static const String personalBests = 'athlete_personal_bests';
}

class AthletesRoutePaths {
  AthletesRoutePaths._();
  static const String detail = '/athletes/:id';
  static const String assessment = '/athletes/:id/assessment';
  static const String assessmentWorkspace =
      '/athletes/:id/assessment-workspace';
  static const String medicalWorkspace = '/athletes/:id/medical-workspace';
  static const String personalBests = '/athletes/:id/personal-bests';
}
