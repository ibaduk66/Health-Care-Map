CREATE EXTENSION IF NOT EXISTS postgis;

DROP TABLE IF EXISTS healthcare_facilities;

CREATE TABLE healthcare_facilities (
    id SERIAL PRIMARY KEY,
    facility_name VARCHAR(255) NOT NULL,
    facility_type VARCHAR(80) NOT NULL,
    district VARCHAR(80) NOT NULL,
    location_name VARCHAR(160),
    address_text TEXT,
    phone VARCHAR(80),
    emergency BOOLEAN DEFAULT FALSE,
    services TEXT,
    source_name VARCHAR(120) DEFAULT 'OpenStreetMap/Nominatim demo dataset',
    source_url TEXT,
    geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX idx_healthcare_facilities_geom
    ON healthcare_facilities USING GIST (geom);

CREATE INDEX idx_healthcare_facilities_type_district
    ON healthcare_facilities (facility_type, district);
