const TOP100_URL = "data/players/top100-atp.json";
const H2H_URL = "data/battles/h2h-atp.json";

let players = [];
let h2hData = null;
let selectedSurface = "Overall";

const metrics = {
  winRate: "Win Rate",
  firstServePct: "1st Serve In",
  firstServeWonPct: "1st Serve Points Won",
  secondServeWonPct: "2nd Serve Points Won",
  breakPointConversionPct: "Break Point Conversion"
};

function pct(v) {
  return v == null ? "—" : `${v}%`;
}

function ageFromBirthDate(birthDate) {

  if (!birthDate) return null;

  const birth = new Date(`${birthDate}T00:00:00`);
  const today = new Date();

  let age =
    today.getFullYear() - birth.getFullYear();

  const monthDiff =
    today.getMonth() - birth.getMonth();

  if (
    monthDiff < 0 ||
    (
      monthDiff === 0 &&
      today.getDate() < birth.getDate()
    )
  ) {
    age--;
  }

  return age;
}

function heightLabel(heightCm) {

  if (!heightCm) return "Height unavailable";

  const totalInches =
    Math.round(heightCm / 2.54);

  const feet =
    Math.floor(totalInches / 12);

  const inches =
    totalInches % 12;

  return `${heightCm} cm · ${feet}'${inches}"`;
}

function identityHTML(profile) {

  const identity = profile.identity || {};
  const ranking = profile.ranking || {};

  const age =
    ageFromBirthDate(identity.birthDate);

  const details = [
    age != null ? `Age ${age}` : null,
    heightLabel(identity.heightCm),
    identity.handLabel || null
  ].filter(Boolean);

  const secondary = [
    identity.countryName || null,
    ranking.points != null
      ? `${ranking.points.toLocaleString()} pts`
      : null
  ].filter(Boolean);

  return `
    <span class="identity-main">
      <span class="flag">${identity.flag || "🌐"}</span>
      ${details.join(" · ")}
    </span>

    <span class="identity-secondary">
      ${secondary.join(" · ")}
    </span>
  `;
}

function matchupKey(a, b) {
  return [a, b].sort().join("|||");
}

async function getJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load ${url}`);
  }

  return response.json();
}

function fillSelector(select) {

  players.forEach(player => {

    const option = document.createElement("option");

    option.value = player.slug;
    option.textContent =
      `#${player.rank} ${player.name}`;

    select.appendChild(option);

  });

}

function playerBySlug(slug) {
  return players.find(p => p.slug === slug);
}

function updatePlayerInfo(selectId, infoId) {

  const player =
    playerBySlug(document.getElementById(selectId).value);

  document.getElementById(infoId).textContent =
    `${player.matches} matches · ${player.coverage} coverage`;

}

function metricCard(label, a, b, p1, p2) {

  return `
    <article class="metric-card">

      <h3>${label}</h3>

      <div class="metric-values">

        <div>
          <span>${p1.name}</span>
          <strong class="${a > b ? "edge" : ""}">
            ${pct(a)}
          </strong>
        </div>

        <div>
          <span>${p2.name}</span>
          <strong class="${b > a ? "edge" : ""}">
            ${pct(b)}
          </strong>
        </div>

      </div>

    </article>
  `;
}

function surfaceCard(surface, p1Profile, p2Profile) {

  const a = p1Profile.surfaces[surface];
  const b = p2Profile.surfaces[surface];

  if (!a || !b) return "";

  return `
    <article class="surface-card">

      <h3>${surface}</h3>

      <div class="metric-values">

        <div>
          <span>${p1Profile.name}</span>
          <strong class="${a.winRate > b.winRate ? "edge" : ""}">
            ${pct(a.winRate)}
          </strong>
        </div>

        <div>
          <span>${p2Profile.name}</span>
          <strong class="${b.winRate > a.winRate ? "edge" : ""}">
            ${pct(b.winRate)}
          </strong>
        </div>

      </div>

      <small>Surface win rate</small>

    </article>
  `;
}

function generatePaths(profile, opponentProfile) {

  const paths = [];

  if (
    profile.overall.firstServeWonPct >
    opponentProfile.overall.firstServeWonPct
  ) {
    paths.push(
      "Protect the first serve and use it to control the first attacking ball."
    );
  }

  if (
    profile.overall.secondServeWonPct >
    opponentProfile.overall.secondServeWonPct
  ) {
    paths.push(
      "Maintain second-serve effectiveness and avoid giving away easy return opportunities."
    );
  }

  if (
    profile.overall.breakPointConversionPct >
    opponentProfile.overall.breakPointConversionPct
  ) {
    paths.push(
      "Apply pressure in return games and capitalize on break-point opportunities."
    );
  }

  const surfaces =
    ["Hard", "Clay", "Grass"]
      .filter(s =>
        profile.surfaces[s] &&
        opponentProfile.surfaces[s]
      )
      .sort(
        (a, b) =>
          (
            profile.surfaces[b].winRate -
            opponentProfile.surfaces[b].winRate
          )
          -
          (
            profile.surfaces[a].winRate -
            opponentProfile.surfaces[a].winRate
          )
      );

  if (surfaces.length) {
    paths.push(
      `${surfaces[0]} provides the strongest historical surface profile relative to this opponent's baseline.`
    );
  }

  if (!paths.length) {
    paths.push(
      "Reduce unforced pressure and look for opportunities to disrupt the opponent's statistical strengths."
    );
  }

  return paths;
}


function renderBattlefield(profile1, profile2, p1, p2, matchup) {

  const summary =
    document.getElementById("battlefield-summary");

  const grid =
    document.getElementById("surface-battle");

  if (selectedSurface === "Overall") {

    summary.textContent =
      "Overall view uses each player's full 2024–2026 match sample.";

    grid.innerHTML =
      ["Hard", "Clay", "Grass"]
        .map(surface =>
          surfaceCard(surface, profile1, profile2)
        )
        .join("");

    return;
  }

  const a = profile1.surfaces[selectedSurface];
  const b = profile2.surfaces[selectedSurface];

  if (!a || !b) {
    summary.textContent =
      `Insufficient ${selectedSurface.toLowerCase()}-court data for this comparison.`;

    grid.innerHTML = "";
    return;
  }

  let h2hText =
    "No direct meetings on this surface during the analysis period.";

  if (
    matchup &&
    matchup.surfaces &&
    matchup.surfaces[selectedSurface]
  ) {

    const surfaceH2H =
      matchup.surfaces[selectedSurface];

    h2hText =
      `${p1.name} ${surfaceH2H[p1.name]} — ` +
      `${surfaceH2H[p2.name]} ${p2.name} ` +
      `in ${surfaceH2H.meetings} ${selectedSurface.toLowerCase()}-court meeting` +
      `${surfaceH2H.meetings === 1 ? "" : "s"}.`;
  }

  summary.textContent =
    `${selectedSurface} selected. ${h2hText}`;

  grid.innerHTML = `
    <article class="surface-card">
      <h3>${selectedSurface} Win Rate</h3>
      <div class="metric-values">
        <div>
          <span>${p1.name}</span>
          <strong class="${a.winRate > b.winRate ? "edge" : ""}">
            ${pct(a.winRate)}
          </strong>
        </div>
        <div>
          <span>${p2.name}</span>
          <strong class="${b.winRate > a.winRate ? "edge" : ""}">
            ${pct(b.winRate)}
          </strong>
        </div>
      </div>
    </article>

    <article class="surface-card">
      <h3>1st Serve Points Won</h3>
      <div class="metric-values">
        <div>
          <span>${p1.name}</span>
          <strong class="${a.firstServeWonPct > b.firstServeWonPct ? "edge" : ""}">
            ${pct(a.firstServeWonPct)}
          </strong>
        </div>
        <div>
          <span>${p2.name}</span>
          <strong class="${b.firstServeWonPct > a.firstServeWonPct ? "edge" : ""}">
            ${pct(b.firstServeWonPct)}
          </strong>
        </div>
      </div>
    </article>

    <article class="surface-card">
      <h3>2nd Serve Points Won</h3>
      <div class="metric-values">
        <div>
          <span>${p1.name}</span>
          <strong class="${a.secondServeWonPct > b.secondServeWonPct ? "edge" : ""}">
            ${pct(a.secondServeWonPct)}
          </strong>
        </div>
        <div>
          <span>${p2.name}</span>
          <strong class="${b.secondServeWonPct > a.secondServeWonPct ? "edge" : ""}">
            ${pct(b.secondServeWonPct)}
          </strong>
        </div>
      </div>
    </article>
  `;
}


function photoHTML(profile) {

  const image = profile.image;

  if (!image || !image.thumbnailUrl) {
    return `
      <div class="player-photo-fallback">
        🎾
      </div>
    `;
  }

  return `
    <img
      src="${image.thumbnailUrl}"
      alt="${profile.name}"
      loading="lazy"
    >
  `;
}

async function startBattle(shouldScroll = true) {

  const error =
    document.getElementById("battle-error");

  error.textContent = "";

  const p1 =
    playerBySlug(
      document.getElementById("player1").value
    );

  const p2 =
    playerBySlug(
      document.getElementById("player2").value
    );

  if (p1.slug === p2.slug) {
    error.textContent =
      "Choose two different players.";
    return;
  }

  const [profile1, profile2] =
    await Promise.all([
      getJSON(p1.profile),
      getJSON(p2.profile)
    ]);

  document.getElementById("p1-name").textContent =
    p1.name;

  document.getElementById("p2-name").textContent =
    p2.name;

  document.getElementById("p1-rank").textContent =
    `ATP #${p1.rank}`;

  document.getElementById("p2-rank").textContent =
    `ATP #${p2.rank}`;

  document.getElementById("p1-identity").innerHTML =
    identityHTML(profile1);

  document.getElementById("p2-identity").innerHTML =
    identityHTML(profile2);

  document.getElementById("p1-photo").innerHTML =
    photoHTML(profile1);

  document.getElementById("p2-photo").innerHTML =
    photoHTML(profile2);

  const key = matchupKey(p1.name, p2.name);

  const matchup =
    h2hData.matchups[key];

  if (matchup) {

    document.getElementById("p1-wins").textContent =
      matchup.wins[p1.name];

    document.getElementById("p2-wins").textContent =
      matchup.wins[p2.name];

    document.getElementById("meeting-count").textContent =
      `${matchup.meetings} meetings · 2024–2026`;

    document.getElementById("matchup-message").textContent =
      `These statistics show how each player's performance changed when facing this specific opponent.`;

    document.getElementById("matchup-metrics").innerHTML =
      Object.entries(metrics)
        .map(([key, label]) =>
          metricCard(
            label,
            matchup.matchupMetrics[p1.name][key],
            matchup.matchupMetrics[p2.name][key],
            p1,
            p2
          )
        )
        .join("");

  } else {

    document.getElementById("p1-wins").textContent = "—";
    document.getElementById("p2-wins").textContent = "—";

    document.getElementById("meeting-count").textContent =
      "No meetings in this analysis period";

    document.getElementById("matchup-message").textContent =
      "These players did not meet in the 2024–2026 dataset. The comparison is based on their overall and surface performance.";

    document.getElementById("matchup-metrics").innerHTML = "";

  }

  document.getElementById("overall-metrics").innerHTML =
    Object.entries(metrics)
      .map(([key, label]) =>
        metricCard(
          label,
          profile1.overall[key],
          profile2.overall[key],
          p1,
          p2
        )
      )
      .join("");

  renderBattlefield(
    profile1,
    profile2,
    p1,
    p2,
    matchup
  );

  const paths1 =
    generatePaths(profile1, profile2);

  const paths2 =
    generatePaths(profile2, profile1);

  document.getElementById("p1-path-title").textContent =
    p1.name;

  document.getElementById("p2-path-title").textContent =
    p2.name;

  document.getElementById("p1-path").innerHTML =
    paths1.map(x => `<li>${x}</li>`).join("");

  document.getElementById("p2-path").innerHTML =
    paths2.map(x => `<li>${x}</li>`).join("");

  document
    .getElementById("battle-results")
    .classList.remove("hidden");

  if (shouldScroll) {
    document
      .getElementById("battle-results")
      .scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  }
}

async function init() {

  [players, h2hData] =
    await Promise.all([
      getJSON(TOP100_URL),
      getJSON(H2H_URL)
    ]);

  const p1 =
    document.getElementById("player1");

  const p2 =
    document.getElementById("player2");

  fillSelector(p1);
  fillSelector(p2);

  // Default featured battle.
  p1.value = "jannik-sinner";
  p2.value = "carlos-alcaraz";

  updatePlayerInfo(
    "player1",
    "player1-info"
  );

  updatePlayerInfo(
    "player2",
    "player2-info"
  );

  p1.addEventListener(
    "change",
    () =>
      updatePlayerInfo(
        "player1",
        "player1-info"
      )
  );

  p2.addEventListener(
    "change",
    () =>
      updatePlayerInfo(
        "player2",
        "player2-info"
      )
  );

  document
    .getElementById("start-battle")
    .addEventListener(
      "click",
      startBattle
    );

  document
    .querySelectorAll(".battlefield-button")
    .forEach(button => {

      button.addEventListener("click", async () => {

        selectedSurface = button.dataset.surface;

        document
          .querySelectorAll(".battlefield-button")
          .forEach(b => b.classList.remove("active"));

        button.classList.add("active");

        if (
          !document
            .getElementById("battle-results")
            .classList.contains("hidden")
        ) {
          await startBattle(false);
        }

      });

    });

  // Automatically show the featured Sinner vs Alcaraz battle
  // without changing the user's scroll position.
  await startBattle(false);
}

init().catch(error => {
  console.error(error);

  document.getElementById("battle-error").textContent =
    "Pro Lab data could not be loaded.";
});
