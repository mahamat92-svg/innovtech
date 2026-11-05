# Installation multi-sectorielle INNOVTECH

## Migration à exécuter

Les migrations `0002` (commerce), `0003` (remboursements) sont déjà exécutées sur le projet selon la confirmation reçue. Le nouveau schéma multi-sectoriel exige **une migration supplémentaire** :

`supabase/migrations/202611040004_multi_sector.sql`

Dans Supabase, ouvre **SQL Editor → New query**, colle ce fichier et exécute-le. Elle ajoute le champ `secteur` au profil, la création de profil depuis les métadonnées Auth et la table `activites_sectorielles` avec ses politiques RLS. La clé publishable seule ne permet pas d'appliquer le SQL à distance.

## Secteurs inclus dans la première version

- Commerce
- École
- Clinique
- Restaurant
- Transport
- Agriculture
- ONG / association

À l'inscription, le responsable choisit le secteur. Le tableau de bord adapte les libellés et le registre permet de créer et suivre des dossiers, références, contacts, montants FCFA, statuts et notes dans Supabase. Le registre est une base opérationnelle réutilisable, pas encore un logiciel spécialisé complet pour chaque profession.

## Administration

Le premier compte admin doit être promu manuellement depuis SQL Editor. Après l'inscription du propriétaire, copie son UUID dans **Authentication → Users** puis lance :

```sql
update public.users set role='admin' where id='UUID_DU_PROPRIETAIRE';
```

Ne jamais mettre une option publique pour créer un admin.

## Tests à effectuer après migration

1. Inscrire une organisation de chaque secteur de test.
2. Ajouter un dossier dans chaque espace et vérifier qu'il réapparaît après reconnexion.
3. Tester avec deux organisations distinctes que les règles RLS empêchent la lecture croisée.
4. Tester le commerce existant : produit, vente à crédit, facture et remboursement partiel.
5. Vérifier la liste des organisations et le filtre par secteur dans l'admin.

Les variables pour le déploiement restent `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`; voir `VERCEL_DEPLOY.md` pour le déploiement Vercel sans GitHub.
