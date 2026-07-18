## Native slicer engine

Ce dossier lance un vrai moteur maison pour `Swapmod`, sans dependre d'un slicer tiers.

### Portee du premier jalon

Le moteur natif actuel sait :

- lire un mesh depuis `STL`
- lire un `3MF` simple ou a `components`
- calculer un plan de coupe couche par couche
- compter les segments d'intersection par couche
- reconstruire des contours fermes simples
- produire un premier G-code `perimeters-only`

Il ne sait pas encore :

- reconstruire des contours fermes
- generer l'infill
- ajouter les supports
- produire un G-code imprimable complet

### CLI

Le point d'entree est :

- `/Users/laurent/Documents/swapmod/tools/swapmod_native_slicer.py`

Exemples :

```bash
python3 tools/swapmod_native_slicer.py inspect \
  --input /Users/laurent/Documents/swapmod/examples/native-engine/unit_cube_ascii.stl

python3 tools/swapmod_native_slicer.py slice-plan \
  --input /Users/laurent/Documents/swapmod/examples/native-engine/unit_cube_ascii.stl \
  --layer-height 0.2

python3 tools/swapmod_native_slicer.py slice-gcode \
  --input /Users/laurent/Documents/swapmod/examples/native-engine/unit_cube_ascii.stl \
  --output /Users/laurent/Documents/swapmod/out/native-engine/unit-cube.gcode \
  --layer-height 0.2
```

### Intention

L'objectif n'est plus de porter Bambu Studio en plus petit. L'objectif est de construire
un moteur propre, cible, maitrise, oriente `Swapmod` et Bambu A1 / A1 mini.

### Limites du G-code actuel

Le G-code genere aujourd'hui est volontairement minimal :

- perimetres seulement
- pas d'infill
- pas de supports
- pas de gestion AMS
- pas encore de start/end G-code specifiques Bambu
- utile comme preuve de pipeline, pas encore comme remplaçant complet de Bambu Studio
