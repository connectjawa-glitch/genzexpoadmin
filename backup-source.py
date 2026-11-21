from pathlib import Path
import zipfile

root=Path(__file__).resolve().parent
target=root/'dist/records/expo-website-and-recreated-assets.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        relative=file.relative_to(root)
        if not file.is_file() or any(part in {'.git','node_modules','.sites-runtime','.wrangler','.vercel','vercel-public'} for part in relative.parts):
            continue
        if relative.parts[:2] in [('dist','server'),('dist','drizzle'),('dist','.openai')]:
            continue
        if file.suffix in {'.zip','.log'} or file.name.startswith(('.env','.dev.vars')):
            continue
        # PNG/JPEG files are already compressed. Keep their original bytes contiguous
        # so the Worker can serve the same archived bytes without a duplicate copy.
        compression=zipfile.ZIP_STORED if file.suffix.lower() in {'.png','.jpg','.jpeg'} else zipfile.ZIP_DEFLATED
        archive.write(file,Path('erode-genz-expo')/relative,compress_type=compression)
    print('Backed up',len(archive.namelist()),'source/asset files; secrets and generated server bundles excluded.')
