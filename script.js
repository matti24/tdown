let countdownElement = document.getElementById('countdown');
let currentTimeZone = 'Europe/London';

let targetDate = new Date('2025-01-01T00:00:00Z');

function updateCountdown() {
  let now = new Date().toLocaleString("en-US", { timeZone: currentTimeZone });
  let nowDate = new Date(now);

  let timeRemaining = targetDate - nowDate;

  if (timeRemaining <= 0) {
    countdownElement.innerHTML = "It's 2025!";
    return;
  }

  let days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  let hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  let minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  let seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

  let dayLabel = days === 1 ? "Day" : "Days";
  let hourLabel = hours === 1 ? "Hour" : "Hours";
  let minuteLabel = minutes === 1 ? "Minute" : "Minutes";
  let secondLabel = seconds === 1 ? "Second" : "Seconds";

  countdownElement.innerHTML = `
    ${days} ${dayLabel} 
    ${hours} ${hourLabel} 
    ${minutes} ${minuteLabel} 
    ${seconds} ${secondLabel}
  `;
}

function setTimeZone(timeZone) {
  currentTimeZone = timeZone;
  updateCountdown();
}

setInterval(updateCountdown, 1000);
updateCountdown();
