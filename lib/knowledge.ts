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
