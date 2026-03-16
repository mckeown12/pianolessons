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
let noteGroupEl, noteHeadEl, noteStemEl;
let trebleGroupEl, trebleHeadEl, trebleStemEl;
let bassGroupEl,   bassHeadEl,   bassStemEl;
let feedbackEl, scoreEl, pianoEl, instructionsEl, btnL1, btnL2, midiStatusEl, keySigLabelEl;
// active note-group refs (swapped between treble/bass in grand mode)
let activeGroup, activeHead, activeStem;

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
        bassGroupEl     = document.getElementById('bass-note-group');
        bassHeadEl      = document.getElementById('bass-note-head');
        bassStemEl      = document.getElementById('bass-note-stem');
    } else {
        noteGroupEl  = document.getElementById('note-group');
        noteHeadEl   = document.getElementById('note-head');
        noteStemEl   = document.getElementById('note-stem');
        activeGroup  = noteGroupEl;
        activeHead   = noteHeadEl;
        activeStem   = noteStemEl;
    }

    if (cfg.pianoOnly) {
        document.getElementById('controls').style.display = 'none';
        pianoEl.classList.add('visible');
        level = 2;
    }

    if (cfg.useKeySignatures && keySigLabelEl) {
        keySigLabelEl.style.display = 'inline-block';
    }

    // Defer generatePiano until after layout so clientWidth is reliable
    requestAnimationFrame(() => {
        generatePiano();
        nextNote();
    });
    if (!cfg.pianoOnly) document.addEventListener('keydown', handleKeyInput);
    initMIDI();

    // Rebuild piano on resize/orientation change
    window.addEventListener('resize', () => {
        if (pianoEl.classList.contains('visible')) generatePiano();
    });
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
        generatePiano(); // rebuild with current container width
        instructionsEl.textContent = "Tap the correct key \u2014 octave matters!";
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

// Draw ledger lines for a note group. staffBottomY / staffTopY are the y-coords
// of the outermost staff lines; spacing is the distance between staff lines (20px).
// ledgerLow / ledgerHigh are counts (0, 1, 2, …).
function renderLedgerLines(group, noteY, staffBottomY, staffTopY, spacing, ledgerLow, ledgerHigh) {
    // Remove any previously drawn ledger lines
    group.querySelectorAll('.ledger-line').forEach(el => el.remove());

    const ns = 'http://www.w3.org/2000/svg';
    // Lines below staff
    for (let i = 1; i <= ledgerLow; i++) {
        const y = staffBottomY + i * spacing;
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', '178'); line.setAttribute('x2', '222');
        line.setAttribute('y1', y);     line.setAttribute('y2', y);
        line.setAttribute('class', 'ledger-line');
        group.insertBefore(line, group.firstChild);
    }
    // Lines above staff
    for (let i = 1; i <= ledgerHigh; i++) {
        const y = staffTopY - i * spacing;
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', '178'); line.setAttribute('x2', '222');
        line.setAttribute('y1', y);     line.setAttribute('y2', y);
        line.setAttribute('class', 'ledger-line');
        group.insertBefore(line, group.firstChild);
    }
}

function renderNoteVisuals(note) {
    if (isGrand) {
        // Hide both groups, then show the correct one
        trebleGroupEl.style.display = 'none';
        bassGroupEl.style.display   = 'none';
        if (note.clef === 'treble') {
            trebleGroupEl.style.display = '';
            activeGroup  = trebleGroupEl; activeHead   = trebleHeadEl;
            activeStem   = trebleStemEl;
        } else {
            bassGroupEl.style.display = '';
            activeGroup  = bassGroupEl; activeHead   = bassHeadEl;
            activeStem   = bassStemEl;
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

    // Determine staff bounds for ledger line drawing
    let staffBottom, staffTop, spacing;
    if (isGrand) {
        if (note.clef === 'treble') {
            staffBottom = 120; staffTop = 40; spacing = 20; // grand treble lines y=40,60,80,100,120
        } else {
            staffBottom = 260; staffTop = 180; spacing = 20; // grand bass lines y=180,200,220,240,260
        }
    } else {
        staffBottom = 155; staffTop = 75; spacing = 20; // single staff lines y=75,95,115,135,155
    }
    renderLedgerLines(activeGroup, note.y, staffBottom, staffTop, spacing,
                      note.ledgerLow || 0, note.ledgerHigh || 0);
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
    if (k) k.classList.add('highlight');
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
    const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

    // Count white keys to compute proportional sizing
    let whiteCount = 0;
    for (let midi = min; midi <= max; midi++) {
        if (!noteNames[midi % 12].includes('#')) whiteCount++;
    }

    // Compute key width to fill available space (no scroll needed)
    const scrollEl = pianoEl.parentElement;
    const available = (scrollEl.clientWidth || scrollEl.offsetWidth || 600);
    const padding = 10; // piano padding on each side
    const ww = Math.floor((available - padding * 2) / whiteCount); // white key width
    const bw = Math.round(ww * 0.6);   // black key width
    const wh = Math.round(ww * 3.0);   // white key height
    const bh = Math.round(wh * 0.62);  // black key height

    pianoEl.innerHTML = '';
    pianoEl.style.transform = '';
    pianoEl.style.height = `${wh + padding * 2}px`;

    let wi = 0; // white key index
    for (let midi = min; midi <= max; midi++) {
        const name = noteNames[midi % 12];
        const isBlack = name.includes('#');
        const octave = Math.floor(midi / 12) - 1;
        const el = document.createElement('div');
        el.className = `key ${isBlack ? 'black' : 'white'}`;
        el.dataset.midi = midi;

        if (!isBlack) {
            el.style.width  = `${ww}px`;
            el.style.height = `${wh}px`;
            el.textContent  = name === 'C' ? `C${octave}` : name;
            el.style.fontSize = `${Math.max(8, Math.round(ww * 0.28))}px`;
            wi++;
        } else {
            el.style.width  = `${bw}px`;
            el.style.height = `${bh}px`;
            el.style.left   = `${padding + wi * ww - Math.round(bw / 2)}px`;
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
    const totalWidth = wi * ww + padding * 2;
    pianoEl.style.width = `${totalWidth}px`;
    // No scroll needed — piano fills exactly the available width
    scrollEl.style.overflowX = 'hidden';
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
