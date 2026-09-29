// Minimal, dependency-free confetti burst using the Web Animations API.
// No external package needed — just animated particles styled via CSS.

const COLORS = [
  '#6366f1', // Indigo
  '#22c55e', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Rose
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#eab308', // Gold
];

/**
 * Standard confetti rain from top to bottom.
 */
export function fireConfetti(particleCount = 120) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '9999';
  document.body.appendChild(container);

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    const size = 6 + Math.random() * 6;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const startX = Math.random() * window.innerWidth;
    const drift = (Math.random() - 0.5) * 300;
    const rotation = Math.random() * 720 - 360;
    const duration = 2200 + Math.random() * 1400;
    const delay = Math.random() * 300;

    particle.style.position = 'absolute';
    particle.style.left = `${startX}px`;
    particle.style.top = '-20px';
    particle.style.width = `${size}px`;
    particle.style.height = `${size * 0.4}px`;
    particle.style.backgroundColor = color;
    particle.style.borderRadius = '2px';
    container.appendChild(particle);

    const animation = particle.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${drift}px, ${window.innerHeight + 40}px) rotate(${rotation}deg)`,
          opacity: 0.9,
        },
      ],
      { duration, delay, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' },
    );

    animation.onfinish = () => particle.remove();
  }

  setTimeout(() => container.remove(), 4200);
}

/**
 * High-energy celebratory dual-cannon confetti explosion ("Birthday Boom").
 * Fires 160 colorful ribbon and star particles bursting upwards from both sides.
 */
export function fireCelebrationBoom(count = 160) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '9999';
  container.style.overflow = 'hidden';
  document.body.appendChild(container);

  const origins = [
    { x: window.innerWidth * 0.15, y: window.innerHeight * 0.9 }, // Left cannon
    { x: window.innerWidth * 0.85, y: window.innerHeight * 0.9 }, // Right cannon
    { x: window.innerWidth * 0.5, y: window.innerHeight * 0.8 },  // Center burst
  ];

  for (let i = 0; i < count; i++) {
    const origin = origins[i % origins.length];
    const particle = document.createElement('div');
    const isRibbon = Math.random() > 0.3;
    const size = isRibbon ? 8 + Math.random() * 8 : 6 + Math.random() * 4;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    // Angle and velocity based on which cannon fired
    let angleRad: number;
    if (origin.x < window.innerWidth * 0.3) {
      // Left cannon shoots up-right: 55° to 85°
      angleRad = (Math.PI / 180) * (45 + Math.random() * 45);
    } else if (origin.x > window.innerWidth * 0.7) {
      // Right cannon shoots up-left: 95° to 135°
      angleRad = (Math.PI / 180) * (90 + Math.random() * 45);
    } else {
      // Center burst shoots wide: 60° to 120°
      angleRad = (Math.PI / 180) * (60 + Math.random() * 60);
    }

    const speed = 400 + Math.random() * 600; // velocity
    const targetX = Math.cos(angleRad) * (origin.x < window.innerWidth * 0.5 ? speed : -speed);
    const targetY = -Math.sin(angleRad) * speed;
    const gravityY = targetY + 350 + Math.random() * 200; // arcs down with gravity
    const rotation = (Math.random() - 0.5) * 1440;
    const duration = 1800 + Math.random() * 1200;
    const delay = Math.random() * 150;

    particle.style.position = 'absolute';
    particle.style.left = `${origin.x}px`;
    particle.style.top = `${origin.y}px`;
    particle.style.width = isRibbon ? `${size}px` : `${size}px`;
    particle.style.height = isRibbon ? `${size * 0.45}px` : `${size}px`;
    particle.style.backgroundColor = color;
    particle.style.borderRadius = isRibbon ? '2px' : '50%';
    particle.style.boxShadow = `0 0 6px ${color}88`;
    container.appendChild(particle);

    const animation = particle.animate(
      [
        {
          transform: 'translate(0, 0) scale(0.4) rotate(0deg)',
          opacity: 1,
        },
        {
          transform: `translate(${targetX * 0.6}px, ${targetY}px) scale(1.2) rotate(${rotation * 0.5}deg)`,
          opacity: 1,
          offset: 0.35,
        },
        {
          transform: `translate(${targetX}px, ${gravityY}px) scale(0.9) rotate(${rotation}deg)`,
          opacity: 0,
          offset: 1,
        },
      ],
      {
        duration,
        delay,
        easing: 'cubic-bezier(0.12, 0.8, 0.32, 1)',
        fill: 'forwards',
      },
    );

    animation.onfinish = () => particle.remove();
  }

  setTimeout(() => container.remove(), 3500);
}
