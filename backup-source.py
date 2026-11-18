from pathlib import Path
import zipfile

root=Path(__file__).resolve().parent
target=root/'dist/records/expo-website-and-recreated-assets.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        relative=file.relative_to(root)
        if not file.is_file() or any(part in {'.git','node_modules','.sites-runtime','.wrangler'} for part in relative.parts):
            continue
        if relative.parts[:2] in [('dist','server'),('dist','drizzle'),('dist','.openai')]:
            continue
        if file.suffix in {'.zip','.log'} or file.name.startswith(('.env','.dev.vars')):
            continue
        archive.write(file,Path('erode-genz-expo')/relative)
    print('Backed up',len(archive.namelist()),'source/asset files; secrets and generated server bundles excluded.')
