# INNOVTECH — Next.js + Supabase

Application Next.js prête pour Vercel, avec authentification Supabase, profils commerçants, création de produits et ventes persistées en base, factures automatiques et interface admin protégée par rôle.

## Démarrage local

1. Node.js 20.9 ou plus récent.
2. `npm install`
3. Copier `.env.example` en `.env.local` (un `.env.local` local est déjà préparé avec l'URL et la clé publishable fournies).
4. Exécuter la migration `supabase/migrations/202611040002_live_saas.sql` dans le SQL Editor de Supabase.
5. `npm run dev` puis ouvrir `http://localhost:3000`.

## Base Supabase

Les migrations `supabase/migrations/202611040002_live_saas.sql` et `supabase/migrations/202611040003_credit_repayments.sql` créent `users`, `produits`, `clients`, `ventes`, `vente_lignes`, `factures`, `abonnements` et `remboursements_credit`, le profil d'inscription automatique, les règles RLS, la fonction atomique de vente, l'encaissement partiel de crédit et le blocage admin. La vente calcule le total côté base, contrôle le stock, met à jour le crédit et crée la facture dans une transaction.

Après avoir créé ton premier compte dans l'application, récupère son UUID dans **Supabase → Authentication → Users**, puis exécute une seule fois dans le SQL Editor :

```sql
update public.users set role='admin' where id='UUID_DU_PROPRIETAIRE';
```

N'ajoute jamais de moyen public pour promouvoir un compte en admin.

## Déploiement Vercel

Voir [`VERCEL_DEPLOY.md`](VERCEL_DEPLOY.md) pour les étapes détaillées sans GitHub : télécharger le ZIP, décompresser, installer les dépendances et déployer avec Vercel CLI. Vercel détecte Next.js et lance `npm run build` automatiquement.

La clé `sb_publishable` est faite pour le client. Aucune clé `service_role` n'est utilisée ou exposée. Les règles RLS sont la frontière de sécurité pour les données.

## Fonctions connectées

- Inscription e-mail/mot de passe, profil et boutique créés automatiquement.
- Connexion et déconnexion par Supabase Auth.
- Ajout et lecture des produits et clients persistés.
- Nouvelle vente persistée par RPC transactionnelle, décrément de stock et facture générée.
- Tableau admin listant les vrais profils et abonnements; aperçu des produits/ventes/factures, blocage/déblocage via RPC.

## Limites à connaître

Les confirmations d'e-mail dépendent des réglages Supabase Auth. L'abonnement n'est pas encore encaissé par Mobile Money : le montant d'abonnement affiché provient des données de formule, pas d'un journal de paiement confirmé. Les paiements opérateurs, export PDF, multi-utilisateur par boutique et fonctionnement hors-ligne restent à connecter. L'application active est l'application Next.js dans `app/page.js`; `index.html` est un raccourci neutre vers cette application, sans données de démonstration.
