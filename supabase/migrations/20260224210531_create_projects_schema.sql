/*
  # Create Master Dashboard Schema

  1. New Tables
    - `projects`
      - `id` (uuid, primary key)
      - `name` (text) - Display name of the project
      - `description` (text) - Brief description
      - `url` (text) - Link to the project
      - `icon` (text) - Icon name from lucide-react
      - `category` (text) - Project category/type
      - `display_order` (integer) - Display order
      - `is_active` (boolean) - Whether project is visible
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `director_access`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `project_id` (uuid, references projects)
      - `granted_at` (timestamptz)
      - `granted_by` (uuid, references auth.users)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated directors to view their accessible projects
    - Add policies for admins to manage projects

  3. Important Notes
    - Directors can only see projects they have access to
    - Magic link authentication will be configured in the app
    - Admin users can manage all projects and grant access
*/

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  url text NOT NULL,
  icon text DEFAULT 'FolderOpen',
  category text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create director access table
CREATE TABLE IF NOT EXISTS director_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id),
  UNIQUE(user_id, project_id)
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE director_access ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Authenticated users can view active projects they have access to"
  ON projects FOR SELECT
  TO authenticated
  USING (
    is_active = true AND (
      EXISTS (
        SELECT 1 FROM director_access
        WHERE director_access.project_id = projects.id
        AND director_access.user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND (auth.users.raw_app_meta_data->>'role') = 'admin'
      )
    )
  );

CREATE POLICY "Admins can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'role') = 'admin'
    )
  );

CREATE POLICY "Admins can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'role') = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'role') = 'admin'
    )
  );

CREATE POLICY "Admins can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'role') = 'admin'
    )
  );

-- Director access policies
CREATE POLICY "Users can view their own access"
  ON director_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all access"
  ON director_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'role') = 'admin'
    )
  );

CREATE POLICY "Admins can grant access"
  ON director_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'role') = 'admin'
    )
  );

CREATE POLICY "Admins can revoke access"
  ON director_access FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'role') = 'admin'
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_director_access_user_id ON director_access(user_id);
CREATE INDEX IF NOT EXISTS idx_director_access_project_id ON director_access(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_display_order ON projects(display_order);

-- Insert sample projects (you can customize these)
INSERT INTO projects (name, description, url, icon, category, display_order) VALUES
  ('CSV Property Report Generator', 'Upload CSV files and generate property reports', '/reports', 'FileText', 'Reports', 1),
  ('Analytics Dashboard', 'View property analytics and insights', '/analytics', 'BarChart3', 'Analytics', 2),
  ('Document Manager', 'Manage and organize property documents', '/documents', 'FileStack', 'Documents', 3)
ON CONFLICT DO NOTHING;