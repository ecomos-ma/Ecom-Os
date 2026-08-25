export interface ChangelogEntry {
  date: string;
  title: string;
  description: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-08-07',
    title: 'Nouveau sélecteur de thème',
    description: 'Le sélecteur de thème est maintenant un toggle pilule élégant avec icônes soleil/lune animées.'
  },
  {
    date: '2026-08-07',
    title: 'Menu Nouveautés ajouté',
    description: 'Un nouveau bouton Nouveautés dans le header permet de suivre les dernières mises à jour du produit.'
  },
  {
    date: '2026-08-02',
    title: 'Numérotation simplifiée des commandes',
    description: 'Les commandes YouCan et Google Sheets utilisent maintenant des numéros courts (YC-1, GS-1...) au lieu d\'UUID.'
  },
  {
    date: '2026-07-31',
    title: 'Page Finance connectée aux vraies données',
    description: 'Cash Balance, Payout Management et Cash Flow reflètent maintenant tes vraies commandes, dépenses et payouts.'
  },
  {
    date: '2026-07-30',
    title: 'Mapping SKU et variantes YouCan',
    description: 'Le nom du produit, le SKU et la variante sont maintenant correctement récupérés depuis YouCan.'
  }
];

const LAST_VIEWED_KEY = 'ecomos-changelog-last-viewed';

export function getLastViewedDate(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_VIEWED_KEY);
}

export function setLastViewedDate(date: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_VIEWED_KEY, date);
}

export function hasUnseenEntries(): boolean {
  const lastViewed = getLastViewedDate();
  if (!lastViewed) return true;
  
  const latestEntry = CHANGELOG[0];
  return latestEntry.date > lastViewed;
}
