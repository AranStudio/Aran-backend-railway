// routes/exportOptions.js

const formats = [
  { id: "pdf", label: "PDF", description: "Printable deck with tone frame, beats, and visuals." },
  { id: "json", label: "JSON", description: "Structured data for backups or integrations." },
  {
    id: "jpg",
    label: "JPG",
    description: "Single-image export using the tone frame or first available visual.",
  },
];

const detailSections = [
  { id: "prompt", label: "Prompt" },
  { id: "brief", label: "Brief" },
  { id: "toneImage", label: "Tone image" },
  { id: "beats", label: "Beats" },
  { id: "scenes", label: "Scenes" },
  { id: "shots", label: "Shots" },
  { id: "visuals", label: "Visuals" },
  { id: "storyboards", label: "Storyboards" },
  { id: "suggestions", label: "Suggestions" },
];

export default async function exportOptions(_req, res) {
  return res.json({ ok: true, formats, detailSections });
}
