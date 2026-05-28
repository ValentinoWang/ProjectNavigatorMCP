import '../../../design_system/components/dashboard_card_base.dart';
import '../../../training/widgets/training_trend_card.dart';
import '../../../l10n/l10n.dart';
import '../../../core/logging/logger.dart';
import '../../../core/errors/api_error.dart';
import '../../auth/auth_user_cache_provider.dart';
import '../../../utils/dashboard_helpers.dart';

class AthleteDashboardHomeSections {
  const AthleteDashboardHomeSections();

  Object build() {
    DashboardLogger();
    DashboardApiError();
    DashboardAuthUserCacheProvider();
    DashboardHelpers();
    DashboardL10n();
    DashboardCardBase();
    return const TrainingTrendCard();
  }
}
