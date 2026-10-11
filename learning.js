const skillSearch = document.getElementById("skillSearch");
if (skillSearch) {
  const skillCards = [...document.querySelectorAll("[data-search]")];
  const emptyState = document.getElementById("searchEmpty");

  skillSearch.addEventListener("input", () => {
    const query = skillSearch.value.trim().toLowerCase();
    let visible = 0;

    skillCards.forEach((card) => {
      const matches = `${card.dataset.search} ${card.textContent}`.toLowerCase().includes(query);
      card.hidden = !matches;
      if (matches) visible += 1;
    });

    emptyState.hidden = visible > 0;
  });
}

const sourceVideo = document.getElementById("sourceVideo");
if (sourceVideo) {
  const momentButtons = [...document.querySelectorAll("[data-start][data-end]")];
  const momentStatus = document.getElementById("momentStatus");
  const videoSources = {
    "n4Cq4VaiFTw": {
      name: "Rick Macci Tennis",
      note: "Rick Macci with Dr. Brian Gordon",
      title: "The forehand video that changed tennis teaching",
      url: "https://www.youtube.com/watch?v=n4Cq4VaiFTw"
    }
  };

  function formatMoment(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  momentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const start = Number(button.dataset.start);
      const end = Number(button.dataset.end);
      const videoId = button.dataset.videoId;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return;
      const source = videoSources[videoId];
      if (!source) return;

      sourceVideo.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&start=${start}&end=${end}`;
      sourceVideo.title = `${source.name}: ${source.title}`;
      document.getElementById("sourceName").textContent = source.name;
      document.getElementById("sourceNote").textContent = source.note;
      document.getElementById("sourceLink").href = source.url;
      const selectedMoment = button.classList.contains("moment-link")
        ? button
        : momentButtons.find((item) => item.dataset.videoId === videoId && item.dataset.start === String(start));
      momentButtons.forEach((item) => item.classList.toggle("active", item === selectedMoment));
      momentStatus.textContent = `Video is cued to ${formatMoment(start)}`;
      document.getElementById("lessonPlayer").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

const lessonPlayerWrap = document.querySelector(".lesson-player-wrap");
const lessonMoments = document.querySelector(".lesson-moments");
const desktopLessonLayout = window.matchMedia("(min-width: 921px)");

function matchTimelineToVideo() {
  if (!lessonPlayerWrap || !lessonMoments) return;
  if (!desktopLessonLayout.matches) {
    lessonMoments.style.maxHeight = "";
    return;
  }

  const playerHeight = lessonPlayerWrap.getBoundingClientRect().height;
  if (playerHeight > 0) lessonMoments.style.maxHeight = `${Math.round(playerHeight)}px`;
}

if (lessonPlayerWrap && lessonMoments) {
  matchTimelineToVideo();
  new ResizeObserver(matchTimelineToVideo).observe(lessonPlayerWrap);
  desktopLessonLayout.addEventListener("change", matchTimelineToVideo);
}
