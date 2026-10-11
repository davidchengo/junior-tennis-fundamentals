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
    "LTgTLvvn7jQ": {
      name: "Patrick Mouratoglou",
      note: "Court lesson with student-athlete Francesca",
      title: "Full forehand lesson: timing, power, spin, and consistency",
      url: "https://www.youtube.com/watch?v=LTgTLvvn7jQ"
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
