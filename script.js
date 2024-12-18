const countdowns = {
  countdown1: { targetDate: new Date("2025-01-01T00:00:00Z"), timeZone: "Europe/London" },
  countdown2: { targetDate: new Date("2026-01-01T00:00:00Z"), timeZone: "Europe/London" },
  countdown3: { targetDate: new Date("2027-06-01T00:00:00Z"), timeZone: "Europe/London" }
};

function updateCountdown(id) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: countdowns[id].timeZone }));
  const target = countdowns[id].targetDate;
  const timeRemaining = target - now;

  if (timeRemaining <= 0) {
    document.getElementById(id).innerText = "🎉 Es ist soweit!";
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
