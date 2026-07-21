import { and, count, eq, inArray, isNull, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { render } from 'react-email';

import { db, schema } from '@/db';
import { JoinHousehold } from '@/emails/JoinHousehold';
import { auth } from '@/lib/auth';
import { resend } from '@/lib/resend';

import {
  type CreateHouseholdMember,
  type InsertHousehold,
  type InviteHouseholdMembers,
  type PatchHousehold,
  type PatchHouseholdMember,
} from './models';

type MemberWithUser = {
  userId: string | null;
  name: string | null;
  nickname: string | null;
  user?: { id: string; email: string; name: string } | null;
};

/** A household row without its members — what the `withHousehold` middleware puts on the context. */
export type HouseholdSummary = typeof schema.household.$inferSelect;

// Returns the first value that is a non-blank string, skipping null/undefined/"".
const firstFilled = (...values: (string | null | undefined)[]) =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0);

export class HouseholdsService {
  public static toMemberResponse<M extends MemberWithUser>(member: M, ownerId: string) {
    const { user, ...rest } = member;
    return {
      ...rest,
      isOwner: member.userId === ownerId,
      isManaged: member.userId === null,
      householdOwnerId: ownerId,
      displayName: firstFilled(member.nickname, user?.name, member.name) ?? 'Unknown',
      email: user?.email ?? null,
    };
  }

  private static getUserHouseholdSql(userId: string) {
    return inArray(
      schema.household.id,
      db
        .select({ id: schema.householdMember.householdId })
        .from(schema.householdMember)
        .where(eq(schema.householdMember.userId, userId))
    );
  }

  public static async countForUser(userId: string) {
    const [result] = await db
      .select({ count: count() })
      .from(schema.household)
      .where(or(eq(schema.household.ownerId, userId), HouseholdsService.getUserHouseholdSql(userId)));

    return result?.count ?? 0;
  }

  public static async readForUser(userId: string) {
    const household = await db.query.household.findFirst({
      where: (households, { eq, or }) =>
        or(eq(households.ownerId, userId), HouseholdsService.getUserHouseholdSql(userId)),
      with: {
        members: {
          orderBy: (fields, operators) => [operators.asc(fields.createdAt)],
          with: { user: { columns: { id: true, email: true, name: true } } },
        },
      },
    });

    return household;
  }

  /**
   * Same scoping as {@link readForUser}, but without loading members — cheap enough to run on every
   * household-scoped request via the `withHousehold` middleware.
   */
  public static async readSummaryForUser(userId: string) {
    const household = await db.query.household.findFirst({
      where: (households, { eq, or }) =>
        or(eq(households.ownerId, userId), HouseholdsService.getUserHouseholdSql(userId)),
    });

    return household;
  }

  public static async create(data: InsertHousehold) {
    return await db.transaction(async (tx) => {
      const [createdHousehold] = await db.insert(schema.household).values(data).returning();
      if (!createdHousehold) {
        tx.rollback();
        throw new HTTPException(400, { message: 'Something went wrong' });
      }

      const [createdHouseholdMember] = await db
        .insert(schema.householdMember)
        .values({ householdId: createdHousehold.id, role: 'adult', userId: data.ownerId })
        .returning();

      if (!createdHouseholdMember) {
        tx.rollback();
        throw new HTTPException(400, { message: 'Something went wrong' });
      }
      return createdHousehold;
    });
  }

  public static async patch(householdId: number, partialData: PatchHousehold) {
    const [updatedHousehold] = await db
      .update(schema.household)
      .set(partialData)
      .where(eq(schema.household.id, householdId))
      .returning();

    if (!updatedHousehold) {
      throw new HTTPException(400, { message: 'Something went wrong' });
    }

    return updatedHousehold;
  }

  public static async delete(householdId: number) {
    const [deleted] = await db.delete(schema.household).where(eq(schema.household.id, householdId)).returning();

    if (!deleted) {
      throw new HTTPException(404);
    }

    return deleted;
  }

  public static async readHouseholdMember(householdId: number, memberId: number) {
    const member = await db.query.householdMember.findFirst({
      where: (fields, operators) =>
        operators.and(operators.eq(fields.householdId, householdId), operators.eq(fields.id, memberId)),
    });

    if (!member) {
      throw new HTTPException(404, { message: 'Household member not found' });
    }

    return member;
  }

  public static async addHouseholdMembers(householdId: number, members: CreateHouseholdMember[]) {
    const created = await db
      .insert(schema.householdMember)
      .values(
        members.map((member) => ({
          householdId,
          userId: null,
          name: member.name,
          nickname: member.nickname || null,
          role: member.role,
        }))
      )
      .returning();

    if (created.length !== members.length) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return created;
  }

  public static async patchHouseholdMember(householdId: number, memberId: number, data: PatchHouseholdMember) {
    const existing = await HouseholdsService.readHouseholdMember(householdId, memberId);

    const patch: Partial<typeof schema.householdMember.$inferInsert> = { ...data };

    // Account members derive their name from the linked user account, so ignore name changes for them.
    if (existing.userId) {
      patch.name = undefined;
    }

    // Normalize an explicitly cleared nickname to null rather than an empty string.
    if (data.nickname === '') {
      patch.nickname = null;
    }

    const [updated] = await db
      .update(schema.householdMember)
      .set(patch)
      .where(and(eq(schema.householdMember.householdId, householdId), eq(schema.householdMember.id, memberId)))
      .returning();

    if (!updated) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return updated;
  }

  public static async deleteHouseholdMember(householdId: number, memberId: number) {
    const [deleted] = await db
      .delete(schema.householdMember)
      .where(and(eq(schema.householdMember.householdId, householdId), eq(schema.householdMember.id, memberId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return deleted;
  }

  public static async invite(
    household: HouseholdSummary,
    payload: InviteHouseholdMembers,
    callbackUrl: string,
    headers: Headers
  ) {
    await db.transaction(async (tx) => {
      for (const member of payload.members) {
        const { token } = await auth.api.generateOneTimeToken({ headers });

        const [invite] = await db
          .insert(schema.householdInvite)
          .values({ email: member.email, role: member.role, householdId: household.id, token })
          .returning();

        if (!invite) {
          tx.rollback();
          throw new HTTPException(400, { message: 'Something went wrong' });
        }

        const html = await render(
          JoinHousehold({
            url: `${callbackUrl}/join-household?token=${token}`,
            inviteeEmailAddress: member.email,
            householdName: household.name,
          })
        );
        await resend.emails.send({
          from: 'Homewise 🏡 <no-reply@home-wise.app>',
          to: member.email,
          subject: `Join "${household.name}" household`,
          html,
        });
      }
    });
  }

  public static async inviteExistingMember(
    household: HouseholdSummary,
    memberId: number,
    email: string,
    callbackUrl: string,
    headers: Headers
  ) {
    const member = await HouseholdsService.readHouseholdMember(household.id, memberId);

    if (member.userId) {
      throw new HTTPException(400, { message: 'This member already has an account.' });
    }

    const { token } = await auth.api.generateOneTimeToken({ headers });

    const [invite] = await db
      .insert(schema.householdInvite)
      .values({ email, role: member.role, householdId: household.id, memberId: member.id, token })
      .returning();

    if (!invite) {
      throw new HTTPException(400, { message: 'Something went wrong' });
    }

    const html = await render(
      JoinHousehold({
        url: `${callbackUrl}/join-household?token=${token}`,
        inviteeEmailAddress: email,
        householdName: household.name,
      })
    );
    await resend.emails.send({
      from: 'Homewise 🏡 <no-reply@home-wise.app>',
      to: email,
      subject: `Join "${household.name}" household`,
      html,
    });

    return invite;
  }

  public static async readInvite(token: string) {
    await auth.api.verifyOneTimeToken({ body: { token } });

    const invite = await db.query.householdInvite.findFirst({
      where: (householdInvite, { eq }) => eq(householdInvite.token, token),
      with: { household: { with: { owner: true } } },
    });

    return invite;
  }

  public static async deleteInvite(householdId: number, inviteId: number) {
    const [deletedInvite] = await db
      .delete(schema.householdInvite)
      .where(and(eq(schema.householdInvite.id, inviteId), eq(schema.householdInvite.householdId, householdId)))
      .returning();

    if (!deletedInvite) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return deletedInvite;
  }

  public static async acceptInvite(id: number, token: string, userId: string) {
    const invite = await db.query.householdInvite.findFirst({
      where: (householdInvite, { and, eq }) => and(eq(householdInvite.token, token), eq(householdInvite.id, id)),
      with: { household: true },
    });

    if (!invite) {
      throw new HTTPException(404, { message: 'Invite not found' });
    }

    // Prevent a second membership if the accepting user already belongs to this household.
    const existingMembership = await db.query.householdMember.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, invite.householdId), eq(fields.userId, userId)),
    });

    if (existingMembership) {
      await HouseholdsService.deleteInvite(invite.householdId, invite.id);
      return existingMembership;
    }

    let householdMember: typeof schema.householdMember.$inferSelect | undefined;

    if (invite.memberId) {
      // Upgrade an existing managed member by linking it to the accepting user's account.
      // Require userId to still be null so concurrent accepts can't overwrite an existing link.
      [householdMember] = await db
        .update(schema.householdMember)
        .set({ userId })
        .where(
          and(
            eq(schema.householdMember.id, invite.memberId),
            eq(schema.householdMember.householdId, invite.householdId),
            isNull(schema.householdMember.userId)
          )
        )
        .returning();
    } else {
      [householdMember] = await db
        .insert(schema.householdMember)
        .values({ userId, householdId: invite.householdId, role: invite.role })
        .returning();
    }

    if (!householdMember) {
      throw new HTTPException(400, { message: 'Something went wrong' });
    }

    await HouseholdsService.deleteInvite(invite.householdId, invite.id);

    return householdMember;
  }

  public static async listActiveInvitesForHousehold(householdId: number) {
    const invites = await db.query.householdInvite.findMany({
      where: (fields, operators) =>
        operators.and(operators.eq(fields.householdId, householdId), operators.eq(fields.claimed, false)),
      with: {
        household: { columns: { ownerId: true } },
      },
    });

    return invites;
  }
}
