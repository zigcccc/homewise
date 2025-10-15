import { render } from '@react-email/components';
import { and, count, eq, inArray, or } from 'drizzle-orm';
import { type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';
import { JoinHousehold } from '@/emails/JoinHousehold';
import { auth } from '@/lib/auth';
import { resend } from '@/lib/resend';
import { type AppContext } from '@/types/app.type';

import { type InviteHouseholdMembers, type InsertHousehold, type PatchHousehold } from './models';

export class HouseholdsService {
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
        members: { with: { user: { columns: { id: true, email: true, name: true } } } },
      },
    });

    return household;
  }

  public static async readForOwner(userId: string) {
    const household = await db.query.household.findFirst({
      where: (households, { eq }) => eq(households.ownerId, userId),
      with: { members: { with: { user: { columns: { id: true, email: true, name: true } } } } },
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

  public static async patch(partialData: PatchHousehold, ownerId: string) {
    const household = await HouseholdsService.readForOwner(ownerId);

    if (!household) {
      throw new HTTPException(404, { message: 'Household not found' });
    }

    const [updatedHousehold] = await db
      .update(schema.household)
      .set(partialData)
      .where(eq(schema.household.id, household.id))
      .returning();

    if (!updatedHousehold) {
      throw new HTTPException(400, { message: 'Something went wrong' });
    }

    return updatedHousehold;
  }

  public static async delete(id: number, ownerId: string) {
    const [deleted] = await db
      .delete(schema.household)
      .where(and(eq(schema.household.id, id), eq(schema.household.ownerId, ownerId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(404);
    }

    return deleted;
  }

  public static async invite(
    userId: string,
    payload: InviteHouseholdMembers,
    callbackUrl: string,
    ctx: Context<AppContext>
  ) {
    const household = await HouseholdsService.readForOwner(userId);

    if (!household) {
      throw new HTTPException(404, { message: 'Houshold not found.' });
    }

    await db.transaction(async (tx) => {
      for (const member of payload.members) {
        const { token } = await auth.api.generateOneTimeToken({ headers: ctx.req.raw.headers });

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

  public static async readInvite(token: string) {
    await auth.api.verifyOneTimeToken({ body: { token } });

    const invite = await db.query.householdInvite.findFirst({
      where: (householdInvite, { eq }) => eq(householdInvite.token, token),
      with: { household: { with: { owner: true } } },
    });

    return invite;
  }

  public static async acceptInvite(id: number, token: string, userId: string) {
    const invite = await db.query.householdInvite.findFirst({
      where: (householdInvite, { and, eq }) => and(eq(householdInvite.token, token), eq(householdInvite.id, id)),
      with: { household: true },
    });

    if (!invite) {
      throw new HTTPException(404, { message: 'Invite not found' });
    }

    const [householdMember] = await db
      .insert(schema.householdMember)
      .values({ userId, householdId: invite.householdId, role: invite.role })
      .returning();

    if (!householdMember) {
      throw new HTTPException(400, { message: 'Something went wrong' });
    }

    await db.delete(schema.householdInvite).where(eq(schema.householdInvite.id, invite.id));

    return householdMember;
  }
}
