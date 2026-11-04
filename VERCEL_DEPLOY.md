# Déployer INNOVTECH sur Vercel depuis un ZIP Arena (sans GitHub)

Le ZIP contient un projet **Next.js** complet. La méthode la plus fiable sans GitHub est de télécharger le ZIP, le décompresser sur ton ordinateur et déployer le dossier avec **Vercel CLI**.

## Étape 1 — Télécharger et décompresser

1. Télécharge `INNOVTECH-Nextjs-Vercel.zip` depuis Arena.
2. Décompresse-le dans un dossier, par exemple `INNOVTECH`.
3. Vérifie que le dossier contient `package.json`, `package-lock.json`, `app/`, `lib/`, `vercel.json` et `supabase/`.
4. N'envoie pas `.env.local` : ce fichier local n'est volontairement pas inclus. Les clés publishable sont déjà configurées comme valeurs par défaut côté client et tu peux aussi les ajouter comme variables Vercel aux étapes suivantes.

## Étape 2 — Installer les outils

1. Installe Node.js **20.9 ou plus récent**.
2. Ouvre un terminal dans le dossier `INNOVTECH`.
3. Installe les dépendances :

   ```bash
   npm install
   ```

4. Vérifie le build local :

   ```bash
   npm run build
   ```

## Étape 3 — Se connecter à Vercel sans GitHub

1. Dans le même terminal, lance :

   ```bash
   npx vercel login
   ```

2. Choisis la méthode de connexion proposée (e-mail ou autre méthode disponible) et termine l'authentification dans ton navigateur.
3. Reviens au terminal, toujours dans le dossier du projet, puis lance :

   ```bash
   npx vercel
   ```

4. Réponds aux questions : crée un nouveau projet, donne-lui le nom `innovtech`, choisis ton compte Vercel et garde la racine du projet comme dossier source (`./`). Vercel détecte Next.js automatiquement; accepte les réglages par défaut.

## Étape 4 — Ajouter les variables Supabase dans Vercel

Dans Vercel, ouvre le projet `innovtech` → **Settings → Environment Variables**, puis ajoute ces variables pour **Production**, **Preview** et **Development** :

- Nom : `NEXT_PUBLIC_SUPABASE_URL`  
  Valeur : `https://ukharykzvrppezxjgqrj.supabase.co`
- Nom : `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
  Valeur : `sb_publishable_AkHCBOsMwOAWkExu_OQtmw_N77lmmwv`

La clé `sb_publishable` est prévue pour être utilisée dans une application cliente. Ne mets jamais une clé `service_role` dans le navigateur ou dans une variable `NEXT_PUBLIC_*`.

## Étape 5 — Déployer en production

Après avoir ajouté les variables, retourne dans le terminal du projet et lance :

```bash
npx vercel --prod
```

Vercel construit l'application avec `npm run build`; aucun dossier de sortie personnalisé n'est nécessaire. Le domaine de production s'affiche dans le terminal et dans le tableau de bord Vercel.

## Étape 6 — Autoriser le domaine dans Supabase Auth

1. Dans Supabase, ouvre **Authentication → URL Configuration**.
2. Mets le domaine Vercel reçu comme **Site URL**.
3. Ajoute ce domaine aux **Redirect URLs** autorisées.
4. Teste l'inscription. Si la confirmation d'e-mail est activée, confirme l'adresse avant de te connecter.

Les tables et fonctions SQL doivent déjà être installées dans Supabase : exécute `202611040002_live_saas.sql`, puis `202611040003_credit_repayments.sql`. Le fichier `202611040001_innovtech_core.sql` est une ancienne base de travail et n'est pas requis par cette version de l'application.
