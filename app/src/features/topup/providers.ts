// Parody banks and e-wallets for the mock top-up (docs/revenue-plan.md). Our own
// initials and colours, close to but not the same as the real brands. Never a real logo.

export type Provider = {
  name: string; // also the `via` the server checks
  product: string;
  initials: string;
  brand: string; // header and logo fill
  onBrand: string; // text on the brand colour
  page: string; // soft page colour
  method: 'bank' | 'wallet';
};

export const BANKS: Provider[] = [
  { name: 'TigerBank', product: 'Tiger2u', initials: 'TB', brand: '#F2B705', onBrand: '#1A1A2E', page: '#FFF8E1', method: 'bank' },
  { name: 'BICC Bank', product: 'BICC Clicks', initials: 'BC', brand: '#8E1B2E', onBrand: '#FFFFFF', page: '#FBEFF1', method: 'bank' },
  { name: 'PeopleBank', product: 'PBe', initials: 'PB', brand: '#C62828', onBrand: '#FFFFFF', page: '#FDEEEE', method: 'bank' },
  { name: 'RBH Bank', product: 'RBH Now', initials: 'RB', brand: '#1F4E9E', onBrand: '#FFFFFF', page: '#EDF2FA', method: 'bank' },
  { name: 'Long Hong Bank', product: 'LongHong Connect', initials: 'LH', brand: '#123A73', onBrand: '#FFFFFF', page: '#ECF0F7', method: 'bank' },
  { name: 'BankRakyatku', product: 'iRakyatku', initials: 'BR', brand: '#007A99', onBrand: '#FFFFFF', page: '#E8F5F8', method: 'bank' },
  { name: 'Afnan Bank', product: 'AfnanOnline', initials: 'AF', brand: '#1D3557', onBrand: '#F4A261', page: '#EEF1F6', method: 'bank' },
];

export const WALLETS: Provider[] = [
  { name: 'GnG eWallet', product: 'GnG', initials: 'GnG', brand: '#0D4EA6', onBrand: '#FFE082', page: '#0D4EA6', method: 'wallet' },
  { name: 'Bump', product: 'Bump', initials: 'Bp', brand: '#C8102E', onBrand: '#FFFFFF', page: '#C8102E', method: 'wallet' },
  { name: 'GrabbyPay', product: 'GrabbyPay', initials: 'GP', brand: '#0B7A3E', onBrand: '#FFFFFF', page: '#0B7A3E', method: 'wallet' },
  { name: 'ShopiPay', product: 'ShopiPay', initials: 'SP', brand: '#D9481F', onBrand: '#FFFFFF', page: '#D9481F', method: 'wallet' },
];

// Top-up packs (guide Section 15.2). The server computes the same numbers.
export const PACKS = [
  { rm: 5, points: 500, bonus: 0 },
  { rm: 10, points: 1100, bonus: 100 },
  { rm: 20, points: 2300, bonus: 300 },
  { rm: 50, points: 6000, bonus: 1000 },
] as const;

export const TAC = '428193';
