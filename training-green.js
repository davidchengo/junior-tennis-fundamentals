const coachButton =
  document.getElementById("coachMode");


/* =========================================================
   COACH MODE
   ========================================================= */

coachButton.addEventListener("click", () => {

  const enabled =
    document.body.classList.toggle("coach-mode");

  coachButton.classList.toggle(
    "active",
    enabled
  );

  coachButton.textContent =
    enabled
      ? "📋 Full Lesson"
      : "👀 Coach Mode";
});


/* =========================================================
   COLLAPSIBLE VIDEOS
   ========================================================= */

document.querySelectorAll(".drill-video-toggle").forEach((button) => {

  button.addEventListener("click", () => {

    const frame =
      button.nextElementSibling;

    const isOpen =
      frame.classList.contains("drill-video-open");

    frame.classList.toggle(
      "drill-video-open",
      !isOpen
    );

    frame.classList.toggle(
      "drill-video-collapsed",
      isOpen
    );

    button.setAttribute(
      "aria-expanded",
      String(!isOpen)
    );

    const label =
      button.querySelector("span");

    label.textContent =
      isOpen
        ? "▶ Watch Example"
        : "▼ Hide Example";
  });

});


/* =========================================================
   DRILL TIMERS
   ========================================================= */

let activeTimer = null;
let activeButton = null;

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}


function resetTimerButton(button) {

  const minutes =
    Number(button.dataset.minutes);

  button.textContent =
    `⏱ Start ${minutes}:00`;

  button.classList.remove(
    "running",
    "finished"
  );
}


document.querySelectorAll(".drill-timer-button").forEach((button) => {

  button.addEventListener("click", () => {

    /*
      Clicking the active timer stops and resets it.
    */
    if (activeButton === button && activeTimer) {

      clearInterval(activeTimer);

      activeTimer = null;
      activeButton = null;

      resetTimerButton(button);

      return;
    }


    /*
      Starting another drill automatically resets
      the previous timer.
    */
    if (activeTimer) {

      clearInterval(activeTimer);

      if (activeButton) {
        resetTimerButton(activeButton);
      }
    }


    const minutes =
      Number(button.dataset.minutes);

    let remaining =
      minutes * 60;

    activeButton = button;

    button.classList.add("running");

    button.textContent =
      `⏸ ${formatTime(remaining)}`;


    activeTimer = setInterval(() => {

      remaining -= 1;

      button.textContent =
        `⏸ ${formatTime(remaining)}`;


      if (remaining <= 0) {

        clearInterval(activeTimer);

        activeTimer = null;
        activeButton = null;

        button.classList.remove("running");
        button.classList.add("finished");

        button.textContent =
          "✓ Time — Next Drill";
      }

    }, 1000);

  });

});
