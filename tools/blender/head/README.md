# The head model

A photo face is drawn on a head model, not on the drawn head: a lattice of points laid out on the photo atlas, one a sex, moved
to each group of faces' measures (src/headlattice.js builds the head from src/headgrid-data.js). These scripts make that data
and the model's relief map from the base meshes' heads. Nothing here runs in the game; test/headlattice.test.js checks what
they make.

Blender for cast.py; Python 3 with numpy, scipy and Pillow for grid.py; Node for tools/headbases.mjs.

## The sources

The heads of the two base meshes, outside the repository:

| Sex | File |
| --- | --- |
| male | `~/Documents/3d_modeling/blender/assets/Base Male Mesh.blend` |
| female | `~/Documents/3d_modeling/blender/assets/female..blend` |

frame.py takes the file's largest mesh (or a named object), applies its modifiers, cuts it at the neck and puts it in the game's
head frame, as tools/blender/headfrombase.py does for the drawn head's model.

## The order

From a work directory outside the repository, with `H=<repo>/tools/blender/head`:

    Blender -b "<male .blend>" --python $H/cast.py -- - <levels> cast-male.npz
    Blender -b "<female .blend>" --python $H/cast.py -- - <levels> cast-female.npz
    python3 $H/grid.py male          # grid-male.json, grid-male.npz, model-male-normal.png
    python3 $H/grid.py female
    node <repo>/tools/headbases.mjs grid-male.json grid-female.json      # writes src/headgrid-data.js
    node --test <repo>/test/headlattice.test.js

- `cast.py`: the head cast along rays from its centre on an even lattice (720 by 1440): its outer surface, its smooth normal
  and its first surface from inside, every opening but the neck's and the eyes' closed. `<levels>` is the subdivision kept;
  frame.py's default (`-` for the object, then the levels) is none on a dense mesh (over 8000 points) and one on a light one.
  Which levels the data in the repository was cast at is not recorded (assumed: the default).
- `grid.py`: the cast head laid out on the photo atlas as a lattice (closer over the face), its landmarks at the atlas's places
  (`MODEL` in grid.py: the eye, nose foot, mouth and chin rows are src/photoface.js PHOTO_ATLAS's), the hair's ground table,
  and the relief normal map baked over the lattice (`GRID.relief`). It reads `cast-<sex>.npz` in the directory it runs from.
  The landmark figures in `MODEL` were read off each head's unwrapped picture with session tools (unwrap.py, zoom.py) that
  are not kept in the repository.
- `tools/headbases.mjs`: each group of faces (src/faceregions.js HEAD_BASE_GROUPS) from the sex's grid: the group's unmeasured
  tendencies, then its landmarks to its published measures. Writes src/headgrid-data.js (generated: do not edit by hand).
- The relief map goes in as `assets/faces/relief-<sex>.png` (src/photoface.js reads that name); grid.py writes it as
  `model-<sex>-normal.png`.

## Inspection blends

None is kept for the heads. The body family's are in `~/Documents/3d_modeling/blender/hacs_family/`
(tools/blender/family/README.md).
