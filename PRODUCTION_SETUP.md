# Installation Supabase et Vercel pour INNOVTECH

## 1. Appliquer le schéma dans Supabase

Le projet utilise d'abord `supabase/migrations/202611040002_live_saas.sql`, puis `supabase/migrations/202611040003_credit_repayments.sql` pour les remboursements partiels de crédits. Dans Supabase, ouvre **SQL Editor → New query**, colle et exécute chaque fichier dans cet ordre. La clé publishable ne peut pas créer les tables à distance : cette étape doit être faite depuis le tableau de bord Supabase (ou par Supabase CLI avec un accès de développement).

Les migrations créent `users`, `produits`, `clients`, `ventes`, `vente_lignes`, `factures`, `abonnements` et `remboursements_credit`; les politiques RLS limitent les lignes des commerçants à leur propre compte. La migration crée aussi automatiquement un profil lors d'un signup, et une fonction transactionnelle de vente qui vérifie le stock, diminue les quantités et crée une facture.

## 2. Créer le propriétaire admin

1. D'abord, inscris le compte propriétaire dans l'application après avoir appliqué le schéma.
2. Ouvre **Authentication → Users**, copie l'UUID de ce compte.
3. Dans SQL Editor, lance :

```sql
update public.users set role='admin' where id='UUID_DU_PROPRIETAIRE';
```

Ne crée pas d'inscription admin publique. L'interface lit le rôle depuis la table `users`; les actions de blocage passent par la fonction `innovtech_admin_set_block` qui vérifie ce rôle.

## 3. Paramétrer Auth

Dans Supabase **Authentication → URL Configuration**, définis l'URL de production Vercel comme Site URL, puis ajoute `http://localhost:3000/**` et tes domaines Vercel aux Redirect URLs. Si la confirmation e-mail est activée, le commerçant doit confirmer son adresse avant de se connecter.

## 4. Configurer Vercel

Le dépôt contient `package.json` (Next.js). Importe-le dans Vercel et ajoute ces variables dans **Settings → Environment Variables** pour Preview et Production :

- `NEXT_PUBLIC_SUPABASE_URL` = l'URL du projet fournie
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clé publishable `sb_publishable_...` fournie

Le `.env.local` local est configuré; il est ignoré par Git. Le build Vercel est `npm run build`. Après ajout ou changement de variable, redéploie.

La clé publishable est conçue pour être publique et ne contourne pas les règles RLS. **Ne mets jamais la clé `service_role` ou des secrets Mobile Money dans une variable NEXT_PUBLIC, le code client ou Git.**

## 5. Vérification avant lancement

Crée deux comptes commerçants séparés. Vérifie qu'ils ne peuvent pas consulter les produits, clients, ventes ou factures de l'autre compte. Vérifie aussi l'inscription, confirmation e-mail, connexion, ajout produit, vente, décrément du stock, facture et blocage admin. Les paiements Mobile Money et les encaissements d'abonnement ne sont pas intégrés dans cette livraison; ils demandent un agrégateur, des identifiants marchands et une validation webhook côté serveur.

## État de cette livraison

L'application Next.js est écrite pour lire/écrire les tables Supabase et utilise la clé publishable fournie dans l'environnement local. Cependant, je ne peux pas appliquer la migration au projet distant avec cette clé publique. Jusqu'à ce que le SQL soit exécuté et que les variables soient enregistrées dans Vercel, Auth et les requêtes de base ne seront pas actives. Une fois ces étapes effectuées, l'inscription, connexion, produits, ventes/factures et tableau admin peuvent fonctionner avec les données Supabase.
