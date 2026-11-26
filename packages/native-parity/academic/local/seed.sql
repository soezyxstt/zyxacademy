-- Run once against the disposable local PostgreSQL database after applying migrations.
BEGIN;
INSERT INTO "user"(id,name,email,role) VALUES
  ('academic-tutor','Tutor Akademik','tutor@academic.test','teacher'),
  ('academic-admin','Admin Akademik','admin@academic.test','admin'),
  ('academic-student','Nadia Lestari','nadia@academic.test','student');
INSERT INTO pengguna(id) VALUES ('academic-tutor'),('academic-admin'),('academic-student');
INSERT INTO peran(id,code) VALUES ('academic-role-tutor','tutor'),('academic-role-admin','admin'),('academic-role-student','murid');
INSERT INTO pengguna_peran(id,pengguna_id,peran_id,source) VALUES
  ('membership-tutor','academic-tutor','academic-role-tutor','seed'),
  ('membership-admin','academic-admin','academic-role-admin','seed'),
  ('membership-student','academic-student','academic-role-student','seed');
INSERT INTO "session"(id,token,user_id,expires_at)
SELECT 'session-'||id,'fixture-'||id,id,now()+interval '2 days' FROM "user"
WHERE id IN ('academic-tutor','academic-admin','academic-student');
INSERT INTO courses(id,title,category) VALUES ('biologi-dasar','Biologi Dasar','Biologi'),('fisika-dasar','Fisika Dasar','Fisika'),('kimia-dasar','Kimia Dasar','Kimia');
INSERT INTO mata_kuliah(id,code,title,legacy_course_id) VALUES
  ('academic-course-1','BIO101','Biologi Dasar','biologi-dasar'),
  ('academic-course-2','FIS101','Fisika Dasar','fisika-dasar'),
  ('academic-course-3','KIM101','Kimia Dasar','kimia-dasar');
INSERT INTO penugasan_tutor(id,pengguna_id,mata_kuliah_id) VALUES ('assign-1','academic-tutor','academic-course-1'),('assign-2','academic-tutor','academic-course-2');
INSERT INTO enrollments(id,user_id,course_id,enrolled_at,expires_at) VALUES
  ('academic-enrollment','academic-student','biologi-dasar','2026-11-26T00:00:00Z','2099-11-26T00:00:00Z');
-- These journeys represent a returning tutor opening an assigned course.
INSERT INTO onboarding_tours(user_id,role,status,step_index) VALUES ('academic-tutor','tutor','completed',9);
COMMIT;
