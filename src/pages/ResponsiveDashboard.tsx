import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import MobileDashboard from "./MobileDashboard";

function phoneViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

export default function ResponsiveDashboard() {
  const [isPhone, setIsPhone] = useState(phoneViewport);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isPhone ? <MobileDashboard /> : <Dashboard />;
}
