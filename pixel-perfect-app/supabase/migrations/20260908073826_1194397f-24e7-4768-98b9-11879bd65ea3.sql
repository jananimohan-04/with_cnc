revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.update_updated_at_column() from anon, authenticated;
revoke all on function public.has_permission(uuid, text) from anon;
revoke all on function public.is_doc_admin(uuid) from anon;
revoke all on function public.can_access_document(uuid, uuid) from anon;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.is_doc_admin(uuid) to authenticated;
grant execute on function public.can_access_document(uuid, uuid) to authenticated;