import numpy as np, wave, sys
from scipy import signal as sg
f=wave.open(sys.argv[1],'rb'); sr=f.getframerate(); n=f.getnframes()
x=np.frombuffer(f.readframes(n),dtype=np.int16).astype(np.float64)/32768.0
f.close(); x=x.reshape(-1,2); L,R=x[:,0],x[:,1]; mono=x.mean(1)
# strong onsets
hop=512; nper=2048
S=np.abs(sg.stft(mono,sr,nperseg=nper,noverlap=nper-hop)[2])
flux=np.maximum(np.diff(S,axis=1),0).sum(0); flux-=sg.medfilt(flux,257); flux=np.maximum(flux,0)
pk,pr=sg.find_peaks(flux,height=flux.max()*0.25,distance=int(0.25*sr/hop),prominence=flux.max()*0.1)
ot=(pk*hop).astype(int)
print(f"{len(ot)} strong onsets")
# partial profile + wow on isolated notes
profs=[]; wows=[]; pans=[]
w=4096
for a0 in ot[:80]:
    seg=mono[a0:a0+int(0.7*sr)]
    if len(seg)<int(0.7*sr): continue
    sp=np.abs(np.fft.rfft(seg[:w]*np.hanning(w)))
    freqs=np.fft.rfftfreq(w,1/sr)
    sel=(freqs>60)&(freqs<300)
    f0=freqs[sel][np.argmax(sp[sel])]
    amps=[]
    for k in range(1,7):
        m=(freqs>f0*k*0.94)&(freqs<f0*k*1.06)
        amps.append(sp[m].max() if m.any() else 0)
    if amps[0]>0:
        profs.append([a/amps[0] for a in amps])
    # wow: f0 trajectory over 600ms in 100ms windows
    fs=[]
    for i in range(0,int(0.6*sr)-w,int(0.1*sr)):
        s2=np.abs(np.fft.rfft(seg[i:i+w]*np.hanning(w)))
        m=(freqs>f0*0.94)&(freqs<f0*1.06)
        if m.any():
            # parabolic interp around peak for sub-bin precision
            ii=np.argmax(s2[m]); base=np.where(m)[0][0]+ii
            if 0<base<len(s2)-1:
                al,c0,be=s2[base-1],s2[base],s2[base+1]
                d=0.5*(al-be)/(al-2*c0+be+1e-12)
                fs.append(freqs[base]+d*(freqs[1]-freqs[0]))
    if len(fs)>3:
        cents=1200*np.log2(np.array(fs)/fs[0])
        wows.append(np.ptp(cents))
    eL=np.sqrt((L[a0:a0+sr//4]**2).mean()); eR=np.sqrt((R[a0:a0+sr//4]**2).mean())
    pans.append(20*np.log10((eL+1e-9)/(eR+1e-9)))
P=np.median(np.array(profs),0)
print("partial profile (rel to f0):", " ".join(f"k{k+1}:{v:.2f}" for k,v in enumerate(P)))
print(f"wow (pitch drift ptp within notes): median {np.median(wows):.1f} cents")
print(f"per-note L/R balance: sd {np.std(pans):.1f} dB (alternating pan if large)")
# global slow pitch drift: track a band around 110Hz across the track
inst=[]
for t0 in np.arange(5,190,2.0):
    seg=mono[int(t0*sr):int(t0*sr)+w]
    s2=np.abs(np.fft.rfft(seg*np.hanning(w)))
    m=(np.fft.rfftfreq(w,1/sr)>100)&(np.fft.rfftfreq(w,1/sr)<120)
    if s2[m].max()>s2.mean()*4:
        fr=np.fft.rfftfreq(w,1/sr)[m][np.argmax(s2[m])]
        inst.append((t0,fr))
if len(inst)>10:
    fr=np.array([f for _,f in inst])
    print(f"A2 partial track: mean {fr.mean():.2f}Hz sd {1200*np.log2(fr/fr.mean()).std():.1f} cents (A2=110.0)")
