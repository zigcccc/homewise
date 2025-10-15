import { render } from '@react-email/components';
import { and, eq } from 'drizzle-orm';
import { type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';
import { JoinHousehold } from '@/emails/JoinHousehold';
import { auth } from '@/lib/auth';
import { resend } from '@/lib/resend';
import { type AppContext } from '@/types/app.type';

import { type InviteHouseholdMembers, type InsertHousehold } from './models';

export class HouseholdsService {
  public static async readForUser(userId: string, { includeMembers = false }: { includeMembers?: boolean } = {}) {
    const household = await db.query.household.findFirst({
      where: (households, { eq, or, inArray }) =>
        or(
          eq(households.ownerId, userId),
          inArray(
            households.id,
            db
              .select({ id: schema.householdMember.householdId })
              .from(schema.householdMember)
              .where(eq(schema.householdMember.userId, userId))
          )
        ),
      with: {
        members: includeMembers ? { with: { user: { columns: { id: true, email: true, name: true } } } } : undefined,
      },
    });

    return household;
  }

  public static async read(id: number) {
    const household = await db.query.household.findFirst({
      where: (households, { eq }) => eq(households.id, id),
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
    id: number,
    userId: string,
    payload: InviteHouseholdMembers,
    callbackUrl: string,
    ctx: Context<AppContext>
  ) {
    const household = await HouseholdsService.read(id);

    if (!household) {
      throw new HTTPException(404, { message: 'Houshold not found.' });
    }

    if (household.ownerId !== userId) {
      throw new HTTPException(403, { message: 'Only household owner can invite members.' });
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
