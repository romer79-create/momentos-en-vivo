"""Local extraction/green-key preparation for the supplied homepage video.

Requires Pillow, NumPy and imageio-ffmpeg. The latter is isolated under
output/portada-modelo/.tools; no application dependency is changed.
"""
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output' / 'portada-modelo'
sys.path.insert(0, str(OUTPUT / '.tools'))
import imageio_ffmpeg

SOURCE = OUTPUT / 'Camera_rotating_on_green_screen_20260928155024.mp4'
RAW = OUTPUT / 'video-raw'

def inspect():
    reader = imageio_ffmpeg.read_frames(str(SOURCE))
    metadata = next(reader)
    reader.close()
    print(json.dumps(metadata, indent=2))
    if RAW.exists():
        raise SystemExit('The extraction directory already exists; preserving it.')
    RAW.mkdir()
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error',
                    '-nostdin', '-n', '-i', str(SOURCE), '-an', '-vf', 'fps=10',
                    '-frames:v', '120', '-start_number', '0', str(RAW / 'frame-%04d.png')], check=True)
    files = sorted(RAW.glob('frame-*.png'))
    ids = np.linspace(0, len(files)-1, 9).round().astype(int).tolist()
    sheet = Image.new('RGB', (1200, 750), '#181818')
    draw = ImageDraw.Draw(sheet)
    for n, i in enumerate(ids):
        frame = Image.open(files[i]).convert('RGB')
        frame.thumbnail((400, 220))
        x,y=(n%3)*400,(n//3)*250
        sheet.paste(frame,(x,y))
        draw.text((x+12,y+226), f'Frame {i} / {i/10:.1f}s', fill='white')
    sheet.save(OUTPUT/'video-contacto.jpg',quality=94)
    (OUTPUT/'video-metadata.json').write_text(json.dumps({**metadata,'extractedCount':len(files),'sampleFps':10},indent=2),encoding='utf-8')

def green_key(image):
    rgb = np.asarray(image.convert('RGB'),dtype=np.float32)
    r,g,b = rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    # The supplied Flow clip is forest green, not the requested pure #00ff00.
    # Remove its green excess; dark lens pixels do not match this condition.
    excess = g - np.maximum(r,b)
    alpha = 1 - np.clip((excess - 8) / 28, 0, 1)
    # Suppress residual green on antialiased edge pixels without touching gold.
    rgb[:,:,1] = np.minimum(g, np.maximum(r,b) + 4)
    return Image.fromarray(np.dstack((np.clip(rgb,0,255).astype('uint8'),(alpha*255).round().astype('uint8'))),'RGBA')

def preview():
    ids=[0,15,30]
    backgrounds=['#111011','#f7f4ed','#9a5279']
    sheet=Image.new('RGB',(1500,1320),'#202020')
    draw=ImageDraw.Draw(sheet)
    bounds=[]
    for n,i in enumerate(ids):
        raw=Image.open(RAW/f'frame-{i:04d}.png')
        image=green_key(raw)
        bounds.append(image.getbbox())
        # All samples use this same fixed crop.
        image=image.crop((225,60,1065,690))
        image.thumbnail((500,400),Image.Resampling.LANCZOS)
        for row,bg in enumerate(backgrounds):
            cell=Image.new('RGBA',(500,440),bg)
            cell.alpha_composite(image,((500-image.width)//2,20))
            sheet.paste(cell.convert('RGB'),(n*500,row*440))
            draw.text((n*500+18,row*440+408),f'Frame {i} / {i/10:.1f}s',fill='white' if row!=1 else 'black')
    sheet.save(OUTPUT/'recorte-prueba.jpg',quality=96)
    print(json.dumps({'bounds':bounds,'preview':str(OUTPUT/'recorte-prueba.jpg')}))

def build():
    raw = OUTPUT/'video-sequence-v1'
    target = ROOT/'public/assets/portada-modelo/camera-turn-v1'
    if raw.exists() or target.exists():
        raise SystemExit('Output already exists; use a new version instead of overwriting.')
    raw.mkdir(); target.mkdir()
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error',
                    '-nostdin', '-n', '-i', str(SOURCE), '-t', '3.05', '-an', '-vf', 'fps=20',
                    '-start_number', '0', str(raw/'frame-%04d.png')],check=True)
    files=[]; bounds=[]
    for file in sorted(raw.glob('frame-*.png')):
        cutout=green_key(Image.open(file))
        bounds.append(cutout.getbbox())
        # One fixed crop and one fixed placement for the entire sequence.
        cropped=cutout.crop((315,20,1085,700)).resize((900,795),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',(900,900))
        canvas.alpha_composite(cropped,(0,52))
        name=file.stem+'.webp'
        canvas.save(target/name,quality=83,method=6)
        files.append(name)
    poster_index=30
    (target/'poster.webp').write_bytes((target/files[poster_index]).read_bytes())
    manifest={
        'version':1,'sourceName':SOURCE.name,'sourceType':'user-supplied-flow-video',
        'count':len(files),'width':900,'height':900,'sampleFps':20,
        'segmentStartSeconds':0,'segmentDurationSeconds':3.05,
        'files':files,'firstPose':'right','reverseMapping':True,
        'poster':'poster.webp','posterIndex':poster_index,'posterWasSelected':True,
        'needsVisualReview':False,'clipPending':False,
        'crop':[315,20,1085,700],'placement':[0,52],
        'keyMethod':'alpha = 1 - clamp((G - max(R,B) - 8)/28); green despill',
        'sequenceBytes':sum((target/name).stat().st_size for name in files),
        'maxDecodedFrames':6,'maxConcurrentLoads':2,
        'estimatedCacheRGBABytes':6*900*900*4
    }
    (target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in manifest.items() if k!='files'},indent=2))
    print('Source alpha bounding box union:',(min(b[0] for b in bounds),min(b[1] for b in bounds),max(b[2] for b in bounds),max(b[3] for b in bounds)))

if __name__ == '__main__':
    {'inspect':inspect,'preview':preview,'build':build}[sys.argv[1] if len(sys.argv)>1 else 'inspect']()
