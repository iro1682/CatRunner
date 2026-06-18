const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startLayer = document.getElementById("startLayer");
const startButton = document.getElementById("startButton");
const closeButton = document.getElementById("closeButton");
const statusLabel = document.getElementById("statusLabel");
const statusTitle = document.getElementById("statusTitle");
const scoreText = document.getElementById("scoreText");
const bestText = document.getElementById("bestText");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const FLOOR_Y = 418;
const GRAVITY = 0.92;
const JUMP_POWER = -18;
const GAME_SPEED = 6;
const STORAGE_KEY = "cat-runner-best-score";

let bestScore = Number(localStorage.getItem(STORAGE_KEY) || 0);
let score = 0;
let speed = 6;
let spawnTimer = 0;
let state = "ready";
let lastTime = 0;
let worldTick = 0;
let obstacles = [];
let particles = [];
let spawnHistory = [];

const cat = {
    x: 128,
    y: FLOOR_Y - 68,
    width: 78,
    height: 68,
    vy: 0,
    grounded: true,
    blink: 0
};

bestText.textContent = bestScore;

function resetGame() {
    score = 0;
    speed = GAME_SPEED;
    spawnTimer = 55;
    worldTick = 0;
    obstacles = [];
    particles = [];
    spawnHistory = [];
    cat.y = FLOOR_Y - cat.height;
    cat.vy = 0;
    cat.grounded = true;
    state = "playing";
    startLayer.classList.add("is-hidden");
    lastTime = performance.now();
}

function returnToTitle() {
    score = 0;
    speed = GAME_SPEED;
    spawnTimer = 0;
    worldTick = 0;
    obstacles = [];
    particles = [];
    spawnHistory = [];
    cat.y = FLOOR_Y - cat.height;
    cat.vy = 0;
    cat.grounded = true;
    state = "ready";
    scoreText.textContent = "0";
    statusLabel.textContent = "READY";
    statusTitle.textContent = "ジャンプでよけよう";
    startButton.textContent = "START";
    startLayer.classList.remove("is-hidden");
}

function jump() {
    if (state === "ready" || state === "gameover") {
        resetGame();
        return;
    }

    if (cat.grounded) {
        cat.vy = JUMP_POWER;
        cat.grounded = false;
        addDust(cat.x + 22, FLOOR_Y - 8, 9);
    }
}

function endGame() {
    state = "gameover";
    bestScore = Math.max(bestScore, Math.floor(score));
    localStorage.setItem(STORAGE_KEY, String(bestScore));
    bestText.textContent = bestScore;
    statusLabel.textContent = "GAME OVER";
    statusTitle.textContent = `${Math.floor(score)} 点`;
    startButton.textContent = "RETRY";
    startLayer.classList.remove("is-hidden");
}

function spawnObstacle() {
    const density = Math.min(score / 1600, 1);
    const type = pickObstacleType(density);

    if (type === "crate") {
        obstacles.push({
            type: "crate",
            x: WIDTH + 36,
            y: FLOOR_Y - 50,
            width: 48,
            height: 50,
            hitPad: 10
        });
    } else if (type === "spike") {
        obstacles.push({
            type: "spike",
            x: WIDTH + 36,
            y: FLOOR_Y - 58,
            width: 62,
            height: 58,
            hitPad: 12
        });
    } else {
        const fireballSpeedMultiplier = 1.45;
        const fireballSpawnX = WIDTH + 42;
        const fireballSpeed = speed * fireballSpeedMultiplier;
        const fireballLanes = [
            { y: FLOOR_Y - cat.height + 18, hitsCat: true },
            { y: FLOOR_Y - cat.height - 42, hitsCat: false },
            { y: FLOOR_Y - cat.height - 86, hitsCat: false }
        ];
        let lane = fireballLanes[Math.floor(Math.random() * fireballLanes.length)];

        if (lane.hitsCat && isLowFireballUnsafe(fireballSpawnX, fireballSpeed)) {
            const highLanes = fireballLanes.filter((fireballLane) => !fireballLane.hitsCat);
            lane = highLanes[Math.floor(Math.random() * highLanes.length)];
        }

        obstacles.push({
            type: "fireball",
            x: fireballSpawnX,
            y: lane.y,
            width: 56,
            height: 38,
            hitPad: 8,
            wave: Math.random() * 100,
            speedMultiplier: fireballSpeedMultiplier
        });
    }

    const minDelay = 50 - density * 12;
    const randomDelay = 76 - density * 24;
    spawnTimer = minDelay + Math.random() * randomDelay;
}

function isLowFireballUnsafe(spawnX, fireballSpeed) {
    const fireballArrivalTick = worldTick + (spawnX - cat.x) / fireballSpeed;
    const unsafeStartOffset = 8;
    const unsafeEndOffset = 74;

    return obstacles
        .filter((obstacle) => obstacle.type !== "fireball" && obstacle.x + obstacle.width > cat.x)
        .some((obstacle) => {
            const groundArrivalTick = worldTick + (obstacle.x - cat.x) / speed;
            const unsafeStart = groundArrivalTick + unsafeStartOffset;
            const unsafeEnd = groundArrivalTick + unsafeEndOffset;
            return fireballArrivalTick >= unsafeStart && fireballArrivalTick <= unsafeEnd;
        });
}

function pickObstacleType(density) {
    const recent = spawnHistory.slice(-5);
    const recentFireballs = recent.filter((type) => type === "fireball").length;
    const lastTwo = spawnHistory.slice(-2);

    let fireballChance = 0.28 + density * 0.14;
    if (recentFireballs <= 1) {
        fireballChance += 0.12;
    }
    if (recentFireballs >= 3) {
        fireballChance -= 0.18;
    }
    if (lastTwo.length === 2 && lastTwo.every((type) => type === "fireball")) {
        fireballChance = 0;
    }
    if (lastTwo.length === 2 && lastTwo.every((type) => type !== "fireball")) {
        fireballChance = Math.max(fireballChance, 0.5);
    }

    const type = Math.random() < fireballChance
        ? "fireball"
        : (Math.random() < 0.54 ? "crate" : "spike");

    spawnHistory.push(type);
    spawnHistory = spawnHistory.slice(-8);
    return type;
}

function update(deltaScale) {
    if (state !== "playing") {
        worldTick += 0.7 * deltaScale;
        return;
    }

    worldTick += deltaScale;
    score += 0.18 * speed * deltaScale;
    speed = GAME_SPEED;
    scoreText.textContent = Math.floor(score);

    cat.vy += GRAVITY * deltaScale;
    cat.y += cat.vy * deltaScale;

    if (cat.y >= FLOOR_Y - cat.height) {
        cat.y = FLOOR_Y - cat.height;
        cat.vy = 0;
        cat.grounded = true;
    }

    spawnTimer -= deltaScale;
    if (spawnTimer <= 0) {
        spawnObstacle();
    }

    obstacles.forEach((obstacle) => {
        const obstacleSpeed = obstacle.type === "fireball" ? speed * obstacle.speedMultiplier : speed;
        obstacle.x -= obstacleSpeed * deltaScale;
        if (obstacle.type === "fireball") {
            obstacle.wave += 0.13 * deltaScale;
            if (Math.random() < 0.18) {
                addSpark(obstacle.x + obstacle.width, obstacle.y + obstacle.height / 2);
            }
        }
    });

    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -40);

    particles.forEach((particle) => {
        particle.x += particle.vx * deltaScale;
        particle.y += particle.vy * deltaScale;
        particle.vy += 0.12 * deltaScale;
        particle.life -= deltaScale;
    });
    particles = particles.filter((particle) => particle.life > 0);

    if (obstacles.some(collides)) {
        addDust(cat.x + 36, cat.y + 42, 18);
        endGame();
    }
}

function collides(obstacle) {
    const pad = obstacle.hitPad;
    const catBox = {
        x: cat.x + 14,
        y: cat.y + 12,
        width: cat.width - 22,
        height: cat.height - 16
    };
    const obstacleBox = {
        x: obstacle.x + pad,
        y: obstacle.y + pad,
        width: obstacle.width - pad * 2,
        height: obstacle.height - pad * 2
    };

    return catBox.x < obstacleBox.x + obstacleBox.width &&
        catBox.x + catBox.width > obstacleBox.x &&
        catBox.y < obstacleBox.y + obstacleBox.height &&
        catBox.y + catBox.height > obstacleBox.y;
}

function addDust(x, y, count) {
    for (let i = 0; i < count; i += 1) {
        particles.push({
            type: "dust",
            x,
            y,
            vx: -2 - Math.random() * 4,
            vy: -1 - Math.random() * 4,
            life: 18 + Math.random() * 16,
            size: 4 + Math.random() * 6
        });
    }
}

function addSpark(x, y) {
    particles.push({
        type: "spark",
        x,
        y,
        vx: 1 + Math.random() * 2,
        vy: -1 + Math.random() * 2,
        life: 12 + Math.random() * 8,
        size: 4 + Math.random() * 4
    });
}

function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawBackground() {
    rect(0, 0, WIDTH, HEIGHT, "#86c9d6");

    const sunX = 760;
    rect(sunX, 52, 72, 72, "#f8d96a");
    rect(sunX - 12, 76, 96, 24, "#f8d96a");
    rect(sunX + 24, 40, 24, 96, "#f8d96a");

    drawCloud(76 - (worldTick * 0.35) % 1060, 72);
    drawCloud(516 - (worldTick * 0.2) % 1100, 112);
    drawCloud(980 - (worldTick * 0.28) % 1140, 58);

    for (let i = 0; i < 7; i += 1) {
        const x = (i * 190 - (worldTick * speed * 0.18) % 190) - 48;
        rect(x, 306, 116, 62, "#5c9f65");
        rect(x + 16, 284, 76, 34, "#6fb878");
    }

    rect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y, "#5aa35c");
    rect(0, FLOOR_Y, WIDTH, 14, "#376b3f");

    for (let i = 0; i < 42; i += 1) {
        const x = (i * 32 - (worldTick * speed) % 32);
        const color = i % 2 === 0 ? "#e4c26d" : "#8cc66d";
        rect(x, FLOOR_Y + 16, 18, 8, color);
        rect(x + 10, FLOOR_Y + 46, 22, 8, "#3f7f47");
    }
}

function drawCloud(x, y) {
    rect(x, y + 18, 92, 24, "#f7fff2");
    rect(x + 18, y, 30, 26, "#f7fff2");
    rect(x + 48, y + 8, 34, 26, "#f7fff2");
}

function drawCat() {
    const x = cat.x;
    const y = cat.y;
    const runFrame = Math.floor(worldTick / 7) % 2;
    const legA = runFrame === 0 ? 0 : 8;
    const legB = runFrame === 0 ? 8 : 0;

    rect(x + 16, y + 26, 46, 28, "#c76a2e");
    rect(x + 54, y + 18, 28, 30, "#d77d35");
    rect(x + 58, y + 10, 9, 12, "#c76a2e");
    rect(x + 74, y + 10, 9, 12, "#c76a2e");
    rect(x + 62, y + 14, 4, 5, "#f4b76a");
    rect(x + 76, y + 14, 4, 5, "#f4b76a");

    rect(x + 8, y + 30, 14, 10, "#d77d35");
    rect(x, y + 24, 12, 10, "#c76a2e");
    rect(x - 8, y + 18, 12, 10, "#d77d35");

    rect(x + 24, y + 30, 26, 5, "#8e4526");
    rect(x + 18, y + 42, 32, 5, "#8e4526");
    rect(x + 60, y + 28, 16, 4, "#8e4526");
    rect(x + 60, y + 40, 12, 4, "#8e4526");

    rect(x + 61, y + 28, 5, 5, "#1e1a17");
    rect(x + 76, y + 28, 5, 5, "#1e1a17");
    rect(x + 68, y + 36, 5, 4, "#543127");
    rect(x + 82, y + 34, 8, 3, "#fff8e9");

    rect(x + 22, y + 52 + legA, 10, 18 - legA, "#b95b2c");
    rect(x + 48, y + 52 + legB, 10, 18 - legB, "#b95b2c");
    rect(x + 18, y + 66, 18, 6, "#6a3c2a");
    rect(x + 44, y + 66, 18, 6, "#6a3c2a");

    if (!cat.grounded) {
        rect(x + 20, y + 58, 12, 8, "#b95b2c");
        rect(x + 48, y + 58, 12, 8, "#b95b2c");
    }
}

function drawObstacle(obstacle) {
    if (obstacle.type === "crate") {
        rect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, "#9a5b36");
        rect(obstacle.x + 6, obstacle.y + 6, obstacle.width - 12, obstacle.height - 12, "#c48645");
        rect(obstacle.x + 18, obstacle.y, 8, obstacle.height, "#704126");
        rect(obstacle.x + 4, obstacle.y + 20, obstacle.width - 8, 7, "#704126");
    }

    if (obstacle.type === "spike") {
        rect(obstacle.x + 4, obstacle.y + 44, obstacle.width - 8, 14, "#6f5645");
        rect(obstacle.x + 10, obstacle.y + 20, 14, 30, "#d8d3bd");
        rect(obstacle.x + 24, obstacle.y + 8, 14, 42, "#f7f0d7");
        rect(obstacle.x + 40, obstacle.y + 24, 14, 26, "#d8d3bd");
    }

    if (obstacle.type === "fireball") {
        rect(obstacle.x + 12, obstacle.y + 8, 38, 22, "#f15a24");
        rect(obstacle.x + 20, obstacle.y + 12, 24, 14, "#ffd05a");
        rect(obstacle.x, obstacle.y + 12, 18, 10, "#b82d20");
        rect(obstacle.x + 48, obstacle.y + 12, 12, 10, "#f15a24");
    }
}

function drawParticles() {
    particles.forEach((particle) => {
        if (particle.type === "spark") {
            rect(particle.x, particle.y, particle.size, particle.size, "#ffd05a");
        } else {
            rect(particle.x, particle.y, particle.size, particle.size, "#d2b06b");
        }
    });
}

function drawOverlayText() {
    if (state === "playing") {
        return;
    }

    ctx.font = "900 20px Meiryo, sans-serif";
    ctx.fillStyle = "#241f1a";
    ctx.fillText("SPACE / TAP", 36, 46);
}

function draw() {
    ctx.imageSmoothingEnabled = false;
    drawBackground();
    obstacles.forEach(drawObstacle);
    drawParticles();
    drawCat();
    drawOverlayText();
}

function loop(now) {
    const delta = Math.min(34, now - lastTime || 16);
    lastTime = now;
    update(delta / 16.67);
    draw();
    requestAnimationFrame(loop);
}

startButton.addEventListener("click", resetGame);
closeButton.addEventListener("click", () => {
    returnToTitle();
});
canvas.addEventListener("pointerdown", jump);
document.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        jump();
    }
});

draw();
requestAnimationFrame(loop);
