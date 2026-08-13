export const domKnowledge = {
  organization: {
    name: "Drone Operation Management",
    alternateName: "DOM",
    url: "https://droneopsman.com",
    description:
      "Commercial drone operations, aerial intelligence, mapping, inspection, documentation, and data deliverables for commercial, infrastructure, construction, energy, and public-sector programs.",
  },
  services: [
    {
      slug: "aerial-photography",
      name: "Aerial Cinematography & Photography",
      description:
        "Professional aerial video and photography for commercial property, marketing, facilities, events, and documentation.",
    },
    {
      slug: "mapping-surveying",
      name: "Mapping & Surveying Support",
      description:
        "Orthomosaic mapping, 3D modeling, topographic data capture, and volumetric measurement for engineering, planning, construction, and land workflows.",
    },
    {
      slug: "infrastructure-inspection",
      name: "Infrastructure Inspection",
      description:
        "Aerial visual inspection and documentation for rooftops, buildings, towers, utilities, corridors, and infrastructure assets.",
    },
    {
      slug: "thermal-multispectral",
      name: "Thermal & Multispectral Imaging",
      description:
        "Specialized aerial sensor capture for energy, solar, agriculture, and building-envelope analysis when mission equipment and conditions support it.",
    },
    {
      slug: "construction-monitoring",
      name: "Construction Site Monitoring",
      description:
        "Recurring aerial capture for progress tracking, stakeholder reporting, comparison imagery, and as-built documentation.",
    },
    {
      slug: "data-analytics",
      name: "Aerial Data & Analytics Deliverables",
      description:
        "Processed deliverables including orthomosaics, GIS-ready data, point clouds, meshes, measurements, imagery, and structured reports.",
    },
    {
      slug: "mission-compliance",
      name: "Mission Documentation & Compliance",
      description:
        "Documented commercial drone operations including mission planning, airspace review, risk assessment, flight records, and delivery documentation.",
    },
  ],
  industries: [
    "Construction",
    "Commercial Real Estate",
    "Infrastructure",
    "Utilities",
    "Energy",
    "Engineering",
    "Land & Site Development",
    "Public Sector",
    "Facilities & Asset Management",
  ],
  equipment: [
    {
      slug: "dji-matrice-4e",
      name: "DJI Matrice 4E",
      category: "Enterprise mapping and inspection aircraft",
      uses: ["Photogrammetry", "Orthomosaic mapping", "3D reconstruction", "Site documentation", "Visual inspection"],
      note: "Mission configuration, positioning workflow, and deliverables are selected according to project requirements.",
    },
  ],
  serviceAreas: [
    {
      slug: "delaware-county-pa",
      name: "Delaware County, Pennsylvania",
      region: "Southeastern Pennsylvania",
      description: "DOM's home-region commercial drone service area for mapping, inspection, documentation, and aerial data missions.",
    },
    {
      slug: "greater-philadelphia",
      name: "Greater Philadelphia",
      region: "Pennsylvania",
      description: "Commercial drone missions in the Greater Philadelphia region are scoped according to site, airspace, safety, and project requirements.",
    },
    {
      slug: "southeastern-pennsylvania",
      name: "Southeastern Pennsylvania",
      region: "Pennsylvania",
      description: "Regional aerial operations for commercial properties, construction, infrastructure, facilities, and land projects.",
    },
  ],
  deliverables: [
    "High-resolution aerial imagery",
    "Orthomosaic maps",
    "3D models and meshes",
    "Point clouds",
    "GIS-ready data",
    "Volumetric measurements",
    "Inspection documentation",
    "Progress comparison imagery",
    "Structured mission reports",
  ],
  faqs: [
    {
      question: "What commercial drone services does Drone Operation Management provide?",
      answer: "DOM provides aerial mapping, photogrammetry, visual inspection, construction progress documentation, aerial photography, 3D reconstruction, data deliverables, and documented mission operations. Specialized sensor work is offered when the required equipment and mission conditions support it.",
    },
    {
      question: "Can DOM create an orthomosaic or 3D model of a property or job site?",
      answer: "Yes. DOM can capture overlapping aerial imagery for photogrammetry workflows that produce orthomosaics, point clouds, meshes, 3D models, and related site documentation when the site and mission are suitable.",
    },
    {
      question: "Can drone mapping replace a licensed land survey?",
      answer: "Drone mapping can provide valuable measurements, imagery, models, and site data, but it does not automatically replace work that legally requires a licensed professional land surveyor. DOM scopes deliverables according to the intended use of the data.",
    },
    {
      question: "Can DOM document construction progress over time?",
      answer: "Yes. DOM can perform recurring flights using consistent capture plans to create progress imagery, comparison views, maps, models, and project documentation across a construction timeline.",
    },
    {
      question: "Can drones inspect roofs and exterior building areas?",
      answer: "Drones can capture detailed visual imagery of many roofs and exterior building areas while reducing the need to place personnel in difficult access locations. The appropriate inspection method depends on the building, site, airspace, and requested findings.",
    },
    {
      question: "How accurate is drone mapping?",
      answer: "Accuracy depends on aircraft positioning, flight altitude, image overlap, camera characteristics, processing, ground control or checkpoints when used, and site conditions. DOM selects the capture and control workflow based on the accuracy the project actually requires.",
    },
    {
      question: "Where does Drone Operation Management operate?",
      answer: "DOM is based in Delaware County and serves commercial projects across the Greater Philadelphia and Southeastern Pennsylvania region, with broader missions considered according to project and operational requirements.",
    },
  ],
  glossary: [
    ["Orthomosaic", "A geometrically corrected aerial map assembled from overlapping drone imagery."],
    ["Photogrammetry", "The process of deriving measurements and 3D information from overlapping photographs."],
    ["RTK", "Real-Time Kinematic positioning used to improve the positional accuracy of geotagged aerial data."],
    ["GCP", "Ground Control Point: a surveyed reference point used to improve or verify mapping accuracy."],
    ["GSD", "Ground Sample Distance: the real-world ground size represented by one image pixel."],
    ["Point cloud", "A collection of 3D points representing the shape and surface of a site or object."],
    ["DSM", "Digital Surface Model: an elevation model that includes buildings, vegetation, and other surface features."],
    ["FAA Part 107", "The primary U.S. regulatory framework governing many commercial small-drone operations."],
  ],
} as const;

export type DomKnowledge = typeof domKnowledge;
