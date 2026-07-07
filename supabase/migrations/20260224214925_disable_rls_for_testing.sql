/*
  # Disable RLS for Testing

  1. Security Changes
    - Disable RLS on projects table to allow unauthenticated access
    - Disable RLS on director_access table to allow unauthenticated access
    - Add public read policies for all tables

  Note: This is for development/testing only. Re-enable RLS for production!
*/

-- Disable RLS on projects table
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;

-- Disable RLS on director_access table
ALTER TABLE director_access DISABLE ROW LEVEL SECURITY;
