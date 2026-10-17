import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { myWallet, pointsErrorCode, topupMock, type TopupResult } from '../api/points';
import { ScrimSheet } from '../components/ScrimSheet';
import { AmountStep, type Choice } from '../features/topup/AmountStep';
import { MethodSheetBody, ProviderList } from '../features/topup/ChooseSteps';
import { DemoStrip } from '../features/topup/DemoStrip';
import { BankLogin, BankTac, WalletPin } from '../features/topup/ProviderPages';
import { Failed, Processing, Receipt } from '../features/topup/ResultSteps';
import type { Provider } from '../features/topup/providers';
import { formatPoints } from '../i18n/format';
import { notifyPoints } from '../points/notice';
import { colors } from '../theme/theme';

type Step =
  | { kind: 'amount' }
  | { kind: 'list'; method: 'bank' | 'wallet' }
  | { kind: 'login'; p: Provider }
  | { kind: 'tac'; p: Provider }
  | { kind: 'pin'; p: Provider }
  | { kind: 'processing'; p: Provider }
  | { kind: 'receipt'; p: Provider; r: TopupResult }
  | { kind: 'failed'; message: string };

const PROCESSING_MS = 2000;

// Mock top-up (guide Section 15.5; docs/revenue-plan.md "Top-up flow"). Amount,
// method, bank or wallet, mock login or PIN, TAC, processing, receipt. Nothing is
// typed, saved or sent to a bank. Back before the receipt cancels with no points.
// The Me tab only opens this for a Google or demo account; the server checks again.
export default function TopUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>({ kind: 'amount' });
  const [methodOpen, setMethodOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>({ rm: 10, pack: true });
  const [custom, setCustom] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [leftRm, setLeftRm] = useState<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    myWallet()
      .then((w) => {
        setBalance(w.balance);
        setLeftRm(w.topupLeftRm);
      })
      .catch(() => undefined);
    return () => {
      alive.current = false;
    };
  }, []);

  const cancel = useCallback(() => {
    notifyPoints({ kind: 'text', text: t('topup.cancelled') });
    router.back();
  }, [router, t]);

  const goBack = useCallback(() => {
    if (methodOpen) return setMethodOpen(false);
    switch (step.kind) {
      case 'amount':
        return router.back();
      case 'list':
        return setStep({ kind: 'amount' });
      case 'login':
      case 'tac':
      case 'pin':
        return cancel();
      case 'processing':
        return; // the server call is already on its way
      case 'receipt':
      case 'failed':
        return router.back();
    }
  }, [methodOpen, step.kind, router, cancel]);

  // Android back follows the same rules as the on-screen back and Cancel.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goBack();
        return true;
      });
      return () => sub.remove();
    }, [goBack]),
  );

  async function pay(p: Provider) {
    if (!choice) return;
    setStep({ kind: 'processing', p });
    try {
      const [r] = await Promise.all([topupMock(choice.rm, choice.pack, p.name), new Promise((res) => setTimeout(res, PROCESSING_MS))]);
      if (!alive.current) return;
      setStep({ kind: 'receipt', p, r });
      notifyPoints({ kind: 'text', text: t('topup.earned', { value: formatPoints(r.points) }) });
    } catch (e) {
      if (!alive.current) return;
      const code = pointsErrorCode(e);
      setStep({ kind: 'failed', message: t(`topup.error.${code}`, { defaultValue: t('topup.error.network') }) });
    }
  }

  const top = insets.top;
  const bottom = insets.bottom;
  const rm = choice?.rm ?? 0;
  // The parody bank and wallet pages carry their own strip and colours.
  const plainStrip = step.kind === 'amount' || step.kind === 'list' || step.kind === 'processing' || step.kind === 'receipt' || step.kind === 'failed';

  return (
    <View style={styles.root}>
      {plainStrip && <DemoStrip top={top} />}

      {step.kind === 'amount' && (
        <AmountStep
          balance={balance}
          leftRm={leftRm}
          choice={choice}
          custom={custom}
          onPack={(r) => {
            setCustom('');
            setChoice({ rm: r, pack: true });
          }}
          onCustom={(text) => {
            setCustom(text);
            const n = Number(text);
            setChoice(text && Number.isInteger(n) && n >= 1 && n <= 100 ? { rm: n, pack: false } : null);
          }}
          onNext={() => setMethodOpen(true)}
          onBack={goBack}
          bottomInset={bottom}
        />
      )}
      {step.kind === 'list' && (
        <ProviderList
          method={step.method}
          rm={rm}
          onBack={goBack}
          onPick={(p) => setStep(p.method === 'bank' ? { kind: 'login', p } : { kind: 'pin', p })}
        />
      )}
      {step.kind === 'login' && (
        <BankLogin p={step.p} rm={rm} top={top} bottom={bottom} onCancel={cancel} onLogin={() => setStep({ kind: 'tac', p: step.p })} />
      )}
      {step.kind === 'tac' && <BankTac p={step.p} rm={rm} top={top} bottom={bottom} onCancel={cancel} onApprove={() => void pay(step.p)} />}
      {step.kind === 'pin' && <WalletPin p={step.p} rm={rm} top={top} bottom={bottom} onCancel={cancel} onDone={() => void pay(step.p)} />}
      {step.kind === 'processing' && <Processing p={step.p} rm={rm} />}
      {step.kind === 'receipt' && (
        <Receipt p={step.p} rm={rm} r={step.r} bottom={bottom} onShop={() => router.replace('/shop')} onDone={() => router.back()} />
      )}
      {step.kind === 'failed' && <Failed message={step.message} bottom={bottom} onBack={() => router.back()} />}

      <ScrimSheet visible={methodOpen} onClose={() => setMethodOpen(false)}>
        <MethodSheetBody
          rm={rm}
          onPick={(method) => {
            setMethodOpen(false);
            setStep({ kind: 'list', method });
          }}
        />
      </ScrimSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
