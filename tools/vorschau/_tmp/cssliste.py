import re,glob,sys
def liste():
    aus=[]
    for f in ['src/index.css']+sorted(glob.glob('src/styles/*.css')):
        s=open(f).read()
        s2=re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]',' ',m.group(0)), s, flags=re.S)
        for m in re.finditer(r'([^{};]*)\{([^{}]*)\}', s2):
            sel=' '.join(m.group(1).split())
            for d in re.finditer(r'font-size:\s*([^;}]+)', m.group(2)):
                line=s2[:m.start(2)+d.start()].count('\n')+1
                aus.append((f,line,d.group(1).strip(),sel))
    return aus
if __name__=='__main__':
    for f,l,v,sel in liste():
        if len(sys.argv)>1 and sys.argv[1] not in f: continue
        print(f"{f.split('/')[-1]}:{l}\t{v}\t{sel[-120:]}")
