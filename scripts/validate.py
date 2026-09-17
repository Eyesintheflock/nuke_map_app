"""Dependency-free structure and JavaScript checks for the static app."""
from html.parser import HTMLParser
from pathlib import Path
import re,json,subprocess
root=Path(__file__).resolve().parents[1]
class Document(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.assets=[];self.scripts=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  if tag=='script':self.scripts.append(a)
  if tag in ('script','link','img'):
   v=a.get('src') or a.get('href')
   if v and not v.startswith(('https:','http:','data:')):self.assets.append(v.split('?')[0])
p=Document();html=(root/'index.html').read_text();p.feed(html)
assert len(p.ids)==len(set(p.ids)), 'Duplicate DOM IDs'
assert all(x.get('src') or x.get('type')=='application/json' for x in p.scripts),'Unexpected executable inline script'
for asset in p.assets:assert (root/asset).is_file(),f'Missing asset {asset}'
for icon in json.loads((root/'manifest.webmanifest').read_text())['icons']:assert (root/icon['src']).is_file()
for file in [*root.glob('*.js'),*root.glob('app/*.js'),*root.glob('scripts/*.mjs')]:subprocess.run(['node','--check',str(file)],check=True)
app=(root/'app.js').read_text()
for selector in re.findall(r"\$\(['\"]#([\w-]+)['\"]\)",app):assert selector in p.ids,f'Missing DOM ID {selector}'
functions=re.findall(r'^function (\w+)\(',app,re.M);assert len(functions)==len(set(functions)),'Duplicate functions'
version=re.search(r"const CACHE_VERSION = 'v([^']+)'",(root/'sw.js').read_text())[1]
assert 'app.js?v='+version in html and 'styles.css?v='+version in html
json.loads(re.search(r'<script id="countiesData"[^>]*>(.*?)</script>',html,re.S)[1])
assert not re.search(r'^(<<<<<<<|=======|>>>>>>>)',html+'\n'+app,re.M),'Unresolved merge marker'
print('PASS: syntax, unique IDs/functions, DOM references, local assets, manifest, version alignment, county JSON')

# Each page has a separate DOM and must reference real versioned assets.
climate=Document();climate.feed((root/'climate.html').read_text())
assert len(climate.ids)==len(set(climate.ids)), 'Duplicate climate page IDs'
for asset in climate.assets: assert (root/asset).is_file(), f'Missing climate asset {asset}'
for filename,ids in [('app/interface.js',p.ids),('app/climate-ui.js',climate.ids)]:
 text=(root/filename).read_text()
 for name in re.findall(r"(?:byId|el)\(['\"]([\w-]+)['\"]\)",text):assert name in ids,f'Missing {filename} DOM ID: {name}'
assert 'app.js' not in (root/'climate.html').read_text(), 'Climate page must remain independent of simulation'
print('PASS: climate/UI asset references and independent climate page')
