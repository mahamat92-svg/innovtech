import './globals.css';

export const metadata = {
  title: 'INNOVTECH — Gestion commerciale',
  description: 'Ventes, stock, factures et clients en FCFA pour les commerçants d’Afrique francophone.'
};

export default function RootLayout({ children }) {
  return <html lang="fr"><body>{children}</body></html>;
}
