-- Already applied to separate QWIZ-PARTY Free via Supabase migration
-- qwiz_security_invoker_views_before_data_cutover_20261030
-- NEVER apply this migration to the GOS.ID production project.
ALTER VIEW public.org_quiz_open_results SET (security_invoker = true);
ALTER VIEW public.org_quiz_question_stats SET (security_invoker = true);
ALTER VIEW public.org_quiz_session_stats SET (security_invoker = true);
ALTER VIEW public.org_quiz_student_stats SET (security_invoker = true);
