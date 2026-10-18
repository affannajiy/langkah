import { searchPlaces } from '../api/langkah';
import { loadSearchCache } from '../storage/searchCache';

let warmed = false;

// Once per launch: one tiny search wakes the database, so the first real search is not
// the slow cold one (about 0.85 s against 0.2 s warm), and saved searches load from the phone.
export function warmUp(): void {
  if (warmed) return;
  warmed = true;
  void loadSearchCache();
  searchPlaces('ipoh', null).catch(() => {
    // Offline or asleep: the real search reports any problem.
  });
}
