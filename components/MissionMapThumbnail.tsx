import { googleMapsPlaceUrl, googleMapsSatelliteEmbedUrl } from "@/lib/googleMaps";

export default function MissionMapThumbnail({ location }: { location: string }) {
  return <a href={googleMapsPlaceUrl(location)} target="_blank" rel="noreferrer" aria-label={`Open satellite map of ${location}`} style={{ position: "relative", display: "block", width: 156, height: 94, flex: "0 0 156px", overflow: "hidden", borderRadius: 10, border: "1px solid rgba(95,107,122,.22)", background: "#D7DEE6" }} onClick={(event) => event.stopPropagation()}>
    <iframe src={googleMapsSatelliteEmbedUrl(location)} title={`Satellite view of ${location}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" tabIndex={-1} aria-hidden="true" style={{ width: "100%", height: "100%", border: 0, pointerEvents: "none" }} />
    <span style={{ position: "absolute", left: 6, bottom: 6, padding: "3px 6px", borderRadius: 5, background: "rgba(7,17,31,.82)", color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase" }}>Satellite ↗</span>
  </a>;
}
