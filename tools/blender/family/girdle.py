# The emaciated build's shoulders: the girdle's bone under the skin. On her sculpt the shoulders are shrugged and turned (a hand
# on the hip), so regE.py's shoulders are mostly the base's own, thinned: a round tube from the neck to the arm, its top the
# muscular model's trapezius. A wasted trapezius and deltoid leave the skin on the bone: the top of the shoulder a gently
# sloping line at the collarbone's height from the neck's root to the acromion, a corner there, and the arm leaving straight
# from under the corner along its own bone.
# So the build is held inside the bone's outline, drawn in the plane across the body at each shoulder: the neck's side, the
# collar line, the acromion's corner and the arm's line; lower fore and aft of the bone's ridge. A point outside it is brought
# onto it (down under the collar line, round the corner's knee, in towards the bone on the arm); one inside is left alone.
# Fore and aft the shoulder is as deep as the humerus' head under its skin and no deeper, and the collarbone is a bone of the
# girdle like the acromion: the skin hangs between it and the trapezius' border behind (the hollow over the collarbone), so
# the bone stands as its rim.
# The other builds keep their cover over the bone, and less of the trapezius over it (TRAPEZIUS, top_line).
# Reads even/<build>-<sex>.npy, writes shaped/: dump.py's last argument.
import os, shutil, numpy as np, bodylib as bl, relax

GIRDLE = dict(
    # The acromion's top over the shoulder joint's centre (units of stature). The game's skeleton carries the joint at 0.775
    # and ANSUR II's acromion stands at 0.820 on the fed (both sexes): 0.045 between them, less what the fed have over the bone
    # there (the deltoid's origin and the fat on it: 15 mm, 0.009). A bone does not sink as its cover wastes.
    rise=0.036,
    # The acromion's edge out past the joint's centre: the head's centre lies 10 to 15 mm inside the acromion's lateral edge.
    reach=0.008,
    # The line's rise from the acromion to the neck's root, per unit across: the collarbone lies nearly level (its inner end's
    # top 0.822 of stature, `notch`, the acromion 0.811, 0.09 across from it), what is left of the trapezius lying on it: the
    # shoulders of the wasted are square, a hanger's bar, where the fed slope from the neck.
    slope=0.10,
    # The neck's side: an upright wall `root` of the shoulder joint's distance from the middle (a wasted neck is a column from
    # the jaw to its root, the trapezius' upper fibres no cone about it). Her sculpt's neck is 83 to 90 mm across under the
    # jaw and 27 cm round, and the build's is drawn a little under it. The walls stand 84 mm apart on her and 95 on the man;
    # the knee, held on each pass, leaves the skin 5 to 6 mm inside each: 73 mm across on her, 83 on him (ANSUR II's leanest
    # twentieth of necks are 302 mm round on women and 360 mm on men: 1.19 to one, as 83 to 73 is 1.14).
    root=0.26,
    # The knee the skin turns over the bone with (a soft minimum's width under the line; the corner's radius): 3 mm of skin and
    # tendon under the line, 6 mm round the acromion's edge.
    knee=0.0018, corner=0.0035,
    # Beside the neck the angle between it and the shoulder is filled (what is left of the trapezius' upper fibres and the
    # levator under the skin: a web, not a crease): the wall and the line meet in a round of `web` (a soft minimum of the two:
    # 7 mm, half the 12 to 15 mm between the mesh's points there; a sharper turn would leave them as teeth round the neck's base).
    web=0.004,
    # Fore and aft of the joint the shoulder is the humerus' head under its cover: the head's radius (24 mm), the cuff's tendons
    # and what is left of the deltoid (5 mm), the skin (3 mm): 32 mm each way. The head is a ball, so the top falls away fore
    # and aft as a ball's does, to stand upright at that depth.
    depth=0.018,
    # ... the ball's share of the top, across from the joint's centre: none where the collarbone and the blade's spine part
    # round the head's inner side (50 mm in), all of it from the acromion's joint with the collarbone (10 mm in).
    ball=(-0.030, -0.006),
    # That depth is the head's and the arm's own (within `about[0]` of the humerus across the body: 35 mm). Farther from the
    # bone in front, under the collarbone's outer half and over the armpit, there is only the wasted pectoral's sheet from
    # the chest to the arm: the skin may stand forward by `sheet` of its distance from the bone more (a straight sheet from
    # the head's front to the chest's, which stands 70 mm before it 70 mm away). Behind, the depth binds only on the arm itself
    # (the blade and its spine lie behind the joint), fading out to `about[1]` from the bone.
    about=(0.020, 0.060), sheet=1.0, back=(-0.012, 0.008),
    # The collarbone: its inner end `sternal` across from the middle (the breastbone's notch for it: 25 mm) and its top
    # `notch` up (ANSUR II's suprasternale, 0.818 of stature in both sexes, and 7 mm of the bone's end standing over it); its
    # outer end `acromial` inside the acromion's edge (the joint between them: 20 mm) and `ahead` of the shoulder joint (it
    # meets the acromion's front: 10 mm). Between them it is an S seen from above: its inner two thirds bowed forward by
    # `bow[0]`, its outer third back by `bow[1]` (15 mm and 10 mm on the bone, less the chord's own turn: 10 and 6 mm).
    sternal=0.014, notch=0.822, acromial=0.011, ahead=0.006, bow=(0.006, 0.0035), joins=2 / 3,
    # The hollow over the collarbone: the skin hangs between the bone and the trapezius' front border, which leaves the neck
    # `border` behind its axis (the neck's side, 20 mm back) and meets the collarbone where its outer third begins (`joins`).
    # It hangs by `sag` of the gap between them (the hollow 15 mm deep where it is 80 mm wide, beside the neck).
    # It opens over `opens` out from the neck's root: the neck's own flank is not hollowed (and the mesh's points stand 12 to
    # 15 mm apart there: a hollow that opened within one of them would be a notch in the neck).
    border=0.012, sag=0.18, opens=0.022,
    # The arm's line binds from the corner down to the deltoid's insertion, half-way down the humerus, and eases out over the
    # stretch before it (shares of the upper arm's length): below it the arm is its own.
    insertion=(0.3, 0.5),
    # The skin is one sheet: once on the bone it evens itself (Taubin's fairing: `fair` rounds of a step in and a step out, so
    # it loses its creases and none of its size), and is then held to the bone's outline again.
    fair=4, step=(0.5, -0.53),
    # ... and `even` rounds of `spread` of the way along the skin to the neighbours' mean, for the points brought in by `heap`
    # or more (half an edge of the mesh: 7 mm), which is what stands them in heaps. Four rounds: the fewest that leave no
    # triangle folded over at the acromion's front (one is, at none; a fold of 73 degrees is left at two).
    even=4, spread=0.5, heap=0.004,
    # Held to the outline a last time, the skin keeps a tooth where the outline's rim crosses a mesh edge askew (the collar's
    # front rim, a third of the way out: a fold of 99 degrees). `last` rounds of the fairing more, not held again, halve it
    # and move no point more than 2.5 mm (0.3 mm on average).
    last=2,
)

def bound(X, V, J, E, spec, hollows):
    # One pass: `X` held inside the bone's outline (and, with `hollows`, the first: the mesh's edges laid along the crease and
    # the skin hung between the bones). Returns it and which moved.
    X = X.copy(); moved = np.zeros(len(V), bool)
    for side, sign in (('l', 1), ('r', -1)):
        s = J[side + 'Shoulder']; e = J[side + 'Elbow']
        z = X[:, 2] * sign; y = X[:, 1].copy(); zs = s[2] * sign
        edge = zs + spec['reach']; root = spec['root'] * zs; r = spec['corner']; k = spec['knee']
        # The shoulder's depth fore and aft of the joint: in front from the head's inner side out, behind on the arm, and down
        # the arm to the deltoid's insertion.
        d3 = np.array([0.0, e[1] - s[1], (e[2] - s[2]) * sign]); L3 = np.linalg.norm(d3)
        ta = ((y - s[1]) * d3[1] + (z - zs) * d3[2]) / (L3 * L3)
        ua = np.clip((ta - spec['insertion'][0]) / (spec['insertion'][1] - spec['insertion'][0]), 0, 1); held = 1 - ua * ua * (3 - 2 * ua)
        ramp = lambda a, b, v: (lambda u: u * u * (3 - 2 * u))(np.clip((v - a) / (b - a), 0, 1))
        depth = spec['depth']; fore = X[:, 0] - s[0]
        # (Only what lies about the bone: the flank and the armpit's folds, farther from it across the body, are not the shoulder's.)
        # (Over the joint the bone is the girdle's, not the arm's: there the distance is the one across, whatever the height.)
        tc = np.clip(ta, 0, 1); up = y - s[1] - tc * d3[1]; off = np.hypot(np.where(tc > 0, up, np.minimum(up, 0)), z - zs - tc * d3[2])
        bone = 1 - ramp(*spec['about'], off)
        allowed = depth + spec['sheet'] * np.clip(off - spec['about'][0], 0, None)
        push = held * np.where(fore > 0, np.clip(fore - allowed, 0, None), ramp(*spec['back'], z - zs) * bone * np.clip(-fore - depth, 0, None))
        X[:, 0] -= np.sign(fore) * push; moved |= push > 1e-5
        # (The ball is the head's: inside it the girdle is as deep as from the collarbone to the blade's spine, and has its own hollow.)
        web = spec['web']
        def lid():
            # The top over each point as it stands: the corner's height (less the ball's fall), and the collar line from it.
            z = X[:, 2] * sign; y = X[:, 1].copy()
            past = np.clip(np.abs(X[:, 0] - s[0]), 0, depth)
            top = s[1] + spec['rise'] - ramp(*spec['ball'], z - zs) * (depth - np.sqrt(depth ** 2 - past ** 2))
            return z, y, top, top + spec['slope'] * (edge - z)
        def outline(z, y, line):
            # How far outside the neck's wall and over the collar line, the two met in the web's round; and the wall's share of it.
            out, up = z - root, y - line
            return -web * np.logaddexp(-out / web, -up / web), 1 / (1 + np.exp(np.clip((out - up) / web, -50, 50)))
        z, y, top, line = lid()
        # Where the skin meets the line is a crease (the collarbone in front, the blade's spine behind), and a crease is clean
        # only along the mesh's own edges: each edge that crosses it gives its nearer end to the crossing, sliding it there
        # along the edge (so along the skin, and by half an edge at most). Once: on the first pass, where the crease is made.
        over = outline(z, y, line)[0]; a, b = E[:, 0], E[:, 1]; inside = (z > 0) & (z < zs + spec['ball'][0])
        cross = np.where(inside[a] & inside[b] & (over[a] * over[b] < 0) & hollows)[0]
        share = np.abs(over[a[cross]]) / (np.abs(over[a[cross]]) + np.abs(over[b[cross]]))
        least = np.full(len(X), 0.5 + 1e-9); toward = np.full(len(X), -1)
        for p, q, f in ((a[cross], b[cross], share), (b[cross], a[cross], 1 - share)):
            for i in np.argsort(-f): 
                if f[i] <= least[p[i]]: least[p[i]] = f[i]; toward[p[i]] = q[i]
        slid = toward >= 0; X[slid] += least[slid, None] * (X[toward[slid]] - X[slid]); moved |= slid
        z, y, top, line = lid()
        # The arm's line through the corner, along the bone (in the plane across: z out, y up), its normal out and up.
        d = np.array([(e[2] - s[2]) * sign, e[1] - s[1]]); L = np.linalg.norm(d); d /= L; n2 = np.array([-d[1], d[0]])
        n1 = np.array([spec['slope'], 1.0]) / np.hypot(spec['slope'], 1.0)
        # The corner's knee: a round of radius r inside both lines; its centre, and the two directions it spans.
        A = np.array([n1, n2]); centre = np.linalg.solve(A, np.array([-r, -r]))          # from the corner (edge, top)
        pz = z - edge; py = y - top
        qz = pz - centre[0]; qy = py - centre[1]
        along1 = qz * n1[1] - qy * n1[0]            # along the collar line, out from the knee's centre
        along2 = qz * d[0] + qy * d[1]              # along the arm's line, down from it
        newz, newy = z.copy(), y.copy()
        # Under the collar line down, inside the neck's wall in (a point of the neck's flank stays at its height, and the
        # column keeps its rings), in the round between them both ways: with the soft knee.
        one = (z > 0) & (along1 <= 0)
        over, wall = outline(z, y, line); lies = 1 - wall
        by = k * np.logaddexp(0, over / k) / (wall * (wall + lies * spec['slope']) + lies * lies)
        newz[one] = (z - by * wall)[one]; newy[one] = (y - by * lies)[one]
        # Round the knee.
        far = np.hypot(qz, qy)
        two = (along1 > 0) & (along2 < 0) & (far > r)
        newz[two] = (edge + centre[0] + qz * r / np.maximum(far, 1e-9))[two]; newy[two] = (top + centre[1] + qy * r / np.maximum(far, 1e-9))[two]
        # On the arm: in to the line, down to the deltoid's insertion.
        out = pz * n2[0] + py * n2[1]
        t = along2 / L; u = np.clip((t - spec['insertion'][0]) / (spec['insertion'][1] - spec['insertion'][0]), 0, 1)
        hold = 1 - u * u * (3 - 2 * u)
        three = (along2 >= 0) & (out > 0) & (hold > 0)
        newz[three] = (z - n2[0] * out * hold)[three]; newy[three] = (y - n2[1] * out * hold)[three]
        X[:, 2] = newz * sign; X[:, 1] = newy
        moved |= (np.abs(newz - z) + np.abs(newy - y) > 1e-5)
        if not hollows: continue
        # The collarbone's top as a line in space, by how far across: from the breastbone (the build's own front there) to the acromion.
        z, y, x = newz, newy.copy(), X[:, 0]
        zi = spec['sternal']; zo = edge - spec['acromial']; yo = s[1] + spec['rise']
        at = (np.abs(V[:, 2] * sign - zi) < 0.008) & (np.abs(V[:, 1] - spec['notch']) < 0.006)
        xi = V[at, 0].max(); xo = s[0] + spec['ahead']
        def collarbone(zz):
            v = np.clip((zz - zi) / (zo - zi), 0, 1); j = spec['joins']
            bow = np.where(v < j, spec['bow'][0] * np.sin(np.pi * v / j), -spec['bow'][1] * np.sin(np.pi * (v - j) / (1 - j)))
            return xi + (xo - xi) * v + bow, spec['notch'] + (yo - spec['notch']) * v
        xc, yc = collarbone(z)
        # The hollow over it: between the trapezius' border and the bone the skin hangs under the chord from one to the other.
        zj = zi + spec['joins'] * (zo - zi); xb0 = J['neck'][0] - spec['border']; xj = collarbone(np.array([zj]))[0][0]
        xb = xb0 + (xj - xb0) * np.clip((z - root) / (zj - root), 0, 1)
        gap = np.clip(xc - xb, 1e-9, None); u = (x - xb) / gap
        chord = line + (np.minimum(yc, line) - line) * np.clip(u, 0, 1)
        hang = spec['sag'] * gap * 4 * np.clip(u, 0, 1) * np.clip(1 - u, 0, 1) * ramp(root, root + spec['opens'], z) * (z < zj)
        four = (hang > 1e-5) & (y > chord - hang - 4 * k)
        y[four] = (-k * np.logaddexp(-y / k, -(chord - hang) / k))[four]
        X[:, 1] = y
        moved |= four
    return X, moved

def girdle(V, J, T, rest, spec=GIRDLE):
    # `rest`: the mesh as modelled (its doubled points along the texture's seams are found there and move as one).
    weld = bl.weld_map(rest); TW = weld[T]; TW = TW[(TW[:, 0] != TW[:, 1]) & (TW[:, 1] != TW[:, 2]) & (TW[:, 0] != TW[:, 2])]
    M = bl.laplacian(len(V), TW); E = bl.edges_of(TW)
    X, moved = bound(V, V, J, E, spec, True)
    # Faired: what was brought in and its neighbours. Spread: what was brought in by `heap` or more, and its neighbours.
    near = np.clip(2 * bl.smooth(moved.astype(float), M, 2, 1.0), 0, 1)
    heaped = np.clip(2 * bl.smooth(np.clip(np.linalg.norm(X - V, axis=1) / spec['heap'], 0, 1), M, 2, 1.0), 0, 1)
    for _ in range(spec['fair']):
        for step in spec['step']: X = bl.smooth(X, M, 1, step, near)[weld]
    X, _ = bound(X, V, J, E, spec, False)
    # Brought in to a wall or under a line, points that stood apart now stand in a heap at its edge. They are spread again
    # along the skin (each toward its neighbours' mean, less what of that leaves the surface) and held to the outline again.
    # (A fold's own points stay on it, as in relax.py: the armpit's, 25 mm apart, where a point slid off cuts the fold's corner.)
    lo, hi = relax.RELAX['fold']; free = heaped * np.clip((hi - relax.sharpest(V, T)) / (hi - lo), 0, 1)
    for _ in range(spec['even']):
        N = bl.normals(X, TW); d = M @ X - X; d -= (d * N).sum(1)[:, None] * N
        X, _ = bound((X + spec['spread'] * free[:, None] * d)[weld], V, J, E, spec, False)
    # (What the outline's last hold left as teeth across the mesh's edges is faired once more, and not held again.)
    for _ in range(spec['last']):
        for step in spec['step']: X = bl.smooth(X, M, 1, step, near)[weld]
    return X[weld]

TRAPEZIUS = dict(
    # The other builds' top line. Their shoulders are the model's own, a boxer's, set at the survey's heights (ANSUR II's
    # acromion: 0.820 of stature), and the game's skeleton carries its shoulder joints lower than the survey's soldiers do: the
    # skin stands 40 to 60 mm over the bone's collar line from the neck to the acromion, the trapezius' upper fibres a slab
    # there and a cone up the neck's flank, and the neck shows short under the jaw. So a build's skin outside its own neck's
    # side and over the bone's collar line (carried on out past the acromion, so the cap's top comes down with it and the
    # deltoid's face below it stays) keeps `keep` of its height over them: 0.65 lowers the top line 13 to 20 mm from beside
    # the neck to the shoulder's middle and 10 at the acromion, which then stands at 0.822 on the ordinary man and 0.823 on
    # the woman (the survey's spread of it is 0.009 of stature, 16 mm), and the neck shows that much longer.
    keep=0.65,
    # The neck's own side: its half-breadth `column` of the way from its joint to the head's (where the fighter's skin is
    # all the game's neck: src/basebody.js BASE_BODY.family.ease.neck), read within `band` of that height; over it nothing moves.
    column=0.6, band=0.006,
    # ... and the drop eases in over `beside` out from it (one edge of the mesh there: 14 mm), so the column's own skin stays.
    beside=0.008,
    # What was brought in is faired as the emaciated build's is (Taubin's, GIRDLE.step): `fair` rounds.
    fair=3,
)

WAIST = dict(
    # The emaciated build's waist. Between the lowest ribs and the hip bones' crests the trunk has no bone but the spine: what
    # stands there is the flank's muscle and the gut, and a wasted body is drawn in there under its ribs' margin. The trunk's
    # sections are drawn in about its middle by `draw` at its narrowest level `between` the crest and the ribs' margin (ANSUR
    # II: the crest 0.60 of stature, the tenth rib 0.64, the chest's lower ribs to 0.70), easing out to nothing `over` above
    # and below it (the crest and the margin themselves are bone and stay).
    between=(0.60, 0.70), over=0.045, draw=0.07,
)

def waist(V, part, own=WAIST):
    y = V[:, 1]; levels = np.arange(own['between'][0], own['between'][1], 0.005)
    at = levels[int(np.argmin([np.ptp(V[part & (np.abs(y - level) < 0.01), 2]) for level in levels]))]
    fore = V[part & (np.abs(y - at) < 0.01), 0]; middle = (fore.max() + fore.min()) / 2
    share = own['draw'] * part * (1 + np.cos(np.pi * np.clip(np.abs(y - at) / own['over'], 0, 1))) / 2
    X = V.copy(); X[:, 0] -= share * (V[:, 0] - middle); X[:, 2] -= share * V[:, 2]
    return X

def top_line(V, J, T, rest, spec=GIRDLE, own=TRAPEZIUS):
    # A build's trapezius lessened: the neck's wall its own, the collar line the bone's.
    weld = bl.weld_map(rest); TW = weld[T]; TW = TW[(TW[:, 0] != TW[:, 1]) & (TW[:, 1] != TW[:, 2]) & (TW[:, 0] != TW[:, 2])]
    M = bl.laplacian(len(V), TW); X = V.copy(); k = spec['knee']
    height = J['neck'][1] + own['column'] * (J['head'][1] - J['neck'][1])
    for side, sign in (('l', 1), ('r', -1)):
        s = J[side + 'Shoulder']; zs = s[2] * sign; edge = zs + spec['reach']; z = V[:, 2] * sign; y = V[:, 1]
        root = z[(np.abs(y - height) < own['band']) & (z < zs / 2)].max()
        out, up = z - root, y - (s[1] + spec['rise'] + spec['slope'] * (edge - z))
        X[:, 1] -= (1 - own['keep']) * k * np.logaddexp(0, up / k) * np.clip(out / own['beside'], 0, 1) * (y < height)
    near = np.clip(2 * bl.smooth((np.linalg.norm(X - V, axis=1) > 1e-5).astype(float), M, 2, 1.0), 0, 1)
    for _ in range(own['fair']):
        for step in spec['step']: X = bl.smooth(X, M, 1, step, near)[weld]
    return X[weld]

if __name__ == '__main__':
    os.makedirs('shaped', exist_ok=True)
    for sex in ('female', 'male'):
        b = bl.load(sex)
        for name in ('E', 'N', 'M', 'F1', 'F2', 'F3'):
            V = np.load(f'even/{name}-{sex}.npy'); X = (girdle if name == 'E' else top_line)(V, b['J'], np.asarray(b['T']), b['V'])
            if name == 'E': X = waist(X, np.asarray(b['part']) == b['parts'].index('trunk'))
            moved = np.linalg.norm(X - V, axis=1)
            print(f'{sex} {name}: {int((moved > 1e-4).sum())} points brought in, most {moved.max() * 1750:.0f} mm')
            np.save(f'shaped/{name}-{sex}.npy', X)
