require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT) || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "healthcare_gis",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres"
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function isAdminAuthorized(req) {
  const forwarded = req.headers["x-admin-password"];
  return typeof forwarded === "string" && forwarded === process.env.ADMIN_PASSWORD;
}

function parseFacilityInput(body) {
  const facilityName = String(body.facility_name || "").trim();
  const facilityType = String(body.facility_type || "").trim();
  const district = String(body.district || "").trim();
  const locationName = String(body.location_name || "").trim();
  const addressText = String(body.address_text || "").trim();
  const phone = String(body.phone || "").trim();
  const emergency = body.emergency === true || body.emergency === "true" || body.emergency === "1";
  const services = String(body.services || "").trim();
  const lat = Number(body.lat);
  const lon = Number(body.lon);

  if (!facilityName || !facilityType || !district || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("facility_name, facility_type, district, lat, and lon are required.");
  }

  return {
    facilityName,
    facilityType,
    district,
    locationName: locationName || "Unspecified location",
    addressText: addressText || "Address not provided",
    phone: phone || null,
    emergency,
    services: services || null,
    lat,
    lon
  };
}

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT current_database() AS database_name, version() AS postgres_version");

    res.json({
      status: "connected",
      database: result.rows[0].database_name,
      postgres_version: result.rows[0].postgres_version
    });
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(503).json({
      status: "database connection failed",
      error: "PostgreSQL/PostGIS is not reachable."
    });
  }
});

app.get("/api/meta", (req, res) => {
  res.json({
    title: "Healthcare Facility GIS",
    area: "Islamabad and Rawalpindi",
    source: "OpenStreetMap/Nominatim public demo dataset",
    attribution: "Data © OpenStreetMap contributors, ODbL 1.0; educational use only"
  });
});

app.get("/api/facilities", async (req, res) => {
  try {
    const { district, facility_type, q } = req.query;
    const clauses = [];
    const values = [];

    if (district && district !== "All") {
      clauses.push(`district = $${values.length + 1}`);
      values.push(String(district));
    }

    if (facility_type && facility_type !== "All") {
      clauses.push(`facility_type = $${values.length + 1}`);
      values.push(String(facility_type));
    }

    if (q && String(q).trim()) {
      const searchValue = `%${String(q).trim()}%`;
      clauses.push(`(
        facility_name ILIKE $${values.length + 1}
        OR location_name ILIKE $${values.length + 2}
        OR address_text ILIKE $${values.length + 3}
      )`);
      values.push(searchValue, searchValue, searchValue);
    }

    let sql = `
      SELECT
        id,
        facility_name,
        facility_type,
        district,
        location_name,
        address_text,
        phone,
        emergency,
        services,
        source_name,
        source_url,
        ST_X(geom) AS lon,
        ST_Y(geom) AS lat,
        ST_AsGeoJSON(geom)::json AS geometry
      FROM healthcare_facilities
    `;

    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    sql += " ORDER BY id ASC";

    const result = await pool.query(sql, values);

    const features = result.rows.map((row) => ({
      type: "Feature",
      geometry: row.geometry || {
        type: "Point",
        coordinates: [Number(row.lon), Number(row.lat)]
      },
      properties: {
        id: row.id,
        facility_name: row.facility_name,
        facility_type: row.facility_type,
        district: row.district,
        location_name: row.location_name,
        address_text: row.address_text,
        phone: row.phone,
        emergency: row.emergency,
        services: row.services,
        source_name: row.source_name,
        source_url: row.source_url,
        lon: Number(row.lon),
        lat: Number(row.lat)
      }
    }));

    res.json({ type: "FeatureCollection", features });
  } catch (error) {
    console.error("Facility query failed:", error.message);
    if (error.code === "42P01") {
      res.status(500).json({ error: "Database table not found. Run the SQL schema first." });
      return;
    }
    res.status(500).json({ error: "Unable to load facilities." });
  }
});

app.post("/api/facilities", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized: admin password required." });
  }

  try {
    const payload = parseFacilityInput(req.body);

    const query = `
      INSERT INTO healthcare_facilities (
        facility_name,
        facility_type,
        district,
        location_name,
        address_text,
        phone,
        emergency,
        services,
        source_name,
        source_url,
        geom
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'OpenStreetMap/Nominatim demo dataset', 'https://www.openstreetmap.org/',
        ST_SetSRID(ST_MakePoint($9, $10), 4326)
      )
      RETURNING
        id,
        facility_name,
        facility_type,
        district,
        location_name,
        address_text,
        phone,
        emergency,
        services,
        ST_X(geom) AS lon,
        ST_Y(geom) AS lat
    `;

    const values = [
      payload.facilityName,
      payload.facilityType,
      payload.district,
      payload.locationName,
      payload.addressText,
      payload.phone,
      payload.emergency,
      payload.services,
      payload.lon,
      payload.lat
    ];

    const result = await pool.query(query, values);
    res.status(201).json({ message: "Facility created.", facility: result.rows[0] });
  } catch (error) {
    console.error("Create facility failed:", error.message);
    res.status(400).json({ error: error.message || "Unable to create facility." });
  }
});

app.put("/api/facilities/:id", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized: admin password required." });
  }

  try {
    const payload = parseFacilityInput(req.body);
    const facilityId = Number(req.params.id);

    if (!Number.isInteger(facilityId)) {
      return res.status(400).json({ error: "Facility id must be an integer." });
    }

    const query = `
      UPDATE healthcare_facilities
      SET
        facility_name = $1,
        facility_type = $2,
        district = $3,
        location_name = $4,
        address_text = $5,
        phone = $6,
        emergency = $7,
        services = $8,
        geom = ST_SetSRID(ST_MakePoint($9, $10), 4326)
      WHERE id = $11
      RETURNING
        id,
        facility_name,
        facility_type,
        district,
        location_name,
        address_text,
        phone,
        emergency,
        services,
        ST_X(geom) AS lon,
        ST_Y(geom) AS lat
    `;

    const values = [
      payload.facilityName,
      payload.facilityType,
      payload.district,
      payload.locationName,
      payload.addressText,
      payload.phone,
      payload.emergency,
      payload.services,
      payload.lon,
      payload.lat,
      facilityId
    ];

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Facility not found." });
    }

    res.json({ message: "Facility updated.", facility: result.rows[0] });
  } catch (error) {
    console.error("Update facility failed:", error.message);
    res.status(400).json({ error: error.message || "Unable to update facility." });
  }
});

app.listen(port, () => {
  console.log(`Healthcare GIS app listening on port ${port}`);
});
