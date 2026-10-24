-- Keep existing avatar IDs intact. Expand with 13 CC0 3D animal portraits.
ALTER TABLE public.qwiz_student_accounts DROP CONSTRAINT IF EXISTS qwiz_student_accounts_avatar_check;
ALTER TABLE public.qwiz_student_profiles DROP CONSTRAINT IF EXISTS qwiz_student_profiles_avatar_check;
ALTER TABLE public.qwiz_student_accounts ADD CONSTRAINT qwiz_student_accounts_avatar_check CHECK (avatar IN ('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear','giraffe','gorilla','hyena','kangaroo','leopard','lion','orca','polarbear','rhinoceros','toucan','turtle','wolf','zebra'));
ALTER TABLE public.qwiz_student_profiles ADD CONSTRAINT qwiz_student_profiles_avatar_check CHECK (avatar IN ('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear','giraffe','gorilla','hyena','kangaroo','leopard','lion','orca','polarbear','rhinoceros','toucan','turtle','wolf','zebra'));
DO $patch$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef('public.qwiz_student_identity(text,jsonb)'::regprocedure) INTO body;
 IF position("('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear','giraffe','gorilla','hyena','kangaroo','leopard','lion','orca','polarbear','rhinoceros','toucan','turtle','wolf','zebra')" in body)>0 THEN RETURN; END IF;
 IF position("('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear')" in body)=0 THEN
  RAISE EXCEPTION 'Profile registration whitelist changed; migration aborted';
 END IF;
 EXECUTE replace(body,"('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear')","('fox','owl','cat','panda','otter','raccoon','capybara','penguin','koala','red-panda','rabbit','bear','giraffe','gorilla','hyena','kangaroo','leopard','lion','orca','polarbear','rhinoceros','toucan','turtle','wolf','zebra')");
END
$patch$;
