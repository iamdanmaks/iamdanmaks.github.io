"""Генерує озвучку розділу лекції: локально через StyleTTS2 (типово) або через ElevenLabs.

Вхід:  narration/<lecture>/<section>.txt — текст, який говорить лектор,
       з маркерами дій [[дія|аргумент|...]], наприклад [[hl|#s4 .demo]],
       [[set|#lkT|6|2500]], [[call|lkQ|1.25|1.15|900]], [[click|#btn]], [[unhl]].
Вихід: audio/<lecture>/<section>.mp3       — звук,
       audio/<lecture>/<section>.cues.js   — таймінги дій, субтитрів і слів (JS, а не JSON,
                                             щоб сторінка працювала і з file://),
       audio/<lecture>/<section>.align.json — посимвольне вирівнювання від TTS; з ним
                                             зміна лише маркерів не потребує нового TTS.

Запуск: python tools/narrate.py narration/05-attention-transformers/s4.txt [--force] [--engine eleven]
        python tools/narrate.py narration/05-attention-transformers/s4.txt --check
        (--check лише друкує текст з наголосами, як його прочитає TTS, без генерації звуку)

StyleTTS2 (локально, GPU): українська модель patriotyk/styletts2_ukrainian_multispeaker,
голос — вектор стилю narration/voice.pt. Наголоси ставить ukrainian-word-stress, а виправити
їх можна знаком «+» після наголошеної голосної прямо в тексті: «напря+му». Англійські слова
й виправлення, потрібні всюди, — у narration/lexicon.txt (впливає лише на звук, не на субтитри).
Залежності (окреме venv, бо пакети фіксують старі numpy і transformers):
  pip install torch==2.8.0+cu128 torchaudio==2.8.0+cu128 --extra-index-url https://download.pytorch.org/whl/cu128
  pip install soundfile librosa scipy einops einops_exts munch pyyaml "transformers==5.0.0" "numpy<2" \
      "accelerate>=0.26.0" lameenc miniaudio git+https://github.com/patriotyk/ukrainian-word-stress.git \
      git+https://github.com/patriotyk/ipa-uk.git \
      git+https://github.com/patriotyk/styletts2-inference@209352700cf703a05ff94501290095dd9072fd5f
ElevenLabs: ключ з ELEVEN_LABS_API_KEY (оточення або .env у корені репозиторію),
            для синхронізації зі звуком потрібен декодер MP3: pip install miniaudio
"""
import base64, hashlib, json, os, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"  # premade "George"
MODEL_ID = "eleven_v3"
CHUNK = 2400  # символів на запит; ліміт eleven_v3 — близько 3000
LANG = "uk"
MARK = re.compile(r"\[\[(.*?)\]\](?!\])")  # «]]]» у [[click|li[data-i="0"]]]: перша «]» — частина селектора
SENT = re.compile(r"[^\s].*?(?:[.!?…]+»?(?=\s|$)|$)", re.S)

STYLE_MODEL = "patriotyk/styletts2_ukrainian_multispeaker"
VOICE = ROOT / "narration" / "voice.pt"  # «Кирило Татарченко» з демо patriotyk/styletts2-ukrainian
LEXICON = ROOT / "narration" / "lexicon.txt"
SPEED = 1.15             # 1.0 звучить так, ніби кожне слово вимовляють окремо
SR = 24000
VOWELS = "аеєиіїоуюяАЕЄИІЇОУЮЯ"
ACUTE = "́"
GAP_SENT, GAP_PARA = 0.4, 0.9  # паузи між реченнями й абзацами, с
GAP_LONG = 0.25          # довге речення отримує до стількох секунд паузи зверху
GAP_PAUSE = 0.4          # типова тривалість [[pause]]
LEAD = 0.2               # тиша на початку файлу, с


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
    text = (out + piece).strip()
    # маркер у самому кінці стоїть після пробілу, який прибрав strip()
    return text, [{**c, "at": min(c["at"], len(text))} for c in cues]


def strip_stress(text, cues):
    """«+» одразу після голосної — ручний наголос для TTS (напря+му). Його прибираємо з тексту
    для субтитрів, запам'ятовуючи позиції. Повертає текст, позиції наголосів і зсунуті дії."""
    out, stress, new_pos = "", [], []
    for i, c in enumerate(text):
        new_pos.append(len(out))
        if c == "+" and out and out[-1] in VOWELS:
            stress.append(len(out))
        else:
            out += c
    new_pos.append(len(out))
    return out, stress, [{**c, "at": new_pos[c["at"]]} for c in cues]


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

    spans = [m.span() for m in SENT.finditer(text)]
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


def lexicon():
    """narration/lexicon.txt: рядки «написання = вимова», # — коментар. Довші записи першими,
    щоб «Attention Is All You Need» замінювалось раніше за окреме «Need»."""
    if not LEXICON.exists():
        return []
    pairs = []
    for line in LEXICON.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if "=" in line:
            k, _, v = line.partition("=")
            pairs.append((k.strip(), v.strip()))
    return sorted(pairs, key=lambda p: -len(p[0]))


def spoken(text, a, b, stress, lex, stressify):
    """Шматок тексту [a, b) у вигляді, який читає StyleTTS2: ручні наголоси, лексикон,
    автоматичні наголоси для решти слів."""
    from unicodedata import normalize
    s = text[a:b]
    for p in sorted((p for p in stress if a < p <= b), reverse=True):
        s = s[:p - a] + "+" + s[p - a:]
    for k, v in lex:
        s = re.sub(rf"(?<!\w){re.escape(k)}(?!\w)", v, s, flags=re.I)
    s = normalize("NFKC", s.replace("+", ACUTE)).replace('"', "")
    s = re.sub(r"[᠆‐‑‒–—―⁻₋−⸺⸻]", "-", s)
    s = re.sub(r" - ", ": ", s)
    if s[-1] not in ".?!:-…»":
        s += "."
    if re.search(r"[A-Za-z]", s):
        print(f"\nwarning: latin letters are skipped by TTS, add them to {LEXICON.name}: {s}")
    return stressify(s)


def units(text, pauses):
    """Шматки, які TTS озвучує окремо: речення, а речення з [[pause]] посередині — частини."""
    spans = []
    for m in SENT.finditer(text):
        a = m.start()
        for p in sorted(p for p in pauses if m.start() < p < m.end()):
            spans.append((a, len(text[:p].rstrip())))
            a = p
        spans.append((a, m.end()))
    return spans


def stressifier():
    from ukrainian_word_stress import Stressifier
    return Stressifier()


def voice_id():
    if not VOICE.exists():
        sys.exit(f"no voice style: {VOICE.relative_to(ROOT)} not found")
    lex = LEXICON.read_bytes() if LEXICON.exists() else b""
    return hashlib.sha1(VOICE.read_bytes() + lex).hexdigest()[:8]


def trim(clip, margin=0.04):
    """StyleTTS2 лишає ~0.15 с тиші з кожного боку; прибираємо її, щоб паузи між реченнями
    задавали лише GAP_*."""
    import numpy as np
    hop = SR // 100
    env = np.sqrt(np.convolve(clip ** 2, np.ones(hop) / hop, mode="same"))
    loud = np.flatnonzero(env > env.max() * 0.02)
    if not len(loud):
        return clip
    m = int(margin * SR)
    return clip[max(0, loud[0] - m):loud[-1] + m]


def tts_local(text, stress, pauses):
    """StyleTTS2 озвучує кожне речення окремо, речення склеюємо з паузами. Межі речень тому
    відомі точно, а всередині речення час символів розподіляємо рівномірно. stress — позиції
    ручних наголосів, pauses — {позиція в тексті: секунди} з маркерів [[pause]]: додаткова
    тиша в цьому місці. Повертає (mp3, starts, ends)."""
    import numpy as np, lameenc, torch
    from ipa_uk import ipa
    from styletts2_inference.models import StyleTTS2
    spans = units(text, pauses)
    lex, stressify = lexicon(), stressifier()
    model = StyleTTS2(hf_path=STYLE_MODEL, device="cuda" if torch.cuda.is_available() else "cpu")
    style = torch.load(VOICE, weights_only=True)
    clips = []
    for i, (a, b) in enumerate(spans):
        tokens = model.tokenizer.encode(ipa(spoken(text, a, b, stress, lex, stressify)))
        with torch.no_grad():
            clips.append(trim(model(tokens, speed=SPEED, s_prev=style).float().cpu().numpy()))
        print(f"tts: {i + 1}/{len(spans)} sentences", end="\r")
    print()

    starts, ends = [0.0] * len(text), [0.0] * len(text)
    pieces, t = [np.zeros(int(LEAD * SR), np.float32)], LEAD
    for k, ((a, b), clip) in enumerate(zip(spans, clips)):
        dur = len(clip) / SR
        for i in range(a, b):
            starts[i], ends[i] = t + dur * (i - a) / (b - a), t + dur * (i - a + 1) / (b - a)
        nxt = spans[k + 1][0] if k + 1 < len(spans) else len(text)
        for i in range(b, nxt):  # пробіли між реченнями
            starts[i] = ends[i] = t + dur
        if "\n\n" in text[b:nxt]:
            gap = GAP_PARA
        elif text[b - 1] in ".!?…»":  # після довгого речення перепочиваємо трохи довше
            gap = GAP_SENT + GAP_LONG * min(1.0, (b - a) / 250)
        else:  # шматок речення перед [[pause]]
            gap = 0.0
        gap += sum(v for p, v in pauses.items() if b <= p <= nxt)
        pieces += [clip.astype(np.float32), np.zeros(int(gap * SR), np.float32)]
        t += dur + gap

    pcm = (np.clip(np.concatenate(pieces), -1, 1) * 32767).astype("<i2").tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(96)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(pcm) + enc.flush(), starts, ends


def main():
    src_path = Path(sys.argv[1]).resolve()
    force = "--force" in sys.argv
    engine = sys.argv[sys.argv.index("--engine") + 1] if "--engine" in sys.argv else "styletts2"
    lecture, section = src_path.parent.name, src_path.stem
    out_dir = ROOT / "audio" / lecture
    out_dir.mkdir(parents=True, exist_ok=True)
    mp3, cues_js, align = (out_dir / f"{section}{ext}" for ext in (".mp3", ".cues.js", ".align.json"))
    key = f"audio/{lecture}/{section}"

    text, stress, cues = strip_stress(*parse(src_path.read_text(encoding="utf-8")))
    # [[pause]] і [[pause|0.6]] — це не дія для сторінки, а тиша в звуці (лише для StyleTTS2)
    pauses = {c["at"]: float(c["do"][1]) if len(c["do"]) > 1 else GAP_PAUSE for c in cues if c["do"][0] == "pause"}
    cues = [c for c in cues if c["do"][0] != "pause"]
    if "--check" in sys.argv:
        lex, stressify = lexicon(), stressifier()
        for a, b in units(text, pauses):
            print(spoken(text, a, b, stress, lex, stressify))
        return
    voice = (f"{VOICE_ID}|{MODEL_ID}" if engine == "eleven" else
             f"{STYLE_MODEL}|{voice_id()}|{SPEED}|{GAP_SENT}|{GAP_PARA}|{GAP_LONG}|{sorted(pauses.items())}|{stress}")
    digest = hashlib.sha1(f"{voice}|{LANG}|{text}".encode()).hexdigest()[:12]

    # Якщо текст не змінився, звук не перегенеровуємо (це коштує кредити або час),
    # а таймінги дій перераховуємо зі збереженого вирівнювання.
    old = json.loads(align.read_text(encoding="utf-8")) if align.exists() and mp3.exists() else {}
    if not force and old.get("hash") == digest:
        print(f"{key}: text unchanged, reusing audio (use --force to regenerate)")
        starts, ends = old["starts"], old["ends"]
        if engine == "eleven":
            cleaned, _ = clean_mp3(mp3.read_bytes())  # файли зі старих збірок
            if cleaned != mp3.read_bytes():
                mp3.write_bytes(cleaned)
    else:
        audio, starts, ends = tts(text) if engine == "eleven" else tts_local(text, stress, pauses)
        mp3.write_bytes(audio)
        align.write_text(json.dumps({"hash": digest, "engine": engine, "starts": starts, "ends": ends}), encoding="utf-8")
    if engine == "eleven":
        starts, ends, duration = sync_to_audio(text, starts, ends, mp3)
    else:  # межі речень точні, підганяти нічого не треба
        import miniaudio
        duration = miniaudio.mp3_get_file_info(str(mp3)).duration

    def t_at(i):
        while i < len(text) and text[i].isspace():
            i += 1
        return round(starts[i], 3) if i < len(text) else round(ends[-1], 3)

    caps = []
    for m in SENT.finditer(text):
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
