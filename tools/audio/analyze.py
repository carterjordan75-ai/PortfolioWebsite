import numpy as np, wave, sys
from scipy import signal as sg

f=wave.open(sys.argv[1],'rb'); sr=f.getframerate(); n=f.getnframes(); ch=f.getnchannels()
x=np.frombuffer(f.readframes(n),dtype=np.int16).astype(np.float64)/32768.0
f.close()
x=x.reshape(-1,ch); L=x[:,0]; R=x[:,1] if ch>1 else x[:,0]; mono=(L+R)/2
dur=len(mono)/sr
print(f"duration {dur:.1f}s  sr {sr}  ch {ch}")

# ---------- global loudness / dynamics ----------
hop=1024; win=2048
nf=(len(mono)-win)//hop
frames=np.lib.stride_tricks.as_strided(mono,(nf,win),(mono.strides[0]*hop,mono.strides[0]))
rms=np.sqrt((frames**2).mean(1))
tt=np.arange(nf)*hop/sr
print(f"RMS overall {20*np.log10(rms.mean()+1e-9):.1f} dBFS, peak {20*np.log10(np.abs(mono).max()):.1f} dBFS")
print(f"dyn range (95th-5th pct rms) {20*np.log10(np.percentile(rms,95)/max(np.percentile(rms,5),1e-9)):.1f} dB")

# section envelope: 2s smoothing, report every 10s
sm=sg.savgol_filter(rms, min(2*sr//hop*2+1, len(rms)//2*2-1), 3)
print("\n-- loudness curve (dB rel mean, every 10s) --")
mref=sm.mean()
for t0 in range(0,int(dur),10):
    i0,i1=int(t0*sr/hop),int(min((t0+10)*sr/hop,nf))
    print(f"{t0:>4}s {20*np.log10(sm[i0:i1].mean()/mref+1e-9):+5.1f} dB")

# ---------- spectrum: long-term average ----------
ff,Pxx=sg.welch(mono,sr,nperseg=8192)
def band(a,b): 
    m=(ff>=a)&(ff<b); return 10*np.log10(Pxx[m].mean()+1e-12)
print("\n-- long-term band energy (dB) --")
for a,b,name in [(20,60,'sub'),(60,120,'bass'),(120,250,'lowmid'),(250,500,'mid-'),(500,1000,'mid'),(1000,2000,'himid'),(2000,4000,'pres'),(4000,8000,'brill'),(8000,16000,'air')]:
    print(f"{name:>7} {a:>5}-{b:<5} {band(a,b):+6.1f}")
cent=(ff*Pxx).sum()/Pxx.sum()
roll=ff[np.cumsum(Pxx)>=0.85*Pxx.sum()][0]
print(f"centroid {cent:.0f} Hz, rolloff85 {roll:.0f} Hz, flatness {np.exp(np.log(Pxx+1e-15).mean())/Pxx.mean():.4f}")

# ---------- onsets & tempo ----------
S=np.abs(sg.stft(mono,sr,nperseg=2048,noverlap=2048-512)[2])  # 512 hop
flux=np.maximum(np.diff(S,axis=1),0).sum(0)
flux=flux-sg.medfilt(flux,201); flux=np.maximum(flux,0)
fps=sr/512
ac=np.correlate(flux,flux,'full')[len(flux)-1:]
ac/=ac[0]+1e-9
# search 50-180 bpm
lag0,lag1=int(fps*60/180),int(fps*60/50)
best=lag0+np.argmax(ac[lag0:lag1])
print(f"\ntempo est: {60*fps/best:.1f} bpm (ac peak {ac[best]:.3f})  -- low peak = weak pulse/ambient")
tops=sorted(range(lag0,lag1),key=lambda l:-ac[l])[:5]
print("  top lags:", ", ".join(f"{60*fps/l:.1f}bpm({ac[l]:.2f})" for l in sorted(set(tops))))
# onset density
peaks,_=sg.find_peaks(flux,height=np.percentile(flux,98),distance=int(0.15*fps))
print(f"onset density: {len(peaks)/dur:.2f}/s")

# ---------- chroma & key ----------
nfft=8192; hopc=4096
nfr=(len(mono)-nfft)//hopc
chroma=np.zeros((12,nfr))
freqs=np.fft.rfftfreq(nfft,1/sr)
midi=69+12*np.log2(np.maximum(freqs,1)/440.0)
pc=np.round(midi).astype(int)%12
sel=(freqs>55)&(freqs<2200)
w=np.hanning(nfft)
for i in range(nfr):
    sp=np.abs(np.fft.rfft(mono[i*hopc:i*hopc+nfft]*w))**2
    for k in range(12):
        chroma[k,i]=sp[sel&(pc==k)].sum()
chn=chroma/ (chroma.sum(0,keepdims=True)+1e-12)
avg=chn.mean(1); avg/=avg.max()
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
print("\n-- avg chroma --")
print("  ".join(f"{names[i]}:{avg[i]:.2f}" for i in np.argsort(-avg)))
maj=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
minp=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
scores=[]
for k in range(12):
    scores.append((np.corrcoef(np.roll(maj,k),chroma.mean(1))[0,1],names[k]+' major'))
    scores.append((np.corrcoef(np.roll(minp,k),chroma.mean(1))[0,1],names[k]+' minor'))
scores.sort(reverse=True)
print("key guesses:", ", ".join(f"{n}({s:.2f})" for s,n in scores[:4]))

# chroma per 20s section: top 4 pcs
print("\n-- top pitch classes per 20s --")
per=int(20*sr/hopc)
for s0 in range(0,nfr,per):
    seg=chn[:,s0:s0+per].mean(1)
    idx=np.argsort(-seg)[:4]
    print(f"{s0*hopc/sr:>5.0f}s  "+"  ".join(f"{names[i]}({seg[i]:.2f})" for i in idx))

# ---------- bass fundamental over time ----------
print("\n-- bass note per 20s (60-200Hz peak) --")
selb=(freqs>=55)&(freqs<=210)
for s0 in range(0,nfr,per):
    sp=np.zeros(selb.sum())
    for i in range(s0,min(s0+per,nfr)):
        sp+=np.abs(np.fft.rfft(mono[i*hopc:i*hopc+nfft]*w))[selb]**2
    fpk=freqs[selb][np.argmax(sp)]
    m=69+12*np.log2(fpk/440)
    print(f"{s0*hopc/sr:>5.0f}s  {fpk:6.1f} Hz  ~{names[int(round(m))%12]}{int(round(m))//12-1}")

# ---------- stereo & reverb ----------
side=(L-R)/2; midc=(L+R)/2
print(f"\nstereo width (side/mid rms): {np.sqrt((side**2).mean())/np.sqrt((midc**2).mean()):.3f}")
# decay: autocorr of envelope of 1-4k band
b,a=sg.butter(4,[1000/(sr/2),4000/(sr/2)],'band')
env=np.abs(sg.hilbert(sg.filtfilt(b,a,mono[::4])))
env=sg.decimate(env,8)
eac=np.correlate(env-env.mean(),env-env.mean(),'full')[len(env)-1:]
eac/=eac[0]
half=np.argmax(eac<0.5)/(sr/32)
print(f"hi-mid envelope 50% decorrelation: {half*1000:.0f} ms (long = washy/reverby)")
