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
const bossHazards = [];

class Projectile {
    constructor(x, y, facing) {
        this.x = x;
        this.y = y;
        this.vx = facing * 14;
        this.facing = facing;
        this.width = 64;   // 2x bigger
        this.height = 64;  // 2x bigger
        this.radius = 36;  // 2x bigger
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
        this.slashMax = 1;
        this.facing = 1;
        this.isPlunging = false;
        this.plungeWaveTimer = 0;
        this.stretchX = 1;
        this.stretchY = 1;

        // U Skill Multi-shot
        this.aerialUCount = 0;
        this.aerialUTimer = 0;

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
        this.comboStep = 0;
        this.comboResetTimer = 0;
        this.jKeyWasDown = false;
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

        // Fire Lance Skill (S + U)
        this.fireLancePhase = 0;   // 0=off, 1=dash, 2=launch, 3=aerial-combo, 4=thrust, 5=impact
        this.fireLanceTimer = 0;
        this.fireLanceTarget = null;
        this.fireLanceCooldown = 0;

        // Double Jump
        this.hasDoubleJumped = false;
        this.isDoubleJumping = false;
        this.doubleJumpRotation = 0;
        this.jumpKeyWasDown = false;
        this.fallThroughTimer = 0;

        // Enhancement Buffs (W + J, W + U)
        this.flameBuffTimer = 0;
        this.flameBuffCooldown = 0;
        this.lightningBuffTimer = 0;
        this.lightningBuffCooldown = 0;
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

    updateSkillUI() {
        // Dash Cooldown (based on recharge timer)
        const dashItem = document.getElementById('skill-dash');
        if (dashItem) {
            const overlay = dashItem.querySelector('.skill-cd-overlay');
            if (this.dashCharges < this.maxDashCharges) {
                const percent = (this.dashRechargeTimer / this.rechargeRate) * 100;
                overlay.style.height = (100 - percent) + '%';
                dashItem.classList.remove('ready');
            } else {
                overlay.style.height = '0%';
                dashItem.classList.add('ready');
            }
        }

        // Magic Skill (U) Cooldown
        const uItem = document.getElementById('skill-u');
        if (uItem) {
            const overlay = uItem.querySelector('.skill-cd-overlay');
            const maxUCD = 100; // Normal U skill cooldown
            if (this.uSkillCooldown > 0) {
                const percent = (this.uSkillCooldown / (this.aerialUCount > 0 ? 120 : 100)) * 100;
                overlay.style.height = percent + '%';
                uItem.classList.remove('ready');
            } else {
                overlay.style.height = '0%';
                uItem.classList.add('ready');
            }
        }

        // Fire Lance (S+U) Cooldown
        const fireItem = document.getElementById('skill-firelance');
        if (fireItem) {
            const overlay = fireItem.querySelector('.skill-cd-overlay');
            const maxFLCD = 200; // Original cooldown value
            if (this.fireLanceCooldown > 0) {
                const percent = (this.fireLanceCooldown / 200) * 100;
                overlay.style.height = percent + '%';
                fireItem.classList.remove('ready');
            } else {
                overlay.style.height = '0%';
                fireItem.classList.add('ready');
            }
        }

        // Block (S) Cooldown
        const sItem = document.getElementById('skill-s');
        if (sItem) {
            const overlay = sItem.querySelector('.skill-cd-overlay');
            if (this.blockRecovery > 0) {
                const percent = (this.blockRecovery / 20) * 100; // 20 is the max recovery from counter
                overlay.style.height = percent + '%';
                sItem.classList.remove('ready');
            } else {
                overlay.style.height = '0%';
                sItem.classList.add('ready');
            }
        }

        // Flame Buff (W+J) Cooldown & Active state
        const flameItem = document.getElementById('skill-flame');
        if (flameItem) {
            const overlay = flameItem.querySelector('.skill-cd-overlay');
            const glow = flameItem.querySelector('.skill-active-glow');
            if (this.flameBuffTimer > 0) {
                const percent = (this.flameBuffTimer / 180) * 100;
                overlay.style.height = percent + '%';
                overlay.style.background = 'rgba(255, 255, 255, 0.7)'; // White for Duration
                flameItem.classList.remove('ready');
            } else if (this.flameBuffCooldown > 0) {
                const percent = (this.flameBuffCooldown / 600) * 100;
                overlay.style.height = percent + '%';
                overlay.style.background = 'rgba(255, 69, 0, 0.5)'; // Orange for CD
                flameItem.classList.remove('ready');
            } else {
                overlay.style.height = '0%';
                flameItem.classList.add('ready');
            }
            glow.style.opacity = this.flameBuffTimer > 0 ? '1' : '0';
        }

        // Lightning Buff (W+U) Cooldown & Active state
        const lightItem = document.getElementById('skill-lightning');
        if (lightItem) {
            const overlay = lightItem.querySelector('.skill-cd-overlay');
            const glow = lightItem.querySelector('.skill-active-glow');
            if (this.lightningBuffTimer > 0) {
                const percent = (this.lightningBuffTimer / 180) * 100;
                overlay.style.height = percent + '%';
                overlay.style.background = 'rgba(255, 255, 255, 0.7)'; // White for Duration
                lightItem.classList.remove('ready');
            } else if (this.lightningBuffCooldown > 0) {
                const percent = (this.lightningBuffCooldown / 600) * 100;
                overlay.style.height = percent + '%';
                overlay.style.background = 'rgba(164, 94, 229, 0.5)'; // Purple for CD
                lightItem.classList.remove('ready');
            } else {
                overlay.style.height = '0%';
                lightItem.classList.add('ready');
            }
            glow.style.opacity = this.lightningBuffTimer > 0 ? '1' : '0';
        }
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

        if (this.comboResetTimer > 0) {
            this.comboResetTimer--;
            if (this.comboResetTimer === 0 && !this.isSlashing) {
                this.comboStep = 0;
            }
        }

        let jPressed = input.keys['j'] && !this.jKeyWasDown;
        this.jKeyWasDown = input.keys['j'];

        // Iaido Combo Slash Logic
        let canSlash = !this.isSlashing && !this.isBlocking && this.blockRecovery <= 0 && !this.isDashAttacking && !this.isPlunging;

        // Aerial Plunge Attack - ALWAYS available in air, separate from ground slashRecovery condition
        if (jPressed && canSlash && !this.onGround) {
            this.isPlunging = true;
            this.isSlashing = false;
            this.comboStep = 0;
            this.slashRecovery = 0;
            this.plungeSafetyTimer = 90;
            screenShake = 5;
        }
        // Ground combo only
        else if (jPressed && canSlash && this.onGround && (this.slashRecovery <= 0 || this.comboStep > 0)) {
            this.isSlashing = true;
            this.slashRecovery = 0;

            this.comboStep++;
            if (this.comboStep > 4) {
                this.comboStep = 1;
            }

            if (this.comboStep === 1) { this.slashTimer = 14; this.slashMax = 14; }
            else if (this.comboStep === 2) { this.slashTimer = 12; this.slashMax = 12; }
            else if (this.comboStep === 3) { this.slashTimer = 12; this.slashMax = 12; }
            else if (this.comboStep === 4) { this.slashTimer = 20; this.slashMax = 20; }

            this.comboResetTimer = 45;
        }

        // Plunge attack state
        if (this.isPlunging) {
            // Lower speed so character doesn't fly off-screen or skip through thin platforms
            this.vx = this.facing * 9;
            this.vy = 10; // Low enough to not skip through platforms
            // Particles for the lightning trail
            if (Math.random() < 0.7) {
                particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2,
                    -this.facing * 5, -5, '#d200ff', 10 + Math.random() * 20, 3));
                particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2,
                    -this.facing * 8, -8, '#fff', 5 + Math.random() * 10, 2));
            }
            // Safety timeout: cancel if stuck plunging for too long
            if (this.plungeSafetyTimer !== undefined) this.plungeSafetyTimer--;
            if (this.plungeSafetyTimer <= 0) this.isPlunging = false;
            // Terminate: landing is checked AFTER physics this frame (see below)
        }

        if (this.plungeWaveTimer > 0) {
            this.plungeWaveTimer--;
        }

        if (this.slashTimer > 0) {
            this.slashTimer--;

            if (this.comboStep === 1) this.vx = this.facing * 3.5;
            else if (this.comboStep === 2) this.vx = this.facing * 4.2;
            else if (this.comboStep === 3) this.vx = this.facing * 4.5;
            else if (this.comboStep === 4 && this.slashTimer > 8) this.vx = this.facing * 6.0;
            else this.vx *= 0.8;

            if (this.slashTimer === 0) {
                this.isSlashing = false;
                if (this.comboStep === 1) this.slashRecovery = 15;
                else if (this.comboStep === 2) this.slashRecovery = 15;
                else if (this.comboStep === 3) this.slashRecovery = 15;
                else if (this.comboStep === 4) {
                    this.slashRecovery = 30;
                    this.comboStep = 0;
                }
            }
        }

        if (this.slashRecovery > 0) {
            this.slashRecovery--;
            this.vx *= 0.8;
        }

        // Knockback Physics
        this.x += this.kx;
        this.y += this.ky;
        this.kx *= 0.85;
        this.ky *= 0.85;
        if (Math.abs(this.kx) < 0.5) this.kx = 0;
        if (Math.abs(this.ky) < 0.5) this.ky = 0;

        // Horizontal Movement - locked during plunge or dash-like states
        if (!this.isPlunging && Math.abs(this.kx) < 2 && !this.isDashing && !this.isBlocking && !this.isSlashing && this.slashRecovery <= 0 && !this.isDashAttacking && this.fireLancePhase === 0) {
            if (input.keys['a']) { this.vx = -this.speed; this.facing = -1; }
            else if (input.keys['d']) { this.vx = this.speed; this.facing = 1; }
            else this.vx = 0;
        } else if (!this.isPlunging && !this.isDashing && !this.isDashAttacking && this.fireLancePhase === 0) {
            this.vx = 0;
        }

        // Jumping
        if (this.onGround) this.coyoteTimer = 10;
        else if (this.coyoteTimer > 0) this.coyoteTimer--;

        // Footstep/Jump effects
        if (!this.lastOnGround && this.onGround) {
            // Landed
            this.landSquash = 15;
            this.hasDoubleJumped = false;
            this.isDoubleJumping = false;
            this.doubleJumpRotation = 0;
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

        if (this.isDoubleJumping) {
            this.doubleJumpRotation += 0.4;
            if (this.doubleJumpRotation >= Math.PI * 2) {
                this.doubleJumpRotation = 0;
                this.isDoubleJumping = false;
            }
        }

        this.lastOnGround = this.onGround;
        if (this.landSquash > 0) this.landSquash--;

        const jumpKeyDown = input.keys['k'] || input.keys[' '];
        if (jumpKeyDown && !this.jumpKeyWasDown) this.jumpBufferCounter = 10;
        else if (this.jumpBufferCounter > 0) this.jumpBufferCounter--;
        this.jumpKeyWasDown = jumpKeyDown;

        if (this.jumpBufferCounter > 0 && !this.isSlashing && this.slashRecovery <= 0 && !this.isPlunging) {
            if (this.onGround && input.keys['s']) {
                this.fallThroughTimer = 30; // Fall through platforms for 0.5s
                this.onGround = false;
                this.jumpBufferCounter = 0;
            } else if (this.coyoteTimer > 0) {
                // Normal Jump
                this.vy = -this.jumpForce;
                this.onGround = false;
                this.coyoteTimer = 0;
                this.jumpBufferCounter = 0;
                this.stretchY = 1.3;
                this.stretchX = 0.7;
                this.hasDoubleJumped = false;
            } else if (!this.hasDoubleJumped && this.fireLancePhase === 0) {
                // Double Jump (Rolling Jump)
                this.vy = -this.jumpForce * 0.9; // Slightly weaker or same
                this.hasDoubleJumped = true;
                this.isDoubleJumping = true;
                this.doubleJumpRotation = 0;
                this.jumpBufferCounter = 0;

                // Roll effect particles
                for (let i = 0; i < 10; i++) {
                    particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, '#fff', 15, 2));
                }
                screenShake = 5;
            }
        }

        if (this.fireLancePhase === 0 || this.fireLancePhase === 2 || this.fireLancePhase === 4) {
            this.vy += this.gravity;
        } else {
            this.vy = 0; // Ignore gravity for Cinematic/Return phases
        }

        if (this.vy > 20) this.vy = 20;
        this.x += this.vx;
        this.y += this.vy;

        if (this.fireLancePhase !== 6 && this.fireLancePhase !== 1 && this.fireLancePhase !== 3) {
            level.checkCollision(this);
        }

        // Check for plunge landing AFTER physics & collision so onGround is accurate
        if (this.isPlunging && this.onGround) {
            this.isPlunging = false;
            this.plungeWaveTimer = 20;
            this.slashRecovery = 25;
            this.vx = 0;
            screenShake = 15;
        }

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;
        if (this.y > WORLD_HEIGHT + 100) {
            // Cancel plunge before damage reset - prevents infinite fall loop
            this.isPlunging = false;
            this.plungeWaveTimer = 0;
            this.slashRecovery = 0;
            this.takeDamage(20, this.x);
            this.x = 100; this.y = 100; this.vy = 0; this.vx = 0;
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

        // ====== FIRE LANCE SKILL (S + U) ======
        const currentUDown = input.keys['u'];
        const _uJustPressed = currentUDown && !this.uKeyWasDown;
        this.uKeyWasDown = currentUDown;
        const _targetPool = [...monsters, ...(boss && !boss.isDead ? [boss] : [])];

        if (this.isBlocking && _uJustPressed && this.fireLancePhase === 0 && this.fireLanceCooldown <= 0) {
            this.fireLancePhase = 1;
            this.fireLanceTimer = 20;         // Reduced dash distance
            this.fireLanceTarget = null;
            this.isBlocking = false;
            this.invincibility = 999;
            this.vx = this.facing * 28;       // Reduced speed
            this.vy = 0;
            screenShake = 15;
        }
        if (this.fireLanceCooldown > 0) this.fireLanceCooldown--;

        if (this.fireLancePhase > 0) {
            // Constant Fire VFX during the whole skill
            if (this.fireLancePhase !== 6) { // Except during return
                for (let i = 0; i < 3; i++) { // More particles for intensity
                    const cols = ['#ff4500', '#ff8c00', '#ffd700', '#fff'];
                    particles.push(new Particle(
                        this.x + Math.random() * this.width,
                        this.y + Math.random() * this.height,
                        (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6,
                        cols[Math.floor(Math.random() * cols.length)], 20, 4
                    ));
                }
            }

            if (this.fireLancePhase === 1) {
                // PHASE 1: Flaming Dash
                this.vx = this.facing * 28;
                this.vy = 0;
                this.fireLanceTimer--;

                // Intense fire trail
                particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2,
                    -this.facing * 12, (Math.random() - 0.5) * 5, '#ff4500', 35, 6));

                // Hit detection - only ahead of player
                _targetPool.forEach(e => {
                    if (!e || e.isDead || e.hitFlash > 0) return;
                    // Tighter detection: must be ahead and relatively close to the front
                    const dx = (e.x + e.width / 2) - (this.x + this.width / 2);
                    if (this.facing * dx > 0 && Math.abs(dx) < 80 && Math.abs(e.y - this.y) < 80) {
                        e.hp -= 1; // Balanced damage
                        e.hitFlash = 12;
                        if (!this.fireLanceTarget) {
                            this.fireLanceTarget = e;
                            this.fireLanceTimer = 2; // Hit! Snap to next phase
                        }
                    }
                });

                if (this.fireLanceTimer <= 0) {
                    if (this.fireLanceTarget) {
                        this.fireLancePhase = 2; // Launch
                        this.fireLanceTimer = 22;
                        this.vy = -20;
                        screenShake = 15;
                    } else {
                        this.fireLancePhase = 0; // End skill on miss
                        this.fireLanceCooldown = 60;
                        this.invincibility = 15;
                    }
                }
            } else if (this.fireLancePhase === 2) {
                // PHASE 2: Launch Rise
                this.fireLanceTimer--;
                this.vy = -18;
                if (this.fireLanceTarget) {
                    this.fireLanceTarget.x = this.x + this.facing * 50 - this.fireLanceTarget.width / 2;
                    this.fireLanceTarget.y = this.y - 30;
                    this.fireLanceTarget.vy = this.vy;
                    this.fireLanceTarget.hitFlash = 5;
                }
                if (this.fireLanceTimer <= 0) {
                    this.fireLancePhase = 3; // Aerial Combo
                    this.fireLanceTimer = 18;
                    this.vy = 0;
                }
            } else if (this.fireLancePhase === 3) {
                // PHASE 3: Aerial Fire Combo
                this.fireLanceTimer--;
                this.vy = -0.5; // Hovering
                if (this.fireLanceTarget) {
                    this.fireLanceTarget.x = this.x + this.facing * 55 - this.fireLanceTarget.width / 2;
                    this.fireLanceTarget.y = this.y - 10;
                    this.fireLanceTarget.vy = 0;
                    if (this.fireLanceTimer % 3 === 0) {
                        this.fireLanceTarget.hp -= 1; // Balanced combo damage
                        this.fireLanceTarget.hitFlash = 8;
                        screenShake = 8;
                        // Fire impact sparks
                        for (let i = 0; i < 4; i++) {
                            particles.push(new Particle(this.fireLanceTarget.x + 20, this.fireLanceTarget.y + 20,
                                (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, '#ffcc00', 12, 3));
                        }
                    }
                }
                if (this.fireLanceTimer <= 0) {
                    this.fireLancePhase = 4; // Thrust Down
                    this.fireLanceTimer = 30;
                    this.vy = 28;
                }
            } else if (this.fireLancePhase === 4) {
                // PHASE 4: Downward Fire Thrust
                this.fireLanceTimer--;
                this.vy = 28;
                if (this.fireLanceTarget) {
                    this.fireLanceTarget.x = this.x + this.facing * 40 - this.fireLanceTarget.width / 2;
                    this.fireLanceTarget.y = this.y + 15;
                    this.fireLanceTarget.vy = this.vy;
                    // Fire drilling particles
                    particles.push(new Particle(this.fireLanceTarget.x + 20, this.fireLanceTarget.y + 20,
                        (Math.random() - 0.5) * 10, -5, '#ff4500', 15, 3));
                }
                if (this.onGround || this.fireLanceTimer <= 0) {
                    this.fireLancePhase = 5; // Final Impact
                    this.fireLanceTimer = 20;
                    this.vx = 0; this.vy = 0;
                    screenShake = 30;
                    // Balanced explosion damage
                    if (this.fireLanceTarget) {
                        this.fireLanceTarget.hp -= 8;
                        this.fireLanceTarget.kx = this.facing * 55; // Strong kickback
                        this.fireLanceTarget.ky = -15;
                        this.fireLanceTarget.hitFlash = 40;
                        for (let i = 0; i < 40; i++) {
                            const angle = Math.random() * Math.PI * 2;
                            const spd = 5 + Math.random() * 10;
                            particles.push(new Particle(this.x + this.width / 2, this.y + this.height,
                                Math.cos(angle) * spd, Math.sin(angle) * spd, '#ff2200', 40, 6));
                        }
                    }
                }
            } else if (this.fireLancePhase === 5) {
                // PHASE 5: Freeze on Ground
                this.vx = 0; this.vy = 0;
                this.fireLanceTimer--;
                if (this.fireLanceTimer <= 0) {
                    this.fireLancePhase = 0;
                    this.fireLanceCooldown = 150;
                    this.invincibility = 30;
                }
            }
        }

        this.dashAfterImages.forEach(img => img.life -= 0.05);
        this.dashAfterImages = this.dashAfterImages.filter(img => img.life > 0);

        // Remote Lightning / Fireballs (U)
        if (input.keys['u'] && this.uSkillCooldown <= 0 && !this.isDashAttacking && !this.isSlashing && !this.isDashing && !this.isPlunging) {
            if (this.onGround) {
                projectiles.push(new Projectile(this.x + (this.facing === 1 ? this.width : -40), this.y + 30, this.facing));
                this.uSkillCooldown = 100;
            } else if (this.aerialUCount === 0) {
                // Initiate Aerial Multi-shot
                this.aerialUCount = 3;
                this.aerialUTimer = 0;
                this.uSkillCooldown = 120; // Longer cooldown for barrage
            }
        }

        // Aerial U Skill Sequence Logic - shoot 3 fireballs spread 30°/45°/60°
        if (this.aerialUCount > 0) {
            if (this.aerialUTimer <= 0) {
                const shotIndex = 3 - this.aerialUCount; // 0, 1, 2
                const angleDeg = shotIndex * 45; // 0°, 45°, 90°
                const angleRad = (angleDeg * Math.PI) / 180;
                const speed = 14;

                // Create a normal Projectile - reset radius to original size for aerial shots
                let p = new Projectile(this.x + this.width / 2, this.y + this.height / 2, this.facing);
                p.radius = 18; // Keep aerial fireballs original size
                p.width = 32;
                p.height = 32;
                p.vx = this.facing * Math.cos(angleRad) * speed;
                p.vy = Math.sin(angleRad) * speed;
                p.maxDistance = 500;
                p.distance = 0;

                // Override update to move in custom direction and spawn rotated particles
                p.update = function () {
                    this.x += this.vx;
                    this.y += this.vy;
                    this.frame++;
                    this.distance += Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    if (this.distance > this.maxDistance || this.y > 2000) this.isDead = true;

                    // Same fire trail as normal projectile, offset behind travel direction
                    const backAngle = Math.atan2(-this.vy, -this.vx);
                    for (let i = 0; i < 3; i++) {
                        const colors = ['#ff4500', '#ff8c00', '#ffd700', '#ff6347'];
                        const c = colors[Math.floor(Math.random() * colors.length)];
                        particles.push(new Particle(
                            this.x + Math.cos(backAngle) * 6,
                            this.y + Math.sin(backAngle) * 6,
                            Math.cos(backAngle) * 1.5 + (Math.random() - 0.5),
                            Math.sin(backAngle) * 1.5 + (Math.random() - 0.5),
                            c, 15 + Math.random() * 10, 4 + Math.random() * 4
                        ));
                    }
                };

                // Use the exact same draw as Projectile, but rotated toward velocity
                p.draw = function (ctx) {
                    ctx.save();
                    const angle = Math.atan2(this.vy, this.vx);
                    ctx.translate(this.x, this.y);
                    ctx.rotate(angle - Math.PI / 2); // Rotate so it faces travel direction
                    ctx.translate(-this.x, -this.y);

                    const cx = this.x + this.radius;
                    const cy = this.y;
                    const flicker = Math.sin(this.frame * 0.8) * 3;

                    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, this.radius + 10 + flicker);
                    grad.addColorStop(0, 'rgba(255, 255, 200, 1)');
                    grad.addColorStop(0.2, 'rgba(255, 160, 0, 0.9)');
                    grad.addColorStop(0.5, 'rgba(255, 60, 0, 0.6)');
                    grad.addColorStop(1, 'rgba(255, 40, 0, 0)');
                    ctx.shadowBlur = 40; ctx.shadowColor = '#ff4500';
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(cx, cy, this.radius + 10 + flicker, 0, Math.PI * 2);
                    ctx.fill();

                    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius * 0.6);
                    coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
                    coreGrad.addColorStop(0.4, 'rgba(255,220,80,1)');
                    coreGrad.addColorStop(1, 'rgba(255,100,0,0.8)');
                    ctx.fillStyle = coreGrad;
                    ctx.shadowBlur = 20; ctx.shadowColor = '#fff';
                    ctx.beginPath();
                    ctx.arc(cx, cy, this.radius * 0.6, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.restore();
                };

                projectiles.push(p);
                this.vx = -this.facing * 5;
                this.vy = -5;
                this.aerialUCount--;
                this.aerialUTimer = 12;
            } else {
                this.aerialUTimer--;
            }
        }


        if (this.fallThroughTimer > 0) this.fallThroughTimer--;

        // Enhancement Skills (W + J, W + U)
        if (this.flameBuffTimer > 0) {
            this.flameBuffTimer--;
            // Particles on weapon
            if (Math.random() < 0.4) {
                particles.push(new Particle(this.x + this.width / 2 + (this.facing * 40 * Math.random()), this.y + 10 + Math.random() * 60, (Math.random() - 0.5) * 2, -3, '#ff4500', 15, 4));
            }
        }
        if (this.flameBuffCooldown > 0) this.flameBuffCooldown--;

        if (this.lightningBuffTimer > 0) {
            this.lightningBuffTimer--;
            // Electric particles
            if (Math.random() < 0.4) {
                particles.push(new Particle(this.x + this.width / 2 + (this.facing * 40 * Math.random()), this.y + 10 + Math.random() * 60, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, '#d200ff', 10, 2));
            }
        }
        if (this.lightningBuffCooldown > 0) this.lightningBuffCooldown--;

        const wKey = input.keys['w'];
        if (wKey) {
            if (input.keys['j'] && this.flameBuffCooldown <= 0) {
                this.flameBuffTimer = 3 * 60;
                this.flameBuffCooldown = 13 * 60; // 3s duration + 10s cooldown
                screenShake = 5;
                // Burst effects
                for (let i = 0; i < 15; i++) {
                    particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, '#ff4500', 25, 6));
                }
            }
            if (input.keys['u'] && this.lightningBuffCooldown <= 0) {
                this.lightningBuffTimer = 3 * 60;
                this.lightningBuffCooldown = 13 * 60; // 3s duration + 10s cooldown
                screenShake = 5;
                // Burst effects
                for (let i = 0; i < 15; i++) {
                    particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, '#d200ff', 20, 3));
                }
            }
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

        // Draw Purple Electric Aura when Plunging (use this.x/y since headX declared later)
        if (this.isPlunging) {
            const auraCX = this.x + this.width / 2;
            const auraCY = this.y + this.height / 2;
            const auraW = this.width * 1.8;
            const auraH = this.height * 1.6;
            ctx.save();
            // Jagged electric polygon
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                let aAng = (i / 10) * Math.PI * 2 + (Math.random() * 0.4);
                let jaggle = 1 + Math.random() * 0.3;
                let ax = auraCX + Math.cos(aAng) * (auraW / 2) * jaggle;
                let ay = auraCY + Math.sin(aAng) * (auraH / 2) * jaggle;
                if (i === 0) ctx.moveTo(ax, ay);
                else ctx.lineTo(ax, ay);
            }
            ctx.closePath();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#d200ff';
            ctx.shadowColor = '#e2afff';
            ctx.shadowBlur = 20;
            ctx.stroke();
            // Inner glow fill
            ctx.beginPath();
            ctx.ellipse(auraCX, auraCY, auraW / 2, auraH / 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(210, 0, 255, 0.15)';
            ctx.fill();
            ctx.restore();
        }

        // --- DYNAMIC POSES (Uses pre-calculated offsets from update) ---
        let spineEndYAdd = 20;
        let lArmTargetX, lArmTargetY, rArmTargetX, rArmTargetY;
        let lLegTargetX, lLegTargetY, rLegTargetX, rLegTargetY;

        if (this.fireLancePhase === 1) {
            // PHASE 1: Super Dash Pose - Super low profile, sword pointed forward
            lArmTargetX = this.facing * -20; lArmTargetY = 40; // Trailing back
            rArmTargetX = this.facing * 50; rArmTargetY = 40; // Sword leading
            lLegTargetX = this.facing * -30; lLegTargetY = 55;
            rLegTargetX = this.facing * 30; rLegTargetY = 55;
            spineEndYAdd = 25; // Massive lean
        } else if (this.fireLancePhase === 2) {
            // PHASE 2: Launch / Rise Pose - Upper cut style
            lArmTargetX = this.facing * -5; lArmTargetY = 30;
            rArmTargetX = this.facing * 10; rArmTargetY = -20; // Hand high
            lLegTargetX = this.facing * -5; lLegTargetY = 60;
            rLegTargetX = this.facing * 10; rLegTargetY = 40;
            spineEndYAdd = -5; // Arching back slightly
        } else if (this.fireLancePhase === 3) {
            // PHASE 3: Aerial Combo Pose - Horizontal slash
            lArmTargetX = this.facing * -10; lArmTargetY = 20;
            rArmTargetX = this.facing * 45; rArmTargetY = 25;
            lLegTargetX = this.facing * -20; lLegTargetY = 55;
            rLegTargetX = this.facing * 5; rLegTargetY = 55;
            spineEndYAdd = 10;
        } else if (this.fireLancePhase === 4) {
            // PHASE 4: Downward Thrust Pose - Pointed straight down
            lArmTargetX = this.facing * -15; lArmTargetY = 30;
            rArmTargetX = this.facing * 10; rArmTargetY = 60;
            lLegTargetX = this.facing * -10; lLegTargetY = 35;
            rLegTargetX = this.facing * 10; rLegTargetY = 55;
            spineEndYAdd = 15;
        } else if (this.isPlunging) {
            // Dive bomb pose (sword pointed straight down-forward 45deg)
            lArmTargetX = this.facing * -5; lArmTargetY = 35; // One hand on sheath
            rArmTargetX = this.facing * 25; rArmTargetY = 35; // Holding sword down
            lLegTargetX = this.facing * -10; lLegTargetY = 40; // Knee tucked up
            rLegTargetX = this.facing * 20; rLegTargetY = 60; // Leg straight down pointing towards the strike
            spineEndYAdd = 25; // Lean forward heavily
        } else if (this.plungeWaveTimer > 0) {
            // Smashed into the ground pose
            lArmTargetX = this.facing * -5; lArmTargetY = 35;
            rArmTargetX = this.facing * 35; rArmTargetY = 55; // Sword smashed into floor!
            lLegTargetX = this.facing * -25; lLegTargetY = 50; // Left leg out wide back
            rLegTargetX = this.facing * 25; rLegTargetY = 50; // Right leg wide forward
            spineEndYAdd = 35; // Extreme crouch / smash lean
        } else if (this.aerialUCount > 0 && !this.onGround) {
            // Aerial fire-breath pose: lean forward, both arms angled downward
            const fireProgress = (3 - this.aerialUCount) / 3; // 0 -> 1 over the cast
            lArmTargetX = this.facing * (15 + fireProgress * 10); lArmTargetY = 40 + fireProgress * 15;
            rArmTargetX = this.facing * (10 + fireProgress * 10); rArmTargetY = 45 + fireProgress * 15;
            lLegTargetX = this.facing * -15; lLegTargetY = 45;
            rLegTargetX = this.facing * 10; rLegTargetY = 55;
            spineEndYAdd = 28 + fireProgress * 10; // lunge forward and down
        } else if (this.isSlashing) {
            let progress = 1 - (this.slashTimer / this.slashMax);
            let pSmooth = Math.min(1, progress * 4); // Swing finishes very quickly

            // Left hand rests on the sheath during normal slashes, except step 4
            lArmTargetX = this.facing * -5; lArmTargetY = 35;

            // Right arm directs the swing (kept close to body to avoid weird stretched lines)
            if (this.comboStep === 1) { // High Left -> Low Right
                rArmTargetX = this.facing * (5 + pSmooth * 15);
                rArmTargetY = 15 + pSmooth * 20;
                spineEndYAdd = 15 + pSmooth * 10;
            } else if (this.comboStep === 2) { // High Right -> Low Left
                rArmTargetX = this.facing * (20 - pSmooth * 15);
                rArmTargetY = 15 + pSmooth * 15;
            } else if (this.comboStep === 3) { // Horizontal Left -> Right
                rArmTargetX = this.facing * (-5 + pSmooth * 20);
                rArmTargetY = 25;
                spineEndYAdd = 20 - pSmooth * 5;
            } else if (this.comboStep === 4) { // Huge Top-Left -> Bottom-Right
                lArmTargetX = this.facing * (5 + pSmooth * 15); // Two-handed
                lArmTargetY = 20 + pSmooth * 15;
                rArmTargetX = this.facing * (10 + pSmooth * 20);
                rArmTargetY = 20 + pSmooth * 15;
                spineEndYAdd = 15 + pSmooth * 20; // Deep lean
            }

            // Dynamic lunging step alternating legs
            let lungeDist = pSmooth * 25;
            if (this.comboStep === 1 || this.comboStep === 3) {
                // Step forward with the leading (right) leg
                lLegTargetX = this.facing * (-10); lLegTargetY = 50;
                rLegTargetX = this.facing * (10 + lungeDist); rLegTargetY = 50;
                spineEndYAdd += 5; // Lean slightly more
            } else {
                // Step forward with the trailing (left) leg
                lLegTargetX = this.facing * (10 + lungeDist); lLegTargetY = 50;
                rLegTargetX = this.facing * (-10); rLegTargetY = 50;
            }
        } else if (this.slashRecovery > 0) {
            // Noto (sheathing) or Chiburi stance
            lArmTargetX = this.facing * -8; lArmTargetY = 35; // left hand on sheath
            rArmTargetX = this.facing * 15; rArmTargetY = 35; // right hand pulling back
            lLegTargetX = this.facing * 20; lLegTargetY = 50;
            rLegTargetX = this.facing * -20; rLegTargetY = 50;
        } else if (this.isBlocking) {
            lArmTargetX = this.facing * 25; lArmTargetY = 15;
            rArmTargetX = this.facing * 25; rArmTargetY = 35;
            lLegTargetX = -10; lLegTargetY = 50;
            rLegTargetX = 10; rLegTargetY = 50;
        } else if (this.isDoubleJumping) {
            // Tucked pose for rolling
            lArmTargetX = this.facing * -5; lArmTargetY = 20;
            rArmTargetX = this.facing * 5; rArmTargetY = 20;
            lLegTargetX = -5; lLegTargetY = 30;
            rLegTargetX = 5; rLegTargetY = 30;
            spineEndYAdd = 10;
        } else if (!this.onGround) {
            const tuck = Math.max(0, this.vy * 0.5);
            lArmTargetX = this.facing * -5; lArmTargetY = 25;
            rArmTargetX = this.facing * 15; rArmTargetY = 10;
            lLegTargetX = -12; lLegTargetY = 50 - tuck;
            rLegTargetX = 12; rLegTargetY = 40 - tuck;
        } else if (Math.abs(this.vx) > 0.1) {
            // RUNNING (IMAGE-BASED ASYMMETRIC SPRINT)
            const cycle = this.animTimer * 2.0;
            spineEndYAdd = 12;
            lArmTargetX = this.facing * -5; lArmTargetY = 35; // Hand always on sheath!
            rArmTargetX = this.facing * -40; rArmTargetY = 18; // Right arm trails behind, ninja style

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
            lArmTargetX = this.facing * -5; lArmTargetY = 35 + breathe; // hand on sheath
            rArmTargetX = this.facing * 5; rArmTargetY = 35 + breathe;  // relaxed
            lLegTargetX = -8; lLegTargetY = 50;
            rLegTargetX = 8; rLegTargetY = 50;
        }

        const headX = this.x + this.width / 2 + this.headOffsetX;
        const headY = this.y + 15 + this.headOffsetY;

        // --- START ROTATION FOR DOUBLE JUMP (GLOBAL) ---
        ctx.save();
        if (this.isDoubleJumping) {
            ctx.translate(headX, headY + 20); // Rotate around center of body/hip
            ctx.rotate(this.facing * this.doubleJumpRotation);
            ctx.translate(-(headX), -(headY + 20));
        }

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

        // Fire Breath VFX - sprays from head during aerial U cast
        if (this.aerialUCount > 0 && !this.onGround) {
            const mouthX = headX + this.facing * 8;
            const mouthY = headY + 5;
            const shotIndex = 3 - this.aerialUCount; // 0,1,2
            const angleDeg = shotIndex * 45;
            const angleRad = (angleDeg * Math.PI) / 180;
            const coneLen = 55 + shotIndex * 15;

            const endX = mouthX + this.facing * Math.cos(angleRad) * coneLen;
            const endY = mouthY + Math.sin(angleRad) * coneLen;

            ctx.save();
            // Outer fire cone (wide, transparent)
            const grad = ctx.createLinearGradient(mouthX, mouthY, endX, endY);
            grad.addColorStop(0, 'rgba(255, 220, 50, 0.9)');
            grad.addColorStop(0.3, 'rgba(255, 120, 0, 0.7)');
            grad.addColorStop(1, 'rgba(255, 30, 0, 0)');
            ctx.beginPath();
            ctx.moveTo(mouthX, mouthY);
            // Fan shape (wide cone)
            const spread = 18 + shotIndex * 8;
            const perpX = -Math.sin(angleRad) * this.facing;
            const perpY = Math.cos(angleRad);
            ctx.lineTo(endX + perpX * spread, endY + perpY * spread);
            ctx.lineTo(endX - perpX * spread, endY - perpY * spread);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.shadowColor = '#ff6600';
            ctx.shadowBlur = 20;
            ctx.fill();
            // Bright inner core line
            ctx.beginPath();
            ctx.moveTo(mouthX, mouthY);
            ctx.lineTo(endX, endY);
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(255, 255, 180, 0.9)';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 10;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.restore();
        }


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

        // Always draw the sheath on hip
        ctx.save();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const sheathAngle = -0.4;
        ctx.translate(hipX - (this.facing * 8), spineStartY + 8);
        ctx.rotate(this.facing * sheathAngle);
        ctx.moveTo(0, 0); ctx.lineTo(0, 45); // Sheath points down
        ctx.stroke();

        // Draw sword hilt inside sheath if not attacking/recovering
        if (!this.isSlashing && this.slashRecovery <= 0 && !this.isDashAttacking && !this.isPlunging && this.fireLancePhase === 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#a45ee5'; // Purple hilt
            ctx.lineWidth = 3;
            ctx.moveTo(0, 0); ctx.lineTo(0, -15); // Handle sticking out
            ctx.stroke();
        }
        ctx.restore();

        // Katana Sheath/Blade Logic
        if (this.fireLancePhase > 0) {
            // FIRE LANCE ACTIVE - full flame sword
            ctx.save();
            const handX = headX + rArmTargetX;
            const handY = spineStartY + (rArmTargetY - 25);
            // Determine tip direction based on phase
            let ftipX, ftipY;
            if (this.fireLancePhase === 1) {
                ftipX = handX + this.facing * 60;
                ftipY = handY + 10;
            } else if (this.fireLancePhase === 2) {
                ftipX = handX + this.facing * 30;
                ftipY = handY - 60; // Upward for launch
            } else if (this.fireLancePhase === 3) {
                ftipX = handX + this.facing * 60; // Horizontal slash in air
                ftipY = handY;
            } else if (this.fireLancePhase === 4) {
                ftipX = handX + this.facing * 30;
                ftipY = handY + 60; // Downward for thrust
            } else {
                ftipX = handX + this.facing * 50;
                ftipY = handY + 20;
            }

            // Outer fire aura
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(ftipX, ftipY);
            ctx.lineWidth = 18;
            ctx.strokeStyle = `rgba(255,70,0,0.35)`;
            ctx.shadowColor = '#ff4500';
            ctx.shadowBlur = 30;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Mid flame layer
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(ftipX, ftipY);
            ctx.lineWidth = 10;
            ctx.strokeStyle = `rgba(255,160,0,0.7)`;
            ctx.shadowBlur = 15;
            ctx.stroke();

            // Bright blade core
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(ftipX, ftipY);
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#fff5b0';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 8;
            ctx.stroke();

            // Flicker highlight line
            const flicker = Math.sin(Date.now() * 0.03) * 3;
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(ftipX + flicker, ftipY + flicker);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.shadowBlur = 4;
            ctx.stroke();
            ctx.restore();

        } else if (this.isPlunging || this.plungeWaveTimer > 0) {
            // Diving sword logic
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 5;
            ctx.shadowColor = '#d200ff';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#e2afff';

            let bladeStartX = headX + rArmTargetX;
            let bladeStartY = spineStartY + (rArmTargetY - 25);
            ctx.moveTo(bladeStartX, bladeStartY);

            // Plunging straight forward/down
            let tipX = bladeStartX + (this.facing * 50);
            let tipY = bladeStartY + 50;
            if (this.plungeWaveTimer > 0) {
                // Embed sword in the ground
                tipY = this.y + this.height + 10;
                tipX = bladeStartX + (this.facing * 30);
            }
            ctx.lineTo(tipX, tipY);
            ctx.stroke();

            // Highlight
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
            ctx.moveTo(bladeStartX, bladeStartY);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            // 45-degree dive aura
            if (this.isPlunging) {
                ctx.beginPath();
                ctx.moveTo(bladeStartX - this.facing * 20, bladeStartY - 20);
                ctx.lineTo(tipX, tipY);
                ctx.lineWidth = 20;
                ctx.strokeStyle = 'rgba(210, 0, 255, 0.4)';
                ctx.shadowBlur = 30;
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(bladeStartX, bladeStartY);
                ctx.lineTo(tipX + this.facing * 15, tipY + 15);
                ctx.lineWidth = 5;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
            }

            // Draw impact wave
            if (this.plungeWaveTimer > 0) {
                let pProgress = 1 - (this.plungeWaveTimer / 20); // 0 to 1
                let shockRad = pProgress * 250; // Extremely wide 1u = ~250px total (125 radius) ... actually 1u distance total so ~250 total width, radius = 125. Let's make it bigger. 200px radius.

                ctx.beginPath();
                ctx.lineWidth = Math.max(0.5, 10 * (1 - pProgress));
                ctx.strokeStyle = 'rgba(210, 0, 255, ' + (1 - pProgress) + ')';
                ctx.shadowColor = '#d200ff';
                ctx.shadowBlur = 20;
                ctx.ellipse(this.x + this.width / 2, this.y + this.height, shockRad, 30 + pProgress * 30, 0, 0, Math.PI * 2);
                ctx.stroke();

                ctx.beginPath();
                ctx.lineWidth = Math.max(0.2, 5 * (1 - pProgress));
                ctx.strokeStyle = 'rgba(255, 255, 255, ' + (1 - pProgress) + ')';
                ctx.shadowBlur = 5;
                ctx.ellipse(this.x + this.width / 2, this.y + this.height, shockRad * 0.9, (30 + pProgress * 30) * 0.9, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.restore();

        } else if (this.isSlashing) {
            ctx.save();
            let progress = 1 - (this.slashTimer / this.slashMax); // 0 to 1
            let swingProgress = Math.min(1, progress * 4); // Finishes swing fast
            let fadeProgress = progress > 0.3 ? 1 - ((progress - 0.3) / 0.7) : 1; // Fades out slowly

            ctx.globalAlpha = fadeProgress;

            // 1. Draw Crescent Wind (Sword Arc)
            let cx = headX + (this.facing * 25);
            let cy = spineStartY + 15;
            let extraRadius = (this.flameBuffTimer > 0 ? 40 : 0);
            let radius = (this.comboStep === 4 ? 180 : 130) + extraRadius;

            let startAngle, endAngle;
            if (this.comboStep === 1) { // High Left to Low Right
                startAngle = -Math.PI * 0.7; endAngle = Math.PI * 0.2;
            } else if (this.comboStep === 2) { // High Right to Low Left
                startAngle = -Math.PI * 0.2; endAngle = Math.PI * 0.7;
            } else if (this.comboStep === 3) { // Horizontal Left to Right
                startAngle = -Math.PI * 0.8; endAngle = Math.PI * 0.1;
                cy += 15; // lower horizontal cut
            } else { // Huge Top-Left to Bottom-Right
                startAngle = -Math.PI * 0.8; endAngle = Math.PI * 0.3;
            }

            // Reverse angles based on facing
            if (this.facing === -1) {
                let tempStart = Math.PI - startAngle;
                let tempEnd = Math.PI - endAngle;
                startAngle = tempStart;
                endAngle = tempEnd;
            }

            let currentAngle = startAngle + (endAngle - startAngle) * swingProgress;
            let isCCW = this.facing === -1;

            let arcScale = this.comboStep === 4 ? 1.5 : 1;

            // Stylized Purple Energy Slash (anime/game style)
            // 1. Main glowing trail (Outer purple aura)
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, currentAngle, isCCW);
            ctx.lineWidth = (45 * (1 - swingProgress) + 5) * arcScale;
            ctx.lineCap = 'round';

            // Enhancement Colors
            let trailColor = 'rgba(0, 191, 255, 0.4)'; // Bright Blue Trail
            let coreColor = 'rgba(200, 255, 255, 0.9)'; // Bright Blue Core
            let glow = '#00e5ff'; // Bright Blue Glow
            let streakColor1 = 'rgba(200, 255, 255, 0.8)';
            let streakColor2 = 'rgba(0, 242, 255, 0.9)';
            let particleColor = '#00e5ff';
            let bladeColor = '#aff5ff';

            if (this.flameBuffTimer > 0 && this.lightningBuffTimer > 0) {
                trailColor = 'rgba(255, 100, 0, 0.5)'; glow = '#ff4500';
            } else if (this.flameBuffTimer > 0) {
                trailColor = 'rgba(255, 69, 0, 0.5)'; glow = '#ff4500';
                coreColor = 'rgba(255, 200, 100, 0.9)';
                streakColor1 = 'rgba(255, 180, 100, 0.8)';
                streakColor2 = 'rgba(255, 69, 0, 0.9)';
                particleColor = '#ff8c00';
                bladeColor = '#ff8c00';
            } else if (this.lightningBuffTimer > 0) {
                trailColor = 'rgba(180, 50, 255, 0.4)';
                coreColor = 'rgba(255, 150, 255, 0.9)';
                glow = '#d200ff';
                streakColor1 = 'rgba(255, 180, 255, 0.8)';
                streakColor2 = 'rgba(200, 50, 255, 0.9)';
                particleColor = '#e066ff';
                bladeColor = '#e2afff';
            }

            ctx.strokeStyle = trailColor;
            ctx.shadowColor = glow;
            ctx.shadowBlur = 30;
            ctx.stroke();

            // 2. Inner sharp energetic core
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, currentAngle, isCCW);
            ctx.lineWidth = (15 * (1 - swingProgress) + 1) * arcScale;
            ctx.strokeStyle = coreColor;
            ctx.shadowColor = glow;
            ctx.shadowBlur = 15;
            ctx.stroke();

            // Additional Lightning Sparkles if active
            if (this.lightningBuffTimer > 0) {
                ctx.save();
                ctx.strokeStyle = '#fff';
                ctx.shadowColor = '#d200ff';
                ctx.shadowBlur = 20;
                ctx.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    let sAng = startAngle + (currentAngle - startAngle) * Math.random();
                    let sRad = radius + (Math.random() - 0.5) * 40;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(sAng) * sRad, cy + Math.sin(sAng) * sRad);
                    ctx.lineTo(cx + Math.cos(sAng) * (sRad + 15), cy + Math.sin(sAng) * (sRad + 15));
                    ctx.stroke();
                }
                ctx.restore();
            }

            // 3. The absolute sharp center line (Pure White)
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, currentAngle, isCCW);
            ctx.lineWidth = (3 * (1 - swingProgress) + 0.5);
            ctx.strokeStyle = '#ffffff';
            ctx.shadowBlur = 0;
            ctx.stroke();

            // ... (Rest of trails and particles omitted for brevity in replacement, but I must keep them if I use replacement)
            // Wait, I should include the rest to avoid losing code.

            // 4. Dynamic streaks trailing off (Speed lines along the arc)
            let numStreaks = this.comboStep === 4 ? 6 : 3;
            for (let i = 0; i < numStreaks; i++) {
                let offAngle = (Math.random() - 0.5) * 0.4;
                let offRad = radius + (Math.random() - 0.5) * 50 * arcScale;
                let sAng = startAngle + offAngle;
                let eAng = currentAngle + offAngle;

                if (Math.abs(eAng - sAng) > 0.1) {
                    ctx.beginPath();
                    let arcLen = (eAng - sAng) * (0.3 + 0.6 * Math.random());
                    ctx.arc(cx, cy, offRad, sAng, sAng + arcLen, isCCW);
                    ctx.lineWidth = Math.random() * 2 + 0.5;
                    ctx.strokeStyle = Math.random() > 0.5 ? streakColor1 : streakColor2;
                    ctx.stroke();
                }
            }

            // 5. Energy Particles randomly along the arc
            let numParticles = this.comboStep === 4 ? 12 : 6;
            for (let i = 0; i < numParticles; i++) {
                let pAng = startAngle + (currentAngle - startAngle) * Math.random();
                let pRad = radius + (Math.random() - 0.5) * 70 * arcScale;
                let px = cx + Math.cos(pAng) * pRad;
                let py = cy + Math.sin(pAng) * pRad;

                ctx.beginPath();
                ctx.arc(px, py, Math.random() * 2.5 + 0.5, 0, Math.PI * 2);
                ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : particleColor;
                ctx.shadowBlur = 10;
                ctx.shadowColor = glow;
                ctx.fill();
            }

            // 2. Draw actual physical blade connecting arm to exactly the arc's edge
            ctx.beginPath();
            ctx.lineWidth = 5;
            ctx.shadowColor = glow;
            ctx.shadowBlur = 15;

            let bladeStartX = headX + rArmTargetX;
            let bladeStartY = spineStartY + (rArmTargetY - 25);
            ctx.moveTo(bladeStartX, bladeStartY);

            let tipX = cx + Math.cos(currentAngle) * (radius * 0.95);
            let tipY = cy + Math.sin(currentAngle) * (radius * 0.95);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = bladeColor;
            ctx.stroke();

            // Center highlight
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
            ctx.moveTo(bladeStartX, bladeStartY);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            // Lightning Arcs on weapon
            if (this.lightningBuffTimer > 0) {
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#fff';
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#d200ff';
                let midX = (bladeStartX + tipX) / 2 + (Math.random() - 0.5) * 20;
                let midY = (bladeStartY + tipY) / 2 + (Math.random() - 0.5) * 20;
                ctx.moveTo(bladeStartX, bladeStartY);
                ctx.lineTo(midX, midY);
                ctx.lineTo(tipX, tipY);
                ctx.stroke();
            }

            ctx.restore();
        } else if (this.slashRecovery > 0) {
            // Trailing blade logic during recovery (Noto/Chiburi)
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 5;
            ctx.shadowColor = '#d200ff';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#e2afff'; // Light purple metallic blade

            let bladeStartX = headX + rArmTargetX;
            let bladeStartY = spineStartY + (rArmTargetY - 25);
            ctx.moveTo(bladeStartX, bladeStartY);

            let tipX = bladeStartX - (this.facing * 40);
            let tipY = bladeStartY + 25;
            ctx.lineTo(tipX, tipY);
            ctx.stroke();

            // Center highlight
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
            ctx.moveTo(bladeStartX, bladeStartY);
            ctx.lineTo(tipX, tipY);
            ctx.strokeStyle = '#fff';
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

        ctx.restore(); // END DOUBLE JUMP ROTATION
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

        // Status Effects
        this.burnTimer = 0;
        this.burnDamageTimer = 0;
        this.stunTimer = 0;
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

        if (this.stunTimer > 0) {
            this.stunTimer--;
            this.vx = 0;
            // Electric effect
            if (Math.random() < 0.3) {
                particles.push(new Particle(this.x + Math.random() * this.width, this.y + Math.random() * this.height, 0, -2, '#d200ff', 10, 2));
            }
        } else {
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
        }

        // Burn Damage
        if (this.burnTimer > 0) {
            this.burnTimer--;
            this.burnDamageTimer++;
            if (this.burnDamageTimer >= 30) {
                this.hp -= 2; // Burn damage over time
                this.burnDamageTimer = 0;
                this.hitFlash = 5;
            }
            // Flame particles on enemy
            if (Math.random() < 0.3) {
                particles.push(new Particle(this.x + Math.random() * this.width, this.y + Math.random() * this.height, 0, -3, '#ff4500', 15, 4));
            }
        }

        if (this.fallThroughTimer > 0) this.fallThroughTimer--;

        if (this.jumpTimer > 0) this.jumpTimer--;

        // Telegraph & Attack
        if (this.stunTimer <= 0 && dist <= 50 && this.attackCooldown <= 0 && !this.isAttacking && !this.isTelegraphing) {
            this.isTelegraphing = true;
            this.telegraphTimer = 18; // Warning period (0.3s) - Matches Player slash startup/lock
            this.vx = 0;
        }

        if (this.isTelegraphing) {
            if (this.stunTimer > 0) { // Interrupt telegraph
                this.isTelegraphing = false;
            }
            if (--this.telegraphTimer <= 0) {
                this.isTelegraphing = false;
                this.isAttacking = true;
                this.slashTimer = 12; // Active strike
                this.attackCooldown = 30; // Recovery lag (0.5s) - Matches Player slashRecovery
            }
        }

        if (this.isAttacking) {
            if (this.stunTimer > 0) this.isAttacking = false;
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
        if ((player.isSlashing && player.slashTimer < 12) || player.isDashAttacking || player.plungeWaveTimer > 0) {
            const isDA = player.isDashAttacking;
            const isPW = player.plungeWaveTimer > 0;
            // Enhanced Range Check - Synchronize with Visuals
            let extraRange = (player.flameBuffTimer > 0 ? 40 : 0);
            let visualRadius = (player.comboStep === 4 ? 180 : 130) + extraRange;
            let visualScale = (player.comboStep === 4 ? 1.5 : 1.0);
            const slashRange = isDA ? 180 : (isPW ? 250 : (visualRadius * visualScale + 10)); // +10 offset for center-to-edge calculation
            let sX = player.facing === 1 ? player.x + player.width : player.x - slashRange;
            if (isPW) {
                // Plunge wave hits in both directions around player
                sX = (player.x + player.width / 2) - slashRange / 2;
            }

            if (sX < this.x + this.width && sX + slashRange > this.x && player.y - (isPW ? 150 : 0) < this.y + this.height && player.y + 100 > this.y) {
                if (this.hitFlash === 0) {
                    let baseDamage = isDA ? 15 : (isPW ? 8 : (player.comboStep === 4 ? 3 : 1));
                    if (player.flameBuffTimer > 0) baseDamage += 10; // Flame Buff Damage
                    this.hp -= baseDamage;
                    this.hitFlash = 15;

                    // Apply Status Effects
                    if (player.flameBuffTimer > 0) {
                        this.burnTimer = 180; // 3 seconds
                    }
                    if (player.lightningBuffTimer > 0) {
                        this.stunTimer = 180; // 3 seconds (3 * 60 = 180)
                    }

                    let dir = player.facing;
                    if (isPW) dir = this.x > (player.x + player.width / 2) ? 1 : -1;

                    this.kx = dir * (isDA ? 40 : (isPW ? 32 : (player.comboStep === 4 ? 24 : 8))); // Plungewave knocks heavily
                    this.ky = isDA ? -8 : (isPW ? -12 : (player.comboStep === 4 ? -6 : -3)); // High upward knockback on plunge

                    if (isDA || player.comboStep === 4 || isPW) screenShake = isPW ? 12 : (isDA ? 10 : 6);

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
            const hitW = this.isSkilling ? this.width + 40 : 40; // Monster attack range reduced (was 120)
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

// --- BOSS HAZARDS ---
class EarthSpike {
    constructor(x, y, delay) {
        this.x = x;
        this.y = y;
        this.width = 60;
        this.height = 100;
        this.maxHeight = 120;
        this.timer = -delay;
        this.life = 60; // Total frames active
        this.isDead = false;
        this.damage = 15;
    }
    update(player) {
        this.timer++;
        if (this.timer > this.life) this.isDead = true;

        if (this.timer >= 0) {
            // Active phase for much longer window
            const currentH = Math.sin((this.timer / this.life) * Math.PI) * this.maxHeight;
            // Increased height tolerance for hit check
            if (player.x < this.x + this.width && player.x + player.width > this.x &&
                player.y + player.height > this.y - currentH - 20 && player.y < this.y + 20) {
                player.takeDamage(this.damage, this.x + this.width / 2, 5);
            }
        }
    }
    draw(ctx) {
        if (this.timer < 0) return;
        const currentH = Math.sin((this.timer / this.life) * Math.PI) * this.maxHeight;
        ctx.save();
        ctx.fillStyle = '#5d4037'; // Rock color
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.width / 2, this.y - currentH);
        ctx.lineTo(this.x + this.width, this.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Add some detail lines
        ctx.beginPath();
        ctx.moveTo(this.x + 10, this.y - 10);
        ctx.lineTo(this.x + this.width / 2, this.y - currentH + 20);
        ctx.stroke();
        ctx.restore();
    }
}

class Meteor {
    constructor(tx, ty) {
        this.tx = tx;
        this.ty = ty;
        this.x = tx;
        this.y = ty - 800;
        this.radius = 40;
        this.timer = 60; // 1 second warning
        this.state = 'WARNING';
        this.isDead = false;
        this.damage = 25;
    }
    update(player) {
        if (this.state === 'WARNING') {
            this.timer--;
            if (this.timer <= 0) {
                this.state = 'FALLING';
                screenShake = 10;
            }
        } else if (this.state === 'FALLING') {
            this.y += 25;
            if (this.y >= this.ty) {
                this.y = this.ty;
                this.state = 'EXPLODING';
                this.timer = 15;
                screenShake = 30;
                // Hit check - explosive radius
                const pCenterX = player.x + player.width / 2;
                const pCenterY = player.y + player.height / 2;
                const dist = Math.sqrt(Math.pow(pCenterX - this.tx, 2) + Math.pow(pCenterY - this.ty, 2));
                if (dist < 150) { // Increased radius
                    player.takeDamage(this.damage, this.tx, 20);
                }
                // Particles
                for (let i = 0; i < 20; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const spd = 2 + Math.random() * 8;
                    particles.push(new Particle(this.tx, this.ty, Math.cos(ang) * spd, Math.sin(ang) * spd, '#ff5722', 30, 6));
                }
            }
        } else {
            this.timer--;
            if (this.timer <= 0) this.isDead = true;
        }
    }
    draw(ctx) {
        if (this.state === 'WARNING') {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.tx, this.ty, 80, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 0, 0, ' + (0.3 + Math.sin(Date.now() / 100) * 0.4) + ')';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 5]);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
            ctx.fill();
            ctx.restore();
        } else if (this.state === 'FALLING') {
            ctx.save();
            ctx.fillStyle = '#212121';
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#ff5722';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            // Fire trail
            for (let i = 0; i < 5; i++) {
                particles.push(new Particle(this.x, this.y, (Math.random() - 0.5) * 5, -Math.random() * 10, '#f44336', 10, 4));
            }
            ctx.restore();
        } else if (this.state === 'EXPLODING') {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.tx, this.ty, 120 * (1 - this.timer / 15), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 87, 34, ' + (this.timer / 15) + ')';
            ctx.fill();
            ctx.restore();
        }
    }
}


class Boss extends Monster {
    constructor(x, y) {
        super(x, y);
        this.width = 180;
        this.height = 180;
        this.hp = 200;
        this.maxHp = 200;
        this.gravity = 0.6;
        this.state = 'IDLE'; // IDLE, CHASE, CHARGE_START, CHARGE, SPIKES, METEOR
        this.stateTimer = 0;

        // Cooldowns
        this.chargeCooldown = 0;
        this.spikesCooldown = 0;
        this.meteorCooldown = 0;
        this.attackCooldown = 0;

        this.kx = 0;
        this.ky = 0;
        this.mossColor = '#388e3c';
        this.rockColor = '#d7ccc8'; // Lighter beige/grey like reference
        this.darkRockColor = '#a1887f';
        this.eyeColor = '#e91e63'; // Pink/Purple glow

        // Boss status effects
        this.burnTimer = 0;
        this.burnDamageTimer = 0;
        this.stunTimer = 0;
    }
    update(player, level) {
        if (this.isDead) return;

        this.facing = player.x > this.x ? 1 : -1;
        const dist = Math.abs(player.x - this.x);

        // Update cooldowns
        if (this.chargeCooldown > 0) this.chargeCooldown--;
        if (this.spikesCooldown > 0) this.spikesCooldown--;
        if (this.meteorCooldown > 0) this.meteorCooldown--;
        if (this.attackCooldown > 0) this.attackCooldown--;

        // State Machine
        if (this.stunTimer > 0) {
            this.vx = 0;
            // Interrupt active skill phases if stunned if needed, or just freeze
            // For now, freeze movement
        } else {
            if (this.state === 'IDLE') {
                this.vx = 0;
                if (++this.stateTimer > 40) {
                    this.state = 'CHASE';
                    this.stateTimer = 0;
                }
            } else if (this.state === 'CHASE') {
                this.vx = this.facing * 2.5;

                // Attack Decider
                if (this.spikesCooldown <= 0 && Math.random() < 0.005) {
                    this.state = 'SPIKES';
                    this.stateTimer = 0;
                    this.spikesCooldown = 30 * 60; // 30s
                } else if (this.meteorCooldown <= 0 && dist < 600 && Math.random() < 0.01) {
                    this.state = 'METEOR';
                    this.stateTimer = 0;
                    this.meteorCooldown = 15 * 60; // 15s
                } else if (dist < 150 && this.attackCooldown <= 0) {
                    this.isTelegraphing = true;
                    this.telegraphTimer = 40;
                    this.vx = 0;
                }

                // Rock Charge Trigger (Detecting nearby projectiles)
                projectiles.forEach(p => {
                    if (!p.isDead && Math.abs(p.x - this.x) < 500 && this.chargeCooldown <= 0) {
                        this.state = 'CHARGE_START';
                        this.stateTimer = 0;
                        this.chargeCooldown = 10 * 60; // 10s cooldown
                    }
                });

            } else if (this.state === 'CHARGE_START') {
                this.vx = 0;
                if (++this.stateTimer > 45) {
                    this.state = 'CHARGE';
                    this.stateTimer = 45; // Dash duration (longer for map coverage)
                    this.vx = this.facing * 40;
                    screenShake = 20;
                }
            } else if (this.state === 'CHARGE') {
                this.vx = this.facing * 40;
                this.stateTimer--;
                // VFX
                if (this.stateTimer % 2 === 0) {
                    particles.push(new Particle(this.x + this.width / 2, this.y + this.height, -this.facing * 5, -2, '#757575', 20, 10));
                    screenShake = 5;
                }
                // Damage player
                if (player.invincibility <= 0 && player.x < this.x + this.width && player.x + player.width > this.x && player.y < this.y + this.height && player.y + player.height > this.y) {
                    player.takeDamage(30, this.x + this.width / 2, 35);
                }
                if (this.stateTimer <= 0 || this.x <= 0 || this.x + this.width >= WORLD_WIDTH) {
                    this.state = 'IDLE';
                    this.stateTimer = 0;
                    this.vx = 0;
                    screenShake = 15;
                }
            } else if (this.state === 'SPIKES') {
                this.vx = 0;
                if (++this.stateTimer === 1) {
                    // Start chain reaction across map
                    const groundY = WORLD_HEIGHT - 60; // Actual ground surface
                    for (let i = 0; i < WORLD_WIDTH; i += 80) {
                        const delay = (i / 15); // Staggered appearance
                        bossHazards.push(new EarthSpike(i, groundY, delay));
                    }
                }
                if (this.stateTimer > 120) {
                    this.state = 'CHASE';
                    this.stateTimer = 0;
                }
            } else if (this.state === 'METEOR') {
                this.vx = 0;
                if (++this.stateTimer === 1) {
                    // Call meteor on player - target their actual position
                    const targetY = player.onGround ? player.y + player.height : WORLD_HEIGHT - 60;
                    bossHazards.push(new Meteor(player.x + player.width / 2, targetY));
                }
                if (this.stateTimer > 60) {
                    this.state = 'CHASE';
                    this.stateTimer = 0;
                }
            }
        }

        if (this.isTelegraphing) {
            if (--this.telegraphTimer <= 0) {
                this.isTelegraphing = false;
                this.isAttacking = true;
                this.slashTimer = 20;
                this.attackCooldown = 90;
                screenShake = 15;
            }
        }
        if (this.isAttacking) {
            if (--this.slashTimer <= 0) this.isAttacking = false;
        }

        // Apply Physics
        this.vy += this.gravity;
        this.x += this.vx + this.kx;
        this.y += this.vy + this.ky;
        this.kx *= 0.9;
        this.ky *= 0.9;

        level.checkCollision(this);

        // Bounds
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;

        // General Hit Detection (Projectiles, Sword, etc.)
        projectiles.forEach(p => {
            if (!p.isDead && p.x < this.x + this.width && p.x + p.width > this.x && p.y < this.y + this.height && p.y + p.height > this.y) {
                if (this.hitFlash === 0) {
                    this.hp -= 4;
                    this.hitFlash = 10;
                    p.isDead = true;
                    this.updateBossUI();
                }
            }
        });

        if ((player.isSlashing && player.slashTimer < 12) || player.isDashAttacking || player.plungeWaveTimer > 0) {
            const isPW = player.plungeWaveTimer > 0;
            // Enhanced Boss Hit Check - Synchronize with Visuals
            let extraRange = (player.flameBuffTimer > 0 ? 40 : 0);
            let visualRadius = (player.comboStep === 4 ? 180 : 130) + extraRange;
            let visualScale = (player.comboStep === 4 ? 1.5 : 1.0);
            const distCheck = isPW ? 250 : (visualRadius * visualScale + 30); // Boss hit detection slightly more generous for его size
            if (Math.abs(player.x - this.x) < distCheck && player.y + player.height > this.y && player.y < this.y + this.height) {
                if (this.hitFlash === 0) {
                    let dmg = player.isDashAttacking ? 15 : (isPW ? 10 : 2);
                    if (player.flameBuffTimer > 0) dmg += 10;
                    this.hp -= dmg;
                    this.hitFlash = 15;
                    this.updateBossUI();

                    // Status effects on Boss
                    if (player.flameBuffTimer > 0) this.burnTimer = 180;
                    if (player.lightningBuffTimer > 0) this.stunTimer = 180; // 3 seconds
                }
            }
        }

        if (this.hp <= 0) {
            this.isDead = true;
            updateScore(10000);
            alert("GOLEM DEFEATED!");
            resetGame();
        }

        // --- Flame/Stun update for Boss ---
        if (this.stunTimer > 0) {
            this.stunTimer--;
            this.vx = 0;
            if (Math.random() < 0.3) particles.push(new Particle(this.x + Math.random() * this.width, this.y + Math.random() * this.height, 0, -2, '#d200ff', 10, 2));
        }
        if (this.burnTimer > 0) {
            this.burnTimer--;
            if (++this.burnDamageTimer >= 30) {
                this.hp -= 10; // Boss takes more burn damage proportionately if needed, or stick to 10
                this.burnDamageTimer = 0;
                this.hitFlash = 5;
                this.updateBossUI();
            }
            if (Math.random() < 0.3) particles.push(new Particle(this.x + Math.random() * this.width, this.y + Math.random() * this.height, 0, -3, '#ff4500', 15, 6));
        }

        if (this.hitFlash > 0) this.hitFlash--;
    }

    updateBossUI() {
        const bossBar = document.getElementById('bossHealth');
        if (bossBar) bossBar.style.width = (this.hp / this.maxHp * 100) + '%';
    }

    draw(ctx) {
        if (this.isDead) return;
        ctx.save();

        const shakeX = (Math.random() - 0.5) * (this.state === 'CHARGE_START' ? 4 : 0);
        ctx.translate(shakeX, 0);

        const baseColor = this.hitFlash > 0 ? '#fff' : this.rockColor;
        const shadowColor = this.hitFlash > 0 ? '#eee' : this.darkRockColor;

        // Helper to draw a rock segment
        const drawRock = (x, y, w, h, radius = 10, isDark = false) => {
            ctx.fillStyle = isDark ? shadowColor : baseColor;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, radius);
            ctx.fill();
            ctx.strokeStyle = '#2d2d2d';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Subtle "crack" detail
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.moveTo(x + w * 0.2, y + h * 0.2);
            ctx.lineTo(x + w * 0.4, y + h * 0.5);
            ctx.stroke();
        };

        // --- DRAW BODY SEGMENTS ---

        // 1. Torso (Segmented Plates)
        drawRock(this.x + 35, this.y + 110, 110, 50, 10); // Lower plate
        drawRock(this.x + 30, this.y + 80, 120, 45, 12);  // Mid plate
        drawRock(this.x + 40, this.y + 50, 100, 40, 10);  // Upper chest

        // 2. Head (Deep set in shoulders)
        // Face area shadow
        ctx.fillStyle = shadowColor;
        ctx.beginPath();
        ctx.roundRect(this.x + 60, this.y + 20, 60, 55, 8);
        ctx.fill();

        // Mouth "grille" detail
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(this.x + 70 + i * 10, this.y + 60);
            ctx.lineTo(this.x + 70 + i * 10, this.y + 70);
            ctx.stroke();
        }

        // Eyes (Pink Glow - recessed)
        ctx.fillStyle = this.eyeColor;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.eyeColor;
        const eyeY = this.y + 42;
        ctx.fillRect(this.x + 72, eyeY, 12, 6); // Left eye
        ctx.fillRect(this.x + 96, eyeY, 12, 6); // Right eye
        ctx.shadowBlur = 0;

        // 3. Shoulders (Large & Imposing)
        drawRock(this.x - 10, this.y + 10, 70, 60, 15); // Left
        drawRock(this.x + 120, this.y + 10, 70, 60, 15); // Right

        // 4. Arms
        if (this.state === 'CHARGE_START' || this.state === 'CHARGE') {
            // Extended forward for Charge
            const armW = 140;
            const armH = 60;
            const ax = this.facing === 1 ? this.x + 100 : this.x - (armW - 80);
            drawRock(ax, this.y + 70, armW, armH, 15);
            drawRock(ax + (this.facing === 1 ? armW - 40 : 0), this.y + 60, 40, 80, 10); // Fist
        } else if (this.state === 'METEOR') {
            // Raised Arms
            drawRock(this.x - 20, this.y - 60, 50, 100, 15);
            drawRock(this.x + 150, this.y - 60, 50, 100, 15);
        } else {
            // Thick Dangling Arms
            // Left Arm
            drawRock(this.x - 30, this.y + 50, 50, 60, 10); // upper
            drawRock(this.x - 40, this.y + 90, 60, 80, 15); // lower/fist
            // Right Arm
            drawRock(this.x + 160, this.y + 50, 50, 60, 10); // upper
            drawRock(this.x + 160, this.y + 90, 60, 80, 15); // lower/fist
        }

        // 5. Moss Details
        ctx.fillStyle = this.mossColor;
        ctx.fillRect(this.x + 20, this.y + 10, 30, 8);
        ctx.fillRect(this.x + 130, this.y + 15, 20, 10);
        ctx.fillRect(this.x + 50, this.y + 150, 80, 12);

        if (this.isTelegraphing) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, 150 + Math.sin(Date.now() / 100) * 20, 0, Math.PI * 2);
            ctx.fill();
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

// --- TIME SCALE CONFIG ---
let logicAccumulator = 0;
const gameSpeed = 1.5;

function animate() {
    if (isGameOver) return;

    // 1. LOGIC UPDATES (Fixed step simulation at 1.5x rate)
    logicAccumulator += gameSpeed;
    while (logicAccumulator >= 1) {
        spawnMonsters();

        // Update Projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
            projectiles[i].update();
            if (projectiles[i].isDead) projectiles.splice(i, 1);
        }

        // Update Boss / Monsters
        if (bossActive && boss) {
            boss.update(player, level);
        } else if (!bossActive) {
            monsters.forEach(m => m.update(player, level));
        }

        // Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            if (particles[i].isDead) particles.splice(i, 1);
        }

        // Update Player & UI
        player.update(input, level);
        player.updateSkillUI();

        // Update Hazards
        for (let i = bossHazards.length - 1; i >= 0; i--) {
            bossHazards[i].update(player);
            if (bossHazards[i].isDead) bossHazards.splice(i, 1);
        }

        logicAccumulator -= 1;
    }

    // 2. CAMERA CALCULATION (Once per frame)
    const baseScale = Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT);
    const scale = baseScale * 2;

    const targetCamX = (player.x + player.width / 2) - (canvas.width / scale) / 2;
    const targetCamY = (player.y + player.height / 2) - (canvas.height / scale) / 2;

    cameraX += (targetCamX - cameraX) * 0.1;
    cameraY += (targetCamY - cameraY) * 0.1;

    cameraX = Math.max(0, Math.min(cameraX, WORLD_WIDTH - canvas.width / scale));
    cameraY = Math.max(0, Math.min(cameraY, WORLD_HEIGHT - canvas.height / scale));

    // 3. DRAWING
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Screen Shake
    let sx = 0, sy = 0;
    if (screenShake > 0) {
        sx = (Math.random() - 0.5) * screenShake * 2;
        sy = (Math.random() - 0.5) * screenShake * 2;
        screenShake *= 0.9;
        if (screenShake < 0.5) screenShake = 0;
    }

    ctx.translate(sx, sy);
    ctx.scale(scale, scale);
    ctx.translate(-cameraX, -cameraY);

    level.draw(ctx);

    projectiles.forEach(p => p.draw(ctx));

    if (bossActive && boss) {
        boss.draw(ctx);
    } else if (!bossActive) {
        monsters.forEach(m => m.draw(ctx));
    }

    particles.forEach(p => p.draw(ctx));

    player.draw(ctx);

    bossHazards.forEach(h => h.draw(ctx));

    ctx.restore();
    requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
