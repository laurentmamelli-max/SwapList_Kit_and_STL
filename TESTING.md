# Plan de test

## Verification rapide

1. Lancer `./run_web_app.sh`.
2. Importer les deux fichiers de `examples/`.
3. Verifier les miniatures, les durees et le filament.
4. Mettre la premiere plate a 2 repetitions et la seconde a 1.
5. Regler `Loop repeats` a 2 : le compteur doit afficher 6 plates.
6. Regler 2 minutes d'attente et activer la calibration unique.
7. Generer le fichier KIT.
8. Ouvrir le resultat dans Bambu Studio ou Orca Slicer.

## Points controles automatiquement pendant le developpement

- lecture ZIP avec verification CRC32 ;
- presence de `model_settings.config`, `slice_info.config` et du G-code ;
- fusion de deux sources ;
- MD5 du G-code exporte ;
- miniature `Metadata/plate_1.png` conservee ;
- attente `G4` placee avant le mouvement de swap ;
- un seul mouvement de swap pour deux plates avec « ne pas swap le dernier » ;
- commandes `M970` commentees apres la premiere plate ;
- metadonnees de duree et de poids mises a jour.

## Test machine obligatoire

Faire le premier essai sous surveillance avec deux plates de test, sans pieces fragiles,
avant d'utiliser une longue file. Arreter immediatement en cas de collision, de plateau
mal engage ou de comportement AMS inattendu.
