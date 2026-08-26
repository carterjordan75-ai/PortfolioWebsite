import numpy as np
from scipy.interpolate import CubicSpline
from scipy import signal as sg
import wave, sys

SR=44100; T=150.0; N=int(SR*T)          # 6,615,000 samples, exact loop
BPM=102.4; BEAT=60/BPM                  # 64 bars of 4/4 == 150.000s
rng=np.random.default_rng(7)
t=np.arange(N)/SR

def cfilt(b,a,x):                        # CIRCULAR filtering: wrap-pad, filter, cut
    pad=int(3*SR)
    xx=np.concatenate([x[-pad:],x,x[:pad]])
    return sg.filtfilt(b,a,xx)[pad:-pad]

def periodic(points):                    # smooth arc, equal value+slope at seam
    xs=[p[0] for p in points]+[T]; ys=[p[1] for p in points]+[points[0][1]]
    return CubicSpline(xs,ys,bc_type='periodic')(t)

ARC   =periodic([(0,.20),(20,.30),(45,.52),(70,.72),(100,1.0),(126,.84),(140,.45)])
PULSE =periodic([(0,.05),(18,.28),(40,.55),(70,.8),(100,1.0),(128,.6),(142,.15)])
MEL   =periodic([(0,.0),(25,.35),(50,.7),(75,.9),(103,1.0),(130,.5),(143,.08)])
AIR   =periodic([(0,.5),(40,.7),(75,1.0),(115,.8),(140,.55)])

def n2f(name):
    names={'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}
    return 440.0*2**((names[name[:-1]]+12*(int(name[-1])+1)-69)/12)

CH=[('C#2',['C#3','E3','G#3','C#4']),
    ('A1', ['A2','C#3','E3','G#3']),
    ('E2', ['B2','E3','G#3','B3']),
    ('F#2',['A2','C#3','F#3','A3']),
    ('C#2',['C#3','E3','G#3','B3']),
    ('A1', ['A2','C#3','E3','A3']),
    ('E2', ['B2','E3','G#3','C#4']),
    ('F#2',['A2','C#3','F#3','G#3'])]
CHD=T/len(CH)

# ---------------- sub + bass: continuous glide, whole cycles over the loop ----------------
freq=np.zeros(N)
for i,(root,_) in enumerate(CH):
    freq[int(i*CHD*SR):]=n2f(root)
gl=int(0.35*SR); k=np.hanning(2*gl+1); k/=k.sum()
freq=np.convolve(np.concatenate([freq[-2*gl:],freq,freq[:2*gl]]),k,'same')[2*gl:-2*gl]
ph=2*np.pi*np.cumsum(freq)/SR
total=ph[-1]+2*np.pi*freq[-1]/SR         # phase after the wrap
adj=total-2*np.pi*round(total/(2*np.pi)) # push to an integer cycle count
ph-=adj*(t+1/SR)/T
bass=np.sin(ph)*.7+np.sin(2*ph)*.24+np.sin(ph/2)*.34
b,a=sg.butter(2,240/(SR/2)); bass=cfilt(b,a,bass)*(.55+.45*ARC)

# ---------------- pads ----------------
padL=np.zeros(N); padR=np.zeros(N)
fadeS=int(3.2*SR)
env0=np.ones(int(CHD*SR)+fadeS)
env0[:fadeS]=.5-.5*np.cos(np.pi*np.arange(fadeS)/fadeS)
env0[-fadeS:]=np.minimum(env0[-fadeS:], .5+.5*np.cos(np.pi*np.arange(fadeS)/fadeS))
for ci,(_,voices) in enumerate(CH):
    a0=int(ci*CHD*SR)-fadeS//2
    seg=len(env0); tt=np.arange(seg)/SR
    for vi,vn in enumerate(voices):
        f0=n2f(vn)
        for side,buf in ((0,padL),(1,padR)):
            for li in range(2):
                det=1+rng.uniform(-4.5,4.5)*1e-4
                phase=rng.uniform(0,2*np.pi)
                w=np.zeros(seg); nh=1
                while f0*det*nh<3200 and nh<=20:
                    w+=np.sin(2*np.pi*f0*det*nh*tt+phase*nh)/nh
                    nh+=1
                idx=np.arange(a0,a0+seg)%N
                np.add.at(buf, idx, w*env0*.125)
b,a=sg.butter(2,2800/(SR/2))
padL=cfilt(b,a,padL)*(.55+.45*ARC); padR=cfilt(b,a,padR)*(.55+.45*ARC)

# ---------------- the throb ----------------
throbL=np.zeros(N); throbR=np.zeros(N)
plen=int(.16*SR); ptt=np.arange(plen)/SR
penv=np.exp(-ptt*22)*np.sin(np.pi*np.minimum(ptt/.012,1)/2)
step=BEAT/2; i8=0; s=0.0
while s<T-1e-9:
    ci=int(s/CHD)%len(CH)
    f0=n2f(CH[ci][1][0])
    accent=1.0 if (i8%4)==0 else (.55 if (i8%2)==0 else .38)
    blip=np.sin(2*np.pi*f0*2*ptt+2.2*np.sin(2*np.pi*f0*ptt))*penv*accent
    tick=rng.standard_normal(plen)*np.exp(-ptt*260)*.5*accent
    blip=blip+tick
    a0=int(s*SR); idx=np.arange(a0,a0+plen)%N
    g=PULSE[a0%N]
    gL,gR=(.34,.22) if i8%2==0 else (.22,.34)
    np.add.at(throbL,idx,blip*gL*g); np.add.at(throbR,idx,blip*gR*g)
    s+=step; i8+=1
b,a=sg.butter(2,[170/(SR/2),3400/(SR/2)],'band')
throbL=cfilt(b,a,throbL); throbR=cfilt(b,a,throbR)

# ---------------- wisps ----------------
melL=np.zeros(N); melR=np.zeros(N)
scale=['G#3','B3','C#4','E4','F#4','G#4','A4']
mlen=int(2.6*SR); mtt=np.arange(mlen)/SR
menv=np.exp(-mtt*1.9)*(.5-.5*np.cos(np.pi*np.minimum(mtt/.35,1)))
beat=0; prev=2
while beat<64*4:
    a0=int(beat*BEAT*SR)%N
    dens=MEL[a0]
    if rng.random()<dens*.5:
        prev=int(np.clip(prev+rng.choice([-2,-1,-1,1,1,2]),0,len(scale)-1))
        f0=n2f(scale[prev])
        tone=(np.sin(2*np.pi*f0*mtt)+.32*np.sin(2*np.pi*f0*2*mtt)+.1*np.sin(2*np.pi*f0*3*mtt))*menv
        pan=rng.uniform(.25,.75)
        for rep in range(3):
            gg=(.5**rep)*.15*(.4+.6*dens)
            a1=(a0+int(rep*1.5*BEAT*SR))%N
            idx=np.arange(a1,a1+mlen)%N
            np.add.at(melL,idx,tone*gg*(1-pan if rep%2==0 else pan))
            np.add.at(melR,idx,tone*gg*(pan if rep%2==0 else 1-pan))
    beat+=rng.choice([2,3,4])
b,a=sg.butter(2,3400/(SR/2)); melL=cfilt(b,a,melL); melR=cfilt(b,a,melR)

# ---------------- air ----------------
noise=rng.standard_normal(N)
b,a=sg.butter(2,5000/(SR/2)); noise=cfilt(b,a,noise)
b,a=sg.butter(1,90/(SR/2),'high'); noise=cfilt(b,a,noise)
air=noise*.006*AIR

# ---------------- circular reverb ----------------
def circ_reverb(x, sec, damp):  # damp = tail tone
    ir=rng.standard_normal(int(sec*SR))*np.exp(-np.arange(int(sec*SR))/SR*(6.9/sec))
    b,a=sg.butter(1,damp/(SR/2)); ir=sg.lfilter(b,a,ir)
    ir/=np.sqrt((ir**2).sum())
    return np.fft.irfft(np.fft.rfft(x)*np.fft.rfft(ir,N),N)

wetL=circ_reverb(padL*.55+throbL*1.1+melL*1.3+air*2, 3.4, 3300)
wetR=circ_reverb(padR*.55+throbR*1.1+melR*1.3+air*2, 3.6, 3300)

L=bass*.28+padL*.85+throbL*1.05+melL*1.05+air+wetL*.34
R=bass*.28+padR*.85+throbR*1.05+melR*1.05+air+wetR*.34

b,a=sg.butter(1,7000/(SR/2)); L=cfilt(b,a,L); R=cfilt(b,a,R)
ride=.5+.5*ARC
mix=np.stack([L*ride,R*ride],1)
rms0=np.sqrt((mix**2).mean())
mix*=10**(-16.5/20)/rms0                 # land the master at ~-16.5 dBFS RMS
mix=np.tanh(mix*1.1)/np.tanh(1.1)
peak=np.abs(mix).max()
if peak>.95: mix*=.95/peak
rms=np.sqrt((mix**2).mean())
print(f"peak {np.abs(mix).max():.3f}  rms {20*np.log10(rms):.1f} dBFS")
print("seam delta:", float(np.abs(mix[0]-mix[-1]).max()), " (vs typical step", float(np.abs(np.diff(mix[:SR,0])).mean()),")")
out=(mix*32767).astype(np.int16)
w=wave.open(sys.argv[1],'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes(out.tobytes()); w.close()
print("wrote", sys.argv[1], len(out)/SR, "s")
