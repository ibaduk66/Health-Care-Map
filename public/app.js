const map = L.map("map").setView([33.6844, 73.0479], 10.8);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19
}).addTo(map);

const statusBox = document.getElementById("status");
const districtFilter = document.getElementById("district-filter");
const facilityFilter = document.getElementById("facility-filter");
const searchInput = document.getElementById("search-input");
const refreshButton = document.getElementById("refresh-button");
const summaryBox = document.getElementById("facility-summary");
const facilityForm = document.getElementById("facility-form");

let facilityLayer = null;
let facilityRecords = [];

function getMarkerColor(facilityType) {
  switch (facilityType) {
    case "Hospital":
      return "#b42318";
    case "Clinic":
      return "#1976d2";
    case "Diagnostic Center":
      return "#5b8def";
    default:
      return "#2e7d32";
  }
}

function renderSummary(feature) {
  if (!feature) {
    summaryBox.innerHTML = "Choose a point on the map.";
    return;
  }

  const properties = feature.properties;
  summaryBox.innerHTML = `
    <strong>${properties.facility_name}</strong><br>
    ${properties.facility_type}<br>
    ${properties.district}<br>
    ${properties.location_name || "Location not recorded"}<br>
    ${properties.address_text || "Address unavailable"}
  `;
}

function buildSelectOptions() {
  const districts = [...new Set(facilityRecords.map((item) => item.properties.district).filter(Boolean))].sort();
  const types = [...new Set(facilityRecords.map((item) => item.properties.facility_type).filter(Boolean))].sort();

  districtFilter.innerHTML = '<option value="All">All</option>' + districts.map((district) => `<option value="${district}">${district}</option>`).join("");
  facilityFilter.innerHTML = '<option value="All">All</option>' + types.map((type) => `<option value="${type}">${type}</option>`).join("");
}

function filterVisibleFeatures() {
  const districtValue = districtFilter.value;
  const typeValue = facilityFilter.value;
  const searchValue = searchInput.value.trim().toLowerCase();

  if (!facilityLayer) {
    return;
  }

  facilityLayer.eachLayer((layer) => {
    const properties = layer.feature.properties;
    const matchesDistrict = districtValue === "All" || properties.district === districtValue;
    const matchesType = typeValue === "All" || properties.facility_type === typeValue;
    const matchesSearch = !searchValue || [properties.facility_name, properties.district, properties.location_name, properties.address_text]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(searchValue);

    const shouldShow = matchesDistrict && matchesType && matchesSearch;
    layer.setStyle({ opacity: shouldShow ? 1 : 0.15, fillOpacity: shouldShow ? 0.8 : 0.12 });
    if (shouldShow) {
      layer.bringToFront();
    }
  });
}

function renderFacilities(geojson) {
  if (facilityLayer) {
    map.removeLayer(facilityLayer);
  }

  facilityLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const color = getMarkerColor(feature.properties.facility_type);
      return L.circleMarker(latlng, {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2
      });
    },
    onEachFeature: (feature, layer) => {
      const properties = feature.properties;
      const emergencyText = properties.emergency ? "Emergency available" : "Emergency not marked";
      const servicesText = properties.services ? `<br>Services: ${properties.services}` : "";

      layer.bindPopup(`
        <div class="popup-header">${properties.facility_name}</div>
        <div>${properties.facility_type} • ${properties.district}</div>
        <div>${properties.location_name || "Location unspecified"}</div>
        <div>${properties.address_text}</div>
        <div>${emergencyText}</div>
        <div>Phone: ${properties.phone || "Not listed"}</div>
        ${servicesText}
      `);

      layer.on("click", () => renderSummary(feature));
    }
  }).addTo(map);

  facilityRecords = geojson.features || [];
  buildSelectOptions();
  filterVisibleFeatures();

  if (facilityRecords.length > 0) {
    map.fitBounds(facilityLayer.getBounds(), { padding: [25, 25] });
  }

  statusBox.textContent = `Loaded ${facilityRecords.length} facility records from PostGIS.`;
}

async function fetchFacilities() {
  statusBox.textContent = "Loading facility records…";
  const district = districtFilter.value;
  const facilityType = facilityFilter.value;
  const searchTerm = searchInput.value.trim();

  const query = new URLSearchParams();
  if (district && district !== "All") query.set("district", district);
  if (facilityType && facilityType !== "All") query.set("facility_type", facilityType);
  if (searchTerm) query.set("q", searchTerm);

  try {
    const response = await fetch(`/api/facilities?${query.toString()}`);
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to load facility data.");
    }

    const geojson = await response.json();
    renderFacilities(geojson);
  } catch (error) {
    console.error(error);
    statusBox.textContent = "Unable to load facilities. Check PostgreSQL/PostGIS connection.";
  }
}

function resetForm() {
  facilityForm.reset();
  document.getElementById("facility-id").value = "";
  document.getElementById("facility-type").value = "Hospital";
  document.getElementById("district").value = "Islamabad";
  document.getElementById("emergency").value = "false";
}

facilityForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    facility_name: document.getElementById("facility-name").value,
    facility_type: document.getElementById("facility-type").value,
    district: document.getElementById("district").value,
    location_name: document.getElementById("location-name").value,
    address_text: document.getElementById("address-text").value,
    phone: document.getElementById("phone").value,
    emergency: document.getElementById("emergency").value === "true",
    services: document.getElementById("services").value,
    lat: Number(document.getElementById("lat").value),
    lon: Number(document.getElementById("lon").value)
  };

  const adminPassword = document.getElementById("admin-password").value;
  const id = document.getElementById("facility-id").value;
  const method = id ? "PUT" : "POST";
  const url = id ? `/api/facilities/${id}` : "/api/facilities";

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    statusBox.textContent = data.message || "Facility saved successfully.";
    resetForm();
    await fetchFacilities();
  } catch (error) {
    console.error(error);
    statusBox.textContent = error.message || "Unable to save facility.";
  }
});

refreshButton.addEventListener("click", fetchFacilities);
searchInput.addEventListener("input", filterVisibleFeatures);
districtFilter.addEventListener("change", fetchFacilities);
facilityFilter.addEventListener("change", fetchFacilities);
document.getElementById("reset-form").addEventListener("click", resetForm);

map.on("click", (event) => {
  document.getElementById("lat").value = event.latlng.lat.toFixed(6);
  document.getElementById("lon").value = event.latlng.lng.toFixed(6);
});

fetchFacilities();
