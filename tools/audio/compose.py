import numpy as np
from scipy.interpolate import CubicSpline
from scipy import signal as sg
import wave, sys

SR=44100; T=150.0; N=int(SR*T)
BPM=102.4; BEAT=60/BPM; BAR=4*BEAT          # 64 bars == 150.000s
TUNE=2**(-15/1200)                           # the whole tape runs a touch flat
rng=np.random.default_rng(11)
t=np.arange(N)/SR

def cfilt(b,a,x):
    pad=int(3*SR); xx=np.concatenate([x[-pad:],x,x[:pad]])
    return sg.filtfilt(b,a,xx)[pad:-pad]
def periodic(points):
    xs=[p[0] for p in points]+[T]; ys=[p[1] for p in points]+[points[0][1]]
    return CubicSpline(xs,ys,bc_type='periodic')(t)
def n2f(name):
    nm={'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}
    return 440.0*2**((nm[name[:-1]]+12*(int(name[-1])+1)-69)/12)*TUNE

# the tape: slow wow + flutter + a long drift, all whole cycles over the loop
def wow_at(ts):
    return (1.8*np.sin(2*np.pi*60*ts/T+0.7)
           +0.25*np.sin(2*np.pi*945*ts/T+2.1)
           +1.5*np.sin(2*np.pi*3*ts/T+4.0))/1200.0  # cents -> log2 units

# ---------------- harmony: A  E  F#  C#m, four bars each, four times round ----------------
CYCLE=[('A',['A2','C#3','E3','A3'],['G#3','B3','C#4','D#4']),
       ('E',['E2','G#2','B2','E3'],['G#3','B3','E4','C#4']),
       ('F#',['F#2','C#3','F#3','A3'],['A#3','C#4','F#4','G#3']),
       ('C#',['C#2','G#2','C#3','E3'],['G#3','B3','C#4','E4'])]
CHORDS=[CYCLE[i%4] for i in range(16)]       # 16 x 4 bars

# density / register / level arcs — the build is MORE NOTES, HIGHER TOPS
DENS =periodic([(0,.25),(25,.45),(55,.7),(85,.9),(108,1.0),(128,.7),(142,.35)])
RIDE =periodic([(0,.74),(30,.84),(60,.92),(100,1.0),(126,.9),(142,.76)])

# ---------------- the pluck ----------------
PART=[1.0,0.18,0.26,0.09,0.08,0.055,0.03,0.02]  # measured profile, tail kept short and clean
def pluck(f0,dur,vel,tstart):
    nlen=int(dur*SR); tt=np.arange(nlen)/SR
    w0=wow_at(tstart); w1=wow_at(tstart+dur*0.6)
    out=np.zeros(nlen)
    tau0=1.15*(110.0/f0)**0.3
    for k,ak in enumerate(PART,1):
        fk=f0*k*(1+3e-4*k*k)
        # linear tape-drift chirp across the note, phase in closed form
        fa=fk*2**w0; fb=fk*2**w1
        ph=2*np.pi*(fa*tt+0.5*(fb-fa)/max(dur*0.6,1e-3)*np.minimum(tt,dur*0.6)**2/ (dur*0.6))
        out+=ak*np.sin(ph+rng.uniform(0,2*np.pi))*np.exp(-tt/(tau0*k**-0.75))
    atk=int(0.012*SR)
    env=np.ones(nlen); env[:atk]=.5-.5*np.cos(np.pi*np.arange(atk)/atk)
    env[-int(.05*SR):]*=np.linspace(1,0,int(.05*SR))
    thump=rng.standard_normal(int(.02*SR))*np.exp(-np.arange(int(.02*SR))/SR*260)
    b,a=sg.butter(2,1100/(SR/2)); thump=sg.lfilter(b,a,thump)
    b,a=sg.butter(1,200/(SR/2),'high'); thump=sg.lfilter(b,a,thump)*0.22
    out*=env; out[:len(thump)]+=thump*vel
    return out*vel

# ---------------- the roll: eighths with sixteenth fills, seeded per bar ----------------
plL=np.zeros(N); plR=np.zeros(N)
events=0
for bar in range(64):
    ch=CHORDS[bar//4]; root,pool,ext=ch
    tb=bar*BAR
    d=DENS[int(tb*SR)%N]
    # base rolling shape over the pool, direction varies by bar
    order=[0,1,2,3,2,1,0,2] if (bar%3) else [0,2,1,3,1,2,0,1]
    for e in range(8):                        # eighth slots
        ts=tb+e*BEAT/2
        pos=order[e]
        name=pool[pos]
        # in the thick of it the top of the figure reaches up
        if d>0.55 and pos==3 and rng.random()<(d-0.4): name=ext[rng.integers(0,len(ext))]
        vel=(1.06 if e==0 else 0.9)+rng.uniform(-.08,.08)
        vel*=(0.55+0.45*d)
        f0=n2f(name)
        note=pluck(f0,3.2,vel,ts)
        pan=rng.uniform(-2.5,2.5)             # a gentle drift around centre
        gL=10**(+pan/40); gR=10**(-pan/40)
        a0=int(ts*SR); idx=np.arange(a0,a0+len(note))%N
        detL=2**(rng.uniform(-2,2)/1200); detR=2**(rng.uniform(-2,2)/1200)
        np.add.at(plL,idx,note*gL)
        nR=pluck(f0*detR/detL,3.2,vel,ts)     # a second string for the width
        np.add.at(plR,idx,nR*gR)
        events+=1
        # sixteenth pickup after this slot, more often as it builds
        if rng.random()<0.06+0.20*d:
            name2=pool[max(0,pos-1)]
            ts2=ts+BEAT/4
            n2=pluck(n2f(name2),2.6,vel*0.7,ts2)
            a2=int(ts2*SR); idx2=np.arange(a2,a2+len(n2))%N
            np.add.at(plL,idx2,n2*10**(-pan/40))
            np.add.at(plR,idx2,n2*10**(+pan/40))
            events+=1
print("note events:",events, f"({events/T:.2f}/s)")

# ---------------- the beats: a deep muffled kick, half-time and dark ----------------
BEATS=periodic([(0,.1),(18,.45),(40,.8),(70,1.0),(105,1.0),(128,.7),(142,.2)])
klen=int(0.55*SR); ktt=np.arange(klen)/SR
kfrq=38+57*np.exp(-ktt/0.032)               # a 95->38Hz fall: boom, not punch
kph=2*np.pi*np.cumsum(kfrq)/SR
KICK=np.sin(kph)*np.exp(-ktt/0.16)
KICK[:int(0.004*SR)]*=np.linspace(0,1,int(0.004*SR))
b,a=sg.butter(2,210/(SR/2)); KICK=sg.lfilter(b,a,KICK)
KICK/=np.abs(KICK).max()
kick=np.zeros(N); duck=np.zeros(N)
dlen=int(0.30*SR)
DUCK=np.exp(-np.arange(dlen)/SR/0.11)
for bar in range(64):
    tb=bar*BAR; g=BEATS[int(tb*SR)%N]
    if g<0.12: continue
    hits=[(0.0,1.0),(2.0,0.74)]
    if rng.random()<0.28: hits.append((3.5,0.4))
    for off,vel in hits:
        a0=int((tb+off*BEAT)*SR)
        idx=np.arange(a0,a0+klen)%N
        np.add.at(kick,idx,KICK*vel*g)
        di=np.arange(a0,a0+dlen)%N
        np.maximum.at(duck,di,DUCK*min(1,vel*g))

# ---------------- the bassline: the root held low, restruck, led round ----------------
bass=np.zeros(N)
def bnote(f0,ts,dur,vel):
    nlen=int(dur*SR); tt=np.arange(nlen)/SR
    w=(np.sin(2*np.pi*f0*2**wow_at(ts)*tt)
      +0.26*np.sin(2*np.pi*f0*2**wow_at(ts)*2*tt)
      +0.07*np.sin(2*np.pi*f0*2**wow_at(ts)*3*tt))
    env=np.ones(nlen)*np.exp(-tt/3.2)
    aN=int(.015*SR); env[:aN]*=np.linspace(0,1,aN)
    rN=int(.09*SR); env[-rN:]*=np.linspace(1,0,rN)
    a0=int(ts*SR); idx=np.arange(a0,a0+nlen)%N
    np.add.at(bass,idx,w*env*vel)
for bar in range(64):
    tb=bar*BAR
    _,pool,_=CHORDS[bar//4]
    fB=n2f(pool[0])/2                        # A1 / E1 / F#1 / C#1
    g=0.55+0.45*BEATS[int(tb*SR)%N]
    bnote(fB,tb,2.4*BEAT,0.9*g)
    if bar%4==3:                             # the turn: walk a fifth toward the next root
        bnote(fB*2**(7/12),tb+2.5*BEAT,1.4*BEAT,0.62*g)
    else:
        bnote(fB,tb+2.5*BEAT,1.4*BEAT,0.66*g)
b,a=sg.butter(2,300/(SR/2)); bass=cfilt(b,a,bass)
# the pocket: bass and drone breathe around the kick
bass*=(1-0.45*duck)

# ---------------- the drone: a dark ambient bed under the roll ----------------
drL=np.zeros(N); drR=np.zeros(N)
fadeD=int(4.0*SR)
envD=np.ones(int(4*BAR*SR)+fadeD)
envD[:fadeD]=.5-.5*np.cos(np.pi*np.arange(fadeD)/fadeD)
envD[-fadeD:]=np.minimum(envD[-fadeD:], .5+.5*np.cos(np.pi*np.arange(fadeD)/fadeD))
for ci in range(16):
    _,pool,_=CHORDS[ci]
    fD=n2f(pool[0])/2                      # an octave below the arp root
    a0=int(ci*4*BAR*SR)-fadeD//2
    seg=len(envD); tt=np.arange(seg)/SR
    absn=np.arange(a0,a0+seg)
    for buf in (drL,drR):
        for mult,amp,k in [(1,1.0,2),(2,0.5,3),(3,0.24,4),(1.5,0.34,5)]:
            det=1+rng.uniform(-6,6)*1e-4
            ph=rng.uniform(0,2*np.pi)
            breathe=1+0.13*np.sin(2*np.pi*k*absn/SR/T+ph)   # whole cycles over the loop
            w=(np.sin(2*np.pi*fD*mult*det*tt+ph)
              +0.35*np.sin(2*np.pi*fD*mult*det*2*tt+ph*2)
              +0.14*np.sin(2*np.pi*fD*mult*det*3*tt+ph*3))*amp
            np.add.at(buf, absn%N, w*envD*breathe*0.12)
b,a=sg.butter(2,560/(SR/2)); drL=cfilt(b,a,drL); drR=cfilt(b,a,drR)
drL*= (0.7+0.3*RIDE)*(1-0.32*duck); drR*=(0.7+0.3*RIDE)*(1-0.32*duck)

b,a=sg.butter(1,5200/(SR/2)); plL=cfilt(b,a,plL); plR=cfilt(b,a,plR)

# ---------------- the surface: hiss + crackle ----------------
hiss=rng.standard_normal(N)
b,a=sg.butter(2,12000/(SR/2)); hiss=cfilt(b,a,hiss)
b,a=sg.butter(2,1200/(SR/2),'high'); hiss=cfilt(b,a,hiss)
hiss*=10**(-60/20)*(1+0.25*np.sin(2*np.pi*60*t/T))
ncr=int(7*T)
crk=np.zeros(N)
pos=rng.integers(0,N,ncr); amp=rng.random(ncr)**3.2
for p,am in zip(pos,amp):
    ln=rng.integers(2,9)
    crk[(p+np.arange(ln))%N]+=(rng.random(ln)-.5)*am
b,a=sg.butter(2,[1800/(SR/2),9000/(SR/2)],'band'); crk=cfilt(b,a,crk)
crk*=10**(-47/20)/max(1e-9,np.sqrt((crk**2).mean()))

# ---------------- space: two dark rooms, one per side ----------------
def circ_reverb(x,sec,damp,seed):
    r2=np.random.default_rng(seed)
    ir=r2.standard_normal(int(sec*SR))*np.exp(-np.arange(int(sec*SR))/SR*(6.9/sec))
    b,a=sg.butter(1,damp/(SR/2)); ir=sg.lfilter(b,a,ir)
    ir/=np.sqrt((ir**2).sum())
    return np.fft.irfft(np.fft.rfft(x)*np.fft.rfft(ir,N),N)
wetL=circ_reverb(plL+plR*0.3+drL*0.3,2.2,3300,21)
wetR=circ_reverb(plR+plL*0.3+drR*0.3,2.25,3300,22)

L=(plL*(1-0.12*duck)+bass*1.2+kick*1.05+drL*1.3+wetL*.36+hiss+crk)*RIDE
R=(plR*(1-0.12*duck)+bass*1.2+kick*1.05+drR*1.3+wetR*.36+hiss+crk*0.92)*RIDE

# ---------------- the tape: the notes are driven INTO the medium ----------------
# The reference masters at 0dBFS with its mids full of low-order harmonics
# of the plucks — saturation is where that ladder comes from, so the whole
# bus (notes, room, surface) goes through it, per channel.
drive=1.7; blend=0.38
L=blend*np.tanh(L*drive)/drive+(1-blend)*L
R=blend*np.tanh(R*drive)/drive+(1-blend)*R
# the macro arc again, gently, on the far side of the tape
L*=RIDE**0.8; R*=RIDE**0.8
# ---------------- match EQ: the reference's own long-term curve is the target ----------------
# Measured tilt, not content: Welch PSDs of both signals, the smoothed ratio
# becomes a zero-phase correction applied circularly, so the seam survives.
# reference WAV (stereo 16-bit 44.1k) as argv[2]; without it the EQ is skipped
import wave as _w
REF=sys.argv[2] if len(sys.argv)>2 else None
if REF:
    _f=_w.open(REF,'rb')
    _x=np.frombuffer(_f.readframes(_f.getnframes()),dtype=np.int16).astype(np.float64)/32768.0
    _f.close(); _ref=_x.reshape(-1,2).mean(1)
    fr,Pr=sg.welch(_ref,SR,nperseg=8192)
if REF:
    fm,Pm=sg.welch((L+R)/2,SR,nperseg=8192)
    ratio=np.sqrt((Pr+1e-16)/(Pm+1e-16))
    # smooth in log frequency, sixth-octave-ish
    lf=np.log(np.maximum(fr,1))
    sm=np.copy(ratio)
    for i in range(len(ratio)):
        m=np.abs(lf-lf[i])<0.12
        sm[i]=np.exp(np.mean(np.log(ratio[m]+1e-12)))
    sm[fr>300]*=10**(1.0/20)
    # The EQ serves the reference only where the pluck lives. Below 260Hz
    # the mix is a deliberate departure (the drone bed the reference does
    # not have) — hands off; above 2k it may clean, never brighten.
    sm[fr<260]=1.0
    sm[fr>2000]=np.minimum(sm[fr>2000],1.0)
    sm=np.clip(sm,10**(-6/20),10**(6/20))
    H=np.interp(np.fft.rfftfreq(N,1/SR),fr,sm)
    L=np.fft.irfft(np.fft.rfft(L)*H,N)
    R=np.fft.irfft(np.fft.rfft(R)*H,N)
mix=np.stack([L,R],1)
# ---------------- master to the reference's density: hot into a soft ceiling ----------------
def frame_rms_db(m):
    mo=m.mean(1); hop=1024; win=2048
    nf=(len(mo)-win)//hop
    fr=np.lib.stride_tricks.as_strided(mo,(nf,win),(mo.strides[0]*hop,mo.strides[0]))
    return 20*np.log10(np.sqrt((fr**2).mean(1)).mean()+1e-9)
mix*=10**((-16.1-frame_rms_db(mix))/20)
mix=np.tanh(mix*1.18)/np.tanh(1.18)
mix*=10**((-16.1-frame_rms_db(mix))/20)
pk=np.abs(mix).max()
if pk>0.995: mix*=0.995/pk
print(f"peak {np.abs(mix).max():.3f} rms {20*np.log10(np.sqrt((mix**2).mean())):.1f} dBFS")
print("seam delta:",float(np.abs(mix[0]-mix[-1]).max()),"typ",float(np.abs(np.diff(mix[:SR,0])).mean()))
out=(mix*32767).astype(np.int16)
w=wave.open(sys.argv[1],'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes(out.tobytes()); w.close()
print("wrote",sys.argv[1])
