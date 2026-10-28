export interface QuizCardOptions {
  mode: 'challenge' | 'story';
  playerName: string;
  playerUsername?: string;
  playerPhotoUrl?: string | null;
  correctAnswers: number;
  totalQuestions: number;
  accuracy: number;
  pointsEarned: number;
  timeTakenSeconds: number;
  isBoosterApplied?: boolean;
  botUsername?: string;
}

export interface GeneratedQuizCard {
  dataUrl: string;
  blob: Blob;
}

// ── Path Drawing Helpers ──────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawTrophy(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const w = size * 0.7;
  const h = size * 0.65;

  // Cup body
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy - h / 2);
  ctx.lineTo(cx + w * 0.4, cy + h * 0.1);
  ctx.quadraticCurveTo(cx, cy + h * 0.45, cx - w * 0.4, cy + h * 0.1);
  ctx.closePath();
  ctx.fill();

  // Left handle
  ctx.beginPath();
  ctx.arc(cx - w * 0.45, cy - h * 0.15, size * 0.22, 0.4 * Math.PI, 1.6 * Math.PI);
  ctx.stroke();

  // Right handle
  ctx.beginPath();
  ctx.arc(cx + w * 0.45, cy - h * 0.15, size * 0.22, 1.4 * Math.PI, 0.6 * Math.PI);
  ctx.stroke();

  // Stem
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.08, cy + h * 0.38);
  ctx.lineTo(cx + size * 0.08, cy + h * 0.38);
  ctx.lineTo(cx + size * 0.1, cy + h * 0.65);
  ctx.lineTo(cx - size * 0.1, cy + h * 0.65);
  ctx.closePath();
  ctx.fill();

  // Base
  ctx.beginPath();
  roundRect(ctx, cx - size * 0.3, cy + h * 0.65, size * 0.6, size * 0.14, 4);
  ctx.fill();

  ctx.restore();
}

function drawCheckmark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy);
  ctx.lineTo(cx - size * 0.1, cy + size * 0.35);
  ctx.lineTo(cx + size * 0.45, cy - size * 0.35);
  ctx.stroke();
  ctx.restore();
}

function drawTarget(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const rOuter = size * 0.5;
    const rInner = size * 0.16;
    ctx.lineTo(cx + Math.cos(angle) * rOuter, cy + Math.sin(angle) * rOuter);
    ctx.lineTo(cx + Math.cos(angle + Math.PI / 4) * rInner, cy + Math.sin(angle + Math.PI / 4) * rInner);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawClock(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
  ctx.stroke();

  // Hands
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - size * 0.25);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + size * 0.2, cy);
  ctx.stroke();
  ctx.restore();
}

function drawSwords(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.12;
  ctx.lineCap = 'round';

  // Sword 1
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.35, cy - size * 0.35);
  ctx.lineTo(cx + size * 0.35, cy + size * 0.35);
  ctx.stroke();

  // Guard 1
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.18, cy + size * 0.3);
  ctx.lineTo(cx + size * 0.3, cy + size * 0.18);
  ctx.stroke();

  // Sword 2
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.35, cy - size * 0.35);
  ctx.lineTo(cx - size * 0.35, cy + size * 0.35);
  ctx.stroke();

  // Guard 2
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.18, cy + size * 0.3);
  ctx.lineTo(cx - size * 0.3, cy + size * 0.18);
  ctx.stroke();

  ctx.restore();
}

const loadAvatarImage = (url: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 1200);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
};

// ── Main Card Generator ───────────────────────────────────────────────────

export async function generateQuizResultCardImage(
  options: QuizCardOptions
): Promise<GeneratedQuizCard> {
  const {
    mode,
    playerName,
    playerUsername,
    playerPhotoUrl,
    correctAnswers,
    totalQuestions,
    accuracy,
    pointsEarned,
    timeTakenSeconds,
    isBoosterApplied = false,
    botUsername = '@footyiqgamebot',
  } = options;

  const isStory = mode === 'story';
  const width = 1080;
  const height = isStory ? 1920 : 1320;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // 1. Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#070b13');
  bgGrad.addColorStop(0.35, '#0e1626');
  bgGrad.addColorStop(0.7, '#0a101b');
  bgGrad.addColorStop(1, '#05070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Pitch floodlight glow & decorative geometry
  const radialGlow = ctx.createRadialGradient(width / 2, isStory ? 380 : 300, 20, width / 2, isStory ? 380 : 300, 620);
  radialGlow.addColorStop(0, 'rgba(223, 255, 0, 0.15)');
  radialGlow.addColorStop(0.5, 'rgba(16, 185, 129, 0.08)');
  radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(0, 0, width, height);

  // Subtle pitch line markings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 340, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(60, height / 2);
  ctx.lineTo(width - 60, height / 2);
  ctx.stroke();

  // 3. Main Glass Card Container
  const cardX = 60;
  const cardY = isStory ? 160 : 70;
  const cardWidth = width - 120; // 960
  const cardHeight = isStory ? 1600 : 1180;
  const cardRadius = 36;

  // Outer glow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 45;
  ctx.shadowOffsetY = 20;

  // Card background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  roundRect(ctx, cardX, cardY, cardWidth, cardHeight, cardRadius);
  ctx.fill();
  ctx.restore();

  // Card border gradient
  ctx.save();
  const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
  borderGrad.addColorStop(0, 'rgba(223, 255, 0, 0.45)');
  borderGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.25)');
  borderGrad.addColorStop(1, 'rgba(99, 102, 241, 0.35)');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 2.5;
  roundRect(ctx, cardX, cardY, cardWidth, cardHeight, cardRadius);
  ctx.stroke();
  ctx.restore();

  // 4. Header Pill Badge
  const headerPillY = cardY + 50;
  ctx.save();
  ctx.fillStyle = 'rgba(223, 255, 0, 0.12)';
  roundRect(ctx, width / 2 - 200, headerPillY, 400, 48, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(223, 255, 0, 0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, width / 2 - 200, headerPillY, 400, 48, 24);
  ctx.stroke();

  ctx.fillStyle = '#DFEF00';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚽ FOOTY IQ • DAILY CHALLENGE', width / 2, headerPillY + 24);
  ctx.restore();

  // 5. Trophy Badge
  const trophyY = cardY + 185;
  ctx.save();
  // Glowing amber background
  ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.beginPath();
  ctx.arc(width / 2, trophyY, 52, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(width / 2, trophyY, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Draw trophy icon
  drawTrophy(ctx, width / 2, trophyY, 52, '#fbbf24');

  // 6. Title and Subtitle
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 46px system-ui, -apple-system, sans-serif';
  ctx.fillText('Quiz Completed!', width / 2, trophyY + 95);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 24px system-ui, -apple-system, sans-serif';
  ctx.fillText('Great effort on the pitch today!', width / 2, trophyY + 138);
  ctx.restore();

  // 7. Player Badge Row
  const playerY = trophyY + 185;
  const playerPillW = 460;
  const playerPillH = 74;
  const playerPillX = width / 2 - playerPillW / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  roundRect(ctx, playerPillX, playerY, playerPillW, playerPillH, 37);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, playerPillX, playerY, playerPillW, playerPillH, 37);
  ctx.stroke();

  // Avatar
  const avatarCenterX = playerPillX + 42;
  const avatarCenterY = playerY + playerPillH / 2;
  const avatarRadius = 26;

  const loadedAvatar = playerPhotoUrl ? await loadAvatarImage(playerPhotoUrl) : null;
  if (loadedAvatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      loadedAvatar,
      avatarCenterX - avatarRadius,
      avatarCenterY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2
    );
    ctx.restore();

    ctx.strokeStyle = '#DFEF00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Vector Initial badge
    ctx.fillStyle = 'linear-gradient(135deg, #10b981, #047857)';
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = (playerName || 'F').charAt(0).toUpperCase();
    ctx.fillText(initial, avatarCenterX, avatarCenterY);
  }

  // Player text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  const cleanName = playerName.length > 18 ? playerName.slice(0, 16) + '...' : playerName;
  ctx.fillText(cleanName, avatarCenterX + 38, avatarCenterY - 11);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 19px system-ui, -apple-system, sans-serif';
  const tagText = playerUsername ? `@${playerUsername}` : 'Footy Contender';
  ctx.fillText(tagText, avatarCenterX + 38, avatarCenterY + 15);
  ctx.restore();

  // 8. 4 Stats Metric Cards (2x2 Grid)
  const statsStartY = playerY + 115;
  const colW = 410;
  const colH = 150;
  const col1X = cardX + 50;
  const col2X = cardX + cardWidth - 50 - colW;
  const row1Y = statsStartY;
  const row2Y = statsStartY + colH + 20;

  interface MetricCardDef {
    x: number;
    y: number;
    icon: 'check' | 'target' | 'sparkle' | 'clock';
    iconBg: string;
    iconColor: string;
    title: string;
    value: string;
    valColor: string;
    extraNote?: string;
  }

  const minutes = Math.floor(timeTakenSeconds / 60);
  const seconds = String(timeTakenSeconds % 60).padStart(2, '0');

  const metricCards: MetricCardDef[] = [
    {
      x: col1X,
      y: row1Y,
      icon: 'check',
      iconBg: 'rgba(16, 185, 129, 0.15)',
      iconColor: '#34d399',
      title: 'CORRECT',
      value: `${correctAnswers}/${totalQuestions}`,
      valColor: '#34d399',
    },
    {
      x: col2X,
      y: row1Y,
      icon: 'target',
      iconBg: 'rgba(99, 102, 241, 0.15)',
      iconColor: '#818cf8',
      title: 'ACCURACY',
      value: `${accuracy}%`,
      valColor: '#f8fafc',
    },
    {
      x: col1X,
      y: row2Y,
      icon: 'sparkle',
      iconBg: 'rgba(245, 158, 11, 0.15)',
      iconColor: '#fbbf24',
      title: 'POINTS',
      value: `+${pointsEarned}`,
      valColor: '#fbbf24',
      extraNote: isBoosterApplied ? 'x2 applied to leaderboard' : undefined,
    },
    {
      x: col2X,
      y: row2Y,
      icon: 'clock',
      iconBg: 'rgba(148, 163, 184, 0.15)',
      iconColor: '#94a3b8',
      title: 'TIME TAKEN',
      value: `${minutes}:${seconds}`,
      valColor: '#f8fafc',
    },
  ];

  metricCards.forEach((card) => {
    ctx.save();
    // Card background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    roundRect(ctx, card.x, card.y, colW, colH, 20);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, card.x, card.y, colW, colH, 20);
    ctx.stroke();

    // Icon Circle
    const iconX = card.x + 36;
    const iconY = card.y + 40;
    ctx.fillStyle = card.iconBg;
    ctx.beginPath();
    ctx.arc(iconX, iconY, 20, 0, Math.PI * 2);
    ctx.fill();

    if (card.icon === 'check') drawCheckmark(ctx, iconX, iconY, 20, card.iconColor);
    else if (card.icon === 'target') drawTarget(ctx, iconX, iconY, 20, card.iconColor);
    else if (card.icon === 'sparkle') drawSparkle(ctx, iconX, iconY, 20, card.iconColor);
    else if (card.icon === 'clock') drawClock(ctx, iconX, iconY, 20, card.iconColor);

    // Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.title, iconX + 32, iconY);

    // Value
    ctx.fillStyle = card.valColor;
    ctx.font = '800 42px system-ui, -apple-system, sans-serif';
    ctx.fillText(card.value, card.x + 32, card.y + 98);

    if (card.extraNote) {
      ctx.fillStyle = '#6ee7b7';
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
      ctx.fillText(card.extraNote, card.x + 130, card.y + 125);
    }
    ctx.restore();
  });

  // 9. Call-To-Action Bottom Banner
  const ctaY = row2Y + colH + 36;
  const ctaW = cardWidth - 100;
  const ctaX = cardX + 50;

  if (isStory) {
    // ── Story Mode Banner ────────────────────────────────────────────────
    const ctaH = 430;
    ctx.save();
    // Cyan/Telegram gradient background
    const storyCtaGrad = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaW, ctaY + ctaH);
    storyCtaGrad.addColorStop(0, 'rgba(0, 136, 204, 0.16)');
    storyCtaGrad.addColorStop(1, 'rgba(223, 255, 0, 0.12)');
    ctx.fillStyle = storyCtaGrad;
    roundRect(ctx, ctaX, ctaY, ctaW, ctaH, 28);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 136, 204, 0.5)';
    ctx.lineWidth = 2.5;
    roundRect(ctx, ctaX, ctaY, ctaW, ctaH, 28);
    ctx.stroke();

    // Icon / Header
    drawSwords(ctx, width / 2, ctaY + 65, 48, '#DFEF00');

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 36px system-ui, -apple-system, sans-serif';
    ctx.fillText('CAN YOU BEAT MY FOOTBALL IQ?', width / 2, ctaY + 135);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('Play today’s live quiz and challenge players worldwide!', width / 2, ctaY + 180);

    // Telegram Bot Button Pill
    const botPillY = ctaY + 235;
    const botPillW = 680;
    const botPillH = 92;
    const botPillX = width / 2 - botPillW / 2;

    ctx.fillStyle = '#0088cc';
    ctx.shadowColor = 'rgba(0, 136, 204, 0.5)';
    ctx.shadowBlur = 25;
    roundRect(ctx, botPillX, botPillY, botPillW, botPillH, 24);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(`PLAY ON TELEGRAM: ${botUsername}`, width / 2, botPillY + 46);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Search ${botUsername} in the Telegram app to play free`, width / 2, ctaY + 375);
    ctx.restore();

    // Story Footer branding
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '600 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('Footy IQ Mini App • Play Football Quizzes Daily', width / 2, height - 60);
    ctx.restore();
  } else {
    // ── Challenge Mode Banner ────────────────────────────────────────────
    const ctaH = 200;
    ctx.save();
    const chalGrad = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaW, ctaY + ctaH);
    chalGrad.addColorStop(0, 'rgba(223, 255, 0, 0.12)');
    chalGrad.addColorStop(1, 'rgba(245, 158, 11, 0.12)');
    ctx.fillStyle = chalGrad;
    roundRect(ctx, ctaX, ctaY, ctaW, ctaH, 24);
    ctx.fill();

    ctx.strokeStyle = 'rgba(223, 255, 0, 0.4)';
    ctx.lineWidth = 2;
    roundRect(ctx, ctaX, ctaY, ctaW, ctaH, 24);
    ctx.stroke();

    // Swords icon
    drawSwords(ctx, cardX + 110, ctaY + ctaH / 2, 42, '#DFEF00');

    ctx.textAlign = 'left';
    ctx.fillStyle = '#DFEF00';
    ctx.font = '800 30px system-ui, -apple-system, sans-serif';
    ctx.fillText('⚔️ 1V1 BATTLE CHALLENGE', cardX + 160, ctaY + 60);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('Think you can beat my score? Tap the challenge link!', cardX + 160, ctaY + 102);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Play on Telegram: ${botUsername}`, cardX + 160, ctaY + 142);
    ctx.restore();
  }

  // Convert canvas to Data URL and Blob
  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Canvas blob generation failed'));
    }, 'image/png');
  });

  return { dataUrl, blob };
}
