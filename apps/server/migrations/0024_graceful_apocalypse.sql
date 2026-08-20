-- Deliberately without a dedupe pass: a duplicate account membership can differ in role, and picking
-- one silently is a decision about somebody's access made with no basis. There is no safe canonical
-- row to derive, so the index is the check — if any duplicate exists this fails, the deploy stops,
-- and the rows get looked at. Read-before-insert in `acceptInvite` means none should exist.
CREATE UNIQUE INDEX "household_member_user_unique" ON "household_member" USING btree ("household_id","user_id") WHERE "household_member"."user_id" IS NOT NULL;
