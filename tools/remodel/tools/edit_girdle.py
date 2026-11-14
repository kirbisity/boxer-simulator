import sys, re
p = sys.argv[1]; s = open(p).read()
def sub(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:60], s.count(old))
    s = s.replace(old, new)

# 1. The header: what the other builds take.
sub("""# The other builds keep their cover over the bone, and less of the trapezius over it (TRAPEZIUS, top_line).
""", """# The other builds keep their cover over the bone, and less of it: of the trapezius over the collar line (TRAPEZIUS) and of
# the deltoid outside the arm's line and the humerus' head (DELTOID), both in top_line.
# Every build's neck is then drawn slimmer about its own middle line (NECK, column).
""")

# 2. The fore-and-aft hold as a function of its own (the emaciated build is held to it, the others keep a share over it).
old = """        depth = spec['depth']; fore = X[:, 0] - s[0]
        # (Only what lies about the bone: the flank and the armpit's folds, farther from it across the body, are not the shoulder's.)
        # (Over the joint the bone is the girdle's, not the arm's: there the distance is the one across, whatever the height.)
        tc = np.clip(ta, 0, 1); up = y - s[1] - tc * d3[1]; off = np.hypot(np.where(tc > 0, up, np.minimum(up, 0)), z - zs - tc * d3[2])
        bone = 1 - ramp(*spec['about'], off)
        allowed = depth + spec['sheet'] * np.clip(off - spec['about'][0], 0, None)
        push = held * np.where(fore > 0, np.clip(fore - allowed, 0, None), ramp(*spec['back'], z - zs) * bone * np.clip(-fore - depth, 0, None))
        X[:, 0] -= np.sign(fore) * push; moved |= push > 1e-5
"""
assert old in s
new_bound = """        depth = spec['depth']; fore, push = ball(X, s, e, sign, spec)
        X[:, 0] -= np.sign(fore) * push; moved |= push > 1e-5
"""
s = s.replace(old, new_bound)
old = """        # The shoulder's depth fore and aft of the joint: in front from the head's inner side out, behind on the arm, and down
        # the arm to the deltoid's insertion.
        d3 = np.array([0.0, e[1] - s[1], (e[2] - s[2]) * sign]); L3 = np.linalg.norm(d3)
        ta = ((y - s[1]) * d3[1] + (z - zs) * d3[2]) / (L3 * L3)
        ua = np.clip((ta - spec['insertion'][0]) / (spec['insertion'][1] - spec['insertion'][0]), 0, 1); held = 1 - ua * ua * (3 - 2 * ua)
        ramp = lambda a, b, v: (lambda u: u * u * (3 - 2 * u))(np.clip((v - a) / (b - a), 0, 1))
"""
assert old in s
s = s.replace(old, "")
sub("""def bound(X, V, J, E, spec, hollows):
""", """ramp = lambda a, b, v: (lambda u: u * u * (3 - 2 * u))(np.clip((v - a) / (b - a), 0, 1))

def ball(X, s, e, sign, spec):
    # The shoulder's depth fore and aft of the joint: in front from the head's inner side out, behind on the arm, and down
    # the arm to the deltoid's insertion. Returns each point's distance before the joint and how far it stands past that depth.
    z = X[:, 2] * sign; y = X[:, 1]; zs = s[2] * sign
    d3 = np.array([0.0, e[1] - s[1], (e[2] - s[2]) * sign]); L3 = np.linalg.norm(d3)
    ta = ((y - s[1]) * d3[1] + (z - zs) * d3[2]) / (L3 * L3)
    held = 1 - ramp(*spec['insertion'], ta)
    depth = spec['depth']; fore = X[:, 0] - s[0]
    # (Only what lies about the bone: the flank and the armpit's folds, farther from it across the body, are not the shoulder's.)
    # (Over the joint the bone is the girdle's, not the arm's: there the distance is the one across, whatever the height.)
    tc = np.clip(ta, 0, 1); up = y - s[1] - tc * d3[1]; off = np.hypot(np.where(tc > 0, up, np.minimum(up, 0)), z - zs - tc * d3[2])
    bone = 1 - ramp(*spec['about'], off)
    allowed = depth + spec['sheet'] * np.clip(off - spec['about'][0], 0, None)
    return fore, held * np.where(fore > 0, np.clip(fore - allowed, 0, None), ramp(*spec['back'], z - zs) * bone * np.clip(-fore - depth, 0, None))

def bound(X, V, J, E, spec, hollows):
""")

# 3. The dials.
sub("""    # What was brought in is faired as the emaciated build's is (Taubin's, GIRDLE.step): `fair` rounds.
    fair=3,
)
""", """    # What was brought in is faired as the emaciated build's is (Taubin's, GIRDLE.step): `fair` rounds.
    fair=3,
)

DELTOID = dict(
    # The other builds' shoulder cap. The emaciated build's arm leaves straight from under the acromion's corner along its
    # bone, and its shoulder is as deep as the humerus' head under its skin (GIRDLE: the arm's line, `depth`); a fed build
    # has the deltoid over both, and the model's is a boxer's. Of what stands outside the arm's line, and before and behind
    # the head's depth, a build keeps `keep`: the cap narrower across the shoulders and flatter fore and aft, down to the
    # deltoid's insertion (GIRDLE.insertion), where the arm is its own. 1 leaves the model's cap.
    keep=1.0,
    # The arm's line takes over from the collar line round the acromion's corner over `turn` along the arm either side of it.
    turn=0.008,
)

NECK = dict(
    # Every build's neck: its column kept `slim` of its breadth and depth about its own middle line (the section's middle
    # fore and aft, read through the column and taken straight). The fighter's neck above the builds' own is the game's,
    # drawn to a girth (src/loftbody.js LOFT.neck), which takes the same share (LOFT.neck.slim): the two are one dial.
    slim=1.0,
    # None of it at `foot` of the way from the neck's joint to the head's (the pit of the throat and the collarbones' inner
    # ends: the trunk's) and all of it from `full` (where the trapezius leaves the column).
    foot=0.12, full=0.34,
    # ... within `within[0]` of the middle line, none past `within[1]` (units of stature: the widest neck's half-breadth is
    # 0.04): the shoulders' top beside the column eases in with it.
    within=(0.05, 0.085),
    # The middle line is read between these heights (of the same way up), in bands `band` high, from the column's middle
    # slice (within `slice` of the body's middle).
    read=(0.3, 0.6), band=0.006, slice=0.012,
)
""")

# 4. The cap in top_line, and the column for every build.
sub("""        X[:, 1] -= (1 - own['keep']) * k * np.logaddexp(0, up / k) * np.clip(out / own['beside'], 0, 1) * (y < height)
    near""", """        X[:, 1] -= (1 - own['keep']) * k * np.logaddexp(0, up / k) * np.clip(out / own['beside'], 0, 1) * (y < height)
        # The cap: outside the arm's line through the acromion's corner (in the plane across: its normal out and up) ...
        e = J[side + 'Elbow']; d = np.array([(e[2] - s[2]) * sign, e[1] - s[1]]); L = np.linalg.norm(d); d /= L; n2 = np.array([-d[1], d[0]])
        pz, py = z - edge, y - (s[1] + spec['rise']); down = pz * d[0] + py * d[1]
        less = (1 - cap['keep']) * k * np.logaddexp(0, (pz * n2[0] + py * n2[1]) / k) * ramp(-cap['turn'], cap['turn'], down) * (1 - ramp(*spec['insertion'], down / L))
        X[:, 2] -= sign * n2[0] * less; X[:, 1] -= n2[1] * less
        # ... and fore and aft of the humerus' head.
        fore, push = ball(V, s, e, sign, spec)
        X[:, 0] -= (1 - cap['keep']) * np.sign(fore) * push
    near""")
sub("def top_line(V, J, T, rest, spec=GIRDLE, own=TRAPEZIUS):\n    # A build's trapezius lessened: the neck's wall its own, the collar line the bone's.",
    "def top_line(V, J, T, rest, spec=GIRDLE, own=TRAPEZIUS, cap=DELTOID):\n    # A build's trapezius and deltoid lessened: the neck's wall its own, the collar line and the arm's line the bone's.")
sub("""if __name__ == '__main__':""", """def column(V, J, own=NECK):
    # A build's neck drawn slimmer about its middle line.
    t = (V[:, 1] - J['neck'][1]) / (J['head'][1] - J['neck'][1])
    levels = np.arange(own['read'][0], own['read'][1] + 1e-9, 0.05); middles = []
    for level in levels:
        fore = V[(np.abs(t - level) * (J['head'][1] - J['neck'][1]) < own['band']) & (np.abs(V[:, 2]) < own['slice']), 0]
        middles.append((fore.max() + fore.min()) / 2)
    lean, at = np.polyfit(levels, middles, 1)
    off = V[:, 0] - (at + lean * t)
    share = (1 - own['slim']) * ramp(own['foot'], own['full'], t) * (1 - ramp(*own['within'], np.hypot(off, V[:, 2])))
    X = V.copy(); X[:, 0] -= share * off; X[:, 2] -= share * V[:, 2]
    return X

if __name__ == '__main__':""")
sub("""            if name == 'E': X = arms(waist(X, np.asarray(b['part']) == b['parts'].index('trunk')), b)
""", """            if name == 'E': X = arms(waist(X, np.asarray(b['part']) == b['parts'].index('trunk')), b)
            X = column(X, b['J'])
""")
open(p, 'w').write(s)
