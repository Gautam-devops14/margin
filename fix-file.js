import fs from 'fs';

let content = fs.readFileSync('full_migration.sql', 'utf8');

content = content.replace(
  "create policy profiles_cr_select_all on profiles\n  for select using (\n    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'cr')\n  );",
  "create policy profiles_cr_select_all on profiles\n  for select using (public.is_cr());"
);

content = content.replace(
  "AND role = (SELECT role FROM profiles WHERE id = auth.uid())",
  "AND role = public.get_user_role(auth.uid())"
);

const header = `create or replace function public.get_user_role(p_id uuid)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select role from profiles where id = p_id;
$$;\n\n`;

content = header + content;

fs.writeFileSync('full_migration.sql', content);
