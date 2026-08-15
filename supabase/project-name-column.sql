-- Adds the project_name column to quotes, for the "Builder / Customer" +
-- "Project Name" split (2026-08-15).
--
-- Background: the quote used to have one client (clientName / clientEmail)
-- which was really the builder/GC who pays. That field is now labeled
-- "Builder / Customer" in the UI (it holds whoever pays, builder OR a direct
-- homeowner). This new project_name column holds the residence / site name
-- (e.g. "Fulk Residence") shown as the job name on the dashboard, pipeline,
-- receivables, and schedule. It is optional; old quotes have a NULL project
-- name and the UI falls back to client_name for display, so nothing breaks.
--
-- Run once in the Supabase SQL Editor. The column is nullable and defaults to
-- NULL; the existing RLS policies on quotes cover it automatically (no new
-- policies needed).

alter table public.quotes
  add column if not exists project_name text;