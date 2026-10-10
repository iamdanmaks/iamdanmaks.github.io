"""Генерує озвучку розділу лекції через ElevenLabs.

Вхід:  narration/<lecture>/<section>.txt — текст, який говорить лектор,
       з маркерами дій [[дія|аргумент|...]], наприклад [[hl|#s4 .demo]],
       [[set|#lkT|6|2500]], [[call|lkQ|1.25|1.15|900]], [[click|#btn]], [[unhl]].
Вихід: audio/<lecture>/<section>.mp3       — звук,
       audio/<lecture>/<section>.cues.js   — таймінги дій, субтитрів і слів (JS, а не JSON,
                                             щоб сторінка працювала і з file://),
       audio/<lecture>/<section>.align.json — посимвольне вирівнювання від TTS; з ним
                                             зміна лише маркерів не потребує нового TTS.

Запуск: python3 tools/narrate.py narration/05-attention-transformers/s4.txt [--force]
Ключ береться з ELEVEN_LABS_API_KEY (оточення або .env у корені репозиторію).
Для синхронізації зі звуком потрібен декодер MP3: pip install miniaudio
"""
import base64, hashlib, json, os, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"  # premade "George"
MODEL_ID = "eleven_v3"
CHUNK = 2400  # символів на запит; ліміт eleven_v3 — близько 3000
LANG = "uk"
MARK = re.compile(r"\[\[(.*?)\]\]")


def api_key():
    if os.environ.get("ELEVEN_LABS_API_KEY"):
        return os.environ["ELEVEN_LABS_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            k, _, v = line.partition("=")
            if k.strip() == "ELEVEN_LABS_API_KEY":
                return v.strip().strip('"\'')
    sys.exit("ELEVEN_LABS_API_KEY not set")


def parse(src):
    """Прибирає маркери; повертає чистий текст і дії з позиціями в ньому."""
    out, cues, pos = "", [], 0
    for m in MARK.finditer(src):
        piece = src[pos:m.start()]
        if not out or out[-1].isspace():
            piece = piece.lstrip(" ")
        out += piece
        cues.append({"at": len(out), "do": [a.strip() for a in m.group(1).split("|")]})
        pos = m.end()
    piece = src[pos:]
    if out and out[-1].isspace():
        piece = piece.lstrip(" ")
    return (out + piece).strip(), cues


def tts_one(text):
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": MODEL_ID, "language_code": LANG}).encode(),
        headers={"xi-api-key": api_key(), "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        res = json.load(r)
    al = res["alignment"]
    if "".join(al["characters"]) != text:
        sys.exit("alignment does not match input text")
    return base64.b64decode(res["audio_base64"]), al["character_start_times_seconds"], al["character_end_times_seconds"]


def clean_mp3(b):
    """Прибирає теги ID3 і службові кадри Xing/Info, лишає чистий потік CBR-кадрів.
    Info-кадр першого шматка описує лише його довжину, і плеєри, що йому вірять,
    перемотують склеєний файл не туди. Повертає (байти, кількість кадрів)."""
    bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    out, n, i = bytearray(), 0, 0
    while i < len(b) - 4:
        if b[i:i + 3] == b"ID3":
            size = b[i + 6] << 21 | b[i + 7] << 14 | b[i + 8] << 7 | b[i + 9]
            i += 10 + size
            continue
        h = int.from_bytes(b[i:i + 4], "big")
        if h >> 21 != 0x7FF or (h >> 19) & 3 != 3 or (h >> 17) & 3 != 1 or not bitrates[(h >> 12) & 15]:
            i += 1
            continue
        length = 144000 * bitrates[(h >> 12) & 15] // [44100, 48000, 32000][(h >> 10) & 3] + ((h >> 9) & 1)
        frame = b[i:i + length]
        if b"Xing" not in frame[:40] and b"Info" not in frame[:40]:
            out += frame
            n += 1
        i += length
    return bytes(out), n


def sync_to_audio(text, starts, ends, mp3):
    """Вирівнювання від eleven_v3 трохи випереджає голос (~0.3–0.5 с), і різниця
    плаває навіть усередині речення. Тому початок кожного речення прив'язуємо до справжнього
    початку мовлення після паузи в декодованому звуці, а часи між цими опорами
    розтягуємо лінійно. Повертає виправлені часи й тривалість звуку."""
    import miniaudio  # pip install miniaudio
    snd = miniaudio.mp3_read_file_f32(str(mp3))
    sr, x = snd.sample_rate, snd.samples
    hop = sr // 100
    env = [sum(v * v for v in x[k:k + hop]) / hop for k in range(0, len(x) - hop, hop)]
    thr = max(env) * 0.02 ** 2
    onsets, quiet = [], 20  # початок мовлення після тиші ≥ 200 мс (і на самому початку)
    for k, v in enumerate(env):
        if v < thr:
            quiet += 1
        else:
            if quiet >= 20:
                onsets.append(k / 100)
            quiet = 0

    spans = [m.span() for m in re.finditer(r"[^\s].*?(?:[.!?…]+»?(?=\s|$)|$)", text, flags=re.S)]
    anchors, prev_end = [], 0.0  # (час у вирівнюванні, справжній час)
    for a, b in spans:
        # перший початок мовлення після кінця попереднього речення
        near = [o for o in onsets if max(starts[a] - 0.4, prev_end) <= o <= starts[a] + 1.0]
        if near and (not anchors or (starts[a] > anchors[-1][0] and near[0] > anchors[-1][1])):
            anchors.append((starts[a], near[0]))
        prev_end = ends[b - 1]
    if not anchors:
        anchors = [(0.0, 0.0)]

    def warp(t):
        if t <= anchors[0][0]:
            return t + anchors[0][1] - anchors[0][0]
        for (r0, s0), (r1, s1) in zip(anchors, anchors[1:]):
            if t <= r1:
                return s0 + (t - r0) * (s1 - s0) / (r1 - r0)
        return t + anchors[-1][1] - anchors[-1][0]

    starts, ends = [warp(t) for t in starts], [warp(t) for t in ends]
    shifts = sorted(s - r for r, s in anchors)
    print(f"sync: {len(anchors)}/{len(spans)} sentences matched to speech onsets, "
          f"median shift {shifts[len(shifts) // 2]:+.2f}s")
    return starts, ends, len(x) / sr


def tts(text):
    """Довгий текст ділимо по абзацах на запити до CHUNK символів і склеюємо mp3.
    Пробіли між шматками отримують час кінця попереднього шматка."""
    parts, cur = [], ""
    for para in re.split(r"(?<=\n\n)", text):
        if cur and len(cur) + len(para) > CHUNK:
            parts.append(cur)
            cur = ""
        cur += para
    parts.append(cur)
    audio, starts, ends, offset = b"", [], [], 0.0
    for part in parts:
        body = part.strip()
        lead = len(part) - len(part.lstrip())
        a, s, e = tts_one(body)
        a, frames = clean_mp3(a)
        starts += [offset] * lead + [offset + x for x in s]
        ends += [offset] * lead + [offset + x for x in e]
        starts += [offset + e[-1]] * (len(part) - lead - len(body))
        ends += [offset + e[-1]] * (len(part) - lead - len(body))
        audio += a
        offset += frames * 1152 / 44100  # кадр MP3 = 1152 семпли
    return audio, starts, ends


def main():
    src_path = Path(sys.argv[1]).resolve()
    force = "--force" in sys.argv
    lecture, section = src_path.parent.name, src_path.stem
    out_dir = ROOT / "audio" / lecture
    out_dir.mkdir(parents=True, exist_ok=True)
    mp3, cues_js, align = (out_dir / f"{section}{ext}" for ext in (".mp3", ".cues.js", ".align.json"))
    key = f"audio/{lecture}/{section}"

    text, cues = parse(src_path.read_text(encoding="utf-8"))
    digest = hashlib.sha1(f"{VOICE_ID}|{MODEL_ID}|{LANG}|{text}".encode()).hexdigest()[:12]

    # Якщо текст не змінився, звук не перегенеровуємо (це коштує кредити),
    # а таймінги дій перераховуємо зі збереженого вирівнювання.
    old = json.loads(align.read_text(encoding="utf-8")) if align.exists() and mp3.exists() else {}
    if not force and old.get("hash") == digest:
        print(f"{key}: text unchanged, reusing audio (use --force to regenerate)")
        starts, ends = old["starts"], old["ends"]
        cleaned, _ = clean_mp3(mp3.read_bytes())  # файли зі старих збірок
        if cleaned != mp3.read_bytes():
            mp3.write_bytes(cleaned)
    else:
        audio, starts, ends = tts(text)
        mp3.write_bytes(audio)
        align.write_text(json.dumps({"hash": digest, "starts": starts, "ends": ends}), encoding="utf-8")
    starts, ends, duration = sync_to_audio(text, starts, ends, mp3)

    def t_at(i):
        while i < len(text) and text[i].isspace():
            i += 1
        return round(starts[i], 3) if i < len(text) else round(ends[-1], 3)

    caps = []
    for m in re.finditer(r"[^\s].*?(?:[.!?…]+»?(?=\s|$)|$)", text, flags=re.S):
        s = m.group().strip()
        if s:
            caps.append({"t": t_at(m.start()), "end": round(ends[m.end() - 1], 3), "text": s})
    # Слова для транскрипту: [початок, кінець, слово з пробілами після нього]
    words = [[t_at(m.start()), round(ends[m.end() - 1], 3), m.group()] for m in re.finditer(r"\S+\s*", text)]

    data = {
        "hash": digest,
        "audio": f"{key}.mp3",
        "duration": round(duration, 3),
        "cues": [{"t": t_at(c["at"]), "do": c["do"]} for c in cues],
        "captions": caps,
        "words": words,
    }
    cues_js.write_text(
        f"(window.narrData=window.narrData||{{}})[{json.dumps(key)}]="
        + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"{key}: {data['duration']:.1f}s, {len(cues)} cues, {len(caps)} captions, {len(words)} words")


if __name__ == "__main__":
    main()
