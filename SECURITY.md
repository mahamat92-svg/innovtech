# Sécurité INNOVTECH — état actuel

## Protections ajoutées dans le projet Next.js

- Authentification e-mail/mot de passe via Supabase Auth.
- Profil et rôle relus depuis Supabase après connexion; le rôle admin n'est pas accepté depuis le navigateur.
- Les règles RLS du fichier `supabase/migrations/202611040002_live_saas.sql` séparent les lignes par utilisateur.
- La création d'une vente passe par une fonction SQL transactionnelle qui recalcule le total à partir des prix en base, vérifie le stock, crée les lignes/factures et inscrit le crédit.
- Le blocage admin est effectué par RPC avec vérification du rôle côté base.
- `vercel.json` définit une CSP limitée au site et au projet Supabase, HSTS, `nosniff`, une politique de référent et permissions réduites.
- La clé utilisée est la clé publishable `sb_publishable_...`. Aucune clé `service_role` n'est présente dans le client.

## Activation encore requise

Le code et la migration sont préparés, mais le schéma n'est pas appliqué au projet distant. La clé publishable permet les requêtes clientes autorisées par RLS; elle ne donne pas le privilège de créer des tables. Il faut exécuter le SQL dans Supabase **SQL Editor**, puis enregistrer `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans Vercel et redéployer. Avant ces étapes, Auth/signup et les opérations de base de données ne sont pas utilisables de bout en bout.

Après création du premier compte propriétaire, promouvoir son UUID depuis le SQL Editor avec la requête du README. Tester au minimum deux comptes marchands différents et vérifier qu'ils ne voient pas les données l'un de l'autre.

## Limites de sécurité/fonctionnalité

- Les paiements réels Mobile Money et le prélèvement d'abonnement ne sont pas intégrés. L'admin affiche le statut de formule enregistré, pas des paiements encaissés.
- Cette version n'a pas été soumise à un audit indépendant ni à des tests d'intrusion.
- Ne jamais placer un secret fournisseur ou la clé Supabase `service_role` dans une variable `NEXT_PUBLIC_*`, dans l'interface ou dans Git.
- L'ancien prototype statique a été supprimé. `index.html` est un raccourci sans données; l'application active est servie par `app/page.js`.
