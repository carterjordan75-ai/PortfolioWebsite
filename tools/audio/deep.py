import numpy as np, wave, sys
from scipy import signal as sg

f=wave.open(sys.argv[1],'rb'); sr=f.getframerate(); n=f.getnframes(); ch=f.getnchannels()
x=np.frombuffer(f.readframes(n),dtype=np.int16).astype(np.float64)/32768.0
f.close(); x=x.reshape(-1,ch); mono=x.mean(1); dur=len(mono)/sr
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nname(m): return names[int(round(m))%12]+str(int(round(m))//12-1)

# ---------- onset detection ----------
hop=512; nper=2048
S=np.abs(sg.stft(mono,sr,nperseg=nper,noverlap=nper-hop)[2])
flux=np.maximum(np.diff(S,axis=1),0).sum(0)
flux=flux-sg.medfilt(flux,257); flux=np.maximum(flux,0); flux/=flux.max()
fps=sr/hop
pk,props=sg.find_peaks(flux,height=0.06,distance=int(0.12*fps),prominence=0.04)
ot=pk*hop/sr; ostr=props['peak_heights']
print(f"onsets: {len(ot)} in {dur:.0f}s = {len(ot)/dur:.2f}/s")

# inter-onset intervals
ioi=np.diff(ot); ioi=ioi[ioi<3]
hist,edges=np.histogram(ioi,bins=np.arange(0.1,2.2,0.1))
print("IOI histogram (s:count):", " ".join(f"{edges[i]:.1f}:{hist[i]}" for i in np.argsort(-hist)[:6]))

# ---------- per-onset pitch (harmonic product spectrum) ----------
def hps_pitch(a0):
    w=4096
    seg=mono[a0+int(.02*sr):a0+int(.02*sr)+w*3]
    if len(seg)<w: return []
    sp=np.zeros(w//2+1)
    for i in range(0,len(seg)-w,w//2):
        sp+=np.abs(np.fft.rfft(seg[i:i+w]*np.hanning(w)))
    freqs=np.fft.rfftfreq(w,1/sr)
    h=sp.copy()
    for d in (2,3,4):
        h[:len(sp[::d])]*=sp[::d]
    sel=(freqs>=55)&(freqs<=1100)
    cands=[]
    hh=h[sel]; ff=freqs[sel]
    idx=sg.find_peaks(hh,height=hh.max()*0.05)[0]
    idx=sorted(idx,key=lambda i:-hh[i])[:3]
    for i in idx:
        cands.append((ff[i], hh[i]/hh.max()))
    return cands
notes=[]
for a,t0,st in zip((ot*sr).astype(int),ot,ostr):
    for fq,rel in hps_pitch(a)[:2]:
        m=69+12*np.log2(fq/440)
        notes.append((t0,fq,m,st*rel))
notes=np.array([(t,m,s) for t,f2,m,s in notes])
if len(notes):
    ms=notes[:,1]
    print("\n-- note register histogram (weighted) --")
    hist={}
    for t,m,s in notes: hist[nname(m)]=hist.get(nname(m),0)+s
    for k in sorted(hist,key=lambda k:-hist[k])[:14]:
        print(f"  {k:5} {hist[k]:.2f}")
    print(f"register: median {nname(np.median(ms))}, 10-90pct {nname(np.percentile(ms,10))}..{nname(np.percentile(ms,90))}")

# note rate + mean register per 20s
print("\n-- events per 20s / mean pitch --")
for t0 in range(0,int(dur),20):
    m=notes[(notes[:,0]>=t0)&(notes[:,0]<t0+20)]
    if len(m): print(f"{t0:>4}s  {len(m)/2:4.1f} notes  ~{nname(np.average(m[:,1],weights=m[:,2]))}")

# ---------- attack / decay around strong onsets ----------
b,a=sg.butter(4,[150/(sr/2),2500/(sr/2)],'band')
mid=sg.filtfilt(b,a,mono)
env=np.abs(sg.hilbert(mid)); env=sg.filtfilt(*sg.butter(2,40/(sr/2)),env)
atks=[]; decs=[]
strong=[(t,s) for t,s in zip(ot,ostr) if s>np.percentile(ostr,70)]
for t0,s in strong[:120]:
    i0=int(t0*sr)
    w0=env[max(0,i0-int(.05*sr)):i0+int(.12*sr)]
    if len(w0)<int(.15*sr): continue
    peak=w0.max(); ipk=w0.argmax()
    lo=np.where(w0[:ipk]<=0.1*peak)[0]
    hi=np.where(w0[:ipk+1]>=0.9*peak)[0]
    if len(lo) and len(hi): atks.append((hi[0]-lo[-1])/sr*1000)
    dseg=env[i0+ipk:i0+ipk+int(1.2*sr)]
    if len(dseg)>sr//2:
        ld=np.log(np.maximum(dseg,1e-6))
        sl=np.polyfit(np.arange(len(ld))/sr,ld,1)[0]
        if sl<0: decs.append(-1/sl)
print(f"\nattack 10-90%: median {np.median(atks):.0f} ms (piano ~5-40, pad >200)")
print(f"decay tau: median {np.median(decs):.2f} s")

# ---------- sustained background between onsets ----------
act=np.zeros(len(flux),bool)
for t0 in ot:
    i=int(t0*fps); act[max(0,i-2):i+int(1.2*fps)]=True
quiet=np.where(~act)[0]
if len(quiet)>50:
    Sq=S[:,quiet].mean(1); Sa=S.mean(1)
    freqs=np.fft.rfftfreq(nper,1/sr)
    print("\n-- spectrum in note-free moments (is there a bed?) --")
    for lo,hi,name in [(30,90,'sub'),(90,200,'bass'),(200,500,'mid-'),(500,1200,'mid'),(1200,3000,'hi')]:
        m=(freqs>=lo)&(freqs<hi)
        print(f"  {name:5} {20*np.log10(Sq[m].mean()+1e-9):6.1f} dB   (all-time {20*np.log10(Sa[m].mean()+1e-9):6.1f})")
    # top pitches of the bed
    selb=(freqs>40)&(freqs<400)
    ip=sg.find_peaks(Sq[selb],height=Sq[selb].max()*0.2)[0]
    ip=sorted(ip,key=lambda i:-Sq[selb][i])[:6]
    print("  bed peaks:", ", ".join(f"{nname(69+12*np.log2(freqs[selb][i]/440))}({freqs[selb][i]:.0f}Hz)" for i in ip))

# ---------- hiss & crackle ----------
b,a=sg.butter(4,6000/(sr/2),'high'); hf=sg.filtfilt(b,a,mono)
hfr=np.sqrt(np.convolve(hf**2,np.ones(1024)/1024,'same'))
print(f"\nhiss floor (median HF rms): {20*np.log10(np.median(hfr)+1e-9):.1f} dBFS")
clicks,_=sg.find_peaks(np.abs(hf),height=np.median(hfr)*8,distance=200)
print(f"crackle clicks/s: {len(clicks)/dur:.1f}")
b,a=sg.butter(4,[2000/(sr/2),6000/(sr/2)],'band'); mf=sg.filtfilt(b,a,mono)
print(f"2-6k band rms: {20*np.log10(np.sqrt((mf**2).mean())):.1f} dBFS")

# ---------- reverb decay after last notes ----------
rms=np.sqrt(np.convolve(mono**2,np.ones(2048)/2048,'same'))
tail=rms[int((dur-6)*sr):int((dur-0.5)*sr)]
ld=np.log(np.maximum(tail,1e-7)); sl=np.polyfit(np.arange(len(ld))/sr,ld,1)[0]
print(f"outro decay tau: {(-1/sl if sl<0 else 99):.1f} s")

# ---------- fine chord timeline (8s) ----------
print("\n-- bass + mid pcs every 8s --")
w=8192; freqs=np.fft.rfftfreq(w,1/sr)
for t0 in np.arange(0,dur-8,8):
    seg=mono[int(t0*sr):int(t0*sr)+8*sr]
    sp=np.zeros(w//2+1)
    for i in range(0,len(seg)-w,w): sp+=np.abs(np.fft.rfft(seg[i:i+w]*np.hanning(w)))**2
    selb=(freqs>50)&(freqs<200); i0=np.argmax(sp[selb])
    bassn=nname(69+12*np.log2(freqs[selb][i0]/440))
    pc=np.zeros(12)
    selm=(freqs>200)&(freqs<1000)
    mi=69+12*np.log2(freqs[selm]/440)
    for k in range(12): pc[k]=sp[selm][(np.round(mi).astype(int)%12)==k].sum()
    top=np.argsort(-pc)[:3]
    print(f"{t0:5.0f}s  bass {bassn:4}  mids {' '.join(names[i] for i in top)}")
