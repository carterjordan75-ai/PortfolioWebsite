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

# ---------------- harmony: C#m home, then bVI iv v — all shadow, no lift ----------------
# The old cycle (A E F#m C#m) was I-V-vi-iii of A major: hope, however
# dressed. This one never leaves C# minor's gravity.
CYCLE=[('C#',['C#2','G#2','C#3','E3'],['G#2','B2','C#3','E3']),
       ('A',['A2','E3','A3','B3'],['E3','G#3','A3','B3']),
       ('F#',['F#2','C#3','F#3','A3'],['C#3','F#3','G#3','A3']),
       ('G#',['G#2','D#3','G#3','B3'],['D#3','G#3','B3','C#4'])]
CHORDS=[CYCLE[i%4] for i in range(16)]       # 16 x 4 bars

# density arc — the roll is embers now, not an engine: sparse glints
# that gather toward the middle and recede again
DENS =periodic([(0,.12),(25,.22),(55,.38),(85,.52),(108,.55),(128,.32),(142,.14)])
RIDE =periodic([(0,.74),(30,.84),(60,.92),(100,1.0),(126,.9),(142,.76)])

# ---------------- the pluck ----------------
# Subtractive, not struck: a saw-rich source through a resonant low-pass
# that opens at the strike and closes into the dark — the filter envelope
# is what makes it read as a synthesizer rather than a piano. A quiet
# sub-octave sine sits under each note for synth weight.
def pluck(f0,dur,vel,tstart):
    nlen=int(dur*SR); tt=np.arange(nlen)/SR
    w0=wow_at(tstart); w1=wow_at(tstart+dur*0.6)
    out=np.zeros(nlen)
    fc=130+260*np.exp(-tt/0.16)
    amp=np.exp(-tt/1.5)
    for k in range(1,15):
        fk=f0*k
        if fk>2400: break
        fa=fk*2**w0; fb=fk*2**w1
        ph=2*np.pi*(fa*tt+0.5*(fb-fa)/max(dur*0.6,1e-3)*np.minimum(tt,dur*0.6)**2/(dur*0.6))
        g=1.0/(1.0+(fk/fc)**4)+0.5*np.exp(-((fk-fc)/(0.22*fc))**2)
        out+=np.sin(ph+0.7*k)/k**0.9*g
    out+=0.4*np.sin(2*np.pi*f0/2*2**w0*tt)
    atk=int(0.006*SR)
    env=np.ones(nlen); env[:atk]=.5-.5*np.cos(np.pi*np.arange(atk)/atk)
    env[-int(.05*SR):]*=np.linspace(1,0,int(.05*SR))
    return out*env*amp*vel

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
        # embers: only the downbeat and half-bar are certain; the rest
        # of the figure fires only as the arc thickens
        if e not in (0,4) and rng.random()>(0.18+0.72*d): continue
        # tolls, not taps: the figure never reaches the top of the pool,
        # never leaps an octave, never sparkles — it circles the low notes
        pos=min(pos,2)
        name=pool[pos]
        vel=(1.06 if e==0 else 0.9)+rng.uniform(-.08,.08)
        vel*=(0.5+0.4*d)
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
        if rng.random()<0.02+0.10*d:
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
klen=int(0.72*SR); ktt=np.arange(klen)/SR
kfrq=33+62*np.exp(-ktt/0.030)               # a 95->33Hz fall: boom, not punch
kph=2*np.pi*np.cumsum(kfrq)/SR
KICK=np.sin(kph)*np.exp(-ktt/0.24)
KICK[:int(0.004*SR)]*=np.linspace(0,1,int(0.004*SR))
b,a=sg.butter(2,170/(SR/2)); KICK=sg.lfilter(b,a,KICK)
KICK/=np.abs(KICK).max()
kick=np.zeros(N); duck=np.zeros(N)
dlen=int(0.30*SR)
DUCK=np.exp(-np.arange(dlen)/SR/0.11)
for bar in range(64):
    tb=bar*BAR; g=BEATS[int(tb*SR)%N]
    if g<0.12: continue
    hits=[(0.0,1.0),(2.0,0.74)]
    if rng.random()<0.2: hits.append((3.5,0.4))
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
bass*=(1-0.52*duck)

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
        for mult,amp,k in [(1,1.45,2),(2,0.42,3),(3,0.10,4),(1.5,0.30,5)]:
            det=1+rng.uniform(-6,6)*1e-4
            ph=rng.uniform(0,2*np.pi)
            breathe=1+0.2*np.sin(2*np.pi*k*absn/SR/T+ph)    # whole cycles over the loop
            w=(np.sin(2*np.pi*fD*mult*det*tt+ph)
              +0.22*np.sin(2*np.pi*fD*mult*det*2*tt+ph*2)
              +0.06*np.sin(2*np.pi*fD*mult*det*3*tt+ph*3))*amp
            np.add.at(buf, absn%N, w*envD*breathe*0.12)
b,a=sg.butter(2,380/(SR/2)); drL=cfilt(b,a,drL); drR=cfilt(b,a,drR)
drL*= (0.7+0.3*RIDE)*(1-0.38*duck); drR*=(0.7+0.3*RIDE)*(1-0.38*duck)

b,a=sg.butter(1,1300/(SR/2)); plL=cfilt(b,a,plL); plR=cfilt(b,a,plR)

# ---------------- the surface: hiss + crackle ----------------
hiss=rng.standard_normal(N)
b,a=sg.butter(2,8000/(SR/2)); hiss=cfilt(b,a,hiss)
b,a=sg.butter(2,1200/(SR/2),'high'); hiss=cfilt(b,a,hiss)
hiss*=10**(-70/20)*(1+0.25*np.sin(2*np.pi*60*t/T))
ncr=int(7*T)
crk=np.zeros(N)
pos=rng.integers(0,N,ncr); amp=rng.random(ncr)**3.2
for p,am in zip(pos,amp):
    ln=rng.integers(2,9)
    crk[(p+np.arange(ln))%N]+=(rng.random(ln)-.5)*am
b,a=sg.butter(2,[1800/(SR/2),9000/(SR/2)],'band'); crk=cfilt(b,a,crk)
crk*=10**(-56/20)/max(1e-9,np.sqrt((crk**2).mean()))

# ---------------- the strings: a large section, swelling with the build ----------------
STR=periodic([(0,.3),(14,.55),(38,.85),(68,1.0),(108,1.0),(126,.85),(140,.4)])
SV=[['C#2','G#2','C#3','E3'],  # C#m — the cellar itself
    ['A2','E3','A3','B3'],     # A add9, no bright third on top
    ['F#2','C#3','F#3','A3'],  # F#m
    ['G#2','D#3','G#3','B3']]  # G#m
# the section's voice, rewritten: no soprano, no singing — a low chant
# of two falling notes per chord, each pair sinking. Falling is the
# whole gesture of the piece now.
LINE=[['E3','C#3'],['C#3','B2'],['A2','G#2'],['B2','G#2']]
stL=np.zeros(N); stR=np.zeros(N)
fadeS2=int(3.5*SR)
def ensemble(fv,seg,tt,depth=0.13,nmax=10,fmax=3800):
    ens=np.zeros(seg)
    for _ in range(2):
        det=2**(rng.uniform(-13,13)/1200)
        phv=rng.uniform(0,2*np.pi)
        vib=depth*np.minimum(1,tt/2.5)*np.sin(2*np.pi*5.1*tt+phv)
        k=1; wv=np.zeros(seg)
        while fv*det*k<fmax and k<=nmax:
            wv+=np.sin(2*np.pi*fv*det*k*tt+phv*k+vib*k)/k**1.05
            k+=1
        ens+=wv
    return ens
envS=np.ones(int(4*BAR*SR)+fadeS2)
envS[:fadeS2]=.5-.5*np.cos(np.pi*np.arange(fadeS2)/fadeS2)
envS[-fadeS2:]=np.minimum(envS[-fadeS2:], .5+.5*np.cos(np.pi*np.arange(fadeS2)/fadeS2))
envH=np.ones(int(2*BAR*SR)+fadeS2)
envH[:fadeS2]=.5-.5*np.cos(np.pi*np.arange(fadeS2)/fadeS2)
envH[-fadeS2:]=np.minimum(envH[-fadeS2:], .5+.5*np.cos(np.pi*np.arange(fadeS2)/fadeS2))
for ci in range(16):
    a0=int(ci*4*BAR*SR)-fadeS2//2
    seg=len(envS); tt=np.arange(seg)/SR
    absn=np.arange(a0,a0+seg)
    for vi,vn in enumerate(SV[ci%4]):         # the pad beneath, cellar-doubled
        fv=n2f(vn)
        for buf in (stL,stR):
            w=ensemble(fv,seg,tt)*0.055
            if vi<2:                          # the two lowest voices sink an octave further
                w+=ensemble(fv/2,seg,tt,depth=0.1,nmax=8,fmax=1400)*0.11
            np.add.at(buf, absn%N, w*envS)
    for h,vn in enumerate(LINE[ci%4]):        # the line above, octave-doubled
        fv=n2f(vn)
        aH=int((ci*4+h*2)*BAR*SR)-fadeS2//2
        segH=len(envH); ttH=np.arange(segH)/SR
        absH=np.arange(aH,aH+segH)
        for buf in (stL,stR):
            w=(ensemble(fv,segH,ttH,depth=0.2,nmax=8,fmax=3200)
              +0.9*ensemble(fv/2,segH,ttH,depth=0.16,nmax=8,fmax=2200))
            np.add.at(buf, absH%N, w*envH*0.11)
    for buf in (stL,stR):                     # the bow's breath, kept low
        nz=rng.standard_normal(seg)
        b,a=sg.butter(2,[600/(SR/2),2400/(SR/2)],'band')
        np.add.at(buf, absn%N, sg.lfilter(b,a,nz)*envS*0.012)
b,a=sg.butter(1,1800/(SR/2)); stL=cfilt(b,a,stL); stR=cfilt(b,a,stR)
stL*=STR*(1-0.25*duck); stR*=STR*(1-0.25*duck)

# ---------------- low brass: deep swells at the turns ----------------
# A bass-trombone-and-tuba shape: the root an octave down, harmonics
# that BLOOM through the swell (brightness arriving with force, the
# brass crescendo), a slow growl on the upper partials, gone again
# over four seconds. Eight swells, riding the build — the low brass is
# now a pillar of the piece, not an ornament.
brL=np.zeros(N); brR=np.zeros(N); bduck=np.zeros(N)
BRS=[(8,.45),(16,.62),(24,.78),(32,.9),(40,1.0),(48,.95),(56,.7),(61,.5)]
for barB,bamp in BRS:
    _,poolB,_=CHORDS[(barB//4)%16]
    fB=n2f(poolB[0])/2
    dB=10.0; nlen=int(dB*SR); tt=np.arange(nlen)/SR
    att=4.5; relB=3.6
    env=np.minimum(tt/att,1)**1.5*np.clip((dB-tt)/relB,0,1)**1.2
    a0d=int(barB*BAR*SR)
    np.maximum.at(bduck,(np.arange(a0d,a0d+nlen))%N,env*bamp)
    for buf,detc in ((brL,-3),(brR,3)):
        det=2**(detc/1200)
        w=np.zeros(nlen)
        for k in range(1,10):
            bloom=np.clip(np.minimum(tt/att,1)*1.35-k*0.09,0,1)
            growl=1+0.03*np.sin(2*np.pi*5.2*tt+k)* (k/9)
            w+=np.sin(2*np.pi*fB*det*k*tt+0.6*k)/k**0.8*bloom*growl*(1.4 if 2<=k<=6 else 1.0)
        a0=int(barB*BAR*SR); idx=np.arange(a0,a0+nlen)%N
        np.add.at(buf,idx,w*env*0.72*bamp)
b,a=sg.butter(2,850/(SR/2)); brL=cfilt(b,a,brL); brR=cfilt(b,a,brR)

# ---------------- the rumble: the floor of the piece ----------------
# Distant weather under everything: hard-lowpassed noise heaving on
# slow irregular swells that never repeat inside the loop, driven just
# hard enough that its upper edge (80-160Hz) reads on small speakers.
# This is the unease — the piece must never quite sit still.
rmb=rng.standard_normal(N)
b,a=sg.butter(4,70/(SR/2)); rmb=cfilt(b,a,rmb)
rmb/=np.sqrt((rmb**2).mean())
SWELL=periodic([(0,.5),(19,.95),(37,.45),(58,1.0),(83,.55),(104,.9),(122,.4),(139,.75)])
churn=1+0.22*np.sin(2*np.pi*7*t/T+1.3)+0.14*np.sin(2*np.pi*11*t/T+4.1)
rmb*=np.clip(SWELL,0,None)*churn
rmb=np.tanh(rmb*2.2)/2.2
b,a=sg.butter(2,140/(SR/2)); rmb=cfilt(b,a,rmb)
rmbBed=rmb*2.0*(1-0.3*duck)*(1-0.25*bduck)

# ---------------- squeaks passing through ----------------
# Brief resonant glides that fade in, sweep past — pitch falling a
# touch, pan crossing the field — and are gone: something driving by.
sqL=np.zeros(N); sqR=np.zeros(N)
# Retired: every pass whistled or moaned its way into notice — the
# piece wants nothing arriving that isn't music or memory.
SQK=[]
for tS,dS,fa,fb,pd in SQK:
    nlen=int(dS*SR); tt=np.arange(nlen)/SR
    gl=(fa+(fb-fa)*(tt/dS))*(1-0.05*tt/dS)          # the pass drops the pitch
    ph=2*np.pi*np.cumsum(gl)/SR
    w=np.sin(ph+0.25*np.sin(2*np.pi*6.3*tt))+0.35*np.sin(2*ph)
    env=np.minimum(tt/(dS*0.62),1)**1.6
    env*=np.clip((dS-tt)/(dS*0.14),0,1)             # quick out
    pan=np.linspace(-pd,pd,nlen)*0.9
    a0=int(tS*SR); idx=np.arange(a0,a0+nlen)%N
    np.add.at(sqL,idx,w*env*0.02*np.sqrt((1-pan)/2))
    np.add.at(sqR,idx,w*env*0.02*np.sqrt((1+pan)/2))

# ---------------- the voices: a home tape playing in the next room ----------------
# No real recording is sampled: unintelligible speech is synthesised —
# a jittering glottal pulse through three wandering formants, gated at
# syllable cadence — then narrowed, driven hard and given dropouts, so
# it reads as a distorted home movie heard through a wall.
def murmur(dur, f0base, seed, mode='talk'):
    r=np.random.default_rng(seed)
    nlen=int(dur*SR); tt=np.arange(nlen)/SR
    gate=np.zeros(nlen); f0=np.full(nlen,float(f0base))
    if mode=='laugh':
        # a young laugh: staccato voiced bursts, each bout falling in
        # pitch and force, a breath between bouts
        rate=r.uniform(4.2,5.4); per=1.0/rate
        pos=r.uniform(0.05,0.15)
        while pos<dur-0.2:
            nb=int(r.integers(4,8))
            for bi in range(nb):
                if pos>=dur-0.15: break
                blen=per*r.uniform(0.42,0.55)
                i0,i1=int(pos*SR),int(min((pos+blen)*SR,nlen))
                if i1-i0>3:
                    gate[i0:i1]=np.maximum(gate[i0:i1],np.hanning(i1-i0)**0.7*(0.95-0.09*bi)*r.uniform(0.85,1.0))
                    f0[i0:i1]=f0base*(1.28-0.05*bi)*np.linspace(1.06,0.92,i1-i0)
                pos+=per*r.uniform(0.92,1.08)
            pos+=r.uniform(0.5,0.95)
        FORM=[(450,950),(1500,2800),(2900,3500)]; BAND=(350,3400)
    else:
        pos=0.0
        while pos<dur-0.15:
            slen=r.uniform(0.09,0.28)
            if r.random()<0.82:
                i0,i1=int(pos*SR),int(min((pos+slen)*SR,nlen))
                if i1-i0>2: gate[i0:i1]=np.maximum(gate[i0:i1],np.hanning(i1-i0)*r.uniform(0.5,1.0))
            pos+=slen*r.uniform(1.0,1.6)
        f0=f0base*(1+0.06*np.sin(2*np.pi*r.uniform(2,3.4)*tt)+np.cumsum(r.normal(0,0.01,nlen))*0.0004)
        FORM=[(320,780),(900,1900),(2300,2900)]; BAND=(280,2700)
    ph=2*np.pi*np.cumsum(f0)/SR
    src=np.diff(np.concatenate([[0],(sg.square(ph,duty=0.3)*0.5+0.5)]))
    src+=r.standard_normal(nlen)*0.02
    out=np.zeros(nlen)
    for lo,hi in FORM:
        fcv=lo+(hi-lo)*(0.5+0.5*np.sin(2*np.pi*r.uniform(0.6,1.7)*tt+r.uniform(0,6)))
        blk=int(0.03*SR); y=np.zeros(nlen); zi=np.zeros(2)
        for i0 in range(0,nlen,blk):
            b,a=sg.iirpeak(float(fcv[min(i0,nlen-1)])/(SR/2),4)
            y[i0:i0+blk],zi=sg.lfilter(b,a,src[i0:i0+blk],zi=zi)
        out+=y
    out*=gate
    b,a=sg.butter(2,[BAND[0]/(SR/2),BAND[1]/(SR/2)],'band'); out=sg.lfilter(b,a,out)
    out/=np.sqrt((out**2).mean())+1e-9
    out=np.tanh(out*2.6)/2.0
    drop=np.clip(np.sin(2*np.pi*r.uniform(0.5,1.3)*tt+r.uniform(0,6))*3+0.6,0,1)
    return out*drop

def radiocut(seed):
    # the dial finds the channel: chopped static, a heterodyne whistle
    # falling in, a click of the switch
    r=np.random.default_rng(seed)
    dur=r.uniform(0.35,0.8); nlen=int(dur*SR); tt=np.arange(nlen)/SR
    nz=r.standard_normal(nlen)
    b,a=sg.butter(2,[500/(SR/2),2200/(SR/2)],'band'); nz=sg.lfilter(b,a,nz)
    gate=(np.sin(2*np.pi*r.uniform(8,18)*tt+r.uniform(0,6))>r.uniform(-0.4,0.2)).astype(float)
    out=nz*gate*0.8
    fw0=r.uniform(700,1100); fw1=r.uniform(200,400)
    out+=np.sin(2*np.pi*(fw0*tt+(fw1-fw0)*tt**2/(2*dur)))*np.exp(-tt/(dur*0.5))*0.15
    out[:int(0.004*SR)]+=r.standard_normal(int(0.004*SR))*0.9
    out=np.tanh(out*3)/2.2
    out[-int(0.05*SR):]*=np.linspace(1,0,int(0.05*SR))
    return out

# Real tape, when there is any: WAV clips dropped into tools/audio/tape/
# are wrecked through the same chain and take over the talk slots, in
# order. The laughs stay synthetic unless a clip is named *laugh*.
# Only material the owner has rights to belongs in that folder.
import os as _os
from scipy.io import wavfile as _wf
TAPE=[]
_td=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),'tape')
if _os.path.isdir(_td):
    for _fn in sorted(_os.listdir(_td)):
        if _fn.lower().endswith('.wav'):
            _sr2,_x2=_wf.read(_os.path.join(_td,_fn))
            _x2=_x2.astype(np.float64)/32768.0
            if _x2.ndim>1: _x2=_x2.mean(1)
            if _sr2!=SR: _x2=sg.resample(_x2,int(len(_x2)*SR/_sr2))
            TAPE.append((_fn,_x2))
def wreck(x, seed, clar=0.5):
    # clarity 0..1: buried and chewed at 0, almost readable at 1
    r=np.random.default_rng(seed)
    # the memory plays slow: pitched down 10-20%, formants sinking with it
    y=sg.resample(x,int(len(x)*r.uniform(1.10,1.22)))
    nlen=len(y); tt=np.arange(nlen)/SR
    lo=300-160*clar; hi=1050+850*clar
    b,a=sg.butter(2,[lo/(SR/2),hi/(SR/2)],'band'); y=sg.lfilter(b,a,y)
    y/=np.sqrt((y**2).mean())+1e-9
    y=np.tanh(y*(2.3-1.0*clar))/2.0
    y*= (0.9+0.2*clar)
    drop=np.clip(np.sin(2*np.pi*r.uniform(0.5,1.3)*tt+r.uniform(0,6))*(2.6-1.6*clar)+(0.55+0.35*clar),0.25,1)
    # a memory surfaces and sinks: a slow rise in, a slower exhale out
    env=np.ones(nlen)
    fi=min(int(0.6*SR),nlen//4); env[:fi]=.5-.5*np.cos(np.pi*np.arange(fi)/fi)
    fo=min(int(3.4*SR),int(nlen*0.6)); env[-fo:]=(0.5+0.5*np.cos(np.pi*np.arange(fo)/fo))**1.6
    return y*drop*env
voxL=np.zeros(N); voxR=np.zeros(N)
#     bar   dur   f0  mode    amp  radio-cut first
#     bar   dur   f0  mode    amp  radio  clarity
VOX=[( 4,  4.0, 120,'talk', 0.80,False, 0.25),
     (12,  4.0, 150,'talk', 0.78,False, 0.42),
     (21,  4.0, 176,'talk', 0.82,False, 0.18),
     (29,  4.0, 124,'talk', 0.80,False, 0.52),
     (38,  4.0, 140,'talk', 0.85,False, 0.35),
     (46,  4.0, 182,'talk', 0.78,False, 0.45),
     (54,  4.0, 345,'talk', 0.82,False, 0.28),
     (60,  4.0, 112,'talk', 0.80,False, 0.50)]
vdk=np.zeros(N)
ti=0
for barAt,vdur,vf0,vmode,vamp,vradio,vclar in VOX:
    if TAPE:
        # fleeting: not the phrase, a fragment of it — two to four
        # seconds surfacing from somewhere inside the clip, then gone
        rV=np.random.default_rng(int(barAt*11+vf0))
        srcT=TAPE[ti%len(TAPE)][1]
        wlen=int(rV.uniform(2.2,3.8)*SR)
        stT=int(rV.uniform(0,max(1,len(srcT)-wlen)))
        ph0=wreck(srcT[stT:stT+wlen], int(barAt*7+vf0), vclar); ti+=1
    else:
        ph0=murmur(vdur,vf0,int(barAt*7+vf0),vmode)
    # the music leans back while the tape speaks
    a0v=int(barAt*BAR*SR); att=int(0.18*SR); rel=int(1.3*SR); nv=len(ph0)
    tz=np.ones(nv+rel); tz[:att]=np.linspace(0,1,att); tz[nv:]=np.linspace(1,0,rel)
    np.maximum.at(vdk,(np.arange(a0v,a0v+nv+rel))%N,tz)
    a0=int(barAt*BAR*SR); idx=np.arange(a0,a0+len(ph0))%N
    pv=rng.uniform(-3,3)
    np.add.at(voxL,idx,ph0*0.23*vamp*10**(+pv/40))
    np.add.at(voxR,idx,ph0*0.23*vamp*10**(-pv/40))
    if vradio:
        rc=radiocut(int(barAt*13+7))
        ar=a0-len(rc)-int(0.12*SR)
        idr=np.arange(ar,ar+len(rc))%N
        np.add.at(voxL,idr,rc*0.22*vamp*10**(+pv/40))
        np.add.at(voxR,idr,rc*0.22*vamp*10**(-pv/40))

# the memory: each phrase trails away in darkened, quieter repeats —
# circular, so a tail crossing the seam simply arrives at the start
def mem_echo(x):
    b,a=sg.butter(1,1100/(SR/2))
    e=np.zeros(N); y=x.copy(); d=int(0.43*SR)
    for k in range(5):
        y=cfilt(b,a,np.roll(y,d))*0.5
        e+=y
    return e
voxL+=mem_echo(voxL); voxR+=mem_echo(voxR)

# ---------------- space: two dark rooms, one per side ----------------
def circ_reverb(x,sec,damp,seed):
    r2=np.random.default_rng(seed)
    ir=r2.standard_normal(int(sec*SR))*np.exp(-np.arange(int(sec*SR))/SR*(6.9/sec))
    b,a=sg.butter(1,damp/(SR/2)); ir=sg.lfilter(b,a,ir)
    ir/=np.sqrt((ir**2).sum())
    return np.fft.irfft(np.fft.rfft(x)*np.fft.rfft(ir,N),N)
wetL=circ_reverb(plL+plR*0.3+drL*0.3+stL*1.3+brL*0.5+sqL*1.2+voxL*3.2,2.8,1400,21)
wetR=circ_reverb(plR+plL*0.3+drR*0.3+stR*1.3+brR*0.5+sqR*1.2+voxR*3.2,2.85,1400,22)

L=((plL*(1-0.15*duck)+stL*7.5+wetL*.36)*(1-0.24*vdk)+bass*1.6*(1-0.24*bduck)+kick*1.85+drL*3.7*(1-0.18*vdk)*(1-0.2*bduck)+brL*(1-0.25*vdk)+rmbBed+sqL+hiss+crk)*RIDE
R=((plR*(1-0.15*duck)+stR*7.5+wetR*.36)*(1-0.24*vdk)+bass*1.6*(1-0.24*bduck)+kick*1.85+drR*3.7*(1-0.18*vdk)*(1-0.2*bduck)+brR*(1-0.25*vdk)+rmbBed+sqR+hiss+crk*0.92)*RIDE

# ---------------- the tape: the notes are driven INTO the medium ----------------
# The reference masters at 0dBFS with its mids full of low-order harmonics
# of the plucks — saturation is where that ladder comes from, so the whole
# bus (notes, room, surface) goes through it, per channel.
drive=1.7; blend=0.38
L=blend*np.tanh(L*drive)/drive+(1-blend)*L
R=blend*np.tanh(R*drive)/drive+(1-blend)*R
# the macro arc again, gently, on the far side of the tape
L*=RIDE**0.8; R*=RIDE**0.8
# and the whole thing leans dark: one gentle pole across the master
b,a=sg.butter(1,2100/(SR/2)); L=cfilt(b,a,L); R=cfilt(b,a,R)
# (The match EQ that once pinned the bus to the reference's curve is
# retired: the piece has been steered well away from the reference by
# ear — strings, kicks, voices — and the EQ was quietly undoing every
# addition inside its band. The reference now lives on in the sources:
# key, register, tempo, density, level and arc.)
# The voices are a CUT-IN, not part of the tonal bed: they join after
# the match EQ (which, given a reference with no voices in it, would
# dutifully remove them) and ride only the final trims.
L+=voxL*1.9; R+=voxR*1.9
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
