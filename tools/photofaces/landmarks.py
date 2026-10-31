"""Landmarks of each supplied unwrap, in the image's own pixels.
eyes: (x, y) of the subject's right eye (image left) and left eye; ears: x of the ear centres (image left, right);
mouth: y of the lip line; chin: y of the bottom of the chin seen from the front."""
UPLOADS = '/Users/yanlinzhu/.claude/uploads/d811ffc0-bc97-4591-84a1-272e064dd93b/'

FACES = {
    'redhead': dict(file='2982d839-image.jpg', sex='male', eyes=[(1054, 682), (1332, 682)], ears=(534, 1860), mouth=1002, chin=1254, hair='#5a2a14'),
    'bearded': dict(file='28db2a7b-image.jpg', sex='male', eyes=[(1056, 702), (1356, 702)], ears=(600, 1824), mouth=1046, chin=1308, hair='#2a1a10'),
    'blonde': dict(file='407114ff-image.jpg', sex='female', eyes=[(1014, 668), (1368, 668)], ears=(492, 1908), mouth=1098, chin=1356, hair='#d8c08c'),
    'asianLong': dict(file='af377174-image.jpg', sex='female', eyes=[(370, 315), (540, 315)], ears=(175, 735), mouth=505, chin=595, hair='#1c1410', cropped=True),
    'asianMan': dict(file='da36dd43-image.jpg', sex='male', eyes=[(205, 132), (287, 132)], ears=(85, 400), mouth=228, chin=275, hair='#1a1614'),
    'goatee': dict(file='bdac4520-image.jpg', sex='male', eyes=[(340, 245), (460, 245)], ears=(165, 635), mouth=375, chin=450, hair='#141210'),
    'asianWoman': dict(file='7d134cd3-image.jpg', sex='female', eyes=[(345, 226), (455, 226)], ears=(160, 645), mouth=352, chin=412, hair='#120c0c'),
}
