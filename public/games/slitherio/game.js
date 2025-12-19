// Basic Slither-like single player demo

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const applesEl = document.getElementById("apples");

// Resize canvas to window
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// World settings
const WORLD_SIZE = 3000;
const NUM_APPLES = 80;
const NUM_AI = 6;

const BASE_SPEED = 1.6;
const SPRINT_MULT = 2.6;
const TURN_SPEED = 0.12;

const AI_BASE_SPEED = 1.4;
const AI_SPRINT_MULT = 2.2;
const SNAKE_RADIUS = 10;
const SEGMENT_DIST = 7;
const MAX_SEGMENTS = 140;

const APPLE_RADIUS = 6;
const BIG_APPLE_RADIUS = 10;
const APPLE_VALUE = 5;
const BIG_APPLE_VALUE = 10;

// Input
let mouseX = 0;
let mouseY = 0;
let mouseDown = false;
canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});
canvas.addEventListener("mousedown", () => mouseDown = true);
canvas.addEventListener("mouseup", () => mouseDown = false);
canvas.addEventListener("mouseleave", () => mouseDown = false);

// Camera
const camera = { x: 0, y: 0 };

// Utilities
function randRange(a, b) {
    return a + Math.random() * (b - a);
}
function dist2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
}

// Snake class
class Snake {
    constructor(x, y, color, isPlayer = false) {
        this.isPlayer = isPlayer;
        this.color = color;
        this.segments = [];
        this.dir = Math.random() * Math.PI * 2;
        this.speed = BASE_SPEED;
        this.apples = 0;
        this.score = 0;
        this.alive = true;
        this.targetApple = null;
        this.state = "wander"; // for AI: seekApple / avoidPlayer / wander
        this.avoidTimer = 0;

        const len = 40;
        for (let i = 0; i < len; i++) {
            this.segments.push({ x, y });
        }
    }

    head() {
        return this.segments[0];
    }

    killAndDropApples(applesArray) {
        this.alive = false;
        const head = this.head();
        const dropCount = Math.floor(this.segments.length / 6);
        for (let i = 0; i < dropCount; i++) {
            applesArray.push({
                x: head.x + randRange(-40, 40),
                y: head.y + randRange(-40, 40),
                big: true
            });
        }
    }

    updatePlayer(dt) {
        const head = this.head();

        // Move towards mouse
        const worldMouseX = camera.x + mouseX;
        const worldMouseY = camera.y + mouseY;
        let angToMouse = Math.atan2(worldMouseY - head.y, worldMouseX - head.x);

        // Shortest angle difference
        let diff = angToMouse - this.dir;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.dir += clamp(diff, -TURN_SPEED, TURN_SPEED);

        let speed = BASE_SPEED;
        if (mouseDown && this.apples > 0) {
            speed *= SPRINT_MULT;
            // Use apples as sprint fuel
            this.apples -= 10 * dt;
            if (this.apples < 0) this.apples = 0;
        }

        this.speed = speed;
        const dx = Math.cos(this.dir) * speed * 60 * dt;
        const dy = Math.sin(this.dir) * speed * 60 * dt;

        // Move segments
        head.x += dx;
        head.y += dy;

        // Keep in world bounds
        head.x = clamp(head.x, -WORLD_SIZE / 2, WORLD_SIZE / 2);
        head.y = clamp(head.y, -WORLD_SIZE / 2, WORLD_SIZE / 2);

        for (let i = 1; i < this.segments.length; i++) {
            const prev = this.segments[i - 1];
            const seg = this.segments[i];
            const vx = prev.x - seg.x;
            const vy = prev.y - seg.y;
            const d = Math.hypot(vx, vy);
            if (d > SEGMENT_DIST) {
                const t = (d - SEGMENT_DIST) / d;
                seg.x += vx * t;
                seg.y += vy * t;
            }
        }
    }

    chooseAIState(player) {
        if (!player.alive) {
            this.state = "wander";
            this.targetApple = null;
            return;
        }
        const head = this.head();
        const playerHead = player.head();
        const d2 = dist2(head, playerHead);

        // If player is close to head: flee
        const closeDist = 220;
        if (d2 < closeDist * closeDist) {
            this.state = "avoidPlayer";
            this.avoidTimer = 0.6;
            this.targetApple = null;
            return;
        }

        // If recently avoiding player, keep that a bit
        if (this.state === "avoidPlayer" && this.avoidTimer > 0) {
            return;
        }

        // Default: sometimes seek apple, sometimes wander
        if (Math.random() < 0.004) {
            this.state = Math.random() < 0.6 ? "seekApple" : "wander";
            this.targetApple = null;
        }
    }

    aiFindApple(apples) {
        if (!apples.length) return null;
        let best = null;
        let bestD = Infinity;
        const head = this.head();
        for (const a of apples) {
            const d2 = dist2(head, a);
            if (d2 < bestD) {
                bestD = d2;
                best = a;
            }
        }
        return best;
    }

    updateAI(dt, apples, player) {
        const head = this.head();

        this.chooseAIState(player);

        let targetAngle = this.dir;

        if (this.state === "avoidPlayer") {
            this.avoidTimer -= dt;
            const ph = player.head();
            let angToPlayer = Math.atan2(ph.y - head.y, ph.x - head.x);
            targetAngle = angToPlayer + Math.PI; // opposite direction
        } else if (this.state === "seekApple") {
            if (!this.targetApple || Math.random() < 0.01) {
                this.targetApple = this.aiFindApple(apples);
            }
            if (this.targetApple) {
                targetAngle = Math.atan2(
                    this.targetApple.y - head.y,
                    this.targetApple.x - head.x
                );
            } else {
                this.state = "wander";
            }
        } else {
            // wander
            targetAngle += randRange(-0.2, 0.2) * dt * 60;
        }

        let diff = targetAngle - this.dir;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.dir += clamp(diff, -TURN_SPEED * 0.9, TURN_SPEED * 0.9);

        let speed = AI_BASE_SPEED;
        if (this.state === "avoidPlayer") {
            speed *= AI_SPRINT_MULT;
        }
        this.speed = speed;

        const dx = Math.cos(this.dir) * speed * 60 * dt;
        const dy = Math.sin(this.dir) * speed * 60 * dt;

        head.x += dx;
        head.y += dy;

        head.x = clamp(head.x, -WORLD_SIZE / 2, WORLD_SIZE / 2);
        head.y = clamp(head.y, -WORLD_SIZE / 2, WORLD_SIZE / 2);

        for (let i = 1; i < this.segments.length; i++) {
            const prev = this.segments[i - 1];
            const seg = this.segments[i];
            const vx = prev.x - seg.x;
            const vy = prev.y - seg.y;
            const d = Math.hypot(vx, vy);
            if (d > SEGMENT_DIST) {
                const t = (d - SEGMENT_DIST) / d;
                seg.x += vx * t;
                seg.y += vy * t;
            }
        }
    }

    eatApples(apples) {
        const head = this.head();
        for (let i = apples.length - 1; i >= 0; i--) {
            const a = apples[i];
            const r = a.big ? BIG_APPLE_RADIUS : APPLE_RADIUS;
            const d = Math.hypot(head.x - a.x, head.y - a.y);
            if (d < SNAKE_RADIUS + r) {
                apples.splice(i, 1);
                const val = a.big ? BIG_APPLE_VALUE : APPLE_VALUE;
                this.score += val;
                this.apples += val;
                // grow a bit
                for (let j = 0; j < 4; j++) {
                    const last = this.segments[this.segments.length - 1];
                    this.segments.push({ x: last.x, y: last.y });
                }
                if (this.segments.length > MAX_SEGMENTS) {
                    this.segments.length = MAX_SEGMENTS;
                }
            }
        }
    }

    checkCollisionsWith(otherSnakes, apples) {
        if (!this.alive) return;
        const head = this.head();
        for (const s of otherSnakes) {
            if (!s.alive || s === this) continue;
            for (let i = 0; i < s.segments.length; i++) {
                const seg = s.segments[i];
                const d = Math.hypot(head.x - seg.x, head.y - seg.y);
                if (d < SNAKE_RADIUS * 1.1) {
                    // This snake hits s's body; this snake dies and drops big apples
                    this.killAndDropApples(apples);
                    return;
                }
            }
        }
    }

    draw(ctx) {
        if (!this.alive) return;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Body
        ctx.strokeStyle = this.color;
        ctx.lineWidth = SNAKE_RADIUS * 2;
        ctx.beginPath();
        const first = this.segments[0];
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < this.segments.length; i++) {
            const p = this.segments[i];
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        // Head highlight
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(first.x, first.y, SNAKE_RADIUS * 0.9, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Game state
const apples = [];
const snakes = [];

function spawnApples(count) {
    for (let i = 0; i < count; i++) {
        apples.push({
            x: randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2),
            y: randRange(-WORLD_SIZE / 2, WORLD_SIZE / 2),
            big: false
        });
    }
}

function ensureAppleCount() {
    const missing = NUM_APPLES - apples.length;
    if (missing > 0) spawnApples(missing);
}

// Init
const player = new Snake(0, 0, "#3bdcff", true);
snakes.push(player);
for (let i = 0; i < NUM_AI; i++) {
    const ai = new Snake(
        randRange(-600, 600),
        randRange(-600, 600),
        `hsl(${Math.floor(Math.random() * 360)},80%,55%)`,
        false
    );
    snakes.push(ai);
}
spawnApples(NUM_APPLES);

let lastTime = performance.now();

function gameLoop(t) {
    const dt = (t - lastTime) / 1000;
    lastTime = t;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (player.alive) {
        player.updatePlayer(dt);
    }

    for (const s of snakes) {
        if (!s.alive || s.isPlayer) continue;
        s.updateAI(dt, apples, player);
    }

    for (const s of snakes) {
        if (!s.alive) continue;
        s.eatApples(apples);
    }

    for (const s of snakes) {
        if (!s.alive) continue;
        s.checkCollisionsWith(snakes, apples);
    }

    ensureAppleCount();

    // Camera follows player head
    if (player.alive) {
        const h = player.head();
        camera.x = h.x - canvas.width / 2;
        camera.y = h.y - canvas.height / 2;
    }
}

function drawBackground() {
    const gridSize = 60;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = Math.floor((camera.x - canvas.width / 2) / gridSize) * gridSize;
    const endX = camera.x + canvas.width + gridSize;
    for (let x = startX; x < endX; x += gridSize) {
        ctx.moveTo(x, camera.y - 1000);
        ctx.lineTo(x, camera.y + 1000);
    }
    const startY = Math.floor((camera.y - canvas.height / 2) / gridSize) * gridSize;
    const endY = camera.y + canvas.height + gridSize;
    for (let y = startY; y < endY; y += gridSize) {
        ctx.moveTo(camera.x - 1000, y);
        ctx.lineTo(camera.x + 1000, y);
    }
    ctx.stroke();
}

function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // World transform
    ctx.translate(-camera.x, -camera.y);

    drawBackground();

    // Apples
    for (const a of apples) {
        ctx.beginPath();
        ctx.fillStyle = a.big ? "#ffcc33" : "#ff3333";
        ctx.arc(a.x, a.y, a.big ? BIG_APPLE_RADIUS : APPLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }

    for (const s of snakes) {
        s.draw(ctx);
    }

    // UI
    scoreEl.textContent = Math.floor(player.score);
    applesEl.textContent = Math.floor(player.apples);
}

requestAnimationFrame(gameLoop);
