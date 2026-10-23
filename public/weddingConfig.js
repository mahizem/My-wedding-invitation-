// ============================================================
//  EDIT YOUR WEDDING INFORMATION HERE (the only file you need)
// ============================================================
export const weddingConfig = {
  // Names (shown exactly as written)
  groom: "ካፒቴን አበበ አለማየሁ",
  bride: "ኢንጂነር ማሕሌት አዱኛ",
  groomShort: "Abe", // used in English headings / calendar title. Edit freely.
  brideShort: "Mahi",

  // Date & time (Gregorian, for countdown + calendar). 15 Nov 2026 = ኅዳር 6 /2019 ዓ.ም
  date: "2026-11-15", // YYYY-MM-DD
  time: "12:00", // 24-hour clock. 18:00 = 12:00 ሰዐት (evening) in Ethiopian time
  timezoneOffset: "+03:00", // Ethiopia (East Africa Time)
  durationHours: 5, // length of the event in the calendar file
  dateLabelEnglish: "Sunday, 15 November 2026 · 12:00 PM",
  dateLabelAmharic: "እሁድ ኅዳር 6 /2019 ዓ.ም · ከቀኑ 6:00 ሰዐት",

  // Venue / map. Fill in what you know; leave "" for the rest (nothing is invented).
  venue: {
    name: "", // e.g. "Our family home"  (optional)
    address: "ሰሚት አትሌቶች መንደር",
    latitude: "", // e.g. "9.0123"  (right-click your place in Google Maps to copy)
    longitude: "", // e.g. "38.7456"
    googleMapsUrl: "https://maps.app.goo.gl/mojBvuwjLwSWHECGA?g_st=ic", // paste a "Share" link from Google Maps (best option)
  },
  phone: "0946276471",
  phoneLink: "+251946276471",
  phone: "0922337855",
  phoneLink: "+251922337855",

  // Music: put your mp3 in  public/music/  and change the file name here.
  music: "/leyekunu.mp3",

  // Our Story: replace the placeholders with your own text (nothing is invented).
  story: [
    {
      title: "How We Met",
      text: "It started in collage, where I may or may not have been a little scared of him.",
    },
    {
      title: "Our Journey",
      text: "Life had its own plans for us, and our journy came with a few plot twists along the way. But through the ups, the downs, and everything in between, we kept seeing God's hand in our story. And somehow, thoes two college students ended up here choosing each other for a lifetime.",
    },
    {
      title:
        "THE BEGINNING WAS COLLEGE. THE PLOT TWISTS WERE MANY. THE ENDING ? FOREVER.💗 ",
    },
  ],
};
// QR code destination. Automatically uses the website's real address. Do NOT hard-code localhost.
export const photoUploadUrl = `${window.location.origin}/photos`;
