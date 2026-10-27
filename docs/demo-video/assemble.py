"""Usage: python3 assemble2.py <video_dir> <narration en|he> <out.mp4>
Cuts the recorded scene windows (dropping page loads and waits), joins them, and lays each narration
sentence at the start of its scene, so the voice never stops."""
import json, subprocess, sys, glob
vdir, narr, out = sys.argv[1:4]
scenes = json.load(open(f"{vdir}/scenes.json"))
webm = glob.glob(f"{vdir}/*.webm")[0]
BOUNDS = {
    "en": [0, 4.87, 13.45, 18.22, 23.22, 28.09, 34.97, 38.11],
    "he": [0, 4.96, 13.47, 18.57, 23.40, 28.66, 35.95, 38.93],
}[narr]
mp3 = f"/tmp/claude-0/-home-user-studyspot/eb713306-e758-579b-ae3b-e9afc86229a1/scratchpad/audio2/{narr}.mp3"
vf, vl, af, al, t = [], [], [], [], 0.0
for i, sc in enumerate(scenes):
    d = sc["end"] - sc["start"]
    vf.append(f"[0:v]trim=start={sc['start']:.3f}:end={sc['end']:.3f},setpts=PTS-STARTPTS[v{i}]"); vl.append(f"[v{i}]")
    a, b = BOUNDS[i], BOUNDS[i + 1]
    assert b - a <= d - 0.15, (sc["name"], b - a, d)
    delay = int((t + 0.15) * 1000)
    af.append(f"[1:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,adelay={delay}|{delay}[a{i}]"); al.append(f"[a{i}]")
    t += d
fc = ";".join(vf + af) + ";" + "".join(vl) + f"concat=n={len(vl)}:v=1:a=0[vout];" + "".join(al) + f"amix=inputs={len(al)}:normalize=0,loudnorm=I=-16:TP=-1.5[aout]"
subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", webm, "-i", mp3, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-t", f"{t:.2f}", "-movflags", "+faststart", out])
print("wrote", out, f"{t:.1f}s")
