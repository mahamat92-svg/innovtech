# Sécurité INNOVTECH — état multi-sectoriel

## Protections dans le code

- Inscription et connexion via Supabase Auth; le profil et le rôle sont relus depuis la base.
- Les données métier ne sont pas enregistrées en localStorage. Le navigateur conserve seulement le jeton de session Supabase dans `sessionStorage`.
- La migration `0002` protège les tables commerce et ventes par RLS; les migrations `0003` et `0004` ajoutent les remboursements et le registre sectoriel protégé par organisation.
- Les ventes et remboursements passent par des fonctions SQL transactionnelles.
- La clé `sb_publishable` est une clé client publique. Ne jamais exposer une clé `service_role` dans l'interface.

## Activation de la migration multi-sectorielle

Les migrations `0002` et `0003` existent déjà sur le projet Supabase d'INNOVTECH selon les informations reçues. Le nouveau choix de secteurs et la table `activites_sectorielles` nécessitent d'exécuter `supabase/migrations/202611040004_multi_sector.sql` dans SQL Editor. Jusqu'à cette étape, le code peut compiler mais les nouveaux profils/écrans sectoriels ne pourront pas utiliser leur colonne/table.

Après migration, tester les accès avec deux organisations et deux secteurs, en s'assurant qu'aucune ne peut lire les dossiers de l'autre.

## Limites

Les espaces sectoriels actuels offrent un registre commun de dossiers, contacts, statuts et montants FCFA avec des libellés adaptés à sept secteurs. Ce n'est pas encore un logiciel spécialisé complet : par exemple, gestion des emplois du temps/examens scolaires et dossiers médicaux complets ne sont pas encore implémentés.

Les transferts Mobile Money et le prélèvement d'abonnement ne sont pas intégrés. Le code n'a pas fait l'objet d'un audit indépendant ni de tests d'intrusion.
