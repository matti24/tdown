
const countdowns = {
  countdown2: { targetDate: new Date("2025-12-31T23:00:00Z"), timeZone: "Europe/London" },
  countdown3: { targetDate: new Date("2026-12-31T23:00:00Z"), timeZone: "Europe/London" }
};

function updateCountdown(id) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: countdowns[id].timeZone }));
  const target = countdowns[id].targetDate;
  const timeRemaining = target - now;

  if (timeRemaining <= 0) {
    document.getElementById(id).innerText = "You have reached this year!";
    return;
  }

  document.getElementById(`days${id.slice(-1)}`).textContent = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  document.getElementById(`hours${id.slice(-1)}`).textContent = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  document.getElementById(`minutes${id.slice(-1)}`).textContent = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  document.getElementById(`seconds${id.slice(-1)}`).textContent = Math.floor((timeRemaining % (1000 * 60)) / 1000);
}

function setTimeZone(id, zone) {
  countdowns[id].timeZone = zone;
  updateCountdown(id);
}

function startCountdowns() {
  for (const id in countdowns) {
    setInterval(() => updateCountdown(id), 1000);
    updateCountdown(id);
  }
}

startCountdowns();

const emojiContainer = document.getElementById('emojiContainer');
const clockEmojis = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];

function createEmoji() {
  const emojiElement = document.createElement('div');
  emojiElement.textContent = clockEmojis[Math.floor(Math.random() * clockEmojis.length)];
  emojiElement.className = 'emoji';

  // Random size
  const size = Math.random() * 3 + 0.5; // Between 3rem and 0.5rem
  emojiElement.style.fontSize = `${size}rem`;

  // Random initial position
  const startX = Math.random() * 100; // 0 to 100% width
  const startY = Math.random() * 100; // 0 to 100% height
  emojiElement.style.left = `${startX}vw`;
  emojiElement.style.top = `${startY}vh`;

  // Random animation duration
  const duration = Math.random() *  + 3; // Between 0s and 3s
  emojiElement.style.animationDuration = `${duration}s`;

  emojiContainer.appendChild(emojiElement);

  // Remove emoji after animation ends
  setTimeout(() => emojiElement.remove(), duration * 1000);
}

// Generate emojis at intervals
setInterval(createEmoji, 20);
