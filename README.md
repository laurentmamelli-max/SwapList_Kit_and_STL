# Swapmod Local

Version locale inspiree de `swaplist.app`, recentree sur deux piliers:

- `Swapmod KIT` pour produire des fichiers `.swap.3mf`
- `Swapmod STL` pour produire des fichiers `.swaps.3mf`

Le but du projet est de prendre des projets Bambu/Orca, construire une queue localement, puis exporter un seul fichier final pret a etre reinjecte.

## Les deux piliers

### Swapmod KIT

- mode principal pour les usages `KIT`
- sortie en `.swap.3mf`
- options de queue conservees: repetitions, attente avant swap, dernier plateau, calibration unique

### Swapmod STL

- mode principal pour les usages `STL`
- sortie en `.swaps.3mf`
- option de compatibilite `KIT` conservee quand necessaire

## Ce que fait l'app locale

- importe des fichiers `.gcode.3mf`, `.gcode` et certains projets `.3mf`
- extrait les plates, temps d'impression, apercus et stats filament
- permet de reordonner la queue et regler les repetitions
- exporte un fichier final selon le pilier choisi
- fonctionne localement, sans backend distant
- dans l'app macOS, les `.3mf` bruts peuvent etre prepares automatiquement avant ajout a la queue

## Demarrage rapide

### Version navigateur

```bash
./run_web_app.sh
```

Puis ouvre [http://127.0.0.1:4173](http://127.0.0.1:4173)

### Version macOS

```bash
./build_macos_app.sh
```

Cela cree:

- `dist/Swapmod Local.app`

L'app charge l'interface directement depuis son bundle. Aucun serveur n'est necessaire pour l'utiliser.

### DMG

```bash
./build_dmg.sh
```

Cela cree:

- `dist/Swapmod-Local.dmg`

## Formats

- dans le navigateur: prefere `.gcode.3mf` ou `.gcode`
- dans l'app macOS: tu peux aussi ajouter un `.3mf` brut
- mode `KIT`: export `.swap.3mf`
- mode `STL`: export `.swaps.3mf`

## Fichiers importants

- [web/index.html](/Users/laurent/Documents/swapmod/web/index.html:1) et [web/src/app.js](/Users/laurent/Documents/swapmod/web/src/app.js:1) : interface locale KIT/STL
- [macos/SwapmodApp.m](/Users/laurent/Documents/swapmod/macos/SwapmodApp.m:1) : app macOS embarquee
- [build_macos_app.sh](/Users/laurent/Documents/swapmod/build_macos_app.sh:1) et [build_dmg.sh](/Users/laurent/Documents/swapmod/build_dmg.sh:1) : packaging

## Partie experimentale

La conversion locale des `.3mf` bruts existe pour fluidifier l'import dans l'app macOS, mais ce n'est pas un pilier produit. Les notes techniques restent volontairement separees ici:

- [engine/native/README.md](/Users/laurent/Documents/swapmod/engine/native/README.md:1)

## Limites

- c'est une reimplementation locale inspiree de `swaplist.app`, pas une copie officielle
- les exports doivent etre verifies prudemment avant usage machine reelle
- le flux cible des projets Bambu/Orca au format 3MF zippe

## Archive legacy

Le repo contient encore des traces de l'ancien travail autour de `SwapList` Java et d'outils internes. Elles ne font plus partie du parcours produit principal.
