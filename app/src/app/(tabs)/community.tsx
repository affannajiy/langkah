import { useTranslation } from 'react-i18next';

import { EmptyTab } from '../../components/EmptyTab';

// Built in Phase 5 (docs/screens/Community.png).
export default function CommunityScreen() {
  const { t } = useTranslation();
  return <EmptyTab title={t('community.title')} body={t('community.empty')} />;
}
