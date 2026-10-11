import { useTranslation } from 'react-i18next';

import { EmptyTab } from '../../components/EmptyTab';

// Built in Phase 6.
export default function MeScreen() {
  const { t } = useTranslation();
  return <EmptyTab title={t('me.title')} body={t('me.empty')} />;
}
