# Healthcare Facility GIS

This project builds a PostgreSQL/PostGIS-backed web GIS for healthcare facilities in Islamabad and Rawalpindi using public OpenStreetMap/Nominatim demo records. The application includes:

- a GeoJSON API for the map layer
- filtering by district and facility type
- a simple authenticated admin form to add or update records
- a PostGIS geometry table storing point locations

## Database setup

1. Create a PostgreSQL database and enable PostGIS:

   ```sql
   CREATE DATABASE healthcare_gis;
   \c healthcare_gis
   CREATE EXTENSION postgis;
   ```

2. Run the schema and seed script:

   ```bash
   psql -U postgres -d healthcare_gis -f sql/schema.sql
   psql -U postgres -d healthcare_gis -f sql/seed.sql
   ```

3. Set the environment variables in `.env`.

4. Start the app:

   ```bash
   npm install
   npm start
   ```

## Admin password

Use the password defined in `.env` as `ADMIN_PASSWORD` to authorize add/update requests. The project sends it through the `x-admin-password` request header.

## Data source note

The default seed records are public OpenStreetMap/Nominatim community-mapped demo points for educational use only and should not be treated as independently verified operational data.
