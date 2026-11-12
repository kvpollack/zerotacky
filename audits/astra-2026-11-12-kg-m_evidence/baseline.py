from pathlib import Path
import subprocess,shutil,json,urllib.request
out=Path.home()/'.aki/tmp/astra-units-1112';root=Path('zerotacky-v2').resolve();kit=Path.home()/'.aki/tmp/zt'
r={}
for name,args in [('tests',[shutil.which('bun'),'test','test/']),('tsc',[shutil.which('bun'),'node_modules/typescript/bin/tsc','--noEmit','--incremental','false'])]:
 with (out/(name+'.log')).open('w') as f:x=subprocess.run(args,cwd=root,stdout=f,stderr=subprocess.STDOUT)
 r[name]=x.returncode
(out/'regression.json').write_text(json.dumps(r,indent=2))
def gh(path):
 req=urllib.request.Request('https://api.github.com/repos/kvpollack/zerotacky/'+path,headers={'Authorization':'Bearer '+(kit/'github_pat.txt').read_text().strip(),'User-Agent':'astra-units-read-audit'})
 with urllib.request.urlopen(req,timeout=45) as f:return json.load(f)
sha=gh('commits/86514d46')['sha'];tree=gh('git/trees/'+sha+'?recursive=1');blobs={x['path']:x['sha'] for x in tree['tree'] if x['type']=='blob'}
m=json.loads((out/'manifest.json').read_text());(out/'provenance.json').write_text(json.dumps({'sha':sha,'files':len(m),'differences':[x['path'] for x in m if blobs.get(x['path'])!=x['gitBlob']]},indent=2))
