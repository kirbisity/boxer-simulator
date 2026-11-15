from PIL import Image
HEAD, CW, CH = 420, 1020, 1860
def tiles(name, sex, picks, box, labels=('current','moderate','strong')):
    w,h=box[2]-box[0],box[3]-box[1]
    out=Image.new('RGB',(w*len(labels),h*len(picks)))
    for i,l in enumerate(labels):
        im=Image.open(f'shots/body-{l}-{sex}.png').convert('RGB')
        for j,(b,r) in enumerate(picks):
            out.paste(im.crop((b*CW+box[0],HEAD+r*CH+box[1],b*CW+box[2],HEAD+r*CH+box[3])),(i*w,j*h))
    out.save(f'peek/{name}.jpg',quality=88)
tiles('m-musc', 'male', [(2,0),(2,1)], (160,180,860,700))
tiles('m-musc-back', 'male', [(2,2),(1,2)], (160,180,860,700))
tiles('m-fat', 'male', [(3,0),(3,2)], (160,180,860,700))
tiles('m-ord', 'male', [(1,0),(1,1)], (160,180,860,700))
tiles('m-thin', 'male', [(0,0),(0,1)], (160,180,860,700))
tiles('f-ord', 'female', [(1,0),(1,1)], (160,180,860,700))
tiles('f-musc', 'female', [(2,0),(2,2)], (160,180,860,700))
tiles('f-fat', 'female', [(3,0),(3,2)], (160,180,860,700))
tiles('f-thin', 'female', [(0,0),(0,2)], (160,180,860,700))
