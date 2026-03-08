// ─── Key signature definitions ───────────────────────────────────────────────
const KEYS = [
    { label: 'C major',       sharps: [],                    flats: [] },
    { label: 'G major (1\u266f)',  sharps: ['F'],                 flats: [] },
    { label: 'D major (2\u266f)',  sharps: ['F','C'],             flats: [] },
    { label: 'A major (3\u266f)',  sharps: ['F','C','G'],         flats: [] },
    { label: 'E major (4\u266f)',  sharps: ['F','C','G','D'],     flats: [] },
    { label: 'F major (1\u266d)',  sharps: [],                    flats: ['B'] },
    { label: 'B\u266d major (2\u266d)', sharps: [],               flats: ['B','E'] },
    { label: 'E\u266d major (3\u266d)', sharps: [],               flats: ['B','E','A'] },
    { label: 'A\u266d major (4\u266d)', sharps: [],               flats: ['B','E','A','D'] },
];

// y-positions for key sig accidental symbols on each staff type
// (sharps/flats drawn in order on the appropriate staff lines/spaces)
// Single-clef staff: lines at y=75,95,115,135,155
const KS_POS = {
    treble: {
        sharps: [75, 105,  65,  95, 125,  85, 115],  // FCGDAEB on treble
        flats:  [115, 85, 125,  95, 135, 105, 145],  // BEADGCF on treble
    },
    bass: {
        sharps: [95, 125,  85, 115, 145, 105, 135],  // FCGDAEB on bass
        flats:  [135, 105, 145, 115,  85, 125,  95],  // BEADGCF on bass
    },
    // Grand staff uses different y-coords (treble lines at 40-120, bass at 180-260)
    grand_treble: {
        sharps: [40,  70,  30,  60,  90,  50,  80],
        flats:  [80,  50,  90,  60, 100,  70, 110],
    },
    grand_bass: {
        sharps: [200, 230, 190, 220, 250, 210, 240],
        flats:  [240, 210, 250, 220, 190, 230, 200],
    },
};

// ─── Audio ───────────────────────────────────────────────────────────────────
let audioCtx;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
function playTone(freq, dur = 0.5) {
    if (!audioCtx) initAudio();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.stop(audioCtx.currentTime + dur);
}

// ─── State ───────────────────────────────────────────────────────────────────
let cfg, isGrand, level = 1, score = 0, currentNote = null, currentKey = null, processing = false;

// DOM refs
let noteGroupEl, noteHeadEl, noteStemEl, ledgerLowEl, ledgerHighEl;
let trebleGroupEl, trebleHeadEl, trebleStemEl, trebleLedgerLow, trebleLedgerHigh;
let bassGroupEl,   bassHeadEl,   bassStemEl,   bassLedgerLow,   bassLedgerHigh;
let feedbackEl, scoreEl, pianoEl, instructionsEl, btnL1, btnL2, midiStatusEl, keySigLabelEl;
// active note-group refs (swapped between treble/bass in grand mode)
let activeGroup, activeHead, activeStem, activeLedgerLow, activeLedgerHigh;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    cfg    = window.LESSON_CONFIG;
    isGrand = cfg.clefType === 'grand';

    feedbackEl     = document.getElementById('feedback');
    scoreEl        = document.getElementById('score');
    pianoEl        = document.getElementById('keyboard-area');
    instructionsEl = document.getElementById('instructions');
    midiStatusEl   = document.getElementById('midi-status');
    keySigLabelEl  = document.getElementById('key-sig-label');
    btnL1          = document.getElementById('btn-level-1');
    btnL2          = document.getElementById('btn-level-2');

    if (isGrand) {
        trebleGroupEl   = document.getElementById('treble-note-group');
        trebleHeadEl    = document.getElementById('treble-note-head');
        trebleStemEl    = document.getElementById('treble-note-stem');
        trebleLedgerLow = document.getElementById('treble-ledger-low');
        trebleLedgerHigh= document.getElementById('treble-ledger-high');
        bassGroupEl     = document.getElementById('bass-note-group');
        bassHeadEl      = document.getElementById('bass-note-head');
        bassStemEl      = document.getElementById('bass-note-stem');
        bassLedgerLow   = document.getElementById('bass-ledger-low');
        bassLedgerHigh  = document.getElementById('bass-ledger-high');
    } else {
        noteGroupEl  = document.getElementById('note-group');
        noteHeadEl   = document.getElementById('note-head');
        noteStemEl   = document.getElementById('note-stem');
        ledgerLowEl  = document.getElementById('ledger-line-low');
        ledgerHighEl = document.getElementById('ledger-line-high');
        activeGroup  = noteGroupEl;
        activeHead   = noteHeadEl;
        activeStem   = noteStemEl;
        activeLedgerLow  = ledgerLowEl;
        activeLedgerHigh = ledgerHighEl;
    }

    if (cfg.pianoOnly) {
        document.getElementById('controls').style.display = 'none';
        pianoEl.classList.add('visible');
        level = 2;
    }

    if (cfg.useKeySignatures && keySigLabelEl) {
        keySigLabelEl.style.display = 'inline-block';
    }

    generatePiano();
    nextNote();
    if (!cfg.pianoOnly) document.addEventListener('keydown', handleKeyInput);
    initMIDI();
});

// ─── Level ────────────────────────────────────────────────────────────────────
function setLevel(l) {
    level = l; initAudio();
    if (l === 1) {
        btnL1.classList.add('active'); btnL2.classList.remove('active');
        pianoEl.classList.remove('visible');
        instructionsEl.textContent = "Press the correct letter key (A\u2013G) or use MIDI.";
    } else {
        btnL1.classList.remove('active'); btnL2.classList.add('active');
        pianoEl.classList.add('visible');
        instructionsEl.textContent = "Tap the correct key \u2014 octave matters! Scroll if needed.";
    }
    score = 0; scoreEl.textContent = 0; nextNote();
}

// ─── Key signature helpers ────────────────────────────────────────────────────
function pickKey() {
    return KEYS[Math.floor(Math.random() * KEYS.length)];
}
function effectiveMidi(note, key) {
    if (key.sharps.includes(note.name)) return note.midi + 1;
    if (key.flats.includes(note.name))  return note.midi - 1;
    return note.midi;
}
function effectiveLabel(note, key) {
    if (key.sharps.includes(note.name)) return `${note.name}\u266f${note.octave}`;
    if (key.flats.includes(note.name))  return `${note.name}\u266d${note.octave}`;
    return `${note.name}${note.octave}`;
}

function renderKeySignature(key) {
    if (!cfg.useKeySignatures) return;
    const count  = key.sharps.length || key.flats.length;
    const isSharp = key.sharps.length > 0;
    const sym    = isSharp ? '\u266f' : '\u266d';
    const startX = 58, spacing = 12;

    function drawKeySig(groupId, posKey) {
        const g = document.getElementById(groupId);
        if (!g) return;
        g.innerHTML = '';
        const positions = isSharp ? KS_POS[posKey].sharps : KS_POS[posKey].flats;
        for (let i = 0; i < count; i++) {
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t.setAttribute('x', startX + i * spacing);
            t.setAttribute('y', positions[i] + 6);
            t.setAttribute('font-size', '14');
            t.setAttribute('font-family', 'Times New Roman, serif');
            t.setAttribute('fill', '#333');
            t.textContent = sym;
            g.appendChild(t);
        }
    }

    if (isGrand) {
        drawKeySig('treble-keysig-group', 'grand_treble');
        drawKeySig('bass-keysig-group',   'grand_bass');
    } else {
        drawKeySig('keysig-group', cfg.clefType);
    }

    if (keySigLabelEl) keySigLabelEl.textContent = `Key: ${key.label}`;
}

// ─── Note rendering ────────────────────────────────────────────────────────────
function renderNoteVisuals(note) {
    if (isGrand) {
        // Hide both groups, then show the correct one
        trebleGroupEl.style.display = 'none';
        bassGroupEl.style.display   = 'none';
        if (note.clef === 'treble') {
            trebleGroupEl.style.display = '';
            activeGroup  = trebleGroupEl; activeHead   = trebleHeadEl;
            activeStem   = trebleStemEl;  activeLedgerLow  = trebleLedgerLow;
            activeLedgerHigh = trebleLedgerHigh;
        } else {
            bassGroupEl.style.display = '';
            activeGroup  = bassGroupEl; activeHead   = bassHeadEl;
            activeStem   = bassStemEl; activeLedgerLow  = bassLedgerLow;
            activeLedgerHigh = bassLedgerHigh;
        }
    }

    activeHead.setAttribute('cy', note.y);
    activeStem.style.display = 'block';
    if (note.stemDown) {
        activeStem.setAttribute('x1', 200-12); activeStem.setAttribute('y1', note.y);
        activeStem.setAttribute('x2', 200-12); activeStem.setAttribute('y2', note.y+45);
    } else {
        activeStem.setAttribute('x1', 200+12); activeStem.setAttribute('y1', note.y);
        activeStem.setAttribute('x2', 200+12); activeStem.setAttribute('y2', note.y-45);
    }
    activeLedgerLow.style.display  = note.ledgerLow  ? 'block' : 'none';
    activeLedgerHigh.style.display = note.ledgerHigh ? 'block' : 'none';
    if (note.ledgerLow)  { activeLedgerLow.setAttribute('y1', note.y);  activeLedgerLow.setAttribute('y2', note.y); }
    if (note.ledgerHigh) { activeLedgerHigh.setAttribute('y1', note.y); activeLedgerHigh.setAttribute('y2', note.y); }
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function nextNote() {
    processing = false;
    feedbackEl.textContent = "Listen..."; feedbackEl.style.color = "#333";
    if (activeHead) activeHead.style.fill = "#333";
    if (activeGroup) activeGroup.classList.remove('shake');
    clearHighlights();

    if (cfg.useKeySignatures) {
        currentKey = pickKey();
        renderKeySignature(currentKey);
    }

    currentNote = cfg.notesData[Math.floor(Math.random() * cfg.notesData.length)];
    renderNoteVisuals(currentNote);

    setTimeout(() => {
        const freq = cfg.useKeySignatures
            ? freqFromMidi(effectiveMidi(currentNote, currentKey))
            : currentNote.freq;
        playTone(freq, 0.8);
        feedbackEl.textContent = cfg.useKeySignatures
            ? "What note is this? (check the key signature)"
            : "What note is this?";
    }, 500);
}

function freqFromMidi(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// ─── Answer checking ──────────────────────────────────────────────────────────
// Level 1: letter-only (no octave, no accidental from key sig)
function checkAnswerByName(letter) {
    if (processing) return; processing = true;
    const sample = cfg.notesData.find(n => n.name === letter);
    if (sample) playTone(sample.freq, 0.4);
    if (letter === currentNote.name) handleCorrect();
    else handleWrong(`You pressed ${letter}`);
}

// Level 2: exact MIDI (octave + key-sig accidental must match)
function checkAnswerByMidi(midi) {
    if (processing) return; processing = true;
    const target = cfg.useKeySignatures ? effectiveMidi(currentNote, currentKey) : currentNote.midi;
    const playedFreq = freqFromMidi(midi);
    playTone(playedFreq, 0.4);
    if (midi === target) {
        handleCorrect();
    } else {
        // Figure out a human-readable label for what they played
        const played = cfg.notesData.find(n => n.midi === midi);
        let label;
        if (played) {
            label = cfg.useKeySignatures ? effectiveLabel(played, currentKey) : `${played.name}${played.octave}`;
        } else {
            // Black key not in notesData — derive name from midi
            const names = ["C","C\u266f","D","D\u266f","E","F","F\u266f","G","G\u266f","A","A\u266f","B"];
            const oct = Math.floor(midi / 12) - 1;
            label = `${names[midi % 12]}${oct}`;
        }
        handleWrong(`You played ${label}`);
        highlightCorrectKey(target);
    }
}

function handleCorrect() {
    score += 10; scoreEl.textContent = score;
    feedbackEl.textContent = "Correct!"; feedbackEl.style.color = "var(--success-color)";
    activeHead.style.fill = "var(--success-color)";
    setTimeout(nextNote, 1500);
}
function handleWrong(msg) {
    score = Math.max(0, score - 5); scoreEl.textContent = score;
    feedbackEl.textContent = `${msg}. Listen again...`; feedbackEl.style.color = "var(--error-color)";
    activeGroup.classList.add('shake');
    const freq = cfg.useKeySignatures ? freqFromMidi(effectiveMidi(currentNote, currentKey)) : currentNote.freq;
    setTimeout(() => { playTone(freq, 0.8); setTimeout(nextNote, 1500); }, 1000);
}

function highlightCorrectKey(targetMidi) {
    const k = document.querySelector(`.key[data-midi="${targetMidi}"]`);
    if (k) { k.classList.add('highlight'); k.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}); }
}
function clearHighlights() { document.querySelectorAll('.key.highlight').forEach(k => k.classList.remove('highlight')); }

// ─── Keyboard input (Level 1) ─────────────────────────────────────────────────
function handleKeyInput(e) {
    if (level !== 1 || processing) return;
    const k = e.key.toUpperCase();
    if (['A','B','C','D','E','F','G'].includes(k)) checkAnswerByName(k);
}

// ─── Piano ────────────────────────────────────────────────────────────────────
function generatePiano() {
    const min = cfg.pianoMin, max = cfg.pianoMax;
    // Build chromatic layout from min to max
    const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    pianoEl.innerHTML = '';
    let whiteCount = 0;

    for (let midi = min; midi <= max; midi++) {
        const name = noteNames[midi % 12];
        const isBlack = name.includes('#');
        const octave = Math.floor(midi / 12) - 1;
        const el = document.createElement('div');
        el.className = `key ${isBlack ? 'black' : 'white'}`;
        el.dataset.midi = midi;

        if (!isBlack) {
            // Label: show note name; show octave number on C keys
            el.textContent = name === 'C' ? `C${octave}` : name;
            whiteCount++;
        } else {
            el.style.left = `${whiteCount * 40 - 13}px`;
            if (cfg.pianoOnly) el.classList.add('clickable');
        }

        const clickable = !isBlack || cfg.pianoOnly;
        if (clickable) {
            const m = midi;
            el.addEventListener('touchstart', ev => { ev.preventDefault(); handlePianoPress(el, m); }, {passive:false});
            el.addEventListener('mousedown', () => handlePianoPress(el, m));
        }
        pianoEl.appendChild(el);
    }
    pianoEl.style.width = `${whiteCount * 40 + 20}px`;
}

function handlePianoPress(keyEl, midi) {
    if (level !== 2) return; initAudio();
    keyEl.classList.add('pressed'); setTimeout(() => keyEl.classList.remove('pressed'), 200);
    checkAnswerByMidi(midi);
}

// ─── MIDI ─────────────────────────────────────────────────────────────────────
function initMIDI() {
    if (navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(onMIDISuccess, () => midiStatusEl.textContent = "MIDI: Error");
}
function onMIDISuccess(m) {
    midiStatusEl.textContent = "MIDI: Ready"; midiStatusEl.classList.add('connected');
    const attach = () => { for (let i of m.inputs.values()) i.onmidimessage = getMIDIMessage; };
    attach();
    m.onstatechange = e => { if (e.port.state === 'connected') { attach(); midiStatusEl.textContent = "MIDI: Connected"; } };
}
function getMIDIMessage(msg) {
    const [cmd, note, vel] = msg.data;
    if (cmd === 144 && vel > 0) handleMIDINoteOn(note);
}
function handleMIDINoteOn(midi) {
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const name  = names[midi % 12];
    const k = document.querySelector(`.key[data-midi="${midi}"]`);
    if (k) { k.classList.add('pressed'); setTimeout(() => k.classList.remove('pressed'), 200); }
    if (level === 1) { if (!name.includes('#')) checkAnswerByName(name); }
    else             { checkAnswerByMidi(midi); }
}
