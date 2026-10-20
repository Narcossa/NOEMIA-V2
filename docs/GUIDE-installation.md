# Mise en service de NOÉMIA

Ces étapes demandent tes comptes : c'est toi qui les fais, une seule fois. Compte environ 1 h en tout.
Ne colle jamais de clé ni de mot de passe dans une conversation : tu les mets uniquement dans le fichier `.env` du VPS (étape 3).

---

## 1. Clé Anthropic (le cerveau)

1. Sur https://console.anthropic.com › **API Keys**, **révoque** l'ancienne clé, celle qui a été partagée dans la conversation.
2. Clique sur **Create Key**, nomme-la `noemia-vps` et copie-la dans un endroit sûr (gestionnaire de mots de passe).
3. Dans **Billing**, ajoute un petit crédit, par exemple 5 $. NOÉMIA consomme environ 2 € par mois.

## 2. Google Cloud (projet `noemia-510019`)

### a. Activer les API
Ouvre chaque lien et clique sur **Activer** :
- https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=noemia-510019
- https://console.cloud.google.com/apis/library/tasks.googleapis.com?project=noemia-510019
- https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=noemia-510019
- https://console.cloud.google.com/apis/library/people.googleapis.com?project=noemia-510019

### b. Écran de consentement
https://console.cloud.google.com/auth/overview?project=noemia-510019
1. **Commencer** › Nom de l'application : `NOÉMIA` › E-mail d'assistance : ton adresse.
2. Audience : **Externe**.
3. Coordonnées : ton adresse › Terminer.
4. Dans **Branding** › Domaines autorisés, ajoute `ovh.ca`.
5. Dans **Audience**, clique sur **Publier l'application** pour la passer « En production ».
   - Ne demande **pas** la validation par Google : elle n'est pas nécessaire pour un usage personnel (moins de 100 utilisateurs).
   - Ce passage en production évite que la connexion expire tous les 7 jours.

### c. Identifiants
https://console.cloud.google.com/auth/clients?project=noemia-510019
1. **Créer un client** › Type : **Application Web** › Nom : `NOÉMIA serveur`.
2. URI de redirection autorisés : `https://vps-1d994dff.vps.ovh.ca/auth/google/callback`
3. **Créer** › copie l'**ID client** et le **Code secret du client**.

À la première connexion dans l'appli, Google affichera « Google n'a pas validé cette application ». C'est normal : touche **Paramètres avancés › Accéder à NOÉMIA**, puis coche toutes les autorisations.

## 3. Serveur sur le VPS

Depuis ton PC (PowerShell) :

```bash
ssh ubuntu@51.222.37.8
```

Puis sur le VPS :

```bash
git clone https://github.com/Narcossa/NOEMIA-V2.git && cd NOEMIA-V2 && sudo bash deploy/install.sh
```

Complète le fichier de configuration :

```bash
sudo nano /opt/noemia/server/.env
```

Remplis `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `ANTHROPIC_API_KEY`, puis enregistre (Ctrl+O, Entrée, Ctrl+X). Ensuite :

```bash
sudo systemctl restart noemia && curl https://vps-1d994dff.vps.ovh.ca/health
```

La réponse attendue est `{"ok":true}`. Si le pare-feu OVH est actif, ouvre les ports 80 et 443 dans l'espace client OVH.

Mises à jour ultérieures :

```bash
cd ~/NOEMIA-V2 && git pull && sudo bash deploy/install.sh
```

## 4. Installer l'appli sur l'iPhone (le tien, puis celui de Bastien)

1. **SideStore** : suis le guide officiel https://docs.sidestore.io (installation initiale avec le PC, une seule fois par iPhone). Chaque personne utilise **son propre identifiant Apple**.
2. Sur l'iPhone, ouvre https://github.com/Narcossa/NOEMIA-V2/releases et télécharge `NOEMIA-0.1.0.ipa`.
3. Dans SideStore, va dans **Mes applis › +** et choisis le fichier `.ipa`.
4. Dans Réglages › Général › VPN et gestion de l'appareil, fais confiance au certificat si iOS le demande.
5. Il faut renouveler l'appli tous les 7 jours : SideStore le fait tout seul en arrière-plan. Sinon, ouvre SideStore et touche **Actualiser**.

Voix : Réglages › Accessibilité › Contenu énoncé › Voix › Français › télécharge **Aurélie** ou **Marie** en version « Améliorée ». Choisis-la ensuite dans le profil de NOÉMIA.

## 5. Raccourcis (alarme, minuteur, silencieux)

Dans l'app **Raccourcis**, crée ces trois raccourcis avec exactement ces noms. Chacun reçoit du texte en entrée.

| Nom | Actions |
|---|---|
| `NOEMIA Alarme` | « Diviser le texte » (séparateur `\|`) › « Créer une alarme » à l'heure du 1er élément, libellé = 2e élément |
| `NOEMIA Minuteur` | « Démarrer le minuteur » de *Entrée du raccourci* minutes |
| `NOEMIA Concentration` | « Si » l'entrée contient `activer` › « Activer Ne pas déranger » ; Sinon › « Désactiver Ne pas déranger » |
