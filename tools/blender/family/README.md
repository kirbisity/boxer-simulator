# The family of builds

The base body (src/basebody.js) is one mesh a sex. A fighter's skin is a mix of seven builds of it, the same points in the same
order: `E` emaciated, `N` ordinary, `M` muscular, `F1` to `F3` fat, `F4` the game's fattest body (src/loftbody.js `LOFT.family` places each by its fat and
fat-free mass index; `baseFamilyWeights` mixes them). These scripts make the builds and pack them into src/basebody-data.js.

Python 3 with numpy and scipy; Blender for the three scripts that say so. Nothing here runs in the game or its tests.

## The work directory

The scripts read and write under one work directory, outside the repository (`HACS_FAMILY_WORK`, or the parent of the
directory they run from):

    <work>/emac/      what they read of the game and of the emaciated reference
    <work>/ansur/     MALE.csv, FEMALE.csv: ANSUR II's public tables (the tape measures the fits are solved to)
    <work>/remodel/   what they make; run them from here, with reg/, even/ and shaped/ made in it

## What they read

| File | From |
| --- | --- |
| `emac/base-<sex>.json`, `base-rigged.json`, `ref.json` | `node tools/blender/family/export.mjs <repo> <work>/emac`: the base mesh as modelled, its joints and skin weights |
| `emac/her3d-b-aligned.npz`, `-aligned-male.npz` | Not made by any script in the repository: regE.py reads their `A` (her points) and `T` (her triangles), her sculpt aligned to the base's pose and joints. The nearest step kept is `Blender -b ax_model.blend --python tools/blender/emaciatedbody.py -- <ref.json> <base-female.json> <base-male.json> <out.json> <her-joints.json>` (her-joints.json: her joints placed by eye), which writes her re-posed surface sampled at the base's points as JSON, not the aligned mesh; the step from her sculpt to the `.npz` was a scratch script, lost with the work directory |
| `remodel/body-rest.npz` | `Blender -b skeleton/body.blend --python bodyrest.py -- <work>/emac/base-female.json <work>/remodel/body-rest.npz`: the ordinary reference woman as she stands |

## The order

From `<work>/remodel`, with `F=<repo>/tools/blender/family`:

    python3 $F/regN.py                       # N0-female: the ordinary woman on the base's points
    python3 $F/regE.py                       # E0-<sex>: the emaciated sculpt on the base's points (the man's chest: malechest.py)
    python3 $F/fit.py male N F1 F2 F3        # N, F1..F3: a layer of tissue solved to ANSUR's tape at each BMI
    python3 $F/fit.py female N F1 F2 F3
    python3 $F/famM.py                       # M: the muscular woman (the man's is the base itself)
    python3 $F/famE.py                       # E: the emaciated man, her tape by the sexes' ratio at the lean end
    python3 $F/register.py                   # reg/: each build's limbs set back on the base's bones
    python3 $F/relax.py                      # even/: each build's points set evenly on its own surface
    python3 $F/girdle.py                     # shaped/: the emaciated build's shoulders held to the girdle's bone, its waist
                                             # drawn in and its arms thinned, the others' top line lowered towards that bone
                                             # (TRAPEZIUS.keep) and their shoulder caps lessened (DELTOID.keep), every neck
                                             # drawn slimmer (NECK.slim, with src/loftbody.js LOFT.neck.slim)
    python3 $F/swell.py                      # shaped/F4: F3 grown as fat grows to a BMI of 100; prints LOFT.family.swell
    python3 $F/composition.py shaped         # each build's [fat, fat-free mass index] as drawn, for LOFT.family: E to
                                             # F3 (F4's are swell.py's printout); `even`: the emaciated build before
                                             # girdle.py, LOFT.boneCover.sculpt
    python3 $F/dump.py family-even.json shaped   # the seven builds and the base (the folder defaults to reg/)
    node <repo>/tools/basebody-family.js family-even.json

`centre2.py` and `borders.py` are register.py's measures (run alone they report each build's miss from the base's bones);
`bodylib.py` and `nricp.py` are the shared helpers.

## The bone relief

The emaciated build's points are 2 to 3 cm apart: her frame and her sunk belly, but no rib. Her ribs, breastbone, collarbones,
spine, shoulder blades and hip bones are baked from the sculpt as heights on the skin map's trunk tile, a sex at a time:

    node <repo>/tools/basebody-trunk.js <sex> map-<sex>.json
    python3 $F/emaciateddetail.py map-<sex>.json even/E-<sex>.npy reg/E-<sex>.npy E0pre-<sex>.npy E0pre-<sex>-sculpt.npz detail-<sex>.json
    node <repo>/tools/basebody-detail.js detail-female.json detail-male.json

## To look at them in Blender

One mesh a sex with a shape key a build (not used by the game; the stature only sizes it):

    Blender -b --python $F/familyblend.py -- family-even.json <work>/emac/base-<sex>.json <sex> <stature m> hacs-family-<sex>.blend

## After tools/basebody-pack.js

That tool writes src/basebody-data.js anew: tools/baseweights-pack.js, tools/basebody-family.js and tools/basebody-detail.js
are then to be run again, in that order.

## Where the files live

Outside the repository (they are binary, and the repository is published as it stands):

| What | Where |
| --- | --- |
| The base meshes | `~/Documents/3d_modeling/blender/assets/Base Male Mesh.blend`, `female..blend` |
| The emaciated reference sculpt ("anabelle.001") | `~/Documents/3d_modeling/blender/ax_fm/ax_model.blend` |
| The ordinary reference woman (bodyrest.py) | `~/Documents/3d_modeling/blender/skeleton/body.blend` |
| The inspection blends | `~/Documents/3d_modeling/blender/hacs_family/hacs-family-<sex>.blend` |

The work directory (`emac/`, `ansur/`, `remodel/`) is not kept anywhere: to run the order again, export `emac/` anew, fetch
ANSUR II's public tables into `ansur/`, and rebuild `remodel/` from the start.

Running the order again also rewrites what composition.py and swell.py print for src/loftbody.js `LOFT.family` (each build's
place and the fattest build's swell). The builds in the game were placed with the figures now in LOFT.family; take the new
figures only when the builds themselves are meant to change, or bodies come out fuller than before.
