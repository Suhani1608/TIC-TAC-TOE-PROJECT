const boxes = document.querySelectorAll(".box");
const resetBtn = document.querySelector("#reset");
const newGameBtn = document.querySelector("#newGame-btn");
const clearScoresBtn = document.querySelector("#clear-scores");
const undoBtn = document.querySelector("#undo-btn");
const msgContainer = document.querySelector(".msg-container");
const msg = document.querySelector("#msg");

// HUD & Mode Elements
const turnDisplay = document.querySelector("#turn-display");
const ruleReadout = document.querySelector("#rule-readout");
const cardO = document.querySelector("#card-o");
const cardX = document.querySelector("#card-x");
const scoreOEl = document.querySelector("#score-o");
const scoreXEl = document.querySelector("#score-x");
const scoreDrawEl = document.querySelector("#score-draw");
const labelX = document.querySelector("#label-x");

const modePvpBtn = document.querySelector("#mode-pvp");
const modeAiBtn = document.querySelector("#mode-ai");
const aiDiffGroup = document.querySelector("#ai-diff-group");
const diffBtns = document.querySelectorAll(".diff-btn");
const ruleClassicBtn = document.querySelector("#rule-classic");
const ruleInfiniteBtn = document.querySelector("#rule-infinite");
const toggleBlitzBtn = document.querySelector("#toggle-blitz");

// Harmony Bar, Blitz Bar & Golden Ray SVG
const evalFillO = document.querySelector("#eval-fill-o");
const evalText = document.querySelector("#eval-text");
const blitzWrapper = document.querySelector("#blitz-wrapper");
const blitzFill = document.querySelector("#blitz-fill");
const rayLine = document.querySelector("#ray-line");

// Sound Elements
const soundToggleBtn = document.querySelector("#sound-toggle");
const soundIcon = document.querySelector("#sound-icon");
const soundLabel = document.querySelector("#sound-label");

// ==========================================================================
// STATE & DATA STRUCTURES (FIFO Queues + LIFO History Stack + localStorage)
// ==========================================================================
let boardState = Array(9).fill("");
let turnO = true; // true = Sunlight O, false = Oracle X
let isGameOver = false;
let vsAI = true;
let aiDifficulty = "hard"; // 'easy' | 'medium' | 'hard' (Minimax)
let infiniteMode = false;
let blitzMode = false;

let queueO = [];
let queueX = [];
let historyStack = [];

let blitzInterval = null;
let blitzTimeLeft = 100;

let scores = JSON.parse(localStorage.getItem("suhani_ttt_scores")) || { O: 0, X: 0, draw: 0 };
let isMuted = JSON.parse(localStorage.getItem("suhani_ttt_muted")) || false;

scoreOEl.innerText = scores.O;
scoreXEl.innerText = scores.X;
scoreDrawEl.innerText = scores.draw;

const saveScores = () => {
    localStorage.setItem("suhani_ttt_scores", JSON.stringify(scores));
};

// ==========================================================================
// MAGICAL HARP & CELESTA WEB AUDIO SYNTHESIZER
// ==========================================================================
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

const initAudio = () => {
    if (!audioCtx && AudioContextClass) audioCtx = new AudioContextClass();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
};

const playChime = (freq, duration = 0.22, delay = 0, vol = 0.09, type = "sine") => {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    const start = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration);
};

const sfx = {
    moveO: () => playChime(659.25, 0.18, 0, 0.1, "triangle"),  // E5 golden harp note
    moveX: () => playChime(523.25, 0.18, 0, 0.09, "sine"),     // C5 rose chime
    vanish: () => playChime(392.00, 0.2, 0, 0.08, "sine"),
    undo: () => playChime(587.33, 0.16, 0, 0.09, "triangle"),
    uiClick: () => playChime(783.99, 0.1, 0, 0.07, "sine"),
    win: () => {
        // Ascending Tangled Sundrop Arpeggio (C5 -> E5 -> G5 -> C6)
        [523.25, 659.25, 783.99, 1046.50].forEach((f, idx) => {
            playChime(f, 0.3, idx * 0.08, 0.11, "triangle");
        });
    },
    draw: () => {
        playChime(440, 0.2, 0, 0.09, "sine");
        playChime(392, 0.28, 0.16, 0.09, "sine");
    }
};

const applyMuteUI = () => {
    soundToggleBtn.classList.toggle("muted", isMuted);
    soundIcon.className = isMuted ? "fas fa-volume-mute" : "fas fa-music";
    soundLabel.innerText = isMuted ? "CHIMES: OFF" : "CHIMES: ON";
};
applyMuteUI();

soundToggleBtn.addEventListener("click", () => {
    isMuted = !isMuted;
    localStorage.setItem("suhani_ttt_muted", JSON.stringify(isMuted));
    applyMuteUI();
    if (!isMuted) sfx.win();
});

// ==========================================================================
// WIN PATTERNS & GOLDEN RAY COORDINATES
// ==========================================================================
const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

const rayCoords = {
    "0,1,2": { x1: 25, y1: 55, x2: 275, y2: 55 },
    "3,4,5": { x1: 25, y1: 150, x2: 275, y2: 150 },
    "6,7,8": { x1: 25, y1: 245, x2: 275, y2: 245 },
    "0,3,6": { x1: 55, y1: 25, x2: 55, y2: 275 },
    "1,4,7": { x1: 150, y1: 25, x2: 150, y2: 275 },
    "2,5,8": { x1: 245, y1: 25, x2: 245, y2: 275 },
    "0,4,8": { x1: 30, y1: 30, x2: 270, y2: 270 },
    "2,4,6": { x1: 270, y1: 30, x2: 30, y2: 270 }
};

// ==========================================================================
// RENDER BOARD & HUD TELEMETRY
// ==========================================================================
const renderBoard = () => {
    const currentSymbol = turnO ? "O" : "X";

    boxes.forEach((box, idx) => {
        const markSpan = box.querySelector(".mark");
        const val = boardState[idx];
        markSpan.innerText = val;

        box.classList.remove("mark-o", "mark-x", "dying-piece");
        if (val === "O") box.classList.add("mark-o");
        if (val === "X") box.classList.add("mark-x");

        box.disabled = val !== "" || isGameOver;

        if (val === "" && !isGameOver) {
            box.setAttribute("data-hover", currentSymbol);
        } else {
            box.removeAttribute("data-hover");
        }
    });

    if (infiniteMode && !isGameOver) {
        if (turnO && queueO.length === 3) {
            boxes[queueO[0]].classList.add("dying-piece");
        } else if (!turnO && queueX.length === 3) {
            boxes[queueX[0]].classList.add("dying-piece");
        }
    }

    undoBtn.disabled = historyStack.length === 0 || isGameOver;
};

const updateTurnHUD = () => {
    const modeText = infiniteMode ? "INFINITE LANTERNS (MAX 3)" : (vsAI ? `ORACLE: ${aiDifficulty.toUpperCase()}` : "2P ROYAL DUEL");
    ruleReadout.innerText = modeText;

    if (turnO) {
        turnDisplay.innerText = "O's TURN";
        turnDisplay.style.borderColor = "var(--gold)";
        turnDisplay.style.color = "var(--gold)";
        turnDisplay.style.background = "rgba(255, 207, 64, 0.14)";
        cardO.classList.add("active-turn");
        cardX.classList.remove("active-turn");
    } else {
        turnDisplay.innerText = vsAI ? "ORACLE DIVINING..." : "X's TURN";
        turnDisplay.style.borderColor = "var(--rose)";
        turnDisplay.style.color = "var(--rose)";
        turnDisplay.style.background = "rgba(244, 114, 182, 0.14)";
        cardX.classList.add("active-turn");
        cardO.classList.remove("active-turn");
    }

    updateEvaluationBar();
};

// ==========================================================================
// MINIMAX BACKTRACKING ALGORITHM & HARMONY BAR
// ==========================================================================
const evaluateState = (bd) => {
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (bd[a] && bd[a] === bd[b] && bd[a] === bd[c]) {
            return bd[a] === "X" ? 10 : -10;
        }
    }
    return 0;
};

const minimax = (bd, depth, isMaximizing) => {
    const score = evaluateState(bd);
    if (score === 10) return score - depth;
    if (score === -10) return score + depth;
    if (!bd.includes("")) return 0;

    if (isMaximizing) {
        let best = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (bd[i] === "") {
                bd[i] = "X";
                best = Math.max(best, minimax(bd, depth + 1, false));
                bd[i] = "";
            }
        }
        return best;
    } else {
        let best = Infinity;
        for (let i = 0; i < 9; i++) {
            if (bd[i] === "") {
                bd[i] = "O";
                best = Math.min(best, minimax(bd, depth + 1, true));
                bd[i] = "";
            }
        }
        return best;
    }
};

const updateEvaluationBar = () => {
    if (isGameOver) return;
    const copy = [...boardState];
    const emptyCount = copy.filter(v => v === "").length;
    if (emptyCount === 9) {
        evalFillO.style.width = "50%";
        evalText.innerText = "BALANCED (0.0)";
        return;
    }

    let score = 0;
    if (!infiniteMode && emptyCount <= 7) {
        score = minimax(copy, 0, !turnO);
    } else {
        score = evaluateState(copy);
    }

    const oPercent = Math.min(95, Math.max(5, 50 - score * 4.5));
    evalFillO.style.width = `${oPercent}%`;

    if (score > 0) {
        evalText.innerText = `X FAVOURED (+${score})`;
    } else if (score < 0) {
        evalText.innerText = `O FAVOURED (+${Math.abs(score)})`;
    } else {
        evalText.innerText = "HARMONY (0.0)";
    }
};

// ==========================================================================
// 5-SECOND HOURGLASS BLITZ TIMER
// ==========================================================================
const startBlitzTimer = () => {
    clearInterval(blitzInterval);
    if (!blitzMode || isGameOver) return;

    blitzTimeLeft = 100;
    blitzFill.style.width = "100%";

    blitzInterval = setInterval(() => {
        if (isGameOver || (vsAI && !turnO)) return;
        blitzTimeLeft -= 2;
        blitzFill.style.width = `${Math.max(0, blitzTimeLeft)}%`;

        if (blitzTimeLeft <= 0) {
            clearInterval(blitzInterval);
            const emptyIndices = boardState.map((v, i) => v === "" ? i : null).filter(i => i !== null);
            if (emptyIndices.length > 0) {
                const randIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
                executeMove(randIdx);
                if (vsAI && !isGameOver && !turnO) {
                    setTimeout(makeAIMove, 380);
                }
            }
        }
    }, 100);
};

// ==========================================================================
// CORE MOVE EXECUTION & FIFO QUEUE
// ==========================================================================
const executeMove = (index) => {
    if (boardState[index] !== "" || isGameOver) return;

    historyStack.push({
        board: [...boardState],
        turnO: turnO,
        queueO: [...queueO],
        queueX: [...queueX]
    });

    if (turnO) {
        if (infiniteMode && queueO.length === 3) {
            const oldestIdx = queueO.shift();
            boardState[oldestIdx] = "";
            sfx.vanish();
        }
        boardState[index] = "O";
        queueO.push(index);
        sfx.moveO();
        turnO = false;
    } else {
        if (infiniteMode && queueX.length === 3) {
            const oldestIdx = queueX.shift();
            boardState[oldestIdx] = "";
            sfx.vanish();
        }
        boardState[index] = "X";
        queueX.push(index);
        sfx.moveX();
        turnO = true;
    }

    renderBoard();
    checkWinner();

    if (!isGameOver) {
        updateTurnHUD();
        startBlitzTimer();
    }
};

boxes.forEach((box, idx) => {
    box.addEventListener("click", () => {
        if (boardState[idx] !== "" || isGameOver) return;
        if (vsAI && !turnO) return;

        executeMove(idx);

        if (vsAI && !isGameOver && !turnO) {
            setTimeout(makeAIMove, 380);
        }
    });
});

// ==========================================================================
// AI DECISION ENGINE (PASCAL / GUARD / MINIMAX ORACLE)
// ==========================================================================
const makeAIMove = () => {
    if (isGameOver) return;

    const emptyIndices = boardState.map((v, i) => v === "" ? i : null).filter(i => i !== null);
    if (emptyIndices.length === 0) return;

    let chosenIndex = null;

    if (aiDifficulty === "easy") {
        chosenIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    } else if (aiDifficulty === "medium" || infiniteMode) {
        chosenIndex = findImmediateMove("X") ?? findImmediateMove("O");
        if (chosenIndex === null && boardState[4] === "") chosenIndex = 4;
        if (chosenIndex === null) {
            chosenIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        }
    } else {
        let bestScore = -Infinity;
        for (let i of emptyIndices) {
            boardState[i] = "X";
            let score = minimax(boardState, 0, false);
            boardState[i] = "";
            if (score > bestScore) {
                bestScore = score;
                chosenIndex = i;
            }
        }
    }

    if (chosenIndex !== null) {
        executeMove(chosenIndex);
    }
};

const findImmediateMove = (symbol) => {
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        const vals = [boardState[a], boardState[b], boardState[c]];
        if (vals.filter(v => v === symbol).length === 2 && vals.filter(v => v === "").length === 1) {
            if (boardState[a] === "") return a;
            if (boardState[b] === "") return b;
            if (boardState[c] === "") return c;
        }
    }
    return null;
};

// ==========================================================================
// WIN / DRAW DETECTION & GOLDEN SUNDROP RAY
// ==========================================================================
const fireGoldenRay = (pattern) => {
    const key = pattern.join(",");
    const coords = rayCoords[key];
    if (!coords) return;

    rayLine.setAttribute("x1", coords.x1);
    rayLine.setAttribute("y1", coords.y1);
    rayLine.setAttribute("x2", coords.x2);
    rayLine.setAttribute("y2", coords.y2);
    rayLine.classList.add("active-ray");
};

const showWinner = (winner, pattern) => {
    isGameOver = true;
    clearInterval(blitzInterval);

    pattern.forEach(idx => boxes[idx].classList.add("win-box"));
    fireGoldenRay(pattern);
    sfx.win();

    if (winner === "O") {
        scores.O++;
        scoreOEl.innerText = scores.O;
        evalFillO.style.width = "100%";
        evalText.innerText = "SUNLIGHT VICTORY";
    } else {
        scores.X++;
        scoreXEl.innerText = scores.X;
        evalFillO.style.width = "0%";
        evalText.innerText = "ORACLE VICTORY";
    }
    saveScores();

    const winnerName = (vsAI && winner === "X") ? "SUNDROP ORACLE AI" : `PRINCESS ${winner}`;
    msg.innerText = `✨ VICTORY // ${winnerName}`;

    setTimeout(() => {
        msgContainer.classList.remove("hide");
    }, 850);
};

const showDraw = () => {
    isGameOver = true;
    clearInterval(blitzInterval);
    scores.draw++;
    scoreDrawEl.innerText = scores.draw;
    saveScores();

    evalFillO.style.width = "50%";
    evalText.innerText = "TWILIGHT TIE";
    sfx.draw();

    msg.innerText = "✨ TWILIGHT TIE // NO WINNER";
    setTimeout(() => {
        msgContainer.classList.remove("hide");
    }, 500);
};

const checkWinner = () => {
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
            showWinner(boardState[a], pattern);
            return;
        }
    }

    if (!boardState.includes("") && !isGameOver) {
        showDraw();
    }
};

// ==========================================================================
// LIFO STACK UNDO & RESET
// ==========================================================================
const undoLastMove = () => {
    if (historyStack.length === 0 || isGameOver) return;
    sfx.undo();

    let snapshot = historyStack.pop();
    if (vsAI && !snapshot.turnO && historyStack.length > 0) {
        snapshot = historyStack.pop();
    }

    boardState = [...snapshot.board];
    turnO = snapshot.turnO;
    queueO = [...snapshot.queueO];
    queueX = [...snapshot.queueX];

    renderBoard();
    updateTurnHUD();
    startBlitzTimer();
};

const resetGame = () => {
    clearInterval(blitzInterval);
    boardState = Array(9).fill("");
    queueO = [];
    queueX = [];
    historyStack = [];
    turnO = true;
    isGameOver = false;

    boxes.forEach(box => box.classList.remove("win-box", "dying-piece"));
    rayLine.classList.remove("active-ray");
    msgContainer.classList.add("hide");

    renderBoard();
    updateTurnHUD();
    startBlitzTimer();
};

// ==========================================================================
// LISTENERS, KEYBOARD HOTKEYS & FLOATING LANTERNS CANVAS
// ==========================================================================
modeAiBtn.addEventListener("click", () => {
    sfx.uiClick();
    vsAI = true;
    modeAiBtn.classList.add("active");
    modePvpBtn.classList.remove("active");
    aiDiffGroup.classList.remove("hide");
    labelX.innerText = "ORACLE AI (X)";
    resetGame();
});

modePvpBtn.addEventListener("click", () => {
    sfx.uiClick();
    vsAI = false;
    modePvpBtn.classList.add("active");
    modeAiBtn.classList.remove("active");
    aiDiffGroup.classList.add("hide");
    labelX.innerText = "ROYAL X";
    resetGame();
});

diffBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        sfx.uiClick();
        diffBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        aiDifficulty = btn.getAttribute("data-diff");
        resetGame();
    });
});

ruleClassicBtn.addEventListener("click", () => {
    sfx.uiClick();
    infiniteMode = false;
    ruleClassicBtn.classList.add("active");
    ruleInfiniteBtn.classList.remove("active");
    resetGame();
});

ruleInfiniteBtn.addEventListener("click", () => {
    sfx.uiClick();
    infiniteMode = true;
    ruleInfiniteBtn.classList.add("active");
    ruleClassicBtn.classList.remove("active");
    resetGame();
});

toggleBlitzBtn.addEventListener("click", () => {
    sfx.uiClick();
    blitzMode = !blitzMode;
    toggleBlitzBtn.classList.toggle("active", blitzMode);
    toggleBlitzBtn.innerHTML = `<i class="fas fa-hourglass-half"></i> BLITZ: ${blitzMode ? "ON" : "OFF"}`;
    blitzWrapper.classList.toggle("hide", !blitzMode);
    resetGame();
});

undoBtn.addEventListener("click", undoLastMove);

clearScoresBtn.addEventListener("click", () => {
    sfx.uiClick();
    scores = { O: 0, X: 0, draw: 0 };
    saveScores();
    scoreOEl.innerText = "0";
    scoreXEl.innerText = "0";
    scoreDrawEl.innerText = "0";
    resetGame();
});

newGameBtn.addEventListener("click", () => {
    sfx.uiClick();
    resetGame();
});

resetBtn.addEventListener("click", () => {
    sfx.uiClick();
    resetGame();
});

window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key >= "1" && key <= "9") {
        const idx = parseInt(key, 10) - 1;
        boxes[idx].click();
    } else if (key === "u") {
        undoLastMove();
    } else if (key === "r") {
        sfx.uiClick();
        resetGame();
    }
});

// Floating Tangled Sky Lanterns Canvas Background
const canvas = document.getElementById("lantern-canvas");
if (canvas) {
    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const lanterns = Array.from({ length: 28 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        w: Math.random() * 12 + 7,
        speedY: Math.random() * 0.55 + 0.2,
        phase: Math.random() * Math.PI * 2,
        opacity: Math.random() * 0.45 + 0.2
    }));

    function drawLanterns() {
        ctx.clearRect(0, 0, width, height);
        for (const l of lanterns) {
            const h = l.w * 1.35;
            l.phase += 0.015;
            l.x += Math.sin(l.phase) * 0.35;
            l.y -= l.speedY;

            if (l.y + h < -20) {
                l.y = height + 25;
                l.x = Math.random() * width;
            }

            ctx.save();
            ctx.translate(l.x, l.y);
            const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, l.w * 2);
            halo.addColorStop(0, `rgba(255, 215, 90, ${l.opacity * 0.6})`);
            halo.addColorStop(1, "rgba(255, 160, 20, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(0, 0, l.w * 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(255, 210, 95, ${l.opacity})`;
            ctx.beginPath();
            ctx.roundRect(-l.w / 2, -h / 2, l.w, h, 3);
            ctx.fill();
            ctx.restore();
        }
        requestAnimationFrame(drawLanterns);
    }
    drawLanterns();
}

renderBoard();
updateTurnHUD();
