# INNOVTECH — plateforme multi-sectorielle

Application Next.js + Supabase en français, avec interface bleue, valeurs en FCFA et espaces séparés pour Commerce, École, Clinique, Restaurant, Transport, Agriculture et ONG.

## Démarrage

1. Node.js 20.9 ou plus récent.
2. `npm ci`
3. Copier `.env.example` vers `.env.local` et configurer les variables Supabase.
4. Les migrations `0002` (commerce) et `0003` (remboursements) sont déjà appliquées sur le projet Supabase existant. **Pour activer les nouveaux secteurs, appliquer uniquement `supabase/migrations/202611040004_multi_sector.sql`** dans Supabase SQL Editor.
5. `npm run dev`, puis ouvrir `http://localhost:3000`.

## Espaces métier

- **Commerce** : produits, clients, ventes/factures et suivi de crédits existants. Après une vente, « Voir la facture » ouvre l’aperçu imprimable, avec partage par e-mail (brouillon prérempli, envoi à confirmer) ou WhatsApp (texte prérempli, envoi à confirmer).
- **Autres secteurs** : choix de secteur à l'inscription et registre persistant dans Supabase permettant de créer, suivre et supprimer des dossiers avec référence, contact, montant FCFA, statut et notes. Les libellés/modules diffèrent selon le secteur.
- **Admin** : liste des organisations, filtre par secteur/pays/état, consultation et blocage/déblocage.

Le registre des autres secteurs est une première base multi-sectorielle, pas encore un logiciel spécialisé complet (ex. gestion détaillée des examens scolaires ou dossier médical).

## Base et sécurité

La migration 004 ajoute `users.secteur`, met à jour le déclencheur de profil à l'inscription, et crée `activites_sectorielles` avec RLS. Chaque organisation ne peut consulter que ses propres enregistrements. La clé publishable est utilisée côté client; aucune clé `service_role` ne doit être exposée.

Pour promouvoir manuellement un propriétaire en admin après inscription, récupère son UUID dans **Supabase → Authentication → Users**, puis exécute dans SQL Editor :

```sql
update public.users set role='admin' where id='UUID_DU_PROPRIETAIRE';
```

N'ajoute jamais de promotion admin dans l'inscription publique.

## Déploiement Vercel

Voir [`VERCEL_DEPLOY.md`](VERCEL_DEPLOY.md) et [`PRODUCTION_SETUP.md`](PRODUCTION_SETUP.md). La migration 004 doit être appliquée à Supabase avant d'utiliser les espaces non-commerciaux. Ne jamais inclure `.env.local` dans une archive partagée.

## Limites connues

Les paiements réels MTN MoMo, Orange Money et Airtel Money, ainsi que le prélèvement d'abonnement, ne sont pas intégrés : les modes de paiement peuvent être enregistrés, mais aucun transfert opérateur n'est déclenché. La migration 004 n'est pas appliquée à Supabase par ce dépôt. Après application, il reste à tester les parcours avec plusieurs comptes réels et à auditer les règles RLS avant une mise en production large.

`app/page.js` est la route Next.js active. `index.html` est un formulaire autonome ancien de secours, non utilisé comme route par Next.js.
