const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1000;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let gameScore = 0;
let isGameOver = false;
let bossActive = false;
let boss = null;
let screenShake = 0; // Global screen shake интенсивность
let cameraX = 0;
let cameraY = 0;

class Particle {
    constructor(x, y, vx, vy, color, life, size = 2) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.maxLife = life;
        this.life = life;
        this.size = size;
        this.isDead = false;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.05; // Gravity
        this.life--;
        if (this.life <= 0) this.isDead = true;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

const particles = [];

class Projectile {
    constructor(x, y, facing) {
        this.x = x;
        this.y = y;
        this.vx = facing * 14;
        this.facing = facing;
        this.width = 32;
        this.height = 32;
        this.radius = 18;
        this.isDead = false;
        this.life = 70;
        this.maxLife = 70;
        this.frame = 0;
    }

    update() {
        this.x += this.vx;
        this.frame++;
        this.life--;
        if (this.life <= 0) this.isDead = true;

        // Spawn fire trail particles
        for (let i = 0; i < 3; i++) {
            const colors = ['#ff4500', '#ff8c00', '#ffd700', '#ff6347'];
            const c = colors[Math.floor(Math.random() * colors.length)];
            particles.push(new Particle(
                this.x + this.radius / 2 - this.facing * 6,
                this.y,
                (Math.random() - 0.5) * 2 - this.facing * 1,
                (Math.random() - 0.5) * 2,
                c,
                15 + Math.random() * 10,
                4 + Math.random() * 4
            ));
        }
    }

    draw(ctx) {
        ctx.save();
        const cx = this.x + this.radius;
        const cy = this.y;
        const flicker = Math.sin(this.frame * 0.8) * 3;

        // Outer glow
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, this.radius + 10 + flicker);
        grad.addColorStop(0, 'rgba(255, 255, 200, 1)');
        grad.addColorStop(0.2, 'rgba(255, 160, 0, 0.9)');
        grad.addColorStop(0.5, 'rgba(255, 60, 0, 0.6)');
        grad.addColorStop(1, 'rgba(255, 40, 0, 0)');

        ctx.shadowBlur = 40;
        ctx.shadowColor = '#ff4500';
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, this.radius + 10 + flicker, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright core
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius * 0.6);
        coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
        coreGrad.addColorStop(0.4, 'rgba(255,220,80,1)');
        coreGrad.addColorStop(1, 'rgba(255,100,0,0.8)');
        ctx.fillStyle = coreGrad;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

function updateScore(amount) {
    if (isGameOver) return;
    gameScore += amount;
    const scoreEl = document.getElementById('gameScore');
    if (scoreEl) scoreEl.innerText = gameScore;
}

function resetGame() {
    location.reload();
}

class InputHandler {
    constructor() {
        this.keys = {};
        window.addEventListener('keydown', e => {
            this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', e => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }
}

class Player {
    constructor() {
        this.width = 40;
        this.height = 70;
        this.x = 100;
        this.y = WORLD_HEIGHT - 120;
        this.vx = 0;
        this.vy = 0;
        this.baseSpeed = 5;
        this.speed = 5;
        this.jumpForce = 8.5;
        this.gravity = 0.22;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.jumpBufferCounter = 0;

        this.hp = 100;
        this.maxHp = 100;
        this.invincibility = 0;
        this.isSlashing = false;
        this.isDashing = false;
        this.isBlocking = false;
        this.dashCooldown = 0; // This seems unused now, replaced by dashCharges
        this.slashTimer = 0;
        this.facing = 1;
        this.stretchX = 1;
        this.stretchY = 1;

        this.blockTimer = 0;
        this.blockRecovery = 0;
        this.canBlock = true;
        this.slashRecovery = 0;

        // Dash Charges
        this.dashCharges = 3;
        this.maxDashCharges = 3;
        this.dashRechargeTimer = 0;
        this.rechargeRate = 300;
        this.kx = 0;
        this.ky = 0;

        // Combat Stats
        this.isDashAttacking = false;
        this.dashAttackTimer = 0;
        this.dashAfterImages = [];
        this.speedBoostTimer = 0;
        this.dashTimer = 0; // Frame-based dash timer

        // Stickman Visuals & Animation
        this.animTimer = 0;
        this.headOffsetX = 0;
        this.headOffsetY = 0;
        this.ribbonSegments = Array.from({ length: 14 }, () => ({ x: this.x, y: this.y, vx: 0, vy: 0 }));

        // Visual Optimization
        this.blinkTimer = 0;
        this.lastOnGround = true;
        this.landSquash = 1;
        this.eyesNarrowed = 0;
        this.hitFlash = 0;

        // Counter Attack (S)
        this.isCountering = false;
        this.counterTimer = 0;
        this.counterShockwaveRadius = 0;

        // Remote Skill (U)
        this.uSkillCooldown = 0;
    }

    takeDamage(amount, sourceX, force = 10) {
        if (this.invincibility > 0) return;

        if (this.isBlocking) {
            this.triggerCounterAttack();
            return;
        }
        this.hp -= amount;
        this.invincibility = 60;
        this.hitFlash = 10;

        const dir = this.x + this.width / 2 > sourceX ? 1 : -1;
        this.kx = dir * force;
        this.ky = -force * 0.5;

        if (this.hp < 0) this.hp = 0;
        const healthBar = document.getElementById('playerHealth');
        if (healthBar) healthBar.style.width = (this.hp / this.maxHp * 100) + '%';
    }

    triggerCounterAttack() {
        if (this.isCountering) return;
        this.isCountering = true;
        this.counterTimer = 25; // 0.4s counter
        this.counterShockwaveRadius = 0;
        this.invincibility = 30; // Brief invulnerability
        this.isBlocking = false;
        this.blockRecovery = 20; // Recovery after successful block
        screenShake = 20;
    }

    update(input, level) {
        if (this.invincibility > 0) this.invincibility--;
        if (this.hitFlash > 0) {
            this.hitFlash--;
            this.eyesNarrowed = 15;
        }

        // Blinking
        this.blinkTimer--;
        if (this.blinkTimer < -5) this.blinkTimer = 180 + Math.random() * 240;

        // Eye state transitions
        if (this.isSlashing || this.isDashAttacking) this.eyesNarrowed = Math.min(20, this.eyesNarrowed + 2);
        else if (this.eyesNarrowed > 0) this.eyesNarrowed--;

        // Speed Boost Logic
        if (this.speedBoostTimer > 0) {
            this.speedBoostTimer--;
            this.speed = this.baseSpeed * 1.5;
        } else {
            this.speed = this.baseSpeed;
        }

        // Counter Shockwave Physics
        if (this.isCountering) {
            this.counterTimer--;
            this.counterShockwaveRadius += 12; // Expand radius
            this.vx *= 0.8; // Decelerate during counter
            this.vy *= 0.8;
            if (this.counterTimer <= 0) {
                this.isCountering = false;
                this.counterShockwaveRadius = 0;
            }
        }

        this.animTimer += Math.abs(this.vx) * 0.15;

        const wasOnGround = this.onGround;

        // Iaido Slash Logic
        if (input.keys['j'] && !this.isSlashing && this.slashRecovery <= 0 && !this.isBlocking && this.blockRecovery <= 0 && !this.isDashAttacking) {
            this.isSlashing = true;
            this.slashTimer = 18;
        }

        if (this.slashTimer > 0) {
            this.slashTimer--;
            this.vx = 0;
            if (this.slashTimer === 0) {
                this.isSlashing = false;
                this.slashRecovery = 30;
            }
        }

        if (this.slashRecovery > 0) {
            this.slashRecovery--;
            this.vx = 0;
        }

        // Knockback Physics
        this.x += this.kx;
        this.y += this.ky;
        this.kx *= 0.85;
        this.ky *= 0.85;
        if (Math.abs(this.kx) < 0.5) this.kx = 0;
        if (Math.abs(this.ky) < 0.5) this.ky = 0;

        // Horizontal Movement
        if (Math.abs(this.kx) < 2 && !this.isDashing && !this.isBlocking && !this.isSlashing && this.slashRecovery <= 0 && !this.isDashAttacking) {
            if (input.keys['a']) { this.vx = -this.speed; this.facing = -1; }
            else if (input.keys['d']) { this.vx = this.speed; this.facing = 1; }
            else this.vx = 0;
        } else if (!this.isDashing && !this.isDashAttacking) {
            this.vx = 0;
        }

        // Jumping
        if (this.onGround) this.coyoteTimer = 10;
        else if (this.coyoteTimer > 0) this.coyoteTimer--;

        // Footstep/Jump effects
        if (!this.lastOnGround && this.onGround) {
            // Landed
            this.landSquash = 15;
            for (let i = 0; i < 8; i++) {
                particles.push(new Particle(this.x + this.width / 2, this.y + this.height, (Math.random() - 0.5) * 4, -Math.random() * 2, '#4ecca3', 20 + Math.random() * 10, 3));
            }
        }
        if (wasOnGround && !this.onGround && this.vy < 0) {
            // Jumped
            for (let i = 0; i < 6; i++) {
                particles.push(new Particle(this.x + this.width / 2, this.y + this.height, (Math.random() - 0.5) * 3, Math.random() * 1, '#4ecca3', 15 + Math.random() * 10, 2));
            }
        }
        if (this.onGround && Math.abs(this.vx) > 0.1 && Math.floor(this.animTimer * 2) % 4 === 0) {
            // Running dust
            particles.push(new Particle(this.x + this.width / 2 - this.facing * 10, this.y + this.height, -this.facing * Math.random() * 2, -Math.random() * 1, '#4ecca3', 10 + Math.random() * 10, 2));
        }

        this.lastOnGround = this.onGround;
        if (this.landSquash > 0) this.landSquash--;

        if (input.keys['k'] || input.keys[' ']) this.jumpBufferCounter = 10;
        else if (this.jumpBufferCounter > 0) this.jumpBufferCounter--;

        if (this.jumpBufferCounter > 0 && this.coyoteTimer > 0 && !this.isSlashing && this.slashRecovery <= 0) {
            this.vy = -this.jumpForce;
            this.onGround = false;
            this.coyoteTimer = 0;
            this.jumpBufferCounter = 0;
            this.stretchY = 1.3;
            this.stretchX = 0.7;
        }

        this.vy += this.gravity;
        if (this.vy > 20) this.vy = 20;
        this.x += this.vx;
        this.y += this.vy;

        level.checkCollision(this);

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;
        if (this.y > WORLD_HEIGHT + 100) {
            this.takeDamage(20, this.x);
            this.x = 100; this.y = 100; this.vy = 0;
        }

        if (this.hp <= 0 && !isGameOver) {
            isGameOver = true;
            alert("GAME OVER! Score: " + gameScore);
            resetGame();
        }

        // Defense
        const blockKey = input.keys['s'];
        if (blockKey && this.canBlock && this.blockRecovery <= 0 && !this.isDashing && !this.isSlashing) {
            this.isBlocking = true;
            this.blockTimer++;
            if (this.blockTimer >= 30) {
                this.isBlocking = false;
                this.canBlock = false;
                this.blockRecovery = 12;
            }
        } else {
            if (this.isBlocking) {
                this.isBlocking = false;
                this.blockRecovery = 12;
            }
            if (!blockKey) this.canBlock = true;
            this.blockTimer = 0;
        }

        if (this.blockRecovery > 0) {
            this.blockRecovery--;
            this.vx = 0;
        }

        // Dashing
        if (input.keys['l'] && this.dashCharges > 0 && !this.isDashing && !this.isBlocking && this.blockRecovery <= 0 && this.slashRecovery <= 0 && !this.isDashAttacking) {
            this.isDashing = true;
            this.dashCharges--;
            this.dashTimer = 15; // 15 frames of dash
            this.invincibility = 18; // Slightly more i-frames than dash duration
            this.vx = this.facing * 16;
        }

        if (this.isDashing) {
            this.dashTimer--;
            this.vx = this.facing * 16;
            this.vy *= 0.1; // Float slightly
            if (this.dashTimer % 3 === 0) {
                this.dashAfterImages.push({ x: this.x, y: this.y, life: 0.8 });
            }
            if (this.dashTimer <= 0) {
                this.isDashing = false;
            }
        }
        // Lightning Dash Attack (S + J)
        if (this.isBlocking && input.keys['j'] && !this.isDashAttacking && this.dashCharges >= 2) {
            this.isDashAttacking = true;
            this.isBlocking = false;
            this.dashAttackTimer = 20;
            this.dashCharges -= 2;
            this.vx = this.facing * 42;
            this.invincibility = 30;
            screenShake = 15;
        }

        if (this.isDashAttacking) {
            this.dashAttackTimer--;
            this.vx = this.facing * 35;
            this.vy = 0;
            if (this.dashAttackTimer % 2 === 0) {
                this.dashAfterImages.push({ x: this.x, y: this.y, life: 1.0 });
            }
            if (this.dashAttackTimer <= 0) {
                this.isDashAttacking = false;
                this.vx = 0;
                this.slashRecovery = 45;
                this.speedBoostTimer = 180; // 3s boost
            }
        }

        this.dashAfterImages.forEach(img => img.life -= 0.05);
        this.dashAfterImages = this.dashAfterImages.filter(img => img.life > 0);

        // Remote Lightning (U)
        if (input.keys['u'] && this.uSkillCooldown <= 0 && !this.isDashAttacking && !this.isSlashing && !this.isDashing) {
            projectiles.push(new Projectile(this.x + (this.facing === 1 ? this.width : -40), this.y + 30, this.facing));
            this.uSkillCooldown = 100;
        }
        if (this.uSkillCooldown > 0) this.uSkillCooldown--;

        // Energy Recharge
        if (this.dashCharges < this.maxDashCharges) {
            this.dashRechargeTimer++;
            if (this.dashRechargeTimer >= this.rechargeRate) {
                this.dashCharges++;
                this.dashRechargeTimer = 0;
            }
        } else {
            this.dashRechargeTimer = 0;
        }

        const staminaBar = document.getElementById('playerStamina');
        if (staminaBar) {
            const perc = ((this.dashCharges + (this.dashRechargeTimer / this.rechargeRate)) / this.maxDashCharges) * 100;
            staminaBar.style.width = perc + '%';
        }

        this.stretchX += (1 - this.stretchX) * 0.1;
        this.stretchY += (1 - this.stretchY) * 0.1;
        if (!wasOnGround && this.onGround) { this.stretchY = 0.6; this.stretchX = 1.4; }

        // Pose-dependent property synchronization (Sync anchor with current frame pose)
        if (this.isSlashing) {
            this.headOffsetY = this.slashTimer > 12 ? 15 : 5;
            this.headOffsetX = this.slashTimer > 12 ? this.facing * 5 : this.facing * 10;
        } else if (this.slashRecovery > 0) {
            this.headOffsetY = 8;
            this.headOffsetX = this.facing * 5;
        } else if (Math.abs(this.vx) > 0.1 && this.onGround) {
            this.headOffsetY = 18 + Math.abs(Math.sin(this.animTimer * 2.0)) * 4;
            this.headOffsetX = this.facing * 15; // Naruto Run Lead
        } else {
            this.headOffsetY = 0;
            this.headOffsetX = 0;
        }

        this.updateRibbon(); // End of frame sync
    }

    updateRibbon() {
        // Sync anchor to head center minus back-offset
        const cxX = this.x + this.width / 2 + this.headOffsetX;
        const headY = this.y + 15 + this.headOffsetY;

        // Ribbon anchor (At the back-center of the headband Knot)
        this.ribbonSegments[0].x = cxX - (this.facing * 9);
        this.ribbonSegments[0].y = headY - 4;

        for (let i = 1; i < this.ribbonSegments.length; i++) {
            const seg = this.ribbonSegments[i];
            const prev = this.ribbonSegments[i - 1];

            // 1. Position Integration (Move before constraints to eliminate trailing)
            seg.x += seg.vx;
            seg.y += seg.vy;

            // 2. Physics (Wind & Drag)
            seg.vy += 0.3; // Gravity
            seg.vx -= this.vx * 0.15; // Wind lag relative to player movement

            // 3. Constraints
            const dx = prev.x - seg.x;
            const dy = prev.y - seg.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const targetDist = 4;

            if (dist > targetDist) {
                const angle = Math.atan2(dy, dx);
                seg.x = prev.x - Math.cos(angle) * targetDist;
                seg.y = prev.y - Math.sin(angle) * targetDist;
            }

            // 4. Damping
            seg.vx *= 0.7;
            seg.vy *= 0.7;
        }
    }
    draw(ctx) {
        // After-images
        this.dashAfterImages.forEach(img => {
            ctx.save();
            ctx.globalAlpha = img.life * 0.4;
            const colors = ['#00f2ff', '#4ecca3', '#e94560'];
            [-4, 0, 4].forEach((off, i) => {
                ctx.fillStyle = colors[i];
                ctx.fillRect(img.x + off, img.y, this.width, this.height);
            });
            ctx.restore();
        });

        if (this.isDashAttacking) {
            // Dash VFX
            ctx.save();
            ctx.shadowBlur = 40; ctx.shadowColor = '#00f2ff';
            ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8;
            ctx.fillRect(this.x - 10, this.y - 10, this.width + 20, this.height + 20);
            ctx.restore();

            for (let i = 0; i < 5; i++) {
                ctx.save();
                ctx.strokeStyle = i % 2 === 0 ? '#fff' : '#00f2ff';
                ctx.lineWidth = 1 + Math.random() * 3;
                ctx.shadowBlur = 15; ctx.shadowColor = '#00f2ff';
                ctx.beginPath();
                let lx = this.x + this.width / 2;
                let ly = this.y + this.height / 2;
                ctx.moveTo(lx, ly);
                let targetX = lx + (this.facing * 150 * Math.random());
                let targetY = ly + (Math.random() - 0.5) * 100;
                for (let j = 1; j <= 6; j++) {
                    lx += (targetX - lx) / (6 - j + 1) + (Math.random() - 0.5) * 50;
                    ly += (targetY - ly) / (6 - j + 1) + (Math.random() - 0.5) * 50;
                    ctx.lineTo(lx, ly);
                }
                ctx.stroke();
                ctx.restore();
            }
        }

        ctx.save();
        const color = '#fff';
        const glowColor = this.isBlocking ? '#4ecca3' : '#00f2ff';

        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowColor;

        if (this.invincibility > 0) {
            ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.02) * 0.2;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#fff';
        }

        // --- DYNAMIC POSES (Uses pre-calculated offsets from update) ---
        let spineEndYAdd = 20;
        let lArmTargetX, lArmTargetY, rArmTargetX, rArmTargetY;
        let lLegTargetX, lLegTargetY, rLegTargetX, rLegTargetY;

        if (this.isSlashing) {
            if (this.slashTimer > 12) {
                spineEndYAdd = 15;
                lArmTargetX = this.facing * 5; lArmTargetY = 40;
                rArmTargetX = this.facing * -10; rArmTargetY = 35;
                lLegTargetX = this.facing * 25; lLegTargetY = 50;
                rLegTargetX = this.facing * -20; rLegTargetY = 50;
            } else {
                lArmTargetX = this.facing * 45; lArmTargetY = 25;
                rArmTargetX = this.facing * -15; rArmTargetY = 30;
                lLegTargetX = this.facing * 30; lLegTargetY = 50;
                rLegTargetX = this.facing * -10; rLegTargetY = 50;
            }
        } else if (this.slashRecovery > 0) {
            lArmTargetX = this.facing * 10; lArmTargetY = 38;
            rArmTargetX = this.facing * -5; rArmTargetY = 35;
            lLegTargetX = this.facing * 15; lLegTargetY = 50;
            rLegTargetX = this.facing * -15; rLegTargetY = 50;
        } else if (this.isBlocking) {
            lArmTargetX = this.facing * 25; lArmTargetY = 15;
            rArmTargetX = this.facing * 25; rArmTargetY = 35;
            lLegTargetX = -10; lLegTargetY = 50;
            rLegTargetX = 10; rLegTargetY = 50;
        } else if (!this.onGround) {
            const tuck = Math.max(0, this.vy * 0.5);
            lArmTargetX = -15; lArmTargetY = 10;
            rArmTargetX = 15; rArmTargetY = 10;
            lLegTargetX = -12; lLegTargetY = 50 - tuck;
            rLegTargetX = 12; rLegTargetY = 40 - tuck;
        } else if (Math.abs(this.vx) > 0.1) {
            // RUNNING (IMAGE-BASED ASYMMETRIC SPRINT)
            const cycle = this.animTimer * 2.0;
            spineEndYAdd = 12;
            lArmTargetX = this.facing * -45; lArmTargetY = 15;
            rArmTargetX = this.facing * -40; rArmTargetY = 18;

            // Asymmetric Leg Cycle (FLIPACLIP STYLE)
            const strideX = 30;
            const phaseL = cycle;
            const phaseR = cycle + Math.PI;

            // X positions (FACING AWARE)
            lLegTargetX = this.facing * Math.cos(phaseL) * strideX;
            rLegTargetX = this.facing * Math.cos(phaseR) * strideX;

            // Y positions: Flattened recovery to remove "cocked up" feel
            const forwardL = Math.cos(phaseL);
            lLegTargetY = 48 + (forwardL < 0 ? -4 : 6);

            const forwardR = Math.cos(phaseR);
            rLegTargetY = 48 + (forwardR < 0 ? -4 : 6);
        } else {
            const breathe = Math.sin(Date.now() * 0.003) * 2;
            lArmTargetX = -12; lArmTargetY = 35 + breathe;
            rArmTargetX = 12; rArmTargetY = 35 + breathe;
            lLegTargetX = -8; lLegTargetY = 50;
            rLegTargetX = 8; rLegTargetY = 50;
        }

        const headX = this.x + this.width / 2 + this.headOffsetX;
        const headY = this.y + 15 + this.headOffsetY;
        const spineStartY = headY + 10;
        const spineEndY = spineStartY + spineEndYAdd;

        // Hip stays strictly centered or very close to it (legs "inside" the torso)
        const hipX = this.x + this.width / 2 + (this.headOffsetX * 0.1);
        // Head
        ctx.save();
        ctx.translate(headX, headY);
        if (this.landSquash > 0) {
            const squash = 1 + Math.sin(this.landSquash * 0.2) * 0.2;
            ctx.scale(squash, 1 / squash);
        }
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();

        // Eyes
        const isBlinking = this.blinkTimer < 0;
        ctx.fillStyle = this.isSlashing || this.isDashAttacking ? '#ff4d4d' : '#000';
        const eyeBaseX = this.facing * 4;
        const eyeH = isBlinking ? 1 : 3;
        const eyeNarrow = this.eyesNarrowed > 0 ? (this.eyesNarrowed / 20) * 2 : 0;
        ctx.fillRect(eyeBaseX - 1, -2 + eyeNarrow, 4, eyeH - eyeNarrow);
        ctx.fillRect(eyeBaseX + 3, -1 + eyeNarrow, 2, Math.max(1, eyeH - 1 - eyeNarrow));
        ctx.restore();

        // Helpers
        const drawCurvedLimb = (startX, startY, endX, endY, bendAmount, flipBend = false) => {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            const midX = (startX + endX) / 2 + (flipBend ? -bendAmount : bendAmount);
            const midY = (startY + endY) / 2 - Math.abs(bendAmount);
            ctx.quadraticCurveTo(midX, midY, endX, endY);
            ctx.stroke();
        };

        // Spinal Curve (Leaning)
        ctx.beginPath();
        ctx.moveTo(headX, spineStartY);
        ctx.quadraticCurveTo((headX + hipX) / 2 - this.vx * 2, (spineStartY + spineEndY) / 2, hipX, spineEndY);
        ctx.stroke();

        // Arms
        const armBend = Math.abs(this.vx) * 2;
        drawCurvedLimb(headX, spineStartY, headX + lArmTargetX, spineStartY + (lArmTargetY - 25), armBend);
        drawCurvedLimb(headX, spineStartY, headX + rArmTargetX, spineStartY + (rArmTargetY - 25), armBend, true);

        // --- LEGS (DIRECT GEOMETRY - No IK Flip) ---
        const drawLeg = (tx, tyRel, isLeft) => {
            const footX = hipX + tx;
            const groundLimitY = this.y + this.height + 2;

            // Animated foot Y
            let footY = spineEndY + (tyRel - 50) + (this.y + this.height - spineEndY);
            if (footY > groundLimitY) footY = groundLimitY;

            // Knee is ALWAYS placed downward from the midpoint between hip and foot.
            const kneePullDown = 16;
            const midX = (hipX + footX) / 2 + this.facing * 4;
            let midY = (spineEndY + footY) / 2 + kneePullDown;
            if (midY > groundLimitY - 2) midY = groundLimitY - 2; // Never clip floor

            // Only draw thigh (hip → knee), no shin
            ctx.beginPath();
            ctx.moveTo(hipX, spineEndY);
            ctx.lineTo(midX, midY);
            ctx.stroke();


        };
        drawLeg(lLegTargetX, lLegTargetY, true);
        drawLeg(rLegTargetX, rLegTargetY, false);

        // Katana Sheath/Blade Logic
        if (this.isSlashing && this.slashTimer <= 12) {
            ctx.save();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 20; ctx.shadowColor = '#00f2ff';
            ctx.beginPath();
            ctx.moveTo(headX + lArmTargetX, spineStartY + (lArmTargetY - 25));
            ctx.lineTo(headX + lArmTargetX + (this.facing * 55), spineStartY + (lArmTargetY - 25));
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.save();
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 3;
            ctx.beginPath();
            const sheathAngle = this.isSlashing ? 0.3 : -0.8;
            ctx.translate(hipX - (this.facing * 5), spineStartY + 10);
            ctx.rotate(this.facing * sheathAngle);
            ctx.moveTo(0, 0); ctx.lineTo(0, -35);
            ctx.stroke();
            ctx.restore();
        }

        // --- FLOWING HEADBAND ---
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineJoin = 'round';
        ctx.moveTo(this.ribbonSegments[0].x, this.ribbonSegments[0].y);
        for (let i = 1; i < this.ribbonSegments.length; i++) {
            ctx.lineWidth = Math.max(1, 4 * (1 - i / this.ribbonSegments.length));
            ctx.lineTo(this.ribbonSegments[i].x, this.ribbonSegments[i].y);
        }
        ctx.stroke();
        ctx.restore();

        // --- COUNTER SHOCKWAVE ---
        if (this.isCountering) {
            ctx.save();
            ctx.translate(headX, headY + 20);
            ctx.beginPath();
            ctx.arc(0, 0, this.counterShockwaveRadius, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 8;
            ctx.shadowBlur = 40; ctx.shadowColor = '#00f2ff';
            ctx.globalAlpha = Math.max(0, this.counterTimer / 25);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, this.counterShockwaveRadius * 0.8, 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore(); // Final base restore

        // Defense Shield
        if (this.isBlocking) {
            ctx.save();
            ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
            ctx.beginPath();
            ctx.arc(0, 0, 50, 0, Math.PI * 2);
            ctx.strokeStyle = '#4ecca3'; ctx.setLineDash([5, 5]);
            ctx.lineDashOffset = -this.blockTimer * 2;
            ctx.stroke();
            ctx.globalAlpha = 0.1 + (Math.sin(this.blockTimer * 0.2) * 0.1);
            ctx.fillStyle = '#4ecca3'; ctx.fill();
            ctx.restore();
        }

        // Slash Visuals
        if (this.isSlashing || this.slashRecovery > 20) {
            const startup = 6; const active = 12;
            const phase = 18 - this.slashTimer;
            if (!(this.isSlashing && phase < startup)) {
                ctx.save();
                const progress = this.isSlashing ? (phase - startup) / active : 1 + (30 - this.slashRecovery) / 30;
                ctx.shadowBlur = 35; ctx.shadowColor = '#00f2ff';
                const startX = this.facing === 1 ? this.x + this.width : this.x;
                const endX = this.facing === 1 ? this.x + this.width + 100 : this.x - 100;
                ctx.beginPath(); ctx.moveTo(startX, this.y + 30); ctx.lineTo(endX, this.y + 30);
                const grd = ctx.createLinearGradient(startX, 0, endX, 0);
                grd.addColorStop(0, 'rgba(0, 242, 255, 0)'); grd.addColorStop(0.1, 'rgba(255, 255, 255, 1)');
                grd.addColorStop(0.9, 'rgba(255, 255, 255, 1)'); grd.addColorStop(1, 'rgba(0, 242, 255, 0)');
                ctx.strokeStyle = grd; ctx.lineWidth = Math.max(0.1, 5 * (1 - progress * 0.8));
                ctx.stroke();
                ctx.globalAlpha = Math.max(0, 0.4 * (1 - progress * 0.9));
                ctx.lineWidth = 12; ctx.stroke();
                ctx.restore();
            }
        }
    }
}
class Level {
    constructor() {
        this.platforms = [
            // Base Ground
            { x: 0, y: WORLD_HEIGHT - 60, w: WORLD_WIDTH, h: 60, type: 'ground' },

            // Left Staircase Complex
            ...this.createStairs(100, WORLD_HEIGHT - 120, 5, 120, 100, 'stone'),
            { x: 100, y: WORLD_HEIGHT - 650, w: 300, h: 20, type: 'stone' },

            // Middle Bridge and Gaps
            { x: 600, y: WORLD_HEIGHT - 250, w: 300, h: 25, type: 'glow' },
            ...this.createStairs(950, WORLD_HEIGHT - 350, 4, 150, -80, 'glow'),

            // The Great Arch with Internal Steps
            { x: 1100, y: WORLD_HEIGHT - 200, w: 500, h: 30, type: 'stone' },
            { x: 1150, y: WORLD_HEIGHT - 350, w: 150, h: 20, type: 'stone' },
            { x: 1400, y: WORLD_HEIGHT - 500, w: 150, h: 20, type: 'stone' },
            { x: 1250, y: WORLD_HEIGHT - 650, w: 200, h: 20, type: 'stone' },

            // Right Side Ascent
            ...this.createStairs(1600, WORLD_HEIGHT - 150, 6, 80, 100, 'crystal'),
            { x: 1600, y: WORLD_HEIGHT - 800, w: 400, h: 25, type: 'crystal' }
        ];
    }

    createStairs(startX, startY, count, stepW, stepH, type) {
        let stairs = [];
        for (let i = 0; i < count; i++) {
            stairs.push({
                x: startX + (i * stepW * 0.8),
                y: startY - (i * Math.abs(stepH)),
                w: stepW,
                h: 20,
                type: type
            });
        }
        return stairs;
    }

    draw(ctx) {
        const grd = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
        grd.addColorStop(0, "#0f0c29"); grd.addColorStop(1, "#302b63");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        this.platforms.forEach(p => {
            let baseColor = "#1a1a2e";
            let topColor = "#4ecca3";
            if (p.type === 'stone') {
                baseColor = "#36454F"; // Darker grey for stone
                topColor = "#708090"; // Lighter grey for stone top
            } else if (p.type === 'glow') {
                baseColor = "#2c3e50"; // Dark blue-grey
                topColor = "#3498db"; // Bright blue for glow
            } else if (p.type === 'crystal') {
                baseColor = "#4a235a"; // Dark purple
                topColor = "#a93226"; // Reddish for crystal
            }

            ctx.fillStyle = baseColor;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = topColor;
            ctx.fillRect(p.x, p.y, p.w, 3);
        });

        ctx.strokeStyle = "rgba(78, 204, 163, 0.8)";
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }

    checkCollision(entity) {
        entity.onGround = false;
        this.platforms.forEach(p => {
            // If fallThroughTimer is active, skip all platforms EXCEPT 'ground' type
            if (entity.fallThroughTimer > 0 && p.type !== 'ground') return;

            if (entity.vy >= 0 && entity.x + entity.width > p.x && entity.x < p.x + p.w &&
                entity.y + entity.height <= p.y + p.h && entity.y + entity.height + entity.vy >= p.y) {
                entity.y = p.y - entity.height;
                entity.vy = 0;
                entity.onGround = true;
            }
        });
    }
}

class Monster {
    constructor(x, y) {
        this.x = x; this.y = y; this.width = 40; this.height = 40;
        this.vx = 0; this.vy = 0; this.gravity = 0.6;
        this.onGround = false;
        this.kx = 0;
        this.ky = 0; // Knockback forces
        this.hp = 2; this.isDead = false; this.hitFlash = 0;
        this.isTelegraphing = false; this.isAttacking = false;
        this.telegraphTimer = 0; this.slashTimer = 0; this.facing = 1;
        this.attackCooldown = 0;
        this.jumpTimer = 0;
        this.fallThroughTimer = 0;
        this.skillCooldown = 120; // Time between skill uses
        this.isSkilling = false;
        this.skillTimer = 0;
        this.kx = 0; this.ky = 0; // Knockback

        // Visual Varieties
        const styles = [
            { name: 'STRIKER', color: '#ff4d4d', accent: '#fff', glow: '#f00', knockback: 18 },
            { name: 'VOID_STALKER', color: '#7a28cb', accent: '#00d2ff', glow: '#7a28cb', knockback: 12 },
            { name: 'GLOW_SENTINEL', color: '#00d2ff', accent: '#33ff88', glow: '#00d2ff', knockback: 8 },
            { name: 'EMBER_ARCHON', color: '#ff8c00', accent: '#ffff00', glow: '#ff4500', knockback: 15 }
        ];
        this.style = styles[Math.floor(Math.random() * styles.length)];
    }

    update(player, level) {
        if (this.isDead) return;

        // Always track player position
        this.facing = player.x > this.x ? 1 : -1;

        const dist = Math.abs(player.x - this.x);

        // Skill Trigger logic: Shadow Dash
        if (!this.isSkilling && !this.isAttacking && !this.isTelegraphing &&
            this.skillCooldown <= 0 && dist > 150 && dist < 450) {
            this.isSkilling = true;
            this.skillTimer = 30;
            this.skillCooldown = 180;
            this.vx = this.facing * 14; // High speed dash
        }

        if (this.isSkilling) {
            this.skillTimer--;
            if (this.skillTimer <= 0) {
                this.isSkilling = false;
                this.vx = 0;
            }
        }

        // Chase logic: Active if not in attack range or skilling
        if (!this.isSkilling && dist > 55 && !this.isAttacking && !this.isTelegraphing) {
            this.vx = this.facing * 4.2;

            // Navigation AI: Jump up or Jump down
            if (this.onGround && this.jumpTimer <= 0) {
                const heightDiff = this.y - player.y;

                // Jump UP logic
                const shouldJumpUp = (heightDiff > 60 && dist < 250) ||
                    (this.x < 100 && this.facing === -1) ||
                    (this.x > WORLD_WIDTH - 100 && this.facing === 1) ||
                    (Math.random() < 0.01);

                if (shouldJumpUp) {
                    this.vy = -12;
                    this.onGround = false;
                    this.jumpTimer = 40;
                }

                // Jump DOWN logic: If player is below
                if (heightDiff < -100 && Math.random() < 0.03) {
                    this.fallThroughTimer = 30; // Ignore floor for 30 frames
                    this.onGround = false;
                    this.jumpTimer = 40;
                }
            }
        } else if (!this.isAttacking && !this.isTelegraphing) {
            this.vx = 0;
        }

        if (this.fallThroughTimer > 0) this.fallThroughTimer--;

        if (this.jumpTimer > 0) this.jumpTimer--;

        // Telegraph & Attack
        if (dist <= 90 && this.attackCooldown <= 0 && !this.isAttacking && !this.isTelegraphing) {
            this.isTelegraphing = true;
            this.telegraphTimer = 18; // Warning period (0.3s) - Matches Player slash startup/lock
            this.vx = 0;
        }

        if (this.isTelegraphing) {
            if (--this.telegraphTimer <= 0) {
                this.isTelegraphing = false;
                this.isAttacking = true;
                this.slashTimer = 12; // Active strike
                this.attackCooldown = 30; // Recovery lag (0.5s) - Matches Player slashRecovery
            }
        }

        if (this.isAttacking) {
            if (--this.slashTimer <= 0) this.isAttacking = false;
        }

        // Physics
        this.vy += this.gravity;
        this.x += this.vx + this.kx;
        this.y += this.vy + this.ky;

        // Knockback Decay
        this.kx *= 0.85;
        this.ky *= 0.85;
        if (Math.abs(this.kx) < 0.1) this.kx = 0;
        if (Math.abs(this.ky) < 0.1) this.ky = 0;

        level.checkCollision(this);

        // Bounds
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.skillCooldown > 0) this.skillCooldown--;

        // Hit by player (Only during active phase or Dash Attack)
        if ((player.isSlashing && player.slashTimer < 12) || player.isDashAttacking) {
            const isDA = player.isDashAttacking;
            const slashRange = isDA ? 180 : 100; // Much larger path detection during dash attack
            const sX = player.facing === 1 ? player.x + player.width : player.x - slashRange;

            if (sX < this.x + this.width && sX + slashRange > this.x && player.y < this.y + this.height && player.y + 100 > this.y) {
                if (this.hitFlash === 0) {
                    this.hp -= isDA ? 15 : 1;
                    this.hitFlash = 15;
                    this.kx = player.facing * (isDA ? 40 : 12); // PREDATORY KNOCKBACK (Reduceed for S+J balance)
                    this.ky = isDA ? -8 : -4;
                    if (isDA) screenShake = 10; // Shake on every hit

                    if (this.hp <= 0) {
                        this.isDead = true;
                        updateScore(isDA ? 250 : 100); // Bonus score
                    }
                }
            }
        }

        // Hit by projectile (U Skill)
        projectiles.forEach(p => {
            if (!p.isDead && p.x < this.x + this.width && p.x + p.width > this.x && p.y < this.y + this.height && p.y + p.height > this.y) {
                if (this.hitFlash === 0) {
                    this.hp -= 3; // U Skill damage
                    this.hitFlash = 15;
                    this.kx = (p.vx > 0 ? 1 : -1) * 20;
                    this.ky = -8;
                    p.isDead = true; // Consume projectile
                    screenShake = 5;
                    if (this.hp <= 0) {
                        this.isDead = true;
                        updateScore(200);
                    }
                }
            }
        });

        // Hit by Counter Shockwave
        if (player.isCountering) {
            const dx = (this.x + this.width / 2) - (player.x + player.width / 2);
            const dy = (this.y + this.height / 2) - (player.y + player.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < player.counterShockwaveRadius) {
                if (this.hitFlash === 0) {
                    this.hp -= 3; // Shockwave damage
                    this.hitFlash = 15;
                    this.kx = (dx > 0 ? 1 : -1) * 35; // Massive knockback
                    this.ky = -15;
                    if (this.hp <= 0) {
                        this.isDead = true;
                        updateScore(200);
                    }
                }
            }
        }

        if (this.hitFlash > 0) this.hitFlash--;
        // Attack player (Standard or Skill Dash)
        if ((this.isAttacking && this.slashTimer > 10) || (this.isSkilling)) {
            const hitW = this.isSkilling ? this.width + 40 : 70; // Monster attack range reduced (was 120)
            const msX = this.facing === 1 ? this.x + this.width : this.x - hitW;
            if (player.x < msX + hitW && player.x + player.width > msX && player.y < this.y + this.height && player.y + player.height > this.y) {
                player.takeDamage(this.isSkilling ? 15 : 10, this.x + this.width / 2, this.style.knockback);
            }
        }
    }

    draw(ctx) {
        if (this.isDead) return;
        ctx.save();

        // Warning Progress Bar
        if (this.isTelegraphing) {
            const barW = 60;
            const barH = 8;
            const barX = this.x + this.width / 2 - barW / 2;
            const barY = this.y - 25;
            const progress = 1 - (this.telegraphTimer / 18); // Fills up

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(barX, barY, barW, barH);
            ctx.fillStyle = '#ff3e3e';
            ctx.fillRect(barX + 2, barY + 2, (barW - 4) * progress, barH - 4);

            // Subtle Glow
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ff0000';
            ctx.strokeRect(barX, barY, barW, barH);
        }
        ctx.shadowBlur = this.isSkilling || this.isTelegraphing ? 20 : 10;
        ctx.shadowColor = this.style.glow;

        if (this.isTelegraphing) ctx.fillStyle = Math.floor(Date.now() / 100) % 2 === 0 ? '#fff' : this.style.color;
        else if (this.isAttacking) ctx.fillStyle = '#fff';
        else ctx.fillStyle = this.hitFlash > 0 ? '#fff' : this.style.color;

        if (this.isSkilling) {
            // Shadow Ghost Effect
            ctx.globalAlpha = 0.3;
            ctx.fillRect(this.x - this.vx * 3, this.y, this.width, this.height);
            ctx.fillRect(this.x - this.vx * 1.5, this.y, this.width, this.height);
            ctx.globalAlpha = 1.0;
        }

        // Body
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Style specific decorations
        ctx.fillStyle = this.style.accent;
        if (this.style.name === 'STRIKER') {
            // Horns
            ctx.beginPath();
            ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - 10, this.y - 15); ctx.lineTo(this.x + 10, this.y);
            ctx.moveTo(this.x + this.width, this.y); ctx.lineTo(this.x + this.width + 10, this.y - 15); ctx.lineTo(this.x + this.width - 10, this.y);
            ctx.fill();
        } else if (this.style.name === 'VOID_STALKER') {
            // Floating halo
            ctx.strokeStyle = this.style.accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x - 5, this.y - 10, this.width + 10, 5);
        } else if (this.style.name === 'GLOW_SENTINEL') {
            // Glowing core
            ctx.fillStyle = '#fff';
            ctx.fillRect(this.x + 15, this.y + 15, 10, 10);
        } else if (this.style.name === 'EMBER_ARCHON') {
            // Spikes
            ctx.beginPath();
            ctx.moveTo(this.x + 10, this.y); ctx.lineTo(this.x + 20, this.y - 15); ctx.lineTo(this.x + 30, this.y);
            ctx.fill();
        }

        // Eyes
        ctx.fillStyle = '#000';
        const eyeX = this.facing === 1 ? this.x + 25 : this.x + 5;
        ctx.fillRect(eyeX, this.y + 10, 6, 6);
        ctx.fillRect(eyeX + 10, this.y + 10, 6, 6);

        if (this.isAttacking && this.slashTimer > 10) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            const sX = this.facing === 1 ? this.x + this.width : this.x - 40;
            ctx.fillRect(sX, this.y, 40, this.height);
        }
        ctx.restore();
    }
}

class Boss extends Monster {
    constructor(x, y) {
        super(x, y);
        this.width = 120;
        this.height = 120;
        this.hp = 67;
        this.maxHp = 67;
        this.gravity = 0.5;
        this.state = 'CHASE';
        this.dashTimer = 0;
        this.jumpCooldown = 0;
        this.fallThroughTimer = 0;
        this.kx = 0;
        this.ky = 0;
    }
    update(player, level) {
        if (this.isDead) return;
        this.facing = player.x > this.x ? 1 : -1;
        const dist = Math.abs(player.x - this.x);
        const heightDiff = this.y - player.y;

        if (this.state === 'CHASE') {
            this.vx = this.facing * 3.5; // Reduced from 5.5

            // Smarter Navigation AI
            if (this.onGround && this.jumpCooldown <= 0) {
                // Jump UP logic
                if (heightDiff > 80 && dist < 300) {
                    this.vy = -15;
                    this.onGround = false;
                    this.jumpCooldown = 40;
                }
                // Jump DOWN logic (Fall through platforms)
                else if (heightDiff < -120 && Math.random() < 0.05) {
                    this.fallThroughTimer = 30;
                    this.onGround = false;
                    this.jumpCooldown = 40;
                }
            }

            if (dist < 350 && Math.random() < 0.015 && this.onGround) {
                this.state = 'DASH';
                this.dashTimer = 35;
                this.vx = this.facing * 10; // Reduced from 14
            }

            if (dist < 120 && this.attackCooldown <= 0) {
                this.isTelegraphing = true;
                this.telegraphTimer = 20;
                this.vx = 0;
            }
        } else if (this.state === 'DASH') {
            this.dashTimer--;
            if (this.dashTimer <= 0) this.state = 'CHASE';
        }

        if (this.jumpCooldown > 0) this.jumpCooldown--;
        if (this.fallThroughTimer > 0) this.fallThroughTimer--;

        if (this.isTelegraphing) {
            if (--this.telegraphTimer <= 0) {
                this.isTelegraphing = false;
                this.isAttacking = true;
                this.slashTimer = 30; // Faster animation (was 40)
                this.attackCooldown = 60; // Shorter cooldown (was 100)
            }
        }
        if (this.isAttacking) {
            if (--this.slashTimer <= 0) this.isAttacking = false;
        }

        this.vy += this.gravity;
        this.x += this.vx + this.kx;
        this.y += this.vy + this.ky;

        // Decay knockback
        this.kx *= 0.92;
        this.ky *= 0.92;
        if (Math.abs(this.kx) < 0.1) this.kx = 0;
        if (Math.abs(this.ky) < 0.1) this.ky = 0;

        level.checkCollision(this);

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;
        if (this.attackCooldown > 0) this.attackCooldown--;

        // Player hits boss (Only during active phase or Dash Attack)
        if ((player.isSlashing && player.slashTimer < 12) || player.isDashAttacking) {
            const isDA = player.isDashAttacking;
            const slashRange = isDA ? 200 : 100;
            const sX = player.facing === 1 ? player.x + player.width : player.x - slashRange;
            if (sX < this.x + this.width && sX + slashRange > this.x && player.y < this.y + this.height && player.y + 120 > this.y) {
                if (this.hitFlash === 0) {
                    this.hp -= isDA ? 10 : 1;
                    this.hitFlash = 10;
                    this.kx = player.facing * (isDA ? 20 : 8); // Scaled knockback for Boss (Reduced for S+J balance)
                    this.ky = isDA ? -4 : -2;

                    const bossBar = document.getElementById('bossHealth');
                    if (bossBar) bossBar.style.width = (this.hp / this.maxHp * 100) + '%';
                    if (this.hp <= 0) {
                        this.isDead = true;
                        updateScore(5000);
                        alert("CONGRATULATIONS! BOSS DEFEATED!");
                        resetGame();
                    }
                }
            }
        }

        // Hit by projectile (U Skill)
        projectiles.forEach(p => {
            if (!p.isDead && p.x < this.x + this.width && p.x + p.width > this.x && p.y < this.y + this.height && p.y + p.height > this.y) {
                if (this.hitFlash === 0) {
                    this.hp -= 2; // Boss is more resistant
                    this.hitFlash = 10;
                    this.kx = (p.vx > 0 ? 1 : -1) * 10;
                    this.ky = -4;
                    p.isDead = true;
                    screenShake = 8;

                    const bossBar = document.getElementById('bossHealth');
                    if (bossBar) bossBar.style.width = (this.hp / this.maxHp * 100) + '%';

                    if (this.hp <= 0) {
                        this.isDead = true;
                        updateScore(5000);
                        alert("CONGRATULATIONS! BOSS DEFEATED!");
                        resetGame();
                    }
                }
            }
        });

        // Hit by Counter Shockwave
        if (player.isCountering) {
            const dx = (this.x + this.width / 2) - (player.x + player.width / 2);
            const dy = (this.y + this.height / 2) - (player.y + player.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < player.counterShockwaveRadius) {
                if (this.hitFlash === 0) {
                    this.hp -= 3; // Shockwave damage
                    this.hitFlash = 20;
                    this.kx = (dx > 0 ? 1 : -1) * 20; // Massive knockback for Boss
                    this.ky = -10;

                    const bossBar = document.getElementById('bossHealth');
                    if (bossBar) bossBar.style.width = (this.hp / this.maxHp * 100) + '%';

                    if (this.hp <= 0) {
                        this.isDead = true;
                        updateScore(5000);
                        alert("CONGRATULATIONS! BOSS DEFEATED!");
                        resetGame();
                    }
                }
            }
        }

        if (this.hitFlash > 0) this.hitFlash--;

        // Boss hits player
        if ((this.isAttacking || this.state === 'DASH') && player.invincibility <= 0) {
            const hitX = this.state === 'DASH' ? this.x : (this.facing === 1 ? this.x + this.width : this.x - 60);
            const hitW = this.state === 'DASH' ? this.width : 60;
            if (player.x < hitX + hitW && player.x + player.width > hitX && player.y < this.y + this.height && player.y + player.height > this.y) {
                player.takeDamage(20, this.x + this.width / 2, 25); // Heavy Boss knockback
            }
        }
    }

    draw(ctx) {
        if (this.isDead) return;
        ctx.save();
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#f00';
        ctx.fillStyle = this.hitFlash > 0 ? '#fff' : '#4a0000';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Eyes
        ctx.fillStyle = '#f00';
        const eyeX = this.facing === 1 ? this.x + 80 : this.x + 10;
        ctx.fillRect(eyeX, this.y + 30, 15, 10);
        ctx.fillRect(eyeX + 25, this.y + 30, 15, 10);

        if (this.isAttacking) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
            const sX = this.facing === 1 ? this.x + this.width : this.x - 80;
            ctx.fillRect(sX, this.y - 40, 80, 200);
        }

        // Boss Warning Progress Bar
        if (this.isTelegraphing) {
            const barW = 120;
            const barH = 12;
            const barX = this.x + this.width / 2 - barW / 2;
            const barY = this.y - 40;
            const progress = 1 - (this.telegraphTimer / 20);

            ctx.save();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.strokeRect(barX, barY, barW, barH);
            ctx.fillStyle = '#ff3e3e';
            ctx.fillRect(barX + 2, barY + 2, (barW - 4) * progress, barH - 4);
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#f00';
            ctx.strokeRect(barX, barY, barW, barH);
            ctx.restore();
        }
        ctx.restore();
    }
}

function drawUI() {
    // UI logic here or redundant if handled by HTML
}

const input = new InputHandler();
const player = new Player();
const level = new Level();
const monsters = [];
const projectiles = [];
function spawnMonsters() {
    if (isGameOver) return;

    if (gameScore >= 2000 && !bossActive) {
    bossActive = true;
    monsters.length = 0; // 物理清空数组，释放内存
    boss = new Boss(WORLD_WIDTH / 2, 100); // 确保坐标在屏幕上方
    const bossUI = document.getElementById('boss-ui');
    if (bossUI) bossUI.classList.remove('hidden');
    return;
}

    if (bossActive) return;

    // Clean up dead monsters from the array periodically or when they've been dead for a while
    // For simplicity, let's just filter them out if the array gets too large
    if (monsters.length > 20) {
        for (let i = monsters.length - 1; i >= 0; i--) {
            if (monsters[i].isDead) monsters.splice(i, 1);
        }
    }

    const aliveCount = monsters.filter(m => !m.isDead).length;
    if (aliveCount < 1) { // Only one elite monster at a time
        let spawnX;
        let attempts = 0;
        do {
            spawnX = Math.random() * (WORLD_WIDTH - 200) + 100;
            attempts++;
        } while (Math.abs(spawnX - player.x) < 400 && attempts < 10);

        const m = new Monster(spawnX, -100);
        m.hp = 5; // Elite monster has more HP
        monsters.push(m);
    }
}

function animate() {
    if (isGameOver) return;
    spawnMonsters();

    // visible area = (WORLD_WIDTH * WORLD_HEIGHT) / 4
    // Linear scale factor = sqrt(4) = 2
    const baseScale = Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT);
    const scale = baseScale * 2;

    // Target camera position (centering on player)
    const targetCamX = (player.x + player.width / 2) - (canvas.width / scale) / 2;
    const targetCamY = (player.y + player.height / 2) - (canvas.height / scale) / 2;

    // Smooth follow (Lerp)
    cameraX += (targetCamX - cameraX) * 0.1;
    cameraY += (targetCamY - cameraY) * 0.1;

    // Clamp to world bounds
    cameraX = Math.max(0, Math.min(cameraX, WORLD_WIDTH - canvas.width / scale));
    cameraY = Math.max(0, Math.min(cameraY, WORLD_HEIGHT - canvas.height / scale));

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // Screen Shake Offset
    let sx = 0, sy = 0;
    if (screenShake > 0) {
        sx = (Math.random() - 0.5) * screenShake * 2;
        sy = (Math.random() - 0.5) * screenShake * 2;
        screenShake *= 0.9;
        if (screenShake < 0.5) screenShake = 0;
    }

    // Apply Camera Transform
    ctx.translate(sx, sy); // Screen space shake
    ctx.scale(scale, scale);
    ctx.translate(-cameraX, -cameraY);

    level.draw(ctx);

    // Update and Draw Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.update();
        p.draw(ctx);
        if (p.isDead) projectiles.splice(i, 1);
    }

    if (bossActive && boss) {
        boss.update(player, level);
        boss.draw(ctx);
    } else if (!bossActive) { // 只有在非 Boss 战时才处理小怪
        monsters.forEach(m => { m.update(player, level); m.draw(ctx); });
    }


    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.isDead) particles.splice(i, 1);
    }

    player.update(input, level);
    player.draw(ctx);

    ctx.restore();
    requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
