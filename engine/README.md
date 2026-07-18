## Headless slicer runtime

Ce dossier prepare un moteur de slicing autonome pour `Swapmod Local`, sans embarquer
l'application Bambu Studio complete.

### Objectif

Le runtime headless garde uniquement :

- le binaire de slicing
- le squelette `BambuStudioHeadless.app` strictement necessaire
- les profils, imprimantes et ressources utilises par le slicer
- aucun asset web lourd
- aucune ressource reseau optionnelle

### Layout cible

```text
engine/runtime/headless/
  engine.json
  BambuStudioHeadless.app/
    Contents/
      Info.plist
      MacOS/
        BambuStudio
      Resources/
        cert/
        data/
        fonts/
        flush/
        info/
        model/
        printers/
        profiles/
        profiles_template/
        shaders/
        check_access_code.txt
```

### CLI

Le wrapper CLI local est :

- `/Users/laurent/Documents/swapmod/tools/swapmod_slicer.py`

Exemples :

```bash
python3 tools/swapmod_slicer.py status --json
python3 tools/swapmod_slicer.py slice \
  --input "/chemin/projet.3mf" \
  --output-dir "/tmp/swapmod-slice" \
  --output-name "projet.gcode.3mf"
```

### Construire un runtime headless

1. Compiler BambuStudio depuis les sources officielles.
2. Packager le resultat avec :

```bash
./tools/package_headless_runtime.sh "/chemin/vers/BambuStudio.app" \
  "/Users/laurent/Documents/swapmod/engine/runtime/headless"
```

3. Ou utiliser le script guide :

```bash
./tools/build_headless_engine.sh
```

### Remarque importante

Le wrapper et le packager sont prets maintenant. Le build source complet depend toujours
des sources et des dependances amont BambuStudio.
