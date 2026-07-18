# SwapList Local pour Swapmod

Application locale et hors ligne pour construire une file d'impression Swapmod a
partir de projets deja tranches par Bambu Studio ou Orca Slicer.

Cette reimplementation ne charge pas `swaplist.app`, n'envoie aucun fichier sur
Internet et ne contient pas de moteur de tranchage. Elle travaille directement dans
le navigateur ou dans une app macOS native legere.

## Fonctions

- import simultane de plusieurs fichiers `.gcode.3mf` ;
- extraction de toutes les plates declarees dans `Metadata/model_settings.config` ;
- miniatures, durees et consommation de filament par slot ;
- ordre de la file, activation/desactivation, suppression et repetitions par plate ;
- repetitions de la file complete ;
- nom de sortie personnalisable sans double extension ;
- attente en minutes avant chaque swap ;
- option pour conserver le dernier plateau ;
- calibration de vibration `M970` uniquement sur la premiere plate ;
- suppression des blocs AMS redondants ;
- conversion express sans modifier la file principale ;
- conservation de la miniature, des reglages projet et des metadonnees 3MF ;
- regeneration du MD5 du G-code ;
- sortie KIT `.swap.3mf` ;
- profils KIT `.swap.3mf` et STL `.swaps.3mf` integres ;
- moteur de profil local pour l'edition Compatible.

## Important concernant les profils

Les profils de mouvement KIT et STL sont inclus. Leurs sequences ont ete verifiees par
comparaison avec des sorties SwapList et les fichiers `.gcode.3mf` originaux. L'edition
Compatible utilise une troisieme sequence : elle peut etre ajoutee par un fichier JSON
local, sans jamais le transmettre.

Un modele se trouve dans `profiles/profile-template.json`.

```json
{
  "profiles": {
    "compatibility": {
      "starterGcode": "...",
      "swapTailGcode": "..."
    }
  }
}
```

## Utilisation locale dans le navigateur

Double-cliquer sur `Launch Swapmod Local.command`, ou lancer :

```bash
./run_web_app.sh
```

Puis ouvrir `http://127.0.0.1:4173`. Le serveur ecoute uniquement sur la machine
locale. `Stop Swapmod Local.command` l'arrete.

## Construire l'app macOS

Sur macOS 13 ou plus recent, avec les outils de developpement Apple installes :

```bash
./build_macos_app.sh
```

La sortie est `dist/Swapmod Local.app`. Elle embarque uniquement l'interface et un
petit serveur local ; ni Bambu Studio ni un runtime de slicer ne sont copies dans le
bundle.

Pour creer un DMG :

```bash
./build_dmg.sh
```

## Flux recommande

1. Ouvrir le projet dans Bambu Studio ou Orca Slicer.
2. Trancher toutes les plates souhaitees.
3. Exporter les fichiers `.gcode.3mf`.
4. Les deposer dans SwapList Local.
5. Regler l'ordre, les repetitions et les options.
6. Generer le fichier `.swap.3mf` ou `.swaps.3mf`.
7. Ouvrir le resultat dans Bambu Studio et le controler avant la premiere impression.

## Prudence

Les mouvements de changement de plateau sont mecaniques. Toujours verifier le profil,
le montage Swapmod, le degagement de la machine et le G-code produit avant un premier
cycle reel. La validation logicielle ne remplace pas un test surveille sur l'imprimante.

## Verification

Consulter `TESTING.md`. Les exemples fournis servent a verifier l'import, la fusion,
le MD5, les metadonnees, l'attente, le dernier plateau et la calibration unique.
