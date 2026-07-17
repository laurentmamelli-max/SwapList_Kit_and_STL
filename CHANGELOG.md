# Changelog

## 2.1.0

- sequences KIT mises a jour depuis une sortie officielle comparee a son original ;
- profil STL integre avec ses sequences officielles de chargement et d'echange ;
- attente `G4 S0` conservee lorsque le delai est nul, comme dans les sorties de reference ;
- interface et documentation mises a jour pour les deux profils disponibles hors ligne.

## 2.0.0

- recentrage complet sur le flux SwapList : import de `.gcode.3mf` deja tranches ;
- suppression de la dependance au tranchage natif et aux runtimes Bambu embarques ;
- conversion express locale ;
- compteur de swaps et duree incluant les attentes ;
- validation CRC32 et XML des projets importes ;
- preservation des miniatures et des reglages projet ;
- regeneration du MD5, de la duree, du poids et des filaments ;
- correction de l'attente pour qu'elle soit executee avant le mouvement de swap ;
- correction des noms de fichiers et des doubles extensions ;
- profils STL et Compatible importables localement sans connexion ;
- app macOS allegee et documentation francaise.
