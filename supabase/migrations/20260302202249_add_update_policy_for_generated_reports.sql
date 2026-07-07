/*
  # Add UPDATE policy for generated_reports

  1. Changes
    - Add UPDATE policy to allow authenticated users to update their uploaded documents
    
  2. Security
    - Policy restricts updates to authenticated users only
    - Users can update any report (matches existing permissive INSERT policy)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'generated_reports' 
    AND policyname = 'Authenticated users can update reports'
  ) THEN
    CREATE POLICY "Authenticated users can update reports"
      ON public.generated_reports
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;