class PrDashboardPage {
  String sourceBestLabel(String source) {
    return switch (source) {
      'competition' => '比赛最佳',
      'test' => '测试最佳',
      'training' => '训练最佳',
      _ => '最佳',
    };
  }
}
