# NOÉMIA

Compagnon vocal de gestion du quotidien (perso et pro) pour Mathis et sa famille : un humanoïde animé qui écoute, comprend et agit sur l'iPhone et les outils Google.

- Dossier de conception : [docs/dossier-conception.html](docs/dossier-conception.html)
- Formule retenue : **Éco** (≈ 10 €/mois). Cerveau Claude Haiku 5.5, voix et écoute natives iOS, avatar calculé sur l'appareil, serveur sur le VPS OVH.

## Étape 0 : prototype « elle est vivante » (en cours)

Le dossier [avatar/](avatar/) contient le moteur d'animation de NOÉMIA. Il est écrit en JavaScript et WebGL, sans dépendance, et sera réutilisé tel quel dans l'application iPhone.

| Fichier | Rôle |
|---|---|
| `avatar/src/rig.js` | Repères du visage sur la photo (yeux, bouche, sourcils, halo de l'oreille) |
| `avatar/src/renderer.js` | Rendu WebGL : déforme la photo en temps réel (respiration, tête, paupières, regard, bouche, émotions, lumières) |
| `avatar/src/life.js` | Moteur de vie : clignements, saccades du regard, micro-mouvements, émotions, états du halo |
| `avatar/src/lipsync-fr.js` | Découpe un mot français en formes de bouche |
| `avatar/src/voice.js` | Synthèse vocale de l'appareil + pilotage des lèvres mot par mot |
| `avatar/src/main.js` | Page de démonstration et « Labo » de réglage |

### Lancer en local

```bash
python -m http.server 5173 --directory avatar
```

Puis ouvrir http://localhost:5173. Pour tester sur l'iPhone sur le même Wi-Fi : `http://<IP-du-PC>:5173`. Le micro, lui, demande une adresse HTTPS : il ne fonctionnera pas sur cette adresse depuis l'iPhone.

### Choix technique : animation 2,5D de la photo

NOÉMIA est animée directement à partir de sa photo. Le rendu WebGL déforme l'image en temps réel. La ressemblance est donc parfaite, le rendu est fluide et rien n'est payé à l'usage. Limite : la tête ne peut tourner que de quelques degrés. Si l'on veut plus tard qu'elle tourne franchement la tête, il faudra un vrai modèle 3D riggé.
