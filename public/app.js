import { weddingConfig as C, photoUploadUrl } from "/weddingConfig.js";
import { weddingProgram } from "/weddingProgram.js";
const $ = (s) => document.querySelector(s),
  el = (t, p = {}, kids = []) => {
    const e = document.createElement(t);
    Object.assign(e, p);
    kids.forEach((k) => e.append(k));
    return e;
  };
const when = new Date(`${C.date}T${C.time}:00${C.timezoneOffset}`); // the ONE event moment used everywhere
const mapQuery = [C.venue.name, C.venue.address].filter(Boolean).join(", ");
const hasCoords = C.venue.latitude && C.venue.longitude;

// ---------- names ----------
$("#gGroom").textContent = C.groom;
$("#gBride").textContent = C.bride;
$("#tGroom").textContent = C.groom;
$("#tBride").textContent = C.bride;
$("#navNames").textContent = `${C.groomShort} & ${C.brideShort}`;
$("#fNames").textContent = `${C.groom} · ${C.bride}`;
$("#dateLbl").textContent = `${C.dateLabelEnglish}`;

// ---------- music (one <audio>, never restarted) ----------
const audio = $("#audio"),
  mb = $("#music"),
  note = $("#musicNote");
audio.src = C.music; // replace file in /public/music + weddingConfig.js
const setIcon = () => (mb.textContent = audio.paused ? "🔇" : "🔊");
async function playMusic() {
  try {
    await audio.play();
    note.style.display = "none";
  } catch (e) {
    if (e.name === "NotSupportedError") {
      mb.classList.remove("on");
      note.style.display = "none";
      return;
    }
    /* no/unsupported music file: hide control */ note.textContent =
      "🔊 Tap the button to play music";
    note.style.display = "block";
  }
  setIcon();
}
mb.onclick = () => {
  audio.paused ? playMusic() : audio.pause();
  setIcon();
};
audio.onerror = () => {
  mb.classList.remove("on");
  note.style.display = "none";
}; // no music file yet: hide control quietly
$("#openBtn").onclick = () => {
  $("#gate").classList.add("gone");
  document.body.classList.remove("lock");
  mb.classList.add("on");
  playMusic();
  $("#particles").style.display = "none";
};

// ---------- nav ----------
$("#burger").onclick = () => $("#menu").classList.toggle("open");
$("#menu").onclick = (e) => {
  if (e.target.tagName === "A") $("#menu").classList.remove("open");
};
const revealObs = new IntersectionObserver(
  (es, o) =>
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        o.unobserve(e.target);
      }
    }),
  { threshold: 0.1 }
);
const observe = () =>
  document
    .querySelectorAll(".reveal:not(.in)")
    .forEach((n) => revealObs.observe(n));
observe();

// ---------- countdown ----------
const cd = $("#cd");
function tick() {
  const x = when - Date.now();
  if (x <= 0) {
    cd.className = "today reveal in";
    cd.textContent = "Today is the day! Welcome to our celebration.";
    return;
  }
  const v = [
    ["Days", x / 864e5],
    ["Hours", (x % 864e5) / 36e5],
    ["Minutes", (x % 36e5) / 6e4],
    ["Seconds", (x % 6e4) / 1e3],
  ];
  cd.replaceChildren(
    ...v.map(([l, n]) =>
      el("div", {}, [
        el("strong", { textContent: String(Math.floor(n)).padStart(2, "0") }),
        el("span", { textContent: l }),
      ])
    )
  );
}
tick();
setInterval(tick, 1000);

// ---------- story / program ----------
$("#storyBox").replaceChildren(
  ...C.story.map((s) =>
    el("div", { className: "card reveal" }, [
      el("h3", { textContent: s.title }),
      el("p", { textContent: s.text }),
    ])
  )
);
$("#tl").replaceChildren(
  ...weddingProgram.map((e) =>
    el("div", { className: "ev reveal" }, [
      el("small", { textContent: e.time }),
      el("h3", { textContent: `${e.icon} ${e.title}` }),
      el("p", { textContent: e.description }),
    ])
  )
);

// ---------- location ----------     https://maps.app.goo.gl/mojBvuwjLwSWHECGA?g_st=ic
const dirUrl =
  C.venue.googleMapsUrl ||
  (hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${C.venue.latitude},${C.venue.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        mapQuery
      )}`);
const loc = $("#locBox");
if (C.venue.name)
  loc.append(
    el("h3", {
      textContent: C.venue.name,
      style: "font-family:var(--serif);font-size:26px;margin:0 0 6px",
    })
  );
loc.append(
  el("p", {
    className: "am",
    textContent: `📍 ${C.venue.address}`,
    style: "font-weight:700;font-size:18px",
  })
);
if (hasCoords)
  loc.append(
    el("iframe", {
      className: "map",
      loading: "lazy",
      title: "Map",
      src: `https://www.google.com/maps?q=${C.venue.latitude},${C.venue.longitude}&z=16&output=embed`,
    })
  );
loc.append(
  el("div", { className: "row" }, [
    el("a", {
      className: "btn",
      href: dirUrl,
      target: "_blank",
      rel: "noopener",
      textContent: "🧭 Get Directions",
    }),
    el("a", {
      className: "btn alt",
      href: `tel:${C.phoneLink}`,
      textContent: `📞 ${C.phone}`,
    }),
  ])
);
if (!hasCoords)
  console.info(
    "Add latitude/longitude in weddingConfig.js to show an exact map pin."
  );

// ---------- save the date ----------

(() => {
  const [Y, M, D] = C.date.split("-").map(Number);

  // Parse the configured wedding date as a local calendar date.
  const weddingDate = new Date(Y, M - 1, D);

  // ---------- Gregorian calendar ----------
  const gregorianContainer = document.querySelector("#cal");
  gregorianContainer.replaceChildren();

  const gregorianHeading = document.createElement("h4");
  gregorianHeading.textContent = weddingDate.toLocaleDateString("en", {
    month: "long",
    year: "numeric",
  });

  const gregorianGrid = document.createElement("div");
  gregorianGrid.className = "g";

  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((day) => {
    const cell = document.createElement("b");
    cell.textContent = day;
    gregorianGrid.appendChild(cell);
  });

  const gregorianFirst = new Date(Y, M - 1, 1).getDay();
  const gregorianDays = new Date(Y, M, 0).getDate();

  for (let i = 0; i < gregorianFirst; i++) {
    gregorianGrid.appendChild(document.createElement("span"));
  }

  for (let day = 1; day <= gregorianDays; day++) {
    const cell = document.createElement("span");
    cell.textContent = day;

    if (day === D) {
      cell.classList.add("hit");
      cell.title = "Wedding day";
    }

    gregorianGrid.appendChild(cell);
  }

  gregorianContainer.append(gregorianHeading, gregorianGrid);

  // ---------- Ethiopian calendar ----------
  const ethiopianMonths = [
    "መስከረም",
    "ጥቅምት",
    "ኅዳር",
    "ታኅሣሥ",
    "ጥር",
    "የካቲት",
    "መጋቢት",
    "ሚያዝያ",
    "ግንቦት",
    "ሰኔ",
    "ሐምሌ",
    "ነሐሴ",
    "ጳጉሜ",
  ];

  const ethiopianWeekdays = ["እሑድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];

  function gregorianLeap(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  // Ethiopian New Year falls on September 11 or 12.
  function ethiopianNewYear(year) {
    const gregorianYear = year + 7;
    const septemberDay = gregorianLeap(gregorianYear + 1) ? 12 : 11;
    return new Date(Date.UTC(gregorianYear, 8, septemberDay));
  }

  function toEthiopian(date) {
    const gregorianDate = Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    let year = date.getFullYear() - 7;

    if (gregorianDate < ethiopianNewYear(year).getTime()) {
      year--;
    } else if (gregorianDate >= ethiopianNewYear(year + 1).getTime()) {
      year++;
    }

    const start = ethiopianNewYear(year).getTime();
    const dayOffset = Math.round((gregorianDate - start) / 86400000);

    return {
      year,
      month: Math.floor(dayOffset / 30) + 1,
      day: (dayOffset % 30) + 1,
    };
  }

  function ethiopianLeap(year) {
    return year % 4 === 3;
  }

  function ethiopianMonthStart(year, month) {
    return new Date(
      ethiopianNewYear(year).getTime() + (month - 1) * 30 * 86400000
    );
  }

  const ethDate = toEthiopian(weddingDate);
  const ethContainer = document.querySelector("#ethiopian-cal");
  ethContainer.replaceChildren();

  const ethHeading = document.createElement("h4");
  ethHeading.textContent = `${ethiopianMonths[ethDate.month - 1]} ${
    ethDate.year
  } ዓ.ም.`;

  const ethGrid = document.createElement("div");
  ethGrid.className = "g";

  ethiopianWeekdays.forEach((day) => {
    const cell = document.createElement("b");
    cell.textContent = day;
    cell.title = day;
    ethGrid.appendChild(cell);
  });

  const start = ethiopianMonthStart(ethDate.year, ethDate.month);
  const firstWeekday = start.getUTCDay();
  const daysInMonth =
    ethDate.month <= 12 ? 30 : ethiopianLeap(ethDate.year) ? 6 : 5;

  for (let i = 0; i < firstWeekday; i++) {
    ethGrid.appendChild(document.createElement("span"));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("span");
    cell.textContent = day;

    if (day === ethDate.day) {
      cell.classList.add("hit");
      cell.title = "የሠርጉ ቀን";
    }

    ethGrid.appendChild(cell);
  }

  ethContainer.append(ethHeading, ethGrid);

  const ethNote = document.createElement("p");
  ethNote.className = "ethiopian-date-note";
  ethNote.textContent =
    `የሠርጉ ቀን፦ ${ethiopianMonths[ethDate.month - 1]} ` +
    `${ethDate.day} ቀን ${ethDate.year} ዓ.ም.`;

  ethContainer.appendChild(ethNote);
})();

// ---------- photo upload (compress on phone -> real API) ----------
let picked = [];
const thumbs = $("#thumbs");
const draw = () =>
  thumbs.replaceChildren(
    ...picked.map((f, i) =>
      el("div", {}, [
        el("img", { src: f.url, alt: "" }),
        el("button", {
          type: "button",
          textContent: "×",
          ariaLabel: "Remove",
          onclick: () => {
            URL.revokeObjectURL(f.url);
            picked.splice(i, 1);
            draw();
          },
        }),
      ])
    )
  );
$("#files").onchange = (e) => {
  [...e.target.files].forEach(
    (f) =>
      f.type.startsWith("image/") &&
      picked.length < 20 &&
      picked.push({ file: f, url: URL.createObjectURL(f) })
  );
  e.target.value = "";
  draw();
};
const compress = (file) =>
  new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height)),
        c = el("canvas", {
          width: Math.round(img.width * s),
          height: Math.round(img.height * s),
        });
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => no(new Error("unreadable"));
    img.src = URL.createObjectURL(file);
  });
const post = async (u, data) => {
  const r = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong");
  return j;
};
const say = (id, t, ok) => {
  const m = $(id);
  m.textContent = t;
  m.className = "msg " + (ok ? "ok" : "err");
};
$("#photoForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!picked.length) return say("#pmsg", "Please choose at least one photo.");
  const bar = $("#bar");
  bar.style.display = "block";
  let done = 0,
    fail = 0;
  for (const f of [...picked]) {
    try {
      await post("/api/photos", {
        image: await compress(f.file),
        name: $("#pn").value,
        message: $("#pm").value,
      });
      done++;
    } catch {
      fail++;
    }
    bar.firstChild.style.width = `${((done + fail) / picked.length) * 100}%`;
  }
  picked.forEach((f) => URL.revokeObjectURL(f.url));
  picked = [];
  draw();
  bar.style.display = "none";
  bar.firstChild.style.width = 0;
  say(
    "#pmsg",
    fail
      ? `${done} sent, ${fail} failed. Please try again.`
      : `Thank you! ${done} photo${
          done > 1 ? "s" : ""
        } sent. They will appear after approval.`,
    !fail
  );
};

// ---------- QR (always uses the live site address) ----------
let qrOk = false;
const qrBox = $("#qr");
addEventListener("load", () => {
  if (window.QRCode) {
    new QRCode(qrBox, {
      text: photoUploadUrl,
      width: 240,
      height: 240,
      correctLevel: QRCode.CorrectLevel.H,
    });
    qrOk = true;
  } else qrBox.textContent = "QR needs an internet connection to load.";
});
$("#qrDl").onclick = () => {
  const src = qrBox.querySelector("canvas");
  if (!qrOk || !src) return;
  const c = el("canvas", { width: 1200, height: 1200 }),
    x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, 1200, 1200);
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 100, 100, 1000, 1000);
  el("a", {
    href: c.toDataURL("image/png"),
    download: "photo-upload-qr.png",
  }).click();
};

// ---------- gallery + lightbox ----------
let pics = [],
  cur = 0;
const lb = $("#lb"),
  show = (i) => {
    cur = (i + pics.length) % pics.length;
    lb.querySelector("img").src = pics[cur].url;
  };
async function loadGallery() {
  try {
    pics = await (await fetch("/api/photos")).json();
  } catch {
    pics = [];
  }
  $("#galEmpty").style.display = pics.length ? "none" : "block";
  $("#gal").replaceChildren(
    ...pics.map((p, i) =>
      el("img", {
        src: p.url,
        alt: p.guest_name ? `Photo by ${p.guest_name}` : "Wedding photo",
        loading: "lazy",
        decoding: "async",
        onclick: () => {
          show(i);
          lb.classList.add("on");
        },
      })
    )
  );
}
$("#lbX").onclick = () => lb.classList.remove("on");
$("#lbP").onclick = () => show(cur - 1);
$("#lbN").onclick = () => show(cur + 1);
addEventListener("keydown", (e) => {
  if (!lb.classList.contains("on")) return;
  if (e.key === "Escape") lb.classList.remove("on");
  if (e.key === "ArrowLeft") show(cur - 1);
  if (e.key === "ArrowRight") show(cur + 1);
});

// ---------- wishes ----------
async function loadWishes() {
  let w = [];
  try {
    w = await (await fetch("/api/wishes")).json();
  } catch {}
  $("#wishList").replaceChildren(
    ...w.map((x) =>
      el("div", { className: "wish" }, [
        el("p", { textContent: `“${x.message}”` }),
        el("b", { textContent: `— ${x.name}  ✦` }),
      ])
    )
  );
}
$("#wishForm").onsubmit = async (e) => {
  e.preventDefault();
  const n = $("#wn").value.trim(),
    t = $("#wt").value.trim();
  if (!n || !t) return say("#wmsg", "Please enter your name and wish.");
  try {
    await post("/api/wishes", { name: n, message: t });
    e.target.reset();
    say("#wmsg", "Thank you! Your wish will appear once approved.", true);
  } catch (er) {
    say("#wmsg", er.message);
  }
};

// ---------- RSVP ----------
$("#rg").replaceChildren(
  ...Array.from({ length: 10 }, (_, i) =>
    el("option", { value: i + 1, textContent: i + 1 })
  )
);
$("#rsvpForm").onsubmit = async (e) => {
  e.preventDefault();
  const a = document.querySelector("input[name=att]:checked");
  try {
    await post("/api/rsvp", {
      name: $("#rn").value,
      guests: +$("#rg").value,
      attending: a?.value === "yes",
      message: $("#rm").value,
    });
    e.target.reset();
    say(
      "#rmsg",
      a.value === "yes"
        ? "Thank you! We can't wait to celebrate with you."
        : "Thank you for letting us know. You will be missed.",
      true
    );
  } catch (er) {
    say("#rmsg", er.message);
  }
};
observe();
loadGallery();
loadWishes();

// ---------- gold particles (stops after the gate opens) ----------
(() => {
  const c = $("#particles"),
    x = c.getContext("2d");
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return c.remove();
  const f = () => {
    c.width = innerWidth;
    c.height = innerHeight;
  };
  f();
  addEventListener("resize", f);
  const P = Array.from({ length: 36 }, () => ({
    x: Math.random() * c.width,
    y: Math.random() * c.height,
    r: Math.random() * 2 + 0.6,
    v: Math.random() * 0.4 + 0.15,
    a: Math.random(),
  }));
  (function loop() {
    if (c.style.display === "none") return;
    x.clearRect(0, 0, c.width, c.height);
    P.forEach((p) => {
      p.y -= p.v;
      p.a += 0.02;
      if (p.y < -5) {
        p.y = c.height + 5;
        p.x = Math.random() * c.width;
      }
      x.fillStyle = `rgba(255,236,170,${0.35 + Math.sin(p.a) * 0.3})`;
      x.beginPath();
      x.arc(p.x, p.y, p.r, 0, 7);
      x.fill();
    });
    requestAnimationFrame(loop);
  })();
})();
