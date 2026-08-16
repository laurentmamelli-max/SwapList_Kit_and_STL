## Notes internes - conversion locale 3MF

Cette partie ne fait pas partie des deux piliers produit `Swapmod KIT` et `Swapmod STL`.
Elle sert uniquement de support technique pour fluidifier l'import local dans l'app macOS.

En pratique:

- un `.3mf` brut peut etre prepare localement avant ajout a la queue
- le point d'entree reste `/Users/laurent/Documents/swapmod/tools/swapmod_native_slicer.py`
- ce flux doit etre considere comme interne et evolutif

### Ce que le pipeline sait deja faire

- lire des meshes `STL`
- lire certains `3MF`, y compris avec `components`
- calculer un plan de coupe simple
- reconstruire des contours fermes simples
- generer plusieurs perimetres
- generer un infill rectiligne simple
- sortir un premier G-code exploitable pour la conversion locale

### Ce que cette partie n'est pas

- ce n'est pas un pilier produit
- ce n'est pas encore un remplaçant complet de Bambu Studio
- ce n'est pas l'axe principal de distribution du repo

### Exemples internes

```bash
python3 tools/swapmod_native_slicer.py inspect \
  --input /Users/laurent/Documents/swapmod/examples/native-engine/unit_cube_ascii.stl

python3 tools/swapmod_native_slicer.py slice-gcode \
  --input /Users/laurent/Documents/swapmod/examples/native-engine/unit_cube_ascii.stl \
  --output /Users/laurent/Documents/swapmod/out/native-engine/unit-cube.gcode \
  --layer-height 0.2
```
