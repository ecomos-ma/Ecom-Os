-- Migration to create global static mapping table for Sendit cities

CREATE TABLE IF NOT EXISTS sendit_city_mappings (
    sendit_city_id INTEGER UNIQUE NOT NULL PRIMARY KEY,
    city_name TEXT NOT NULL,
    arabic_name TEXT,
    price NUMERIC,
    delais TEXT,
    is_pickup_city BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE sendit_city_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access on sendit_city_mappings" 
    ON sendit_city_mappings 
    FOR SELECT 
    TO authenticated 
    USING (true);

-- Allow service role to do everything
CREATE POLICY "Allow service role full access on sendit_city_mappings"
    ON sendit_city_mappings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
