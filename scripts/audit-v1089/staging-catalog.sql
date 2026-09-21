select jsonb_build_object(
'identity',jsonb_build_object('database',current_database(),'server',inet_server_addr()::text,'at',now()),
'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'acl',c.relacl)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','S')),
'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
'constraints',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')),
'indexes',(select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname in ('public','private')),
'triggers',(select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private','auth')),
'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in ('public','private','storage')),
'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl)) from pg_namespace where nspname in ('public','private','storage')),
'cron',(select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'command',command,'active',active,'username',username)) from cron.job)
) as inventory;
